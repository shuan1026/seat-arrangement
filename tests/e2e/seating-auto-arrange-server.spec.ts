// 自動排座接上 D 線的演算法（階段 3，docs/plan/implementation-plan.md 第 5.2 節）：從座位安排頁按「自動排座」→「開始排座」，
// 不攔截請求，走真的伺服器（POST /api/seating/operations 的 autoArrange，伺服器用 src/domain/auto-arrange.ts 排座）。
// 依據：docs/spec/auto-arrange.md 2.2、2.3、ARR-R13（直接套用、立即儲存、按一次「復原」回到排座前）、ARR-R14（Sonner 文案）、
// ARR-R15（對話框的 {n}、{k}）、驗收條件 ARR-AC02、AC08、AC09、AC10、AC13、AC14、AC18；待確認 ARR-Q02、ARR-Q03 照目前假設；
// docs/spec/seating.md SEAT-R75（統計列）、SEAT-R76、SEAT-R78、SEAT-R85。
// C 線原本用 page.route 攔截、回傳假結果的 E2E（seating-auto-arrange.spec.ts）保留不動；排座規則的細節在單元與整合測試。
// 資料用 tests/e2e/helpers/seating-data.ts 直接寫進測試資料庫，都是虛構資料；員工名單順序就是建立的順序。
// D-019：測試資料用內部編號（1 = B1、2 = A1、3 = B4、4 = B7、29 = A10、30 = A13），填桌順序就是內部編號的順序；
// Sonner 寫桌數「已把 {n} 位安排到 {k} 桌。」（ARR-R14）。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { noteNameOf, rosterNames, seed, type SeatingSeeder } from './helpers/seating-data';
import {
  clickUndo,
  expectStats,
  expectToast,
  mapTable,
  openSeating,
  showMap,
  toolbarButton,
  waitForOperation,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
});

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面版面；手機另外測');

/** 「業1」…「業7」 */
const range = (prefix: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

async function people(s: SeatingSeeder, names: readonly string[], opts: { department: string; team?: string | null; tableId?: number }) {
  for (const name of names) await s.employee(name, opts);
}

async function openDialog(page: Page) {
  await showMap(page);
  await toolbarButton(page, '自動排座').click();
  const dialog = page.getByRole('dialog', { name: '自動排座', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** 按「開始排座」並等伺服器回應 */
async function start(page: Page, dialog: Locator) {
  const saved = waitForOperation(page);
  await dialog.getByRole('button', { name: '開始排座' }).click();
  const res = await saved;
  expect(res.status(), '自動排座的請求成功').toBe(200);
  await expect(dialog).toBeHidden();
}

/** ARR-AC02：業務部 業1–業7、研發部 研1–研7，都未入座 */
async function seedTwoDepartments() {
  await seed(async (s) => {
    await people(s, range('業', 1, 7), { department: '業務部' });
    await people(s, range('研', 1, 7), { department: '研發部' });
  });
}

test.describe('只排未入座（ARR-R03、ARR-R13、ARR-R14）', () => {
  test('ARR-AC02：對話框「只排未入座的 14 位」→ 開始排座 → B1 桌業1–業7、研1–研3，A1 桌研4–研7；Sonner「已把 14 位安排到 2 桌。」帶「復原」；座位圖與統計列立即更新、重新整理後仍在', async ({
    page,
  }) => {
    await seedTwoDepartments();
    await openSeating(page);
    await expectStats(page, { seated: 0, total: 14, unseated: 14, empty: 300, full: 0 });

    const dialog = await openDialog(page);
    await expect(dialog.getByRole('radio', { name: /^只排未入座的 14 位/ })).toBeChecked();
    await expect(dialog.getByRole('radio', { name: '清空後重排（有備註名稱的 0 桌不動）' })).toBeVisible();
    await start(page, dialog);

    await expectToast(page, '已把 14 位安排到 2 桌。', { undo: true });
    await expectStats(page, { seated: 14, total: 14, unseated: 0, empty: 286, full: 1 });
    await expect(mapTable(page, 1)).toContainText('已滿');
    await expect(mapTable(page, 2)).toContainText('4/10');
    expect(await rosterNames(1)).toEqual([...range('業', 1, 7), ...range('研', 1, 3)]);
    expect(await rosterNames(2)).toEqual(range('研', 4, 7));

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expectStats(page, { seated: 14, total: 14, unseated: 0, empty: 286, full: 1 });
  });

  test('按 Sonner 的「復原」：一次回到排座前，全部回到未入座；Sonner「已復原。」（ARR-R13、SEAT-R76、SEAT-R78）', async ({ page }) => {
    desktopOnly(page);
    await seedTwoDepartments();
    await openSeating(page);
    await start(page, await openDialog(page));
    await expectToast(page, '已把 14 位安排到 2 桌。', { undo: true });

    const restored = waitForOperation(page);
    await clickUndo(page, '已把 14 位安排到 2 桌。');
    expect((await restored).status()).toBe(200);
    await expectToast(page, '已復原。', { undo: false });
    await expectStats(page, { seated: 0, total: 14, unseated: 14, empty: 300, full: 0 });
    await expect(mapTable(page, 1)).toContainText('0/10');
    expect(await rosterNames(1)).toEqual([]);
    expect(await rosterNames(2)).toEqual([]);
  });

  test('ARR-AC08：主桌有外部貴賓、B4 桌已坐滿 → 對話框「只排未入座的 3 位」「清空後重排（有備註名稱的 1 桌不動）」；排完 A1 桌研1–研8、業1、業2，B7 桌業3，賓4 仍未入座；Sonner「已把 3 位安排到 2 桌。」', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.noteName(1, '主桌');
      for (const name of ['賓1', '賓2', '賓3']) await s.guest(name, { tableId: 1 });
      await people(s, range('研', 1, 8), { department: '研發部', tableId: 2 });
      await people(s, range('行', 1, 10), { department: '行政部', tableId: 3 });
      await people(s, range('業', 1, 3), { department: '業務部', team: '北區組' });
      await s.guest('賓4');
    });
    await openSeating(page);

    const dialog = await openDialog(page);
    await expect(dialog.getByRole('radio', { name: /^只排未入座的 3 位/ })).toBeChecked();
    await expect(dialog.getByRole('radio', { name: '清空後重排（有備註名稱的 1 桌不動）' })).toBeVisible();
    await start(page, dialog);

    await expectToast(page, '已把 3 位安排到 2 桌。', { undo: true });
    expect(await rosterNames(1)).toEqual(['賓1', '賓2', '賓3']);
    expect(await rosterNames(2)).toEqual([...range('研', 1, 8), '業1', '業2']);
    expect(await rosterNames(3)).toEqual(range('行', 1, 10));
    expect(await rosterNames(4)).toEqual(['業3']);
    await expect(mapTable(page, 4)).toContainText('1/10');
    expect(await noteNameOf(1)).toBe('主桌');
  });

  test('ARR-AC13：空位不夠 → Sonner「已把 3 位安排到 2 桌，還有 4 位排不下，留在未入座。」帶「復原」；研1–研4 留在未入座（ARR-R11、ARR-R14）', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      for (let t = 1; t <= 28; t++) await s.noteName(t, `備註${t}`);
      await people(s, range('行', 1, 8), { department: '行政部', tableId: 29 });
      await people(s, range('行', 9, 17), { department: '行政部', tableId: 30 });
      await people(s, range('業', 1, 3), { department: '業務部', team: '北區組' });
      await people(s, range('研', 1, 4), { department: '研發部', team: '前端組' });
    });
    await openSeating(page);
    await start(page, await openDialog(page));

    await expectToast(page, '已把 3 位安排到 2 桌，還有 4 位排不下，留在未入座。', { undo: true });
    expect(await rosterNames(29)).toEqual([...range('行', 1, 8), '業1', '業2']);
    expect(await rosterNames(30)).toEqual([...range('行', 9, 17), '業3']);
    await expectStats(page, { seated: 20, total: 24, unseated: 4, empty: 280, full: 2 });
  });

  test('ARR-AC14：30 桌都坐滿 10 人 → 座位都不變，警告 Sonner「沒有可以排的員工與眷屬。」不帶「復原」（ARR-Q02 的目前假設）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      for (let t = 1; t <= 30; t++) for (let i = 1; i <= 10; i++) await s.guest(`佔${t}-${i}`, { tableId: t });
      await s.employee('業1', { department: '業務部' });
    });
    await openSeating(page);
    await start(page, await openDialog(page));

    await expectToast(page, '沒有可以排的員工與眷屬。', { undo: false });
    await expectStats(page, { seated: 300, total: 301, unseated: 1, empty: 0, full: 30 });
    expect(await rosterNames(1)).toEqual(range('佔1-', 1, 10));
  });

  test('只排進一桌：Sonner「已把 2 位安排到 1 桌。」（ARR-Q03 的目前假設、ARR-AC15）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await people(s, ['業1', '業2'], { department: '業務部' });
    });
    await openSeating(page);
    await start(page, await openDialog(page));
    await expectToast(page, '已把 2 位安排到 1 桌。', { undo: true });
    expect(await rosterNames(1)).toEqual(['業1', '業2']);
  });
});

test.describe('清空後重排（ARR-R04、ARR-R12）', () => {
  /** ARR-AC09：B1 桌（1）「主桌」業1、業2、賓1；A1 桌（2）賓2、研1–研9；B4 桌（3）「供應商」沒有人；B7 桌（4）業3；研10 未入座 */
  async function seedRebuild() {
    await seed(async (s) => {
      await s.noteName(1, '主桌');
      await s.noteName(3, '供應商');
      await s.employee('業1', { department: '業務部', tableId: 1 });
      await s.employee('業2', { department: '業務部', tableId: 1 });
      await s.employee('業3', { department: '業務部', tableId: 4 });
      await s.guest('賓1', { tableId: 1 });
      await s.guest('賓2', { tableId: 2 });
      await people(s, range('研', 1, 9), { department: '研發部', tableId: 2 });
      await s.employee('研10', { department: '研發部' });
    });
  }

  test('ARR-AC09：對話框「只排未入座的 1 位」「清空後重排（有備註名稱的 2 桌不動）」；選「清空後重排」→ B1 桌不變、A1 桌業3、研1–研9、B7 桌研10、賓2 回到未入座；Sonner「已把 11 位安排到 2 桌。」', async ({
    page,
  }) => {
    desktopOnly(page);
    await seedRebuild();
    await openSeating(page);

    const dialog = await openDialog(page);
    await expect(dialog.getByRole('radio', { name: /^只排未入座的 1 位/ })).toBeVisible();
    const rebuild = dialog.getByRole('radio', { name: '清空後重排（有備註名稱的 2 桌不動）' });
    await rebuild.check();
    await start(page, dialog);

    await expectToast(page, '已把 11 位安排到 2 桌。', { undo: true });
    expect(await rosterNames(1)).toEqual(['業1', '業2', '賓1']);
    expect(await rosterNames(2)).toEqual(['業3', ...range('研', 1, 9)]);
    expect(await rosterNames(3)).toEqual([]);
    expect(await rosterNames(4)).toEqual(['研10']);
    expect(await noteNameOf(1)).toBe('主桌');
    expect(await noteNameOf(3)).toBe('供應商');
    expect(await noteNameOf(2)).toBeNull();
  });

  test('ARR-AC10：ARR-AC09 排完後按「復原」→ A1 桌回到賓2、研1–研9（順序和排座前相同），B7 桌回到業3，研10 回到未入座；Sonner「已復原。」', async ({
    page,
  }) => {
    desktopOnly(page);
    await seedRebuild();
    await openSeating(page);
    const dialog = await openDialog(page);
    await dialog.getByRole('radio', { name: '清空後重排（有備註名稱的 2 桌不動）' }).check();
    await start(page, dialog);
    await expectToast(page, '已把 11 位安排到 2 桌。', { undo: true });

    await clickUndo(page, '已把 11 位安排到 2 桌。');
    await expectToast(page, '已復原。', { undo: false });
    await expect.poll(() => rosterNames(2)).toEqual(['賓2', ...range('研', 1, 9)]);
    expect(await rosterNames(4)).toEqual(['業3']);
    expect(await rosterNames(1)).toEqual(['業1', '業2', '賓1']);
    expect(await noteNameOf(1)).toBe('主桌');
    expect(await noteNameOf(3)).toBe('供應商');
  });
});

test.describe('手機（auto-arrange.md 2.4、ARR-AC18）', () => {
  test('視窗 320 px → 座位圖分頁按「自動排座」→ 同一個對話框；排完的結果與桌面相同', async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機寬度');
    await seedTwoDepartments();
    await openSeating(page);
    await start(page, await openDialog(page));

    await expectToast(page, '已把 14 位安排到 2 桌。', { undo: true });
    expect(await rosterNames(1)).toEqual([...range('業', 1, 7), ...range('研', 1, 3)]);
    expect(await rosterNames(2)).toEqual(range('研', 4, 7));
  });
});
