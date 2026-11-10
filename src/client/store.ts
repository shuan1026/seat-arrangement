// 前端 store：全部資料放在一個 store（資料量很小，docs/architecture.md 第 10.2 節）。
// 每個請求一個 store（不放在模組層級），避免伺服器端渲染時不同使用者共用狀態。
import { createStore } from 'zustand/vanilla';
import type { AppState, SessionUser } from '@/contracts/entities';
import { buildDirectory, type Directory } from '@/domain/display';
import type { SaveStatus } from './save-queue';

/** 最近一次可以復原的操作（docs/spec/seating.md）；只存在瀏覽器記憶體，重新整理後就沒有 */
export type UndoEntry = { run: () => void };

export type AppStoreState = {
  data: AppState;
  dir: Directory;
  user: SessionUser;
  /** 目前登入者是否為編輯者（D-021）；只能檢視時各頁隱藏會修改資料的入口（COM-R19） */
  isEditor: boolean;
  /** 座位表是否已發布（PRM-R17） */
  seatsPublished: boolean;
  save: SaveStatus;
  undo: UndoEntry | null;
  /** 用伺服器的最新資料整份取代（重新載入、衝突後） */
  replaceData: (data: AppState) => void;
  /** 樂觀更新：先改畫面，再交給儲存佇列 */
  update: (fn: (data: AppState) => AppState) => void;
  setSave: (save: SaveStatus) => void;
  setUndo: (undo: UndoEntry | null) => void;
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
    undo: null,
    replaceData: (data) => set({ data, dir: buildDirectory(data), undo: null }),
    update: (fn) =>
      set((s) => {
        const data = fn(s.data);
        return { data, dir: buildDirectory(data) };
      }),
    setSave: (save) => set({ save }),
    setUndo: (undo) => set({ undo }),
    // 變成只能檢視時，前一個操作的「復原」也不能再用
    setIsEditor: (isEditor) => set(isEditor ? { isEditor } : { isEditor, undo: null }),
    setSeatsPublished: (seatsPublished) => set({ seatsPublished }),
  }));
