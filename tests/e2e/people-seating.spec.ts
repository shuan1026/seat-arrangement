// 參與人員頁接上座位安排（階段 3，docs/plan/implementation-plan.md 第 5.2 節「參與人員的『第 n 桌』徽章」）：
// - 列操作「入座…」「移至其他桌次…」開啟座位安排的選擇桌次對話框（src/components/features/seating/table-select-dialog.tsx）：
//   docs/spec/participants.md PPL-R35、PPL-AC28；seating.md 2.4、4.4、SEAT-R22～R25、SEAT-AC12（也對照 SEAT-AC08～AC11、AC17）。
// - 「移出桌次」與 Sonner 的「復原」：復原後回到原本那一桌的原本座號（seating.md SEAT-R78；participants.md PPL-R36、PPL-AC29）。
// - 「第 n 桌」連到 /?table=n，座位安排頁開啟那一桌的桌次詳情並標示那一桌（PPL-R33、PPL-AC06；seating.md SEAT-R62、SEAT-R72）。
// 資料直接寫進測試資料庫（tests/e2e/helpers/participants-db.ts），都是虛構資料。
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { demoEmployees, withDb } from './helpers/participants-db';
import { cellOf, gotoPeople, personRow, rowAction } from './helpers/participants-page';
import {
  chooseOption as chooseIn,
  clickUndo,
  detailRows,
  expectToast,
  hasBorderColor,
  mapTable,
  optionLabels,
  rowWithName,
  tableDetail,
  waitForOperation,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
  await withDb((db) => db.reset());
});

test.afterAll(async () => {
  await withDb((db) => db.reset());
});

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面版面；手機另外測');

const seatedNames = (tableId: number) => withDb((db) => db.seatedNames(tableId));
const placeOf = (name: string) =>
  withDb(async (db) => {
    const p = await db.find(name);
    return p ? { tableId: p.tableId, seatOrder: p.seatOrder } : '沒有這個人';
  });

/** 桌次欄：桌面是表格的「桌次」欄，手機是卡片 */
async function expectSeat(page: Page, name: string, text: string) {
  const row = personRow(page, name);
  if (isMobileWidth(page)) await expect(row).toContainText(text);
  else await expect(cellOf(row, '桌次')).toHaveText(text);
}

const selectDialog = (page: Page, title: string) => page.getByRole('dialog', { name: title, exact: true });

test.describe('「入座…」開啟選擇桌次對話框（PPL-R35、SEAT-R22）', () => {
  test('PPL-AC28、SEAT-AC12：王小明未入座 → 按「入座…」→ 開啟「安排 王小明 入座」；選第 7 桌確認後王小明排在第 7 桌最後，Sonner「已把 王小明 安排到第 7 桌。」帶「復原」', async ({
    page,
  }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.guests(2, '七桌貴賓', 7);
      await db.register(wang);
    });
    await gotoPeople(page);

    await rowAction(page, '王小明', '入座…');
    const dialog = selectDialog(page, '安排 王小明 入座');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: /^桌次/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '確認入座' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '取消' })).toBeVisible();

    await chooseIn(page, dialog, /^桌次/, /^第 7 桌/);
    const saved = waitForOperation(page);
    await dialog.getByRole('button', { name: '確認入座' }).click();
    await saved;

    await expect(dialog).toBeHidden();
    await expectToast(page, '已把 王小明 安排到第 7 桌。', { undo: true });
    await expectSeat(page, '王小明', '第 7 桌');
    expect(await seatedNames(7)).toEqual(['七桌貴賓1', '七桌貴賓2', '王小明']);
  });

  test('選項「第 {n} 桌（剩 {k} 位）・{備註名稱或部門}」，列出 30 桌、不列工作人員桌；已滿的桌次停用並標示「已滿」（SEAT-R23、SEAT-AC10、SEAT-AC17）', async ({
    page,
  }) => {
    desktopOnly(page);
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.fillTable(5, 10);
      await db.register(wang);
    });
    await gotoPeople(page);
    await rowAction(page, '王小明', '入座…');
    const dialog = selectDialog(page, '安排 王小明 入座');

    const labels = await optionLabels(page, dialog, /^桌次/);
    expect(labels).toHaveLength(30);
    expect(labels.some((l) => l.includes('工作人員'))).toBe(false);
    expect(labels.find((l) => l.startsWith('第 5 桌'))).toContain('已滿');
    await expect(page.getByRole('option', { name: /^第 5 桌/ })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('option', { name: /^第 6 桌/ })).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('沒選桌次就按「確認入座」：顯示「請選擇桌次。」，對話框不關閉，沒有入座（SEAT-R24、SEAT-AC11）', async ({ page }) => {
    desktopOnly(page);
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.register(wang);
    });
    await gotoPeople(page);
    await rowAction(page, '王小明', '入座…');
    const dialog = selectDialog(page, '安排 王小明 入座');
    await dialog.getByRole('button', { name: '確認入座' }).click();

    await expect(dialog.getByText('請選擇桌次。', { exact: true })).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(await placeOf('王小明')).toEqual({ tableId: null, seatOrder: null });
  });

  test('按「取消」：對話框關閉，仍是未入座', async ({ page }) => {
    desktopOnly(page);
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.register(wang);
    });
    await gotoPeople(page);
    await rowAction(page, '王小明', '入座…');
    const dialog = selectDialog(page, '安排 王小明 入座');
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();
    await expectSeat(page, '王小明', '未入座');
    expect(await placeOf('王小明')).toEqual({ tableId: null, seatOrder: null });
  });

  test('入座後按 Sonner 的「復原」：回到未入座，Sonner「已復原。」（SEAT-R76、SEAT-R78、SEAT-R79）', async ({ page }) => {
    desktopOnly(page);
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.register(wang);
    });
    await gotoPeople(page);
    await rowAction(page, '王小明', '入座…');
    const dialog = selectDialog(page, '安排 王小明 入座');
    await chooseIn(page, dialog, /^桌次/, /^第 7 桌/);
    await dialog.getByRole('button', { name: '確認入座' }).click();
    await expectToast(page, '已把 王小明 安排到第 7 桌。', { undo: true });

    await clickUndo(page, '已把 王小明 安排到第 7 桌。');
    await expectToast(page, '已復原。', { undo: false });
    await expectSeat(page, '王小明', '未入座');
    await expect.poll(() => placeOf('王小明')).toEqual({ tableId: null, seatOrder: null });
  });

  test('眷屬與外部貴賓也能用「入座…」（PPL-R34、PPL-R35）', async ({ page }) => {
    desktopOnly(page);
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      const pWang = await db.register(wang);
      await db.dependent(pWang);
      await db.guest('林董');
    });
    await gotoPeople(page);

    await rowAction(page, '王小明_眷屬', '入座…');
    let dialog = selectDialog(page, '安排 王小明_眷屬 入座');
    await chooseIn(page, dialog, /^桌次/, /^第 8 桌/);
    await dialog.getByRole('button', { name: '確認入座' }).click();
    await expectToast(page, '已把 王小明_眷屬 安排到第 8 桌。', { undo: true });

    await rowAction(page, '林董', '入座…');
    dialog = selectDialog(page, '安排 林董 入座');
    await chooseIn(page, dialog, /^桌次/, /^第 8 桌/);
    await dialog.getByRole('button', { name: '確認入座' }).click();
    await expectToast(page, '已把 林董 安排到第 8 桌。', { undo: true });

    await expect.poll(() => seatedNames(8)).toEqual(['王小明_眷屬', '林董']);
  });
});

test.describe('「移至其他桌次…」開啟選擇桌次對話框（PPL-R35、SEAT-R22、SEAT-R23）', () => {
  test('SEAT-AC09：王小明在第 3 桌 → 標題「把 王小明 移到其他桌次」，選項不含第 3 桌；選第 7 桌按「確認移動」→ 搬到第 7 桌最後，第 3 桌其他人往前補；Sonner「已把 王小明 從第 3 桌移到第 7 桌。」帶「復原」', async ({
    page,
  }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.guest('三桌甲', { tableId: 3 });
      await db.register(wang, { tableId: 3 });
      await db.guest('三桌乙', { tableId: 3 });
      await db.guest('七桌甲', { tableId: 7 });
    });
    await gotoPeople(page);

    await rowAction(page, '王小明', '移至其他桌次…');
    const dialog = selectDialog(page, '把 王小明 移到其他桌次');
    await expect(dialog).toBeVisible();
    const labels = await optionLabels(page, dialog, /^桌次/);
    expect(labels).toHaveLength(29);
    expect(labels.some((l) => l.startsWith('第 3 桌'))).toBe(false);
    await page.getByRole('option', { name: /^第 7 桌/ }).click();
    await dialog.getByRole('button', { name: '確認移動' }).click();

    await expect(dialog).toBeHidden();
    await expectToast(page, '已把 王小明 從第 3 桌移到第 7 桌。', { undo: true });
    await expectSeat(page, '王小明', '第 7 桌');
    await expect.poll(() => seatedNames(7)).toEqual(['七桌甲', '王小明']);
    expect(await seatedNames(3)).toEqual(['三桌甲', '三桌乙']);
  });

  test('搬移後按「復原」：回到第 3 桌原本的座號，第 7 桌恢復原狀（SEAT-R78、SEAT-AC75）', async ({ page }) => {
    desktopOnly(page);
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.guest('三桌甲', { tableId: 3 });
      await db.register(wang, { tableId: 3 });
      await db.guest('三桌乙', { tableId: 3 });
    });
    await gotoPeople(page);
    await rowAction(page, '王小明', '移至其他桌次…');
    const dialog = selectDialog(page, '把 王小明 移到其他桌次');
    await chooseIn(page, dialog, /^桌次/, /^第 7 桌/);
    await dialog.getByRole('button', { name: '確認移動' }).click();
    await expectToast(page, '已把 王小明 從第 3 桌移到第 7 桌。', { undo: true });

    await clickUndo(page, '已把 王小明 從第 3 桌移到第 7 桌。');
    await expectToast(page, '已復原。', { undo: false });
    await expect.poll(() => seatedNames(3)).toEqual(['三桌甲', '王小明', '三桌乙']);
    expect(await placeOf('王小明')).toEqual({ tableId: 3, seatOrder: 1 });
    expect(await seatedNames(7)).toEqual([]);
  });
});

test.describe('「移出桌次」與「復原」：回到原本那一桌的原本座號（PPL-R36、SEAT-R78）', () => {
  test('PPL-AC29：王小明在第 3 桌第 2 列 → 移出 → 未入座、人員沒有被刪除、同桌其他人往前補；按「復原」→ 回到第 3 桌第 2 列', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.guest('三桌甲', { tableId: 3 });
      await db.register(wang, { tableId: 3 });
      await db.guest('三桌乙', { tableId: 3 });
      await db.guest('三桌丙', { tableId: 3 });
    });
    await gotoPeople(page);

    await rowAction(page, '王小明', '移出桌次');
    await expectToast(page, '已把 王小明 移出第 3 桌。', { undo: true });
    await expectSeat(page, '王小明', '未入座');
    await expect.poll(() => seatedNames(3)).toEqual(['三桌甲', '三桌乙', '三桌丙']);
    expect(await placeOf('王小明')).toEqual({ tableId: null, seatOrder: null });

    await clickUndo(page, '已把 王小明 移出第 3 桌。');
    await expectToast(page, '已復原。', { undo: false });
    await expectSeat(page, '王小明', '第 3 桌');
    await expect.poll(() => seatedNames(3)).toEqual(['三桌甲', '王小明', '三桌乙', '三桌丙']);
    expect(await placeOf('王小明')).toEqual({ tableId: 3, seatOrder: 1 });

    // 重新整理後仍是復原後的樣子（SEAT-R85）
    await page.reload();
    await expectSeat(page, '王小明', '第 3 桌');
  });

  test('坐在第 1 列的外部貴賓移出後復原：回到第 1 列（SEAT-R78）', async ({ page }) => {
    desktopOnly(page);
    await withDb(async (db) => {
      await db.guest('林董', { tableId: 5 });
      await db.guest('五桌甲', { tableId: 5 });
      await db.guest('五桌乙', { tableId: 5 });
    });
    await gotoPeople(page);

    await rowAction(page, '林董', '移出桌次');
    await expectToast(page, '已把 林董 移出第 5 桌。', { undo: true });
    await expect.poll(() => seatedNames(5)).toEqual(['五桌甲', '五桌乙']);

    await clickUndo(page, '已把 林董 移出第 5 桌。');
    await expect.poll(() => seatedNames(5)).toEqual(['林董', '五桌甲', '五桌乙']);
    expect(await placeOf('林董')).toEqual({ tableId: 5, seatOrder: 0 });
  });

  test('坐在最後一列的眷屬移出後復原：回到最後一列（SEAT-R78）', async ({ page }) => {
    desktopOnly(page);
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      const pWang = await db.register(wang, { tableId: 4 });
      await db.guest('四桌甲', { tableId: 4 });
      await db.dependent(pWang, { tableId: 4 });
    });
    await gotoPeople(page);

    await rowAction(page, '王小明_眷屬', '移出桌次');
    await expectToast(page, '已把 王小明_眷屬 移出第 4 桌。', { undo: true });
    await clickUndo(page, '已把 王小明_眷屬 移出第 4 桌。');
    await expect.poll(() => seatedNames(4)).toEqual(['王小明', '四桌甲', '王小明_眷屬']);
    expect(await placeOf('王小明_眷屬')).toEqual({ tableId: 4, seatOrder: 2 });
  });
});

test.describe('「第 n 桌」開啟座位安排並顯示那一桌（PPL-R33、PPL-AC06）', () => {
  test('王小明在第 12 桌 → 按他那一列的「第 12 桌」→ 開啟 /?table=12，顯示第 12 桌的桌次詳情（名單有王小明），座位圖標示第 12 桌', async ({
    page,
  }) => {
    await withDb(async (db) => {
      const { wang, lee } = await demoEmployees(db);
      await db.guest('十二桌甲', { tableId: 12 });
      await db.register(wang, { tableId: 12 });
      await db.register(lee, { tableId: 3 });
    });
    await gotoPeople(page);

    await personRow(page, '王小明').getByRole('link', { name: '第 12 桌' }).click();

    await expect(page).toHaveURL((url) => url.pathname === '/' && url.searchParams.get('table') === '12');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    const detail = tableDetail(page, 12);
    await expect(detail).toBeVisible();
    await expect(tableDetail(page, 3)).toHaveCount(0);
    const rows = detailRows(detail);
    await expect(rowWithName(rows, page, '王小明')).toHaveCount(1);
    await expect(rowWithName(rows, page, '十二桌甲')).toHaveCount(1);
    if (!isMobileWidth(page)) {
      // 桌面：座位圖以 2 px 的 --accent 邊框標示這一桌（SEAT-R62）
      await expect.poll(() => hasBorderColor(page, mapTable(page, 12), '--accent', '2px')).toBe(true);
    }
  });

  test('工作人員的「工作人員」不是連結（PPL-Q18 目前假設）；未入座的人沒有桌次連結', async ({ page }) => {
    desktopOnly(page);
    await withDb(async (db) => {
      const { wang, chen } = await demoEmployees(db);
      await db.register(wang);
      await db.register(chen, { tableId: 0 });
    });
    await gotoPeople(page);
    await expect(personRow(page, '陳大文').getByRole('link')).toHaveCount(0);
    await expect(personRow(page, '王小明').getByRole('link')).toHaveCount(0);
  });
});
