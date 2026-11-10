// 只能檢視時的參與人員頁與員工名單：docs/spec/participants.md PPL-R86、第 5.10 節 PPL-AC85～AC90；docs/spec/employees.md EMP-R67、
// EMP-AC89～AC93；docs/spec/README.md COM-R19、COM-AC23（參與人員與員工名單的部分）、AUTH-R13；D-021。
// 「乙在權限頁移除了甲」用 helpers/permissions-db.ts 的 removeEditor 直接改資料庫模擬。
// 只能檢視時未報名的員工沒有「更多操作」，所以這裡用含姓名的列定位（helpers/employees-page.ts 的 dataRows 只找有列操作的列）。
import { expect, test, type Page } from '@playwright/test';
import { signIn, signInAsViewer, TEST_USER } from './helpers/auth';
import {
  closeDb,
  declinedOf,
  insertEmployee,
  registerEmployee,
  resetData,
} from './helpers/employees-db';
import { gotoEmployees, searchBox as employeeSearch, tabOf, filterTrigger } from './helpers/employees-page';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { withDb } from './helpers/participants-db';
import {
  cellOf,
  chooseOption,
  filterSelect,
  gotoPeople,
  listedNames,
  markIn,
  openNewPersonDialog,
  personRow,
  searchBox,
  selectField,
} from './helpers/participants-page';
import { removeEditor } from './helpers/permissions-db';
import { NOT_EDITOR_TOAST, viewOnlyBadge } from './helpers/permissions-page';
import { expectToast, tableDetail } from './helpers/seating-page';

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面的表格與對話框');
const button = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name, exact: true });
/** 含這個姓名的列（桌面是表格列，手機是卡片），不依賴列操作 */
const rowWith = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name });

test.afterAll(async () => {
  await closeDb();
});

// ---- 參與人員

/** 王小明（研發一部，分機 1234，素食）與眷屬（兒童椅）坐 B4 桌（內部編號 3）；林董（外部貴賓）有備註；陳大文還沒報名 */
async function seedPeople() {
  return withDb(async (db) => {
    await db.reset();
    const { participantId: wang } = await db.registerNew(
      { name: '王小明', department: '研發一部', extension: '1234' },
      { tableId: 3, vegetarian: true },
    );
    await db.dependent(wang, { relation: '配偶', childSeat: true, tableId: 3 });
    await db.guest('林董', { organization: '測試科技 董事長', note: '需要靠走道' });
    const chen = await db.employee({ name: '陳大文', department: '研發一部' });
    return { wang, chen };
  });
}

test.describe('參與人員：只能檢視（PPL-R86）', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInAsViewer(context, requireBaseURL(baseURL));
  });

  test('PPL-AC85：資料和編輯者相同（分機、標示、備註）；頁首只有「匯出座位表」；沒有列操作；搜尋「1234」與類別篩選「眷屬」照常', async ({
    page,
  }) => {
    await seedPeople();
    await gotoPeople(page);

    await expect(personRow(page, '王小明')).toContainText('1234');
    await expect(markIn(personRow(page, '王小明'), '素食').first()).toBeVisible();
    await expect(markIn(personRow(page, '王小明_眷屬'), '兒童椅').first()).toBeVisible();
    if (!isMobileWidth(page)) {
      await expect(cellOf(personRow(page, '王小明'), '分機')).toHaveText('1234');
      await expect(cellOf(personRow(page, '林董'), '備註')).toContainText('需要靠走道');
      await expect(page.getByRole('columnheader', { name: '操作' })).toHaveCount(0);
    }

    await expect(button(page, '匯出座位表')).toBeVisible();
    await expect(button(page, '新增人員')).toHaveCount(0);
    await expect(button(page, '匯入參與人員')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '更多操作' })).toHaveCount(0);

    await searchBox(page).fill('1234');
    await expect.poll(() => listedNames(page)).toEqual(['王小明']);
    await searchBox(page).fill('');
    await chooseOption(page, filterSelect(page, '類別'), '眷屬');
    await expect.poll(() => listedNames(page)).toEqual(['王小明_眷屬']);
    await expect(viewOnlyBadge(page)).toBeVisible();
  });

  test('PPL-AC86：王小明在 B4 桌 → 按他那一列的「B4」→ 開啟座位安排與 B4 桌的詳情，詳情沒有任何修改的按鈕', async ({ page }) => {
    await seedPeople();
    await gotoPeople(page);
    await personRow(page, '王小明').getByRole('link', { name: 'B4', exact: true }).click();

    await expect(page).toHaveURL((url) => url.pathname === '/' && url.searchParams.get('table') === 'B4');
    const detail = tableDetail(page, 'B4');
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('textbox', { name: '備註名稱' })).toHaveCount(0);
    for (const name of ['加入人員', '調換桌次…', '清空桌次']) await expect(detail.getByRole('button', { name, exact: true })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: '更多操作' })).toHaveCount(0);
  });

  test('PPL-AC87：還沒有任何參與人員 →「還沒有參與人員。」與內文，只有「前往員工名單」，沒有「新增人員」', async ({ page }) => {
    await withDb(async (db) => {
      await db.reset();
      await db.employee({ name: '陳大文', department: '研發一部' });
    });
    await gotoPeople(page);
    await expect(page.getByText('還沒有參與人員。', { exact: true })).toBeVisible();
    await expect(page.getByText('到員工名單把報名的員工加入尾牙，或新增貴賓與眷屬後，就可以開始安排座位。', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('button', { name: '前往員工名單' }).or(page.getByRole('main').getByRole('link', { name: '前往員工名單' })),
    ).toBeVisible();
    await expect(button(page, '新增人員')).toHaveCount(0);
  });

  test('PPL-AC88：按「匯出座位表」→ 直接下載座位表', async ({ page }) => {
    await seedPeople();
    await gotoPeople(page);
    const download = page.waitForEvent('download');
    await button(page, '匯出座位表').click();
    expect((await download).suggestedFilename()).toMatch(/^座位表_\d{8}\.xlsx$/);
  });

  test('PPL-AC89：視窗 375 px → 卡片沒有列操作按鈕；沒有整頁水平捲動', async ({ page }) => {
    await seedPeople();
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoPeople(page);
    await expect(personRow(page, '王小明')).toBeVisible();
    await expect(page.getByRole('button', { name: '更多操作' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
});

test.describe('參與人員：編輯權限在畫面開著時被移除（AUTH-R13）', () => {
  test('PPL-AC90：開著新增人員對話框並選好陳大文時被移除 → 按「新增人員」→ 不新增、對話框關閉、重新載入、Sonner；陳大文仍未報名；頁首不再有「新增人員」', async ({
    page,
    context,
    baseURL,
  }) => {
    desktopOnly(page);
    await signIn(context, requireBaseURL(baseURL));
    await seedPeople();
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '員工'), /^陳大文（研發一部）/, '陳大文');

    await removeEditor(TEST_USER.email); // 乙在權限頁移除了甲

    await dialog.getByRole('button', { name: '新增人員', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectToast(page, NOT_EDITOR_TOAST, { undo: false });
    expect(await withDb((db) => db.find('陳大文'))).toBeUndefined();
    await expect(personRow(page, '陳大文')).toHaveCount(0);
    await expect(button(page, '新增人員')).toHaveCount(0);
    await expect(viewOnlyBadge(page)).toBeVisible();
  });
});

// ---- 員工名單

/** 王小明（研發一部，分機 1234，備註「素食」）已報名；李小華未報名；陳大文不參加 */
async function seedEmployees() {
  await resetData();
  const wang = await insertEmployee({ name: '王小明', department: '研發一部', extension: '1234', note: '素食' });
  await registerEmployee(wang);
  const li = await insertEmployee({ name: '李小華', department: '業務部', extension: '2001' });
  const chen = await insertEmployee({ name: '陳大文', department: '研發一部', declined: true });
  return { wang, li, chen };
}

test.describe('員工名單：只能檢視（EMP-R67）', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInAsViewer(context, requireBaseURL(baseURL));
  });

  test('EMP-AC89：Tabs、搜尋、篩選照常，分機與備註看得到；頁首沒有「新增員工」「匯入員工名單」；沒有勾選欄與表頭全選，不會出現批次按鈕', async ({
    page,
  }) => {
    await seedEmployees();
    await gotoEmployees(page);

    await expect(rowWith(page, '王小明')).toContainText('1234');
    if (!isMobileWidth(page)) await expect(rowWith(page, '王小明')).toContainText('素食');
    for (const label of ['全部', '未報名', '已報名', '不參加'] as const) await expect(tabOf(page, label)).toBeVisible();
    await expect(filterTrigger(page, '部門')).toBeVisible();

    await expect(button(page, '新增員工')).toHaveCount(0);
    await expect(button(page, '匯入員工名單')).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^加入尾牙（\d+ 位）$/ })).toHaveCount(0);

    await employeeSearch(page).fill('1234');
    await expect(rowWith(page, '王小明')).toBeVisible();
    await expect(rowWith(page, '李小華')).toHaveCount(0);
    await employeeSearch(page).fill('');
    await tabOf(page, '未報名').click();
    await expect(rowWith(page, '李小華')).toBeVisible();
    await expect(rowWith(page, '王小明')).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });

  test('EMP-AC90：王小明已報名、李小華未報名、陳大文不參加 → 王小明的列操作只有「查看參與資料」，按下開啟參與人員頁；李小華與陳大文沒有列操作按鈕', async ({
    page,
  }) => {
    const { wang } = await seedEmployees();
    await gotoEmployees(page);

    await expect(rowWith(page, '李小華').getByRole('button', { name: '更多操作' })).toHaveCount(0);
    await tabOf(page, '不參加').click();
    await expect(rowWith(page, '陳大文')).toBeVisible();
    await expect(rowWith(page, '陳大文').getByRole('button', { name: '更多操作' })).toHaveCount(0);
    await tabOf(page, '全部').click();

    await rowWith(page, '王小明').getByRole('button', { name: '更多操作' }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText(['查看參與資料']);
    await menu.getByRole('menuitem', { name: '查看參與資料' }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/people' && url.searchParams.get('employee') === String(wang));
  });

  test('EMP-AC91：員工名單沒有任何員工 →「還沒有員工名單。」與內文，沒有「匯入員工名單」「新增員工」', async ({ page }) => {
    await resetData();
    await gotoEmployees(page);
    await expect(page.getByText('還沒有員工名單。', { exact: true })).toBeVisible();
    await expect(page.getByText('匯入公司員工名單，或先新增幾位員工。', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '匯入員工名單' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '新增員工' })).toHaveCount(0);
  });

  test('EMP-AC92：視窗 375 px → 卡片沒有勾選框、工具列沒有批次按鈕；已報名員工的卡片只有「查看參與資料」；沒有整頁水平捲動', async ({ page }) => {
    await seedEmployees();
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoEmployees(page);

    await expect(rowWith(page, '王小明')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^加入尾牙（\d+ 位）$/ })).toHaveCount(0);
    await expect(rowWith(page, '李小華').getByRole('button', { name: '更多操作' })).toHaveCount(0);
    await rowWith(page, '王小明').getByRole('button', { name: '更多操作' }).click();
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['查看參與資料']);
    await page.keyboard.press('Escape');
    await expectNoHorizontalScroll(page);
  });
});

test.describe('員工名單：編輯權限在畫面開著時被移除（AUTH-R13）', () => {
  test('EMP-AC93：開著員工名單時被移除 → 按李小華的「標記為不參加」→ 不儲存、李小華仍是未報名；重新載入、Sonner；之後李小華沒有列操作，表格沒有勾選欄', async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(context, requireBaseURL(baseURL));
    const { li } = await seedEmployees();
    await gotoEmployees(page);
    await expect(page.getByRole('checkbox').first()).toBeVisible();

    await removeEditor(TEST_USER.email); // 乙在權限頁移除了甲

    await rowWith(page, '李小華').getByRole('button', { name: '更多操作' }).click();
    await page.getByRole('menu').getByRole('menuitem', { name: '標記為不參加' }).click();

    await expectToast(page, NOT_EDITOR_TOAST, { undo: false });
    await expect.poll(() => declinedOf(li)).toBe(false);
    await expect(rowWith(page, '李小華')).toBeVisible();
    await expect(rowWith(page, '李小華').getByRole('button', { name: '更多操作' })).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(viewOnlyBadge(page)).toBeVisible();
  });
});
