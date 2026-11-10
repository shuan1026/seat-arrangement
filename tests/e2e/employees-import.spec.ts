// 匯入員工名單對話框：docs/spec/employees.md 第 2.7、3.8、4.4 節，EMP-R31、R44～R62、R66，驗收條件 EMP-AC57～AC75、AC87；
// D-012（英文名空白的設備列略過、通訊錄匯出檔的欄位格式可以直接匯入）；
// 待確認 EMP-Q02（不是 CSV 的檔案顯示格式錯誤文案，依原型）、Q03（完成訊息在對話框內，{n} 含更新的員工）依 D-008。
// 每一種列的規則在 tests/unit/domain/roster-import.test.ts 與 tests/integration/api/employees-import.test.ts 逐條驗證；
// 這裡驗證使用者看到的對話框、訊息、下載與匯入後的名單。檔案內容都是虛構的通訊錄（tests/helpers/employees-roster.ts）。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ROSTER_TEMPLATE_HEADER } from '../../src/contracts/employees';
import {
  ADDRESS_BOOK_HEADER,
  FAKE_MOBILE,
  FAKE_PICKUP_GROUP,
  SWITCHBOARD_ROW,
  headerRenamed,
  headerWithout,
  rosterCsv,
  rosterPerson,
  withSerial,
  type RosterRecord,
} from '../helpers/employees-roster';
import { signIn } from './helpers/auth';
import { closeDb, employeeRows, insertEmployee, resetData } from './helpers/employees-db';
import {
  cellOf,
  dataRows,
  downloadedText,
  expectNoUndo,
  filterTrigger,
  gotoEmployees,
  optionsOf,
  pageButton,
  rowOf,
  searchBox,
} from './helpers/employees-page';
import { requireBaseURL } from './helpers/page-checks';

const FORMAT_ERROR = '檔案欄位和範本不一致，請下載範本後重新整理。';

test.beforeEach(async ({ context, baseURL }) => {
  await resetData();
  await signIn(context, requireBaseURL(baseURL));
});

test.afterAll(async () => {
  await resetData();
  await closeDb();
});

async function openImportDialog(page: Page): Promise<Locator> {
  await pageButton(page, '匯入員工名單').click();
  const dialog = page.getByRole('dialog', { name: '匯入員工名單' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const fileField = (dialog: Locator) => dialog.getByLabel('檔案');

async function chooseFile(dialog: Locator, content: string, name = 'roster.csv') {
  await fileField(dialog).setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(content, 'utf8') });
  await expect(dialog.getByText(name)).toBeVisible();
}

async function importRecords(page: Page, records: readonly RosterRecord[], header?: readonly string[]): Promise<Locator> {
  const dialog = await openImportDialog(page);
  await chooseFile(dialog, rosterCsv(records, header));
  await dialog.getByRole('button', { name: '開始匯入' }).click();
  return dialog;
}

/** 匯入完成後關閉對話框，回到員工名單 */
async function closeDialog(page: Page, dialog: Locator) {
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

/** 「下載範本」是連結或連結樣式的按鈕 */
const templateLink = (dialog: Locator) =>
  dialog.getByRole('link', { name: '下載範本' }).or(dialog.getByRole('button', { name: '下載範本' }));

test('EMP-AC57：按「匯入員工名單」→ 標題、說明、「下載範本」、「檔案*」、重複處理說明、「開始匯入」「取消」（EMP-R44、2.7、第 4.4 節）', async ({
  page,
}) => {
  await insertEmployee({ name: '既有', department: '研發部' });
  await gotoEmployees(page);
  const dialog = await openImportDialog(page);

  await expect(dialog.getByText('上傳公司通訊錄匯出的 CSV 檔，一次建立或更新全部員工。')).toBeVisible();
  await expect(templateLink(dialog)).toBeVisible();
  await expect(fileField(dialog)).toBeAttached();
  // 欄位標籤「檔案*」（必填）
  await expect(dialog.getByText(/^檔案\s*\*$/)).toBeVisible();
  await expect(
    dialog.getByText('姓名與部門相同的員工會更新內容，不會重複新增；公共區域、會議室與「空位」的列會略過。'),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: '開始匯入' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeVisible();
});

test('EMP-AC58：按「下載範本」→ 下載 CSV，表頭依序為分機、姓名、英文名、手機號碼、部門、地區、辦公室、代接群組、組別（EMP-R45）', async ({
  page,
}) => {
  await gotoEmployees(page);
  const dialog = await openImportDialog(page);
  const [download] = await Promise.all([page.waitForEvent('download'), templateLink(dialog).click()]);

  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  const [firstLine] = (await downloadedText(download)).split(/\r?\n/);
  expect(firstLine?.split(',')).toEqual([...ROSTER_TEMPLATE_HEADER]);
});

test('EMP-AC59：沒選檔案按「開始匯入」→ 檔案欄位「請選擇要匯入的檔案。」，員工名單不變（EMP-R47）', async ({ page }) => {
  await insertEmployee({ name: '既有', department: '研發部' });
  await gotoEmployees(page);
  const dialog = await openImportDialog(page);
  await dialog.getByRole('button', { name: '開始匯入' }).click();

  await expect(dialog.getByText('請選擇要匯入的檔案。')).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(await employeeRows()).toHaveLength(1);
});

for (const [label, header] of [
  ['少了「部門」欄', headerWithout('部門')],
  ['「部門」欄名改成「單位」', headerRenamed('部門', '單位')],
] as const) {
  test(`EMP-AC60：${label} →「檔案欄位和範本不一致，請下載範本後重新整理。」，任何一列都沒有匯入（EMP-R48）`, async ({ page }) => {
    await gotoEmployees(page);
    const dialog = await importRecords(
      page,
      [
        { ...rosterPerson('王小明', '業務部'), 單位: '業務部' },
        { ...rosterPerson('李小華', '研發部'), 單位: '研發部' },
      ],
      header,
    );
    await expect(dialog.getByText(FORMAT_ERROR)).toBeVisible();
    expect(await employeeRows()).toEqual([]);
  });
}

test('選了不是 CSV 的檔案 → 顯示格式錯誤，不匯入（EMP-Q02 原型做法）', async ({ page }) => {
  await gotoEmployees(page);
  const dialog = await openImportDialog(page);
  await chooseFile(dialog, rosterCsv([rosterPerson('王小明', '業務部')]), 'roster.txt');
  await dialog.getByRole('button', { name: '開始匯入' }).click();
  await expect(dialog.getByText(FORMAT_ERROR)).toBeVisible();
  expect(await employeeRows()).toEqual([]);
});

test('EMP-AC61：員工名單是空的、檔案有 3 列員工 →「已匯入 3 位員工，0 筆需要處理。」；關閉後名單有這 3 位（EMP-R55、R59、EMP-Q03）', async ({
  page,
}) => {
  await gotoEmployees(page);
  const dialog = await importRecords(page, [
    rosterPerson('王小明', '業務部', { 分機: '1234' }),
    rosterPerson('李小華', '研發部', { 分機: '2001' }),
    rosterPerson('張三', '研發部', { 分機: '2002' }),
  ]);
  await expect(dialog.getByText('已匯入 3 位員工，0 筆需要處理。')).toBeVisible();

  await closeDialog(page, dialog);
  await expect(dataRows(page)).toHaveCount(3);
  for (const name of ['王小明', '李小華', '張三']) await expect(cellOf(rowOf(page, name), 'status')).toHaveText('未報名');
});

test('EMP-AC62～AC68、AC73：總機資訊、空白列、公共區域、空位略過；同一人合併分機；N/A；組別留空；手機號碼與代接群組看不到', async ({
  page,
}) => {
  await gotoEmployees(page);
  const dialog = await importRecords(page, [
    SWITCHBOARD_ROW,
    rosterPerson('王小明', '業務部', { 分機: '1234', 英文名: 'Xiaoming', 組別: '北區組', 手機號碼: FAKE_MOBILE }),
    {},
    { 分機: '1600', 姓名: '第一會議室', 部門: '公共區域', 地區: '台北' },
    { 分機: '1500', 姓名: '空位', 英文名: '空位', 部門: '研發部' },
    rosterPerson('王小明', '業務部', { 分機: '1235', 英文名: 'Xiaoming', 組別: '北區組' }),
    rosterPerson('李小華', '研發部', { 分機: 'N/A', 組別: '韌體組', 代接群組: FAKE_PICKUP_GROUP }),
    rosterPerson('張三', '研發部', { 分機: '2002', 組別: '' }),
  ]);
  await expect(dialog.getByText('已匯入 3 位員工，0 筆需要處理。')).toBeVisible();
  await closeDialog(page, dialog);

  await expect(dataRows(page)).toHaveCount(3);
  await expect(rowOf(page, '第一會議室')).toHaveCount(0);
  await expect(rowOf(page, '空位')).toHaveCount(0);
  await expect(rowOf(page, '王小明')).toHaveCount(1);
  await expect(cellOf(rowOf(page, '王小明'), 'extension')).toHaveText('1234／1235');
  await expect(cellOf(rowOf(page, '李小華'), 'extension')).toHaveText('—');
  await expect(cellOf(rowOf(page, '李小華'), 'team')).toHaveText('韌體組');
  await expect(cellOf(rowOf(page, '張三'), 'team')).toHaveText('—');

  await expect(page.getByText(FAKE_MOBILE)).toHaveCount(0);
  await expect(page.getByText(FAKE_PICKUP_GROUP)).toHaveCount(0);
  // 辦公室有存，但畫面不顯示（EMP-Q06 第 4 點）
  await expect(page.getByText('測試辦公室')).toHaveCount(0);
  await expect.poll(async () => (await employeeRows()).find((e) => e.name === '張三')?.office).toBe('測試辦公室');
  expect(await optionsOf(page, filterTrigger(page, '部門'))).not.toContain('公共區域');

  await searchBox(page).fill('1235');
  await expect(dataRows(page)).toHaveCount(1);
  await expect(rowOf(page, '王小明')).toHaveCount(1);
});

test('EMP-AC69：已有王小明（業務部、1234、北區組、備註素食）→ 匯入分機 1300、組別留空 → 只有一位王小明，分機 1300、沒有組別、備註仍是素食（EMP-R55、R56）', async ({
  page,
}) => {
  await insertEmployee({ name: '王小明', department: '業務部', extension: '1234', team: '北區組', note: '素食' });
  await gotoEmployees(page);
  const dialog = await importRecords(page, [rosterPerson('王小明', '業務部', { 分機: '1300', 組別: '' })]);
  await expect(dialog.getByText('已匯入 1 位員工，0 筆需要處理。')).toBeVisible();
  await closeDialog(page, dialog);

  await expect(rowOf(page, '王小明')).toHaveCount(1);
  const row = rowOf(page, '王小明');
  await expect(cellOf(row, 'extension')).toHaveText('1300');
  await expect(cellOf(row, 'team')).toHaveText('—');
  await expect.poll(async () => (await employeeRows()).map((e) => [e.name, e.extension, e.team, e.note])).toEqual([
    ['王小明', '1300', null, '素食'],
  ]);
});

test('EMP-AC87：甲不參加 → 匯入含甲（分機改為 1235）與新員工丁的通訊錄 → 甲的分機更新、仍是不參加；丁是未報名（EMP-R66、D-014）', async ({
  page,
}) => {
  await insertEmployee({ name: '甲', department: '研發部', extension: '1234', declined: true });
  await gotoEmployees(page);
  const dialog = await importRecords(page, [
    rosterPerson('甲', '研發部', { 分機: '1235' }),
    rosterPerson('丁', '業務部', { 分機: '2001' }),
  ]);
  await expect(dialog.getByText('已匯入 2 位員工，0 筆需要處理。')).toBeVisible();
  await closeDialog(page, dialog);

  await expect(dataRows(page)).toHaveCount(2);
  const jia = rowOf(page, '甲');
  await expect(cellOf(jia, 'extension')).toHaveText('1235');
  await expect(jia.getByText('不參加', { exact: true })).toBeVisible();
  await expect(rowOf(page, '丁').getByText('未報名', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^不參加\s*1$/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^未報名\s*1$/ })).toBeVisible();
  await expect.poll(async () => (await employeeRows()).map((e) => [e.name, e.extension, e.declined])).toEqual([
    ['甲', '1235', true],
    ['丁', '2001', false],
  ]);
});

test('EMP-AC70：已有王小明（業務部）→ 匯入王小明（研發部）→ 名單有兩位王小明，業務部的不變（EMP-R55）', async ({ page }) => {
  await insertEmployee({ name: '王小明', department: '業務部', extension: '1234' });
  await gotoEmployees(page);
  const dialog = await importRecords(page, [rosterPerson('王小明', '研發部', { 分機: '2234' })]);
  await expect(dialog.getByText('已匯入 1 位員工，0 筆需要處理。')).toBeVisible();
  await closeDialog(page, dialog);

  await expect(rowOf(page, '王小明')).toHaveCount(2);
  await expect(cellOf(rowOf(page, '王小明').filter({ hasText: '業務部' }), 'extension')).toHaveText('1234');
  await expect(cellOf(rowOf(page, '王小明').filter({ hasText: '研發部' }), 'extension')).toHaveText('2234');
});

test('EMP-AC72：檔案 5 列其中 1 列部門空白 → 4 位新增，「已匯入 4 位員工，1 筆需要處理。」；「下載錯誤清單」的檔案包含這一列（EMP-R58、R59）', async ({
  page,
}) => {
  await gotoEmployees(page);
  const dialog = await importRecords(page, [
    rosterPerson('甲員工', '研發部'),
    rosterPerson('乙員工', '研發部'),
    rosterPerson('丙員工', '', { 分機: '1300', 英文名: 'Bing' }),
    rosterPerson('丁員工', '業務部'),
    rosterPerson('戊員工', '業務部'),
  ]);
  await expect(dialog.getByText('已匯入 4 位員工，1 筆需要處理。')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: '下載錯誤清單' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  const text = await downloadedText(download);
  expect(text).toContain('丙員工');
  expect(text).toContain('Bing');
  for (const name of ['甲員工', '乙員工', '丁員工', '戊員工']) expect(text).not.toContain(name);

  await closeDialog(page, dialog);
  await expect(dataRows(page)).toHaveCount(4);
  await expect(rowOf(page, '丙員工')).toHaveCount(0);
});

test('EMP-AC74：已選好檔案 → 按「取消」→ 對話框關閉，員工名單不變（EMP-R60）', async ({ page }) => {
  await insertEmployee({ name: '既有', department: '研發部' });
  await gotoEmployees(page);
  const dialog = await openImportDialog(page);
  await chooseFile(dialog, rosterCsv([rosterPerson('王小明', '業務部')]));
  await dialog.getByRole('button', { name: '取消', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(dataRows(page)).toHaveCount(1);
  expect((await employeeRows()).map((e) => e.name)).toEqual(['既有']);
});

test('EMP-AC75：匯入完成 → Sonner 與畫面都沒有「復原」（EMP-R31）', async ({ page }) => {
  await gotoEmployees(page);
  const dialog = await importRecords(page, [rosterPerson('王小明', '業務部')]);
  await expect(dialog.getByText('已匯入 1 位員工，0 筆需要處理。')).toBeVisible();
  await expectNoUndo(page);
  await closeDialog(page, dialog);
  await expectNoUndo(page);
});

test('目前通訊錄匯出檔（序號欄沒有欄名、「姓名」欄名前有空白、沒有「組別」欄）可以直接匯入；設備列略過；既有員工的組別不變（EMP-R51、EMP-R62、D-012）', async ({
  page,
}) => {
  await insertEmployee({ name: '王小明', department: '業務部', extension: '1234', team: '北區組' });
  await gotoEmployees(page);
  const dialog = await importRecords(
    page,
    withSerial([
      SWITCHBOARD_ROW,
      rosterPerson('王小明', '業務部', { 分機: '1300', 英文名: 'Xiaoming' }),
      { 分機: '2900', 姓名: '第二實驗室', 部門: '研發部', 地區: '台北' },
      rosterPerson('李小華', '研發部', { 分機: '2001', 英文名: 'Lisa' }),
    ]),
    ADDRESS_BOOK_HEADER,
  );
  await expect(dialog.getByText(FORMAT_ERROR)).toHaveCount(0);
  await expect(dialog.getByText('已匯入 2 位員工，0 筆需要處理。')).toBeVisible();
  await closeDialog(page, dialog);

  await expect(dataRows(page)).toHaveCount(2);
  await expect(rowOf(page, '第二實驗室')).toHaveCount(0);
  await expect(cellOf(rowOf(page, '王小明'), 'extension')).toHaveText('1300');
  await expect(cellOf(rowOf(page, '王小明'), 'team')).toHaveText('北區組');
  await expect(cellOf(rowOf(page, '李小華'), 'team')).toHaveText('—');
  // 序號（901 起）不會出現在畫面上
  for (const serial of ['901', '902', '903', '904']) await expect(page.getByText(serial, { exact: true })).toHaveCount(0);
});

test('匯入的員工依檔案的列順序排在既有員工之後（docs/architecture.md 第 11.1 節）', async ({ page }) => {
  await insertEmployee({ name: '既有', department: '測試部' });
  await gotoEmployees(page);
  const dialog = await importRecords(page, [rosterPerson('乙員工', '測試部'), rosterPerson('甲員工', '測試部')]);
  await expect(dialog.getByText('已匯入 2 位員工，0 筆需要處理。')).toBeVisible();
  await closeDialog(page, dialog);

  for (const [i, name] of ['既有', '乙員工', '甲員工'].entries()) {
    await expect(cellOf(dataRows(page).nth(i), 'name')).toContainText(name);
  }
});
