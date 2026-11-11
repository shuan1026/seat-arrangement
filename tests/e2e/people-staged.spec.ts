// 參與人員頁的暫存區與「未放桌」（D-027）：docs/spec/participants.md v1.6 第 2.1 節（桌次欄「暫存」）、第 2.2 節（暫存區的人的列操作）、
// PPL-R26（桌次篩選只列場上的桌；入座狀態「未入座」含暫存區的桌上的人）、PPL-R33（「暫存」開啟座位安排與那張暫存的桌的詳情）、
// PPL-R56（新增人員的桌次欄位只列場上的桌）；驗收條件 PPL-AC91～AC93。
// 資料直接寫進測試資料庫（helpers/participants-db.ts：reset() 把桌子恢復成 1–30 桌在原位置；emptyPosition、stagedTable），都是虛構資料。
// 「暫存」照 seating.md 2.2.2 是可以按的徽章：button（或連結）「暫存」；按下後開到 /?staged={桌子的 id}（docs/architecture.md 第 11.3 節）。
// 位置編號與桌號：3 = B4、9 = B8（tests/helpers/table-codes.ts）。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { CODES_IN_LIST_ORDER } from '../helpers/table-codes';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { demoEmployees, withDb } from './helpers/participants-db';
import {
  cellOf,
  chooseOption,
  filterSelect,
  gotoPeople,
  listedNames,
  openNewPersonDialog,
  openOptions,
  openRowMenu,
  personRow,
  rowAction,
  selectField,
  toasts,
} from './helpers/participants-page';
import { stagedDetail } from './helpers/seating-page';

const B4 = 3;
const B8 = 9;

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
  await withDb((db) => db.reset());
});

test.afterAll(async () => {
  await withDb((db) => db.reset());
});

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面的表格；手機是堆疊卡片');

/** 王小明與王小明_眷屬在暫存區的一桌（備註名稱「暫放」）；李美華在 B4 桌；陳大文未入座。回傳暫存的桌的 id */
async function seedStaged(): Promise<number> {
  return withDb(async (db) => {
    const { wang, lee, chen } = await demoEmployees(db);
    const staged = await db.stagedTable('暫放');
    const pWang = await db.register(wang, { tableId: staged });
    await db.dependent(pWang, { relation: '配偶', tableId: staged });
    await db.register(lee, { tableId: B4 });
    await db.register(chen);
    return staged;
  });
}

/** 桌次欄的「暫存」（可以按的徽章） */
const stagedBadge = (row: Locator) =>
  cellOf(row, '桌次').getByRole('button', { name: '暫存', exact: true }).or(cellOf(row, '桌次').getByRole('link', { name: '暫存', exact: true }));

test('PPL-AC91：王小明、王小明_眷屬在暫存區的一桌 → 兩人的桌次欄都是「暫存」；入座狀態「未入座」列出他們、「已入座」不列；桌次篩選的選項沒有暫存的桌 → 按王小明的「暫存」→ 開啟座位安排並顯示那張暫存的桌的詳情（PPL-R26、PPL-R33）', async ({
  page,
}) => {
  desktopOnly(page);
  const staged = await seedStaged();
  await gotoPeople(page);

  await expect(cellOf(personRow(page, '王小明'), '桌次')).toHaveText('暫存');
  await expect(cellOf(personRow(page, '王小明_眷屬'), '桌次')).toHaveText('暫存');
  await expect(cellOf(personRow(page, '李美華'), '桌次')).toHaveText('B4');

  await chooseOption(page, filterSelect(page, '入座狀態'), '未入座');
  await expect.poll(() => listedNames(page)).toEqual(expect.arrayContaining(['王小明', '王小明_眷屬', '陳大文']));
  expect(await listedNames(page)).not.toContain('李美華');
  await chooseOption(page, filterSelect(page, '入座狀態'), '已入座');
  await expect.poll(() => listedNames(page)).toEqual(['李美華']);
  await chooseOption(page, filterSelect(page, '入座狀態'), '不限');

  const listbox = await openOptions(page, filterSelect(page, '桌次'));
  await expect(listbox.getByRole('option')).toHaveText(['不限', ...CODES_IN_LIST_ORDER]);
  await expect(listbox.getByRole('option', { name: /暫存|暫放/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await stagedBadge(personRow(page, '王小明')).click();
  await expect(page).toHaveURL((url) => url.pathname === '/' && url.searchParams.get('staged') === String(staged));
  await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
  const detail = stagedDetail(page, '暫放');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('王小明');
});

test('PPL-AC92：王小明在暫存區的一桌 → 列操作是「編輯」「入座…」「移出桌次」「取消報名」→ 按「移出桌次」→ 桌次欄變成「未入座」，Sonner「已把 王小明 移出暫存區的桌。」與「復原」（第 2.2 節）', async ({
  page,
}) => {
  await seedStaged();
  await gotoPeople(page);

  const menu = await openRowMenu(page, '王小明');
  await expect(menu.getByRole('menuitem')).toHaveText(['編輯', '入座…', '移出桌次', '取消報名']);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // 眷屬是「編輯／入座…／移出桌次／刪除」
  const depMenu = await openRowMenu(page, '王小明_眷屬');
  await expect(depMenu.getByRole('menuitem')).toHaveText(['編輯', '入座…', '移出桌次', '刪除']);
  await page.keyboard.press('Escape');

  await rowAction(page, '王小明', '移出桌次');
  const toast = toasts(page).getByRole('listitem').filter({ hasText: '已把 王小明 移出暫存區的桌。' });
  await expect(toast).toBeVisible();
  await expect(toast.getByRole('button', { name: '復原' })).toBeVisible();
  await expect(cellOf(personRow(page, '王小明'), '桌次')).toHaveText('未入座');
  await expect(cellOf(personRow(page, '王小明_眷屬'), '桌次')).toHaveText('暫存');
  const record = await withDb((db) => db.find('王小明'));
  expect(record).toMatchObject({ tableId: null, seatOrder: null });
});

test('暫存區的人按「入座…」：桌次選項只有場上的桌，選 B4 桌確認後入座，桌次欄變成「B4」（第 2.2 節、PPL-R56）', async ({ page }) => {
  await seedStaged();
  await gotoPeople(page);
  await rowAction(page, '王小明', '入座…');
  const dialog = page.getByRole('dialog', { name: '安排 王小明 入座', exact: true });
  await expect(dialog).toBeVisible();
  const listbox = await openOptions(page, dialog.getByRole('combobox', { name: /^桌次/ }));
  await expect(listbox.getByRole('option')).toHaveCount(30);
  await expect(listbox.getByRole('option', { name: /暫存|暫放/ })).toHaveCount(0);
  await listbox.getByRole('option', { name: /^B4 桌/ }).click();
  await dialog.getByRole('button', { name: '確認入座' }).click();
  await expect(toasts(page).getByText('已把 王小明 安排到 B4 桌。', { exact: true })).toBeVisible();
  await expect(cellOf(personRow(page, '王小明'), '桌次')).toHaveText('B4');
});

test('PPL-AC93：B8 是「未放桌」→ 新增人員對話框的桌次欄位、桌次篩選、「入座…」的桌次選項都沒有 B8（PPL-R26、PPL-R56）', async ({ page }) => {
  await withDb(async (db) => {
    const { wang } = await demoEmployees(db);
    await db.emptyPosition(B8);
    await db.register(wang);
  });
  await gotoPeople(page);

  // 新增人員對話框的桌次欄位：「未入座」與 29 桌，沒有 B8
  const dialog = await openNewPersonDialog(page);
  let listbox = await openOptions(page, selectField(dialog, '桌次'));
  const labels = (await listbox.getByRole('option').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  expect(labels[0]).toBe('未入座');
  expect(labels.slice(1).map((l) => /^([AB]\d{1,2}) 桌/.exec(l)?.[1])).toEqual(CODES_IN_LIST_ORDER.filter((c) => c !== 'B8'));
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toBeHidden();

  // 桌次篩選
  listbox = await openOptions(page, filterSelect(page, '桌次'));
  await expect(listbox.getByRole('option')).toHaveText(['不限', ...CODES_IN_LIST_ORDER.filter((c) => c !== 'B8')]);
  await page.keyboard.press('Escape');

  // 「入座…」
  await rowAction(page, '王小明', '入座…');
  const seat = page.getByRole('dialog', { name: '安排 王小明 入座', exact: true });
  listbox = await openOptions(page, seat.getByRole('combobox', { name: /^桌次/ }));
  await expect(listbox.getByRole('option')).toHaveCount(29);
  await expect(listbox.getByRole('option', { name: /^B8/ })).toHaveCount(0);
});
