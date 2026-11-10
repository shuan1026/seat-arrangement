'use client';

// 把伺服器端載入的資料交給前端 store，並建立唯一的儲存佇列。
// 各功能用 useAppStore 讀資料、用 useMutation 做「先改畫面、再依序儲存」。
import { createContext, useCallback, useContext, useState } from 'react';
import { useStore } from 'zustand';
import type { AppState, SessionUser } from '@/contracts/entities';
import type { ErrorCode } from '@/contracts/errors';
import { apiFetch } from './api';
import { redirectToExpiredLogin } from './auth-redirect';
import { conflictMessage } from './conflict-messages';
import { SaveQueue } from './save-queue';
import { createAppStore, type AppStore, type AppStoreState } from './store';

type Ctx = { store: AppStore; queue: SaveQueue; reload: () => Promise<void> };
const AppContext = createContext<Ctx | null>(null);

export type AppProviderProps = {
  initialData: AppState;
  user: SessionUser;
  /** 顯示提示（Sonner）；由版面注入，方便測試替換 */
  notify?: (text: string) => void;
  children: React.ReactNode;
};

export function AppProvider({ initialData, user, notify, children }: AppProviderProps) {
  const [ctx] = useState<Ctx>(() => {
    const store = createAppStore({ data: initialData, user });
    const reload = async () => {
      const data = await apiFetch<AppState>('/api/state');
      store.getState().replaceData(data);
    };
    const queue = new SaveQueue({
      onStatus: (s) => store.getState().setSave(s),
      onConflict: (code: ErrorCode) => {
        const text = queue.lastConflictMessage ?? conflictMessage(code);
        void reload().finally(() => notify?.(text));
      },
      // 登入過期：整頁回到登入頁，丟掉畫面上還沒存的狀態（AUTH-R07）
      onUnauthenticated: redirectToExpiredLogin,
    });
    return { store, queue, reload };
  });
  return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>;
}

function useCtx(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('必須在 AppProvider 裡使用');
  return ctx;
}

export function useAppStore<T>(selector: (s: AppStoreState) => T): T {
  return useStore(useCtx().store, selector);
}

export const useSaveQueue = () => useCtx().queue;
export const useReload = () => useCtx().reload;

/**
 * 先改畫面、再排進儲存佇列。
 * optimistic：立即套用到畫面的改動；send：送出請求；onSuccess：用伺服器回應校正 store。
 */
export function useMutation() {
  const { store, queue } = useCtx();
  return useCallback(
    <T,>(m: {
      optimistic?: (data: AppState) => AppState;
      send: () => Promise<T>;
      onSuccess?: (result: T, s: AppStoreState) => void;
      /** 衝突時的既有提示；沒有時用共用文案（COM-R08） */
      conflictMessage?: (code: ErrorCode) => string | undefined;
    }) => {
      if (m.optimistic) store.getState().update(m.optimistic);
      queue.enqueue({
        send: m.send,
        onSuccess: (r: T) => m.onSuccess?.(r, store.getState()),
        conflictMessage: m.conflictMessage,
      });
    },
    [store, queue],
  );
}
