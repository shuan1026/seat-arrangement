// 介面配色記在這個瀏覽器、開頁時不先閃淺色：docs/spec/README.md COM-R18（配色記在這個瀏覽器；開啟任何頁面時在畫面第一次繪製前就套用；
// 登入頁沿用這個瀏覽器的選擇，但沒有介面配色鈕）、COM-AC17；docs/architecture.md 第 11.3 節（localStorage；根版面 <head> 的 inline script
// 在第一次繪製前把 data-theme 設在 <html>；不存資料庫）；第 5 節（深色主題時登入頁的 Logo 也用白色版）；決策 D-020。
//
// 「沒有先閃淺色」用兩種方式檢查：
// 1. 第一次繪製時的狀態（helpers/theme-page.ts 的 recordFirstFrame）：文件一建立就登記 requestAnimationFrame，瀏覽器在第一次繪製前
//    才呼叫它，這時 <html> 已經要是 data-theme="dark"、頁面背景已經是深色的 --background。若要等 React 掛上後才套用，這裡會是淺色。
// 2. 擋掉頁面的 JavaScript（/_next/static 下的 .js）：只靠伺服器回傳的 HTML（含 <head> 的 inline script）與樣式表，
//    <html> 仍要是 data-theme="dark"、背景是深色。這確認套用不是靠前端程式載入後才做。
// 「換另一個瀏覽器」用另一個 browser context（各自的 localStorage）模擬。
import { expect, test, type Page } from '@playwright/test';
import { signIn, TEST_USER } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import {
  anyThemeButton,
  blockAppScripts,
  chooseTheme,
  expectFirstFrame,
  expectPageTheme,
  gotoPage,
  htmlTheme,
  lookOf,
  openThemeMenu,
  pageColors,
  expectedPageColors,
  recordFirstFrame,
  themeItem,
  visibleLogo,
} from './helpers/theme-page';
import { themeTokenHex } from '../helpers/theme-tokens';

const LOGIN_TITLE = '用公司帳號登入';

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
  await recordFirstFrame(context);
});

/** 在座位安排選「深色」 */
async function chooseDarkOnSeating(page: Page) {
  await gotoPage(page, '/', '座位安排');
  await chooseTheme(page, 'dark');
  await expectPageTheme(page, 'dark');
}

/** 看得到的主要導覽連結（手機先開 Drawer） */
async function clickNav(page: Page, name: string) {
  if (isMobileWidth(page)) await page.getByRole('button', { name: '開啟選單' }).click();
  await page
    .getByRole('navigation', { name: '主要導覽' })
    .filter({ visible: true })
    .getByRole('link', { name, exact: true })
    .click();
}

/** 從使用者選單登出（手機先開 Drawer），回到登入頁 */
async function logout(page: Page) {
  if (isMobileWidth(page)) await page.getByRole('button', { name: '開啟選單' }).click();
  await page.getByRole('button', { name: new RegExp(TEST_USER.name) }).filter({ visible: true }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: '登出' }).click();
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect(page.getByRole('heading', { level: 1, name: LOGIN_TITLE })).toBeVisible();
}

/** 登入卡片裡看得到的 Logo（第 5 節：深色主題時登入頁的 Logo 用白色版 logo-light.svg，淺色時 logo-dark.svg） */
async function expectLoginLogo(page: Page, file: 'logo-light.svg' | 'logo-dark.svg') {
  const logo = visibleLogo(page.getByRole('main'));
  await expect(logo).toHaveCount(1);
  await expect(logo).toHaveAttribute('src', new RegExp(file.replace('.', '\\.')));
  await expect
    .poll(() => logo.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))
    .toBe(true);
}

/** 登入頁是深色：整頁、卡片（--card）與標題文字、白色版 Logo；沒有介面配色鈕 */
async function expectDarkLogin(page: Page) {
  await expectPageTheme(page, 'dark');
  const title = await lookOf(page.getByRole('heading', { level: 1, name: LOGIN_TITLE }));
  expect(title.background, '登入卡片的底色').toBe(themeTokenHex('dark', '--card'));
  expect(title.color, '登入頁標題的文字色').toBe(themeTokenHex('dark', '--foreground'));
  await expectLoginLogo(page, 'logo-light.svg');
  await expect(anyThemeButton(page)).toHaveCount(0);
}

test.describe('COM-AC17 已選深色', () => {
  test('重新整理 → 仍是深色，第一次繪製時就是深色；選單「深色」打勾', async ({ page }) => {
    await chooseDarkOnSeating(page);

    await page.reload();
    await expectFirstFrame(page, 'dark');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    // 前端程式掛上之後也不會把配色改掉
    await expectPageTheme(page, 'dark');
    await openThemeMenu(page);
    await expect(themeItem(page, 'dark')).toHaveAttribute('aria-checked', 'true');
  });

  test('用導覽換頁 → 仍是深色、沒有重新整理；直接開另一頁的網址 → 第一次繪製就是深色', async ({ page }) => {
    await chooseDarkOnSeating(page);
    await page.evaluate(() => {
      (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
    });

    await clickNav(page, '參與人員');
    await expect(page).toHaveURL((url) => url.pathname === '/people');
    await expect(page.getByRole('heading', { level: 1, name: '參與人員' })).toBeVisible();
    await expectPageTheme(page, 'dark');
    expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);

    await page.goto('/employees');
    await expectFirstFrame(page, 'dark');
    await expect(page.getByRole('heading', { level: 1, name: '員工名單' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectPageTheme(page, 'dark');
  });

  test('開新分頁 → 深色，第一次繪製就是深色', async ({ page, context }) => {
    await chooseDarkOnSeating(page);

    const second = await context.newPage();
    try {
      await second.goto('/people');
      await expectFirstFrame(second, 'dark');
      await expect(second.getByRole('heading', { level: 1, name: '參與人員' })).toBeVisible();
      await expectPageTheme(second, 'dark');
    } finally {
      await second.close();
    }
  });

  test('登出 → 回到登入頁仍是深色（第一次繪製就是深色、卡片是深色）；登入頁沒有介面配色鈕', async ({ page }) => {
    await chooseDarkOnSeating(page);

    await logout(page);
    await expectFirstFrame(page, 'dark');
    await expectDarkLogin(page);
  });

  test('登入過期或沒登入、直接開登入頁 → 仍是深色，Logo 是白色版（logo-light.svg），沒有介面配色鈕', async ({ page, context }) => {
    await chooseDarkOnSeating(page);
    await context.clearCookies();

    for (const path of ['/login', '/login?expired=1']) {
      await page.goto(path);
      await expectFirstFrame(page, 'dark');
      await expect(page.getByRole('heading', { level: 1, name: LOGIN_TITLE })).toBeVisible();
      await expectDarkLogin(page);
    }
  });

  test('換另一個瀏覽器開啟 → 淺色；原本的瀏覽器仍是深色', async ({ page, browser, baseURL }) => {
    await chooseDarkOnSeating(page);

    const other = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? undefined });
    try {
      await signIn(other, requireBaseURL(baseURL));
      const otherPage = await other.newPage();
      await gotoPage(otherPage, '/', '座位安排');
      await expectPageTheme(otherPage, 'light');
      await openThemeMenu(otherPage);
      await expect(themeItem(otherPage, 'light')).toHaveAttribute('aria-checked', 'true');
    } finally {
      await other.close();
    }

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expectPageTheme(page, 'dark');
  });

  test('不靠頁面的 JavaScript：擋掉 /_next/static 的 .js 後，各頁與登入頁的 <html> 仍是 data-theme="dark"、背景是深色', async ({
    page,
    context,
  }) => {
    await chooseDarkOnSeating(page);
    await blockAppScripts(page);

    for (const path of ['/', '/people', '/employees', '/no-such-page']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(await htmlTheme(page), path).toBe('dark');
      await expect.poll(() => pageColors(page), { message: path }).toEqual(expectedPageColors('dark'));
    }

    await context.clearCookies();
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    expect(await htmlTheme(page), '/login').toBe('dark');
    await expect.poll(() => pageColors(page), { message: '/login' }).toEqual(expectedPageColors('dark'));
  });
});

test.describe('淺色（沒選過或選回淺色）', () => {
  test('沒選過：第一次繪製就是淺色、沒有 data-theme；擋掉頁面的 JavaScript 時也沒有 data-theme', async ({ page }) => {
    await page.goto('/');
    await expectFirstFrame(page, 'light');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expectPageTheme(page, 'light');

    await blockAppScripts(page);
    await page.goto('/people', { waitUntil: 'domcontentloaded' });
    expect(await htmlTheme(page)).toBeNull();
    await expect.poll(() => pageColors(page)).toEqual(expectedPageColors('light'));
  });

  test('沒選過、沒登入開登入頁 → 淺色，Logo 是 logo-dark.svg，沒有介面配色鈕', async ({ page, context }) => {
    await context.clearCookies();
    await gotoPage(page, '/login', LOGIN_TITLE);
    await expectPageTheme(page, 'light');
    await expectLoginLogo(page, 'logo-dark.svg');
    await expect(anyThemeButton(page)).toHaveCount(0);
  });

  test('選過深色再選回淺色 → 重新整理、換頁、開新分頁都是淺色', async ({ page, context }) => {
    await chooseDarkOnSeating(page);
    await chooseTheme(page, 'light');
    await expectPageTheme(page, 'light');

    await page.reload();
    await expectFirstFrame(page, 'light');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expectPageTheme(page, 'light');

    await page.goto('/employees');
    await expect(page.getByRole('heading', { level: 1, name: '員工名單' })).toBeVisible();
    await expectPageTheme(page, 'light');

    const second = await context.newPage();
    try {
      await gotoPage(second, '/people', '參與人員');
      await expectPageTheme(second, 'light');
    } finally {
      await second.close();
    }
  });
});
