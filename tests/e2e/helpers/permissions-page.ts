// 權限頁、發布對話框、發布頁 /seats 與「只能檢視」E2E 的定位與操作（docs/spec/permissions.md 第 2、4 節；docs/spec/README.md 第 4、5 節、
// 第 14 節）。一律用使用者看得到的角色、無障礙名稱與文字定位，不依賴 class 或 test id。
//
// 假設的無障礙結構（實作請照做）：
// - 導覽：navigation「主要導覽」裡的 link（同 src/components/shell/sidebar-content.tsx）；「權限」連到 /permissions，圖示是 lucide key-round。
// - Header：<header>（role banner）；只能檢視時右側是文字正好「只能檢視」的徽章，在「介面配色」按鈕右邊。
// - 權限頁：H1「權限」；區塊標題「新增編輯者」「編輯者」是 heading；email 欄位是 textbox「email」（標籤）；按鈕「新增編輯者」；
//   每列的 email 是一段文字（正好是 email），「移除」按鈕的無障礙名稱「移除 {email}」；移除確認是 alertdialog。
// - 發布對話框：dialog「發布座位表」，裡面有 checkbox「發布座位表」、文字正好「已發布」或「未發布」的徽章、唯讀的 textbox「連結」、
//   按鈕「複製連結」「關閉」。
// - 發布頁：H1「尾牙座位表」；搜尋框的提示文字「輸入姓名找座位」；搜尋結果每位一行，文字正好是「{顯示名稱}：{桌號} 桌」；
//   座位圖、桌次與工具列和座位安排頁相同（helpers/seating-page.ts 的 region「座位圖」、group「{桌號} 桌」「工作人員桌」、
//   縮小／放大／適合視窗、button「全部展開」／「全部收合」）；開啟時全部展開（D-025）。
//   桌次按鈕的無障礙名稱不含人數：「{桌號} 桌，{備註名稱}，{部門}」（沒有備註名稱時省略那一段），工作人員桌「工作人員桌・{部門}」（PRM-R24、D-025）；
//   桌次名單和桌次詳情相同（region 或 dialog「{桌號} 桌」，名單 list「名單」），沒有人數副標。
import { expect, type Locator, type Page } from '@playwright/test';
import { isMobileWidth } from './page-checks';

export const VIEW_ONLY = '只能檢視';
export const NOT_EDITOR_TOAST = '你沒有編輯權限，已重新載入。';
export const CONFLICT_TOAST = '資料已被其他人更新，已重新載入。';
/** lucide key-round 圖示的 path（docs/spec/README.md 第 5 節：「權限」用 key-round） */
export const KEY_ROUND_PATH = 'M2.586 17.414';
/** lucide check 圖示的 path（已發布的正向徽章） */
export const CHECK_PATH = 'M20 6 9 17l-5-5';

// ---- App Shell

/** 看得到的主要導覽（手機先開 Drawer） */
export async function openNav(page: Page): Promise<Locator> {
  if (isMobileWidth(page)) await page.getByRole('button', { name: '開啟選單' }).click();
  const nav = page.getByRole('navigation', { name: '主要導覽' }).filter({ visible: true });
  await expect(nav).toHaveCount(1);
  return nav;
}

/** 導覽連結的名稱（依畫面順序） */
export async function navNames(nav: Locator): Promise<string[]> {
  const links = nav.getByRole('link');
  const names: string[] = [];
  for (const link of await links.all()) {
    names.push(((await link.getAttribute('aria-label')) ?? (await link.innerText())).trim());
  }
  return names;
}

/** 看得到的 Header */
export const visibleHeader = (page: Page) => page.getByRole('banner').filter({ visible: true });
/** Header 的「只能檢視」徽章 */
export const viewOnlyBadge = (page: Page) => visibleHeader(page).getByText(VIEW_ONLY, { exact: true });
/** Header 的儲存狀態（「已儲存」「儲存中…」「儲存失敗…」） */
export const saveStatusText = (page: Page) => visibleHeader(page).getByText(/^(已儲存|儲存中…|儲存失敗)/);

// ---- 權限頁

export const PERMISSIONS_DESCRIPTION = '編輯者可以修改資料；其他同仁用公司帳號登入後只能檢視。';
export const FIELD_HELP = '編輯者可以修改所有資料，也能管理權限。';
export const LAST_EDITOR_NOTE = '至少要有一位編輯者，最後一位不能移除。';
export const SELF_REMOVE_BODY = '這是你自己的帳號。移除後你只能檢視，不能再修改資料，也不能再開啟這一頁。';

export async function gotoPermissions(page: Page) {
  await page.goto('/permissions');
  await expect(page.getByRole('heading', { level: 1, name: '權限' })).toBeVisible();
}

export const emailField = (page: Page) => page.getByRole('textbox', { name: 'email', exact: true });
export const addEditorButton = (page: Page) => page.getByRole('button', { name: '新增編輯者', exact: true });
export const removeButtons = (page: Page) => page.getByRole('button', { name: /^移除 \S+@\S+$/ });
export const removeButton = (page: Page, email: string) => page.getByRole('button', { name: `移除 ${email}`, exact: true });

/** 清單上的 email（依畫面順序，由「移除 {email}」讀出） */
export async function listedEditors(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const b of await removeButtons(page).all()) {
    const label = (await b.getAttribute('aria-label')) ?? (await b.evaluate((el) => el.textContent ?? ''));
    out.push(label.replace(/^移除\s*/, '').trim());
  }
  return out;
}

/** 清單依序是這幾位：每位的 email 文字由上而下排列，各有「移除 {email}」 */
export async function expectEditorList(page: Page, emails: readonly string[]) {
  await expect(removeButtons(page)).toHaveCount(emails.length);
  let lastY = -Infinity;
  for (const email of emails) {
    await expect(removeButton(page, email)).toBeVisible();
    // 只找內容區：Sidebar 底部的使用者區塊也會顯示登入者的 email
    const text = page.getByRole('main').getByText(email, { exact: true });
    await expect(text).toBeVisible();
    const box = await text.boundingBox();
    if (!box) throw new Error(`量不到 ${email}`);
    expect(box.y, `${email} 的順序`).toBeGreaterThan(lastY);
    lastY = box.y;
  }
}

/** 按某一列的「移除」，回傳確認的 Alert Dialog */
export async function openRemoveConfirm(page: Page, email: string): Promise<Locator> {
  await removeButton(page, email).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** 移除並確認 */
export async function removeAndConfirm(page: Page, email: string) {
  const dialog = await openRemoveConfirm(page, email);
  await dialog.getByRole('button', { name: '移除編輯權限', exact: true }).click();
}

// ---- 發布對話框

export const PUBLISH_DESCRIPTION = '同仁用公司帳號登入後，可以在這個連結查自己的座位。';
export const publishDialog = (page: Page) => page.getByRole('dialog', { name: '發布座位表' });
export const publishCheckbox = (dialog: Locator) => dialog.getByRole('checkbox', { name: '發布座位表' });
export const linkField = (dialog: Locator) => dialog.getByRole('textbox', { name: '連結' });

export async function openPublishDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '發布', exact: true }).click();
  const dialog = publishDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** 勾選框是否打勾（Radix Checkbox 用 aria-checked，原生 input 用 checked） */
export const isChecked = (checkbox: Locator) =>
  checkbox.evaluate((el) => el.getAttribute('aria-checked') === 'true' || (el as HTMLInputElement).checked === true);

// ---- 發布頁

export const SEATS_TITLE = '尾牙座位表';
export const NOT_PUBLISHED = '座位表還沒有發布，請稍後再看。';
export const seatSearch = (page: Page) => page.getByPlaceholder('輸入姓名找座位');
export const resultLine = (page: Page, text: string) => page.getByText(text, { exact: true });
export const notFoundLine = (page: Page, keyword: string) => page.getByText(`找不到「${keyword}」。`, { exact: true });

export async function gotoSeats(page: Page) {
  await page.goto('/seats');
  await expect(page.getByRole('heading', { level: 1, name: SEATS_TITLE })).toBeVisible();
}

/** 在頁面上送出 JSON 請求（帶著這個頁面的 cookie），回傳狀態碼與 JSON 本體 */
export async function sendJson(page: Page, path: string, method: string, body: unknown) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: res.status, body: (await res.json().catch(() => null)) as unknown };
    },
    { path, method, body },
  );
}

/** 這個頁面送出的寫入請求（POST、PUT、PATCH、DELETE 到 /api）；只能檢視時應該一個都沒有 */
export function recordWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method())) writes.push(`${req.method()} ${url.pathname}`);
  });
  return writes;
}
