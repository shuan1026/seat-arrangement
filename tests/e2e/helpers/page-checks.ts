// E2E 共用的檢查。
import { expect, type Page } from '@playwright/test';

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
