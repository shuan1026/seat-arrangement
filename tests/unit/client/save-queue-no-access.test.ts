// 權限被移除後的下一次操作：docs/spec/README.md AUTH-R17（編輯者的下一次修改資料的操作被拒絕：這次操作不儲存，還沒存的後續操作一併取消，
// 畫面換成「沒有權限」頁，不顯示 Sonner）；docs/architecture.md 第 8.2 節（403 NO_ACCESS：不重試，捨棄佇列中還沒送出的操作）、
// 第 10.3 節第 8 點；D-026。用假的 send，不發網路請求。關閉對話框與 router.refresh() 由 AppProvider 處理
// （tests/unit/client/app-provider-permissions.test.tsx）。
//
// 假設的介面（src/client/save-queue.ts）：QueueHooks 多一個可省略的 onNoAccess?: () => void，
// 收到 ApiFailure('NO_ACCESS', 403) 時呼叫它（不呼叫 onConflict、onNotEditor、onUnauthenticated）；沒給時當成衝突交給 onConflict。
// 既有的 hooks 不變（onNotEditor 見 tests/unit/client/save-queue-not-editor.test.ts）。
import { describe, expect, it, vi } from 'vitest';
import type { ErrorCode } from '@/contracts/errors';
import { ApiFailure } from '@/client/api';
import { SaveQueue, type Job } from '@/client/save-queue';
import { saveStatusText } from '@/client/save-time';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function operation(label: string, log: string[]) {
  const attempts: PromiseWithResolvers<string>[] = [];
  const send = vi.fn(() => {
    log.push(label);
    const d = Promise.withResolvers<string>();
    attempts.push(d);
    return d.promise;
  });
  const onSuccess = vi.fn<(result: string) => void>();
  const latest = () => {
    const d = attempts.at(-1);
    if (!d) throw new Error(`${label} 還沒送出`);
    return d;
  };
  const job: Job<string> = { send, onSuccess };
  return { job, send, onSuccess, succeed: () => latest().resolve(`${label}-ok`), fail: (err: unknown) => latest().reject(err) };
}

function createQueue(withNoAccess = true) {
  const onConflict = vi.fn<(code: ErrorCode) => void>();
  const onUnauthenticated = vi.fn<() => void>();
  const onNotEditor = vi.fn<() => void>();
  const onNoAccess = vi.fn<() => void>();
  const queue = new SaveQueue({
    onStatus: () => {},
    onConflict,
    onUnauthenticated,
    onNotEditor,
    ...(withNoAccess ? { onNoAccess } : {}),
    now: () => new Date(2026, 10, 11, 9, 5),
  });
  return { queue, onConflict, onUnauthenticated, onNotEditor, onNoAccess, text: () => saveStatusText(queue.current) };
}

const noAccess = () => new ApiFailure('NO_ACCESS', 403, 'no access');

describe('403 NO_ACCESS（AUTH-R17）', () => {
  it('這次不儲存、不重試；還沒送出的後續操作一併取消；交給 onNoAccess，不呼叫 onConflict、onNotEditor、onUnauthenticated', async () => {
    const { queue, onConflict, onUnauthenticated, onNotEditor, onNoAccess } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    const b = operation('b', log);
    const c = operation('c', log);
    queue.enqueue(a.job);
    queue.enqueue(b.job);
    queue.enqueue(c.job);
    await flush();

    a.fail(noAccess());
    await flush();

    expect(onNoAccess).toHaveBeenCalledTimes(1);
    expect(onConflict).not.toHaveBeenCalled();
    expect(onNotEditor).not.toHaveBeenCalled();
    expect(onUnauthenticated).not.toHaveBeenCalled();
    expect(log).toEqual(['a']);
    expect(queue.pending).toBe(0);
    expect(a.onSuccess).not.toHaveBeenCalled();
    expect(b.send).not.toHaveBeenCalled();
    expect(c.send).not.toHaveBeenCalled();
  });

  it('不是「儲存失敗」，也不需要按重試；按重試不會再送出', async () => {
    const { queue, text } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    queue.enqueue(a.job);
    await flush();
    a.fail(noAccess());
    await flush();

    expect(queue.current.state).toBe('idle');
    expect(text()).not.toBe('儲存失敗，請檢查網路後再試一次。');
    expect(queue.current.savedAt).toBeNull();

    queue.retry();
    await flush();
    expect(log).toEqual(['a']);
  });

  it('被拒之前已存好的操作不受影響', async () => {
    const { queue, text, onNoAccess } = createQueue();
    const log: string[] = [];
    const first = operation('first', log);
    const a = operation('a', log);
    queue.enqueue(first.job);
    queue.enqueue(a.job);
    await flush();
    first.succeed();
    await flush();
    a.fail(noAccess());
    await flush();

    expect(first.onSuccess).toHaveBeenCalledTimes(1);
    expect(onNoAccess).toHaveBeenCalledTimes(1);
    expect(text()).toBe('已儲存 09:05');
  });

  it('不帶操作自己的衝突提示：job.conflictMessage 不會被讀取', async () => {
    const { queue } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    const conflictMessage = vi.fn(() => 'B4 桌已滿，請先移出一位。');
    queue.enqueue({ ...a.job, conflictMessage });
    await flush();
    a.fail(noAccess());
    await flush();
    expect(conflictMessage).not.toHaveBeenCalled();
  });

  it('沒有給 onNoAccess 時當成衝突，交給 onConflict（code 是 NO_ACCESS）；後續操作一樣取消', async () => {
    const { queue, onConflict, onNotEditor } = createQueue(false);
    const log: string[] = [];
    const a = operation('a', log);
    const b = operation('b', log);
    queue.enqueue(a.job);
    queue.enqueue(b.job);
    await flush();
    a.fail(noAccess());
    await flush();

    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledWith('NO_ACCESS');
    expect(onNotEditor).not.toHaveBeenCalled();
    expect(b.send).not.toHaveBeenCalled();
    expect(queue.pending).toBe(0);
  });

  it('NOT_EDITOR 仍交給 onNotEditor，不會誤呼叫 onNoAccess（AUTH-R13 與 AUTH-R17 分開處理）', async () => {
    const { queue, onNotEditor, onNoAccess } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    queue.enqueue(a.job);
    await flush();
    a.fail(new ApiFailure('NOT_EDITOR', 403, 'not editor'));
    await flush();
    expect(onNotEditor).toHaveBeenCalledTimes(1);
    expect(onNoAccess).not.toHaveBeenCalled();
  });
});
