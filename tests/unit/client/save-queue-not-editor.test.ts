// 被改為檢視者後的下一次操作：docs/spec/README.md AUTH-R13（這次操作不儲存，還沒存的後續操作一併取消，重新載入並切換成只能檢視）；
// docs/architecture.md 第 8.2 節（403 NOT_EDITOR：不重試，捨棄佇列中還沒送出的操作）、第 10.3 節第 7 點；D-021、D-026。
// 權限被移除（403 NO_ACCESS，AUTH-R17）見 tests/unit/client/save-queue-no-access.test.ts。
// 用假的 send，不發網路請求。重新載入與提示由 AppProvider 處理（tests/unit/client/app-provider-permissions.test.tsx）。
//
// 假設的介面（src/client/save-queue.ts）：QueueHooks 多一個可省略的 onNotEditor?: () => void，
// 收到 ApiFailure('NOT_EDITOR', 403) 時呼叫它（不呼叫 onConflict、onUnauthenticated）。既有的 hooks 不變。
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

function createQueue() {
  const onConflict = vi.fn<(code: ErrorCode) => void>();
  const onUnauthenticated = vi.fn<() => void>();
  const onNotEditor = vi.fn<() => void>();
  const queue = new SaveQueue({
    onStatus: () => {},
    onConflict,
    onUnauthenticated,
    onNotEditor,
    now: () => new Date(2026, 10, 10, 9, 5),
  });
  return { queue, onConflict, onUnauthenticated, onNotEditor, text: () => saveStatusText(queue.current) };
}

const notEditor = () => new ApiFailure('NOT_EDITOR', 403, 'not editor');

describe('403 NOT_EDITOR（AUTH-R13）', () => {
  it('這次不儲存、不重試；還沒送出的後續操作一併取消；交給 onNotEditor，不呼叫 onConflict 與 onUnauthenticated', async () => {
    const { queue, onConflict, onUnauthenticated, onNotEditor } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    const b = operation('b', log);
    const c = operation('c', log);
    queue.enqueue(a.job);
    queue.enqueue(b.job);
    queue.enqueue(c.job);
    await flush();

    a.fail(notEditor());
    await flush();

    expect(onNotEditor).toHaveBeenCalledTimes(1);
    expect(onConflict).not.toHaveBeenCalled();
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
    a.fail(notEditor());
    await flush();

    expect(queue.current.state).toBe('idle');
    expect(text()).not.toBe('儲存失敗，請檢查網路後再試一次。');
    expect(queue.current.savedAt).toBeNull();

    queue.retry();
    await flush();
    expect(log).toEqual(['a']);
  });

  it('被拒之前已存好的操作不受影響', async () => {
    const { queue, text } = createQueue();
    const log: string[] = [];
    const first = operation('first', log);
    const a = operation('a', log);
    queue.enqueue(first.job);
    queue.enqueue(a.job);
    await flush();
    first.succeed();
    await flush();
    a.fail(notEditor());
    await flush();

    expect(first.onSuccess).toHaveBeenCalledTimes(1);
    expect(text()).toBe('已儲存 09:05');
  });

  it('佇列沒有暫停：之後若又重新取得編輯權限，新的操作照常送出', async () => {
    const { queue } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    queue.enqueue(a.job);
    await flush();
    a.fail(notEditor());
    await flush();

    const d = operation('d', log);
    queue.enqueue(d.job);
    await flush();
    expect(log).toEqual(['a', 'd']);
    d.succeed();
    await flush();
    expect(d.onSuccess).toHaveBeenCalledTimes(1);
  });
});
