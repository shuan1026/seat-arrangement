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
  save: SaveStatus;
  undo: UndoEntry | null;
  /** 用伺服器的最新資料整份取代（重新載入、衝突後） */
  replaceData: (data: AppState) => void;
  /** 樂觀更新：先改畫面，再交給儲存佇列 */
  update: (fn: (data: AppState) => AppState) => void;
  setSave: (save: SaveStatus) => void;
  setUndo: (undo: UndoEntry | null) => void;
};

export type AppStore = ReturnType<typeof createAppStore>;

export const createAppStore = (init: { data: AppState; user: SessionUser }) =>
  createStore<AppStoreState>()((set) => ({
    data: init.data,
    dir: buildDirectory(init.data),
    user: init.user,
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
  }));
