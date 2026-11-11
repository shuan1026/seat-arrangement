// 前端 store 的復原與重做紀錄（D-028）：docs/spec/seating.md SEAT-R77（最多 20 步，超過時拿掉最舊的）、
// SEAT-R99（復原後可以一步一步重做；做了新的可以復原的操作就不能再重做）、SEAT-R100（別人改過資料使畫面重新載入、
// 改為檢視者時清掉）；docs/architecture.md 第 8.1 節（紀錄只存在瀏覽器記憶體；restore 回傳的 undo 放進重做紀錄）。
//
// 介面（src/client/store.ts）：
// - history: { undo: HistoryStep[]; redo: HistoryStep[] }，HistoryStep = { snapshot: SeatingSnapshot; label: string }，最新的一步在陣列最後。
// - pushStep(step)：放進 undo、清掉 redo、超過 20 步拿掉最舊的。
// - undoStep(redo)：復原了最新的一步：從 undo 拿掉最後一步，把重做用的 redo 放進 redo 最後。
// - redoStep(undo)：重做了最新的一步：從 redo 拿掉最後一步，把復原用的 undo 放回 undo 最後；redo 的其他步驟保留。
// - clearHistory()；replaceData（重新載入、衝突後）與 setIsEditor(false) 都清掉兩邊的紀錄。
// 只動紀錄，不送請求（請求與 Sonner 在 use-seating-ops，見 tests/unit/components/seating-history.test.tsx）。
import { describe, expect, it } from 'vitest';
import { createAppStore, HISTORY_LIMIT, type HistoryStep } from '@/client/store';
import type { AppState } from '@/contracts/entities';
import type { SeatingSnapshot } from '@/contracts/seating';
import { allTables, asEmployee, employee } from '../../helpers/seating-fixtures';

const USER = { name: '測試承辦人', email: 'tester@program.com.tw' };
const DATA: AppState = { employees: [employee(1, { name: '王小明' })], participants: [asEmployee(1)], tables: allTables() };
/** 重新載入後的資料：王小明坐 B4 桌（內部編號 3） */
const RELOADED: AppState = { ...DATA, participants: [asEmployee(1, { tableId: 3, seatOrder: 0 })] };

const snap = (n: number): SeatingSnapshot => ({ participants: [{ id: n, tableId: null, seatOrder: null }], tables: [] });
/** 第 n 步（復原用）；redoOf(n) 是復原第 n 步時 restore 回傳的、重做用的那一步（label 相同） */
const step = (n: number): HistoryStep => ({ snapshot: snap(n), label: `第 ${n} 步` });
const redoOf = (n: number): HistoryStep => ({ snapshot: snap(1000 + n), label: `第 ${n} 步` });
const undoAgainOf = (n: number): HistoryStep => ({ snapshot: snap(2000 + n), label: `第 ${n} 步` });

const labels = (steps: readonly HistoryStep[]) => steps.map((s) => s.label);

function newStore(isEditor = true) {
  return createAppStore({ data: DATA, user: USER, isEditor });
}

function pushSteps(store: ReturnType<typeof newStore>, from: number, to: number) {
  for (let n = from; n <= to; n++) store.getState().pushStep(step(n));
}

describe('一開始（SEAT-R100：紀錄只在這個分頁，重新開啟是空的）', () => {
  it('剛建立：復原、重做紀錄都是空的', () => {
    const store = newStore();
    expect(store.getState().history).toEqual({ undo: [], redo: [] });
  });

  it('最多 20 步（SEAT-R77）', () => {
    expect(HISTORY_LIMIT).toBe(20);
  });
});

describe('pushStep：新的一步（SEAT-R77、SEAT-R99）', () => {
  it('依序放進復原紀錄，最新的一步在最後；快照與 label 原樣保存', () => {
    const store = newStore();
    pushSteps(store, 1, 3);
    const { undo, redo } = store.getState().history;
    expect(labels(undo)).toEqual(['第 1 步', '第 2 步', '第 3 步']);
    expect(undo[2]).toEqual(step(3));
    expect(redo).toEqual([]);
  });

  it('正好 20 步：都留著', () => {
    const store = newStore();
    pushSteps(store, 1, 20);
    expect(store.getState().history.undo).toHaveLength(20);
    expect(store.getState().history.undo[0]).toEqual(step(1));
  });

  it('第 21 步：最舊的第 1 步拿掉，剩第 2～21 步（SEAT-AC132）', () => {
    const store = newStore();
    pushSteps(store, 1, 21);
    const { undo } = store.getState().history;
    expect(undo).toHaveLength(20);
    expect(labels(undo)).toEqual(Array.from({ length: 20 }, (_, i) => `第 ${i + 2} 步`));
  });

  it('做了 25 步：只留最近的 20 步（第 6～25 步）', () => {
    const store = newStore();
    pushSteps(store, 1, 25);
    expect(labels(store.getState().history.undo)).toEqual(Array.from({ length: 20 }, (_, i) => `第 ${i + 6} 步`));
  });

  it('復原之後做新的一步：重做紀錄清掉，「重做」停用（SEAT-R99、SEAT-AC131）', () => {
    const store = newStore();
    pushSteps(store, 1, 2);
    store.getState().undoStep(redoOf(2));
    expect(store.getState().history.redo).toHaveLength(1);

    store.getState().pushStep(step(3));
    expect(labels(store.getState().history.undo)).toEqual(['第 1 步', '第 3 步']);
    expect(store.getState().history.redo).toEqual([]);
  });
});

describe('undoStep、redoStep：只移動紀錄（SEAT-R77、SEAT-R99）', () => {
  it('undoStep：從復原紀錄拿掉最新的一步，把重做用的那一步放進重做紀錄最後', () => {
    const store = newStore();
    pushSteps(store, 1, 3);
    store.getState().undoStep(redoOf(3));
    const { undo, redo } = store.getState().history;
    expect(labels(undo)).toEqual(['第 1 步', '第 2 步']);
    expect(redo).toEqual([redoOf(3)]);
  });

  it('連續復原三次：重做紀錄最後一步是最近一次復原的（第 1 步），再按「重做」先做回第 1 步（SEAT-AC130）', () => {
    const store = newStore();
    pushSteps(store, 1, 3);
    store.getState().undoStep(redoOf(3));
    store.getState().undoStep(redoOf(2));
    store.getState().undoStep(redoOf(1));
    expect(store.getState().history.undo).toEqual([]);
    expect(store.getState().history.redo).toEqual([redoOf(3), redoOf(2), redoOf(1)]);
  });

  it('redoStep：從重做紀錄拿掉最新的一步，把復原用的那一步放回復原紀錄最後；重做紀錄的其他步驟保留', () => {
    const store = newStore();
    pushSteps(store, 1, 3);
    store.getState().undoStep(redoOf(3));
    store.getState().undoStep(redoOf(2));

    store.getState().redoStep(undoAgainOf(2));
    const { undo, redo } = store.getState().history;
    expect(undo).toEqual([step(1), undoAgainOf(2)]);
    expect(redo).toEqual([redoOf(3)]);
  });

  it('一步一步重做到復原之前：重做紀錄變空，復原紀錄回到三步（label 依原本的順序）', () => {
    const store = newStore();
    pushSteps(store, 1, 3);
    for (const n of [3, 2, 1]) store.getState().undoStep(redoOf(n));
    for (const n of [1, 2, 3]) store.getState().redoStep(undoAgainOf(n));
    const { undo, redo } = store.getState().history;
    expect(labels(undo)).toEqual(['第 1 步', '第 2 步', '第 3 步']);
    expect(undo).toEqual([undoAgainOf(1), undoAgainOf(2), undoAgainOf(3)]);
    expect(redo).toEqual([]);
  });

  it('滿 20 步時復原再重做：仍是 20 步，最舊的一步沒有被擠掉', () => {
    const store = newStore();
    pushSteps(store, 1, 20);
    store.getState().undoStep(redoOf(20));
    store.getState().redoStep(undoAgainOf(20));
    const { undo, redo } = store.getState().history;
    expect(undo).toHaveLength(20);
    expect(undo[0]).toEqual(step(1));
    expect(undo[19]).toEqual(undoAgainOf(20));
    expect(redo).toEqual([]);
  });
});

describe('清掉紀錄的時機（SEAT-R100）', () => {
  function storeWithBoth() {
    const store = newStore();
    pushSteps(store, 1, 3);
    store.getState().undoStep(redoOf(3));
    expect(store.getState().history.undo).toHaveLength(2);
    expect(store.getState().history.redo).toHaveLength(1);
    return store;
  }

  it('clearHistory：復原、重做紀錄都清掉', () => {
    const store = storeWithBoth();
    store.getState().clearHistory();
    expect(store.getState().history).toEqual({ undo: [], redo: [] });
  });

  it('replaceData（別人改過資料而重新載入）：換成最新資料，復原、重做紀錄都清掉（SEAT-R86、SEAT-AC136）', () => {
    const store = storeWithBoth();
    store.getState().replaceData(RELOADED);
    expect(store.getState().data).toEqual(RELOADED);
    expect(store.getState().history).toEqual({ undo: [], redo: [] });
  });

  it('setIsEditor(false)（被改為檢視者，AUTH-R13）：復原、重做紀錄都清掉', () => {
    const store = storeWithBoth();
    store.getState().setIsEditor(false);
    expect(store.getState().isEditor).toBe(false);
    expect(store.getState().history).toEqual({ undo: [], redo: [] });
  });

  it('不是清掉的時機就不清：樂觀更新（update）、儲存狀態（setSave）、發布狀態、仍是編輯者（setIsEditor(true)）都保留紀錄', () => {
    const store = storeWithBoth();
    const before = store.getState().history;
    store.getState().update((d) => ({ ...d, participants: [asEmployee(1, { tableId: 7, seatOrder: 0 })] }));
    store.getState().setSave({ state: 'saving', savedAt: null });
    store.getState().setSave({ state: 'idle', savedAt: new Date('2026-11-11T08:00:00.000Z') });
    store.getState().setSeatsPublished(true);
    store.getState().setIsEditor(true);
    expect(store.getState().history).toEqual(before);
  });
});
