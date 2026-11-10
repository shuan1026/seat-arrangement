// App Shell：docs/spec/README.md 第 4 節（導覽固定三項與路徑）、第 5 節（Sidebar、使用者區塊、Mobile Header 與 Drawer）、
// AUTH-R09、AUTH-R10、第 14 節（導覽、使用者選單、已登出）；COM-AC08～AC10、AUTH-AC11～AC13。
// 已登入狀態用 tests/e2e/helpers/auth.ts 直接產生 session cookie（不經 Google）。
// 手機選單鈕的無障礙名稱「開啟選單」沿用原型 ui-design-system/source-reference/html/prototype/shell.js。
import { expect, test, type Page } from '@playwright/test';
import { signIn, TEST_USER } from './helpers/auth';
import { fetchFromPage, isMobileWidth, requireBaseURL } from './helpers/page-checks';

const NAV = ['座位安排', '參與人員', '員工名單'] as const;
const PATH_OF: Record<(typeof NAV)[number], string> = { 座位安排: '/', 參與人員: '/people', 員工名單: '/employees' };

/** 看得到的主要導覽（桌面 Sidebar，或手機 Drawer 裡的） */
const visibleNav = (page: Page) =>
  page
    .getByRole('navigation')
    .filter({ has: page.getByRole('link', { name: '座位安排', exact: true }) })
    .filter({ visible: true });

const navLink = (page: Page, name: string) => visibleNav(page).getByRole('link', { name, exact: true });

/** 看得到的使用者區塊（觸發使用者選單的按鈕） */
const userTrigger = (page: Page) =>
  page.getByRole('button', { name: new RegExp(TEST_USER.name) }).filter({ visible: true });

const menuButton = (page: Page) => page.getByRole('button', { name: '開啟選單' });

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
});

test.describe('桌面 Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(isMobileWidth(page), '桌面寬度才有 Sidebar');
  });

  test('導覽固定三項，順序是座位安排、參與人員、員工名單（第 4 節、第 14 節）', async ({ page }) => {
    await page.goto('/');
    await expect(visibleNav(page)).toHaveCount(1);
    await expect(visibleNav(page).getByRole('link')).toHaveText([...NAV]);
  });

  test('按導覽項目切換頁面，目前頁面有標示（COM-AC08）', async ({ page }) => {
    await page.goto('/');
    await expect(navLink(page, '座位安排')).toHaveAttribute('aria-current', 'page');

    for (const name of ['參與人員', '員工名單', '座位安排'] as const) {
      await navLink(page, name).click();
      await expect(page).toHaveURL((url) => url.pathname === PATH_OF[name]);
      await expect(navLink(page, name)).toHaveAttribute('aria-current', 'page');
      for (const other of NAV.filter((n) => n !== name)) {
        await expect(navLink(page, other)).not.toHaveAttribute('aria-current', 'page');
      }
    }
  });

  test('使用者區塊顯示登入者的姓名與 email（AUTH-R10）', async ({ page }) => {
    await page.goto('/');
    await expect(userTrigger(page)).toHaveCount(1);
    await expect(userTrigger(page)).toContainText(TEST_USER.name);
    await expect(userTrigger(page)).toContainText(TEST_USER.email);
  });

  test('點開使用者選單：第一列是姓名與 email，選項只有「登出」（第 5 節、AUTH-AC11）', async ({ page }) => {
    await page.goto('/');
    await userTrigger(page).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText(TEST_USER.name);
    await expect(menu).toContainText(TEST_USER.email);
    await expect(menu.getByRole('menuitem')).toHaveCount(1);
    await expect(menu.getByRole('menuitem', { name: '登出' })).toBeVisible();
  });

  test('使用者選單在觸發區右側、底邊對齊（第 5 節、AUTH-AC12）', async ({ page }) => {
    await page.goto('/');
    const trigger = userTrigger(page);
    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    const triggerBox = await trigger.boundingBox();
    const menuBox = await menu.boundingBox();
    if (!triggerBox || !menuBox) throw new Error('量不到使用者區塊或選單');
    expect(menuBox.x).toBeGreaterThanOrEqual(triggerBox.x + triggerBox.width - 1);
    expect(Math.abs(menuBox.y + menuBox.height - (triggerBox.y + triggerBox.height))).toBeLessThanOrEqual(1);
  });

  test('選「登出」不需確認，回到登入頁並顯示「已登出。」；按上一頁也看不到資料（AUTH-R09、AUTH-AC11）', async ({
    page,
  }) => {
    await page.goto('/');
    await userTrigger(page).click();
    await page.getByRole('menu').getByRole('menuitem', { name: '登出' }).click();

    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByText('已登出。')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: '用公司帳號登入' })).toBeVisible();
    expect((await fetchFromPage(page, '/api/state')).status).toBe(401);

    await page.goBack();
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByRole('link', { name: '參與人員', exact: true })).toHaveCount(0);
  });

  test('視窗 1280 px：Sidebar 展開，比 48 px 圖示列寬', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1024, '只在 1024 px 以上驗證展開');
    await page.goto('/');
    const nav = await visibleNav(page).boundingBox();
    expect(nav?.width ?? 0).toBeGreaterThan(48);
  });

  test('視窗 1023 px 第一次開啟：Sidebar 收合為 48 px，滑過導覽圖示與頭像顯示名稱（COM-AC09、AUTH-AC12）', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    await page.goto('/');

    // 收合時只剩圖示列與頭像，仍保有無障礙名稱
    await expect(navLink(page, '參與人員')).toBeVisible();
    const nav = await visibleNav(page).boundingBox();
    const trigger = await userTrigger(page).boundingBox();
    if (!nav || !trigger) throw new Error('量不到導覽或使用者區塊');
    expect(nav.width).toBeLessThanOrEqual(48 + 1);
    expect(trigger.width).toBeLessThanOrEqual(48 + 1);

    await navLink(page, '參與人員').hover();
    await expect(page.getByRole('tooltip').first()).toContainText('參與人員');

    await page.mouse.move(640, 400);
    await userTrigger(page).hover();
    await expect(page.getByRole('tooltip').first()).toContainText(TEST_USER.name);
  });
});

test.describe('手機（767 px 以下）', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機寬度才有 Mobile Header 與 Drawer');
  });

  test('不顯示桌面 Sidebar，Mobile Header 有選單鈕（第 5 節、COM-AC10）', async ({ page }) => {
    await page.goto('/');
    await expect(menuButton(page)).toBeVisible();
    await expect(visibleNav(page)).toHaveCount(0);
    await expect(userTrigger(page)).toHaveCount(0);
  });

  test('按選單鈕開 Drawer：看得到三個導覽與使用者區塊（COM-AC10）', async ({ page }) => {
    await page.goto('/');
    await menuButton(page).click();

    await expect(visibleNav(page).getByRole('link')).toHaveText([...NAV]);
    await expect(userTrigger(page)).toBeVisible();
    await expect(userTrigger(page)).toContainText(TEST_USER.name);
    await expect(userTrigger(page)).toContainText(TEST_USER.email);
  });

  test('按 Esc 關閉 Drawer（COM-AC10）', async ({ page }) => {
    await page.goto('/');
    await menuButton(page).click();
    await expect(visibleNav(page)).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(visibleNav(page)).toHaveCount(0);
  });

  test('按導覽項目切換頁面並關閉 Drawer（COM-AC10）', async ({ page }) => {
    await page.goto('/');
    await menuButton(page).click();
    await navLink(page, '參與人員').click();

    await expect(page).toHaveURL((url) => url.pathname === '/people');
    await expect(visibleNav(page)).toHaveCount(0);
  });

  test('Drawer 裡的使用者選單往上開、和使用者區塊同寬，有「登出」（第 5 節、AUTH-AC13）', async ({ page }) => {
    await page.goto('/');
    await menuButton(page).click();
    const trigger = userTrigger(page);
    await trigger.click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText(TEST_USER.name);
    await expect(menu).toContainText(TEST_USER.email);
    await expect(menu.getByRole('menuitem', { name: '登出' })).toBeVisible();

    const triggerBox = await trigger.boundingBox();
    const menuBox = await menu.boundingBox();
    if (!triggerBox || !menuBox) throw new Error('量不到使用者區塊或選單');
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(triggerBox.y + 1);
    expect(Math.abs(menuBox.width - triggerBox.width)).toBeLessThanOrEqual(1);
  });
});
