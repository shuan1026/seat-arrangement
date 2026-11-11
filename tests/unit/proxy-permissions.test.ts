// @vitest-environment node
// 權限頁與發布頁的登入檢查（src/proxy.ts）：docs/spec/README.md AUTH-R01、AUTH-R08、AUTH-R15（發布頁 /seats 也要登入，登入後回到 /seats）；
// docs/architecture.md 第 9.2 節（/seats 與 /api/seats 和其他頁面、API 一樣要登入，不列進 proxy 的公開路徑）、第 9.3 節
// （proxy 只檢查登入，不查資料庫；權限由 route() 與頁面的伺服器端元件判斷）；D-021、D-026（/api/editors 改成 /api/members）。
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '@/proxy';

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock('next-auth/jwt', () => ({ getToken }));

const BASE = 'http://localhost:3000';
const request = (path: string, method = 'GET') => new NextRequest(`${BASE}${path}`, { method });
const isPassThrough = (res: Response) => res.headers.get('x-middleware-next') === '1';

beforeEach(() => {
  getToken.mockReset();
});

describe('沒登入', () => {
  beforeEach(() => {
    getToken.mockResolvedValue(null);
  });

  it('開 /seats → 導向 /login，並記住要回到 /seats（AUTH-R15、AUTH-AC20）', async () => {
    const res = await proxy(request('/seats'));
    const location = new URL(res.headers.get('location') ?? '', BASE);
    expect(location.pathname).toBe('/login');
    const back = [...location.searchParams.values()].map((v) => new URL(v, BASE)).find((u) => u.pathname === '/seats');
    expect(back, '網址帶著 /seats').toBeDefined();
  });

  it('開 /permissions → 導向 /login', async () => {
    const res = await proxy(request('/permissions'));
    expect(new URL(res.headers.get('location') ?? '', BASE).pathname).toBe('/login');
  });

  it.each([
    ['GET', '/api/seats'],
    ['GET', '/api/members'],
    ['POST', '/api/members'],
    ['PATCH', '/api/members/1'],
    ['DELETE', '/api/members/1'],
    ['PUT', '/api/publish'],
  ])('%s %s 回 401 UNAUTHENTICATED，不導向', async (method, path) => {
    const res = await proxy(request(path, method));
    expect(res.status).toBe(401);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.json()).toEqual({ error: expect.objectContaining({ code: 'UNAUTHENTICATED' }) });
  });
});

describe('已登入：proxy 只看登入，不判斷權限（docs/architecture.md 第 9.3 節）', () => {
  it.each(['/seats', '/permissions', '/', '/people', '/employees', '/api/seats', '/api/members', '/api/state'])(
    '檢視者開 %s 放行（是不是編輯者由頁面與 route() 判斷）',
    async (path) => {
      getToken.mockResolvedValue({ sub: 'google-sub-2', name: '檢視同仁', email: 'viewer@program.com.tw' });
      expect(isPassThrough(await proxy(request(path)))).toBe(true);
    },
  );

  it.each(['/', '/people', '/employees', '/permissions', '/seats', '/api/state', '/api/seats'])(
    '沒有權限的公司帳號開 %s 也放行，不導向登入頁（「沒有權限」頁由 (main)/layout.tsx 在同一個網址顯示，API 由 route() 回 NO_ACCESS，AUTH-R16）',
    async (path) => {
      getToken.mockResolvedValue({ sub: 'google-sub-4', name: '丁同仁', email: 'ding@program.com.tw' });
      const res = await proxy(request(path));
      expect(isPassThrough(res)).toBe(true);
      expect(res.headers.get('location')).toBeNull();
    },
  );
});
