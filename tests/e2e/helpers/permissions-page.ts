// 權限頁、「沒有權限」頁、發布對話框、發布頁 /seats 與「只能檢視」E2E 的定位與操作（docs/spec/permissions.md 第 2、4 節；
// docs/spec/README.md 第 4、5 節、第 8.1 節、第 14 節）。一律用使用者看得到的角色、無障礙名稱與文字定位，不依賴 class 或 test id。
//
// 假設的無障礙結構（實作請照做）：
// - 導覽：navigation「主要導覽」裡的 link（同 src/components/shell/sidebar-content.tsx）；「權限」連到 /permissions，圖示是 lucide key-round。
// - Header：<header>（role banner）；檢視者的 Header 右側是文字正好「只能檢視」的徽章，在「介面配色」按鈕右邊。
// - 權限頁（D-026）：H1「權限」；區塊標題「新增帳號」「帳號」是 heading；email 欄位是 textbox「email」（標籤）；
//   「權限」選單是 src/components/ui/select.tsx 的 combobox（標籤「權限」，顯示目前選的「檢視者」或「編輯者」），選項在 listbox 的 option；
//   按鈕「新增」；每列的 email 是一段文字（正好是 email），權限選單是 combobox「{email} 的權限」（顯示目前的權限），
//   「移除」按鈕的無障礙名稱「移除 {email}」；改為檢視者與移除的確認是 alertdialog（確認鈕「改為檢視者」「移除權限」）。
// - 「沒有權限」頁（D-026）：不套 App Shell（沒有 banner、complementary、navigation）；Logo 是 <img alt="Seat Arrangement">；
//   H1「你沒有檢視權限」、說明、文字「目前登入：{email}」、link「查看座位表」（連到 /seats）、button「登出」。
// - 發布對話框：dialog「發布座位表」，裡面有 checkbox「發布座位表」、文字正好「已發布」或「未發布」的徽章、唯讀的 textbox「連結」、
//   按鈕「複製連結」「關閉」。
// - 發布頁：H1「尾牙座位表」；搜尋框的提示文字「輸入姓名找座位」；搜尋結果每位一行，文字正好是「{顯示名稱}：{桌號} 桌」；
//   座位圖、桌次與工具列和座位安排頁相同（helpers/seating-page.ts 的 region「座位圖」、group「{桌號} 桌」「工作人員桌」、
//   縮小／放大／適合視窗、button「全部展開」／「全部收合」）；開啟時全部展開（D-025）。
//   桌次按鈕的無障礙名稱不含人數：「{桌號} 桌，{備註名稱}，{部門}」（沒有備註名稱時省略那一段），工作人員桌「工作人員桌・{部門}」（PRM-R24、D-025）；
//   桌次名單和桌次詳情相同（region 或 dialog「{桌號} 桌」，名單 list「名單」），沒有人數副標。
import { expect, type Locator, type Page } from '@playwright/test';
import { isMobileWidth } from './page-checks';
import type { Role } from './permissions-db';

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

// ---- 權限頁（docs/spec/permissions.md 第 2.1 節、第 4.1 節）

export const ROLE_LABEL: Record<Role, '編輯者' | '檢視者'> = { EDITOR: '編輯者', VIEWER: '檢視者' };
export const PERMISSIONS_DESCRIPTION =
  '編輯者可以修改所有資料，也能管理權限；檢視者可以看座位安排、參與人員、員工名單，也能匯出座位表。其他同仁只能看發布的座位表。';
export const LAST_EDITOR_NOTE = '至少要有一位編輯者，最後一位不能移除，也不能改為檢視者。';
export const SELF_REMOVE_BODY = '這是你自己的帳號。移除後你看不到排座資料，只能看發布的座位表，也不能再開啟這一頁。';
export const SELF_DEMOTE_BODY = '這是你自己的帳號。改了之後你只能檢視，不能再修改資料，也不能再開啟這一頁。';
export const removeTitle = (email: string) => `要移除 ${email} 的權限嗎？`;
export const removeBody = (email: string) => `移除後 ${email} 看不到排座資料，只能看發布的座位表。`;
export const demoteTitle = (email: string) => `要把 ${email} 改為檢視者嗎？`;
export const demoteBody = (email: string) => `改了之後 ${email} 只能檢視，不能再修改資料。`;
export const addedToast = (email: string, role: Role) => `已把 ${email} 設為${ROLE_LABEL[role]}。`;
export const changedToast = (email: string, role: Role) => `已把 ${email} 改為${ROLE_LABEL[role]}。`;
export const removedToast = (email: string) => `已移除 ${email} 的權限。`;
export const alreadyMessage = (email: string, role: Role) => `${email} 已經是${ROLE_LABEL[role]}。`;

export async function gotoPermissions(page: Page) {
  await page.goto('/permissions');
  await expect(page.getByRole('heading', { level: 1, name: '權限', exact: true })).toBeVisible();
}

export const emailField = (page: Page) => page.getByRole('textbox', { name: 'email', exact: true });
/** 「新增帳號」區塊的「權限」選單 */
export const addRoleSelect = (page: Page) => page.getByRole('combobox', { name: '權限', exact: true });
export const addButton = (page: Page) => page.getByRole('button', { name: '新增', exact: true });
/** 清單那一列的權限選單 */
export const roleSelect = (page: Page, email: string) => page.getByRole('combobox', { name: `${email} 的權限`, exact: true });
export const removeButtons = (page: Page) => page.getByRole('button', { name: /^移除 \S+@\S+$/ });
export const removeButton = (page: Page, email: string) => page.getByRole('button', { name: `移除 ${email}`, exact: true });
/** 清單上那一列的 email 文字（只找內容區：Sidebar 底部的使用者區塊也會顯示登入者的 email） */
export const rowEmail = (page: Page, email: string) => page.getByRole('main').getByText(email, { exact: true });

/** 打開一個權限選單，選一個選項，等選單關閉 */
export async function chooseRole(page: Page, select: Locator, label: '編輯者' | '檢視者') {
  await select.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await listbox.getByRole('option', { name: label, exact: true }).click();
  await expect(listbox).toBeHidden();
}

/** 打開一個權限選單，讀出全部選項後關閉 */
export async function roleOptions(page: Page, select: Locator): Promise<string[]> {
  await select.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const texts = (await listbox.getByRole('option').allTextContents()).map((t) => t.trim());
  await page.keyboard.press('Escape');
  await expect(listbox).toBeHidden();
  return texts;
}

/** 在「新增帳號」區塊輸入 email、選權限（不給時維持預設）、按「新增」 */
export async function addMember(page: Page, email: string, role?: Role) {
  if (role) await chooseRole(page, addRoleSelect(page), ROLE_LABEL[role]);
  await emailField(page).fill(email);
  await addButton(page).click();
}

/** 清單依序是這幾位：每位的 email 文字由上而下排列，權限選單顯示各自的權限，各有「移除 {email}」 */
export async function expectMemberList(page: Page, members: readonly { email: string; role: Role }[]) {
  await expect(removeButtons(page)).toHaveCount(members.length);
  await expect(page.getByRole('combobox', { name: /^\S+@\S+ 的權限$/ })).toHaveCount(members.length);
  let lastY = -Infinity;
  for (const m of members) {
    await expect(removeButton(page, m.email)).toBeVisible();
    await expect(roleSelect(page, m.email)).toHaveText(ROLE_LABEL[m.role]);
    const text = rowEmail(page, m.email);
    await expect(text).toBeVisible();
    const box = await text.boundingBox();
    if (!box) throw new Error(`量不到 ${m.email}`);
    expect(box.y, `${m.email} 的順序`).toBeGreaterThan(lastY);
    lastY = box.y;
  }
}

/** 這一列的權限選單與「移除」是否停用 */
export async function rowDisabled(page: Page, email: string): Promise<{ select: boolean; remove: boolean }> {
  const disabled = (loc: Locator) => loc.evaluate((el) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true');
  return { select: await disabled(roleSelect(page, email)), remove: await disabled(removeButton(page, email)) };
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
  await dialog.getByRole('button', { name: '移除權限', exact: true }).click();
}

/** 在某一列的權限選單選「檢視者」，回傳確認的 Alert Dialog */
export async function openDemoteConfirm(page: Page, email: string): Promise<Locator> {
  await chooseRole(page, roleSelect(page, email), '檢視者');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** 改為檢視者並確認 */
export async function demoteAndConfirm(page: Page, email: string) {
  const dialog = await openDemoteConfirm(page, email);
  await dialog.getByRole('button', { name: '改為檢視者', exact: true }).click();
}

// ---- 「沒有權限」頁（docs/spec/README.md 第 8.1 節、AUTH-R16、第 14 節）

export const NO_ACCESS_TITLE = '你沒有檢視權限';
export const NO_ACCESS_DESCRIPTION = '需要查看排座資料的話，請聯絡承辦人把你的帳號加入權限頁。加入後重新整理這一頁就能看到。';
export const currentAccount = (email: string) => `目前登入：${email}`;
export const noAccessHeading = (page: Page) => page.getByRole('heading', { level: 1, name: NO_ACCESS_TITLE });
export const seatsLink = (page: Page) => page.getByRole('link', { name: '查看座位表', exact: true });
export const signOutButton = (page: Page) => page.getByRole('button', { name: '登出', exact: true });

/** 畫面是「沒有權限」頁：標題、說明、目前登入的 email、「查看座位表」「登出」；沒有 Sidebar、Header、導覽與介面配色鈕 */
export async function expectNoAccessPage(page: Page, email: string) {
  await expect(noAccessHeading(page)).toBeVisible();
  await expect(page.getByText(NO_ACCESS_DESCRIPTION, { exact: true })).toBeVisible();
  await expect(page.getByText(currentAccount(email), { exact: true })).toBeVisible();
  await expect(seatsLink(page)).toBeVisible();
  await expect(seatsLink(page)).toHaveAttribute('href', '/seats');
  await expect(signOutButton(page)).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '介面配色', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '開啟選單', exact: true })).toHaveCount(0);
  await expect(page.getByText(VIEW_ONLY, { exact: true })).toHaveCount(0);
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
