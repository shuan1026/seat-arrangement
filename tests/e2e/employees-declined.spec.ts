// 員工名單的「不參加」報名狀態（D-014），走真的伺服器（PUT /api/employees/{id}/declined、加入尾牙、取消報名）並確認資料庫：
// docs/spec/employees.md EMP-R03、R08、R17～R19、R25、R27、R30、R31、R41、R63～R65，第 2.2、2.3、2.6 節，第 4.1 節文案，
// 驗收條件 EMP-AC80～AC86；docs/spec/README.md 狀態徽章（不參加：中性，--muted／--muted-foreground，沒有圖示）、COM-R07、COM-R08。
// EMP-AC87（匯入員工名單）在 employees-import.spec.ts；EMP-AC88（320 px）在 employees-mobile.spec.ts；
// PPL-AC84（參與人員頁新增人員的員工選項）在 people-dialog.spec.ts。
// 資料用 tests/e2e/helpers/employees-db.ts 直接寫進測試資料庫，都是虛構資料。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import {
  closeDb,
  declinedOf,
  deleteEmployeeRow,
  employeeRows,
  insertEmployees,
  participantRows,
  registerEmployee,
  resetData,
  setDeclined,
} from './helpers/employees-db';
import {
  CONFLICT_TOAST,
  HEADER_CHECKBOX,
  bulkButton,
  cellOf,
  colorOf,
  cssVarBackground,
  cssVarColor,
  dataRows,
  declinedBox,
  expectNoUndo,
  expectToast,
  gotoEmployees,
  openRowMenu,
  pickBox,
  rowOf,
  searchBox,
  tabCount,
  tabOf,
  takenBox,
  type TabLabel,
} from './helpers/employees-page';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';

test.beforeEach(async ({ context, baseURL }) => {
  await resetData();
  await signIn(context, requireBaseURL(baseURL));
});

test.afterAll(async () => {
  await resetData();
  await closeDb();
});

const desktopOnly = (page: Page, reason = '桌面版面；手機另外測') => test.skip(isMobileWidth(page), reason);

type Status = '已報名' | '未報名' | '不參加';

/** 報名狀態：桌面看「報名狀態」欄，手機看卡片上的徽章 */
async function expectStatus(page: Page, name: string, status: Status) {
  const row = rowOf(page, name);
  if (isMobileWidth(page)) await expect(row.getByText(status, { exact: true })).toBeVisible();
  else await expect(cellOf(row, 'status')).toHaveText(status);
}

async function expectTabs(page: Page, counts: Record<TabLabel, number>) {
  for (const [label, n] of Object.entries(counts) as [TabLabel, number][]) {
    await expect(tabOf(page, label)).toHaveText(tabCount(label, n));
  }
}

/** 列操作選單選一項 */
async function rowAction(page: Page, name: string, item: string) {
  const menu = await openRowMenu(page, rowOf(page, name));
  await menu.getByRole('menuitem', { name: item, exact: true }).click();
  await expect(menu).toBeHidden();
}

/** 不需確認：沒有開任何對話框 */
async function expectNoConfirm(page: Page) {
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

const registrationsOf = async (employeeId: number) =>
  (await participantRows()).filter((p) => p.kind === 'EMPLOYEE' && p.employeeId === employeeId);

/** 甲、乙未報名（研發部），丙已報名（業務部） */
async function seedAC80() {
  const [jia, yi, bing] = await insertEmployees([
    { name: '甲', department: '研發部' },
    { name: '乙', department: '研發部' },
    { name: '丙', department: '業務部' },
  ]);
  const bingParticipant = await registerEmployee(bing!);
  return { jia: jia!, yi: yi!, bing: bing!, bingParticipant };
}

test.describe('標記為不參加（EMP-R63）', () => {
  test('EMP-AC80：按甲的「標記為不參加」→ 不需確認，甲顯示「不參加」，Sonner「已把 甲 標記為不參加。」沒有「復原」；Tabs「全部 3」「未報名 1」「已報名 1」「不參加 1」；「未報名」只列乙、「不參加」只列甲；重新整理後甲仍是不參加', async ({
    page,
  }) => {
    const { jia } = await seedAC80();
    await gotoEmployees(page);
    await expectTabs(page, { 全部: 3, 未報名: 2, 已報名: 1, 不參加: 0 });

    await rowAction(page, '甲', '標記為不參加');

    await expectNoConfirm(page);
    await expectToast(page, '已把 甲 標記為不參加。');
    await expectNoUndo(page);
    await expectStatus(page, '甲', '不參加');
    await expectTabs(page, { 全部: 3, 未報名: 1, 已報名: 1, 不參加: 1 });
    await expect.poll(() => declinedOf(jia)).toBe(true);
    expect(await participantRows()).toHaveLength(1);

    await tabOf(page, '未報名').click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(rowOf(page, '乙')).toHaveCount(1);

    await tabOf(page, '不參加').click();
    await expect(tabOf(page, '不參加')).toHaveAttribute('aria-selected', 'true');
    await expect(dataRows(page)).toHaveCount(1);
    await expect(rowOf(page, '甲')).toHaveCount(1);

    // 重新整理後看到儲存的結果（COM-R05）；開啟頁面時顯示「全部」分頁（EMP-R06）
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '員工名單' })).toBeVisible();
    await expect(tabOf(page, '全部')).toHaveAttribute('aria-selected', 'true');
    await expectStatus(page, '甲', '不參加');
    await expectTabs(page, { 全部: 3, 未報名: 1, 已報名: 1, 不參加: 1 });
  });

  test('不參加的列：勾選框停用、無障礙名稱「{姓名} 不參加」；「標記為不參加」不是危險樣式（EMP-R18、EMP-R25、EMP-R27）', async ({ page }) => {
    await seedAC80();
    await gotoEmployees(page);
    const danger = await cssVarColor(page, '--destructive-text');

    const menu = await openRowMenu(page, rowOf(page, '甲'));
    expect(await colorOf(menu.getByRole('menuitem', { name: '標記為不參加' }))).not.toBe(danger);
    await menu.getByRole('menuitem', { name: '標記為不參加' }).click();

    await expect(declinedBox(page, '甲')).toBeDisabled();
    await expect(declinedBox(page, '甲')).not.toBeChecked();
    await expect(pickBox(page, '甲')).toHaveCount(0);
    await expect(pickBox(page, '乙')).toBeEnabled();
  });

  test('「不參加」徽章是中性樣式：背景 --muted、文字 --muted-foreground，沒有圖示（README 狀態徽章、2.3）', async ({ page }) => {
    desktopOnly(page);
    await insertEmployees([{ name: '甲', department: '研發部', declined: true }]);
    await gotoEmployees(page);

    const badge = cellOf(rowOf(page, '甲'), 'status').getByText('不參加', { exact: true });
    await expect(badge).toBeVisible();
    // 文字可能包在徽章裡面的元素：往外找到第一個有底色的元素（就是徽章），不超出儲存格
    const fill = await badge.evaluate((el) => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
        if (n.tagName === 'TD' || n.getAttribute('role') === 'cell') return null;
      }
      return null;
    });
    expect(fill).toBe(await cssVarBackground(page, '--muted'));
    expect(await colorOf(badge)).toBe(await cssVarColor(page, '--muted-foreground'));
    await expect(cellOf(rowOf(page, '甲'), 'status').locator('svg')).toHaveCount(0);
  });

  test('EMP-AC86：我開著員工名單時別人把甲加入尾牙 → 我按甲的「標記為不參加」→ 不儲存，重新載入並顯示「資料已被其他人更新，已重新載入。」；甲是已報名（EMP-R65、COM-R07、COM-R08）', async ({
    page,
  }) => {
    const { jia } = await seedAC80();
    await gotoEmployees(page);

    await registerEmployee(jia); // 別人在這時把甲加入尾牙

    await rowAction(page, '甲', '標記為不參加');

    await expectToast(page, CONFLICT_TOAST);
    await expect(page.getByText('已把 甲 標記為不參加。', { exact: true })).toHaveCount(0);
    await expectStatus(page, '甲', '已報名');
    await expect(takenBox(page, '甲')).toBeDisabled();
    await expectTabs(page, { 全部: 3, 未報名: 1, 已報名: 2, 不參加: 0 });
    expect(await declinedOf(jia)).toBe(false);
    expect(await registrationsOf(jia)).toHaveLength(1);
  });

  test('按「標記為不參加」時甲剛被別人刪除 → 不儲存，重新載入並提示；名單沒有甲（EMP-R65）', async ({ page }) => {
    const { jia } = await seedAC80();
    await gotoEmployees(page);

    await deleteEmployeeRow(jia); // 別人在這時刪除甲

    await rowAction(page, '甲', '標記為不參加');

    await expectToast(page, CONFLICT_TOAST);
    await expect(rowOf(page, '甲')).toHaveCount(0);
    await expectTabs(page, { 全部: 2, 未報名: 1, 已報名: 1, 不參加: 0 });
    expect((await employeeRows()).map((e) => e.name).sort()).toEqual(['丙', '乙'].sort());
  });
});

test.describe('改回未報名（EMP-R63）', () => {
  test('EMP-AC81：甲不參加 → 列操作是「加入尾牙」「改回未報名」「編輯」「刪除」；按「改回未報名」→ 不需確認，甲變回未報名，Sonner「已把 甲 改回未報名。」沒有「復原」（EMP-R27、EMP-R31）', async ({
    page,
  }) => {
    const [jia] = await insertEmployees([
      { name: '甲', department: '研發部', declined: true },
      { name: '乙', department: '研發部' },
    ]);
    await gotoEmployees(page);
    await expectStatus(page, '甲', '不參加');
    await expectTabs(page, { 全部: 2, 未報名: 1, 已報名: 0, 不參加: 1 });

    const danger = await cssVarColor(page, '--destructive-text');
    const menu = await openRowMenu(page, rowOf(page, '甲'));
    await expect(menu.getByRole('menuitem')).toHaveText(['加入尾牙', '改回未報名', '編輯', '刪除']);
    expect(await colorOf(menu.getByRole('menuitem', { name: '刪除' }))).toBe(danger);
    expect(await colorOf(menu.getByRole('menuitem', { name: '改回未報名' }))).not.toBe(danger);
    await menu.getByRole('menuitem', { name: '改回未報名' }).click();

    await expectNoConfirm(page);
    await expectToast(page, '已把 甲 改回未報名。');
    await expectNoUndo(page);
    await expectStatus(page, '甲', '未報名');
    await expect(pickBox(page, '甲')).toBeEnabled();
    await expectTabs(page, { 全部: 2, 未報名: 2, 已報名: 0, 不參加: 0 });
    await expect.poll(() => declinedOf(jia!)).toBe(false);

    // 改回之後選單回到未報名的項目
    const again = await openRowMenu(page, rowOf(page, '甲'));
    await expect(again.getByRole('menuitem')).toHaveText(['加入尾牙', '標記為不參加', '編輯', '刪除']);
  });

  test('按「改回未報名」時甲剛被別人加入尾牙 → 不儲存，重新載入並提示；甲是已報名（EMP-R65）', async ({ page }) => {
    const [jia] = await insertEmployees([{ name: '甲', department: '研發部', declined: true }]);
    await gotoEmployees(page);

    // 別人在這時把甲加入尾牙（伺服器加入時會清掉標記，EMP-R64）
    await registerEmployee(jia!);
    await setDeclined(jia!, false);

    await rowAction(page, '甲', '改回未報名');

    await expectToast(page, CONFLICT_TOAST);
    await expect(page.getByText('已把 甲 改回未報名。', { exact: true })).toHaveCount(0);
    await expectStatus(page, '甲', '已報名');
    expect(await registrationsOf(jia!)).toHaveLength(1);
  });
});

test.describe('已報名的員工（EMP-R27、EMP-R30、EMP-R64）', () => {
  test('EMP-AC82：丙已報名 → 列操作沒有「標記為不參加」；取消丙的報名 → 丙變回未報名，不是不參加', async ({ page }) => {
    const { bing } = await seedAC80();
    await gotoEmployees(page);

    const menu = await openRowMenu(page, rowOf(page, '丙'));
    await expect(menu.getByRole('menuitem')).toHaveText(['查看參與資料', '取消報名', '編輯', '刪除']);
    await expect(menu.getByRole('menuitem', { name: '標記為不參加' })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: '改回未報名' })).toHaveCount(0);
    await menu.getByRole('menuitem', { name: '取消報名' }).click();
    await page
      .getByRole('alertdialog', { name: '要取消 丙 的報名嗎？' })
      .getByRole('button', { name: '確認取消報名' })
      .click();

    await expectToast(page, '已取消 丙 的報名。');
    await expectStatus(page, '丙', '未報名');
    await expectTabs(page, { 全部: 3, 未報名: 3, 已報名: 0, 不參加: 0 });
    await expect.poll(async () => (await registrationsOf(bing)).length).toBe(0);
    expect(await declinedOf(bing)).toBe(false);

    await page.reload();
    await expectStatus(page, '丙', '未報名');
  });
});

test.describe('勾選與一次加入多位（EMP-R18、EMP-R19、EMP-R25）', () => {
  test('EMP-AC83：同一頁有不參加的甲與未報名的乙 → 按表頭全選只勾乙；甲的勾選框停用，無障礙名稱「甲 不參加」；批次按鈕「加入尾牙（1 位）」；確認後只有乙加入，甲仍是不參加', async ({
    page,
  }) => {
    desktopOnly(page, '手機卡片沒有全選（EMP-R26）');
    const [jia, yi] = await insertEmployees([
      { name: '甲', department: '研發部', declined: true },
      { name: '乙', department: '研發部' },
    ]);
    await gotoEmployees(page);

    await page.getByRole('checkbox', { name: HEADER_CHECKBOX }).click();

    await expect(pickBox(page, '乙')).toBeChecked();
    await expect(declinedBox(page, '甲')).toBeDisabled();
    await expect(declinedBox(page, '甲')).not.toBeChecked();
    await expect(bulkButton(page, 1)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: HEADER_CHECKBOX })).toBeChecked();

    await bulkButton(page, 1).click();
    await page
      .getByRole('alertdialog', { name: '要把 1 位員工加入尾牙嗎？' })
      .getByRole('button', { name: '加入尾牙', exact: true })
      .click();

    await expectToast(page, '已把 1 位員工加入尾牙。');
    await expectStatus(page, '乙', '已報名');
    await expectStatus(page, '甲', '不參加');
    await expect.poll(async () => (await participantRows()).map((p) => p.employeeId)).toEqual([yi]);
    expect(await declinedOf(jia!)).toBe(true);
  });

  test('這一頁只有不參加與已報名的列：表頭全選停用（EMP-R19、EMP-Q08 第 2 點）', async ({ page }) => {
    desktopOnly(page, '手機卡片沒有全選（EMP-R26）');
    const [, yi] = await insertEmployees([
      { name: '甲', department: '研發部', declined: true },
      { name: '乙', department: '研發部' },
    ]);
    await registerEmployee(yi!);
    await gotoEmployees(page);
    await expect(page.getByRole('checkbox', { name: HEADER_CHECKBOX })).toBeDisabled();
    await expect(bulkButton(page)).toHaveCount(0);
  });
});

test.describe('不參加的員工加入尾牙（EMP-R64、2.6）', () => {
  test('EMP-AC84：甲不參加 → 列操作「加入尾牙」並完成 → 甲變成已報名、在「已報名」分頁，「不參加」分頁沒有甲；之後取消甲的報名 → 甲是未報名', async ({
    page,
  }) => {
    const [jia] = await insertEmployees([
      { name: '甲', department: '研發部', declined: true },
      { name: '乙', department: '研發部' },
    ]);
    await gotoEmployees(page);

    await rowAction(page, '甲', '加入尾牙');
    const dialog = page.getByRole('dialog', { name: '新增人員' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '加入尾牙', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expectToast(page, '已把 甲 加入尾牙。');
    await expectStatus(page, '甲', '已報名');
    await expect(takenBox(page, '甲')).toBeDisabled();
    await expectTabs(page, { 全部: 2, 未報名: 1, 已報名: 1, 不參加: 0 });
    await expect.poll(async () => (await registrationsOf(jia!)).length).toBe(1);
    await expect.poll(() => declinedOf(jia!)).toBe(false);

    await tabOf(page, '已報名').click();
    await expect(rowOf(page, '甲')).toHaveCount(1);
    await tabOf(page, '不參加').click();
    await expect(rowOf(page, '甲')).toHaveCount(0);
    await expect(page.getByText('沒有標記為不參加的員工。')).toBeVisible();

    // 取消報名後變回未報名，不是不參加（不重新整理，畫面上的資料也要對）
    await tabOf(page, '全部').click();
    await rowAction(page, '甲', '取消報名');
    await page
      .getByRole('alertdialog', { name: '要取消 甲 的報名嗎？' })
      .getByRole('button', { name: '確認取消報名' })
      .click();
    await expectToast(page, '已取消 甲 的報名。');
    await expectStatus(page, '甲', '未報名');
    await expectTabs(page, { 全部: 2, 未報名: 2, 已報名: 0, 不參加: 0 });
    await expect.poll(async () => (await registrationsOf(jia!)).length).toBe(0);
    expect(await declinedOf(jia!)).toBe(false);

    await page.reload();
    await expectStatus(page, '甲', '未報名');
  });
});

test.describe('空狀態（EMP-R17）', () => {
  test('EMP-AC85：沒有任何不參加的員工 → 按「不參加」→「沒有標記為不參加的員工。」', async ({ page }) => {
    await seedAC80();
    await gotoEmployees(page);
    await tabOf(page, '不參加').click();
    await expect(page.getByText('沒有標記為不參加的員工。')).toBeVisible();
    await expect(dataRows(page)).toHaveCount(0);
    await expect(tabOf(page, '不參加')).toHaveText(tabCount('不參加', 0));
  });

  test('EMP-AC85：所有員工都是已報名或不參加 → 按「未報名」→「沒有未報名的員工。」', async ({ page }) => {
    const [, yi] = await insertEmployees([
      { name: '甲', department: '研發部', declined: true },
      { name: '乙', department: '研發部' },
    ]);
    await registerEmployee(yi!);
    await gotoEmployees(page);

    await tabOf(page, '未報名').click();
    await expect(page.getByText('沒有未報名的員工。')).toBeVisible();
    await expect(dataRows(page)).toHaveCount(0);
    await expectTabs(page, { 全部: 2, 未報名: 0, 已報名: 1, 不參加: 1 });
  });

  test('「不參加」分頁搜尋沒有結果：顯示「找不到「{關鍵字}」。」，不是「沒有標記為不參加的員工。」（EMP-R15、EMP-R17）', async ({ page }) => {
    await insertEmployees([
      { name: '甲', department: '研發部', declined: true },
      { name: '乙', department: '研發部' },
    ]);
    await gotoEmployees(page);
    await tabOf(page, '不參加').click();
    await expect(dataRows(page)).toHaveCount(1);
    await searchBox(page).fill('乙');
    await expect(page.getByText('找不到「乙」。')).toBeVisible();
    await expect(page.getByText('沒有標記為不參加的員工。')).toHaveCount(0);
  });
});

test.describe('刪除不參加的員工（EMP-R41、EMP-R42、第 4.1 節）', () => {
  test('確認內文是「刪除後無法復原。」；按「刪除員工」→ 甲從名單移除，Sonner「已刪除 甲。」沒有「復原」', async ({ page }) => {
    await insertEmployees([
      { name: '甲', department: '研發部', declined: true },
      { name: '乙', department: '研發部' },
    ]);
    await gotoEmployees(page);

    await rowAction(page, '甲', '刪除');
    const dialog: Locator = page.getByRole('alertdialog', { name: '要刪除 甲 嗎？' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('刪除後無法復原。', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/已報名尾牙/)).toHaveCount(0);
    await dialog.getByRole('button', { name: '刪除員工' }).click();

    await expectToast(page, '已刪除 甲。');
    await expectNoUndo(page);
    await expect(rowOf(page, '甲')).toHaveCount(0);
    await expectTabs(page, { 全部: 1, 未報名: 1, 已報名: 0, 不參加: 0 });
    await expect.poll(async () => (await employeeRows()).map((e) => e.name)).toEqual(['乙']);
  });
});
