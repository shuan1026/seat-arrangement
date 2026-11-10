// 介面配色（D-020）E2E 的定位、操作與檢查。一律用使用者看得到的角色、無障礙名稱與文字定位，不依賴 class 或 test id。
// 規格：docs/spec/README.md 第 5 節、COM-R17、COM-R18、第 14 節「介面配色」；docs/architecture.md 第 11.3 節。
//
// 假設的結構（實作請照做）：
// - 介面配色鈕：button「介面配色」，在 Header（<header>，role banner）裡；桌面與 Mobile Header 各一個，同一時間只看得到一個。
// - 選單：role menu，最上面是文字「介面配色」，兩個 menuitemradio「淺色」「深色」，目前的配色 aria-checked="true" 並有 lucide check 圖示。
// - Sonner 依 src/components/ui/toaster.tsx：region「通知 …」裡的 listitem。
// - Logo 是 <img alt="Seat Arrangement">（同目前的 sidebar-content.tsx）；看不到的那一版不能「看得到」（display:none 或不渲染）。
//
// 顏色一律在瀏覽器裡用 canvas 換算成 '#RRGGBB'（Chrome 會把 color-mix 的結果寫成 color(srgb …)，不能直接比字串），
// 預期值由 tests/helpers/theme-tokens.ts 從 src/styles/tokens.css 算出。
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { themeTokenHex, type ThemeName } from '../../helpers/theme-tokens';

export type { ThemeName };

export const THEME_LABEL = '介面配色';
export const THEME_NAME: Record<ThemeName, '淺色' | '深色'> = { light: '淺色', dark: '深色' };
export const SWITCHED: Record<ThemeName, string> = { light: '已切換為淺色。', dark: '已切換為深色。' };
/** lucide check 圖示的 path（目前的配色右邊打勾） */
export const CHECK_PATH = 'M20 6 9 17l-5-5';
export const LOGO_ALT = 'Seat Arrangement';

// ---- 定位

/** 看得到的介面配色鈕（桌面 Header 或 Mobile Header 的那一個） */
export const themeButton = (page: Page) =>
  page.getByRole('button', { name: THEME_LABEL, exact: true }).filter({ visible: true });
/** 所有介面配色鈕（含看不到的） */
export const anyThemeButton = (page: Page) => page.getByRole('button', { name: THEME_LABEL, exact: true });
/** 看得到的 Header */
export const visibleHeader = (page: Page) => page.getByRole('banner').filter({ visible: true });
/** 介面配色選單 */
export const themeMenu = (page: Page) => page.getByRole('menu').filter({ has: page.getByRole('menuitemradio') });
export const themeItem = (page: Page, theme: ThemeName) =>
  themeMenu(page).getByRole('menuitemradio', { name: THEME_NAME[theme], exact: true });
/** 項目裡的打勾圖示 */
export const checkIcon = (item: Locator) => item.locator(`svg:has(path[d="${CHECK_PATH}"])`);
/** 桌面 Sidebar（有主要導覽的 complementary） */
export const desktopSidebar = (page: Page) =>
  page.getByRole('complementary').filter({ has: page.getByRole('navigation', { name: '主要導覽' }) });
/** 手機的 Drawer */
export const drawer = (page: Page) => page.getByRole('dialog', { name: '主要導覽' });
/** 看得到的 Logo（完整 Logo 或收合時的符號） */
export const visibleLogo = (scope: Locator) => scope.getByRole('img', { name: LOGO_ALT }).filter({ visible: true });
export const toasts = (page: Page) => page.getByRole('region', { name: /^通知/ }).getByRole('listitem');
export const toastWith = (page: Page, text: string) => toasts(page).filter({ hasText: text });

// ---- 開頁與操作

/** 開啟頁面並等 H1 出現 */
export async function gotoPage(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

export async function openThemeMenu(page: Page): Promise<Locator> {
  await themeButton(page).click();
  const menu = themeMenu(page);
  await expect(menu).toBeVisible();
  return menu;
}

/** 從介面配色選單選一種配色，等選單關閉 */
export async function chooseTheme(page: Page, theme: ThemeName) {
  await openThemeMenu(page);
  await themeItem(page, theme).click();
  await expect(themeMenu(page)).toHaveCount(0);
}

/** 選單開著時，用方向鍵把焦點移到某個項目（最多按 3 次） */
export async function arrowToItem(page: Page, theme: ThemeName) {
  const item = themeItem(page, theme);
  for (let i = 0; i < 3; i++) {
    if (await item.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('ArrowDown');
  }
  await expect(item).toBeFocused();
}

// ---- 顏色

/** <html> 的 data-theme（沒有屬性是 null） */
export const htmlTheme = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));

/** 任何 CSS 顏色換成 '#RRGGBB'（不透明時）與透明度 */
export async function cssColorHex(page: Page, css: string): Promise<{ hex: string; alpha: number }> {
  return page.evaluate((value) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('瀏覽器沒有 canvas 2D');
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const hex = `#${[d[0] ?? 0, d[1] ?? 0, d[2] ?? 0].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    return { hex, alpha: (d[3] ?? 0) / 255 };
  }, css);
}

export type PageColors = {
  theme: string | null;
  colorScheme: string;
  htmlBackground: string;
  bodyBackground: string;
  bodyColor: string;
};

/** 整頁的配色狀態：<html data-theme>、color-scheme、<html> 與 <body> 的背景、<body> 的文字色 */
export async function pageColors(page: Page): Promise<PageColors> {
  const raw = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      colorScheme: html.colorScheme,
      htmlBackground: html.backgroundColor,
      bodyBackground: body.backgroundColor,
      bodyColor: body.color,
    };
  });
  return {
    theme: raw.theme,
    colorScheme: raw.colorScheme,
    htmlBackground: (await cssColorHex(page, raw.htmlBackground)).hex,
    bodyBackground: (await cssColorHex(page, raw.bodyBackground)).hex,
    bodyColor: (await cssColorHex(page, raw.bodyColor)).hex,
  };
}

/** 這個配色下整頁應有的樣子：深色有 data-theme="dark"、淺色沒有 data-theme；背景與文字是該配色的 --background、--foreground */
export const expectedPageColors = (theme: ThemeName): PageColors => ({
  theme: theme === 'dark' ? 'dark' : null,
  colorScheme: theme,
  htmlBackground: themeTokenHex(theme, '--background'),
  bodyBackground: themeTokenHex(theme, '--background'),
  bodyColor: themeTokenHex(theme, '--foreground'),
});

/** 整頁是這個配色（等轉場結束） */
export async function expectPageTheme(page: Page, theme: ThemeName) {
  await expect.poll(() => pageColors(page), { message: `整頁應是${THEME_NAME[theme]}` }).toEqual(expectedPageColors(theme));
}

export type Look = {
  /** 文字色疊在底色上的結果 */
  color: string;
  /** 從元素往上疊到第一個不透明底色的結果 */
  background: string;
  /** 文字與底色的對比 */
  ratio: number;
  /** 元素與祖先的透明度相乘 */
  opacity: number;
};

/**
 * 元素（或 scope 裡自己的文字正好是 text 的元素）的文字色、實際底色與對比。
 * 底色由元素往上，把半透明的底色一層層疊到第一個不透明的底色上。
 */
export async function lookOf(scope: Locator, text?: string): Promise<Look> {
  return scope.first().evaluate((root, wanted) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('瀏覽器沒有 canvas 2D');
    type C = [number, number, number, number];
    const parse = (css: string): C => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0)';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
    };
    const over = (top: C, bottom: C): C => {
      const a = top[3] + bottom[3] * (1 - top[3]);
      if (a <= 0) return [0, 0, 0, 0];
      const ch = (i: 0 | 1 | 2) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
      return [ch(0), ch(1), ch(2), a];
    };
    const lum = (c: C) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const hex = (c: C) =>
      `#${[c[0], c[1], c[2]].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

    let el: Element | null = root;
    if (wanted !== null) {
      el =
        [root, ...Array.from(root.querySelectorAll('*'))].find((e) =>
          Array.from(e.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() === wanted),
        ) ?? null;
      if (!el) throw new Error(`找不到文字「${wanted}」`);
    }
    let opacity = 1;
    const layers: C[] = [];
    let opaque = false;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      opacity *= Number(s.opacity);
      if (opaque) continue;
      const bg = parse(s.backgroundColor);
      if (bg[3] > 0) layers.push(bg);
      if (bg[3] >= 0.999) opaque = true;
    }
    let base: C = [255, 255, 255, 1];
    for (const layer of layers.reverse()) base = over(layer, base);
    const color = over(parse(getComputedStyle(el).color), base);
    const [hi, lo] = [lum(color), lum(base)].sort((a, b) => b - a) as [number, number];
    return {
      color: hex(color),
      background: hex(base),
      ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
      opacity,
    };
  }, text ?? null);
}

export type LowContrast = { text: string; color: string; background: string; ratio: number };

/**
 * scope 裡看得到的文字中，和實際底色對比低於 min 的（「文字與背景都看得清楚」，COM-AC19）。
 * 略過：看不到的、1 px 以下（只給螢幕閱讀器的文字）、半透明（轉場中或停用的淡化）、底下有圖片或漸層而算不出底色的。
 */
export async function lowContrastTexts(scope: Locator, min = 3): Promise<LowContrast[]> {
  return scope.first().evaluate(
    (root, minRatio) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('瀏覽器沒有 canvas 2D');
      type C = [number, number, number, number];
      const parse = (css: string): C => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
      };
      const over = (top: C, bottom: C): C => {
        const a = top[3] + bottom[3] * (1 - top[3]);
        if (a <= 0) return [0, 0, 0, 0];
        const ch = (i: 0 | 1 | 2) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
        return [ch(0), ch(1), ch(2), a];
      };
      const lum = (c: C) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      };
      const hex = (c: C) =>
        `#${[c[0], c[1], c[2]].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

      const out: { text: string; color: string; background: string; ratio: number }[] = [];
      for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
        if (!(el instanceof HTMLElement)) continue;
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join('')
          .trim();
        if (!own) continue;
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;

        let opacity = 1;
        const layers: C[] = [];
        let opaque = false;
        let unknown = false;
        for (let n: Element | null = el; n; n = n.parentElement) {
          const s = getComputedStyle(n);
          opacity *= Number(s.opacity);
          if (opaque) continue;
          if (s.backgroundImage !== 'none') unknown = true;
          const bg = parse(s.backgroundColor);
          if (bg[3] > 0) layers.push(bg);
          if (bg[3] >= 0.999) opaque = true;
        }
        if (unknown || opacity < 0.99) continue;
        const textColor = parse(getComputedStyle(el).color);
        if (textColor[3] === 0) continue;

        let base: C = [255, 255, 255, 1];
        for (const layer of layers.reverse()) base = over(layer, base);
        const color = over(textColor, base);
        const [hi, lo] = [lum(color), lum(base)].sort((a, b) => b - a) as [number, number];
        const ratio = (hi + 0.05) / (lo + 0.05);
        if (ratio < minRatio) {
          out.push({ text: own.slice(0, 40), color: hex(color), background: hex(base), ratio: Math.round(ratio * 100) / 100 });
        }
      }
      return out;
    },
    min,
  );
}

export type DashedBorder = { border: string; background: string; ratio: number };

/** scope 裡看得到的虛線邊框：邊框色、元素實際底色與兩者的對比（空桌的虛線要和桌次底色分得出來） */
export async function dashedBorders(scope: Locator): Promise<DashedBorder[]> {
  return scope.first().evaluate((root) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('瀏覽器沒有 canvas 2D');
    type C = [number, number, number, number];
    const parse = (css: string): C => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0)';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
    };
    const over = (top: C, bottom: C): C => {
      const a = top[3] + bottom[3] * (1 - top[3]);
      if (a <= 0) return [0, 0, 0, 0];
      const ch = (i: 0 | 1 | 2) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
      return [ch(0), ch(1), ch(2), a];
    };
    const lum = (c: C) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const hex = (c: C) =>
      `#${[c[0], c[1], c[2]].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

    const out: { border: string; background: string; ratio: number }[] = [];
    for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
      const s = getComputedStyle(el);
      if (s.borderTopStyle !== 'dashed' || parseFloat(s.borderTopWidth) <= 0) continue;
      if (!el.checkVisibility({ visibilityProperty: true })) continue;
      const layers: C[] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg[3] > 0) layers.push(bg);
        if (bg[3] >= 0.999) break;
      }
      let base: C = [255, 255, 255, 1];
      for (const layer of layers.reverse()) base = over(layer, base);
      const border = over(parse(s.borderTopColor), base);
      const [hi, lo] = [lum(border), lum(base)].sort((a, b) => b - a) as [number, number];
      out.push({ border: hex(border), background: hex(base), ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100 });
    }
    return out;
  });
}

// ---- 第一次繪製前的狀態

export type FirstFrame = { url: string; theme: string | null; htmlBackground: string };

/**
 * 每一頁（這個 context 開的每一個新文件）在第一次繪製時記下 <html> 的 data-theme 與背景色。
 * 做法：文件一建立（頁面任何程式執行前）就登記 requestAnimationFrame；瀏覽器在「更新畫面」時、繪製之前才呼叫它，
 * 而文件還在解析 <head>、或有阻擋繪製的樣式表沒載完時不會更新畫面（HTML 規格的 render-blocking），
 * 所以這時記下的就是第一次繪製看到的樣子。若 data-theme 要等 React 掛上之後才設，這裡會記到 null（先閃淺色）。
 */
export async function recordFirstFrame(context: BrowserContext) {
  await context.addInitScript(() => {
    requestAnimationFrame(() => {
      const root = document.documentElement;
      (window as unknown as { __themeFirstFrame?: FirstFrame }).__themeFirstFrame = {
        url: location.href,
        theme: root.getAttribute('data-theme'),
        htmlBackground: getComputedStyle(root).backgroundColor,
      };
    });
  });
}

/** 這一頁第一次繪製時已經是這個配色（COM-R18：不會先閃淺色） */
export async function expectFirstFrame(page: Page, theme: ThemeName) {
  const read = () => page.evaluate(() => (window as unknown as { __themeFirstFrame?: FirstFrame }).__themeFirstFrame);
  // 等這一頁（不是開新分頁時的 about:blank）的紀錄；登入頁掛上後會用 replaceState 拿掉網址參數，所以只比路徑
  const pathname = new URL(page.url()).pathname;
  await expect
    .poll(async () => {
      const f = await read();
      return f ? new URL(f.url).pathname : null;
    })
    .toBe(pathname);
  const frame = await read();
  expect(frame?.theme ?? null, '第一次繪製時 <html> 的 data-theme').toBe(theme === 'dark' ? 'dark' : null);
  if (theme === 'dark') {
    const bg = await cssColorHex(page, frame?.htmlBackground ?? 'transparent');
    expect(bg, '第一次繪製時的頁面背景').toEqual({ hex: themeTokenHex('dark', '--background'), alpha: 1 });
  }
}

/** 擋掉頁面的 JavaScript（/_next/static 下的 .js），只留伺服器回傳的 HTML、inline script 與樣式表 */
export async function blockAppScripts(page: Page) {
  await page.route(/\/_next\/static\/.+\.js(\?.*)?$/, (route) => route.abort());
}
