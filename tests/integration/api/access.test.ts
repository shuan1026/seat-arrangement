// API 的登入保護：docs/spec/README.md AUTH-R08、AUTH-AC08（沒登入時呼叫任何 API 都被拒絕、不回傳資料；健康檢查除外）；
// 不參加的 PUT /api/employees/{id}/declined（D-014）也由這裡掃描檢查；
// docs/architecture.md 第 8 節（GET /api/health 不需登入）、第 9.2 節（每個 Route Handler 透過 route() 再確認一次登入）。
// 掃描 src/app/api 底下所有的 route.ts，之後新增的 API 也會自動被檢查。
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as health } from '@/app/api/health/route';
import { resetData } from '../../helpers/db';

type User = { id: string; name: string; email: string };
const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn<() => Promise<User | null>>() }));
vi.mock('@/server/auth', () => ({ currentUser }));

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const API_DIR = path.join(process.cwd(), 'src', 'app', 'api');
/** 不需登入的路徑：健康檢查與 Auth.js 的登入、回呼、登出 */
const PUBLIC_DIRS = new Set(['health', 'auth']);
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const protectedRoutes = readdirSync(API_DIR, { recursive: true, encoding: 'utf8' })
  .filter((file) => path.basename(file) === 'route.ts')
  .filter((file) => !PUBLIC_DIRS.has(file.split(path.sep)[0] ?? ''))
  .sort();

/** route.ts 的路徑換成網址，動態路徑段（[id]）用 1 代入 */
const urlOf = (file: string) =>
  `http://localhost:3000/api/${path
    .dirname(file)
    .split(path.sep)
    .map((seg) => (seg.startsWith('[') ? '1' : seg))
    .join('/')}`;

beforeEach(async () => {
  await resetData();
  currentUser.mockReset();
  currentUser.mockResolvedValue(null);
});

describe('沒登入時需要登入的 API 都回 401（AUTH-R08）', () => {
  it('掃描得到需要登入的 API（至少有 /api/state）', () => {
    expect(protectedRoutes).toContain(path.join('state', 'route.ts'));
  });

  it('掃描得到 PUT /api/employees/{id}/declined（docs/architecture.md 第 8 節、D-014），一樣要登入', () => {
    expect(protectedRoutes).toContain(path.join('employees', '[id]', 'declined', 'route.ts'));
  });

  it.each(protectedRoutes)('%s：每個方法都回 401 UNAUTHENTICATED，回應只有錯誤', async (file) => {
    const mod = (await import(path.join(API_DIR, file))) as Record<string, unknown>;
    const methods = METHODS.filter((m) => typeof mod[m] === 'function');
    expect(methods.length).toBeGreaterThan(0);

    for (const method of methods) {
      const handler = mod[method] as Handler;
      const hasBody = method !== 'GET' && method !== 'DELETE';
      const req = new Request(urlOf(file), {
        method,
        ...(hasBody ? { body: '{}', headers: { 'Content-Type': 'application/json' } } : {}),
      });
      const res = await handler(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status, `${method} ${urlOf(file)}`).toBe(401);
      const body = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(body), `${method} ${urlOf(file)}`).toEqual(['error']);
      expect(body.error, `${method} ${urlOf(file)}`).toMatchObject({ code: 'UNAUTHENTICATED' });
    }
  });
});

describe('GET /api/health', () => {
  it('不需登入就回 200', async () => {
    const res = await health();
    expect(res.status).toBe(200);
  });

  it('不檢查登入', async () => {
    await health();
    expect(currentUser).not.toHaveBeenCalled();
  });
});
