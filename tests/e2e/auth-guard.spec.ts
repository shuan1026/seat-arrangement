// 登入保護：docs/spec/README.md AUTH-R01（沒登入先到登入頁，網址帶著原本要開的頁面）、AUTH-AC01 的前半、
// AUTH-R08、AUTH-AC08（沒登入呼叫資料 API 被拒絕且不含資料；健康檢查正常）；docs/architecture.md 第 9.2 節。
// Google 登入本身不測；已登入狀態用 tests/e2e/helpers/auth.ts 直接產生 session cookie。
import { expect, test } from '@playwright/test';
import { signIn } from './helpers/auth';
import { fetchFromPage, requireBaseURL } from './helpers/page-checks';

/** 登入頁網址裡帶回去的頁面（接受相對或絕對網址） */
function callbackTarget(pageUrl: string): URL | undefined {
  const url = new URL(pageUrl);
  return [...url.searchParams.values()]
    .filter((v) => v.startsWith('/') || v.startsWith(url.origin))
    .map((v) => new URL(v, url.origin))
    .find((u) => u.origin === url.origin);
}

test.describe('沒登入開頁面（AUTH-R01）', () => {
  test('開 /people?q=王 導到登入頁，網址帶著原本要開的頁面與參數（AUTH-AC01）', async ({ page }) => {
    await page.goto(`/people?q=${encodeURIComponent('王')}`);
    await expect(page).toHaveURL(/\/login(\?|$)/);
    const target = callbackTarget(page.url());
    expect(target?.pathname).toBe('/people');
    expect(target?.searchParams.get('q')).toBe('王');
  });

  // 權限頁與發布頁也要登入（D-021、AUTH-R15）
  for (const path of ['/', '/people', '/employees', '/permissions', '/seats', '/no-such-page']) {
    test(`開 ${path} 也先到登入頁`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login(\?|$)/);
      await expect(page.getByRole('heading', { level: 1, name: '用公司帳號登入' })).toBeVisible();
    });
  }

  test('直接開登入頁就停在登入頁，不會一直導向', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: '用公司帳號登入' })).toBeVisible();
  });

  test('沒登入時看不到 App Shell 與任何資料', async ({ page }) => {
    await page.goto('/people');
    await expect(page.getByRole('heading', { level: 1, name: '用公司帳號登入' })).toBeVisible();
    await expect(page.getByRole('link', { name: '參與人員', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '員工名單', exact: true })).toHaveCount(0);
  });
});

test.describe('沒登入呼叫 API（AUTH-R08、AUTH-AC08）', () => {
  test('GET /api/state 回 401，回應不含資料', async ({ page }) => {
    await page.goto('/login');
    const { status, body } = await fetchFromPage(page, '/api/state');
    expect(status).toBe(401);
    expect(body).toEqual({ error: expect.objectContaining({ code: 'UNAUTHENTICATED' }) });
  });

  for (const [method, path] of [
    ['GET', '/api/employees'],
    ['POST', '/api/employees'],
    ['POST', '/api/participants'],
    ['POST', '/api/seating/operations'],
    ['PATCH', '/api/tables/3'],
    ['GET', '/api/export/seating'],
    ['GET', '/api/members'],
    ['POST', '/api/members'],
    ['PATCH', '/api/members/1'],
    ['DELETE', '/api/members/1'],
    ['PUT', '/api/publish'],
    ['GET', '/api/seats'],
  ] as const) {
    test(`${method} ${path} 也被拒絕，回應不含資料`, async ({ page }) => {
      await page.goto('/login');
      const { status, body } = await fetchFromPage(page, path, method);
      expect(status).toBe(401);
      expect(body).toEqual({ error: expect.objectContaining({ code: 'UNAUTHENTICATED' }) });
    });
  }

  test('GET /api/health 不需登入，回 200', async ({ page, request }) => {
    await page.goto('/login');
    expect((await fetchFromPage(page, '/api/health')).status).toBe(200);
    expect((await request.get('/api/health')).status()).toBe(200);
  });
});

test.describe('已登入', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, requireBaseURL(baseURL));
  });

  test('開 /people?q=王 直接進入那一頁，網址參數保留', async ({ page }) => {
    await page.goto(`/people?q=${encodeURIComponent('王')}`);
    await expect(page).toHaveURL(/\/people\?/);
    expect(new URL(page.url()).searchParams.get('q')).toBe('王');
  });

  test('GET /api/state 回 200，有 31 張桌次', async ({ page }) => {
    await page.goto('/');
    const { status, body } = await fetchFromPage(page, '/api/state');
    expect(status).toBe(200);
    expect((body as { tables: unknown[] }).tables).toHaveLength(31);
  });
});
