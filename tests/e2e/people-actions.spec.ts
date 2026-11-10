// 參與人員頁的列操作：選單項目、移出桌次與復原、取消報名、刪除與確認對話框。
// 依據：docs/spec/participants.md 第 2.2 節、第 4.1 節的文案、PPL-R14、R15、R17、R18、R34、R36～R38、R43、R77，
// PPL-AC25～AC27、AC29～AC35、AC76（取消報名的確認對話框）；docs/spec/README.md 第 9 節（危險操作的 Alert Dialog：
// 桌面取消在左、確認在右；手機滿版堆疊、確認在上）。
// 「入座…」「移至其他桌次…」開啟的選擇桌次對話框（PPL-AC28、SEAT-AC12）與移出後復原回到原本座號的其他情況，
// 在階段 3 接上後寫在 people-seating.spec.ts。
// 資料直接寫進測試資料庫（tests/e2e/helpers/participants-db.ts），都是虛構資料。
// 桌號（D-019）：測試資料用內部編號 tableId 3，畫面上是 B4 桌（對應見 tests/helpers/table-codes.ts）。
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { demoEmployees, STAFF_TABLE, withDb } from './helpers/participants-db';
import {
  boxOf,
  cellOf,
  chooseOption,
  expectToast,
  gotoPeople,
  openNewPersonDialog,
  openOptions,
  openRowMenu,
  optionIn,
  personRow,
  rowAction,
  selectField,
  toasts,
} from './helpers/participants-page';

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
  await withDb((db) => db.reset());
});

test.afterAll(async () => {
  await withDb((db) => db.reset());
});

const desktopOnly = async ({ page }: { page: Page }) => {
  test.skip(isMobileWidth(page), '桌面版面；手機版面另外測');
};

const findPerson = (name: string) => withDb((db) => db.find(name));
const seatedNames = (tableId: number) => withDb((db) => db.seatedNames(tableId));

const cancelDialog = (page: Page, name: string) => page.getByRole('alertdialog', { name: `要取消 ${name} 的報名嗎？` });
const deleteDialog = (page: Page, name: string) => page.getByRole('alertdialog', { name: `要刪除 ${name} 嗎？` });

test.describe('列操作的項目（PPL-R34、第 2.2 節）', () => {
  test.beforeEach(desktopOnly);

  test('員工未入座：編輯／入座…／取消報名；已入座：編輯／移至其他桌次…／移出桌次／取消報名（PPL-AC25）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang, lee } = await demoEmployees(db);
      await db.register(wang);
      await db.register(lee, { tableId: 3 });
    });
    await gotoPeople(page);

    let menu = await openRowMenu(page, '王小明');
    await expect(menu.getByRole('menuitem')).toHaveText(['編輯', '入座…', '取消報名']);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    menu = await openRowMenu(page, '李美華');
    await expect(menu.getByRole('menuitem')).toHaveText(['編輯', '移至其他桌次…', '移出桌次', '取消報名']);
  });

  test('工作人員：只有編輯／取消報名（PPL-AC26）', async ({ page }) => {
    await withDb(async (db) => {
      const { chen } = await demoEmployees(db);
      await db.register(chen, { tableId: STAFF_TABLE });
    });
    await gotoPeople(page);
    const menu = await openRowMenu(page, '陳大文');
    await expect(menu.getByRole('menuitem')).toHaveText(['編輯', '取消報名']);
  });

  test('眷屬在 B4 桌：編輯／移至其他桌次…／移出桌次／刪除；外部貴賓未入座：編輯／入座…／刪除（PPL-AC27）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      const pWang = await db.register(wang);
      await db.dependent(pWang, { tableId: 3 });
      await db.guest('林董');
    });
    await gotoPeople(page);

    let menu = await openRowMenu(page, '王小明_眷屬');
    await expect(menu.getByRole('menuitem')).toHaveText(['編輯', '移至其他桌次…', '移出桌次', '刪除']);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    menu = await openRowMenu(page, '林董');
    await expect(menu.getByRole('menuitem')).toHaveText(['編輯', '入座…', '刪除']);
  });
});

test.describe('移出桌次（PPL-R17、PPL-R36）', () => {
  test.beforeEach(desktopOnly);

  test('移出 B4 桌：變成未入座、人員沒有被刪除，Sonner 帶「復原」；按「復原」回到 B4 桌原本的座號（PPL-AC29、SEAT-R78）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.guest('測試貴賓甲', { tableId: 3 });
      await db.register(wang, { tableId: 3 });
      await db.guest('測試貴賓乙', { tableId: 3 });
    });
    await gotoPeople(page);

    await rowAction(page, '王小明', '移出桌次');

    await expect(cellOf(personRow(page, '王小明'), '桌次')).toHaveText('未入座');
    await expectToast(page, '已把 王小明 移出 B4 桌。');
    // 只改入座狀態，不刪除人員：還找得到王小明，而且未入座
    await expect
      .poll(async () => {
        const wang = await findPerson('王小明');
        return wang ? wang.tableId : '已被刪除';
      })
      .toBeNull();
    await expect.poll(() => seatedNames(3)).toEqual(['測試貴賓甲', '測試貴賓乙']);

    await toasts(page).getByRole('button', { name: '復原' }).click();

    await expect(cellOf(personRow(page, '王小明'), '桌次')).toHaveText('B4');
    await expect.poll(async () => (await findPerson('王小明'))?.tableId).toBe(3);
    // 回到原本那一桌的原本座號：第 2 列（SEAT-R78）
    await expect.poll(() => seatedNames(3)).toEqual(['測試貴賓甲', '王小明', '測試貴賓乙']);
    expect((await findPerson('王小明'))?.seatOrder).toBe(1);
    await page.reload();
    await expect(cellOf(personRow(page, '王小明'), '桌次')).toHaveText('B4');
  });
});

test.describe('取消報名（PPL-R14、PPL-R37）', () => {
  test.beforeEach(desktopOnly);

  async function seedWangAtTable3() {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.guest('測試貴賓甲', { tableId: 3 });
      const pWang = await db.register(wang, { tableId: 3 });
      await db.dependent(pWang, { tableId: 3 });
    });
  }

  test('確認對話框：標題、內文與「返回」「確認取消報名」；確認後員工與眷屬都移除、B4 桌少 2 人、沒有「復原」；員工名單不變（PPL-AC30、PPL-R18）', async ({ page }) => {
    await seedWangAtTable3();
    await gotoPeople(page);

    await rowAction(page, '王小明', '取消報名');
    const dialog = cancelDialog(page, '王小明');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      '王小明 會從參與人員移除，眷屬一併移除，已安排的座位會空出來；員工名單不受影響，之後可以再加入。',
    );
    await expect(dialog.getByRole('button', { name: '返回' })).toBeVisible();
    await dialog.getByRole('button', { name: '確認取消報名' }).click();

    await expect(dialog).toBeHidden();
    await expect(personRow(page, '王小明')).toHaveCount(0);
    await expect(personRow(page, '王小明_眷屬')).toHaveCount(0);
    await expectToast(page, '已取消 王小明 的報名。');
    await expect(toasts(page).getByRole('button', { name: '復原' })).toHaveCount(0);
    await expect.poll(() => seatedNames(3)).toEqual(['測試貴賓甲']);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '參與人員' })).toBeVisible();
    await expect(personRow(page, '測試貴賓甲')).toHaveCount(1);
    await expect(personRow(page, '王小明')).toHaveCount(0);
    expect(await withDb((db) => db.hasEmployee('王小明'))).toBe(true);
  });

  test('按「返回」：清單與座位都沒有改變（PPL-AC31）', async ({ page }) => {
    await seedWangAtTable3();
    await gotoPeople(page);

    await rowAction(page, '王小明', '取消報名');
    const dialog = cancelDialog(page, '王小明');
    await dialog.getByRole('button', { name: '返回' }).click();

    await expect(dialog).toBeHidden();
    await expect(personRow(page, '王小明')).toHaveCount(1);
    await expect(personRow(page, '王小明_眷屬')).toHaveCount(1);
    expect(await seatedNames(3)).toEqual(['測試貴賓甲', '王小明', '王小明_眷屬']);
  });

  test('桌面：取消在左、確認在右（第 2.2 節）', async ({ page }) => {
    await seedWangAtTable3();
    await gotoPeople(page);
    await rowAction(page, '王小明', '取消報名');
    const dialog = cancelDialog(page, '王小明');
    const back = await boxOf(dialog.getByRole('button', { name: '返回' }));
    const confirm = await boxOf(dialog.getByRole('button', { name: '確認取消報名' }));
    expect(back.x).toBeLessThan(confirm.x);
  });

  test('工作人員桌有 3 位：取消陳大文的報名後剩 2 位（PPL-AC32）', async ({ page }) => {
    await withDb(async (db) => {
      const { chen } = await demoEmployees(db);
      await db.fillStaff(2);
      await db.register(chen, { tableId: STAFF_TABLE });
    });
    await gotoPeople(page);

    await rowAction(page, '陳大文', '取消報名');
    await cancelDialog(page, '陳大文').getByRole('button', { name: '確認取消報名' }).click();

    await expect(personRow(page, '陳大文')).toHaveCount(0);
    await expect.poll(() => seatedNames(STAFF_TABLE)).toEqual(['工作人員1', '工作人員2']);
  });

  test('剛被取消報名：新增人員的員工選項可以選，沒有「・已報名」（PPL-AC33、PPL-R43）', async ({ page }) => {
    await seedWangAtTable3();
    await gotoPeople(page);
    await rowAction(page, '王小明', '取消報名');
    await cancelDialog(page, '王小明').getByRole('button', { name: '確認取消報名' }).click();
    await expect(personRow(page, '王小明')).toHaveCount(0);

    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '類別'), '員工');
    const listbox = await openOptions(page, selectField(dialog, '員工'), '王小明');
    const option = optionIn(listbox, /^王小明（研發一部・分機 1234）/);
    await expect(option).toBeEnabled();
    await expect(option).not.toContainText('已報名');
  });
});

test.describe('刪除眷屬與外部貴賓（PPL-R15、PPL-R38）', () => {
  test.beforeEach(desktopOnly);

  test('刪除林董：確認對話框標題、內文與「取消」「刪除人員」；同桌其他人順序不變；Sonner 沒有「復原」（PPL-AC34、PPL-R18）', async ({ page }) => {
    await withDb(async (db) => {
      await db.guest('測試貴賓甲', { tableId: 5 });
      await db.guest('林董', { tableId: 5 });
      await db.guest('測試貴賓乙', { tableId: 5 });
      await db.guest('測試貴賓丙', { tableId: 5 });
    });
    await gotoPeople(page);

    await rowAction(page, '林董', '刪除');
    const dialog = deleteDialog(page, '林董');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('刪除後無法復原；已安排的座位會空出來。');
    await expect(dialog.getByRole('button', { name: '取消' })).toBeVisible();
    await dialog.getByRole('button', { name: '刪除人員' }).click();

    await expect(personRow(page, '林董')).toHaveCount(0);
    await expectToast(page, '已刪除 林董。');
    await expect(toasts(page).getByRole('button', { name: '復原' })).toHaveCount(0);
    await expect.poll(() => seatedNames(5)).toEqual(['測試貴賓甲', '測試貴賓乙', '測試貴賓丙']);
  });

  test('刪除時按「取消」：不做任何改變（PPL-R38）', async ({ page }) => {
    await withDb((db) => db.guest('林董', { tableId: 5 }));
    await gotoPeople(page);
    await rowAction(page, '林董', '刪除');
    const dialog = deleteDialog(page, '林董');
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();
    await expect(personRow(page, '林董')).toHaveCount(1);
    expect(await seatedNames(5)).toEqual(['林董']);
  });

  test('刪除王小明_眷屬：王小明仍在；之後新增眷屬、所屬員工選王小明可以儲存（PPL-AC35、PPL-R04）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      const pWang = await db.register(wang);
      await db.dependent(pWang);
    });
    await gotoPeople(page);

    await rowAction(page, '王小明_眷屬', '刪除');
    await deleteDialog(page, '王小明_眷屬').getByRole('button', { name: '刪除人員' }).click();
    await expect(personRow(page, '王小明_眷屬')).toHaveCount(0);
    await expect(personRow(page, '王小明')).toHaveCount(1);
    await expectToast(page, '已刪除 王小明_眷屬。');

    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '類別'), '眷屬');
    await chooseOption(page, selectField(dialog, '所屬員工'), /^王小明/, '王小明');
    await dialog.getByRole('button', { name: '新增人員' }).click();
    await expect(dialog).toBeHidden();
    await expect(personRow(page, '王小明_眷屬')).toHaveCount(1);
  });
});

test.describe('手機（767 px 以下）', () => {
  test('視窗 375 px：取消報名的確認對話框按鈕滿版堆疊，「確認取消報名」在最上面（PPL-AC76、PPL-R77）', async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機寬度才堆疊按鈕');
    await page.setViewportSize({ width: 375, height: 800 });
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.register(wang);
    });
    await gotoPeople(page);

    await rowAction(page, '王小明', '取消報名');
    const dialog = cancelDialog(page, '王小明');
    const confirm = await boxOf(dialog.getByRole('button', { name: '確認取消報名' }));
    const back = await boxOf(dialog.getByRole('button', { name: '返回' }));
    const panel = await boxOf(dialog);
    expect(confirm.y + confirm.height).toBeLessThanOrEqual(back.y + 1);
    expect(Math.abs(confirm.width - back.width)).toBeLessThanOrEqual(1);
    expect(confirm.width).toBeGreaterThan(panel.width * 0.7);
  });
});
