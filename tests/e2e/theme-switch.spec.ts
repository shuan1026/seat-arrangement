// 介面配色鈕與選單：docs/spec/README.md 第 5 節（Header 右側依序是介面配色鈕與儲存狀態；Mobile Header 右側同；深色主題時 Sidebar 與 Drawer
// 的 Logo 用白色版）、COM-R17、COM-R18（不跟著作業系統的深色模式、不存資料庫）、第 14 節「介面配色」文案；
// 驗收條件 COM-AC16、COM-AC18，以及 COM-AC19 的「視窗 320 px 時 Mobile Header 也有介面配色鈕」；
// 設計系統 03-components.md「Palette Switch」（Icon Button、palette 圖示、選單對齊按鈕右緣、Text-xs 淡色標題、menuitemradio、
// 16 px 圓形色塊 --theme-swatch-*、目前的配色打勾）、Dropdown Menu 不被裁切；決策 D-020。
// 重新整理、換頁、開新分頁、登出後與另一個瀏覽器在 theme-persistence.spec.ts；深色時各頁、對話框、選單、Sonner 與匯出在 theme-dark-pages.spec.ts。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import {
  arrowToItem,
  checkIcon,
  chooseTheme,
  desktopSidebar,
  drawer,
  expectPageTheme,
  gotoPage,
  lookOf,
  openThemeMenu,
  SWITCHED,
  THEME_LABEL,
  themeButton,
  themeItem,
  themeMenu,
  toastWith,
  visibleHeader,
  visibleLogo,
  type ThemeName,
} from './helpers/theme-page';
import { themeTokenHex } from '../helpers/theme-tokens';

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面寬度才有 Sidebar 與桌面 Header');
const mobileOnly = (page: Page) => test.skip(!isMobileWidth(page), '手機寬度才有 Mobile Header 與 Drawer');

const openSeating = (page: Page) => gotoPage(page, '/', '座位安排');

/** Header 右側的儲存狀態（「已儲存」開頭） */
const saveStatus = (page: Page) => visibleHeader(page).getByText(/^已儲存/);

async function boxOf(what: string, loc: Locator) {
  const box = await loc.boundingBox();
  if (!box) throw new Error(`量不到${what}`);
  return box;
}

/** 從瀏覽器量一個 token 的 background-image（色塊用漸層） */
const tokenBackgroundImage = (page: Page, token: string) =>
  page.evaluate((t) => {
    const probe = document.createElement('div');
    probe.style.backgroundImage = `var(${t})`;
    document.body.appendChild(probe);
    const v = getComputedStyle(probe).backgroundImage;
    probe.remove();
    return v;
  }, token);

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
});

test.describe('COM-AC16 第一次開啟與切換（COM-R17）', () => {
  test('第一次開啟是淺色：<html> 沒有 data-theme，背景與文字是淺色的 --background、--foreground', async ({ page }) => {
    await openSeating(page);
    await expectPageTheme(page, 'light');
  });

  test('Header 有「介面配色」鈕（Icon Button、palette 圖示）；選單最上面是 Text-xs 淡色標題「介面配色」，下面依序是「淺色」（打勾）「深色」', async ({
    page,
  }) => {
    await openSeating(page);
    await expect(visibleHeader(page).getByRole('button', { name: THEME_LABEL, exact: true })).toBeVisible();
    await expect(themeButton(page).locator('svg path[d^="M12 22a1 1 0 0 1 0-20"]')).toHaveCount(1);

    const menu = await openThemeMenu(page);
    const heading = menu.getByText(THEME_LABEL, { exact: true });
    await expect(heading).toBeVisible();
    const items = menu.getByRole('menuitemradio');
    await expect(items).toHaveCount(2);
    expect((await items.allInnerTexts()).map((t) => t.trim())).toEqual(['淺色', '深色']);
    await expect(menu.getByRole('menuitem')).toHaveCount(0);
    // 標題在項目上面、淡色（--muted-foreground）、Text-xs/Regular
    const headingBox = await boxOf('選單標題', heading);
    const firstBox = await boxOf('第一個項目', items.first());
    expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(firstBox.y + 1);
    expect((await lookOf(heading)).color).toBe(themeTokenHex('light', '--muted-foreground'));
    const font = await heading.evaluate((el) => {
      const probe = document.createElement('div');
      probe.style.font = 'var(--text-xs-regular)';
      document.body.appendChild(probe);
      const want = getComputedStyle(probe);
      const got = getComputedStyle(el);
      const result = { size: got.fontSize, weight: got.fontWeight, wantSize: want.fontSize, wantWeight: want.fontWeight };
      probe.remove();
      return result;
    });
    expect([font.size, font.weight]).toEqual([font.wantSize, font.wantWeight]);

    // 第一次開啟：淺色打勾，打勾在名稱右邊；深色沒有打勾
    await expect(themeItem(page, 'light')).toHaveAttribute('aria-checked', 'true');
    await expect(themeItem(page, 'dark')).toHaveAttribute('aria-checked', 'false');
    await expect(checkIcon(themeItem(page, 'light'))).toBeVisible();
    await expect(checkIcon(themeItem(page, 'dark'))).toBeHidden();
    const label = await boxOf('「淺色」文字', themeItem(page, 'light').getByText('淺色', { exact: true }));
    const check = await boxOf('打勾', checkIcon(themeItem(page, 'light')));
    expect(check.x).toBeGreaterThanOrEqual(label.x + label.width - 1);
  });

  test('每個項目有 16 px 的圓形色塊：淺色用 --theme-swatch-vivid、深色用 --theme-swatch-dark', async ({ page }) => {
    await openSeating(page);
    await openThemeMenu(page);
    const swatches: [ThemeName, string][] = [
      ['light', '--theme-swatch-vivid'],
      ['dark', '--theme-swatch-dark'],
    ];
    for (const [theme, token] of swatches) {
      const want = await tokenBackgroundImage(page, token);
      expect(want, `${token} 要有值`).not.toBe('none');
      const swatch = await themeItem(page, theme).evaluate((el, image) => {
        const hit = Array.from(el.querySelectorAll('*')).find((n) => getComputedStyle(n).backgroundImage === image);
        if (!hit) return null;
        const r = hit.getBoundingClientRect();
        return { width: r.width, height: r.height, radius: getComputedStyle(hit).borderTopLeftRadius };
      }, want);
      expect(swatch, `${theme} 的項目裡找不到 ${token} 的色塊`).not.toBeNull();
      expect(Math.abs((swatch?.width ?? 0) - 16)).toBeLessThanOrEqual(0.5);
      expect(Math.abs((swatch?.height ?? 0) - 16)).toBeLessThanOrEqual(0.5);
      const radius = swatch?.radius ?? '0px';
      expect(radius.endsWith('%') ? parseFloat(radius) >= 50 : parseFloat(radius) >= 8, `圓角 ${radius}`).toBe(true);
    }
  });

  test('選「深色」→ 不重新整理、不呼叫 API，整個畫面立即換成深色；選單關閉、焦點回到按鈕；Sonner「已切換為深色。」', async ({
    page,
  }) => {
    await openSeating(page);
    await page.evaluate(() => {
      (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
    });
    let navigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });
    // 選擇只記在這個瀏覽器（COM-R18、architecture 11.3：不存資料庫）；登入狀態的檢查（/api/auth）不算
    const apiCalls: string[] = [];
    page.on('request', (req) => {
      const { pathname } = new URL(req.url());
      if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) apiCalls.push(`${req.method()} ${pathname}`);
    });

    await openThemeMenu(page);
    await themeItem(page, 'dark').click();

    await expect(themeMenu(page)).toHaveCount(0);
    await expect(themeButton(page)).toBeFocused();
    await expect(toastWith(page, SWITCHED.dark)).toBeVisible();
    await expect(toastWith(page, SWITCHED.light)).toHaveCount(0);
    await expectPageTheme(page, 'dark');
    expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
    expect(navigations).toBe(0);
    expect(apiCalls).toEqual([]);
  });

  test('切成深色後再開選單「深色」打勾；選「淺色」→ 換回淺色（移除 data-theme），選單關閉、焦點回到按鈕，Sonner「已切換為淺色。」', async ({
    page,
  }) => {
    await openSeating(page);
    await chooseTheme(page, 'dark');
    await expectPageTheme(page, 'dark');

    await openThemeMenu(page);
    await expect(themeItem(page, 'dark')).toHaveAttribute('aria-checked', 'true');
    await expect(themeItem(page, 'light')).toHaveAttribute('aria-checked', 'false');
    await expect(checkIcon(themeItem(page, 'dark'))).toBeVisible();
    await expect(checkIcon(themeItem(page, 'light'))).toBeHidden();
    await themeItem(page, 'light').click();

    await expect(themeMenu(page)).toHaveCount(0);
    await expect(themeButton(page)).toBeFocused();
    await expect(toastWith(page, SWITCHED.light)).toBeVisible();
    await expectPageTheme(page, 'light');
  });

  test('配色只換顏色：切換成深色前後，主要元素的位置與大小、內容區的文字都相同（COM-R18）', async ({ page }) => {
    await openSeating(page);
    const snapshot = async () => ({
      text: await page.getByRole('main').innerText(),
      heading: await page.getByRole('heading', { level: 1, name: '座位安排' }).boundingBox(),
      palette: await themeButton(page).boundingBox(),
      save: await saveStatus(page).boundingBox(),
      main: await page.getByRole('main').boundingBox(),
    });
    const before = await snapshot();
    await chooseTheme(page, 'dark');
    await expectPageTheme(page, 'dark');
    expect(await snapshot()).toEqual(before);
  });

  test('鍵盤：聚焦按鈕按 Enter 開啟選單，方向鍵移到「深色」按 Enter → 換成深色、焦點回到按鈕；再開選單按 Esc → 關閉、配色不變', async ({
    page,
  }) => {
    await openSeating(page);
    await themeButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(themeMenu(page)).toBeVisible();
    await arrowToItem(page, 'dark');
    await page.keyboard.press('Enter');

    await expect(themeMenu(page)).toHaveCount(0);
    await expect(themeButton(page)).toBeFocused();
    await expect(toastWith(page, SWITCHED.dark)).toBeVisible();
    await expectPageTheme(page, 'dark');

    await page.keyboard.press('Enter');
    await expect(themeMenu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(themeMenu(page)).toHaveCount(0);
    await expect(themeButton(page)).toBeFocused();
    await expectPageTheme(page, 'dark');
  });
});

test.describe('桌面 Header 與 Sidebar（第 5 節）', () => {
  test.beforeEach(async ({ page }) => {
    desktopOnly(page);
  });

  test('Header 右側依序是介面配色鈕與儲存狀態，左側是 Sidebar 切換鈕；滑過介面配色鈕顯示 Tooltip「介面配色」', async ({ page }) => {
    await openSeating(page);
    await expect(themeButton(page)).toHaveCount(1);
    await expect(saveStatus(page)).toHaveCount(1);
    const toggle = await boxOf('Sidebar 切換鈕', page.getByRole('button', { name: '收合或展開側選單' }));
    const palette = await boxOf('介面配色鈕', themeButton(page));
    const save = await boxOf('儲存狀態', saveStatus(page));
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('量不到視窗大小');

    expect(palette.x).toBeGreaterThan(toggle.x + toggle.width);
    expect(palette.x).toBeGreaterThan(viewport.width / 2);
    expect(palette.x + palette.width).toBeLessThanOrEqual(save.x + 1);
    expect(Math.abs(palette.y + palette.height / 2 - (save.y + save.height / 2))).toBeLessThanOrEqual(8);

    await themeButton(page).hover();
    await expect(page.getByRole('tooltip').first()).toContainText(THEME_LABEL);
  });

  test('選單對齊按鈕右緣、開在按鈕下方，完整顯示在視窗內', async ({ page }) => {
    await openSeating(page);
    const menu = await openThemeMenu(page);
    const button = await boxOf('介面配色鈕', themeButton(page));
    const box = await boxOf('選單', menu);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('量不到視窗大小');

    expect(Math.abs(box.x + box.width - (button.x + button.width))).toBeLessThanOrEqual(1);
    expect(box.y).toBeGreaterThanOrEqual(button.y + button.height - 1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  });

  test('COM-AC16：選「深色」→ Sidebar 的 Logo 換成白色版（logo-light.svg）、Sidebar 底色是深色的 --sidebar；選回「淺色」→ logo-dark.svg', async ({
    page,
  }) => {
    await openSeating(page);
    const sidebar = desktopSidebar(page);
    await expect(visibleLogo(sidebar)).toHaveCount(1);
    await expect(visibleLogo(sidebar)).toHaveAttribute('src', /logo-dark\.svg/);

    await chooseTheme(page, 'dark');
    await expect(visibleLogo(sidebar)).toHaveCount(1);
    await expect(visibleLogo(sidebar)).toHaveAttribute('src', /logo-light\.svg/);
    await expect
      .poll(() => visibleLogo(sidebar).evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))
      .toBe(true);
    await expect.poll(async () => (await lookOf(sidebar)).background).toBe(themeTokenHex('dark', '--sidebar'));

    await chooseTheme(page, 'light');
    await expect(visibleLogo(sidebar)).toHaveCount(1);
    await expect(visibleLogo(sidebar)).toHaveAttribute('src', /logo-dark\.svg/);
  });

  test('視窗 1023 px（Sidebar 收合為 48 px）：深色時收合的符號是白色版（symbol-light.svg），淺色時是 symbol-dark.svg', async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    await openSeating(page);
    const sidebar = desktopSidebar(page);
    await expect(visibleLogo(sidebar)).toHaveAttribute('src', /symbol-dark\.svg/);

    await chooseTheme(page, 'dark');
    await expect(visibleLogo(sidebar)).toHaveCount(1);
    await expect(visibleLogo(sidebar)).toHaveAttribute('src', /symbol-light\.svg/);
  });
});

test.describe('手機 Mobile Header 與 Drawer（第 5 節、COM-AC19）', () => {
  test.beforeEach(async ({ page }) => {
    mobileOnly(page);
  });

  test('視窗 320 px：Mobile Header 也有介面配色鈕，右側依序是介面配色鈕與儲存狀態，左側是選單鈕', async ({ page }) => {
    await openSeating(page);
    await expect(themeButton(page)).toHaveCount(1);
    await expect(visibleHeader(page).getByRole('button', { name: THEME_LABEL, exact: true })).toBeVisible();
    const menuButton = await boxOf('選單鈕', page.getByRole('button', { name: '開啟選單' }));
    const palette = await boxOf('介面配色鈕', themeButton(page));
    const save = await boxOf('儲存狀態', saveStatus(page));

    expect(palette.x).toBeGreaterThan(menuButton.x + menuButton.width);
    expect(palette.x + palette.width).toBeLessThanOrEqual(save.x + 1);
    // 在固定於頂部、約 48 px 高的 Mobile Header 裡
    expect(palette.y).toBeGreaterThanOrEqual(0);
    expect(palette.y + palette.height).toBeLessThanOrEqual(48 + 1);
    await expectNoHorizontalScroll(page);
  });

  test('視窗 320 px：選單完整顯示在視窗內、沒有被裁切，也沒有整頁水平捲動；選「深色」→ 換成深色', async ({ page }) => {
    await openSeating(page);
    const menu = await openThemeMenu(page);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('量不到視窗大小');
    const box = await boxOf('選單', menu);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    for (const theme of ['light', 'dark'] as const) {
      const item = await boxOf(`「${theme}」項目`, themeItem(page, theme));
      expect(item.x).toBeGreaterThanOrEqual(box.x - 0.5);
      expect(item.x + item.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
      expect(item.y + item.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
      await expect(themeItem(page, theme)).toBeInViewport({ ratio: 1 });
    }
    await expectNoHorizontalScroll(page);

    await themeItem(page, 'dark').click();
    await expect(themeMenu(page)).toHaveCount(0);
    await expect(themeButton(page)).toBeFocused();
    await expect(toastWith(page, SWITCHED.dark)).toBeVisible();
    await expectPageTheme(page, 'dark');
    await expectNoHorizontalScroll(page);
  });

  test('深色時開啟 Drawer → Logo 是白色版（logo-light.svg）；淺色時是 logo-dark.svg', async ({ page }) => {
    await openSeating(page);
    await page.getByRole('button', { name: '開啟選單' }).click();
    await expect(visibleLogo(drawer(page))).toHaveCount(1);
    await expect(visibleLogo(drawer(page))).toHaveAttribute('src', /logo-dark\.svg/);
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toHaveCount(0);

    await chooseTheme(page, 'dark');
    await page.getByRole('button', { name: '開啟選單' }).click();
    await expect(visibleLogo(drawer(page))).toHaveCount(1);
    await expect(visibleLogo(drawer(page))).toHaveAttribute('src', /logo-light\.svg/);
    await expect
      .poll(() =>
        visibleLogo(drawer(page)).evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0),
      )
      .toBe(true);
  });
});

test.describe('COM-AC18 作業系統是深色模式（COM-R18：不跟著作業系統）', () => {
  test.use({ colorScheme: 'dark' });

  test('這個瀏覽器沒選過 → 開啟座位安排是淺色；選單「淺色」打勾', async ({ page }) => {
    await openSeating(page);
    expect(await page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
    await expectPageTheme(page, 'light');
    await openThemeMenu(page);
    await expect(themeItem(page, 'light')).toHaveAttribute('aria-checked', 'true');
    await expect(themeItem(page, 'dark')).toHaveAttribute('aria-checked', 'false');
  });

  test('沒登入開登入頁 → 也是淺色', async ({ page, context }) => {
    await context.clearCookies();
    await gotoPage(page, '/login', '用公司帳號登入');
    expect(await page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
    await expectPageTheme(page, 'light');
  });

  test('選了「深色」才是深色；選回「淺色」後重新整理仍是淺色', async ({ page }) => {
    await openSeating(page);
    await chooseTheme(page, 'dark');
    await expectPageTheme(page, 'dark');
    await chooseTheme(page, 'light');
    await expectPageTheme(page, 'light');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expectPageTheme(page, 'light');
  });
});
