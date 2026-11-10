// 座位安排頁接上參與人員的對話框（階段 3）：頁首的「新增人員」、人員面板與桌次詳情名單列的「編輯」、人員面板的「取消報名」「刪除」，
// 開啟的是參與人員的新增、編輯人員對話框（PersonDialog）與確認對話框，完成後座位圖、統計列、人員面板與桌次詳情立即更新。
// 依據：docs/spec/seating.md 2.1.1（右側按鈕「新增人員」開啟新增人員對話框）、2.2.3（列操作；「編輯」「取消報名」「刪除」的流程見
// participants.md）、2.3.2（桌次詳情名單列的「編輯」）、SEAT-R10、SEAT-R40（人員對話框勾選「工作人員」）、SEAT-R47、SEAT-R74、SEAT-R75、
// SEAT-R80（新增、編輯、刪除人員、取消報名不能復原）；participants.md 第 2.2、2.3 節、第 4.1、4.2 節文案、PPL-R14、PPL-R15、PPL-R37、
// PPL-R38、PPL-R53、PPL-R56、PPL-R60；待確認 PPL-Q08（編輯時可以改桌次）照目前假設。
// 資料用 tests/e2e/helpers/seating-data.ts 直接寫進測試資料庫，都是虛構資料。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { withDb } from './helpers/participants-db';
import { checkbox, chooseOption as chooseField, selectField, textField } from './helpers/participants-page';
import { participantCount, rosterNames, seatOf, seed, STAFF } from './helpers/seating-data';
import {
  detailRows,
  expectStats,
  expectToast,
  mapTable,
  openSeating,
  openStaffDetail,
  openTableDetail,
  panelTab,
  peoplePanel,
  personRow,
  rowAction,
  rowWithName,
  showMap,
  showPeople,
  staffTable,
  tableDetail,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
});

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面版面；手機另外測');

/** 頁首的「新增人員」開啟新增人員對話框 */
async function openAddPerson(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '新增人員', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '新增人員' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** 人員面板的列操作（「全部」分頁才看得到已入座與工作人員） */
async function panelAction(page: Page, name: string, action: string, tab: '未入座' | '全部' = '全部') {
  await showPeople(page);
  await panelTab(page, tab).click();
  await rowAction(page, personRow(page, name), action);
}

const findPerson = (name: string) => withDb((db) => db.find(name));

test.describe('頁首「新增人員」（seating.md 2.1.1）', () => {
  test('新增外部貴賓林董並選第 7 桌 → Sonner「已新增 林董。」沒有「復原」；第 7 桌變成 3/10、統計列與人員面板立即更新；資料庫有這一位', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(7, 2, { prefix: '七' });
      await s.employee('王小明');
    });
    await openSeating(page);
    await expectStats(page, { seated: 2, total: 3, unseated: 1, empty: 298, full: 0 });

    const dialog = await openAddPerson(page);
    await chooseField(page, selectField(dialog, '類別'), '外部貴賓');
    await textField(dialog, '姓名').fill('林董');
    await chooseField(page, selectField(dialog, '桌次'), /^第 7 桌/);
    await dialog.getByRole('button', { name: '新增人員', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expectToast(page, '已新增 林董。', { undo: false });
    await expect(mapTable(page, 7)).toContainText('3/10');
    await expectStats(page, { seated: 3, total: 4, unseated: 1, empty: 297, full: 0 });
    await panelTab(page, '全部').click();
    await expect(personRow(page, '林董').getByRole('button', { name: '第 7 桌', exact: true })).toBeVisible();
    await expect.poll(() => rosterNames(7)).toEqual(['七1', '七2', '林董']);
  });

  test('新增員工陳大文、桌次留「未入座」→ 出現在人員面板「未入座」分頁，分頁人數與統計列的總人數、未入座各加 1', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明');
      await s.employeeOnly('陳大文', { department: '研發一部' });
    });
    await openSeating(page);
    await expectStats(page, { seated: 0, total: 1, unseated: 1, empty: 300, full: 0 });

    const dialog = await openAddPerson(page);
    await chooseField(page, selectField(dialog, '員工'), /^陳大文（研發一部）/, '陳大文');
    await dialog.getByRole('button', { name: '新增人員', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expectToast(page, '已新增 陳大文。', { undo: false });
    await expectStats(page, { seated: 0, total: 2, unseated: 2, empty: 300, full: 0 });
    await showPeople(page);
    await expect(panelTab(page, '未入座')).toHaveText(/^未入座\s*2$/);
    await expect(personRow(page, '陳大文')).toHaveCount(1);
    await expect.poll(async () => (await findPerson('陳大文'))?.tableId).toBeNull();
  });

  test('新增員工時勾「工作人員」→ 放進工作人員桌（1/10），不算入座統計（SEAT-R40、SEAT-R47、PPL-R53）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.employeeOnly('陳大文', { department: '研發一部' });
    });
    await openSeating(page);

    const dialog = await openAddPerson(page);
    await chooseField(page, selectField(dialog, '員工'), /^陳大文（研發一部）/, '陳大文');
    await checkbox(dialog, '工作人員').check();
    await dialog.getByRole('button', { name: '新增人員', exact: true }).click();

    await expectToast(page, '已新增 陳大文。', { undo: false });
    await expect(staffTable(page)).toContainText('1/10');
    await expectStats(page, { seated: 0, total: 0, unseated: 0, empty: 300, full: 0 });
    await expect.poll(async () => (await findPerson('陳大文'))?.tableId).toBe(STAFF);
  });

  test('按「取消」：不新增任何人', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.employee('王小明');
    });
    await openSeating(page);
    const dialog = await openAddPerson(page);
    await chooseField(page, selectField(dialog, '類別'), '外部貴賓');
    await textField(dialog, '姓名').fill('林董');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await participantCount()).toBe(1);
  });
});

test.describe('「編輯」開啟編輯人員對話框（seating.md 2.2.3、2.3.2）', () => {
  test('人員面板的「編輯」：林董坐第 3 桌，勾「素食」並儲存 → Sonner「已儲存」沒有「復原」；第 3 桌詳情的「素食 1 位」立即更新（SEAT-R11、SEAT-R74、SEAT-R80）', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(3, 2, { prefix: '三' });
      await s.guest('林董', { tableId: 3, organization: '測試科技 董事長' });
    });
    await openSeating(page);
    await openTableDetail(page, 3);
    await expect(tableDetail(page, 3)).toContainText('素食 0 位');

    await panelAction(page, '林董', '編輯');
    const dialog = page.getByRole('dialog', { name: '編輯人員' });
    await expect(dialog).toBeVisible();
    await checkbox(dialog, '素食').check();
    await dialog.getByRole('button', { name: '儲存', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expectToast(page, '已儲存', { undo: false });
    await expect(tableDetail(page, 3)).toContainText('素食 1 位');
    await expect.poll(async () => (await findPerson('林董'))?.vegetarian).toBe(true);
    expect(await rosterNames(3)).toEqual(['三1', '三2', '林董']);
  });

  test('桌次詳情名單列的「編輯」：王小明在第 3 桌，桌次改成第 7 桌並儲存 → 第 3 桌詳情不再有王小明，座位圖第 3、7 桌的人數立即更新（PPL-Q08 目前假設、SEAT-R74）', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 3 });
      await s.fill(3, 1, { prefix: '三' });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);

    await rowAction(page, rowWithName(detailRows(detail), page, '王小明'), '編輯');
    const dialog = page.getByRole('dialog', { name: '編輯人員' });
    await expect(dialog).toBeVisible();
    await chooseField(page, selectField(dialog, '桌次'), /^第 7 桌/);
    await dialog.getByRole('button', { name: '儲存', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expectToast(page, '已儲存', { undo: false });
    await expect(rowWithName(detailRows(tableDetail(page, 3)), page, '王小明')).toHaveCount(0);
    await expect(tableDetail(page, 3)).toContainText('1/10 人');
    await expect(mapTable(page, 7)).toContainText('1/10');
    await expect.poll(() => rosterNames(7)).toEqual(['王小明']);
    expect(await rosterNames(3)).toEqual(['三1']);
  });

  test('工作人員桌詳情名單列的「編輯」也開啟編輯人員對話框；取消勾「工作人員」並儲存 → 離開工作人員桌（PPL-Q08）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.staff('工作甲');
    });
    await openSeating(page);
    const detail = await openStaffDetail(page);
    await rowAction(page, rowWithName(detailRows(detail), page, '工作甲'), '編輯');
    const dialog = page.getByRole('dialog', { name: '編輯人員' });
    await expect(checkbox(dialog, '工作人員')).toBeChecked();
    await checkbox(dialog, '工作人員').uncheck();
    await dialog.getByRole('button', { name: '儲存', exact: true }).click();

    await expectToast(page, '已儲存', { undo: false });
    await expect(staffTable(page)).toContainText('0/10');
    await expect.poll(async () => (await findPerson('工作甲'))?.tableId).toBeNull();
  });

  test('編輯對話框按「取消」：不改變任何資料', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.guest('林董', { tableId: 3 });
    });
    await openSeating(page);
    await panelAction(page, '林董', '編輯');
    const dialog = page.getByRole('dialog', { name: '編輯人員' });
    await checkbox(dialog, '素食').check();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect((await findPerson('林董'))?.vegetarian).toBe(false);
  });
});

test.describe('人員面板的「取消報名」（PPL-R14、PPL-R37）', () => {
  test('王小明與眷屬都在第 3 桌 →「取消報名」的確認對話框 →「確認取消報名」→ 兩人都從人員面板與座位圖消失，第 3 桌少 2 人；Sonner「已取消 王小明 的報名。」沒有「復原」；統計列更新', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.employee('三甲', { tableId: 3 });
      const wang = await s.employee('王小明', { tableId: 3 });
      await s.dependent(wang, { tableId: 3 });
    });
    await openSeating(page);
    await expectStats(page, { seated: 3, total: 3, unseated: 0, empty: 297, full: 0 });

    await panelAction(page, '王小明', '取消報名');
    const dialog = page.getByRole('alertdialog', { name: '要取消 王小明 的報名嗎？' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('王小明 會從參與人員移除，眷屬一併移除，已安排的座位會空出來；員工名單不受影響，之後可以再加入。');
    await expect(dialog.getByRole('button', { name: '返回' })).toBeVisible();
    await dialog.getByRole('button', { name: '確認取消報名' }).click();

    await expect(dialog).toBeHidden();
    await expectToast(page, '已取消 王小明 的報名。', { undo: false });
    await expect(personRow(page, '王小明')).toHaveCount(0);
    await expect(personRow(page, '王小明_眷屬')).toHaveCount(0);
    await expect(mapTable(page, 3)).toContainText('1/10');
    await expectStats(page, { seated: 1, total: 1, unseated: 0, empty: 299, full: 0 });
    await expect.poll(() => rosterNames(3)).toEqual(['三甲']);
    expect(await participantCount()).toBe(1);
  });

  test('按「返回」：人員面板、座位與資料庫都不變', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      const wang = await s.employee('王小明', { tableId: 3 });
      await s.dependent(wang, { tableId: 3 });
    });
    await openSeating(page);
    await panelAction(page, '王小明', '取消報名');
    const dialog = page.getByRole('alertdialog', { name: '要取消 王小明 的報名嗎？' });
    await dialog.getByRole('button', { name: '返回' }).click();
    await expect(dialog).toBeHidden();
    await expect(personRow(page, '王小明')).toHaveCount(1);
    await expect(mapTable(page, 3)).toContainText('2/10');
    expect(await rosterNames(3)).toEqual(['王小明', '王小明_眷屬']);
  });

  test('工作人員取消報名：工作人員桌少一位（PPL-R14、SEAT-R47）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.staff('工作甲');
      await s.staff('工作乙');
    });
    await openSeating(page);
    await expect(staffTable(page)).toContainText('2/10');

    await panelAction(page, '工作甲', '取消報名');
    await page.getByRole('alertdialog', { name: '要取消 工作甲 的報名嗎？' }).getByRole('button', { name: '確認取消報名' }).click();

    await expectToast(page, '已取消 工作甲 的報名。', { undo: false });
    await expect(staffTable(page)).toContainText('1/10');
    await expect.poll(() => rosterNames(STAFF)).toEqual(['工作乙']);
  });
});

test.describe('人員面板的「刪除」（PPL-R15、PPL-R38）', () => {
  test('第 5 桌依序是甲、林董、乙 →「刪除」林董並按「刪除人員」→ 林董從人員面板與第 5 桌消失，同桌其他人順序不變；Sonner「已刪除 林董。」沒有「復原」', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.employee('甲', { tableId: 5 });
      await s.guest('林董', { tableId: 5 });
      await s.employee('乙', { tableId: 5 });
    });
    await openSeating(page);

    await panelAction(page, '林董', '刪除');
    const dialog = page.getByRole('alertdialog', { name: '要刪除 林董 嗎？' });
    await expect(dialog).toContainText('刪除後無法復原；已安排的座位會空出來。');
    await expect(dialog.getByRole('button', { name: '取消' })).toBeVisible();
    await dialog.getByRole('button', { name: '刪除人員' }).click();

    await expect(dialog).toBeHidden();
    await expectToast(page, '已刪除 林董。', { undo: false });
    await expect(personRow(page, '林董')).toHaveCount(0);
    await expect(mapTable(page, 5)).toContainText('2/10');
    await expect.poll(() => rosterNames(5)).toEqual(['甲', '乙']);
    expect(await seatOf((await findPerson('乙'))!.id)).toEqual({ tableId: 5, seatOrder: 1 });
  });

  test('「未入座」分頁刪除眷屬：眷屬消失、所屬員工仍在', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      const wang = await s.employee('王小明');
      await s.dependent(wang);
    });
    await openSeating(page);
    await panelAction(page, '王小明_眷屬', '刪除', '未入座');
    await page.getByRole('alertdialog', { name: '要刪除 王小明_眷屬 嗎？' }).getByRole('button', { name: '刪除人員' }).click();

    await expectToast(page, '已刪除 王小明_眷屬。', { undo: false });
    await expect(personRow(page, '王小明_眷屬')).toHaveCount(0);
    await expect(personRow(page, '王小明')).toHaveCount(1);
    await expect(panelTab(page, '未入座')).toHaveText(/^未入座\s*1$/);
    expect(await participantCount()).toBe(1);
  });

  test('刪除時按「取消」：不做任何改變', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.guest('林董', { tableId: 5 });
    });
    await openSeating(page);
    await panelAction(page, '林董', '刪除');
    const dialog = page.getByRole('alertdialog', { name: '要刪除 林董 嗎？' });
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();
    expect(await rosterNames(5)).toEqual(['林董']);
  });
});

test.describe('手機（767 px 以下）', () => {
  test('「人員」分頁的列操作「取消報名」：確認後人員面板更新；切回「座位圖」第 3 桌人數也更新；確認對話框按鈕滿版堆疊、確認在上', async ({
    page,
  }) => {
    test.skip(!isMobileWidth(page), '手機寬度');
    await seed(async (s) => {
      await s.employee('三甲', { tableId: 3 });
      await s.employee('王小明', { tableId: 3 });
    });
    await openSeating(page);

    await panelAction(page, '王小明', '取消報名');
    const dialog = page.getByRole('alertdialog', { name: '要取消 王小明 的報名嗎？' });
    const confirm = await dialog.getByRole('button', { name: '確認取消報名' }).boundingBox();
    const back = await dialog.getByRole('button', { name: '返回' }).boundingBox();
    if (!confirm || !back) throw new Error('量不到按鈕');
    expect(confirm.y + confirm.height).toBeLessThanOrEqual(back.y + 1);
    await dialog.getByRole('button', { name: '確認取消報名' }).click();

    await expectToast(page, '已取消 王小明 的報名。', { undo: false });
    await expect(peoplePanel(page).getByText('王小明', { exact: true })).toHaveCount(0);
    await showMap(page);
    await expect(mapTable(page, 3)).toContainText('1/10');
    await expect.poll(() => rosterNames(3)).toEqual(['三甲']);
  });

  test('頁首「新增人員」在手機也開啟新增人員對話框，新增後出現在「人員」分頁', async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機寬度');
    await seed(async (s) => {
      await s.employee('王小明');
    });
    await openSeating(page);
    const dialog = await openAddPerson(page);
    await chooseField(page, selectField(dialog, '類別'), '外部貴賓');
    await textField(dialog, '姓名').fill('林董');
    await dialog.getByRole('button', { name: '新增人員', exact: true }).click();
    await expectToast(page, '已新增 林董。', { undo: false });
    await showPeople(page);
    await expect(personRow(page, '林董')).toHaveCount(1);
  });
});
