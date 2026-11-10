// 匯入參與人員對話框：上傳 Google 表單尾牙報名表的原始 CSV（D-010）。
// 依據：docs/spec/participants.md 第 2.5 節、第 4.4 節的文案、PPL-R64、R65、R68、R74、R85，
// PPL-AC61～AC64、AC68、AC83；待確認 PPL-Q06（匯入中、完成後的按鈕、錯誤清單 CSV 的內容）、PPL-Q21（沒有「下載範本」）依目前假設（D-008）。
// 匯入規則的細節在 tests/unit/domain/registration-import.test.ts 與 tests/integration/api/participants-import.test.ts。
// 報名表是虛構資料（tests/helpers/participants-registration-csv.ts），表頭含異體字 ⽛ 與空白。
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  answer,
  fakeEmail,
  FORM_COLUMNS,
  FULL_WIDTH_HEADERS,
  ISSUE_REASON,
  registrationCsv,
  ROSTER_CSV,
} from '../helpers/participants-registration-csv';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { demoEmployees, withDb } from './helpers/participants-db';
import { cellOf, chooseCsv, gotoPeople, openImportDialog, personRow } from './helpers/participants-page';

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
  await withDb((db) => db.reset());
});

test.afterAll(async () => {
  await withDb((db) => db.reset());
});

const desktopOnly = async ({ page }: { page: Page }) => {
  test.skip(isMobileWidth(page), '對話框內容與流程在桌面驗證；各寬度的水平捲動在 people-list.spec.ts');
};

/** 王小明、李美華已報名；陳大文未報名 */
async function seedDemo() {
  await withDb(async (db) => {
    const { wang, lee } = await demoEmployees(db);
    await db.register(wang);
    await db.register(lee);
  });
}

const FORMAT_ERROR = '檔案欄位和報名表不一致，請上傳 Google 表單匯出的原始檔案。';

test.describe('匯入參與人員對話框', () => {
  test.beforeEach(desktopOnly);

  test('對話框內容：說明、檔案欄位與檔案說明、重複處理說明；按鈕「取消」「開始匯入」；沒有「下載範本」（PPL-AC61、PPL-R64、第 2.5 節）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openImportDialog(page);

    await expect(
      dialog.getByText(
        '上傳尾牙報名表（Google 表單匯出的 CSV 檔），一次加入報名參加的員工與眷屬。系統會依名字與部門對應員工名單；外部貴賓、桌次與工作人員請在畫面上處理。',
        { exact: true },
      ),
    ).toBeVisible();
    const file = dialog.getByLabel('檔案');
    await expect(file).toHaveAttribute('accept', /csv/i);
    await expect(dialog.getByText('請上傳 Google 表單匯出的原始檔案，不用修改內容。', { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(
        '已報名的員工會更新兒童椅與素食，不會重複新增，座位不動；備註只在系統裡沒有備註時填入。對不到員工名單或改填不參加的人會列為需要處理，不會自動取消報名。',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '開始匯入', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '下載範本' })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: '下載範本' })).toHaveCount(0);
  });

  test('沒選檔案就按「開始匯入」：檔案欄位顯示「請選擇要匯入的檔案。」，沒有匯入任何人（PPL-AC62、PPL-R65）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const before = await withDb((db) => db.participantCount());
    const dialog = await openImportDialog(page);
    await dialog.getByRole('button', { name: '開始匯入', exact: true }).click();
    await expect(dialog.getByText('請選擇要匯入的檔案。', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('檔案')).toHaveAccessibleDescription(/請選擇要匯入的檔案。/);
    expect(await withDb((db) => db.participantCount())).toBe(before);
  });

  test('選了員工名單的通訊錄、或少了「是否攜帶眷屬 ？」欄的報名表：檔案欄位顯示格式錯誤，參與人員沒有任何改變（PPL-AC63、PPL-R68）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const before = await withDb((db) => db.people());

    let dialog = await openImportDialog(page);
    await chooseCsv(dialog, ROSTER_CSV, 'roster.csv');
    await dialog.getByRole('button', { name: '開始匯入', exact: true }).click();
    await expect(dialog.getByText(FORMAT_ERROR, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();

    dialog = await openImportDialog(page);
    const missing = registrationCsv([answer('陳大文／研發一部／是')], {
      columns: FORM_COLUMNS.filter((c) => c !== 'dependent'),
    });
    await chooseCsv(dialog, missing);
    await dialog.getByRole('button', { name: '開始匯入', exact: true }).click();
    await expect(dialog.getByText(FORMAT_ERROR, { exact: true })).toBeVisible();

    expect(await withDb((db) => db.people())).toEqual(before);
  });

  test('欄位順序不同的報名表：新增陳大文；完成訊息「已匯入 1 位，0 筆需要處理。」，只有「關閉」；關閉後清單有陳大文、重新整理後仍在（PPL-AC64、PPL-R74、PPL-Q06）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openImportDialog(page);
    // 右上角的關閉鈕也叫「關閉」；完成後底部多一個「關閉」
    const closeButtons = dialog.getByRole('button', { name: '關閉', exact: true });
    const closeBefore = await closeButtons.count();
    await chooseCsv(
      dialog,
      registrationCsv([answer('陳大文／研發一部／是／否／否／葷食')], {
        columns: [...FORM_COLUMNS].reverse(),
        headers: FULL_WIDTH_HEADERS,
      }),
    );
    await dialog.getByRole('button', { name: '開始匯入', exact: true }).click();

    await expect(dialog.getByText('已匯入 1 位，0 筆需要處理。', { exact: true })).toBeVisible();
    await expect(closeButtons).toHaveCount(closeBefore + 1);
    await expect(dialog.getByRole('button', { name: '下載錯誤清單' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '開始匯入', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toHaveCount(0);
    await closeButtons.first().click();
    await expect(dialog).toBeHidden();

    await expect(cellOf(personRow(page, '陳大文'), '桌次')).toHaveText('未入座');
    await page.reload();
    await expect(personRow(page, '陳大文')).toHaveCount(1);
  });

  test('對不到員工名單的趙六：「已匯入 0 位，1 筆需要處理。」；「下載錯誤清單」下載的 CSV 有列號、名字、部門與原因，沒有電子郵件（PPL-AC68、PPL-R74、PPL-Q06）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openImportDialog(page);
    await chooseCsv(dialog, registrationCsv([answer('趙六／行政部／是')], { headers: FULL_WIDTH_HEADERS }));
    await dialog.getByRole('button', { name: '開始匯入', exact: true }).click();

    await expect(dialog.getByText('已匯入 0 位，1 筆需要處理。', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '關閉', exact: true }).first()).toBeVisible();

    const downloading = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '下載錯誤清單' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const path = await download.path();
    const text = (await readFile(path, 'utf8')).replace(/^﻿/, '');
    const lines = text.trim().split(/\r?\n/);
    expect(lines).toHaveLength(2);
    const [, row] = lines;
    expect(row).toContain('趙六');
    expect(row).toContain('行政部');
    expect(row).toContain(ISSUE_REASON.notFound('趙六'));
    expect(row?.split(',')).toContain('2');
    expect(text).not.toContain(fakeEmail(1));
    expect(text).not.toContain('@');

    expect(await withDb((db) => db.participantCount())).toBe(2);
  });

  test('三列中一位對不到員工名單：「已匯入 2 位，1 筆需要處理。」，另外兩位已新增（PPL-AC83、PPL-R85）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.register(wang);
    });
    await gotoPeople(page);
    const dialog = await openImportDialog(page);
    await chooseCsv(
      dialog,
      registrationCsv([answer('陳大文／研發一部／是'), answer('李美華／業務部／是'), answer('趙六／行政部／是')]),
    );
    await dialog.getByRole('button', { name: '開始匯入', exact: true }).click();
    await expect(dialog.getByText('已匯入 2 位，1 筆需要處理。', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '下載錯誤清單' })).toBeVisible();
    await dialog.getByRole('button', { name: '關閉', exact: true }).first().click();

    await page.reload();
    await expect(personRow(page, '陳大文')).toHaveCount(1);
    await expect(personRow(page, '李美華')).toHaveCount(1);
    await expect(personRow(page, '趙六')).toHaveCount(0);
  });

  test('匯入中：「開始匯入」顯示載入中、不能再按（第 2.5 節、PPL-Q06）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const release = Promise.withResolvers<void>();
    await page.route('**/api/participants/import', async (route) => {
      await release.promise;
      await route.continue();
    });

    const dialog = await openImportDialog(page);
    await chooseCsv(dialog, registrationCsv([answer('陳大文／研發一部／是')]));
    const start = dialog.getByRole('button', { name: '開始匯入', exact: true });
    await start.click();
    await expect(start).toBeDisabled();
    await expect(start).toHaveAttribute('aria-busy', 'true');

    release.resolve();
    await expect(dialog.getByText('已匯入 1 位，0 筆需要處理。', { exact: true })).toBeVisible();
    await page.unroute('**/api/participants/import');
  });
});
