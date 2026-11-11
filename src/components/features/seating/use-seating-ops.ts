'use client';

// 座位指令的前端流程（docs/architecture.md 第 10.3 節；docs/spec/seating.md 3.14、3.16）：
// 1. 先用 src/domain/seating-rules.ts 檢查（例如桌次已滿就直接提示，不送出）；沒有任何改變時什麼都不做。
// 2. 通過後立即更新畫面，交給儲存佇列依序送出。
// 3. 伺服器回應後用回應的資料校正畫面，把這一步記進復原紀錄（最多 20 步，D-028），再顯示 Sonner 與「復原」（undo 由回應帶回）。
// 4. 工具列的「復原」「重做」（SEAT-R77、R99）：復原送回 restore，回應的 undo 是重做用的快照；重做同樣送 restore，回應的 undo 放回復原紀錄。
//    Sonner 的「復原」只在那一步仍是最新一步時有作用；做了下一個可以復原的操作後，前一則就沒有作用。
//    儲存中（含正在復原或重做）時工具列的兩個按鈕停用，一步要等儲存完成才能復原（SEAT-R77）。
// 5. 入座、搬移、加入人員、放進工作人員桌後這一桌超過 10 位時，成功的 Sonner 後面加上「這一桌已超過 10 位。」（SEAT-R89），
//    以伺服器回應的結果為準。
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { apiFetch } from '@/client/api';
import { useAppStore, useAppStoreApi, useMutation } from '@/client/app-provider';
import type { HistoryStep } from '@/client/store';
import { tableFullMessage, tableLimitMessage } from '@/client/conflict-messages';
import { STAFF_TABLE_ID, TABLE_CAPACITY, type AppState, type SeatTable } from '@/contracts/entities';
import type { ErrorCode } from '@/contracts/errors';
import type { SeatingOperation, SeatingResult, SeatingSnapshot, TableResult } from '@/contracts/seating';
import { autoArrangeMessage } from '@/domain/auto-arrange';
import { applySeatingOperation, type RuleOperation, type SeatingViolation } from '@/domain/seating-rules';
import { dismissNotify, notify } from '@/components/ui/toaster';
import { msg, withOverflowNote } from './model';

const OPERATIONS_URL = '/api/seating/operations';

const postOperation = (op: SeatingOperation) => apiFetch<SeatingResult>(OPERATIONS_URL, { method: 'POST', json: op });

/**
 * 用伺服器回應覆蓋 store 中對應的人與桌（D-027：桌子可能新增或刪除）。
 * 回應裡的桌覆蓋或加進來；deletedTableIds 拿掉；和回應裡的桌在同一個位置、但回應裡沒有的桌是畫面上先放的暫時資料
 * （例如新增桌時伺服器給了不同的 id），一併拿掉，同一個位置不會有兩張桌。
 */
export function mergeResult(
  data: AppState,
  res: { participants: SeatingResult['participants']; tables: SeatTable[]; deletedTableIds?: readonly number[] },
): AppState {
  const deleted = new Set(res.deletedTableIds ?? []);
  if (!res.participants.length && !res.tables.length && !deleted.size) return data;
  const people = new Map(res.participants.map((p) => [p.id, p]));
  const fresh = new Map(res.tables.map((t) => [t.id, t]));
  const freshPositions = new Set(res.tables.filter((t) => t.position !== null).map((t) => t.position));
  const kept = data.tables
    .filter((t) => !deleted.has(t.id))
    .filter((t) => fresh.has(t.id) || t.position === null || !freshPositions.has(t.position))
    .map((t) => fresh.get(t.id) ?? t);
  const added = res.tables.filter((t) => !data.tables.some((x) => x.id === t.id));
  return {
    ...data,
    participants: data.participants.map((p) => people.get(p.id) ?? p),
    tables: [...kept, ...added],
  };
}

function applyLocally(data: AppState, op: RuleOperation): AppState {
  const r = applySeatingOperation({ participants: data.participants, tables: data.tables }, op);
  return r.ok ? { ...data, participants: r.data.participants, tables: r.data.tables } : data;
}

// 目前帶「復原」的 Sonner 與它代表的那一步：做了下一個可以復原的操作時先關掉舊的，畫面上只會有一個「復原」（SEAT-R77）；
// 用工具列復原那一步時也關掉（D-028）。整個分頁只有一個 store，所以放在模組層級。
let undoToast: string | number | null = null;
let undoToastStep: HistoryStep | null = null;
function closeUndoToast() {
  if (undoToast !== null) dismissNotify(undoToast);
  undoToast = null;
  undoToastStep = null;
}
// 最近一次送出的可以復原的操作：回應回來之前已經送出下一個時，這一次的 Sonner 不帶「復原」
let latestRun: symbol | null = null;
// 換了一個 store（重新載入整頁）時，上一個 store 的那則「復原」Sonner 關掉
let boundStore: unknown = null;

/** 目前畫面上的桌（提示要用桌號）：useSeatingOps 每次繪製時更新 */
let currentTables: readonly SeatTable[] = [];

/**
 * 桌次已滿的提示：從選單入座到 10 位「已滿」，拖移或「加入人員」到 12 位「已達 12 位」（SEAT-R20、SEAT-R23、SEAT-R86）。
 * 指令裡是桌子 id，提示用那張桌所在位置的桌號（D-027）
 */
function tableMessage(code: SeatingViolation | ErrorCode, op: SeatingOperation): string | undefined {
  if (op.type !== 'seat' && op.type !== 'seatMany') return undefined;
  const position = currentTables.find((t) => t.id === op.tableId)?.position ?? op.tableId;
  if (code === 'TABLE_FULL') return tableFullMessage(position);
  if (code === 'TABLE_LIMIT') return tableLimitMessage(position);
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
  const history = useAppStore((s) => s.history);
  const saving = useAppStore((s) => s.save.state === 'saving');
  const pushStep = useAppStore((s) => s.pushStep);
  const undoStep = useAppStore((s) => s.undoStep);
  const redoStep = useAppStore((s) => s.redoStep);
  // 復原、重做與 Sonner 的「復原」都直接讀 store 的最新紀錄：觸發那一步的元件（例如刪除確認）可能已經卸載
  const storeApi = useAppStoreApi();
  const latest = useRef(data);
  useLayoutEffect(() => {
    latest.current = data;
    currentTables = data.tables;
  });
  useEffect(() => {
    if (boundStore === pushStep) return;
    if (boundStore !== null) closeUndoToast();
    boundStore = pushStep;
    latestRun = null;
  }, [pushStep]);

  /** 送出 restore；成功後 onDone 拿到回應的 undo（反方向用的快照） */
  const sendRestore = useCallback(
    (snapshot: SeatingSnapshot, onDone: (undo: SeatingSnapshot) => void, done: string) => {
      const op: RuleOperation = { type: 'restore', snapshot };
      mutate<SeatingResult>({
        optimistic: (d) => applyLocally(d, op),
        send: () => postOperation(op),
        onSuccess: (res, s) => {
          s.update((d) => mergeResult(d, res));
          onDone(res.undo);
          notify(done);
        },
        conflictMessage: conflictFor(op),
      });
    },
    [mutate],
  );

  /** 復原最近一步（工具列或 Sonner 的「復原」，SEAT-R77、R78、R79）：Sonner「已復原。」，這一步移到重做紀錄 */
  const undo = useCallback(() => {
    const { history: h, save } = storeApi.getState();
    const step = h.undo.at(-1);
    // 儲存中（含上一次復原或重做還沒完成）不送出，避免同一步送兩次
    if (!step || save.state === 'saving') return;
    if (undoToastStep === step) closeUndoToast();
    sendRestore(step.snapshot, (redo) => undoStep({ snapshot: redo, label: step.label }), msg.undone);
  }, [sendRestore, undoStep, storeApi]);

  /** 重做最近一次復原的那一步（SEAT-R99）：Sonner「已重做。」，這一步放回復原紀錄 */
  const redo = useCallback(() => {
    const { history: h, save } = storeApi.getState();
    const step = h.redo.at(-1);
    if (!step || save.state === 'saving') return;
    sendRestore(step.snapshot, (back) => redoStep({ snapshot: back, label: step.label }), msg.redone);
  }, [sendRestore, redoStep, storeApi]);

  /** 記進復原紀錄並顯示 Sonner；回應回來之前已經送出下一個可以復原的操作時，Sonner 不帶「復原」（SEAT-R77） */
  const offerUndo = useCallback(
    (token: symbol, text: string, snapshot: SeatingSnapshot) => {
      const step: HistoryStep = { snapshot, label: text };
      pushStep(step);
      if (latestRun !== token) {
        notify(text);
        return;
      }
      closeUndoToast();
      undoToastStep = step;
      undoToast = notify(text, {
        action: {
          label: '復原',
          // 只在這一步仍是最新一步時有作用
          onClick: () => {
            if (storeApi.getState().history.undo.at(-1) === step) undo();
          },
        },
      });
    },
    [pushStep, undo, storeApi],
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
      latestRun = token;
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
      latestRun = token;
      mutate<SeatingResult>({
        send: () => postOperation(op),
        onSuccess: (res, s) => {
          const summary = res.summary ?? { placed: 0, tableIds: [], left: 0 };
          if (summary.placed === 0) {
            if (latestRun === token) latestRun = null;
            notify(autoArrangeMessage(summary), { type: 'warning' });
            return;
          }
          s.update((d) => mergeResult(d, res));
          offerUndo(token, autoArrangeMessage(summary), res.undo);
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

  // 工具列的「復原」「重做」：儲存中停用；label 是那一步的 Sonner 文字（Tooltip「復原：{label}」，D-028）
  const undoLabel = saving ? null : (history.undo.at(-1)?.label ?? null);
  const redoLabel = saving ? null : (history.redo.at(-1)?.label ?? null);

  return { run, autoArrange, setNoteName, undo, redo, undoLabel, redoLabel };
}

