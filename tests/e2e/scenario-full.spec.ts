// 階段 3 整體驗證：核心情境全流程（docs/plan/implementation-plan.md 第 6 節第 2 項；docs/spec/README.md 第 1.2 節）。
// 一位承辦人從空的資料庫走完一輪，每一步都檢查畫面與資料庫：
//   1 登入（README 第 2、4 節、COM-AC21）
//   2 權限頁把協辦同仁設為編輯者、把現場工作人員設為檢視者（README 1.2 第 2 步；permissions.md PRM-R07～R09、AUTH-R14，D-026）
//   3 匯入通訊錄（含組別欄，employees.md EMP-R44～R62、EMP-R07、EMP-R08、EMP-R09）、標記不參加（EMP-R63）
//   4 匯入報名表（participants.md PPL-R64～R74：眷屬、兒童椅、素食、備註）、手動新增外部貴賓並選桌次（PPL-R51、PPL-R56）、
//     員工名單看得到誰還沒報名（EMP-R03、EMP-R08）
//   5 「入座…」（seating.md SEAT-R22～R25）、兩桌備註名稱（SEAT-R12）、自動排座「清空後重排」
//     （auto-arrange.md ARR-R02、R04～R07、R12～R15、D-009 員工與眷屬一定同桌）
//   6 拖移微調：搬到另一桌（SEAT-R19）、桌內調整順序（SEAT-R32）、拖進 10 位的桌成為第 11 位（SEAT-R02、R11、R75、R89，D-018）、
//     復原（SEAT-R76～R79）
//   7 名單異動：員工名單改已入座員工的部門 → 座位圖跟著變（EMP-R39、SEAT-R10）；取消報名 → 座位空出來（PPL-R14、PPL-R37）
//   8 匯出座位表（export.md EXP-R01、R03、R04、R06、R10～R13、R16、R19）
//   9 發布（permissions.md PRM-R17～R19），不在權限名單上的同仁（沒有權限）開座位安排看到「沒有權限」頁，按「查看座位表」到發布頁
//     搜尋自己的名字（PRM-R21、R30、R31、R33，AUTH-R15、AUTH-R16，D-026）
// 手機（README 1.2 第 10 步）另一個測試：檢視者（現場工作人員）在 320 px 開 /seats 查座位、開桌次看名單；開座位安排看得到資料但沒有編輯入口
//   （permissions.md 第 2.3 節、PRM-R26、R27；seating.md SEAT-R81、SEAT-R83、SEAT-R90；README COM-R19、COM-R20）。
// 資料都是虛構的：通訊錄 CSV 用 tests/helpers/employees-roster.ts，報名表 CSV 用 tests/helpers/participants-registration-csv.ts。
// 每個測試開頭自己清空資料、設定權限名單與發布狀態（helpers/scenario.ts 的 resetEverything）。
// 桌號（D-019）：資料庫用內部編號（1 = B1、2 = A1、3 = B4、4 = B7、5 = B10、6 = B13），畫面與匯出用桌號。
// 無障礙結構的假設見 helpers/seating-page.ts、helpers/permissions-page.ts 開頭。
//
// 自動排座的預期結果（清空後重排，有備註名稱的 B1「主桌」、A1「董事貴賓」不動）：
//   員工名單順序是通訊錄的列順序；部門依第一次出現的先後：總經理室、業務部、研發部、行政部（ARR-R05、ARR-Q05）。
//   候選人：B13 桌被清空的劉淑芬，加上 12 位未入座的員工與眷屬，共 13 位（林董是外部貴賓、高啟明坐在 B1 主桌，都不排）。
//   排座單位依序：業務部／北區組（王小明、王小明_眷屬、李美華、張志豪）4 位、業務部／南區組（林小青、黃建國）2 位、
//   研發部／前端組（周子翔、鄭雅文、謝承恩、謝承恩_眷屬）4 位、研發部／後端組（許家銘、蔡宜庭）2 位、行政部（劉淑芬）1 位。
//   填桌順序 B1、A1 有備註名稱，從 B4 開始：B4 依序放進前三個單位剛好 10 位；B7 放後端組與劉淑芬 3 位（ARR-R07）。
//   → Sonner「已把 13 位安排到 2 桌。」（ARR-R14：{n} 含重排回去的劉淑芬，同 ARR-AC09）。
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { SWITCHBOARD_ROW, rosterCsv, rosterPerson, type RosterRecord } from '../helpers/employees-roster';
import { headerTitle, TABLE_IDS, tableBlock } from '../helpers/export-sheet';
import { cellText, loadWorkbook, mergeRanges, taiwanDateStamp } from '../helpers/export-xlsx';
import { answer, registrationCsv } from '../helpers/participants-registration-csv';
import { setSessionCookie, signIn, signInAsViewer, signInWithoutAccess, TEST_USER, type TestUser } from './helpers/auth';
import { closeDb, employeeRows } from './helpers/employees-db';
import * as employeesPage from './helpers/employees-page';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { withDb } from './helpers/participants-db';
import * as peoplePage from './helpers/participants-page';
import { isPublished, memberList, setPublished } from './helpers/permissions-db';
import {
  addedToast,
  addMember,
  addRoleSelect,
  emailField,
  expectMemberList,
  expectNoAccessPage,
  gotoSeats,
  navNames,
  notFoundLine,
  openNav,
  openPublishDialog,
  publishCheckbox,
  recordWrites,
  resultLine,
  SEATS_TITLE,
  seatSearch,
  seatsLink,
  viewOnlyBadge,
} from './helpers/permissions-page';
import { navigateTo, resetEverything, waitForTablePatch } from './helpers/scenario';
import { noteNameOf, rosterNames, seed } from './helpers/seating-data';
import {
  chooseOption,
  clickUndo,
  detailRows,
  dragAndDrop,
  expectRoster,
  expectStats,
  expectToast,
  hasBorderColor,
  mapTable,
  openSeating,
  openTableDetail,
  panelTab,
  peoplePanel,
  personRow,
  rowAction,
  rowWithName,
  seatMap,
  tableButton,
  tableDetail,
  titleFor,
  toolbarButton,
  waitForOperation,
  zoomToRegular,
} from './helpers/seating-page';

const B1 = 1;
const A1 = 2;
const B4 = 3;
const B7 = 4;
const B10 = 5;
const B13 = 6;

/** 協辦同仁（虛構帳號）：承辦人在權限頁把他設為編輯者 */
const HELPER: TestUser = { name: '何佳穎', email: 'he.jiaying@program.com.tw', sub: 'e2e-scenario-helper' };
/** 現場工作人員（虛構帳號）：承辦人在權限頁把他設為檢視者（README 1.2 第 2 步） */
const ONSITE: TestUser = { name: '現場同仁', email: 'onsite.staff@program.com.tw', sub: 'e2e-scenario-onsite' };
/**
 * 員工名單上的「林小青」（虛構帳號）。全流程裡不在權限名單上（沒有權限），在發布頁搜尋自己的名字；
 * 手機的測試裡是檢視者（現場工作人員），活動當天查座位與統計列。
 */
const LIN: TestUser = { name: '林小青', email: 'lin.xiaoqing@program.com.tw', sub: 'e2e-scenario-lin' };

/** 虛構的公司通訊錄（範本欄位，含組別欄）；第一列是總機資訊，匯入時略過（EMP-R49） */
const ROSTER: readonly RosterRecord[] = [
  SWITCHBOARD_ROW,
  rosterPerson('高啟明', '總經理室', { 分機: '1001', 英文名: 'Chiming' }),
  rosterPerson('王小明', '業務部', { 分機: '1201', 英文名: 'Ming', 組別: '北區組' }),
  rosterPerson('李美華', '業務部', { 分機: '1202', 英文名: 'Meihua', 組別: '北區組' }),
  rosterPerson('林小青', '業務部', { 分機: '1211', 英文名: 'Ching', 組別: '南區組' }),
  rosterPerson('張志豪', '業務部', { 分機: '1203', 英文名: 'Howard', 組別: '北區組' }),
  rosterPerson('黃建國', '業務部', { 分機: '1212', 英文名: 'Kevin', 組別: '南區組' }),
  rosterPerson('周子翔', '研發部', { 分機: '2101', 英文名: 'Sean', 組別: '前端組' }),
  rosterPerson('鄭雅文', '研發部', { 分機: '2102', 英文名: 'Ya', 組別: '前端組' }),
  rosterPerson('許家銘', '研發部', { 分機: '2201', 英文名: 'Chiaming', 組別: '後端組' }),
  rosterPerson('謝承恩', '研發部', { 分機: '2103', 英文名: 'Ethan', 組別: '前端組' }),
  rosterPerson('蔡宜庭', '研發部', { 分機: '2202', 英文名: 'Tina', 組別: '後端組' }),
  rosterPerson('劉淑芬', '行政部', { 分機: '3001', 英文名: 'Fen' }),
  rosterPerson('楊文彬', '行政部', { 分機: '3002', 英文名: 'Ben' }),
  rosterPerson('吳佩珊', '行政部', { 分機: '3003', 英文名: 'Peggy' }),
];

/** 匯入後的員工名單順序（通訊錄的列順序） */
const EMPLOYEE_ORDER = [
  '高啟明',
  '王小明',
  '李美華',
  '林小青',
  '張志豪',
  '黃建國',
  '周子翔',
  '鄭雅文',
  '許家銘',
  '謝承恩',
  '蔡宜庭',
  '劉淑芬',
  '楊文彬',
  '吳佩珊',
];

/**
 * 虛構的尾牙報名表，簡寫「名字／部門／是否參加／是否攜帶眷屬／是否需要兒童座椅／本人飲食習慣／眷屬飲食習慣／備註」。
 * 王小明帶眷屬（需要兒童椅）、周子翔素食、謝承恩帶眷屬（眷屬蛋奶素）、林小青有備註；吳佩珊填不參加；楊文彬（不參加）沒有填。
 */
const ANSWERS = [
  answer('高啟明／總經理室／是／否／否／葷食'),
  answer('王小明／業務部／是／是／是／葷食／葷食'),
  answer('李美華／業務部／是／否'),
  answer('林小青／業務部／是／否／否／葷食／／需要靠走道'),
  answer('張志豪／業務部／是／否'),
  answer('黃建國／業務部／是／否'),
  answer('周子翔／研發部／是／否／否／素食'),
  answer('鄭雅文／研發部／是／否'),
  answer('許家銘／研發部／是／否'),
  answer('謝承恩／研發部／是／是／否／葷食／蛋奶素'),
  answer('蔡宜庭／研發部／是／否'),
  answer('劉淑芬／行政部／是／否'),
  answer('吳佩珊／行政部／否'),
];

/** 報名「是」的 12 位員工 */
const REGISTERED = EMPLOYEE_ORDER.filter((n) => n !== '楊文彬' && n !== '吳佩珊');

/** 自動排座後 B4 桌的名單（見檔頭的計算） */
const B4_AFTER_ARRANGE = [
  '王小明',
  '王小明_眷屬',
  '李美華',
  '張志豪',
  '林小青',
  '黃建國',
  '周子翔',
  '鄭雅文',
  '謝承恩',
  '謝承恩_眷屬',
];
/** 取消謝承恩的報名後（眷屬一併移除，其他人依序往前補，SEAT-R06） */
const B4_AFTER_CANCEL = B4_AFTER_ARRANGE.slice(0, 8);

test.afterAll(async () => {
  // 別讓「已發布」留給之後的測試；各測試仍會自己設定需要的狀態
  await setPublished(false);
  await closeDb();
});

/** 員工名單的四個分頁人數（EMP-R08） */
async function expectEmployeeTabs(page: Page, counts: Record<employeesPage.TabLabel, number>) {
  for (const label of employeesPage.TAB_LABELS) {
    await expect(employeesPage.tabOf(page, label), label).toHaveText(employeesPage.tabCount(label, counts[label]));
  }
}

/** 人員面板的列操作「入座…」→ 選桌次 →「確認入座」，等伺服器回應 */
async function seatViaMenu(page: Page, name: string, table: number) {
  await rowAction(page, personRow(page, name), '入座…');
  const dialog = page.getByRole('dialog', { name: `安排 ${name} 入座`, exact: true });
  await expect(dialog).toBeVisible();
  await chooseOption(page, dialog, /^桌次/, new RegExp(`^${titleFor(table)}`));
  const saved = waitForOperation(page);
  await dialog.getByRole('button', { name: '確認入座' }).click();
  expect((await saved).status(), `${name} 入座 ${titleFor(table)}`).toBe(200);
  await expect(dialog).toBeHidden();
}

/** 在桌次詳情輸入備註名稱後離開欄位（SEAT-R12），等伺服器回應；回傳詳情 */
async function typeNoteName(page: Page, table: number, value: string) {
  const detail = await openTableDetail(page, table);
  const field = detail.getByRole('textbox', { name: '備註名稱' });
  const saved = waitForTablePatch(page, table);
  await field.fill(value);
  await field.press('Tab');
  expect((await saved).status(), `${titleFor(table)}的備註名稱`).toBe(200);
  await expectToast(page, '已儲存', { undo: false });
  return detail;
}

/** 資料庫：每一位眷屬都和所屬員工同桌，並緊接在員工後面（D-009、ARR-R05） */
async function expectDependentsBesideHosts() {
  const people = await withDb((db) => db.people());
  const dependents = people.filter((p) => p.kind === 'DEPENDENT');
  expect(dependents.length, '有眷屬').toBeGreaterThan(0);
  for (const d of dependents) {
    const host = people.find((p) => p.id === d.hostId);
    expect(host, `${d.displayName} 的所屬員工`).toBeDefined();
    expect(d.tableId, `${d.displayName} 已入座`).not.toBeNull();
    expect(d.tableId, `${d.displayName} 和所屬員工同桌`).toBe(host?.tableId);
    expect(d.seatOrder, `${d.displayName} 緊接在所屬員工後面`).toBe((host?.seatOrder ?? -2) + 1);
  }
}

test.describe('核心情境全流程（桌面）', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(isMobileWidth(page), '全流程在桌面跑一次；手機的查詢見下一段');
  });

  test('承辦人從空的資料庫走完一輪：登入 → 設定編輯者 → 匯入員工 → 匯入報名表與新增貴賓 → 備註名稱與自動排座 → 拖移微調與復原 → 名單異動 → 匯出 → 發布並在發布頁找座位', async ({
    page,
    context,
    baseURL,
    browser,
  }) => {
    test.setTimeout(300_000);
    const base = requireBaseURL(baseURL);
    await resetEverything([TEST_USER.email]);
    await signIn(context, base);

    await test.step('1. 用編輯者登入 → 首頁是座位安排，30 桌都是空桌；導覽四項（含「權限」），沒有「只能檢視」', async () => {
      await openSeating(page);
      await expectStats(page, { seated: 0, total: 0, unseated: 0, empty: 300, full: 0 });
      await expect(peoplePanel(page).getByText('還沒有參與人員。', { exact: true })).toBeVisible();
      expect(await navNames(await openNav(page))).toEqual(['座位安排', '參與人員', '員工名單', '權限']);
      await expect(viewOnlyBadge(page)).toHaveCount(0);
    });

    await test.step('2. 權限頁把協辦同仁設為編輯者、把現場工作人員設為檢視者 → 依序加到清單最後、Sonner 沒有「復原」；兩人不必重新登入，開啟頁面就是各自的權限', async () => {
      await navigateTo(page, '權限');
      await expectMemberList(page, [{ email: TEST_USER.email, role: 'EDITOR' }]);

      await addMember(page, HELPER.email, 'EDITOR');
      await expectMemberList(page, [
        { email: TEST_USER.email, role: 'EDITOR' },
        { email: HELPER.email, role: 'EDITOR' },
      ]);
      await expect(emailField(page)).toHaveValue('');
      await expect(addRoleSelect(page)).toHaveText('檢視者');
      await expectToast(page, addedToast(HELPER.email, 'EDITOR'), { undo: false });

      // 權限選單維持預設的「檢視者」
      await addMember(page, ONSITE.email);
      await expectMemberList(page, [
        { email: TEST_USER.email, role: 'EDITOR' },
        { email: HELPER.email, role: 'EDITOR' },
        { email: ONSITE.email, role: 'VIEWER' },
      ]);
      await expectToast(page, addedToast(ONSITE.email, 'VIEWER'), { undo: false });
      await expect.poll(() => memberList()).toEqual([
        { email: TEST_USER.email, role: 'EDITOR' },
        { email: HELPER.email, role: 'EDITOR' },
        { email: ONSITE.email, role: 'VIEWER' },
      ]);

      const helperContext = await browser.newContext({ baseURL: base, viewport: page.viewportSize() ?? undefined });
      try {
        await setSessionCookie(helperContext, base, HELPER);
        const helperPage = await helperContext.newPage();
        await openSeating(helperPage);
        await expect(helperPage.getByRole('button', { name: '新增人員', exact: true }).first()).toBeVisible();
        await expect(helperPage.getByRole('button', { name: '發布', exact: true })).toBeVisible();
        await expect(viewOnlyBadge(helperPage)).toHaveCount(0);
      } finally {
        await helperContext.close();
      }

      const onsiteContext = await browser.newContext({ baseURL: base, viewport: page.viewportSize() ?? undefined });
      try {
        await setSessionCookie(onsiteContext, base, ONSITE);
        const onsitePage = await onsiteContext.newPage();
        await openSeating(onsitePage);
        await expect(viewOnlyBadge(onsitePage)).toBeVisible();
        await expect(onsitePage.getByRole('button', { name: '新增人員', exact: true })).toHaveCount(0);
        await expect(onsitePage.getByRole('button', { name: '匯出座位表', exact: true })).toBeVisible();
        expect(await navNames(await openNav(onsitePage))).toEqual(['座位安排', '參與人員', '員工名單']);
      } finally {
        await onsiteContext.close();
      }
    });

    await test.step('3. 員工名單匯入通訊錄（含組別欄）→ 14 位、分頁人數正確；標記楊文彬為不參加', async () => {
      await navigateTo(page, '員工名單');
      await expect(page.getByText('還沒有員工名單。', { exact: true })).toBeVisible();

      await employeesPage.pageButton(page, '匯入員工名單').click();
      const dialog = page.getByRole('dialog', { name: '匯入員工名單' });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('檔案').setInputFiles({
        name: 'roster.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(rosterCsv(ROSTER), 'utf8'),
      });
      await expect(dialog.getByText('roster.csv')).toBeVisible();
      await dialog.getByRole('button', { name: '開始匯入' }).click();
      await expect(dialog.getByText('已匯入 14 位員工，0 筆需要處理。')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();

      // 畫面：四個分頁的人數、一頁 20 列放得下 14 列、欄位內容
      await expectEmployeeTabs(page, { 全部: 14, 未報名: 14, 已報名: 0, 不參加: 0 });
      await expect(employeesPage.dataRows(page)).toHaveCount(14);
      await expect(page.getByText('第 1-14 列，共 14 列')).toBeVisible();
      const wang = employeesPage.rowOf(page, '王小明');
      await expect(employeesPage.cellOf(wang, 'department')).toHaveText('業務部');
      await expect(employeesPage.cellOf(wang, 'team')).toHaveText('北區組');
      await expect(employeesPage.cellOf(wang, 'extension')).toHaveText('1201');
      await expect(employeesPage.cellOf(wang, 'status')).toHaveText('未報名');
      await expect(employeesPage.cellOf(employeesPage.rowOf(page, '劉淑芬'), 'team')).toHaveText('—');

      // 資料庫：依檔案的列順序、組別有存
      const rows = await employeeRows();
      expect(rows.map((e) => e.name)).toEqual(EMPLOYEE_ORDER);
      expect(rows.find((e) => e.name === '謝承恩')).toMatchObject({
        department: '研發部',
        team: '前端組',
        extension: '2103',
        declined: false,
      });
      expect(rows.find((e) => e.name === '高啟明')?.team ?? null).toBeNull();

      // 標記不參加：不需確認、Sonner 不帶「復原」（EMP-R63、EMP-R31）
      const menu = await employeesPage.openRowMenu(page, employeesPage.rowOf(page, '楊文彬'));
      await menu.getByRole('menuitem', { name: '標記為不參加', exact: true }).click();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expectToast(page, '已把 楊文彬 標記為不參加。', { undo: false });
      await expect(employeesPage.cellOf(employeesPage.rowOf(page, '楊文彬'), 'status')).toHaveText('不參加');
      await expectEmployeeTabs(page, { 全部: 14, 未報名: 13, 已報名: 0, 不參加: 1 });
      await expect.poll(async () => (await employeeRows()).find((e) => e.name === '楊文彬')?.declined).toBe(true);
    });

    await test.step('4. 參與人員頁匯入報名表 → 12 位員工、2 位眷屬，兒童椅、素食、備註正確；手動新增外部貴賓林董並選 B1 桌；員工名單看得到誰還沒報名', async () => {
      await navigateTo(page, '參與人員');
      await expect(page.getByText('還沒有參與人員。', { exact: true })).toBeVisible();

      const dialog = await peoplePage.openImportDialog(page);
      await peoplePage.chooseCsv(dialog, registrationCsv(ANSWERS));
      await dialog.getByRole('button', { name: '開始匯入', exact: true }).click();
      await expect(dialog.getByText('已匯入 12 位，0 筆需要處理。', { exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: '下載錯誤清單' })).toHaveCount(0);
      await dialog.getByRole('button', { name: '關閉', exact: true }).first().click();
      await expect(dialog).toBeHidden();

      // 畫面
      for (const name of REGISTERED) await expect(peoplePage.personRow(page, name), name).toHaveCount(1);
      await expect(peoplePage.personRow(page, '吳佩珊')).toHaveCount(0);
      await expect(peoplePage.personRow(page, '楊文彬')).toHaveCount(0);
      const wangDependent = peoplePage.personRow(page, '王小明_眷屬');
      await expect(peoplePage.cellOf(wangDependent, '類別')).toHaveText('眷屬');
      await expect(peoplePage.cellOf(wangDependent, '部門或單位')).toHaveText('業務部');
      await expect(peoplePage.cellOf(wangDependent, '分機')).toHaveText('—');
      await expect(peoplePage.markIn(peoplePage.cellOf(wangDependent, '標示'), '兒童椅')).toBeVisible();
      await expect(peoplePage.markIn(peoplePage.cellOf(peoplePage.personRow(page, '周子翔'), '標示'), '素食')).toBeVisible();
      await expect(peoplePage.markIn(peoplePage.cellOf(peoplePage.personRow(page, '謝承恩_眷屬'), '標示'), '素食')).toBeVisible();
      await expect(peoplePage.cellOf(peoplePage.personRow(page, '王小明'), '分機')).toHaveText('1201');
      await expect(peoplePage.cellOf(peoplePage.personRow(page, '王小明'), '桌次')).toHaveText('未入座');
      await expect(peoplePage.cellOf(peoplePage.personRow(page, '林小青'), '備註')).toHaveText('需要靠走道');

      // 資料庫
      const people = await withDb((db) => db.people());
      expect(people).toHaveLength(14);
      const byName = new Map(people.map((p) => [p.displayName, p]));
      expect(
        people
          .filter((p) => p.kind === 'EMPLOYEE')
          .map((p) => p.displayName)
          .sort(),
      ).toEqual([...REGISTERED].sort());
      expect(byName.get('王小明_眷屬')).toMatchObject({
        kind: 'DEPENDENT',
        hostId: byName.get('王小明')?.id,
        childSeat: true,
        vegetarian: false,
      });
      expect(byName.get('王小明_眷屬')?.relation ?? '', '稱謂空白（PPL-R73）').toBe('');
      expect(byName.get('謝承恩_眷屬')).toMatchObject({
        kind: 'DEPENDENT',
        hostId: byName.get('謝承恩')?.id,
        childSeat: false,
        vegetarian: true,
      });
      expect(byName.get('周子翔')).toMatchObject({ vegetarian: true, childSeat: false });
      expect(byName.get('王小明')).toMatchObject({ vegetarian: false, childSeat: false });
      expect(byName.get('林小青')?.note).toBe('需要靠走道');
      expect(people.every((p) => p.tableId === null), '匯入的人都是未入座').toBe(true);

      // 手動新增外部貴賓，桌次選 B1 桌
      const guestDialog = await peoplePage.openNewPersonDialog(page);
      await peoplePage.chooseOption(page, peoplePage.selectField(guestDialog, '類別'), '外部貴賓');
      await peoplePage.textField(guestDialog, '姓名').fill('林董');
      await peoplePage.textField(guestDialog, '單位／頭銜').fill('測試科技 董事長');
      await peoplePage.chooseOption(page, peoplePage.selectField(guestDialog, '桌次'), /^B1 桌（剩 10 位）/);
      await guestDialog.getByRole('button', { name: '新增人員', exact: true }).click();
      await expect(guestDialog).toBeHidden();
      await expectToast(page, '已新增 林董。', { undo: false });
      const guest = peoplePage.personRow(page, '林董');
      await expect(peoplePage.cellOf(guest, '類別')).toHaveText('外部貴賓');
      await expect(peoplePage.cellOf(guest, '部門或單位')).toHaveText('測試科技 董事長');
      await expect(peoplePage.cellOf(guest, '桌次')).toHaveText('B1');
      await expect
        .poll(() => withDb((db) => db.find('林董')))
        .toMatchObject({ kind: 'GUEST', organization: '測試科技 董事長', tableId: B1 });

      // 員工名單看得到誰還沒報名（README 1.2 第 4 步、EMP-R03）
      await navigateTo(page, '員工名單');
      await expectEmployeeTabs(page, { 全部: 14, 未報名: 1, 已報名: 12, 不參加: 1 });
      await expect(employeesPage.cellOf(employeesPage.rowOf(page, '王小明'), 'status')).toHaveText('已報名');
      await expect(employeesPage.cellOf(employeesPage.rowOf(page, '吳佩珊'), 'status')).toHaveText('未報名');
      await expect(employeesPage.cellOf(employeesPage.rowOf(page, '楊文彬'), 'status')).toHaveText('不參加');
    });

    await test.step('5. 座位安排：「入座…」兩位、B1「主桌」與 A1「董事貴賓」→ 自動排座「清空後重排」→ Sonner「已把 13 位安排到 2 桌。」、有備註名稱的桌不動、員工和眷屬同桌', async () => {
      await navigateTo(page, '座位安排');
      await expect(tableButton(page, B1)).toBeVisible();
      await expectStats(page, { seated: 1, total: 15, unseated: 14, empty: 299, full: 0 });

      await seatViaMenu(page, '高啟明', B1);
      await expectToast(page, '已把 高啟明 安排到 B1 桌。', { undo: true });
      await seatViaMenu(page, '劉淑芬', B13);
      await expectToast(page, '已把 劉淑芬 安排到 B13 桌。', { undo: true });
      expect(await rosterNames(B1)).toEqual(['林董', '高啟明']);
      expect(await rosterNames(B13)).toEqual(['劉淑芬']);

      await typeNoteName(page, B1, '主桌');
      await expect.poll(() => noteNameOf(B1)).toBe('主桌');
      const a1 = await typeNoteName(page, A1, '董事貴賓');
      await expect.poll(() => noteNameOf(A1)).toBe('董事貴賓');
      await a1.getByRole('button', { name: '關閉' }).first().click();
      await expect(tableDetail(page, A1)).toHaveCount(0);
      await expectStats(page, { seated: 3, total: 15, unseated: 12, empty: 297, full: 0 });

      // 自動排座：選「清空後重排」
      await toolbarButton(page, '自動排座').click();
      const dialog = page.getByRole('dialog', { name: '自動排座', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('radio', { name: /^只排未入座的 12 位/ })).toBeChecked();
      const rebuild = dialog.getByRole('radio', { name: '清空後重排（有備註名稱的 2 桌不動）' });
      await rebuild.check();
      const saved = waitForOperation(page);
      await dialog.getByRole('button', { name: '開始排座' }).click();
      expect((await saved).status(), '自動排座的請求成功').toBe(200);
      await expect(dialog).toBeHidden();
      await expectToast(page, '已把 13 位安排到 2 桌。', { undo: true });

      // 畫面
      await expectStats(page, { seated: 15, total: 15, unseated: 0, empty: 285, full: 1 });
      await expect(mapTable(page, B4)).toContainText('已滿');
      await expect(mapTable(page, B7)).toContainText('3/10');
      await expect(mapTable(page, B13)).toContainText('0/10');
      await expect(mapTable(page, B1)).toContainText('2/10');
      await expect(mapTable(page, A1)).toContainText('0/10');

      // 資料庫：有備註名稱的兩桌（名單、順序、備註名稱）都不動；B13 被清空；其他桌沒有備註名稱
      expect(await rosterNames(B1)).toEqual(['林董', '高啟明']);
      expect(await rosterNames(A1)).toEqual([]);
      expect(await noteNameOf(B1)).toBe('主桌');
      expect(await noteNameOf(A1)).toBe('董事貴賓');
      expect(await rosterNames(B4)).toEqual(B4_AFTER_ARRANGE);
      expect(await rosterNames(B7)).toEqual(['許家銘', '蔡宜庭', '劉淑芬']);
      expect(await rosterNames(B13)).toEqual([]);
      for (const t of [B4, B7, B13]) expect(await noteNameOf(t), titleFor(t)).toBeNull();
      await expectDependentsBesideHosts();

      // 桌次詳情：名單順序、兒童椅與素食的數量（從報名表帶過來）、部門
      const b4 = await openTableDetail(page, B4);
      await expectRoster(detailRows(b4), B4_AFTER_ARRANGE);
      await expect(b4).toContainText('10/10 人');
      await expect(b4).toContainText('兒童椅 1 張');
      await expect(b4).toContainText('素食 2 位');
      await expect(b4).toContainText('部門：業務部＋研發部');
      await b4.getByRole('button', { name: '關閉' }).first().click();
      await expect(tableDetail(page, B4)).toHaveCount(0);
    });

    await test.step('6. 拖移微調：劉淑芬搬到 B10 桌、B7 桌內調整順序、許家銘拖進 10 位的 B4 桌成為第 11 位（「超過」與後綴）、按「復原」撤回', async () => {
      await panelTab(page, '全部').click();

      // 搬到另一桌（SEAT-R19）
      let saved = waitForOperation(page);
      await dragAndDrop(page, personRow(page, '劉淑芬'), tableButton(page, B10));
      expect((await saved).status()).toBe(200);
      await expectToast(page, '已把 劉淑芬 從 B7 桌移到 B10 桌。', { undo: true });
      await expect(mapTable(page, B10)).toContainText('1/10');
      await expect(mapTable(page, B7)).toContainText('2/10');
      expect(await rosterNames(B10)).toEqual(['劉淑芬']);
      expect(await rosterNames(B7)).toEqual(['許家銘', '蔡宜庭']);

      // 桌內調整順序（SEAT-R32）
      const b7 = await openTableDetail(page, B7);
      saved = waitForOperation(page);
      await dragAndDrop(page, rowWithName(detailRows(b7), page, '蔡宜庭'), rowWithName(detailRows(b7), page, '許家銘'));
      expect((await saved).status()).toBe(200);
      await expectToast(page, '已調整 B7 桌的座位順序。', { undo: true });
      await expectRoster(detailRows(b7), ['蔡宜庭', '許家銘']);
      await expect(b7).toContainText('2/10 人');
      await expect.poll(() => rosterNames(B7)).toEqual(['蔡宜庭', '許家銘']);
      await b7.getByRole('button', { name: '關閉' }).first().click();
      await expect(tableDetail(page, B7)).toHaveCount(0);

      // 拖進 10 位的 B4 桌成為第 11 位（SEAT-R02、SEAT-R11、SEAT-R89，D-018）
      const overflowToast = '已把 許家銘 從 B7 桌移到 B4 桌，這一桌已超過 10 位。';
      saved = waitForOperation(page);
      await dragAndDrop(page, personRow(page, '許家銘'), tableButton(page, B4));
      expect((await saved).status()).toBe(200);
      await expectToast(page, overflowToast, { undo: true });
      await expect(mapTable(page, B4)).toContainText('超過');
      await expect(mapTable(page, B4)).not.toContainText('已滿');
      await expectStats(page, { seated: 15, total: 15, unseated: 0, empty: 286, full: 1, over: 1 });
      expect(await rosterNames(B4)).toEqual([...B4_AFTER_ARRANGE, '許家銘']);
      expect(await rosterNames(B7)).toEqual(['蔡宜庭']);

      // 復原一次：許家銘回到 B7 桌原本的座號，B4 桌回到 10 位「已滿」（SEAT-R78、SEAT-R79）
      saved = waitForOperation(page);
      await clickUndo(page, overflowToast);
      expect((await saved).status()).toBe(200);
      await expectToast(page, '已復原。', { undo: false });
      await expect.poll(() => rosterNames(B7)).toEqual(['蔡宜庭', '許家銘']);
      expect(await rosterNames(B4)).toEqual(B4_AFTER_ARRANGE);
      await expect(mapTable(page, B4)).toContainText('已滿');
      await expect(mapTable(page, B4)).not.toContainText('超過');
      await expectStats(page, { seated: 15, total: 15, unseated: 0, empty: 285, full: 1 });
    });

    await test.step('7. 名單異動：員工名單把劉淑芬（坐 B10 桌）的部門改成業務部 → 座位圖的部門跟著變；取消謝承恩的報名 → 他和眷屬的座位空出來', async () => {
      // 改部門（EMP-R39、SEAT-R10）
      await navigateTo(page, '員工名單');
      const menu = await employeesPage.openRowMenu(page, employeesPage.rowOf(page, '劉淑芬'));
      await menu.getByRole('menuitem', { name: '編輯', exact: true }).click();
      const edit = page.getByRole('dialog', { name: '編輯員工' });
      await expect(edit).toBeVisible();
      await employeesPage.choose(page, edit.getByRole('combobox', { name: '部門', exact: true }), '業務部');
      await edit.getByRole('button', { name: '儲存', exact: true }).click();
      await expect(edit).toBeHidden();
      await expectToast(page, '已儲存', { undo: false });
      await expect(employeesPage.cellOf(employeesPage.rowOf(page, '劉淑芬'), 'department')).toHaveText('業務部');
      await expect.poll(async () => (await employeeRows()).find((e) => e.name === '劉淑芬')?.department).toBe('業務部');

      await navigateTo(page, '座位安排');
      const b10 = await openTableDetail(page, B10);
      await expect(b10).toContainText('部門：業務部');
      await expect(b10).not.toContainText('行政部');
      await expect(rowWithName(detailRows(b10), page, '劉淑芬')).toContainText('業務部・分機 3001');
      await b10.getByRole('button', { name: '關閉' }).first().click();
      await expect(tableDetail(page, B10)).toHaveCount(0);
      // 收合的桌次在 80% 以上顯示部門（2.1.5）
      await zoomToRegular(page);
      await expect(mapTable(page, B10)).toContainText('業務部');
      await expect(mapTable(page, B10)).not.toContainText('行政部');
      expect(await rosterNames(B10)).toEqual(['劉淑芬']);

      // 取消報名（PPL-R14、PPL-R37）
      await navigateTo(page, '參與人員');
      await peoplePage.rowAction(page, '謝承恩', '取消報名');
      const cancel = page.getByRole('alertdialog', { name: '要取消 謝承恩 的報名嗎？' });
      await expect(cancel).toBeVisible();
      await cancel.getByRole('button', { name: '確認取消報名' }).click();
      await expect(cancel).toBeHidden();
      await expectToast(page, '已取消 謝承恩 的報名。', { undo: false });
      await expect(peoplePage.personRow(page, '謝承恩')).toHaveCount(0);
      await expect(peoplePage.personRow(page, '謝承恩_眷屬')).toHaveCount(0);
      await expect.poll(() => rosterNames(B4)).toEqual(B4_AFTER_CANCEL);
      expect(await withDb((db) => db.participantCount())).toBe(13);
      expect((await employeeRows()).map((e) => e.name), '員工名單不變').toContain('謝承恩');

      await navigateTo(page, '座位安排');
      await expect(mapTable(page, B4)).toContainText('8/10');
      await expectStats(page, { seated: 13, total: 13, unseated: 0, empty: 287, full: 0 });
    });

    await test.step('8. 匯出座位表 → 下載「座位表_{台灣日期}.xlsx」；每一桌的標題格第一行是「{桌號} 桌」，人數、備註名稱、部門與名單正確', async () => {
      const before = taiwanDateStamp();
      const downloading = page.waitForEvent('download');
      await page.getByRole('button', { name: '匯出座位表', exact: true }).click();
      const download = await downloading;
      expect([before, taiwanDateStamp()].map((d) => `座位表_${d}.xlsx`)).toContain(download.suggestedFilename());
      await expectToast(page, '已匯出座位表。', { undo: false });

      const wb = await loadWorkbook(await readFile(await download.path()));
      expect(wb.worksheets.map((w) => w.name)).toEqual(['座位表']);
      const ws = wb.worksheets[0];
      if (!ws) throw new Error('檔案裡沒有工作表');
      const text = (address: string) => cellText(ws.getCell(address));
      const merges = mergeRanges(ws);

      // 沒有桌次超過 10 位：30 桌都在規格 3.3 節的位置；人數加起來是已入座的 13 位
      let seated = 0;
      for (const n of TABLE_IDS) {
        const block = tableBlock(n);
        expect(merges, headerTitle(n)).toContain(block.range);
        const title = text(block.header);
        expect(title.split('\n')[0], headerTitle(n)).toBe(headerTitle(n));
        seated += Number(/\((\d+)\)$/.exec(title)?.[1] ?? Number.NaN);
      }
      expect(seated).toBe(13);

      expect(text('G1')).toBe('B1 桌\n主桌\n總經理室＋貴賓\n(2)');
      expect(tableBlock(B1).list.slice(0, 3).map((a) => text(a))).toEqual(['林董', '高啟明', '']);
      expect(text('D1')).toBe('A1 桌\n董事貴賓\n空桌\n(0)');
      expect(text('I21')).toBe('B4 桌\n業務部＋研發部\n(8)');
      expect(tableBlock(B4).list.map((a) => text(a))).toEqual([
        '王小明',
        '王小明_眷屬(+兒童椅)',
        '李美華',
        '張志豪',
        '林小青',
        '黃建國',
        '周子翔(素食)',
        '鄭雅文',
        '',
        '',
      ]);
      expect(text('I41')).toBe('B7 桌\n研發部\n(2)');
      expect(tableBlock(B7).list.slice(0, 3).map((a) => text(a))).toEqual(['蔡宜庭', '許家銘', '']);
      expect(text('I61')).toBe('B10 桌\n業務部\n(1)');
      expect(text('J61')).toBe('劉淑芬');
      expect(text('I81')).toBe('B13 桌\n空桌\n(0)');
      expect(text('K1')).toBe('工作人員\n(0)');
      // 沒有未入座的人：第 111 列以下沒有內容（EXP-R19）
      expect(text('B112')).toBe('');
      expect(text('C112')).toBe('');
    });

    await test.step('9. 開啟發布 → 不在權限名單上的林小青開座位安排是「沒有權限」頁，按「查看座位表」到 /seats，搜尋自己的名字看到「林小青：B4 桌」；取消報名的人找不到', async () => {
      const dialog = await openPublishDialog(page);
      await expect(dialog.getByText('未發布', { exact: true })).toBeVisible();
      await publishCheckbox(dialog).click();
      await expect(dialog.getByText('已發布', { exact: true })).toBeVisible();
      await expectToast(page, '已發布座位表。', { undo: false });
      await expect.poll(() => isPublished()).toBe(true);
      await dialog.getByRole('button', { name: '關閉', exact: true }).last().click();
      await expect(dialog).toBeHidden();

      const viewerContext = await browser.newContext({ baseURL: base, viewport: page.viewportSize() ?? undefined });
      try {
        await signInWithoutAccess(viewerContext, base, LIN);
        const viewer = await viewerContext.newPage();
        const writes = recordWrites(viewer);
        await viewer.goto('/');
        await expectNoAccessPage(viewer, LIN.email);
        await seatsLink(viewer).click();
        await expect(viewer).toHaveURL((url) => url.pathname === '/seats');
        await expect(viewer.getByRole('heading', { level: 1, name: SEATS_TITLE })).toBeVisible();
        await expect(seatMap(viewer)).toBeVisible();

        await seatSearch(viewer).fill('林小青');
        await expect(resultLine(viewer, '林小青：B4 桌')).toBeVisible();
        await expect.poll(() => hasBorderColor(viewer, mapTable(viewer, B4), '--accent', '2px')).toBe(true);

        await seatSearch(viewer).fill('王小明');
        await expect(resultLine(viewer, '王小明：B4 桌')).toBeVisible();
        await expect(resultLine(viewer, '王小明_眷屬：B4 桌')).toBeVisible();

        await seatSearch(viewer).fill('謝承恩');
        await expect(notFoundLine(viewer, '謝承恩')).toBeVisible();
        expect(writes).toEqual([]);
      } finally {
        await viewerContext.close();
      }
    });
  });
});

test.describe('手機：檢視者（現場工作人員）查座位（README 1.2 第 9、10 步）', () => {
  test('320 px：在 /seats 搜尋自己的名字、點桌次看名單；開座位安排看得到資料（含分機、兒童椅、素食），但沒有任何編輯入口，也沒有整頁水平捲動', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(!isMobileWidth(page), '手機寬度（mobile-320）');
    test.setTimeout(120_000);
    await resetEverything([TEST_USER.email]);
    await seed(async (s) => {
      await s.noteName(B1, '主桌');
      await s.employee('高啟明', { department: '總經理室', extension: '1001', tableId: B1 });
      await s.guest('林董', { organization: '測試科技 董事長', tableId: B1 });
      const wang = await s.employee('王小明', { department: '業務部', team: '北區組', extension: '1201', tableId: B4 });
      await s.dependent(wang, { tableId: B4, childSeat: true });
      await s.employee('林小青', { department: '業務部', team: '南區組', extension: '1211', tableId: B4 });
      await s.employee('周子翔', { department: '研發部', team: '前端組', extension: '2101', tableId: B4, vegetarian: true });
      await s.employee('劉淑芬', { department: '行政部', extension: '3001' });
    });
    await setPublished(true);
    await signInAsViewer(context, requireBaseURL(baseURL), LIN);
    const writes = recordWrites(page);

    await test.step('發布頁：搜尋「林小青」→「林小青：B4 桌」；點 B4 桌 → Dialog 只有座號與顯示名稱', async () => {
      await gotoSeats(page);
      await expectNoHorizontalScroll(page);
      await seatSearch(page).fill('林小青');
      await expect(resultLine(page, '林小青：B4 桌')).toBeVisible();
      await expectNoHorizontalScroll(page);

      await tableButton(page, B4).click();
      const list = page.getByRole('dialog', { name: 'B4 桌', exact: true });
      await expect(list).toBeVisible();
      // 發布頁的桌次名單沒有人數副標（permissions.md 第 2.3 節「桌次名單」、D-025）
      await expect(list).not.toContainText(/\d+\s*\/\s*10/);
      await expect(list).toContainText('部門：業務部＋研發部');
      await expectRoster(detailRows(list), ['王小明', '王小明_眷屬', '林小青', '周子翔']);
      // 發布頁不顯示分機、組別、兒童椅、素食（PRM-R27）
      await expect(list.getByText(/分機|1211|南區組|兒童椅|素食/)).toHaveCount(0);
      const box = await list.boundingBox();
      if (!box) throw new Error('量不到桌次名單');
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      await expectNoHorizontalScroll(page);
      await list.getByRole('button', { name: '關閉' }).first().click();
      await expect(list).toHaveCount(0);
    });

    await test.step('座位安排頁：Header「只能檢視」；只有「匯出座位表」，沒有新增、發布、自動排座與拖移把手；統計列照常', async () => {
      await openSeating(page);
      await expect(viewOnlyBadge(page)).toBeVisible();
      await expect(page.getByRole('button', { name: '匯出座位表', exact: true })).toBeVisible();
      for (const name of ['新增人員', '發布', '自動排座']) {
        await expect(page.getByRole('button', { name, exact: true }), name).toHaveCount(0);
      }
      await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);
      await expectStats(page, { seated: 6, total: 7, unseated: 1, empty: 294, full: 0 });
      await expectNoHorizontalScroll(page);
    });

    await test.step('「人員」分頁：看得到未入座的人與已入座的桌號，沒有列操作', async () => {
      await page.getByRole('tab', { name: '人員', exact: true }).click();
      await expect(personRow(page, '劉淑芬')).toBeVisible();
      await panelTab(page, '全部').click();
      await expect(personRow(page, '林小青').getByRole('button', { name: 'B4', exact: true })).toBeVisible();
      await expect(peoplePanel(page).getByRole('button', { name: '更多操作' })).toHaveCount(0);
      await expectNoHorizontalScroll(page);
    });

    await test.step('「座位圖」分頁點 B4 桌 → Dialog 看得到分機、兒童椅、素食；只有「關閉」，沒有備註名稱欄位與任何修改的按鈕', async () => {
      await page.getByRole('tab', { name: '座位圖', exact: true }).click();
      await tableButton(page, B4).click();
      const detail = page.getByRole('dialog', { name: 'B4 桌', exact: true });
      await expect(detail).toBeVisible();
      await expect(detail).toContainText('4/10 人');
      await expect(detail).toContainText('兒童椅 1 張');
      await expect(detail).toContainText('素食 1 位');
      await expect(rowWithName(detailRows(detail), page, '林小青')).toContainText('業務部・分機 1211');
      await expect(detail.getByRole('textbox')).toHaveCount(0);
      const buttons = detail.getByRole('button');
      const count = await buttons.count();
      expect(count, '至少有關閉鈕').toBeGreaterThan(0);
      for (let i = 0; i < count; i++) await expect(buttons.nth(i)).toHaveAccessibleName('關閉');
      await expectNoHorizontalScroll(page);
    });

    expect(writes, '檢視者沒有送出任何寫入').toEqual([]);
  });
});
