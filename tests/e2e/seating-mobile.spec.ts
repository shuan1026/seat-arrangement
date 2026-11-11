// 手機（767 px 以下，mobile-320 project）：docs/spec/seating.md 2.1.11、2.2.6、2.3.6、2.4（手機）、2.5.4；
// SEAT-R81～R83；SEAT-AC81～AC85；SEAT-Q08（手機用「適合視窗」，30 桌全部可見）、SEAT-Q10（在「人員」分頁按「{桌號}」
// 會切到「座位圖」分頁再標示，原型的做法，目前假設）；docs/spec/README.md 第 9 節（手機 Dialog 按鈕滿版堆疊、主要按鈕在上）；
// D-023（手機的桌次詳情不顯示名單說明「拖移可以調整順序…」，只留「名單」標題；桌面見 seating-map.spec.ts）。
// 桌號 A1～A15、B1～B15（D-019）：測試資料用內部編號（3 = B4、7 = B2、8 = B5、12 = B3），畫面上的字用桌號。
import { expect, test, type Locator } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { rosterNames, rosterNamesAt, seed, STAFF } from './helpers/seating-data';
import {
  chooseOption,
  detailRows,
  drop,
  dragOver,
  expectRoster,
  expectToast,
  hasBorderColor,
  isInside,
  mapTable,
  openSeating,
  peoplePanel,
  personRow,
  rowAction,
  rowWithName,
  seatMap,
  showMap,
  showPeople,
  staffTable,
  staffTableButton,
  stagingArea,
  startDrag,
  tableButton,
  tableDetail,
  titleFor,
  staffDetail,
  toolbarButton,
  waitForOperation,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL, page }) => {
  test.skip(!isMobileWidth(page), '手機版面');
  await signIn(context, requireBaseURL(baseURL));
});

/** 手機 Dialog 的按鈕滿版堆疊，主要按鈕在上（docs/spec/README.md 第 9 節） */
async function expectStackedPrimaryOnTop(dialog: Locator, primary: string, secondary: string) {
  const p = await dialog.getByRole('button', { name: primary, exact: true }).boundingBox();
  const s = await dialog.getByRole('button', { name: secondary, exact: true }).boundingBox();
  if (!p || !s) throw new Error('量不到按鈕');
  expect(p.y + p.height).toBeLessThanOrEqual(s.y + 1);
  expect(Math.abs(p.width - s.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(p.x - s.x)).toBeLessThanOrEqual(1);
}

test('頁首下方有「座位圖」「人員」分頁，一次只顯示一個；座位圖收合並適合視窗；工具列沒有「顯示人員面板」（SEAT-R81、SEAT-AC81）', async ({
  page,
}) => {
  await seed(async (s) => {
    await s.fill(3, 2);
    await s.employee('王小明');
  });
  await openSeating(page);

  const mapTab = page.getByRole('tab', { name: '座位圖', exact: true });
  const peopleTab = page.getByRole('tab', { name: '人員', exact: true });
  await expect(mapTab).toHaveAttribute('aria-selected', 'true');
  await expect(seatMap(page)).toBeVisible();
  await expect(peoplePanel(page)).toBeHidden();

  // 收合：沒有名單卡片；適合視窗：30 桌、工作人員桌與暫存區都在座位圖區內（D-027：暫存區是場地圖的一部分，SEAT-R64、2.1.11）
  await expect(mapTable(page, 3).getByRole('listitem')).toHaveCount(0);
  const area = await seatMap(page).boundingBox();
  if (!area) throw new Error('量不到座位圖區');
  for (let n = 1; n <= 30; n++) expect(await isInside(mapTable(page, n), area), titleFor(n)).toBe(true);
  expect(await isInside(staffTable(page), area)).toBe(true);
  expect(await isInside(stagingArea(page), area), '暫存區').toBe(true);

  for (const name of ['縮小', '放大', '適合視窗', '全部展開', '自動排座']) await expect(toolbarButton(page, name), name).toBeVisible();
  await expect(toolbarButton(page, '顯示人員面板')).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await peopleTab.click();
  await expect(peoplePanel(page)).toBeVisible();
  await expect(seatMap(page)).toBeHidden();
  await expect(peoplePanel(page).getByRole('button', { name: '隱藏人員面板' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test('不能拖移：桌次沒有拖移把手；人員列與詳情名單列拖了也不會改變（SEAT-R82、SEAT-AC82）', async ({ page }) => {
  await seed(async (s) => {
    for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
    await s.employee('王小明');
  });
  await openSeating(page);
  await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);

  const detail = tableDetail(page, 3);
  await tableButton(page, 3).click();
  await expect(detail).toBeVisible();
  await startDrag(page, rowWithName(detailRows(detail), page, '乙'));
  await dragOver(page, rowWithName(detailRows(detail), page, '甲'));
  await drop(page);
  await page.waitForTimeout(500);
  await expectRoster(detailRows(detail), ['甲', '乙']);
  expect(await rosterNames(3)).toEqual(['甲', '乙']);
  await page.keyboard.press('Escape');

  await showPeople(page);
  await startDrag(page, personRow(page, '王小明'));
  await page.mouse.move(10, 10, { steps: 8 });
  await drop(page);
  await expect(peoplePanel(page).getByText('放開以移出桌次')).toBeHidden();
  await expect(personRow(page, '王小明')).toHaveCount(1);
});

test('「人員」分頁的列操作「入座…」選 B2 桌確認；再用「移至其他桌次…」移到 B5 桌；都有 Sonner；對話框按鈕滿版堆疊（SEAT-R82、SEAT-AC83）', async ({
  page,
}) => {
  await seed(async (s) => {
    await s.employee('王小明');
  });
  await openSeating(page);
  await showPeople(page);

  await rowAction(page, personRow(page, '王小明'), '入座…');
  const seatDialog = page.getByRole('dialog', { name: '安排 王小明 入座', exact: true });
  await expectStackedPrimaryOnTop(seatDialog, '確認入座', '取消');
  await chooseOption(page, seatDialog, /^桌次/, /^B2 桌/);
  let saved = waitForOperation(page);
  await seatDialog.getByRole('button', { name: '確認入座' }).click();
  await saved;
  await expect(seatDialog).toBeHidden();
  await expectToast(page, '已把 王小明 安排到 B2 桌。', { undo: true });
  expect(await rosterNames(7)).toEqual(['王小明']);

  await page.getByRole('tab', { name: /^全部/ }).click();
  await rowAction(page, personRow(page, '王小明'), '移至其他桌次…');
  const moveDialog = page.getByRole('dialog', { name: '把 王小明 移到其他桌次', exact: true });
  await chooseOption(page, moveDialog, /^桌次/, /^B5 桌/);
  saved = waitForOperation(page);
  await moveDialog.getByRole('button', { name: '確認移動' }).click();
  await saved;
  await expectToast(page, '已把 王小明 從 B2 桌移到 B5 桌。', { undo: true });
  expect(await rosterNames(8)).toEqual(['王小明']);
  expect(await rosterNames(7)).toEqual([]);
});

test('點 B4 桌：桌次詳情以 Dialog 顯示，有「加入人員」「調換桌次…」「清空桌次」；用「調換桌次…」和 B2 桌對調（SEAT-R82、SEAT-R83、SEAT-AC84）', async ({
  page,
}) => {
  await seed(async (s) => {
    for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
    await s.employee('丙', { tableId: 7 });
  });
  await openSeating(page);
  await tableButton(page, 3).click();

  const detail = page.getByRole('dialog', { name: 'B4 桌', exact: true });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('2/10 人');
  for (const name of ['加入人員', '調換桌次…', '清空桌次']) await expect(detail.getByRole('button', { name, exact: true }), name).toBeVisible();
  await expectNoHorizontalScroll(page);

  await detail.getByRole('button', { name: '調換桌次…', exact: true }).click();
  const swap = page.getByRole('dialog', { name: '把 B4 桌和哪一桌對調？', exact: true });
  await expectStackedPrimaryOnTop(swap, '確認對調', '取消');
  await chooseOption(page, swap, /^桌次/, /^B2 桌/);
  const saved = waitForOperation(page);
  await swap.getByRole('button', { name: '確認對調' }).click();
  await saved;
  await expectToast(page, '已把 B4 桌和 B2 桌對調。', { undo: true });
  // D-027：兩桌交換位置；用位置查（B4 的位置上是丙）
  expect(await rosterNamesAt(3)).toEqual(['丙']);
  expect(await rosterNamesAt(7)).toEqual(['甲', '乙']);
});

test('點 B4 桌：詳情 Dialog 有「名單」標題與名單，不顯示名單說明「拖移可以調整順序，也可以從人員面板直接拖進來。」（手機不能拖移；2.3.1、2.3.6、SEAT-R82、D-023）', async ({
  page,
}) => {
  await seed(async (s) => {
    for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
  });
  await openSeating(page);
  await tableButton(page, 3).click();

  const detail = page.getByRole('dialog', { name: 'B4 桌', exact: true });
  await expect(detail).toBeVisible();
  // 編輯者的詳情（有底部按鈕）；只能檢視時本來就沒有說明，見 viewer-seating.spec.ts 的 SEAT-AC101
  await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toBeVisible();
  await expect(detail.getByRole('heading', { name: '名單', exact: true })).toBeVisible();
  await expectRoster(detailRows(detail), ['甲', '乙']);
  await expect(detail.getByText('拖移可以調整順序，也可以從人員面板直接拖進來。')).toBeHidden();
  await expect(detail.getByText(/拖移可以調整順序/)).toBeHidden();
  await expectNoHorizontalScroll(page);
});

test('點工作人員桌：詳情以 Dialog 顯示，用「加入人員」放進王小明；再用名單列的「移出工作人員桌」變成未入座（SEAT-R82、SEAT-R83、SEAT-AC85）', async ({
  page,
}) => {
  await seed(async (s) => {
    await s.employee('王小明');
  });
  await openSeating(page);
  await staffTableButton(page).click();

  const detail = staffDetail(page);
  await expect(page.getByRole('dialog', { name: '工作人員桌', exact: true })).toBeVisible();
  await detail.getByRole('button', { name: '加入人員', exact: true }).click();
  const add = page.getByRole('dialog', { name: '加入人員到工作人員桌', exact: true });
  await add.getByRole('checkbox', { name: /^王小明/ }).check();
  let saved = waitForOperation(page);
  await add.getByRole('button', { name: '加入 1 位' }).click();
  await saved;
  // 加入人員對話框疊在工作人員桌詳情上，關掉後詳情的名單才查得到
  await expect(add).toBeHidden();
  await expectToast(page, '已把 1 位人員放進工作人員桌。', { undo: true });
  expect(await rosterNames(STAFF)).toEqual(['王小明']);

  saved = waitForOperation(page);
  await rowAction(page, rowWithName(detailRows(detail), page, '王小明'), '移出工作人員桌');
  await saved;
  await expectToast(page, '已把 王小明 移出工作人員桌。', { undo: true });
  expect(await rosterNames(STAFF)).toEqual([]);
});

test('在「人員」分頁按「{桌號}」：切到「座位圖」分頁並標示那一桌（SEAT-R62、SEAT-Q10 的目前假設）', async ({ page }) => {
  await seed(async (s) => {
    await s.employee('王小明', { tableId: 12 }); // B3 桌
  });
  await openSeating(page);
  await showPeople(page);
  await page.getByRole('tab', { name: /^全部/ }).click();
  await personRow(page, '王小明').getByRole('button', { name: 'B3', exact: true }).click();
  await expect(page.getByRole('tab', { name: '座位圖', exact: true })).toHaveAttribute('aria-selected', 'true');
  await showMap(page);
  await expect.poll(() => hasBorderColor(page, mapTable(page, 12), '--accent', '2px')).toBe(true);
});
