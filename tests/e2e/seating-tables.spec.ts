// 桌子可以新增、刪除、搬動，場地旁有暫存區（D-027）：docs/spec/seating.md v1.7 的 2.1.9（「未放桌」、暫存的桌）、2.1.12（暫存區）、
// 2.2.2、2.2.3（「暫存」徽章與列操作）、2.3.1、2.3.6～2.3.10、第 4 節文案；SEAT-R35～R39、R57、R62、R64、R69、R75、R76、R78、R82、R84、
// R85、R90～R98；驗收條件 SEAT-AC107～AC128（第 5.14 節）。
// 調換桌次列出「未放桌」（SEAT-AC116）與鍵盤聚焦「未放桌」、暫存的桌在 seating-dialogs.spec.ts；對調（SEAT-AC30～AC35、AC76）在
// seating-drag.spec.ts、seating-dialogs.spec.ts、seating-undo.spec.ts；伺服器端的指令、衝突與 restore 在 tests/integration/api/seating-tables.test.ts。
//
// 資料：seed() 先把桌子恢復成 1–30 桌在原位置（tests/e2e/helpers/seating-data.ts），s.emptyPosition(位置) 讓那個位置變成「未放桌」，
// s.stagedTable(備註名稱) 新增一張暫存的桌（排在暫存區最下面）。位置編號與桌號：1 = B1、2 = A1、3 = B4、7 = B2、8 = B5、9 = B8、17 = A3。
// 資料庫用位置查：rosterNamesAt、noteNameAt、tableIdAt；暫存區用 stagedTables()（依由上往下的順序）。
// 無障礙結構的假設見 helpers/seating-page.ts 開頭（暫存區 region「暫存區」、暫存的桌「暫存，…」、「未放桌」button「B8 未放桌」）。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { CODES_IN_LIST_ORDER } from '../helpers/table-codes';
import { JIA, signIn, signInAsViewer, YI } from './helpers/auth';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { withDb } from './helpers/participants-db';
import { CONFLICT_TOAST } from './helpers/permissions-page';
import { openEditorBrowser, resetEverything } from './helpers/scenario';
import { noteNameAt, participantCount, rosterNamesAt, seatOf, seed, stagedTables, tableIdAt } from './helpers/seating-data';
import {
  chooseOption,
  clickUndo,
  cursorAt,
  detailRows,
  dragAndDrop,
  dragOver,
  drop,
  emptySlot,
  expandAll,
  expectNoToast,
  expectStats,
  expectToast,
  hasBorderColor,
  hasDashedBorder,
  hasShadow,
  isInside,
  mapTable,
  menuItemsOf,
  openSeating,
  openStaffDetail,
  openStagedDetail,
  openTableDetail,
  optionLabels,
  panelTab,
  personRow,
  rowAction,
  rowWithName,
  seatMap,
  showMap,
  showPeople,
  slotPanel,
  staffTable,
  staffTableButton,
  stagedButtons,
  stagedDetail,
  stagedHandle,
  stagedTable,
  stagedTableButton,
  stagingArea,
  startDrag,
  tableButton,
  tableDetail,
  tableHandle,
  toolbarButton,
  waitForOperation,
  zoomToRegular,
} from './helpers/seating-page';

const B1 = 1;
const A1 = 2;
const B4 = 3;
const B2 = 7;
const B5 = 8;
const B8 = 9;
const A3 = 17;

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面才有拖移與浮出的詳情；手機見檔案最後一組');

/** 元素（含子孫）都沒有底色與陰影 */
async function hasNoFillOrShadow(loc: Locator): Promise<boolean> {
  return loc.evaluate((root) =>
    [root, ...Array.from(root.querySelectorAll('*'))].every((el) => {
      const s = getComputedStyle(el);
      const clear = s.backgroundColor === 'rgba(0, 0, 0, 0)' || s.backgroundColor === 'transparent';
      return clear && (s.boxShadow === 'none' || s.boxShadow === '');
    }),
  );
}

/** 暫存區由上往下每一桌的無障礙名稱 */
const stagedLabels = (page: Page) => stagedButtons(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));

test.describe('「未放桌」的位置（2.1.9、SEAT-R75、SEAT-R95、SEAT-AC107、AC108）', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, requireBaseURL(baseURL));
  });

  test('SEAT-AC107：B8 是和桌子同樣大小的虛線框，沒有底色、陰影與拖移把手，中間是「B8」與「未放桌」；B5 是空桌，有卡片底色、虛線邊框與「空桌」', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.emptyPosition(B8);
      await s.employee('王小明');
    });
    await openSeating(page);
    await zoomToRegular(page);

    const slot = emptySlot(page, B8);
    await expect(slot).toBeVisible();
    await expect(slot.getByText('B8', { exact: true })).toBeVisible();
    await expect(slot.getByText('未放桌', { exact: true })).toBeVisible();
    expect(await hasDashedBorder(slot), '虛線外框').toBe(true);
    expect(await hasNoFillOrShadow(slot), '沒有底色與陰影').toBe(true);
    await expect(seatMap(page).getByRole('group', { name: 'B8 桌', exact: true })).toHaveCount(0);
    const slotSize = await slot.evaluate((el) => [(el as HTMLElement).offsetWidth, (el as HTMLElement).offsetHeight]);
    const tableSize = await tableButton(page, B5).evaluate((el) => [(el as HTMLElement).offsetWidth, (el as HTMLElement).offsetHeight]);
    expect(slotSize, '和桌子同樣大小（收合時直徑 88 px）').toEqual(tableSize);
    // 「未放桌」的位置上沒有拖移把手：把手數量是 29（場上的桌）
    await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(29);

    const b5 = tableButton(page, B5);
    await expect(mapTable(page, B5)).toContainText('空桌');
    expect(await hasDashedBorder(mapTable(page, B5)), 'B5 空桌是虛線邊框').toBe(true);
    const b5Fill = await b5.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(b5Fill === 'rgba(0, 0, 0, 0)' || b5Fill === 'transparent', 'B5 空桌有卡片底色').toBe(false);
  });

  test('SEAT-AC107：把未入座的王小明拖到 B8 上 → 游標 not-allowed、沒有放置樣式；放開後沒有入座、沒有 Sonner；統計列的空位與已滿都不算 B8', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.emptyPosition(B8);
      await s.employee('王小明');
    });
    await openSeating(page);
    await expectStats(page, { seated: 0, total: 1, unseated: 1, empty: 290, full: 0 });

    await startDrag(page, personRow(page, '王小明'));
    const point = await dragOver(page, emptySlot(page, B8));
    await expect.poll(() => cursorAt(page, point)).toBe('not-allowed');
    expect(await hasBorderColor(page, emptySlot(page, B8), '--primary')).toBe(false);
    await drop(page);

    await page.waitForTimeout(500);
    await expectNoToast(page);
    expect(await seatOf(await personId(page, '王小明'))).toEqual({ tableId: null, seatOrder: null });
    await expect(emptySlot(page, B8)).toBeVisible();
    await expectStats(page, { seated: 0, total: 1, unseated: 1, empty: 290, full: 0 });
  });

  test('SEAT-AC108：B4、B8 是「未放桌」，其他 28 桌都是空桌，參與人員 20 位都未入座 →「已入座 0／20・未入座 20・空位 280・已滿 0 桌」', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.emptyPosition(B4);
      await s.emptyPosition(B8);
      await s.unseated(20);
    });
    await openSeating(page);
    await expectStats(page, { seated: 0, total: 20, unseated: 20, empty: 280, full: 0 });
  });
});

/** 參與人員 id（用資料庫的顯示名稱找；這個檔案的姓名不重複） */
async function personId(_page: Page, name: string): Promise<number> {
  const p = await withDb((db) => db.find(name));
  if (!p) throw new Error(`沒有參與人員 ${name}`);
  return p.id;
}

test.describe('拖桌子的把手（桌面，SEAT-R35～R38、SEAT-AC109～AC114）', () => {
  test.beforeEach(async ({ context, baseURL, page }) => {
    desktopOnly(page);
    await signIn(context, requireBaseURL(baseURL));
  });

  test('SEAT-AC109：B4 桌（「主桌」，甲、乙）拖到 B8（未放桌）→ 經過時 B8 邊框 --primary、虛線變實線；放開後 B8 桌有甲、乙與「主桌」，B4 變成「未放桌」；Sonner「已把 B4 桌搬到 B8。」→「復原」後回到原狀', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.emptyPosition(B8);
      await s.noteName(B4, '主桌');
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: B4 });
    });
    await openSeating(page);

    await startDrag(page, tableHandle(page, B4));
    await dragOver(page, emptySlot(page, B8));
    await expect.poll(() => hasBorderColor(page, emptySlot(page, B8), '--primary')).toBe(true);
    await expect.poll(() => hasShadow(page, emptySlot(page, B8), '--shadow-md')).toBe(true);
    await expect.poll(() => hasDashedBorder(emptySlot(page, B8)), '經過時虛線變實線').toBe(false);
    const saved = waitForOperation(page);
    await drop(page);
    await saved;

    await expectToast(page, '已把 B4 桌搬到 B8。', { undo: true });
    await expect.poll(() => rosterNamesAt(B8)).toEqual(['甲', '乙']);
    expect(await noteNameAt(B8)).toBe('主桌');
    expect(await tableIdAt(B4)).toBeNull();
    await expect(emptySlot(page, B4)).toBeVisible();
    await expect(mapTable(page, B8)).toContainText('2/10');

    await clickUndo(page, '已把 B4 桌搬到 B8。');
    await expectToast(page, '已復原。', { undo: false });
    await expect.poll(() => rosterNamesAt(B4)).toEqual(['甲', '乙']);
    expect(await noteNameAt(B4)).toBe('主桌');
    expect(await tableIdAt(B8)).toBeNull();
    await expect(emptySlot(page, B8)).toBeVisible();
    await expect(emptySlot(page, B4)).toHaveCount(0);
  });

  test('SEAT-AC110、AC111：B4 桌（「主桌」，甲、乙）拖到暫存區 → 暫存區有一桌（「暫存」、「主桌」），B4 變成「未放桌」，統計列已入座少 2、未入座多 2，甲、乙在「未入座」分頁、徽章「暫存」；再把暫存的桌拖到 A3（未放桌）→ A3 桌有甲、乙與「主桌」，暫存區沒有桌，Sonner「已把「主桌」放到 A3。」', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.emptyPosition(A3);
      await s.noteName(B4, '主桌');
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: B4 });
      await s.employee('丙', { tableId: B2 });
    });
    await openSeating(page);
    await expectStats(page, { seated: 3, total: 3, unseated: 0, empty: 287, full: 0 });

    // 拖到暫存區（暫存區經過時邊框 --primary）
    await startDrag(page, tableHandle(page, B4));
    await dragOver(page, stagingArea(page));
    await expect.poll(() => hasBorderColor(page, stagingArea(page), '--primary')).toBe(true);
    let saved = waitForOperation(page);
    await drop(page);
    await saved;

    await expectToast(page, '已把 B4 桌移到暫存區。', { undo: true });
    await expect(stagedButtons(page)).toHaveCount(1);
    await expect(stagedTableButton(page, 0)).toHaveAttribute('aria-label', /^暫存，主桌，/);
    await zoomToRegular(page);
    await expect(stagedTable(page, 0).getByText('暫存', { exact: true })).toBeVisible();
    await expect(stagedTable(page, 0).getByText('主桌', { exact: true })).toBeVisible();
    await expect(emptySlot(page, B4)).toBeVisible();
    expect(await stagedTables()).toEqual([expect.objectContaining({ noteName: '主桌', names: ['甲', '乙'] })]);
    // A3、B4 都是「未放桌」：場上 28 桌，丙坐 B2 → 空位 279
    await expectStats(page, { seated: 1, total: 3, unseated: 2, empty: 279, full: 0 });
    await showPeople(page);
    await panelTab(page, '未入座').click();
    for (const name of ['甲', '乙']) {
      await expect(personRow(page, name), name).toHaveCount(1);
      await expect(personRow(page, name).getByRole('button', { name: '暫存', exact: true }), name).toBeVisible();
    }

    // SEAT-AC111：放到 A3（先回到適合視窗，A3 與暫存區都在畫面上才拖得到）
    await showMap(page);
    await toolbarButton(page, '適合視窗').click();
    saved = waitForOperation(page);
    await dragAndDrop(page, stagedHandle(page, 0), emptySlot(page, A3));
    await saved;
    await expectToast(page, '已把「主桌」放到 A3。', { undo: true });
    await expect.poll(() => rosterNamesAt(A3)).toEqual(['甲', '乙']);
    expect(await noteNameAt(A3)).toBe('主桌');
    expect(await stagedTables()).toEqual([]);
    await expect(stagedButtons(page)).toHaveCount(0);
    await expect(stagingArea(page).getByText('把桌子拖到這裡暫放')).toBeVisible();
    await expect(mapTable(page, A3)).toContainText('A3');
    await expectStats(page, { seated: 3, total: 3, unseated: 0, empty: 287, full: 0 });
  });

  test('SEAT-AC112：暫存區有一桌（沒有備註名稱，坐丙）、B2 桌坐丁 → 拖暫存的桌到 B2 → B2 桌坐丙，暫存區最下面多一桌坐丁；Sonner「已把暫存區的桌放到 B2，原本的 B2 桌移到暫存區。」→「復原」→ B2 回到坐丁，暫存區只有坐丙那一桌', async ({
    page,
  }) => {
    await seed(async (s) => {
      const staged = await s.stagedTable();
      await s.employee('丙', { tableId: staged });
      await s.employee('丁', { tableId: B2 });
    });
    await openSeating(page);

    const saved = waitForOperation(page);
    await dragAndDrop(page, stagedHandle(page, 0), tableButton(page, B2));
    await saved;

    await expectToast(page, '已把暫存區的桌放到 B2，原本的 B2 桌移到暫存區。', { undo: true });
    await expect.poll(() => rosterNamesAt(B2)).toEqual(['丙']);
    expect((await stagedTables()).map((t) => t.names)).toEqual([['丁']]);
    await expect(stagedButtons(page)).toHaveCount(1);

    await clickUndo(page, '已把暫存區的桌放到 B2，原本的 B2 桌移到暫存區。');
    await expectToast(page, '已復原。', { undo: false });
    await expect.poll(() => rosterNamesAt(B2)).toEqual(['丁']);
    expect((await stagedTables()).map((t) => t.names)).toEqual([['丙']]);
  });

  test('SEAT-AC113：三桌輪換 A1 坐甲、B1 坐乙、B4 坐丙 → A1 拖到暫存區、B1 拖到 A1、B4 拖到 B1、暫存的桌拖到 B4 → A1 坐乙、B1 坐丙、B4 坐甲，暫存區沒有桌；每一步都有 Sonner', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.employee('甲', { tableId: A1 });
      await s.employee('乙', { tableId: B1 });
      await s.employee('丙', { tableId: B4 });
    });
    await openSeating(page);

    const step = async (source: Locator, target: Locator, message: string) => {
      const saved = waitForOperation(page);
      await dragAndDrop(page, source, target);
      await saved;
      await expectToast(page, message, { undo: true });
    };
    await step(tableHandle(page, A1), stagingArea(page), '已把 A1 桌移到暫存區。');
    await step(tableHandle(page, B1), emptySlot(page, A1), '已把 B1 桌搬到 A1。');
    await step(tableHandle(page, B4), emptySlot(page, B1), '已把 B4 桌搬到 B1。');
    await step(stagedHandle(page, 0), emptySlot(page, B4), '已把暫存區的桌放到 B4。');

    expect(await rosterNamesAt(A1)).toEqual(['乙']);
    expect(await rosterNamesAt(B1)).toEqual(['丙']);
    expect(await rosterNamesAt(B4)).toEqual(['甲']);
    expect(await stagedTables()).toEqual([]);
    await expect(stagedButtons(page)).toHaveCount(0);
  });

  test('SEAT-AC114：暫存區有兩桌，先移入的「先放」、再移入的「後放」→ 先放在上、後放在下；再把 B4 桌（「主桌」）移到暫存區 → 排在最下面', async ({
    page,
  }) => {
    await seed(async (s) => {
      for (const note of ['先放', '後放']) {
        const id = await s.stagedTable(note);
        await s.employee(`${note}甲`, { tableId: id });
      }
      await s.noteName(B4, '主桌');
      await s.employee('丙', { tableId: B4 });
    });
    await openSeating(page);

    expect((await stagedLabels(page)).map((l) => l.split('，')[1])).toEqual(['先放', '後放']);
    const first = await stagedTableButton(page, '先放').boundingBox();
    const second = await stagedTableButton(page, '後放').boundingBox();
    if (!first || !second) throw new Error('量不到暫存的桌');
    expect(first.y, '先放的在上面').toBeLessThan(second.y);

    const saved = waitForOperation(page);
    await dragAndDrop(page, tableHandle(page, B4), stagingArea(page));
    await saved;
    await expectToast(page, '已把 B4 桌移到暫存區。', { undo: true });
    await expect.poll(async () => (await stagedLabels(page)).map((l) => l.split('，')[1])).toEqual(['先放', '後放', '主桌']);
    expect((await stagedTables()).map((t) => t.noteName)).toEqual(['先放', '後放', '主桌']);
  });

  test('把手放到工作人員桌；暫存的桌放回暫存區：都沒有改變，也沒有 Sonner（SEAT-R38、SEAT-AC126）', async ({ page }) => {
    await seed(async (s) => {
      const staged = await s.stagedTable('暫放');
      await s.employee('甲', { tableId: staged });
      await s.employee('乙', { tableId: B4 });
      await s.staff('工作甲');
    });
    await openSeating(page);

    await dragAndDrop(page, tableHandle(page, B4), staffTableButton(page));
    await dragAndDrop(page, stagedHandle(page, 0), stagingArea(page));
    await page.waitForTimeout(500);
    await expectNoToast(page);
    expect(await rosterNamesAt(B4)).toEqual(['乙']);
    expect(await stagedTables()).toEqual([expect.objectContaining({ noteName: '暫放', names: ['甲'] })]);
    await expect(staffTable(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);
  });
});

test.describe('桌次詳情的「移到暫存區」「刪除桌」與「未放桌」的面板（2.3.1、2.3.8、2.3.10、SEAT-AC115、AC121～AC123）', () => {
  test.beforeEach(async ({ context, baseURL, page }) => {
    desktopOnly(page);
    await signIn(context, requireBaseURL(baseURL));
  });

  test('SEAT-AC115：B4 桌詳情的底部按鈕有「加入人員」「調換桌次…」「移到暫存區」「清空桌次」「刪除桌」→ 按「移到暫存區」→ 不需確認，詳情關閉，B4 桌移到暫存區，B4 變成「未放桌」，Sonner「已把 B4 桌移到暫存區。」', async ({
    page,
  }) => {
    await seed(async (s) => {
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: B4 });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, B4);
    for (const name of ['加入人員', '調換桌次…', '移到暫存區', '清空桌次', '刪除桌']) {
      await expect(detail.getByRole('button', { name, exact: true }), name).toBeVisible();
    }

    const saved = waitForOperation(page);
    await detail.getByRole('button', { name: '移到暫存區', exact: true }).click();
    await saved;
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(tableDetail(page, B4)).toBeHidden();
    await expectToast(page, '已把 B4 桌移到暫存區。', { undo: true });
    await expect(emptySlot(page, B4)).toBeVisible();
    await expect(stagedButtons(page)).toHaveCount(1);
    expect((await stagedTables()).map((t) => t.names)).toEqual([['甲', '乙']]);
  });

  test('SEAT-AC121：點 B8（未放桌）→ 面板標題「B8」、內文「這個位置沒有擺桌。」、按鈕「新增桌」→ 按「新增桌」→ B8 是一張空桌，面板換成「B8 桌」的桌次詳情；Sonner「已在 B8 新增一桌。」→「復原」→ B8 回到「未放桌」', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.emptyPosition(B8);
    });
    await openSeating(page);

    await emptySlot(page, B8).click();
    const panel = slotPanel(page, B8);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'B8', exact: true })).toBeVisible();
    await expect(panel).toContainText('這個位置沒有擺桌。');
    const saved = waitForOperation(page);
    await panel.getByRole('button', { name: '新增桌', exact: true }).click();
    await saved;

    await expectToast(page, '已在 B8 新增一桌。', { undo: true });
    const detail = tableDetail(page, B8);
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('0/10 人');
    await expect(detail.getByRole('textbox', { name: '備註名稱' })).toHaveValue('');
    await expect(emptySlot(page, B8)).toHaveCount(0);
    await expect(mapTable(page, B8)).toBeVisible();
    expect(await tableIdAt(B8)).toBe(31);
    expect(await noteNameAt(B8)).toBeNull();

    await clickUndo(page, '已在 B8 新增一桌。');
    await expectToast(page, '已復原。', { undo: false });
    await expect(emptySlot(page, B8)).toBeVisible();
    await expect.poll(() => tableIdAt(B8)).toBeNull();
  });

  test('「未放桌」的面板：點另一桌就換成那一桌；按關閉鈕關閉（SEAT-R95）', async ({ page }) => {
    await seed(async (s) => {
      await s.emptyPosition(B8);
    });
    await openSeating(page);
    await emptySlot(page, B8).click();
    await expect(slotPanel(page, B8)).toBeVisible();
    await tableButton(page, B4).click();
    await expect(tableDetail(page, B4)).toBeVisible();
    await expect(slotPanel(page, B8)).toHaveCount(0);
    await emptySlot(page, B8).click();
    await slotPanel(page, B8).getByRole('button', { name: '關閉' }).click();
    await expect(slotPanel(page, B8)).toHaveCount(0);
  });

  test('SEAT-AC122：B4 桌有 6 位、「主桌」→「刪除桌」→ Alert Dialog 標題「要刪除 B4 桌嗎？」、內文「桌上的 6 位會回到未入座，備註名稱也會一併刪除。」→「取消」不變 → 再刪除並確認 → B4 變成「未放桌」，6 位在「未入座」分頁（沒有「暫存」徽章），參與人員總數不變；Sonner「已刪除 B4 桌。」→「復原」→ 座位順序與「主桌」都回來', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.noteName(B4, '主桌');
      await s.fill(B4, 6, { prefix: '刪' });
    });
    const total = await participantCount();
    await openSeating(page);

    let detail = await openTableDetail(page, B4);
    await detail.getByRole('button', { name: '刪除桌', exact: true }).click();
    let alert = page.getByRole('alertdialog', { name: '要刪除 B4 桌嗎？' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('桌上的 6 位會回到未入座，備註名稱也會一併刪除。');
    await expect(alert.getByRole('button', { name: '刪除桌', exact: true })).toBeVisible();
    // 桌面：取消在左、確認在右
    const cancelBox = await alert.getByRole('button', { name: '取消' }).boundingBox();
    const confirmBox = await alert.getByRole('button', { name: '刪除桌', exact: true }).boundingBox();
    if (!cancelBox || !confirmBox) throw new Error('量不到按鈕');
    expect(cancelBox.x).toBeLessThan(confirmBox.x);
    await alert.getByRole('button', { name: '取消' }).click();
    await expect(alert).toBeHidden();
    expect(await rosterNamesAt(B4)).toHaveLength(6);

    detail = tableDetail(page, B4);
    await detail.getByRole('button', { name: '刪除桌', exact: true }).click();
    alert = page.getByRole('alertdialog', { name: '要刪除 B4 桌嗎？' });
    const saved = waitForOperation(page);
    await alert.getByRole('button', { name: '刪除桌', exact: true }).click();
    await saved;

    await expectToast(page, '已刪除 B4 桌。', { undo: true });
    await expect(tableDetail(page, B4)).toHaveCount(0);
    await expect(emptySlot(page, B4)).toBeVisible();
    expect(await tableIdAt(B4)).toBeNull();
    expect(await participantCount()).toBe(total);
    await panelTab(page, '未入座').click();
    for (let i = 1; i <= 6; i++) {
      await expect(personRow(page, `刪${i}`)).toHaveCount(1);
      await expect(personRow(page, `刪${i}`).getByRole('button', { name: '暫存', exact: true })).toHaveCount(0);
    }

    await clickUndo(page, '已刪除 B4 桌。');
    await expectToast(page, '已復原。', { undo: false });
    await expect.poll(() => rosterNamesAt(B4)).toEqual(Array.from({ length: 6 }, (_, i) => `刪${i + 1}`));
    expect(await noteNameAt(B4)).toBe('主桌');
    expect(await tableIdAt(B4)).toBe(B4);
  });

  test('SEAT-AC123：B5 是空桌 → 刪除時內文「這一桌沒有人。」；暫存區有一桌 → 從它的詳情刪除 → 標題「要刪除暫存區的這一桌嗎？」，確認後 Sonner「已刪除暫存區的一桌。」', async ({
    page,
  }) => {
    await seed(async (s) => {
      const staged = await s.stagedTable();
      await s.employee('甲', { tableId: staged });
    });
    await openSeating(page);

    const detail = await openTableDetail(page, B5);
    await detail.getByRole('button', { name: '刪除桌', exact: true }).click();
    const alert = page.getByRole('alertdialog', { name: '要刪除 B5 桌嗎？' });
    await expect(alert).toContainText('這一桌沒有人。');
    let saved = waitForOperation(page);
    await alert.getByRole('button', { name: '刪除桌', exact: true }).click();
    await saved;
    await expectToast(page, '已刪除 B5 桌。', { undo: true });
    await expect(emptySlot(page, B5)).toBeVisible();

    const staged = await openStagedDetail(page, 0);
    await staged.getByRole('button', { name: '刪除桌', exact: true }).click();
    const stagedAlert = page.getByRole('alertdialog', { name: '要刪除暫存區的這一桌嗎？' });
    await expect(stagedAlert).toContainText('桌上的 1 位會回到未入座，備註名稱也會一併刪除。');
    saved = waitForOperation(page);
    await stagedAlert.getByRole('button', { name: '刪除桌', exact: true }).click();
    await saved;
    await expectToast(page, '已刪除暫存區的一桌。', { undo: true });
    expect(await stagedTables()).toEqual([]);
    expect(await seatOf(await personId(page, '甲'))).toEqual({ tableId: null, seatOrder: null });
  });

  test('SEAT-AC126：工作人員桌沒有拖移把手；工作人員桌詳情沒有「移到暫存區」與「刪除桌」（SEAT-R98）', async ({ page }) => {
    await seed(async (s) => {
      await s.staff('工作甲');
    });
    await openSeating(page);
    await expect(staffTable(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);
    const detail = await openStaffDetail(page);
    for (const name of ['移到暫存區', '刪除桌', '調換桌次…', '清空桌次']) {
      await expect(detail.getByRole('button', { name, exact: true }), name).toHaveCount(0);
    }
  });
});

test.describe('暫存的桌的詳情與「放到…」、暫存的桌上的人（2.3.7、2.3.9、SEAT-R92～R94、SEAT-AC117～AC120）', () => {
  test.beforeEach(async ({ context, baseURL, page }) => {
    desktopOnly(page);
    await signIn(context, requireBaseURL(baseURL));
  });

  test('SEAT-AC117：點暫存的桌（「主桌」，甲、乙）→ 詳情「暫存區的桌（主桌）」可以改備註名稱、名單有甲乙、底部只有「放到…」「刪除桌」、沒有名單說明 →「放到…」：標題「把暫存區的桌放到哪裡？」、欄位「位置」、30 個位置、A3 是「A3（未放桌）」→ 沒選就確認「請選擇位置。」→ 選 A3 確認 → 對話框與詳情關閉，Sonner「已把「主桌」放到 A3。」', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.emptyPosition(A3);
      const staged = await s.stagedTable('主桌');
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: staged });
    });
    await openSeating(page);

    const detail = await openStagedDetail(page, 0, '主桌');
    await expect(detail.getByRole('heading', { name: '暫存區的桌（主桌）', exact: true })).toBeVisible();
    await expect(detail.getByRole('textbox', { name: '備註名稱' })).toHaveValue('主桌');
    await expect(detail).toContainText('2/10 人');
    const rows = detailRows(detail);
    await expect(rows.nth(0)).toContainText('甲');
    await expect(rows.nth(1)).toContainText('乙');
    for (const name of ['放到…', '刪除桌']) await expect(detail.getByRole('button', { name, exact: true }), name).toBeVisible();
    for (const name of ['加入人員', '調換桌次…', '移到暫存區', '清空桌次']) {
      await expect(detail.getByRole('button', { name, exact: true }), name).toHaveCount(0);
    }
    await expect(detail.getByText('拖移可以調整順序，也可以從人員面板直接拖進來。')).toHaveCount(0);
    expect(await menuItemsOf(page, rowWithName(rows, page, '甲'))).toEqual(['入座…', '移出桌次', '編輯']);

    await detail.getByRole('button', { name: '放到…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '把暫存區的桌放到哪裡？', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '確認放置' }).click();
    await expect(dialog.getByText('請選擇位置。')).toBeVisible();
    await expect(dialog).toBeVisible();

    const labels = await optionLabels(page, dialog, /^位置/);
    expect(labels).toHaveLength(30);
    expect(labels.map((l) => /^([AB]\d{1,2})/.exec(l)?.[1])).toEqual(CODES_IN_LIST_ORDER);
    expect(labels).toContain('A3（未放桌）');
    expect(labels).toContain('B4 桌（0/10）');
    await page.getByRole('option', { name: 'A3（未放桌）', exact: true }).click();
    const saved = waitForOperation(page);
    await dialog.getByRole('button', { name: '確認放置' }).click();
    await saved;

    await expectToast(page, '已把「主桌」放到 A3。', { undo: true });
    await expect(dialog).toBeHidden();
    await expect(stagedDetail(page, '主桌')).toHaveCount(0);
    await expect.poll(() => rosterNamesAt(A3)).toEqual(['甲', '乙']);
    expect(await stagedTables()).toEqual([]);
  });

  test('暫存的桌的備註名稱可以修改：離開欄位就儲存，標題跟著變（2.3.7、SEAT-R12）', async ({ page }) => {
    await seed(async (s) => {
      await s.stagedTable();
    });
    await openSeating(page);
    const detail = await openStagedDetail(page, 0);
    await detail.getByRole('textbox', { name: '備註名稱' }).fill('供應商');
    await detail.getByRole('textbox', { name: '備註名稱' }).press('Tab');
    await expectToast(page, '已儲存', { undo: false });
    await expect(stagedDetail(page, '供應商')).toBeVisible();
    await expect.poll(async () => (await stagedTables())[0]?.noteName).toBe('供應商');
  });

  test('SEAT-AC118：把未入座的王小明拖到暫存的桌上 → 游標 not-allowed，放開後沒有改變；把甲從暫存的桌的詳情拖到 B2 桌 → 入座 B2，Sonner「已把 甲 安排到 B2 桌。」；乙的列操作「移出桌次」→ 一般的未入座（沒有「暫存」徽章），Sonner「已把 乙 移出暫存區的桌。」與「復原」', async ({
    page,
  }) => {
    await seed(async (s) => {
      const staged = await s.stagedTable();
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: staged });
      await s.employee('王小明');
    });
    await openSeating(page);

    await startDrag(page, personRow(page, '王小明'));
    const point = await dragOver(page, stagedTableButton(page, 0));
    await expect.poll(() => cursorAt(page, point)).toBe('not-allowed');
    expect(await hasBorderColor(page, stagedTable(page, 0), '--primary')).toBe(false);
    await drop(page);
    await page.waitForTimeout(500);
    await expectNoToast(page);
    expect((await stagedTables()).map((t) => t.names)).toEqual([['甲', '乙']]);
    expect(await seatOf(await personId(page, '王小明'))).toEqual({ tableId: null, seatOrder: null });

    const detail = await openStagedDetail(page, 0);
    let saved = waitForOperation(page);
    await dragAndDrop(page, rowWithName(detailRows(detail), page, '甲'), tableButton(page, B2));
    await saved;
    await expectToast(page, '已把 甲 安排到 B2 桌。', { undo: true });
    await expect.poll(() => rosterNamesAt(B2)).toEqual(['甲']);

    saved = waitForOperation(page);
    await rowAction(page, rowWithName(detailRows(detail), page, '乙'), '移出桌次');
    await saved;
    await expectToast(page, '已把 乙 移出暫存區的桌。', { undo: true });
    await panelTab(page, '未入座').click();
    await expect(personRow(page, '乙')).toHaveCount(1);
    await expect(personRow(page, '乙').getByRole('button', { name: '暫存', exact: true })).toHaveCount(0);
    expect(await seatOf(await personId(page, '乙'))).toEqual({ tableId: null, seatOrder: null });
  });

  test('暫存的桌內不能調整順序：在詳情把乙拖到甲那一列，順序不變（SEAT-R92）', async ({ page }) => {
    await seed(async (s) => {
      const staged = await s.stagedTable();
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: staged });
    });
    await openSeating(page);
    const detail = await openStagedDetail(page, 0);
    await dragAndDrop(page, rowWithName(detailRows(detail), page, '乙'), rowWithName(detailRows(detail), page, '甲'));
    await page.waitForTimeout(500);
    await expect(detailRows(detail).nth(0)).toContainText('甲');
    expect((await stagedTables()).map((t) => t.names)).toEqual([['甲', '乙']]);
  });

  test('SEAT-AC119：暫存區有一桌坐甲 → 在人員面板按甲的「暫存」徽章 → 座位圖把那張暫存的桌捲到看得到的位置，2 px --accent 邊框 4 秒後恢復（SEAT-R94、SEAT-R62）', async ({
    page,
  }) => {
    await seed(async (s) => {
      const staged = await s.stagedTable();
      await s.employee('甲', { tableId: staged });
    });
    await openSeating(page);
    for (let i = 0; i < 25; i++) await toolbarButton(page, '放大').click();
    await panelTab(page, '未入座').click();

    await personRow(page, '甲').getByRole('button', { name: '暫存', exact: true }).click();
    await expect.poll(() => isInside(stagedTableButton(page, 0), seatMap(page))).toBe(true);
    await expect.poll(() => hasBorderColor(page, stagedTable(page, 0), '--accent', '2px')).toBe(true);
    await expect.poll(() => hasBorderColor(page, stagedTable(page, 0), '--accent', '2px'), { timeout: 7000 }).toBe(false);
  });

  test('SEAT-AC120：B8 是「未放桌」、暫存區有一桌 → 王小明的「入座…」桌次選項沒有 B8，也沒有暫存的桌（SEAT-R23）', async ({ page }) => {
    await seed(async (s) => {
      await s.emptyPosition(B8);
      const staged = await s.stagedTable('暫放');
      await s.employee('甲', { tableId: staged });
      await s.employee('王小明');
    });
    await openSeating(page);
    await rowAction(page, personRow(page, '王小明'), '入座…');
    const dialog = page.getByRole('dialog', { name: '安排 王小明 入座', exact: true });
    const labels = await optionLabels(page, dialog, /^桌次/);
    expect(labels).toHaveLength(29);
    expect(labels.some((l) => l.startsWith('B8'))).toBe(false);
    expect(labels.some((l) => l.includes('暫存') || l.includes('暫放') || l.includes('未放桌'))).toBe(false);
  });

  test('暫存的桌上的人的列操作：入座…／移出桌次／編輯／取消報名（2.2.3）；「入座…」標題「安排 甲 入座」，確認後離開暫存的桌', async ({ page }) => {
    await seed(async (s) => {
      const staged = await s.stagedTable();
      await s.employee('甲', { tableId: staged });
    });
    await openSeating(page);
    await panelTab(page, '未入座').click();
    expect(await menuItemsOf(page, personRow(page, '甲'))).toEqual(['入座…', '移出桌次', '編輯', '取消報名']);
    await panelTab(page, '全部').click();
    await expect(personRow(page, '甲').getByRole('button', { name: '暫存', exact: true })).toBeVisible();

    await rowAction(page, personRow(page, '甲'), '入座…');
    const dialog = page.getByRole('dialog', { name: '安排 甲 入座', exact: true });
    await chooseOption(page, dialog, /^桌次/, /^B2 桌/);
    const saved = waitForOperation(page);
    await dialog.getByRole('button', { name: '確認入座' }).click();
    await saved;
    await expectToast(page, '已把 甲 安排到 B2 桌。', { undo: true });
    expect(await rosterNamesAt(B2)).toEqual(['甲']);
    expect((await stagedTables()).map((t) => t.names)).toEqual([[]]);
  });

  test('網址 /?staged={id}：開啟座位安排並顯示那張暫存的桌的詳情（PPL-R33）', async ({ page }) => {
    const id = await seed(async (s) => {
      const staged = await s.stagedTable('貴賓桌');
      await s.employee('甲', { tableId: staged });
      return staged;
    });
    await page.goto(`/?staged=${id}`);
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expect(stagedDetail(page, '貴賓桌')).toBeVisible();
    await expect(detailRows(stagedDetail(page, '貴賓桌')).first()).toContainText('甲');
  });
});

test.describe('全部展開與適合視窗（SEAT-R64、SEAT-R69、SEAT-AC125）', () => {
  test('SEAT-AC125：暫存區有一桌、B8 是「未放桌」→「全部展開」→ 暫存的桌也是名單卡片，B8 是卡片大小的虛線框；「適合視窗」→ 30 個位置、工作人員桌與暫存區都看得到', async ({
    page,
    context,
    baseURL,
  }) => {
    desktopOnly(page);
    await signIn(context, requireBaseURL(baseURL));
    await seed(async (s) => {
      await s.emptyPosition(B8);
      const staged = await s.stagedTable('暫放');
      await s.employee('甲', { tableId: staged });
    });
    await openSeating(page);

    await expandAll(page);
    await expect(stagedTable(page, 0).getByRole('listitem')).toHaveCount(10);
    await expect(stagedTable(page, 0).getByRole('listitem').first()).toContainText('甲');
    expect(await hasDashedBorder(emptySlot(page, B8))).toBe(true);
    const slotWidth = await emptySlot(page, B8).evaluate((el) => (el as HTMLElement).offsetWidth);
    expect(slotWidth, '卡片大小（寬 256 px，2.1.7、2.1.9）').toBe(256);

    await toolbarButton(page, '適合視窗').click();
    const area = await seatMap(page).boundingBox();
    if (!area) throw new Error('量不到座位圖區');
    await expect.poll(() => isInside(stagingArea(page), area)).toBe(true);
    for (const code of CODES_IN_LIST_ORDER) {
      const target = code === 'B8' ? emptySlot(page, code) : mapTable(page, code);
      expect(await isInside(target, area), code).toBe(true);
    }
    expect(await isInside(staffTable(page), area)).toBe(true);
    expect(await isInside(stagedTableButton(page, 0), area)).toBe(true);
  });
});

test.describe('多人衝突（SEAT-R85、SEAT-AC124）', () => {
  test('SEAT-AC124：甲、乙都開著座位安排，B8 是「未放桌」，暫存區有「第一桌」「第二桌」→ 甲把第一桌放到 B8 → 乙（畫面還沒更新）把第二桌放到 B8 → 乙不儲存、重新載入，Sonner「資料已被其他人更新，已重新載入。」；B8 是甲放的那一桌，第二桌仍在暫存區', async ({
    page,
    context,
    baseURL,
    browser,
  }) => {
    desktopOnly(page);
    await resetEverything([JIA.email, YI.email]);
    await signIn(context, requireBaseURL(baseURL), JIA);
    const ids = await seed(async (s) => {
      await s.emptyPosition(B8);
      return { first: await s.stagedTable('第一桌'), second: await s.stagedTable('第二桌') };
    });

    const yi = await openEditorBrowser(browser, requireBaseURL(baseURL), YI, page.viewportSize());
    try {
      await openSeating(page);
      await openSeating(yi.page);

      const placeTo = async (p: Page, note: string, option: string) => {
        const detail = await openStagedDetail(p, note, note);
        await detail.getByRole('button', { name: '放到…', exact: true }).click();
        const dialog = p.getByRole('dialog', { name: '把暫存區的桌放到哪裡？', exact: true });
        await chooseOption(p, dialog, /^位置/, new RegExp(`^${option}`));
        const saved = waitForOperation(p);
        await dialog.getByRole('button', { name: '確認放置' }).click();
        await saved;
      };

      await placeTo(page, '第一桌', 'B8（未放桌）');
      await expectToast(page, '已把「第一桌」放到 B8。', { undo: true });

      await placeTo(yi.page, '第二桌', 'B8（未放桌）');
      await expectToast(yi.page, CONFLICT_TOAST, { undo: false });
      await expect(mapTable(yi.page, B8)).toBeVisible();
      await expect(stagedButtons(yi.page)).toHaveCount(1);

      expect(await tableIdAt(B8)).toBe(ids.first);
      expect((await stagedTables()).map((t) => t.id)).toEqual([ids.second]);
    } finally {
      await yi.context.close();
    }
  });
});

test.describe('檢視者（SEAT-R90、SEAT-AC127）', () => {
  test('SEAT-AC127：檢視者，B8 是「未放桌」、暫存區有一桌 → 看得到暫存區與暫存的桌，但沒有拖移把手；點 B8 沒有反應，用 Tab 也聚焦不到 B8；暫存的桌的詳情只有名單與「關閉」；B4 桌詳情沒有「移到暫存區」「刪除桌」', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAsViewer(context, requireBaseURL(baseURL));
    await seed(async (s) => {
      await s.emptyPosition(B8);
      const staged = await s.stagedTable('暫放');
      await s.employee('周同仁', { tableId: staged });
      await s.employee('甲', { tableId: B4 });
    });
    await openSeating(page);
    await showMap(page);

    await expect(stagingArea(page)).toBeVisible();
    await expect(stagedTableButton(page, 0)).toBeVisible();
    await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);
    await expect(stagingArea(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);
    await expect(emptySlot(page, B8)).toHaveCount(0);
    await expect(seatMap(page).getByRole('button', { name: /未放桌/ })).toHaveCount(0);
    const slotText = seatMap(page).getByText('未放桌', { exact: true });
    await expect(slotText).toHaveCount(1);

    // 點了沒有反應
    await slotText.click({ force: true });
    await page.waitForTimeout(300);
    await expect(slotPanel(page, B8)).toHaveCount(0);
    await expect(page.getByText('這個位置沒有擺桌。')).toHaveCount(0);

    // 用 Tab 聚焦不到（桌面才有鍵盤）
    if (!isMobileWidth(page)) {
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      for (let i = 0; i < 120; i++) {
        await page.keyboard.press('Tab');
        // 聚焦到「未放桌」的位置本身（文字有「未放桌」、沒有其他桌的桌號）；座位圖區這類容器不算
        const onSlot = await page.evaluate(() => {
          const t = document.activeElement?.textContent ?? '';
          return t.includes('未放桌') && !t.includes('B4');
        });
        expect(onSlot, `第 ${i + 1} 次 Tab 聚焦到「未放桌」`).toBe(false);
      }
    }

    await stagedTableButton(page, 0).click();
    const staged = stagedDetail(page, '暫放');
    await expect(staged).toBeVisible();
    await expect(staged).toContainText('周同仁');
    for (const name of ['放到…', '刪除桌', '加入人員', '調換桌次…', '移到暫存區', '清空桌次']) {
      await expect(staged.getByRole('button', { name, exact: true }), name).toHaveCount(0);
    }
    await expect(staged.getByRole('textbox', { name: '備註名稱' })).toHaveCount(0);
    await expect(staged.getByRole('button', { name: '關閉' })).toBeVisible();
    await staged.getByRole('button', { name: '關閉' }).click();

    const detail = await openTableDetail(page, B4);
    for (const name of ['移到暫存區', '刪除桌']) await expect(detail.getByRole('button', { name, exact: true }), name).toHaveCount(0);
  });
});

test.describe('手機（2.1.11、2.3.6、SEAT-R82、SEAT-AC128）', () => {
  test.beforeEach(async ({ context, baseURL, page }) => {
    test.skip(!isMobileWidth(page), '手機版面');
    await signIn(context, requireBaseURL(baseURL));
  });

  test('SEAT-AC128：B8 是「未放桌」、暫存區有一桌 → 點 B8 → 面板是 Dialog，有「新增桌」；點 B4 桌 → Dialog 有「調換桌次…」「移到暫存區」「刪除桌」；點暫存的桌 → Dialog 有「放到…」「刪除桌」；沒有整頁水平捲動；沒有拖移把手', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.emptyPosition(B8);
      const staged = await s.stagedTable('暫放');
      await s.employee('甲', { tableId: staged });
      await s.employee('乙', { tableId: B4 });
    });
    await openSeating(page);
    await showMap(page);
    await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);
    await expect(stagingArea(page)).toBeAttached();

    await emptySlot(page, B8).click();
    const panel = page.getByRole('dialog', { name: 'B8', exact: true });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: '新增桌', exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await panel.getByRole('button', { name: '關閉' }).click();
    await expect(panel).toBeHidden();

    await tableButton(page, B4).click();
    const detail = page.getByRole('dialog', { name: 'B4 桌', exact: true });
    await expect(detail).toBeVisible();
    for (const name of ['調換桌次…', '移到暫存區', '刪除桌']) await expect(detail.getByRole('button', { name, exact: true }), name).toBeVisible();
    await expectNoHorizontalScroll(page);
    await detail.getByRole('button', { name: '關閉' }).click();
    await expect(detail).toBeHidden();

    await stagedTableButton(page, 0).click();
    const staged = page.getByRole('dialog', { name: '暫存區的桌（暫放）', exact: true });
    await expect(staged).toBeVisible();
    for (const name of ['放到…', '刪除桌']) await expect(staged.getByRole('button', { name, exact: true }), name).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('手機用按鈕搬動桌子：B4 桌「移到暫存區」→ B4 變成「未放桌」；暫存的桌「放到…」選 B4（未放桌）→ 放回 B4；「未放桌」的 B8 按「新增桌」→ 有桌（SEAT-R82）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.emptyPosition(B8);
      await s.noteName(B4, '主桌');
      await s.employee('乙', { tableId: B4 });
    });
    await openSeating(page);
    await showMap(page);

    await tableButton(page, B4).click();
    let saved = waitForOperation(page);
    await page.getByRole('dialog', { name: 'B4 桌', exact: true }).getByRole('button', { name: '移到暫存區', exact: true }).click();
    await saved;
    await expectToast(page, '已把 B4 桌移到暫存區。', { undo: true });
    await expect(emptySlot(page, B4)).toBeAttached();

    await stagedTableButton(page, '主桌').click();
    await page.getByRole('dialog', { name: '暫存區的桌（主桌）', exact: true }).getByRole('button', { name: '放到…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '把暫存區的桌放到哪裡？', exact: true });
    await chooseOption(page, dialog, /^位置/, /^B4（未放桌）/);
    // 手機 Dialog 的按鈕滿版堆疊，主要按鈕在上
    const confirm = await dialog.getByRole('button', { name: '確認放置' }).boundingBox();
    const cancel = await dialog.getByRole('button', { name: '取消' }).boundingBox();
    if (!confirm || !cancel) throw new Error('量不到按鈕');
    expect(confirm.y + confirm.height).toBeLessThanOrEqual(cancel.y + 1);
    saved = waitForOperation(page);
    await dialog.getByRole('button', { name: '確認放置' }).click();
    await saved;
    await expectToast(page, '已把「主桌」放到 B4。', { undo: true });
    await expect.poll(() => rosterNamesAt(B4)).toEqual(['乙']);

    await emptySlot(page, B8).click();
    saved = waitForOperation(page);
    await page.getByRole('dialog', { name: 'B8', exact: true }).getByRole('button', { name: '新增桌', exact: true }).click();
    await saved;
    await expectToast(page, '已在 B8 新增一桌。', { undo: true });
    await expect.poll(() => tableIdAt(B8)).not.toBeNull();
    await expectNoHorizontalScroll(page);
  });
});

