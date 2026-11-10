// @vitest-environment node
// 登入檢查（src/proxy.ts）：docs/spec/README.md AUTH-R01（沒登入先到登入頁，登入後回到原頁含網址參數）、
// AUTH-R08（沒登入呼叫 API 被拒絕，健康檢查除外）；docs/architecture.md 第 9.2 節（/login、/api/auth/*、/api/health 不需登入）。
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '@/proxy';

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock('next-auth/jwt', () => ({ getToken }));

const BASE = 'http://localhost:3000';
const request = (path: string, method = 'GET') => new NextRequest(`${BASE}${path}`, { method });

/** NextResponse.next() 代表放行 */
const isPassThrough = (res: Response) => res.headers.get('x-middleware-next') === '1';

beforeEach(() => {
  getToken.mockReset();
});

describe('沒登入開頁面（AUTH-R01）', () => {
  beforeEach(() => {
    getToken.mockResolvedValue(null);
  });

  it('導向 /login，並記住原本要開的頁面與網址參數（AUTH-AC01）', async () => {
    const res = await proxy(request(`/people?q=${encodeURIComponent('王')}`));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = new URL(res.headers.get('location') ?? '', BASE);
    expect(location.pathname).toBe('/login');
    const back = [...location.searchParams.values()].map((v) => new URL(v, BASE)).find((u) => u.pathname === '/people');
    expect(back?.searchParams.get('q')).toBe('王');
  });

  it.each(['/', '/employees', '/no-such-page'])('開 %s 也導向 /login', async (path) => {
    const res = await proxy(request(path));
    expect(new URL(res.headers.get('location') ?? '', BASE).pathname).toBe('/login');
  });

  it('登入頁本身不需登入', async () => {
    expect(isPassThrough(await proxy(request('/login')))).toBe(true);
    expect(isPassThrough(await proxy(request('/login?error=AccessDenied')))).toBe(true);
  });
});

describe('沒登入呼叫 API（AUTH-R08）', () => {
  beforeEach(() => {
    getToken.mockResolvedValue(null);
  });

  it.each([
    ['GET', '/api/state'],
    ['GET', '/api/employees'],
    ['POST', '/api/participants'],
    ['POST', '/api/seating/operations'],
    ['PATCH', '/api/tables/3'],
    ['GET', '/api/export/seating'],
  ])('%s %s 回 401 UNAUTHENTICATED，不導向', async (method, path) => {
    const res = await proxy(request(path, method));
    expect(res.status).toBe(401);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.json()).toEqual({ error: expect.objectContaining({ code: 'UNAUTHENTICATED' }) });
  });

  it('健康檢查不需登入', async () => {
    expect(isPassThrough(await proxy(request('/api/health')))).toBe(true);
  });

  it('Auth.js 的登入、回呼、登出不需登入', async () => {
    for (const path of ['/api/auth/signin/google', '/api/auth/callback/google', '/api/auth/session', '/api/auth/csrf']) {
      expect(isPassThrough(await proxy(request(path))), path).toBe(true);
    }
  });

  it('只有 /api/health 本身公開，名稱相近的路徑不公開', async () => {
    expect((await proxy(request('/api/healthcheck'))).status).toBe(401);
    expect((await proxy(request('/api/authx'))).status).toBe(401);
  });
});

describe('已登入', () => {
  beforeEach(() => {
    getToken.mockResolvedValue({ sub: 'google-sub-1', name: '測試承辦人', email: 'tester@program.com.tw' });
  });

  it.each(['/', '/people?q=王', '/employees', '/api/state'])('%s 放行', async (path) => {
    expect(isPassThrough(await proxy(request(path)))).toBe(true);
  });
});
