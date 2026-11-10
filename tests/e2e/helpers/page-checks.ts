// E2E 共用的檢查。
import { expect, type Locator, type Page } from '@playwright/test';

/** playwright.config.ts 一定有設定 baseURL；signIn 需要它來設定 cookie 的網域 */
export function requireBaseURL(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('playwright.config.ts 沒有設定 baseURL');
  return baseURL;
}

/** 767 px 以下是手機版面（docs/spec/README.md 第 5 節） */
export const isMobileWidth = (page: Page): boolean => (page.viewportSize()?.width ?? 0) <= 767;

/**
 * 整頁沒有水平捲動（docs/spec/README.md 第 9 節、COM-AC11）：
 * 文件寬度不超過視窗寬度，而且往右捲也捲不動。表格與座位圖只在自己的容器內捲動，不算在這裡。
 */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const before = window.scrollX;
    window.scrollTo(10_000, window.scrollY);
    const scrolled = window.scrollX;
    window.scrollTo(before, window.scrollY);
    return { overflow: doc.scrollWidth - doc.clientWidth, scrolled };
  });
  expect(result.overflow, '文件寬度超過視窗寬度').toBeLessThanOrEqual(0);
  expect(result.scrolled, '整頁可以往右捲動').toBe(0);
}

/**
 * 元素裡的文字排成幾行：用 Range 量每一段文字的 client rects（換行時一段文字會有好幾個），
 * 上下重疊超過一半的算同一行。不看元素本身的高度，所以徽章、內距、行高都不影響；
 * 中文被擠成「謝淑／芬」「台／北」時是 2 行，兩個徽章並排是 1 行。量不到文字（不顯示）時是 0。
 */
export async function textLines(locator: Locator): Promise<number> {
  return locator.evaluate((root) => {
    const rects: { top: number; bottom: number }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node.textContent ?? '').trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width > 0 && r.height > 0) rects.push({ top: r.top, bottom: r.bottom });
      }
    }
    rects.sort((a, b) => a.top - b.top);
    const lines: { top: number; bottom: number }[] = [];
    for (const r of rects) {
      const same = lines.find((l) => {
        const overlap = Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top);
        return overlap > Math.min(l.bottom - l.top, r.bottom - r.top) / 2;
      });
      if (!same) lines.push(r);
    }
    return lines.length;
  });
}

/** 文字一行顯示、不換行（D-024） */
export async function expectOneLine(locator: Locator, label: string): Promise<void> {
  await expect(locator, label).toBeVisible();
  const lines = await textLines(locator);
  expect(lines, `${label}：排成 ${lines} 行，應該一行顯示`).toBe(1);
}

/**
 * 表格放不下時只在自己的捲動區（region「{name}」，Data Management 的 Table Rules）裡左右捲動（D-024、README 第 9 節）：
 * 捲動區可以左右捲動（overflow-x 是 auto 或 scroll），左右都在內容區（main）裡；表格整個在捲動區的捲動範圍裡；
 * 表格比捲動區寬時，捲動區真的捲得動；整頁仍不能水平捲動。
 */
export async function expectTableScrollsInside(page: Page, name: string): Promise<void> {
  const region = page.getByRole('region', { name, exact: true });
  await expect(region, `表格的捲動區「${name}」`).toBeVisible();
  const main = await page.getByRole('main').boundingBox();
  if (!main) throw new Error('量不到內容區');
  const r = await region.evaluate((el) => {
    const table = el.querySelector('table');
    const box = el.getBoundingClientRect();
    const before = el.scrollLeft;
    el.scrollLeft = 100_000;
    const scrolled = el.scrollLeft;
    el.scrollLeft = before;
    return {
      overflowX: getComputedStyle(el).overflowX,
      left: box.left,
      right: box.right,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      tableWidth: table ? table.getBoundingClientRect().width : Number.NaN,
      scrolled,
    };
  });
  expect(['auto', 'scroll'], `「${name}」捲動區可以左右捲動（overflow-x：${r.overflowX}）`).toContain(r.overflowX);
  expect(r.left, `「${name}」捲動區的左緣在內容區裡`).toBeGreaterThanOrEqual(main.x - 1);
  expect(r.right, `「${name}」捲動區的右緣在內容區裡`).toBeLessThanOrEqual(main.x + main.width + 1);
  expect(r.tableWidth, `表格（寬 ${r.tableWidth} px）在「${name}」捲動區的捲動範圍裡`).toBeLessThanOrEqual(r.scrollWidth + 1);
  if (r.scrollWidth > r.clientWidth + 1) {
    expect(r.scrolled, `表格比「${name}」捲動區寬，捲動區要捲得動`).toBeGreaterThan(0);
  }
  await expectNoHorizontalScroll(page);
}

/** 在頁面上呼叫 API（帶著這個頁面的 cookie），回傳狀態碼與 JSON 本體 */
export async function fetchFromPage(page: Page, path: string, method = 'GET') {
  return page.evaluate(
    async ({ path, method }) => {
      const res = await fetch(path, {
        method,
        headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : '{}',
      });
      const body: unknown = await res.json().catch(() => null);
      return { status: res.status, body };
    },
    { path, method },
  );
}
