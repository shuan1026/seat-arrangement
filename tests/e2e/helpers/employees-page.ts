// 員工名單頁 E2E 的共用定位與操作：一律用使用者看得到的角色與文字（docs/spec/employees.md 第 4 節的文案）。
import { readFile } from 'node:fs/promises';
import { expect, type Download, type Locator, type Page } from '@playwright/test';

export const SEARCH_PLACEHOLDER = '搜尋姓名、分機、部門或組別';
export const HEADER_CHECKBOX = '全選這一頁未報名的員工';
export const CONFLICT_TOAST = '資料已被其他人更新，已重新載入。';

/** 開啟員工名單，等到頁面標題出現、前端接手（hydration）之後再操作 */
export async function gotoEmployees(page: Page, path = '/employees'): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: '員工名單' })).toBeVisible();
  await page.waitForLoadState('networkidle');
}

/** 表格的資料列（桌面是表格列，手機是堆疊卡片；每列都有列操作選單「更多操作」） */
export const dataRows = (page: Page): Locator =>
  page.getByRole('row').filter({ has: page.getByRole('button', { name: '更多操作' }) });

/** 含有某段文字的資料列 */
export const rowOf = (page: Page, text: string): Locator => dataRows(page).filter({ hasText: text });

/** 資料列的儲存格；欄位依序為勾選、姓名、部門、組別、分機、地區、報名狀態、備註、列操作（EMP-R10） */
export const COLUMN = { check: 0, name: 1, department: 2, team: 3, extension: 4, region: 5, status: 6, note: 7, actions: 8 } as const;
export const cellOf = (row: Locator, column: keyof typeof COLUMN): Locator => row.getByRole('cell').nth(COLUMN[column]);

/** 開啟某一列的列操作選單，回傳選單 */
export async function openRowMenu(page: Page, row: Locator): Promise<Locator> {
  await row.getByRole('button', { name: '更多操作' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

export const searchBox = (page: Page): Locator => page.getByPlaceholder(SEARCH_PLACEHOLDER);

/** 工具列的篩選（Dropdown Menu select，無障礙名稱是篩選項目名稱） */
export const filterTrigger = (page: Page, label: '部門' | '組別' | '地區'): Locator =>
  page.getByRole('combobox', { name: label, exact: true });

/** 開啟一個下拉選單，讀出全部選項後關閉 */
export async function optionsOf(page: Page, trigger: Locator): Promise<string[]> {
  await trigger.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const texts = (await listbox.getByRole('option').allTextContents()).map((t) => t.trim());
  await page.keyboard.press('Escape');
  await expect(listbox).toBeHidden();
  return texts;
}

/** 在下拉選單選一個選項 */
export async function choose(page: Page, trigger: Locator, option: string): Promise<void> {
  await trigger.click();
  await page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
}

/** 在可輸入新值的下拉欄位輸入文字，選「新增○○「{文字}」」 */
export async function chooseNew(page: Page, trigger: Locator, text: string, optionLabel: string): Promise<void> {
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.type(text);
  await page.getByRole('option', { name: optionLabel, exact: true }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
}

/** Tabs 的四個分頁（EMP-R08、D-014） */
export type TabLabel = '全部' | '未報名' | '已報名' | '不參加';
export const TAB_LABELS: readonly TabLabel[] = ['全部', '未報名', '已報名', '不參加'];

/** Tabs 的分頁（名稱開頭是分頁名稱，後面是人數） */
export const tabOf = (page: Page, label: TabLabel): Locator => page.getByRole('tab', { name: new RegExp(`^${label}`) });

/** Tabs 上的人數：「全部 {n}」 */
export const tabCount = (label: TabLabel, n: number) => new RegExp(`^${label}\\s*${n}$`);

/** 已套用的篩選徽章（按下移除那一項） */
export const filterBadge = (page: Page, value: string): Locator => page.getByRole('button', { name: new RegExp(value) });

/** 頁首的按鈕（沒有員工時空狀態也有同名按鈕，兩個都會開同一個對話框） */
export const pageButton = (page: Page, name: '新增員工' | '匯入員工名單'): Locator =>
  page.getByRole('button', { name, exact: true }).first();

/** 勾選框：未報名「勾選 {姓名}」，已報名「{姓名} 已報名」，不參加「{姓名} 不參加」（EMP-R25） */
export const pickBox = (page: Page, name: string): Locator => page.getByRole('checkbox', { name: `勾選 ${name}`, exact: true });
export const takenBox = (page: Page, name: string): Locator => page.getByRole('checkbox', { name: `${name} 已報名`, exact: true });
export const declinedBox = (page: Page, name: string): Locator =>
  page.getByRole('checkbox', { name: `${name} 不參加`, exact: true });

/** 批次按鈕「加入尾牙（{n} 位）」 */
export const bulkButton = (page: Page, n?: number): Locator =>
  n === undefined
    ? page.getByRole('button', { name: /^加入尾牙（\d+ 位）$/ })
    : page.getByRole('button', { name: `加入尾牙（${n} 位）`, exact: true });

/** Sonner 成功訊息 */
export async function expectToast(page: Page, text: string): Promise<void> {
  await expect(page.getByText(text, { exact: true })).toBeVisible();
}

/** 不能復原的操作：沒有「復原」（EMP-R31） */
export async function expectNoUndo(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: '復原' })).toHaveCount(0);
}

/** 讀出下載的文字檔，去掉 UTF-8 BOM */
export async function downloadedText(download: Download): Promise<string> {
  const text = await readFile(await download.path(), 'utf8');
  return text.replace(/^﻿/, '');
}

/** 某個元素的文字顏色，和 CSS 變數算出來的顏色比較（判斷危險樣式，不依賴 class） */
export async function colorOf(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).color);
}

export async function cssVarColor(page: Page, variable: string): Promise<string> {
  return page.evaluate((v) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${v})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, variable);
}

/** 背景色；和 cssVarBackground 比較按鈕的樣式（primary、destructive-primary） */
export async function backgroundOf(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

export async function cssVarBackground(page: Page, variable: string): Promise<string> {
  return page.evaluate((v) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(${v})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, variable);
}

/** 量得到的位置與大小 */
export async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('量不到元素的位置');
  return box;
}
