// 復原（桌面）：docs/spec/seating.md 3.14；SEAT-R76～R80；SEAT-AC75～AC80；
// docs/spec/README.md 第 14 節（「復原」按鈕、「已復原。」）、COM-R01（復原也立即儲存）；
// SEAT-Q15（只能按 Sonner 上的「復原」，做了下一個可以復原的操作後前一個就不能再復原）。
// 每次操作先等伺服器回應（undo 由回應帶回），再按「復原」。
// 桌號 A1～A15、B1～B15（D-019）：測試資料用內部編號（3 = B4、7 = B2），畫面上的字用桌號。
import { expect, test } from '@playwright/test';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { noteNameOf, rosterNames, seed, STAFF } from './helpers/seating-data';
import {
  chooseOption,
  clickUndo,
  detailRows,
  dragAndDrop,
  expectRoster,
  expectStats,
  expectToast,
  mapTable,
  openSeating,
  openTableDetail,
  panelTab,
  personRow,
  rowAction,
  rowWithName,
  staffTableButton,
  titleFor,
  toast,
  waitForOperation,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL, page }) => {
  test.skip(isMobileWidth(page), '桌面版面');
  await signIn(context, requireBaseURL(baseURL));
});

const UNDONE = '已復原。';

test('搬移後按「復原」：回到 B4 桌第 2 列，B2 桌恢復原狀，顯示「已復原。」，統計列與詳情立即更新（SEAT-R78、SEAT-R79、SEAT-AC75）', async ({
  page,
}) => {
  await seed(async (s) => {
    for (const name of ['甲', '王小明', '乙']) await s.employee(name, { tableId: 3 });
    await s.employee('丙', { tableId: 7 });
  });
  await openSeating(page);
  const detail = await openTableDetail(page, 3);

  await rowAction(page, rowWithName(detailRows(detail), page, '王小明'), '移至其他桌次…');
  const dialog = page.getByRole('dialog', { name: '把 王小明 移到其他桌次', exact: true });
  await chooseOption(page, dialog, /^桌次/, /^B2 桌/);
  const moved = waitForOperation(page);
  await dialog.getByRole('button', { name: '確認移動' }).click();
  await moved;
  await expect(dialog).toBeHidden();
  await expectRoster(detailRows(detail), ['甲', '乙']);

  const restored = waitForOperation(page);
  await clickUndo(page, '已把 王小明 從 B4 桌移到 B2 桌。');
  await restored;
  await expectToast(page, UNDONE, { undo: false });
  await expectRoster(detailRows(detail), ['甲', '王小明', '乙']);
  await expect(detail).toContainText('3/10 人');
  await expect(mapTable(page, 7)).toContainText('1/10');
  expect(await rosterNames(3)).toEqual(['甲', '王小明', '乙']);
  expect(await rosterNames(7)).toEqual(['丙']);
});

test('對調後按「復原」：兩桌的名單、順序與備註名稱回到對調前（SEAT-R78、SEAT-AC76）', async ({ page }) => {
  await seed(async (s) => {
    await s.noteName(3, '主桌');
    for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
    for (const name of ['丙', '丁', '戊']) await s.employee(name, { tableId: 7 });
  });
  await openSeating(page);
  const detail = await openTableDetail(page, 3);
  await detail.getByRole('button', { name: '調換桌次…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '把 B4 桌和哪一桌對調？', exact: true });
  await chooseOption(page, dialog, /^桌次/, /^B2 桌/);
  const swapped = waitForOperation(page);
  await dialog.getByRole('button', { name: '確認對調' }).click();
  await swapped;
  await expect(dialog).toBeHidden();

  await clickUndo(page, '已把 B4 桌和 B2 桌對調。');
  await expectToast(page, UNDONE, { undo: false });
  await expect.poll(() => rosterNames(3)).toEqual(['甲', '乙']);
  expect(await rosterNames(7)).toEqual(['丙', '丁', '戊']);
  expect(await noteNameOf(3)).toBe('主桌');
  expect(await noteNameOf(7)).toBeNull();
});

test('清空後按「復原」：6 位回到 B4 桌原本的座號，「未入座」分頁不再有他們（SEAT-R78、SEAT-AC77）', async ({ page }) => {
  await seed(async (s) => {
    await s.noteName(3, '主桌');
    await s.fill(3, 6, { prefix: '清' });
  });
  await openSeating(page);
  const detail = await openTableDetail(page, 3);
  await detail.getByRole('button', { name: '清空桌次', exact: true }).click();
  const cleared = waitForOperation(page);
  await page.getByRole('alertdialog', { name: '要清空 B4 桌嗎？' }).getByRole('button', { name: '清空桌次' }).click();
  await cleared;
  await expect(personRow(page, '清1')).toHaveCount(1);

  await clickUndo(page, '已清空 B4 桌。');
  await expectToast(page, UNDONE, { undo: false });
  await expectRoster(detailRows(detail), ['清1', '清2', '清3', '清4', '清5', '清6']);
  for (let i = 1; i <= 6; i++) await expect(personRow(page, `清${i}`)).toHaveCount(0);
  expect(await rosterNames(3)).toEqual(['清1', '清2', '清3', '清4', '清5', '清6']);
});

test('先把甲安排到 B4 桌、再把乙安排到 B2 桌：甲的入座不能再復原；按乙的「復原」只還原乙（SEAT-R77、SEAT-AC78、SEAT-Q15）', async ({
  page,
}) => {
  await seed(async (s) => {
    await s.employee('甲');
    await s.employee('乙');
  });
  await openSeating(page);

  for (const [name, table] of [
    ['甲', 3],
    ['乙', 7],
  ] as const) {
    await rowAction(page, personRow(page, name), '入座…');
    const dialog = page.getByRole('dialog', { name: `安排 ${name} 入座`, exact: true });
    await chooseOption(page, dialog, /^桌次/, new RegExp(`^${titleFor(table)}`));
    const saved = waitForOperation(page);
    await dialog.getByRole('button', { name: '確認入座' }).click();
    await saved;
    await expect(dialog).toBeHidden();
  }

  // 甲的 Sonner 若還在，它的「復原」已經沒有作用
  const jiaUndo = toast(page, '已把 甲 安排到 B4 桌。').getByRole('button', { name: '復原' });
  if ((await jiaUndo.count()) > 0) {
    await jiaUndo.first().dispatchEvent('click');
    await page.waitForTimeout(500);
  }
  expect(await rosterNames(3)).toEqual(['甲']);

  const restored = waitForOperation(page);
  await clickUndo(page, '已把 乙 安排到 B2 桌。');
  await restored;
  await expectToast(page, UNDONE, { undo: false });
  await expect(personRow(page, '乙')).toHaveCount(1);
  expect(await rosterNames(7)).toEqual([]);
  expect(await rosterNames(3)).toEqual(['甲']);
});

test('加入 3 位後按「復原」：3 位一起回到未入座，B4 桌回到 7 位（SEAT-R78、SEAT-AC79）', async ({ page }) => {
  await seed(async (s) => {
    await s.fill(3, 7, { prefix: '三' });
    for (const name of ['甲', '乙', '丙']) await s.employee(name);
  });
  await openSeating(page);
  const detail = await openTableDetail(page, 3);
  await detail.getByRole('button', { name: '加入人員', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '加入人員到 B4 桌', exact: true });
  for (const name of ['甲', '乙', '丙']) await dialog.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
  const added = waitForOperation(page);
  await dialog.getByRole('button', { name: '加入 3 位' }).click();
  await added;
  await expect(dialog).toBeHidden();

  await clickUndo(page, '已把 3 位人員加入 B4 桌。');
  await expectToast(page, UNDONE, { undo: false });
  await expect(detail).toContainText('7/10 人');
  for (const name of ['甲', '乙', '丙']) await expect(personRow(page, name)).toHaveCount(1);
  expect(await rosterNames(3)).toHaveLength(7);
});

test('從 B4 桌第 4 列拖到工作人員桌後按「復原」：不再是工作人員，回到 B4 桌第 4 列（SEAT-R78、SEAT-AC80）', async ({ page }) => {
  await seed(async (s) => {
    for (const name of ['甲', '乙', '丙', '王小明', '丁']) await s.employee(name, { tableId: 3 });
  });
  await openSeating(page);
  await panelTab(page, '全部').click();
  const moved = waitForOperation(page);
  await dragAndDrop(page, personRow(page, '王小明'), staffTableButton(page));
  await moved;
  expect(await rosterNames(3)).toEqual(['甲', '乙', '丙', '丁']);

  await clickUndo(page, '已把 王小明 從 B4 桌移到工作人員桌。');
  await expectToast(page, UNDONE, { undo: false });
  await expect.poll(() => rosterNames(3)).toEqual(['甲', '乙', '丙', '王小明', '丁']);
  expect(await rosterNames(STAFF)).toEqual([]);
});

test('入座、移出、調整順序、移出工作人員桌都可以復原，復原後統計列立即更新（SEAT-R76、SEAT-R79）', async ({ page }) => {
  await seed(async (s) => {
    for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
    await s.employee('王小明');
    await s.staff('工作甲');
  });
  await openSeating(page);
  await expectStats(page, { seated: 2, total: 3, unseated: 1, empty: 298, full: 0 });

  // 入座
  await rowAction(page, personRow(page, '王小明'), '入座…');
  const seatDialog = page.getByRole('dialog', { name: '安排 王小明 入座', exact: true });
  await chooseOption(page, seatDialog, /^桌次/, /^B4 桌/);
  let saved = waitForOperation(page);
  await seatDialog.getByRole('button', { name: '確認入座' }).click();
  await saved;
  await expect(seatDialog).toBeHidden();
  await expectStats(page, { seated: 3, total: 3, unseated: 0, empty: 297, full: 0 });
  saved = waitForOperation(page);
  await clickUndo(page, '已把 王小明 安排到 B4 桌。');
  await saved;
  await expectStats(page, { seated: 2, total: 3, unseated: 1, empty: 298, full: 0 });

  // 移出
  const detail = await openTableDetail(page, 3);
  saved = waitForOperation(page);
  await rowAction(page, rowWithName(detailRows(detail), page, '甲'), '移出桌次');
  await saved;
  saved = waitForOperation(page);
  await clickUndo(page, '已把 甲 移出 B4 桌。');
  await saved;
  await expectRoster(detailRows(detail), ['甲', '乙']);

  // 調整順序
  saved = waitForOperation(page);
  await dragAndDrop(page, rowWithName(detailRows(detail), page, '乙'), rowWithName(detailRows(detail), page, '甲'));
  await saved;
  saved = waitForOperation(page);
  await clickUndo(page, '已調整 B4 桌的座位順序。');
  await saved;
  await expectRoster(detailRows(detail), ['甲', '乙']);
  expect(await rosterNames(3)).toEqual(['甲', '乙']);

  // 移出工作人員桌
  await panelTab(page, '全部').click();
  saved = waitForOperation(page);
  await rowAction(page, personRow(page, '工作甲'), '移出工作人員桌');
  await saved;
  saved = waitForOperation(page);
  await clickUndo(page, '已把 工作甲 移出工作人員桌。');
  await saved;
  expect(await rosterNames(STAFF)).toEqual(['工作甲']);
  await expect(personRow(page, '工作甲')).toContainText('工作人員');
});
