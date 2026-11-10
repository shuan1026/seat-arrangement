// 立即儲存的佇列：docs/spec/README.md 第 6 節（COM-R02～R04、COM-AC01～AC03）、第 7 節（COM-R07、COM-AC04、COM-AC05）、
// AUTH-R07；docs/architecture.md 第 10.3 節。用假的 send，不發網路請求。
import { describe, expect, it, vi } from 'vitest';
import type { ErrorCode } from '@/contracts/errors';
import { ApiFailure } from '@/client/api';
import { tableFullMessage } from '@/client/conflict-messages';
import { SaveQueue, type Job, type SaveStatus } from '@/client/save-queue';
import { saveStatusText } from '@/client/save-time';

/** 讓佇列把目前能做的事做完 */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** 一個操作：每次送出都由測試決定成功或失敗；送出時記在 log 裡 */
function operation(label: string, log: string[], extra: Pick<Job<string>, 'conflictMessage'> = {}) {
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
  const job: Job<string> = { send, onSuccess, ...extra };
  return {
    job,
    send,
    onSuccess,
    succeed: (value = `${label}-ok`) => latest().resolve(value),
    fail: (err: unknown) => latest().reject(err),
  };
}

function createQueue() {
  let clock = new Date(2026, 10, 10, 9, 5);
  const statuses: SaveStatus[] = [];
  const onConflict = vi.fn<(code: ErrorCode) => void>();
  const onUnauthenticated = vi.fn<() => void>();
  const queue = new SaveQueue({
    onStatus: (s) => statuses.push({ ...s }),
    onConflict,
    onUnauthenticated,
    now: () => clock,
  });
  return {
    queue,
    statuses,
    onConflict,
    onUnauthenticated,
    setClock: (d: Date) => {
      clock = d;
    },
    text: () => saveStatusText(queue.current),
  };
}

const networkError = () => new ApiFailure('NETWORK', 0, 'offline');
const serverError = () => new ApiFailure('INTERNAL', 500, 'HTTP 500');
const apiError = (code: ErrorCode, status: number) => new ApiFailure(code, status, code);

describe('儲存狀態（COM-R02、COM-AC01）', () => {
  it('還沒有任何操作時不是儲存中，也不是儲存失敗', () => {
    const { queue } = createQueue();
    expect(queue.current.state).toBe('idle');
    expect(queue.current.savedAt).toBeNull();
    expect(queue.pending).toBe(0);
  });

  it('送出時顯示「儲存中…」，完成後顯示「已儲存 {時:分}」', async () => {
    const { queue, statuses, text } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);

    queue.enqueue(a.job);
    await flush();
    expect(queue.current.state).toBe('saving');
    expect(text()).toBe('儲存中…');

    a.succeed();
    await flush();
    expect(queue.current.state).toBe('idle');
    expect(queue.current.savedAt).toEqual(new Date(2026, 10, 10, 9, 5));
    expect(text()).toBe('已儲存 09:05');
    expect(statuses[0]?.state).toBe('saving');
    expect(statuses.at(-1)?.state).toBe('idle');
  });

  it('佇列裡還有操作時維持儲存中，全部存完才顯示已儲存', async () => {
    const { queue, text } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    const b = operation('b', log);
    queue.enqueue(a.job);
    queue.enqueue(b.job);

    await flush();
    a.succeed();
    await flush();
    expect(text()).toBe('儲存中…');

    b.succeed();
    await flush();
    expect(text()).toBe('已儲存 09:05');
  });

  it('已儲存的時間是最後一次儲存成功的時間', async () => {
    const { queue, setClock, text } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    queue.enqueue(a.job);
    await flush();
    a.succeed();
    await flush();
    expect(text()).toBe('已儲存 09:05');

    setClock(new Date(2026, 10, 10, 9, 7));
    const b = operation('b', log);
    queue.enqueue(b.job);
    await flush();
    b.succeed();
    await flush();
    expect(text()).toBe('已儲存 09:07');
  });
});

describe('依操作順序一個一個儲存（COM-R03、COM-AC02）', () => {
  it('一次只送一個請求，前一個完成才送下一個', async () => {
    const { queue } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    const b = operation('b', log);
    const c = operation('c', log);
    queue.enqueue(a.job);
    queue.enqueue(b.job);
    queue.enqueue(c.job);

    await flush();
    expect(log).toEqual(['a']);
    a.succeed();
    await flush();
    expect(log).toEqual(['a', 'b']);
    b.succeed();
    await flush();
    expect(log).toEqual(['a', 'b', 'c']);
    c.succeed();
    await flush();

    expect(queue.pending).toBe(0);
    expect(a.send).toHaveBeenCalledTimes(1);
    expect(b.send).toHaveBeenCalledTimes(1);
    expect(c.send).toHaveBeenCalledTimes(1);
  });

  it('送出中才發生的操作，排在前面的操作之後送出', async () => {
    const { queue } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    const b = operation('b', log);
    queue.enqueue(a.job);
    await flush();
    queue.enqueue(b.job);
    await flush();
    expect(log).toEqual(['a']);

    a.succeed();
    await flush();
    expect(log).toEqual(['a', 'b']);
  });

  it('每一次成功都用自己的回應校正畫面，順序和操作順序相同（docs/architecture.md 第 10.3 節第 7 點）', async () => {
    const { queue } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    const b = operation('b', log);
    queue.enqueue(a.job);
    queue.enqueue(b.job);
    await flush();
    a.succeed('回應 a');
    await flush();
    b.succeed('回應 b');
    await flush();

    expect(a.onSuccess).toHaveBeenCalledWith('回應 a');
    expect(b.onSuccess).toHaveBeenCalledWith('回應 b');
    expect(a.onSuccess.mock.invocationCallOrder[0]).toBeLessThan(b.onSuccess.mock.invocationCallOrder[0] ?? 0);
  });
});

describe('儲存失敗與重試（COM-R04、COM-AC03）', () => {
  it.each<[string, () => unknown]>([
    ['網路中斷', networkError],
    ['系統錯誤（500）', serverError],
    ['沒有錯誤碼的例外', () => new TypeError('Failed to fetch')],
  ])('%s：暫停並顯示儲存失敗，後面的操作保留、不送出', async (_name, makeError) => {
    const { queue, onConflict, onUnauthenticated, text } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    const b = operation('b', log);
    const c = operation('c', log);
    queue.enqueue(a.job);
    queue.enqueue(b.job);
    queue.enqueue(c.job);
    await flush();

    a.fail(makeError());
    await flush();

    expect(queue.current.state).toBe('failed');
    expect(text()).toBe('儲存失敗，請檢查網路後再試一次。');
    expect(log).toEqual(['a']);
    expect(queue.pending).toBe(3);
    expect(a.onSuccess).not.toHaveBeenCalled();
    expect(onConflict).not.toHaveBeenCalled();
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('按「重試」從失敗的那一次接著存，再依序存後面的操作', async () => {
    const { queue, text } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    const b = operation('b', log);
    queue.enqueue(a.job);
    queue.enqueue(b.job);
    await flush();
    a.fail(networkError());
    await flush();

    queue.retry();
    await flush();
    expect(log).toEqual(['a', 'a']);
    expect(text()).toBe('儲存中…');

    a.succeed();
    await flush();
    expect(log).toEqual(['a', 'a', 'b']);
    b.succeed();
    await flush();

    expect(queue.current.state).toBe('idle');
    expect(queue.pending).toBe(0);
    expect(a.onSuccess).toHaveBeenCalledTimes(1);
    expect(b.onSuccess).toHaveBeenCalledTimes(1);
  });

  it('失敗後才發生的操作排在失敗的那一次之後，按重試前不送出', async () => {
    const { queue, text } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    const b = operation('b', log);
    queue.enqueue(a.job);
    await flush();
    a.fail(networkError());
    await flush();

    queue.enqueue(b.job);
    await flush();
    expect(log).toEqual(['a']);
    expect(text()).toBe('儲存失敗，請檢查網路後再試一次。');

    queue.retry();
    await flush();
    a.succeed();
    await flush();
    b.succeed();
    await flush();
    expect(log).toEqual(['a', 'a', 'b']);
    expect(queue.current.state).toBe('idle');
  });

  it('失敗時不更新已儲存的時間，重試成功後才更新', async () => {
    const { queue, setClock, text } = createQueue();
    const log: string[] = [];
    const first = operation('first', log);
    queue.enqueue(first.job);
    await flush();
    first.succeed();
    await flush();
    expect(text()).toBe('已儲存 09:05');

    setClock(new Date(2026, 10, 10, 9, 10));
    const a = operation('a', log);
    queue.enqueue(a.job);
    await flush();
    a.fail(networkError());
    await flush();
    expect(queue.current.savedAt).toEqual(new Date(2026, 10, 10, 9, 5));

    setClock(new Date(2026, 10, 10, 9, 12));
    queue.retry();
    await flush();
    a.succeed();
    await flush();
    expect(queue.current.savedAt).toEqual(new Date(2026, 10, 10, 9, 12));
    expect(text()).toBe('已儲存 09:12');
  });

  it('重試又失敗時仍保留這次操作，可以再按重試', async () => {
    const { queue } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    queue.enqueue(a.job);
    await flush();
    a.fail(networkError());
    await flush();

    queue.retry();
    await flush();
    a.fail(serverError());
    await flush();
    expect(queue.current.state).toBe('failed');
    expect(queue.pending).toBe(1);

    queue.retry();
    await flush();
    a.succeed();
    await flush();
    expect(log).toEqual(['a', 'a', 'a']);
    expect(queue.current.state).toBe('idle');
    expect(a.onSuccess).toHaveBeenCalledTimes(1);
  });

  it('沒有失敗時按重試不會重複送出', async () => {
    const { queue } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    queue.retry();
    queue.enqueue(a.job);
    await flush();
    queue.retry();
    await flush();
    expect(a.send).toHaveBeenCalledTimes(1);

    a.succeed();
    await flush();
    queue.retry();
    await flush();
    expect(a.send).toHaveBeenCalledTimes(1);
  });
});

describe('別人剛改過資料（COM-R07、COM-AC04、COM-AC05）', () => {
  it.each<[ErrorCode, number]>([
    ['TABLE_FULL', 409],
    ['STAFF_TABLE_FULL', 409],
    ['STAFF_EMPLOYEE_ONLY', 409],
    ['DUPLICATE_PARTICIPANT', 409],
    ['DEPENDENT_EXISTS', 409],
    ['CONFLICT', 409],
    ['NOT_FOUND', 404],
  ])('%s：這次不儲存、不重試，還沒存的後續操作一併取消，交給 onConflict 重新載入', async (code, status) => {
    const { queue, onConflict, onUnauthenticated } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    const b = operation('b', log);
    const c = operation('c', log);
    queue.enqueue(a.job);
    queue.enqueue(b.job);
    queue.enqueue(c.job);
    await flush();

    a.fail(apiError(code, status));
    await flush();

    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledWith(code);
    expect(onUnauthenticated).not.toHaveBeenCalled();
    expect(log).toEqual(['a']);
    expect(queue.pending).toBe(0);
    expect(a.onSuccess).not.toHaveBeenCalled();
    expect(b.onSuccess).not.toHaveBeenCalled();
    expect(c.onSuccess).not.toHaveBeenCalled();
    expect(queue.current.savedAt).toBeNull();
    // 重新載入後不是「儲存失敗」，也不需要按重試
    expect(queue.current.state).toBe('idle');

    queue.retry();
    await flush();
    expect(log).toEqual(['a']);
  });

  it('衝突前已存好的操作不受影響', async () => {
    const { queue, text } = createQueue();
    const log: string[] = [];
    const first = operation('first', log);
    const a = operation('a', log);
    queue.enqueue(first.job);
    queue.enqueue(a.job);
    await flush();
    first.succeed();
    await flush();
    a.fail(apiError('TABLE_FULL', 409));
    await flush();

    expect(first.onSuccess).toHaveBeenCalledTimes(1);
    expect(queue.current.savedAt).toEqual(new Date(2026, 10, 10, 9, 5));
    expect(text()).toBe('已儲存 09:05');
  });

  it('重新載入之後的新操作照常儲存', async () => {
    const { queue, setClock, text } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    queue.enqueue(a.job);
    await flush();
    a.fail(apiError('NOT_FOUND', 404));
    await flush();

    setClock(new Date(2026, 10, 10, 9, 30));
    const d = operation('d', log);
    queue.enqueue(d.job);
    await flush();
    expect(log).toEqual(['a', 'd']);
    d.succeed();
    await flush();
    expect(d.onSuccess).toHaveBeenCalledTimes(1);
    expect(text()).toBe('已儲存 09:30');
  });
});

describe('衝突時用這次操作自己的既有提示（COM-R08、SEAT-R86、COM-AC04）', () => {
  /** 建立佇列，並在 onConflict 被呼叫的當下記下 lastConflictMessage（app-provider 就是這時候讀它） */
  function createWatchedQueue() {
    const q = createQueue();
    const seen: (string | undefined)[] = [];
    q.onConflict.mockImplementation(() => {
      seen.push(q.queue.lastConflictMessage);
    });
    return { ...q, seen };
  }

  it('操作帶了既有提示：衝突時存進 lastConflictMessage，onConflict 仍收到 code', async () => {
    const { queue, onConflict, seen } = createWatchedQueue();
    const log: string[] = [];
    const conflictMessage = vi.fn((code: ErrorCode) =>
      code === 'TABLE_FULL' ? tableFullMessage(5) : undefined,
    );
    const a = operation('a', log, { conflictMessage });
    queue.enqueue(a.job);
    await flush();
    a.fail(apiError('TABLE_FULL', 409));
    await flush();

    expect(conflictMessage).toHaveBeenCalledWith('TABLE_FULL');
    expect(onConflict).toHaveBeenCalledWith('TABLE_FULL');
    // tableFullMessage 的參數是內部編號，5 是 B10 桌（D-019）
    expect(seen).toEqual(['B10 桌已滿，請先移出一位。']);
    expect(queue.lastConflictMessage).toBe('B10 桌已滿，請先移出一位。');
  });

  it('既有提示對這個 code 沒有文案時，lastConflictMessage 是空的（改用共用文案）', async () => {
    const { queue, seen } = createWatchedQueue();
    const log: string[] = [];
    const a = operation('a', log, { conflictMessage: (code) => (code === 'TABLE_FULL' ? tableFullMessage(5) : undefined) });
    queue.enqueue(a.job);
    await flush();
    a.fail(apiError('NOT_FOUND', 404));
    await flush();

    expect(seen).toEqual([undefined]);
  });

  it('操作沒帶既有提示時，不沿用上一次衝突的提示', async () => {
    const { queue, seen } = createWatchedQueue();
    const log: string[] = [];
    const first = operation('first', log, { conflictMessage: () => tableFullMessage(5) });
    queue.enqueue(first.job);
    await flush();
    first.fail(apiError('TABLE_FULL', 409));
    await flush();

    const second = operation('second', log);
    queue.enqueue(second.job);
    await flush();
    second.fail(apiError('NOT_FOUND', 404));
    await flush();

    expect(seen).toEqual(['B10 桌已滿，請先移出一位。', undefined]);
  });

  it('只用失敗的那一次操作的提示，被取消的後續操作不算', async () => {
    const { queue, seen } = createWatchedQueue();
    const log: string[] = [];
    const later = vi.fn(() => tableFullMessage(7));
    const a = operation('a', log);
    const b = operation('b', log, { conflictMessage: later });
    queue.enqueue(a.job);
    queue.enqueue(b.job);
    await flush();
    a.fail(apiError('TABLE_FULL', 409));
    await flush();

    expect(seen).toEqual([undefined]);
    expect(later).not.toHaveBeenCalled();
  });

  it('網路或系統錯誤不是衝突，不用既有提示', async () => {
    const { queue, onConflict } = createWatchedQueue();
    const log: string[] = [];
    const conflictMessage = vi.fn(() => tableFullMessage(5));
    const a = operation('a', log, { conflictMessage });
    queue.enqueue(a.job);
    await flush();
    a.fail(serverError());
    await flush();

    expect(onConflict).not.toHaveBeenCalled();
    expect(conflictMessage).not.toHaveBeenCalled();
    expect(queue.current.state).toBe('failed');
  });
});

describe('登入過期（AUTH-R07、AUTH-AC09）', () => {
  it('401：這次不儲存，交給 onUnauthenticated 導向登入頁，後面的操作不送出', async () => {
    const { queue, onConflict, onUnauthenticated } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    const b = operation('b', log);
    queue.enqueue(a.job);
    queue.enqueue(b.job);
    await flush();

    a.fail(apiError('UNAUTHENTICATED', 401));
    await flush();

    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(onConflict).not.toHaveBeenCalled();
    expect(log).toEqual(['a']);
    expect(a.onSuccess).not.toHaveBeenCalled();
    expect(queue.current.savedAt).toBeNull();
  });

  it('登入過期後才發生的操作也不送出', async () => {
    const { queue } = createQueue();
    const log: string[] = [];
    const a = operation('a', log);
    queue.enqueue(a.job);
    await flush();
    a.fail(apiError('UNAUTHENTICATED', 401));
    await flush();

    const c = operation('c', log);
    queue.enqueue(c.job);
    await flush();
    expect(c.send).not.toHaveBeenCalled();
  });
});
