// 整頁不能水平捲動：docs/spec/README.md 第 9 節、COM-AC11；第 8.1 節（登入頁的光暈不造成水平捲動）、AUTH-AC14。
// playwright.config.ts 的 desktop（1280 px）與 mobile-320 兩個 project 都會跑。
// 375、430、768、1024 px 的截圖檢查留到階段 3（docs/plan/implementation-plan.md 第 6 節）。
import { expect, test } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';

test.describe('沒登入的頁面', () => {
  for (const path of ['/login', '/login?error=AccessDenied', '/login?error=OAuthCallback', '/login?expired=1']) {
    test(`${path} 沒有整頁水平捲動`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: '用公司帳號登入' })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }
});

test.describe('已登入的頁面', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, requireBaseURL(baseURL));
  });

  for (const path of ['/', '/people', '/employees', '/no-such-page']) {
    test(`${path} 沒有整頁水平捲動`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('load');
      await expect(page.getByRole('heading').filter({ visible: true }).first()).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }

  test('手機開著 Drawer 時也沒有整頁水平捲動', async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機寬度才有 Drawer');
    await page.goto('/');
    await page.getByRole('button', { name: '開啟選單' }).click();
    await expect(page.getByRole('link', { name: '員工名單', exact: true }).filter({ visible: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
