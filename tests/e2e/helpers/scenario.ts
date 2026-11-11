// 階段 3 整體驗證（docs/plan/implementation-plan.md 第 6 節第 2 項）的共用工具：核心情境全流程（scenario-full.spec.ts）與
// 多人衝突（scenario-conflict.spec.ts）。只組合既有的輔助函式，不改它們的行為。
// - resetEverything：從空的資料開始，並把權限名單與發布設定成這支測試要的狀態（不依賴其他測試留下的狀態）。
// - openEditorBrowser：另開一個 browser context（自己的 cookie 與畫面），以另一位使用者登入為編輯者。
// - navigateTo：用左側導覽切換頁面（docs/spec/README.md 第 5 節：只換主畫面，資料不重新載入）。
// - waitForTablePatch：等備註名稱送到伺服器並回應（PATCH /api/tables/{id}，src/contracts/seating.ts）。
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { signIn, type TestUser } from './auth';
import { setEditors, setPublished } from './permissions-db';
import { seed } from './seating-data';

/** 清空員工、參與人員與桌次備註名稱；權限名單正好是這幾位編輯者（依陣列順序加入，沒有檢視者）；座位表未發布 */
export async function resetEverything(editors: readonly string[]): Promise<void> {
  await seed(async () => undefined);
  await setEditors(editors);
  await setPublished(false);
}

/** 另開一個瀏覽器（獨立的 cookie 與 localStorage），以這位使用者登入為編輯者；用完要關掉 context */
export async function openEditorBrowser(
  browser: Browser,
  baseURL: string,
  user: TestUser,
  viewport: { width: number; height: number } | null,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL, viewport: viewport ?? undefined });
  await signIn(context, baseURL, user);
  return { context, page: await context.newPage() };
}

export type NavLabel = '座位安排' | '參與人員' | '員工名單' | '權限';

/** 按左側導覽（桌面）切換頁面，等到那一頁的 H1 出現 */
export async function navigateTo(page: Page, label: NavLabel): Promise<void> {
  const nav = page.getByRole('navigation', { name: '主要導覽' }).filter({ visible: true });
  await nav.getByRole('link', { name: label, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: label, exact: true })).toBeVisible();
}

/** 等這一桌（內部編號）的備註名稱送到伺服器並回應 */
export function waitForTablePatch(page: Page, tableId: number) {
  return page.waitForResponse(
    (r) => new URL(r.url()).pathname === `/api/tables/${tableId}` && r.request().method() === 'PATCH',
  );
}
