'use client';

// 對話框送出時用：把請求排進儲存佇列（useMutation），並等這一次的結果決定對話框要關閉還是顯示欄位錯誤。
// - saved：儲存成功（onSuccess 已用伺服器回應校正畫面）。
// - rejected：別人剛改過資料等，這次不能完成；佇列會重新載入並顯示提示（COM-R07、COM-R08），對話框顯示對應的欄位錯誤。
// - paused：網路或系統錯誤，佇列暫停、Header 顯示「重試」；這一次仍在佇列裡，重試成功後照樣執行 onSuccess（COM-R04）。
// - dropped：前面別的操作衝突，佇列把還沒送出的這一次一併取消（COM-R07）。
import { useCallback, useEffect, useRef } from 'react';
import { useAppStore, useMutation } from '@/client/app-provider';
import { ApiFailure } from '@/client/api';
import type { AppStoreState } from '@/client/store';
import type { ErrorCode } from '@/contracts/errors';

export type SaveOutcome =
  | { status: 'saved' }
  | { status: 'rejected'; code: ErrorCode; fields?: Record<string, string> }
  | { status: 'paused' }
  | { status: 'dropped' };

export type AwaitedJob<T> = {
  send: () => Promise<T>;
  onSuccess?: (result: T, s: AppStoreState) => void;
  /** 衝突時的既有提示（docs/spec/README.md COM-R08）；沒有時用共用文案 */
  conflictMessage?: (code: ErrorCode) => string | undefined;
};

/** 佇列不會重試、會整批取消並重新載入的錯誤（src/client/save-queue.ts）；網路、系統錯誤與登入過期以外的都是 */
const rejectionOf = (err: unknown): { code: ErrorCode; fields?: Record<string, string> } | null => {
  if (!(err instanceof ApiFailure)) return null;
  const { code, fields } = err;
  if (code === 'NETWORK' || code === 'INTERNAL' || code === 'UNAUTHENTICATED') return null;
  return { code, fields };
};

export function useAwaitedSave() {
  const mutate = useMutation();
  const saveState = useAppStore((s) => s.save.state);
  const current = useRef<{ settle: (o: SaveOutcome) => void } | null>(null);
  const stateRef = useRef(saveState);

  useEffect(() => {
    stateRef.current = saveState;
    const pending = current.current;
    if (!pending) return;
    // 這一次已經成功或被拒時會先 settle（同步），這裡只處理暫停與被一併取消的情況
    if (saveState === 'failed') pending.settle({ status: 'paused' });
    else if (saveState === 'idle') pending.settle({ status: 'dropped' });
  }, [saveState]);

  return useCallback(
    <T>(job: AwaitedJob<T>): Promise<SaveOutcome> =>
      new Promise<SaveOutcome>((resolve) => {
        let done = false;
        const entry = {
          settle: (o: SaveOutcome) => {
            if (done) return;
            done = true;
            if (current.current === entry) current.current = null;
            resolve(o);
          },
        };
        current.current = entry;
        const pausedBefore = stateRef.current === 'failed';
        mutate<T>({
          send: async () => {
            try {
              return await job.send();
            } catch (err) {
              const rejected = rejectionOf(err);
              if (rejected) entry.settle({ status: 'rejected', ...rejected });
              throw err;
            }
          },
          onSuccess: (result, s) => {
            job.onSuccess?.(result, s);
            entry.settle({ status: 'saved' });
          },
          conflictMessage: job.conflictMessage,
        });
        // 佇列已經因為前一次失敗而暫停：這一次排在後面，等使用者按「重試」
        if (pausedBefore) entry.settle({ status: 'paused' });
      }),
    [mutate],
  );
}
