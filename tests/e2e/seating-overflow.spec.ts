// D-018 每桌可以放到 12 位，超過 10 位標示「超過」。
// docs/spec/seating.md SEAT-R02、R11、R20、R30、R42、R50、R75、R86、R88、R89；第 2 節視覺：2.1.6（精簡顯示的「超過」徽章）、
// 2.1.7（展開卡片 11、12 位時 12 列、不重疊）、2.1.9（「超過」用待處理徽章、拖到 10、11 位的桌照常有放置樣式、12 位 not-allowed）、
// 2.3.1、2.5.2（12 位時「加入人員」停用）、2.3.4、2.5.3（加入人員對話框的說明）、2.5.1（工作人員桌收合時的「超過」）；
// 5.12 節 SEAT-AC91～AC98；docs/spec/README.md 狀態徽章（「超過」：--status-pending-bg／--status-pending-fg、triangle-alert 圖示）。
// 改過的 AC14、AC15、AC42、AC44、AC88 在 seating-drag、seating-staff、seating-save.spec.ts；選擇桌次與人員對話框的部分也在
// seating-dialogs、people-seating、people-dialog.spec.ts。
// 無障礙名稱的假設見 tests/e2e/helpers/seating-page.ts 開頭。
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { rosterNames, seed, STAFF } from './helpers/seating-data';
import {
  badgeLook,
  cardRows,
  clickUndo,
  cursorAt,
  detailRows,
  dragAndDrop,
  dragOver,
  drop,
  expandAll,
  expectRoster,
  expectStats,
  expectToast,
  hasBorderColor,
  hasShadow,
  mapTable,
  openSeating,
  openStaffDetail,
  openTableDetail,
  optionLabels,
  panelTab,
  personRow,
  rowAction,
  rowWithName,
  staffTable,
  staffTableButton,
  startDrag,
  tableButton,
  tableDetail,
  tableHandle,
  tokenBackground,
  tokenColor,
  toast,
  toolbarButton,
  TRIANGLE_ALERT_PATH,
  waitForOperation,
  widenMap,
  zoomToRegular,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
});

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面版面（手機不提供拖移）；手機見本檔最後');
const addDialog = (page: Page, n: number) => page.getByRole('dialog', { name: `加入人員到第 ${n} 桌`, exact: true });
const staffAddDialog = (page: Page) => page.getByRole('dialog', { name: '加入人員到工作人員桌', exact: true });
const names = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);

async function zoomToCompact(page: Page) {
  for (let i = 0; i < 25; i++) await toolbarButton(page, '縮小').click();
}

test.describe('SEAT-AC91 拖進第 11 位（SEAT-R02、SEAT-R11、SEAT-R20、SEAT-R75、SEAT-R89）', () => {
  test('第 5 桌 10 位「已滿」→ 拖王小明進去：拖到上方時有放置樣式；成為第 11 位、改為「超過」；詳情「11/10 人」；Sonner 加上「這一桌已超過 10 位。」帶「復原」；統計列「已滿 1 桌・超過 1 桌」、空位不變', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 10, { prefix: '五' });
      await s.employee('王小明');
      await s.employee('李小華');
    });
    await openSeating(page);
    await expect(mapTable(page, 5)).toContainText('已滿');
    await expectStats(page, { seated: 10, total: 12, unseated: 2, empty: 290, full: 1 });

    await startDrag(page, personRow(page, '王小明'));
    await dragOver(page, tableButton(page, 5));
    // 已滿、還不到 12 位：和可放置的桌次相同（2.1.9）
    await expect.poll(() => hasBorderColor(page, mapTable(page, 5), '--primary')).toBe(true);
    await expect.poll(() => hasShadow(page, mapTable(page, 5), '--shadow-md')).toBe(true);
    const saved = waitForOperation(page);
    await drop(page);
    await saved;

    await expectToast(page, '已把 王小明 安排到第 5 桌，這一桌已超過 10 位。', { undo: true });
    await expect(mapTable(page, 5)).toContainText('超過');
    await expect(mapTable(page, 5)).not.toContainText('已滿');
    expect(await rosterNames(5)).toEqual([...names('五', 10), '王小明']);
    // 空位每桌只算到 10 位：第 5 桌超過也不會讓空位變少或變成負數
    await expectStats(page, { seated: 11, total: 12, unseated: 1, empty: 290, full: 1, over: 1 });

    const detail = await openTableDetail(page, 5);
    await expect(detail).toContainText('11/10 人');
    await expect(rowWithName(detailRows(detail), page, '王小明')).toHaveCount(1);
  });

  test('按 Sonner 的「復原」：王小明回到未入座，第 5 桌回到 10 位「已滿」，統計列沒有「超過」（SEAT-R78、SEAT-R79）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 10, { prefix: '五' });
      await s.employee('王小明');
    });
    await openSeating(page);
    const saved = waitForOperation(page);
    await dragAndDrop(page, personRow(page, '王小明'), tableButton(page, 5));
    await saved;
    await expectToast(page, '已把 王小明 安排到第 5 桌，這一桌已超過 10 位。', { undo: true });

    const restored = waitForOperation(page);
    await clickUndo(page, '已把 王小明 安排到第 5 桌，這一桌已超過 10 位。');
    await restored;
    await expectToast(page, '已復原。', { undo: false });
    await expect.poll(() => rosterNames(5)).toEqual(names('五', 10));
    await expect(mapTable(page, 5)).toContainText('已滿');
    await expectStats(page, { seated: 10, total: 11, unseated: 1, empty: 290, full: 1 });
  });

  test('拖進 9 位的桌（成為第 10 位）：Sonner 不加「這一桌已超過 10 位。」（SEAT-R89）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 9);
      await s.employee('王小明');
    });
    await openSeating(page);
    const saved = waitForOperation(page);
    await dragAndDrop(page, personRow(page, '王小明'), tableButton(page, 5));
    await saved;
    await expectToast(page, '已把 王小明 安排到第 5 桌。', { undo: true });
    await expect(toast(page, '這一桌已超過 10 位。')).toHaveCount(0);
    await expect(mapTable(page, 5)).toContainText('已滿');
  });

  test('從第 3 桌搬到 11 位的第 5 桌：成為第 12 位，Sonner「已把 王小明 從第 3 桌移到第 5 桌，這一桌已超過 10 位。」；從超過的桌搬到別桌不加（SEAT-R19、SEAT-R89）', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 3 });
      await s.fill(5, 11, { prefix: '五' });
    });
    await openSeating(page);
    await panelTab(page, '全部').click();

    let saved = waitForOperation(page);
    await dragAndDrop(page, personRow(page, '王小明'), tableButton(page, 5));
    await saved;
    await expectToast(page, '已把 王小明 從第 3 桌移到第 5 桌，這一桌已超過 10 位。', { undo: true });
    expect(await rosterNames(5)).toHaveLength(12);
    expect(await rosterNames(3)).toEqual([]);

    // 從超過的第 5 桌搬到空的第 3 桌：目標桌沒有超過，不加
    saved = waitForOperation(page);
    await dragAndDrop(page, personRow(page, '五1'), tableButton(page, 3));
    await saved;
    await expectToast(page, '已把 五1 從第 5 桌移到第 3 桌。', { undo: true });
    await expect(toast(page, '已把 五1 從第 5 桌移到第 3 桌，')).toHaveCount(0);
  });

  test('在 11 位的桌內調整順序：Sonner「已調整第 5 桌的座位順序。」，不加「這一桌已超過 10 位。」（SEAT-R32、SEAT-R33、SEAT-R89）', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 11, { prefix: '五' });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 5);
    const saved = waitForOperation(page);
    // 詳情的名單在 1280×800 放不下 12 列：來源（第 11 列）與目標要在同一個可視範圍內，所以拖到第 8 列（往上拖，落點是那一列，SEAT-R17）
    await dragAndDrop(page, rowWithName(detailRows(detail), page, '五11'), rowWithName(detailRows(detail), page, '五8'));
    await saved;
    await expectToast(page, '已調整第 5 桌的座位順序。', { undo: true });
    await expect(toast(page, '這一桌已超過 10 位。')).toHaveCount(0);
    await expect
      .poll(() => rosterNames(5))
      .toEqual([...names('五', 7), '五11', '五8', '五9', '五10']);
  });

  test('展開狀態，拖到 10 位桌卡片的第 2 列：插入那一列，卡片變成 12 列（SEAT-R17、2.1.7）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 10, { prefix: '五' });
      await s.employee('王小明');
    });
    await openSeating(page);
    await expandAll(page);
    const saved = waitForOperation(page);
    await dragAndDrop(page, personRow(page, '王小明'), cardRows(page, 5).nth(1));
    await saved;
    const expected = ['五1', '王小明', ...names('五', 10).slice(1)];
    await expect.poll(() => rosterNames(5)).toEqual(expected);
    await expectRoster(cardRows(page, 5), expected, 12);
  });
});

test.describe('SEAT-AC92 拖到 12 位的桌（SEAT-R20、2.1.9）', () => {
  test('拖到 11 位的桌上：照常有放置樣式；拖到 12 位的桌上：游標 not-allowed、沒有放置樣式；放開後不入座、統計列不變', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(4, 11, { prefix: '四' });
      await s.fill(5, 12, { prefix: '五' });
      await s.employee('王小明');
    });
    await openSeating(page);
    await expectStats(page, { seated: 23, total: 24, unseated: 1, empty: 280, full: 2, over: 2 });

    await startDrag(page, personRow(page, '王小明'));
    await dragOver(page, tableButton(page, 4));
    await expect.poll(() => hasBorderColor(page, mapTable(page, 4), '--primary')).toBe(true);
    const point = await dragOver(page, tableButton(page, 5));
    await expect.poll(() => cursorAt(page, point)).toBe('not-allowed');
    expect(await hasBorderColor(page, mapTable(page, 5), '--primary')).toBe(false);
    expect(await hasShadow(page, mapTable(page, 5), '--shadow-md')).toBe(false);
    await drop(page);

    await expectToast(page, '第 5 桌已達 12 位，請先移出一位。', { undo: false });
    await expect(personRow(page, '王小明')).toHaveCount(1);
    expect(await rosterNames(5)).toEqual(names('五', 12));
    await expectStats(page, { seated: 23, total: 24, unseated: 1, empty: 280, full: 2, over: 2 });
  });

  test('展開狀態拖到 12 位桌卡片的名單列：不入座，Sonner「第 5 桌已達 12 位，請先移出一位。」', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 12, { prefix: '五' });
      await s.employee('王小明');
    });
    await openSeating(page);
    await expandAll(page);
    await dragAndDrop(page, personRow(page, '王小明'), cardRows(page, 5).nth(3));
    await expectToast(page, '第 5 桌已達 12 位，請先移出一位。', { undo: false });
    expect(await rosterNames(5)).toEqual(names('五', 12));
  });
});

test.describe('SEAT-AC93 加入人員到 10 位以上的桌（SEAT-R30、SEAT-R31、SEAT-R89、2.3.4）', () => {
  test('第 5 桌 10 位：說明「已滿，最多還可以加入 2 位。」；勾第 3 位不會勾選、顯示「最多只能再加入 2 位。」；加入 2 位後 12 位、「加入人員」停用、Sonner 加上「這一桌已超過 10 位。」', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 10, { prefix: '五' });
      for (const name of ['甲', '乙', '丙']) await s.employee(name);
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 5);
    await expect(detail).toContainText('10/10 人');
    await detail.getByRole('button', { name: '加入人員', exact: true }).click();

    const dialog = addDialog(page, 5);
    await expect(dialog).toContainText('已滿，最多還可以加入 2 位。');
    await expect(dialog).not.toContainText('個空位');
    await dialog.getByRole('checkbox', { name: /^乙/ }).check();
    await dialog.getByRole('checkbox', { name: /^甲/ }).check();
    const third = dialog.getByRole('checkbox', { name: /^丙/ });
    await third.click();
    await expect(third).not.toBeChecked();
    await expect(dialog.getByText('最多只能再加入 2 位。')).toBeVisible();

    const saved = waitForOperation(page);
    await dialog.getByRole('button', { name: '加入 2 位' }).click();
    await saved;
    await expect(dialog).toBeHidden();
    await expectToast(page, '已把 2 位人員加入第 5 桌，這一桌已超過 10 位。', { undo: true });
    // 依勾選順序排入（SEAT-Q06 的目前假設）
    await expect.poll(async () => (await rosterNames(5)).slice(10)).toEqual(['乙', '甲']);
    await expect(detail).toContainText('12/10 人');
    await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toBeDisabled();
    await expect(mapTable(page, 5)).toContainText('超過');
  });

  test('加入 2 位後按「復原」：2 位一起回到未入座，第 5 桌回到 10 位，「加入人員」又可以按（SEAT-R78）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 10, { prefix: '五' });
      for (const name of ['甲', '乙']) await s.employee(name);
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 5);
    await detail.getByRole('button', { name: '加入人員', exact: true }).click();
    const dialog = addDialog(page, 5);
    for (const name of ['甲', '乙']) await dialog.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
    let saved = waitForOperation(page);
    await dialog.getByRole('button', { name: '加入 2 位' }).click();
    await saved;

    saved = waitForOperation(page);
    await clickUndo(page, '已把 2 位人員加入第 5 桌，這一桌已超過 10 位。');
    await saved;
    await expectToast(page, '已復原。', { undo: false });
    await expect(detail).toContainText('10/10 人');
    expect(await rosterNames(5)).toEqual(names('五', 10));
    for (const name of ['甲', '乙']) await expect(personRow(page, name)).toHaveCount(1);
    await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toBeEnabled();
  });

  test('第 5 桌 11 位：說明「已滿，最多還可以加入 1 位。」；勾第 2 位時顯示「最多只能再加入 1 位。」', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 11, { prefix: '五' });
      for (const name of ['甲', '乙']) await s.employee(name);
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 5);
    await expect(detail).toContainText('11/10 人');
    await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toBeEnabled();
    await detail.getByRole('button', { name: '加入人員', exact: true }).click();

    const dialog = addDialog(page, 5);
    await expect(dialog).toContainText('已滿，最多還可以加入 1 位。');
    await dialog.getByRole('checkbox', { name: /^甲/ }).check();
    const second = dialog.getByRole('checkbox', { name: /^乙/ });
    await second.click();
    await expect(second).not.toBeChecked();
    await expect(dialog.getByText('最多只能再加入 1 位。')).toBeVisible();
  });

  test('第 5 桌 9 位：說明「還有 1 個空位。」（空位只算到 10 位）；可以勾 3 位，第 4 位顯示「最多只能再加入 3 位。」；加入 3 位後 12 位', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 9, { prefix: '五' });
      for (const name of ['甲', '乙', '丙', '丁']) await s.employee(name);
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 5);
    await detail.getByRole('button', { name: '加入人員', exact: true }).click();

    const dialog = addDialog(page, 5);
    await expect(dialog).toContainText('還有 1 個空位。');
    for (const name of ['甲', '乙', '丙']) {
      const box = dialog.getByRole('checkbox', { name: new RegExp(`^${name}`) });
      await box.check();
      await expect(box).toBeChecked();
    }
    const fourth = dialog.getByRole('checkbox', { name: /^丁/ });
    await fourth.click();
    await expect(fourth).not.toBeChecked();
    await expect(dialog.getByText('最多只能再加入 3 位。')).toBeVisible();

    const saved = waitForOperation(page);
    await dialog.getByRole('button', { name: '加入 3 位' }).click();
    await saved;
    await expectToast(page, '已把 3 位人員加入第 5 桌，這一桌已超過 10 位。', { undo: true });
    await expect.poll(() => rosterNames(5)).toEqual([...names('五', 9), '甲', '乙', '丙']);
  });

  test('第 5 桌 12 位：桌次詳情的「加入人員」停用；「調換桌次…」仍可以按（2.3.1、SEAT-R30）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 12, { prefix: '五' });
      await s.employee('甲');
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 5);
    await expect(detail).toContainText('12/10 人');
    await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toBeDisabled();
    await expect(detail.getByRole('button', { name: '調換桌次…', exact: true })).toBeEnabled();
    for (const name of names('五', 12)) await expect(rowWithName(detailRows(detail), page, name)).toHaveCount(1);
  });
});

test.describe('加入人員到工作人員桌（SEAT-R42、SEAT-R50、2.5.2、2.5.3）', () => {
  test('工作人員桌 10 位：說明「已滿，最多還可以加入 2 位。」；勾第 3 位顯示「最多只能再加入 2 位。」；加入 2 位後 12 位「超過」、「加入人員」停用；Sonner 加上「這一桌已超過 10 位。」', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(STAFF, 10, { prefix: '工作' });
      for (const name of ['甲', '乙', '丙']) await s.employee(name);
    });
    await openSeating(page);
    const detail = await openStaffDetail(page);
    await expect(detail).toContainText('10/10 人');
    await detail.getByRole('button', { name: '加入人員', exact: true }).click();

    const dialog = staffAddDialog(page);
    await expect(dialog).toContainText('已滿，最多還可以加入 2 位。');
    await dialog.getByRole('checkbox', { name: /^甲/ }).check();
    await dialog.getByRole('checkbox', { name: /^乙/ }).check();
    const third = dialog.getByRole('checkbox', { name: /^丙/ });
    await third.click();
    await expect(third).not.toBeChecked();
    await expect(dialog.getByText('最多只能再加入 2 位。')).toBeVisible();

    const saved = waitForOperation(page);
    await dialog.getByRole('button', { name: '加入 2 位' }).click();
    await saved;
    await expect(dialog).toBeHidden();
    await expectToast(page, '已把 2 位人員放進工作人員桌，這一桌已超過 10 位。', { undo: true });
    expect(await rosterNames(STAFF)).toHaveLength(12);
    await expect(detail).toContainText('12/10 人');
    await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toBeDisabled();
    await expect(staffTable(page)).toContainText('超過');
  });

  test('工作人員桌 11 位：說明「已滿，最多還可以加入 1 位。」，「加入人員」可以按', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(STAFF, 11, { prefix: '工作' });
      await s.employee('甲');
    });
    await openSeating(page);
    const detail = await openStaffDetail(page);
    await expect(detail).toContainText('11/10 人');
    await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toBeEnabled();
    await detail.getByRole('button', { name: '加入人員', exact: true }).click();
    await expect(staffAddDialog(page)).toContainText('已滿，最多還可以加入 1 位。');
  });

  test('工作人員桌 8 位：說明「還有 2 個空位。」，最多可以勾 4 位（SEAT-R50）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(STAFF, 8, { prefix: '工作' });
      for (const name of ['甲', '乙', '丙', '丁', '戊']) await s.employee(name);
    });
    await openSeating(page);
    const detail = await openStaffDetail(page);
    await detail.getByRole('button', { name: '加入人員', exact: true }).click();
    const dialog = staffAddDialog(page);
    await expect(dialog).toContainText('還有 2 個空位。');
    for (const name of ['甲', '乙', '丙', '丁']) await dialog.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
    const fifth = dialog.getByRole('checkbox', { name: /^戊/ });
    await fifth.click();
    await expect(fifth).not.toBeChecked();
    await expect(dialog.getByText('最多只能再加入 4 位。')).toBeVisible();
  });
});

test.describe('SEAT-AC94 選單類入口仍到 10 位為止（SEAT-R23、SEAT-R88）', () => {
  test('人員面板「入座…」：10、11、12 位的桌都停用並標示「已滿」，9 位的桌可以選', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(4, 9);
      await s.fill(5, 10);
      await s.fill(6, 11);
      await s.fill(9, 12);
      await s.employee('王小明');
    });
    await openSeating(page);
    if (isMobileWidth(page)) await page.getByRole('tab', { name: '人員', exact: true }).click();
    await rowAction(page, personRow(page, '王小明'), '入座…');
    const dialog = page.getByRole('dialog', { name: '安排 王小明 入座', exact: true });
    const labels = await optionLabels(page, dialog, /^桌次/);
    for (const n of [5, 6, 9]) {
      expect(labels.find((l) => l.startsWith(`第 ${n} 桌`)), `第 ${n} 桌`).toContain('已滿');
      await expect(page.getByRole('option', { name: new RegExp(`^第 ${n} 桌`) })).toHaveAttribute('aria-disabled', 'true');
    }
    await expect(page.getByRole('option', { name: /^第 4 桌/ })).not.toHaveAttribute('aria-disabled', 'true');
    for (const l of labels) expect(l).not.toMatch(/剩\s*-/);
  });

  test('「移至其他桌次…」也一樣：11 位的桌停用並標示「已滿」', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 3 });
      await s.fill(6, 11);
    });
    await openSeating(page);
    await panelTab(page, '全部').click();
    await rowAction(page, personRow(page, '王小明'), '移至其他桌次…');
    const dialog = page.getByRole('dialog', { name: '把 王小明 移到其他桌次', exact: true });
    await dialog.getByRole('combobox', { name: /^桌次/ }).click();
    const six = page.getByRole('option', { name: /^第 6 桌/ });
    await expect(six).toHaveAttribute('aria-disabled', 'true');
    await expect(six).toContainText('已滿');
  });

  test('座位安排頁頁首的「新增人員」：桌次欄位的 11 位桌停用並標示「已滿」（PPL-R56、SEAT-R88）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(6, 11);
      await s.employeeOnly('陳大文', { department: '研發一部' });
    });
    await openSeating(page);
    await page.getByRole('button', { name: '新增人員', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新增人員' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox', { name: '桌次', exact: true }).click();
    const six = page.getByRole('option', { name: /^第 6 桌/ });
    await expect(six).toBeDisabled();
    await expect(six).toContainText('已滿');
  });
});

test.describe('SEAT-AC95 工作人員桌放到 11、12 位（SEAT-R42、SEAT-R88）', () => {
  test('工作人員桌 10 位 → 把已報名的員工拖進去：成為第 11 位工作人員，工作人員桌顯示「超過」，Sonner 加上「這一桌已超過 10 位。」；詳情副標「11/10 人」', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(STAFF, 10, { prefix: '工作' });
      await s.employee('王小明');
    });
    await openSeating(page);
    await expect(staffTable(page)).toContainText('已滿');
    const saved = waitForOperation(page);
    await dragAndDrop(page, personRow(page, '王小明'), staffTableButton(page));
    await saved;
    await expectToast(page, '已把 王小明 放進工作人員桌，這一桌已超過 10 位。', { undo: true });
    await expect(staffTable(page)).toContainText('超過');
    expect(await rosterNames(STAFF)).toHaveLength(11);
    const detail = await openStaffDetail(page);
    await expect(detail).toContainText('11/10 人');
    await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toBeEnabled();
  });

  test('工作人員桌 11 位、統計列：工作人員桌的人與「超過」都不算（SEAT-R47、SEAT-R75）', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(STAFF, 11, { prefix: '工作' });
      await s.employee('王小明');
    });
    await openSeating(page);
    await expectStats(page, { seated: 0, total: 1, unseated: 1, empty: 300, full: 0 });
  });
});

test.describe('SEAT-AC96 展開卡片與精簡顯示（2.1.6、2.1.7、2.1.9、README 狀態徽章）', () => {
  test('第 5 桌 11 位、全部展開：第 5 桌卡片 12 列（11 位與 1 個空位）；和同一欄的第 4、6 桌卡片不重疊；其他桌仍是 10 列', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(4, 3, { prefix: '四' });
      await s.fill(5, 11, { prefix: '五' });
      await s.fill(6, 10, { prefix: '六' });
    });
    await openSeating(page);
    await widenMap(page);
    await expandAll(page);

    await expectRoster(cardRows(page, 5), names('五', 11), 12);
    await expect(cardRows(page, 4)).toHaveCount(10);
    await expect(cardRows(page, 6)).toHaveCount(10);

    const box4 = await mapTable(page, 4).boundingBox();
    const box5 = await mapTable(page, 5).boundingBox();
    const box6 = await mapTable(page, 6).boundingBox();
    if (!box4 || !box5 || !box6) throw new Error('量不到卡片');
    // 同一欄（B 外）：第 4 桌在上、第 6 桌在下，三張卡片不重疊
    expect(box4.y + box4.height).toBeLessThanOrEqual(box5.y + 0.5);
    expect(box5.y + box5.height).toBeLessThanOrEqual(box6.y + 0.5);
    // 卡片跟著變高
    expect(box5.height).toBeGreaterThan(box4.height);
    await expect(mapTable(page, 5)).toContainText('超過');
  });

  test('第 5 桌 12 位、全部展開：12 列都有人，沒有空位列', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 12, { prefix: '五' });
    });
    await openSeating(page);
    await expandAll(page);
    await expectRoster(cardRows(page, 5), names('五', 12), 12);
    await expect(cardRows(page, 5).filter({ hasText: '空位' })).toHaveCount(0);
  });

  test('收合（80% 以上）：11 位時人數改為「超過」徽章，底色 --status-pending-bg、文字 --status-pending-fg、triangle-alert 圖示；10 位仍是「已滿」', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 11);
      await s.fill(7, 10);
    });
    await openSeating(page);
    await zoomToRegular(page);

    await expect(mapTable(page, 5)).toContainText('超過');
    await expect(mapTable(page, 5)).not.toContainText('11/10');
    await expect(mapTable(page, 5)).not.toContainText('已滿');
    const look = await badgeLook(mapTable(page, 5), '超過');
    expect(look).not.toBeNull();
    expect(look?.background).toBe(await tokenBackground(page, '--status-pending-bg'));
    expect(look?.color).toBe(await tokenColor(page, '--status-pending-fg'));
    expect(look?.icons.some((d) => d.includes(TRIANGLE_ALERT_PATH))).toBe(true);

    await expect(mapTable(page, 7)).toContainText('已滿');
    const full = await badgeLook(mapTable(page, 7), '已滿');
    expect(full?.background).toBe(await tokenBackground(page, '--status-positive-bg'));
    expect(full?.background).not.toBe(look?.background);
  });

  test('縮小到精簡顯示（低於 80%）：11 位的桌只顯示放大的「超過」徽章（高 28 px），沒有「11/10」', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.noteName(5, '主桌');
      await s.fill(5, 11);
    });
    await openSeating(page);
    await zoomToCompact(page);
    await expect(mapTable(page, 5)).toContainText('超過');
    await expect(mapTable(page, 5)).not.toContainText('11/10');
    await expect(mapTable(page, 5)).not.toContainText('主桌');
    const look = await badgeLook(mapTable(page, 5), '超過');
    expect(look?.height).toBe('28px');
    expect(look?.background).toBe(await tokenBackground(page, '--status-pending-bg'));
  });

  test('展開卡片的標頭：11 位的桌人數是「超過」徽章', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 11);
    });
    await openSeating(page);
    await expandAll(page);
    const look = await badgeLook(mapTable(page, 5), '超過');
    expect(look?.background).toBe(await tokenBackground(page, '--status-pending-bg'));
    expect(look?.icons.some((d) => d.includes(TRIANGLE_ALERT_PATH))).toBe(true);
  });

  test('工作人員桌 11、12 位：收合時人數改為「超過」徽章（2.5.1）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(STAFF, 12, { prefix: '工作' });
    });
    await openSeating(page);
    await zoomToRegular(page);
    await expect(staffTable(page)).toContainText('超過');
    await expect(staffTable(page)).not.toContainText('已滿');
    const look = await badgeLook(staffTable(page), '超過');
    expect(look?.background).toBe(await tokenBackground(page, '--status-pending-bg'));
    const detail = await openStaffDetail(page);
    await expect(detail).toContainText('12/10 人');
    for (const name of names('工作', 12)) await expect(rowWithName(detailRows(detail), page, name)).toHaveCount(1);
  });
});

test.describe('SEAT-AC98 復原與對調可以回到 11、12 位（SEAT-R88）', () => {
  test('第 5 桌 11 位 → 移出一位後按「復原」→ 回到 11 位、原本的座號，仍是「超過」', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 11, { prefix: '五' });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 5);
    let saved = waitForOperation(page);
    await rowAction(page, rowWithName(detailRows(detail), page, '五4'), '移出桌次');
    await saved;
    await expectToast(page, '已把 五4 移出第 5 桌。', { undo: true });
    await expect(detail).toContainText('10/10 人');
    await expect(mapTable(page, 5)).toContainText('已滿');

    saved = waitForOperation(page);
    await clickUndo(page, '已把 五4 移出第 5 桌。');
    await saved;
    await expectToast(page, '已復原。', { undo: false });
    await expect.poll(() => rosterNames(5)).toEqual(names('五', 11));
    await expect(detail).toContainText('11/10 人');
    await expect(mapTable(page, 5)).toContainText('超過');
  });

  test('第 5 桌 11 位和 9 位的第 6 桌用把手對調 → 名單整組交換，第 6 桌變成 11 位「超過」、第 5 桌 9 位；統計列不變', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 11, { prefix: '五' });
      await s.fill(6, 9, { prefix: '六' });
    });
    await openSeating(page);
    await expectStats(page, { seated: 20, total: 20, unseated: 0, empty: 281, full: 1, over: 1 });
    const saved = waitForOperation(page);
    await dragAndDrop(page, tableHandle(page, 5), tableButton(page, 6));
    await saved;
    await expectToast(page, '已把第 5 桌和第 6 桌對調', { undo: true });
    await expect.poll(() => rosterNames(6)).toEqual(names('五', 11));
    expect(await rosterNames(5)).toEqual(names('六', 9));
    await expect(mapTable(page, 6)).toContainText('超過');
    await expect(mapTable(page, 5)).toContainText('9/10');
    await expectStats(page, { seated: 20, total: 20, unseated: 0, empty: 281, full: 1, over: 1 });
  });

  test('「調換桌次…」：11 位的桌的選項是「第 5 桌（11/10）・{部門}」，可以選；對調後第 6 桌 11 位', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(5, 11, { prefix: '五', department: '業務部' });
      await s.fill(6, 9, { prefix: '六', department: '研發一部' });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 6);
    await detail.getByRole('button', { name: '調換桌次…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '把第 6 桌和哪一桌對調？', exact: true });
    const labels = await optionLabels(page, dialog, /^桌次/);
    expect(labels).toContain('第 5 桌（11/10）・業務部');
    const five = page.getByRole('option', { name: /^第 5 桌/ });
    await expect(five).not.toHaveAttribute('aria-disabled', 'true');
    await five.click();
    const saved = waitForOperation(page);
    await dialog.getByRole('button', { name: '確認對調' }).click();
    await saved;
    await expect.poll(() => rosterNames(6)).toEqual(names('五', 11));
    await expect(tableDetail(page, 6)).toContainText('11/10 人');
  });
});

test.describe('統計列（SEAT-R75）', () => {
  test('有桌次超過 10 位：最後加「・超過 {u} 桌」；空位每桌只算到 10 位；已滿算 10 位以上的桌（含超過）；工作人員桌不算', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(3, 4);
      await s.fill(5, 11);
      await s.fill(7, 10);
      await s.fill(9, 12);
      await s.unseated(1);
      await s.fill(STAFF, 12, { prefix: '工作' });
    });
    await openSeating(page);
    // 空位：第 3 桌 6 位 + 其他 26 桌各 10 位 = 266（不是 300 − 37）
    await expectStats(page, { seated: 37, total: 38, unseated: 1, empty: 266, full: 3, over: 2 });
  });
});

test.describe('手機：只能用「加入人員」放進第 11、12 位（SEAT-R82、SEAT-AC93）', () => {
  test('375 以下寬度：第 5 桌 10 位的詳情 Dialog 按「加入人員」→ 說明「已滿，最多還可以加入 2 位。」；加入 2 位後 12 位、「加入人員」停用', async ({
    page,
  }) => {
    test.skip(!isMobileWidth(page), '手機版面');
    await seed(async (s) => {
      await s.fill(5, 10, { prefix: '五' });
      for (const name of ['甲', '乙', '丙']) await s.employee(name);
    });
    await openSeating(page);
    await tableButton(page, 5).click();
    const detail = page.getByRole('dialog', { name: '第 5 桌', exact: true });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: '加入人員', exact: true }).click();

    const dialog = addDialog(page, 5);
    await expect(dialog).toContainText('已滿，最多還可以加入 2 位。');
    await dialog.getByRole('checkbox', { name: /^甲/ }).check();
    await dialog.getByRole('checkbox', { name: /^乙/ }).check();
    const third = dialog.getByRole('checkbox', { name: /^丙/ });
    await third.click();
    await expect(third).not.toBeChecked();
    await expect(dialog.getByText('最多只能再加入 2 位。')).toBeVisible();

    const saved = waitForOperation(page);
    await dialog.getByRole('button', { name: '加入 2 位' }).click();
    await saved;
    await expect(dialog).toBeHidden();
    await expectToast(page, '已把 2 位人員加入第 5 桌，這一桌已超過 10 位。', { undo: true });
    expect(await rosterNames(5)).toHaveLength(12);
    await expect(detail).toContainText('12/10 人');
    await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toBeDisabled();
  });

  test('手機的選擇桌次：11 位的桌也停用並標示「已滿」', async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機版面');
    await seed(async (s) => {
      await s.fill(6, 11);
      await s.employee('王小明');
    });
    await openSeating(page);
    await page.getByRole('tab', { name: '人員', exact: true }).click();
    await rowAction(page, personRow(page, '王小明'), '入座…');
    const dialog = page.getByRole('dialog', { name: '安排 王小明 入座', exact: true });
    await dialog.getByRole('combobox', { name: /^桌次/ }).click();
    const six = page.getByRole('option', { name: /^第 6 桌/ });
    await expect(six).toHaveAttribute('aria-disabled', 'true');
    await expect(six).toContainText('已滿');
  });
});
