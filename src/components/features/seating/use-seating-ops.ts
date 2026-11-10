'use client';

// 座位指令的前端流程（docs/architecture.md 第 10.3 節；docs/spec/seating.md 3.14、3.16）：
// 1. 先用 src/domain/seating-rules.ts 檢查（例如桌次已滿就直接提示，不送出）；沒有任何改變時什麼都不做。
// 2. 通過後立即更新畫面，交給儲存佇列依序送出。
// 3. 伺服器回應後用回應的資料校正畫面，再顯示 Sonner 與「復原」（undo 由回應帶回）。
// 4. 只能復原最近一次（SEAT-R77）：做了下一個可以復原的操作後，前一則 Sonner 的「復原」就沒有作用。
// 5. 入座、搬移、加入人員、放進工作人員桌後這一桌超過 10 位時，成功的 Sonner 後面加上「這一桌已超過 10 位。」（SEAT-R89），
//    以伺服器回應的結果為準。
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { apiFetch } from '@/client/api';
import { useAppStore, useMutation } from '@/client/app-provider';
import { tableFullMessage, tableLimitMessage } from '@/client/conflict-messages';
import { STAFF_TABLE_ID, TABLE_CAPACITY, type AppState, type SeatTable } from '@/contracts/entities';
import type { ErrorCode } from '@/contracts/errors';
import type { SeatingOperation, SeatingResult, SeatingSnapshot, TableResult } from '@/contracts/seating';
import { applySeatingOperation, type RuleOperation, type SeatingViolation } from '@/domain/seating-rules';
import { dismissNotify, notify } from '@/components/ui/toaster';
import { msg, withOverflowNote } from './model';

const OPERATIONS_URL = '/api/seating/operations';

const postOperation = (op: SeatingOperation) => apiFetch<SeatingResult>(OPERATIONS_URL, { method: 'POST', json: op });

/** 用伺服器回應覆蓋 store 中對應的人與桌 */
export function mergeResult(data: AppState, res: { participants: SeatingResult['participants']; tables: SeatTable[] }): AppState {
  if (!res.participants.length && !res.tables.length) return data;
  const people = new Map(res.participants.map((p) => [p.id, p]));
  const tables = new Map(res.tables.map((t) => [t.id, t]));
  return {
    ...data,
    participants: data.participants.map((p) => people.get(p.id) ?? p),
    tables: data.tables.map((t) => tables.get(t.id) ?? t),
  };
}

function applyLocally(data: AppState, op: RuleOperation): AppState {
  const r = applySeatingOperation({ participants: data.participants, tables: data.tables }, op);
  return r.ok ? { ...data, participants: r.data.participants, tables: r.data.tables } : data;
}

// 最近一次可以復原的操作。整個分頁只有一個 store，所以放在模組層級；衝突重新載入時（store 的 undo 變成 null）一併清掉。
let latestUndo: symbol | null = null;
// 目前帶「復原」的 Sonner：做了下一個可以復原的操作時先關掉舊的，畫面上只會有一個「復原」（SEAT-R77）
let undoToast: string | number | null = null;
function closeUndoToast() {
  if (undoToast !== null) dismissNotify(undoToast);
  undoToast = null;
}
// 換了一個 store（重新載入整頁）時，上一個 store 的「復原」都失效
let boundStore: unknown = null;
// store 的 undo 上一次的值：只在它從有值變成 null（衝突後重新載入）時清掉，元件掛載時不清
let lastSeenUndo: unknown = null;

/** 桌次已滿的提示：從選單入座到 10 位「已滿」，拖移或「加入人員」到 12 位「已達 12 位」（SEAT-R20、SEAT-R23、SEAT-R86） */
function tableMessage(code: SeatingViolation | ErrorCode, op: SeatingOperation): string | undefined {
  if (op.type !== 'seat' && op.type !== 'seatMany') return undefined;
  if (code === 'TABLE_FULL') return tableFullMessage(op.tableId);
  if (code === 'TABLE_LIMIT') return tableLimitMessage(op.tableId);
  return undefined;
}

function violationMessage(violation: SeatingViolation, op: RuleOperation): string | null {
  const table = tableMessage(violation, op);
  if (table) return table;
  if (violation === 'STAFF_TABLE_FULL') return msg.staffFull;
  if (violation === 'STAFF_TABLE_LIMIT') return msg.staffLimit;
  if (violation === 'STAFF_EMPLOYEE_ONLY') return msg.employeeOnly;
  return null;
}

const conflictFor = (op: SeatingOperation) => (code: ErrorCode) => tableMessage(code, op);

/**
 * 這次入座、搬移、加入人員或放進工作人員桌後，目標桌是否超過 10 位（SEAT-R89），以伺服器回應為準：
 * 一般桌的座號是 0..n-1 連續，名單最後一位一定在回應裡，有人的座號是 10 以上就是超過；
 * 工作人員桌的座號不規定（SEAT-R34），改看套用回應後的人數。同一桌內調整順序不算放進來。
 */
function overflowed(op: RuleOperation, before: AppState, res: SeatingResult, merged: AppState): boolean {
  if (op.type !== 'seat' && op.type !== 'seatMany') return false;
  const moving = op.type === 'seat' ? [op.participantId] : op.participantIds;
  const entering = moving.some((id) => before.participants.find((p) => p.id === id)?.tableId !== op.tableId);
  if (!entering) return false;
  if (op.tableId === STAFF_TABLE_ID) {
    return merged.participants.filter((p) => p.tableId === STAFF_TABLE_ID).length > TABLE_CAPACITY;
  }
  return res.participants.some((p) => p.tableId === op.tableId && (p.seatOrder ?? 0) >= TABLE_CAPACITY);
}

export function useSeatingOps() {
  const mutate = useMutation();
  const data = useAppStore((s) => s.data);
  const storeUndo = useAppStore((s) => s.undo);
  const setUndo = useAppStore((s) => s.setUndo);
  const latest = useRef(data);
  useLayoutEffect(() => {
    latest.current = data;
  });
  useEffect(() => {
    if (storeUndo === null && lastSeenUndo !== null) latestUndo = null;
    lastSeenUndo = storeUndo;
  }, [storeUndo]);
  useEffect(() => {
    if (boundStore === setUndo) return;
    if (boundStore !== null) closeUndoToast();
    boundStore = setUndo;
    latestUndo = null;
    lastSeenUndo = null;
  }, [setUndo]);

  /** 按下 Sonner 的「復原」：把 undo 送回 restore（SEAT-R78、SEAT-R79） */
  const restore = useCallback(
    (snapshot: SeatingSnapshot) => {
      const op: RuleOperation = { type: 'restore', snapshot };
      latestUndo = null;
      setUndo(null);
      closeUndoToast();
      mutate<SeatingResult>({
        optimistic: (d) => applyLocally(d, op),
        send: () => postOperation(op),
        onSuccess: (res, s) => {
          s.update((d) => mergeResult(d, res));
          notify(msg.undone);
        },
        conflictMessage: conflictFor(op),
      });
    },
    [mutate, setUndo],
  );

  const offerUndo = useCallback(
    (token: symbol, text: string, snapshot: SeatingSnapshot) => {
      const entry = {
        run: () => {
          if (latestUndo !== token) return;
          restore(snapshot);
        },
      };
      // 回應回來之前已經做了下一個可以復原的操作：這一次只顯示結果，不帶「復原」（SEAT-R77）
      if (latestUndo !== token) {
        notify(text);
        return;
      }
      setUndo(entry);
      closeUndoToast();
      undoToast = notify(text, { action: { label: '復原', onClick: entry.run } });
    },
    [restore, setUndo],
  );

  /**
   * 執行一個可以復原的座位指令。違反規則時顯示既有提示、不送出；沒有任何改變時什麼都不做。
   * 回傳是否送出。message 是成功時 Sonner 的文字。
   */
  const run = useCallback(
    (op: RuleOperation, message: string): boolean => {
      const check = applySeatingOperation({ participants: latest.current.participants, tables: latest.current.tables }, op);
      if (!check.ok) {
        const text = violationMessage(check.violation, op);
        if (text) notify(text, { type: 'warning' });
        return false;
      }
      if (!check.undo.participants.length && !check.undo.tables.length) return false;
      const token = Symbol(op.type);
      const before = latest.current;
      latestUndo = token;
      mutate<SeatingResult>({
        optimistic: (d) => applyLocally(d, op),
        send: () => postOperation(op),
        onSuccess: (res, s) => {
          const merged = mergeResult(s.data, res);
          s.update((d) => mergeResult(d, res));
          offerUndo(token, overflowed(op, before, res, merged) ? withOverflowNote(message) : message, res.undo);
        },
        conflictMessage: conflictFor(op),
      });
      return true;
    },
    [mutate, offerUndo],
  );

  /** 自動排座（auto-arrange.md ARR-R13、ARR-R14、ARR-Q02、ARR-Q03）：結果由伺服器算，回應後才更新畫面 */
  const autoArrange = useCallback(
    (mode: 'unseatedOnly' | 'rebuild') => {
      const op: SeatingOperation = { type: 'autoArrange', mode };
      const token = Symbol(op.type);
      latestUndo = token;
      mutate<SeatingResult>({
        send: () => postOperation(op),
        onSuccess: (res, s) => {
          const summary = res.summary;
          if (!summary || summary.placed === 0) {
            if (latestUndo === token) latestUndo = null;
            notify('沒有可以排的員工與眷屬。', { type: 'warning' });
            return;
          }
          s.update((d) => mergeResult(d, res));
          const a = Math.min(...summary.tableIds);
          const b = Math.max(...summary.tableIds);
          const range = a === b ? `${a}` : `${a}–${b}`;
          const text = summary.left
            ? `已把 ${summary.placed} 位安排到第 ${range} 桌，還有 ${summary.left} 位排不下，留在未入座。`
            : `已把 ${summary.placed} 位安排到第 ${range} 桌。`;
          offerUndo(token, text, res.undo);
        },
      });
    },
    [mutate, offerUndo],
  );

  /** 備註名稱（SEAT-R12）：離開欄位就儲存，Sonner「已儲存」不帶「復原」（SEAT-R80） */
  const setNoteName = useCallback(
    (tableId: number, raw: string) => {
      const noteName = raw.trim() || null;
      const current = latest.current.tables.find((t) => t.id === tableId)?.noteName ?? null;
      if (noteName === current) return;
      mutate<TableResult>({
        optimistic: (d) => ({ ...d, tables: d.tables.map((t) => (t.id === tableId ? { ...t, noteName } : t)) }),
        send: () => apiFetch<TableResult>(`/api/tables/${tableId}`, { method: 'PATCH', json: { noteName } }),
        onSuccess: (res, s) => {
          s.update((d) => mergeResult(d, { participants: [], tables: [res.table] }));
          notify(msg.saved);
        },
      });
    },
    [mutate],
  );

  return { run, autoArrange, setNoteName };
}

