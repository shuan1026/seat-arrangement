'use client';

// 把伺服器端載入的資料交給前端 store，並建立唯一的儲存佇列。
// 各功能用 useAppStore 讀資料、用 useMutation 做「先改畫面、再依序儲存」。
// 權限（D-021）：store 的 isEditor 決定各頁是否顯示會修改資料的入口（COM-R19）；重新載入時以 GET /api/state 的 me.isEditor 為準。
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useState } from 'react';
import { useStore } from 'zustand';
import type { AppState, SessionUser } from '@/contracts/entities';
import type { ErrorCode } from '@/contracts/errors';
import type { StateResponse } from '@/contracts/permissions';
import { apiFetch } from './api';
import { redirectToExpiredLogin } from './auth-redirect';
import { conflictMessage, NOT_EDITOR_MESSAGE } from './conflict-messages';
import { SaveQueue } from './save-queue';
import { createAppStore, type AppStore, type AppStoreState } from './store';

type Ctx = { store: AppStore; queue: SaveQueue; reload: () => Promise<void> };
const AppContext = createContext<Ctx | null>(null);

export type AppProviderProps = {
  initialData: AppState;
  user: SessionUser;
  /** 目前登入者是否為編輯者；省略時是編輯者（只有測試會省略，(main)/layout.tsx 一律傳伺服器判斷的值） */
  isEditor?: boolean;
  /** 座位表是否已發布；省略時是未發布（PRM-R17） */
  seatsPublished?: boolean;
  /** 顯示提示（Sonner）；由版面注入，方便測試替換 */
  notify?: (text: string) => void;
  children: React.ReactNode;
};

export function AppProvider({ initialData, user, isEditor, seatsPublished, notify, children }: AppProviderProps) {
  // App Router 的 router 物件在整個 App 裡是同一個，佇列建立時取用即可
  const router = useRouter();
  const [ctx] = useState<Ctx>(() => {
    const store = createAppStore({ data: initialData, user, isEditor, seatsPublished });
    const reload = async () => {
      // 回應多了 me 與 seatsPublished；舊的回應（或測試）沒有時保留目前的值
      const { me, seatsPublished: published, ...data } = await apiFetch<Partial<StateResponse> & AppState>('/api/state');
      const s = store.getState();
      s.replaceData(data);
      if (me) s.setIsEditor(me.isEditor);
      if (typeof published === 'boolean') s.setSeatsPublished(published);
    };
    const queue = new SaveQueue({
      onStatus: (s) => store.getState().setSave(s),
      onConflict: (code: ErrorCode) => {
        // 空字串表示這次的提示由畫面自己顯示（例如欄位錯誤），不另外用 Sonner
        const text = queue.lastConflictMessage ?? conflictMessage(code);
        void reload().finally(() => {
          if (text) notify?.(text);
        });
      },
      // 登入過期：整頁回到登入頁，丟掉畫面上還沒存的狀態（AUTH-R07）
      onUnauthenticated: redirectToExpiredLogin,
      // 編輯權限被移除（AUTH-R13）：先切換成只能檢視（開著的對話框跟著關閉），再重新載入最新資料
      onNotEditor: () => {
        store.getState().setIsEditor(false);
        void reload().finally(() => notify?.(NOT_EDITOR_MESSAGE));
      },
      // 權限被移除（AUTH-R17、D-026）：還沒存的操作已由佇列取消；重新取得伺服器端的畫面，
      // (main)/layout.tsx 會在同一個網址改畫「沒有權限」頁（App Shell 與開著的對話框一併拿掉），不顯示 Sonner
      onNoAccess: () => router.refresh(),



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
/** store 本身：在事件處理（例如 Sonner 的按鈕）裡讀最新的狀態用，不會因為元件已經卸載而讀到舊值 */
export const useAppStoreApi = () => useCtx().store;
export const useReload = () => useCtx().reload;
/** 目前登入者是否為編輯者（COM-R19：只能檢視時隱藏會修改資料的入口） */
export const useIsEditor = () => useAppStore((s) => s.isEditor);

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
      /** 衝突時的既有提示；沒有時用共用文案（COM-R08）；空字串表示不顯示 Sonner */
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
