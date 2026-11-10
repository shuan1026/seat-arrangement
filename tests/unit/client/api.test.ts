// @vitest-environment node
// 前端呼叫 API：把回應轉成儲存佇列看得懂的錯誤碼。docs/architecture.md 第 8.2 節（錯誤格式與 HTTP 狀態）、
// 第 10.3 節（網路錯誤或 500 → 重試；409／404 → 重新載入；401 → 導向登入頁）；COM-R04、COM-R07、AUTH-R07。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, apiFetch } from '@/client/api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch(impl: typeof fetch) {
  const fn = vi.fn<typeof fetch>(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const failureOf = (p: Promise<unknown>) => p.then(
  () => {
    throw new Error('應該失敗');
  },
  (e: unknown) => e,
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('成功時回傳 JSON', async () => {
    stubFetch(async () => json(200, { ok: 1 }));
    await expect(apiFetch('/api/state')).resolves.toEqual({ ok: 1 });
  });

  it('204 沒有內容', async () => {
    stubFetch(async () => new Response(null, { status: 204 }));
    await expect(apiFetch('/api/participants/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('送 JSON 本體時帶 Content-Type，只送同站的 cookie', async () => {
    const fn = stubFetch(async () => json(200, {}));
    await apiFetch('/api/tables/3', { method: 'PATCH', json: { noteName: '主桌' } });
    const init = fn.mock.calls[0]?.[1];
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe(JSON.stringify({ noteName: '主桌' }));
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.credentials).toBe('same-origin');
  });

  it('沒有收到回應（離線、逾時）是 NETWORK', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await failureOf(apiFetch('/api/state'));
    expect(error).toBeInstanceOf(ApiFailure);
    expect(error).toMatchObject({ code: 'NETWORK' });
  });

  it.each([
    [409, 'TABLE_FULL'],
    [409, 'DUPLICATE_PARTICIPANT'],
    [404, 'NOT_FOUND'],
    [401, 'UNAUTHENTICATED'],
    [400, 'VALIDATION_FAILED'],
    [500, 'INTERNAL'],
  ] as const)('HTTP %i 的 { error: { code: %s } } 轉成同一個 code', async (status, code) => {
    stubFetch(async () => json(status, { error: { code, message: 'for developers' } }));
    const error = await failureOf(apiFetch('/api/seating/operations', { method: 'POST', json: {} }));
    expect(error).toBeInstanceOf(ApiFailure);
    expect(error).toMatchObject({ code, status });
  });

  it('欄位錯誤一併帶回', async () => {
    stubFetch(async () =>
      json(400, { error: { code: 'VALIDATION_FAILED', message: 'invalid', fields: { name: '請輸入姓名。' } } }),
    );
    const error = await failureOf(apiFetch('/api/employees', { method: 'POST', json: {} }));
    expect(error).toMatchObject({ fields: { name: '請輸入姓名。' } });
  });

  it('401 但不是 JSON 時仍視為登入過期', async () => {
    stubFetch(async () => new Response('<html>sign in</html>', { status: 401, headers: { 'Content-Type': 'text/html' } }));
    const error = await failureOf(apiFetch('/api/state'));
    expect(error).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
  });

  it('其他不是 JSON 的錯誤頁視為系統錯誤', async () => {
    stubFetch(async () => new Response('<html>oops</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }));
    const error = await failureOf(apiFetch('/api/state'));
    expect(error).toMatchObject({ code: 'INTERNAL', status: 502 });
  });
});
