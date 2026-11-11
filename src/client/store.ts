// 前端 store：全部資料放在一個 store（資料量很小，docs/architecture.md 第 10.2 節）。
// 每個請求一個 store（不放在模組層級），避免伺服器端渲染時不同使用者共用狀態。
import { createStore } from 'zustand/vanilla';
import type { AppState, SessionUser } from '@/contracts/entities';
import type { SeatingSnapshot } from '@/contracts/seating';
import { buildDirectory, type Directory } from '@/domain/display';
import type { SaveStatus } from './save-queue';

/**
 * 復原與重做紀錄的一步（docs/spec/seating.md SEAT-R77、R99、R100，D-028）：送回 restore 的快照，
 * 以及那一步的 Sonner 文字（工具列 Tooltip「復原：{label}」「重做：{label}」）。只存在瀏覽器記憶體，重新整理後就沒有
 */
export type HistoryStep = { snapshot: SeatingSnapshot; label: string };

/** 最多記幾步可以復原的操作（SEAT-R77） */
export const HISTORY_LIMIT = 20;

/** 最新的一步在陣列最後 */
export type History = { undo: HistoryStep[]; redo: HistoryStep[] };

const EMPTY_HISTORY: History = { undo: [], redo: [] };

export type AppStoreState = {
  data: AppState;
  dir: Directory;
  user: SessionUser;
  /** 目前登入者是否為編輯者（D-021）；只能檢視時各頁隱藏會修改資料的入口（COM-R19） */
  isEditor: boolean;
  /** 座位表是否已發布（PRM-R17） */
  seatsPublished: boolean;
  save: SaveStatus;
  /** 復原與重做紀錄（D-028） */
  history: History;
  /** 用伺服器的最新資料整份取代（重新載入、衝突後） */
  replaceData: (data: AppState) => void;
  /** 樂觀更新：先改畫面，再交給儲存佇列 */
  update: (fn: (data: AppState) => AppState) => void;
  setSave: (save: SaveStatus) => void;
  /** 新的一步可以復原的操作：放進復原紀錄、清掉重做紀錄，超過 20 步拿掉最舊的 */
  pushStep: (step: HistoryStep) => void;
  /** 復原了最新的一步：從復原紀錄拿掉，換成重做用的快照放進重做紀錄 */
  undoStep: (redo: HistoryStep) => void;
  /** 重做了最新的一步：從重做紀錄拿掉，換成復原用的快照放回復原紀錄（重做紀錄的其他步驟保留） */
  redoStep: (undo: HistoryStep) => void;
  clearHistory: () => void;
  setIsEditor: (isEditor: boolean) => void;
  setSeatsPublished: (published: boolean) => void;
};

export type AppStore = ReturnType<typeof createAppStore>;

export const createAppStore = (init: { data: AppState; user: SessionUser; isEditor?: boolean; seatsPublished?: boolean }) =>
  createStore<AppStoreState>()((set) => ({
    data: init.data,
    dir: buildDirectory(init.data),
    user: init.user,
    isEditor: init.isEditor ?? true,
    seatsPublished: init.seatsPublished ?? false,
    save: { state: 'idle', savedAt: null },
    history: EMPTY_HISTORY,
    // 衝突後重新載入：舊的步驟可能和最新資料對不上，紀錄清掉（SEAT-R100）
    replaceData: (data) => set({ data, dir: buildDirectory(data), history: EMPTY_HISTORY }),
    update: (fn) =>
      set((s) => {
        const data = fn(s.data);
        return { data, dir: buildDirectory(data) };
      }),
    setSave: (save) => set({ save }),
    pushStep: (step) => set((s) => ({ history: { undo: [...s.history.undo, step].slice(-HISTORY_LIMIT), redo: [] } })),
    undoStep: (redo) => set((s) => ({ history: { undo: s.history.undo.slice(0, -1), redo: [...s.history.redo, redo] } })),
    redoStep: (undo) =>
      set((s) => ({ history: { undo: [...s.history.undo, undo].slice(-HISTORY_LIMIT), redo: s.history.redo.slice(0, -1) } })),
    clearHistory: () => set({ history: EMPTY_HISTORY }),
    // 變成只能檢視時，復原與重做紀錄都不能再用（SEAT-R100）
    setIsEditor: (isEditor) => set(isEditor ? { isEditor } : { isEditor, history: EMPTY_HISTORY }),
    setSeatsPublished: (seatsPublished) => set({ seatsPublished }),
  }));
