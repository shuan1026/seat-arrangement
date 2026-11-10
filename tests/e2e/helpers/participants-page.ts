// 參與人員頁 E2E 的定位與操作：一律用使用者看得到的角色與文字（docs/spec/participants.md 第 2、4 節的文案），
// 不依賴 class 或 test id。
import { expect, type Locator, type Page } from '@playwright/test';

/** 表格欄位（第 2.1 節，由左到右；最右一欄是列操作） */
export const COLUMNS = ['顯示名稱', '類別', '部門或單位', '分機', '標示', '桌次', '備註'] as const;
export type Column = (typeof COLUMNS)[number];

export const SEARCH_LABEL = '搜尋姓名、分機、部門或單位';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function gotoPeople(page: Page, path = '/people'): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: '參與人員' })).toBeVisible();
}

/** 工具列的搜尋框 */
export const searchBox = (page: Page) => page.getByLabel(SEARCH_LABEL, { exact: true });

/** 工具列的篩選（類別／部門／入座狀態／桌次） */
export const filterSelect = (page: Page, label: '類別' | '部門' | '入座狀態' | '桌次') =>
  page.getByRole('combobox', { name: label, exact: true });

/** 工具列下方已套用的篩選按鈕（Badge outline） */
export const filterChip = (page: Page, text: string) =>
  page.getByRole('button', { name: new RegExp(`^(移除篩選\\s*)?${escapeRegExp(text)}$`) });

/**
 * 參與人員表格裡的一列（桌面是表格列，手機是堆疊卡片）。
 * 用顯示名稱找；找「王小明」不會找到「王小明_眷屬」。
 */
export const personRow = (page: Page, name: string) =>
  page.getByRole('row').filter({ hasText: name }).filter({ hasNotText: `${name}_眷屬` });

/** 一列的儲存格（依第 2.1 節的欄位順序） */
const cellsOf = (row: Locator) => row.getByRole('cell').or(row.getByRole('rowheader'));

export const cellOf = (row: Locator, column: Column) => cellsOf(row).nth(COLUMNS.indexOf(column));

/** 「兒童椅」「素食」等標示：徽章文字，或只有圖示時的無障礙名稱 */
export const markIn = (scope: Locator, label: string) =>
  scope.getByText(label, { exact: true }).or(scope.getByRole('img', { name: label, exact: true }));

/** 表格目前列出的顯示名稱（依畫面順序；去掉外部貴賓的「貴賓」徽章） */
export async function listedNames(page: Page): Promise<string[]> {
  const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
  const names: string[] = [];
  for (const row of await rows.all()) {
    const text = await cellsOf(row).first().innerText();
    names.push(text.replace(/\s+/g, '').replace(/貴賓$/, ''));
  }
  return names;
}

/** 打開一列的列操作選單（「更多操作」） */
export async function openRowMenu(page: Page, name: string): Promise<Locator> {
  await personRow(page, name).getByRole('button', { name: '更多操作' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

/** 列操作選單選一項 */
export async function rowAction(page: Page, name: string, action: string): Promise<void> {
  const menu = await openRowMenu(page, name);
  await menu.getByRole('menuitem', { name: action, exact: true }).click();
}

/** 打開下拉（Dropdown Menu select），回傳選項清單 */
export async function openOptions(page: Page, field: Locator, searchText?: string): Promise<Locator> {
  await field.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  // 可搜尋的下拉開啟後焦點在選單的搜尋欄
  if (searchText !== undefined) await page.keyboard.type(searchText);
  return listbox;
}

export const optionIn = (listbox: Locator, option: string | RegExp) =>
  listbox.getByRole('option', typeof option === 'string' ? { name: option, exact: true } : { name: option });

/** 在下拉選一個選項；searchText 有給時先在選單的搜尋欄輸入 */
export async function chooseOption(page: Page, field: Locator, option: string | RegExp, searchText?: string) {
  const listbox = await openOptions(page, field, searchText);
  await optionIn(listbox, option).click();
  await expect(listbox).toBeHidden();
}

/** Sonner 的通知區 */
export const toasts = (page: Page) => page.getByRole('region', { name: /^通知/ });

export async function expectToast(page: Page, text: string): Promise<void> {
  await expect(toasts(page).getByText(text, { exact: true })).toBeVisible();
}

/** 頁首的「新增人員」，開啟新增人員對話框 */
export async function openNewPersonDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '新增人員' }).first().click();
  const dialog = page.getByRole('dialog', { name: '新增人員' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** 從列操作「編輯」開啟編輯人員對話框 */
export async function openEditDialog(page: Page, name: string): Promise<Locator> {
  await rowAction(page, name, '編輯');
  const dialog = page.getByRole('dialog', { name: '編輯人員' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** 對話框裡的下拉欄位 */
export const selectField = (dialog: Locator, label: string) => dialog.getByRole('combobox', { name: label, exact: true });
/** 對話框裡的文字欄位 */
export const textField = (dialog: Locator, label: string) => dialog.getByRole('textbox', { name: label, exact: true });
/** 對話框裡的勾選框 */
export const checkbox = (dialog: Locator, label: string) => dialog.getByRole('checkbox', { name: label, exact: true });

/** 欄位顯示的值：輸入框看 value，其他元件看文字 */
export const shownValue = (field: Locator) =>
  field.evaluate((el) =>
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : (el.textContent ?? '')).trim(),
  );

/** 欄位不能修改：停用或唯讀 */
export const isLocked = (field: Locator) =>
  field.evaluate(
    (el) =>
      el.hasAttribute('disabled') ||
      el.hasAttribute('readonly') ||
      el.getAttribute('aria-disabled') === 'true' ||
      el.getAttribute('aria-readonly') === 'true',
  );

/** 打開匯入參與人員對話框 */
export async function openImportDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '匯入參與人員' }).click();
  const dialog = page.getByRole('dialog', { name: '匯入參與人員' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** 選要匯入的檔案（UTF-8，加 BOM，和 Google 表單匯出的檔案相同） */
export async function chooseCsv(dialog: Locator, content: string, name = 'registrations.csv'): Promise<void> {
  await dialog.getByLabel('檔案').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(`﻿${content}`, 'utf8'),
  });
}

/** 兩個元素的位置（量不到時讓測試失敗） */
export async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('量不到元素的位置');
  return box;
}
