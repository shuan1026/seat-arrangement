// 階段 3 整體驗證：多人衝突，兩個瀏覽器同時操作同一桌（docs/plan/implementation-plan.md 第 6 節第 2 項）。
// 甲、乙是 docs/spec/permissions.md 第 5 節的虛構帳號，兩人都是編輯者，各用自己的 browser context（各自的 cookie 與畫面），
// 操作都走真的伺服器，不攔截請求。
// 依據：docs/spec/README.md 第 7 節 COM-R06～R09、COM-AC04～AC07；第 8.3 節 AUTH-R11、AUTH-R13、AUTH-R17、AUTH-AC17、AUTH-AC26；
// docs/spec/seating.md SEAT-R12、SEAT-R20、SEAT-R23、SEAT-R86、SEAT-R88、SEAT-R89、SEAT-R90、SEAT-R100、SEAT-AC97、SEAT-AC105；
// docs/spec/employees.md EMP-R41、EMP-R43；docs/spec/permissions.md PRM-R05、PRM-R11、PRM-R35（D-026）。
// 伺服器端同時寫入的鎖與交易在 tests/integration/api/seating-concurrency.test.ts；這裡驗證兩個真的畫面各自看到的結果。
// 每個測試開頭自己清空資料、把權限名單設成甲、乙兩位編輯者（helpers/scenario.ts 的 resetEverything），不依賴其他測試留下的狀態。
// 桌號（D-019）：資料庫用內部編號（3 = B4、4 = B7、5 = B10、6 = B13），畫面上用桌號。
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { JIA, signIn, YI } from './helpers/auth';
import * as employeesPage from './helpers/employees-page';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { withDb } from './helpers/participants-db';
import { memberList } from './helpers/permissions-db';
import {
  changedToast,
  CONFLICT_TOAST,
  demoteAndConfirm,
  expectMemberList,
  expectNoAccessPage,
  gotoPermissions,
  navNames,
  NOT_EDITOR_TOAST,
  openNav,
  removeAndConfirm,
  removedToast,
  viewOnlyBadge,
} from './helpers/permissions-page';
import { openEditorBrowser, resetEverything, waitForTablePatch } from './helpers/scenario';
import { noteNameOf, rosterNames, seatOf, seed } from './helpers/seating-data';
import {
  chooseOption,
  dragOver,
  drop,
  expectToast,
  mapTable,
  openSeating,
  openTableDetail,
  panelTab,
  peoplePanel,
  personRow,
  rowAction,
  seatMap,
  startDrag,
  tableButton,
  titleFor,
  toast,
  toolbarButton,
  toolbarRedo,
  toolbarUndo,
  waitForOperation,
  zoomToRegular,
} from './helpers/seating-page';

const B4 = 3;
const B7 = 4;
const B10 = 5;
const B13 = 6;

test.beforeEach(async ({ page, context, baseURL }) => {
  test.skip(isMobileWidth(page), '兩個瀏覽器同時操作（含拖移），在桌面寬度驗證');
  await resetEverything([JIA.email, YI.email]);
  // 預設的 page 是甲
  await signIn(context, requireBaseURL(baseURL), JIA);
});

/** 另開乙的瀏覽器（編輯者），做完關掉 */
async function withYi(browser: Browser, baseURL: string | undefined, jia: Page, fn: (yi: Page) => Promise<void>) {
  const { context, page } = await openEditorBrowser(browser, requireBaseURL(baseURL), YI, jia.viewportSize());
  try {
    await fn(page);
  } finally {
    await context.close();
  }
}

/** 人員面板的列操作「入座…」，在桌次選單選這一桌（選項開頭「{桌號} 桌（{剩幾位}）」），還不按確認；回傳對話框 */
async function pickTable(page: Page, name: string, table: number, left: string): Promise<Locator> {
  await rowAction(page, personRow(page, name), '入座…');
  const dialog = page.getByRole('dialog', { name: `安排 ${name} 入座`, exact: true });
  await expect(dialog).toBeVisible();
  await chooseOption(page, dialog, /^桌次/, new RegExp(`^${titleFor(table)}（${left}）`));
  return dialog;
}

/** 畫面是只能檢視：Header「只能檢視」，沒有修改資料的入口（COM-R19、COM-R20、SEAT-R90；工具列的「復原」「重做」也沒有，D-028） */
async function expectViewOnly(page: Page) {
  await expect(viewOnlyBadge(page)).toBeVisible();
  for (const name of ['新增人員', '發布', '自動排座']) {
    await expect(page.getByRole('button', { name, exact: true }), name).toHaveCount(0);
  }
  await expect(toolbarUndo(page), '工具列的「復原」').toHaveCount(0);
  await expect(toolbarRedo(page), '工具列的「重做」').toHaveCount(0);
  await expect(page.getByRole('button', { name: '匯出座位表', exact: true })).toBeVisible();
  await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);
  await expect(peoplePanel(page).getByRole('button', { name: '更多操作' })).toHaveCount(0);
  expect(await navNames(await openNav(page))).toEqual(['座位安排', '參與人員', '員工名單']);
}

test.describe('搶同一桌最後的位子（COM-R07、COM-R08、SEAT-R86）', () => {
  test('B13 桌 9 位、只剩 1 個空位，甲、乙都用「入座…」選 B13 桌：先送出的甲成功；後送出的乙不儲存，重新載入並顯示「B13 桌已滿，請先移出一位。」（SEAT-R23、SEAT-R88、SEAT-AC97）', async ({
    page,
    browser,
    baseURL,
  }) => {
    const jia = page; // 預設的 page 是甲
    const { wang, lee } = await seed(async (s) => {
      await s.fill(B13, 9, { department: '研發部', prefix: '十三' });
      return {
        wang: await s.employee('王小明', { department: '業務部' }),
        lee: await s.employee('李美華', { department: '業務部' }),
      };
    });

    await withYi(browser, baseURL, jia, async (yi) => {
      await openSeating(jia);
      await openSeating(yi);

      // 兩人的畫面上 B13 桌都「剩 1 位」
      const jiaDialog = await pickTable(jia, '王小明', B13, '剩 1 位');
      const yiDialog = await pickTable(yi, '李美華', B13, '剩 1 位');

      // 甲先送出：成功
      let saved = waitForOperation(jia);
      await jiaDialog.getByRole('button', { name: '確認入座' }).click();
      expect((await saved).ok(), '甲的入座成功').toBe(true);
      await expect(jiaDialog).toBeHidden();
      await expectToast(jia, '已把 王小明 安排到 B13 桌。', { undo: true });
      await expect(mapTable(jia, B13)).toContainText('已滿');

      // 乙後送出：不儲存
      saved = waitForOperation(yi);
      await yiDialog.getByRole('button', { name: '確認入座' }).click();
      expect((await saved).ok(), '乙的入座被拒').toBe(false);
      await expect(yiDialog).toBeHidden();
      await expectToast(yi, 'B13 桌已滿，請先移出一位。', { undo: false });
      await expect(toast(yi, '已把 李美華 安排到 B13 桌。')).toHaveCount(0);
      await expect(toast(yi, CONFLICT_TOAST)).toHaveCount(0);

      // 乙的畫面重新載入最新資料：B13 桌已滿、王小明已入座、李美華仍未入座
      await expect(mapTable(yi, B13)).toContainText('已滿');
      await expect(personRow(yi, '王小明')).toHaveCount(0);
      await expect(personRow(yi, '李美華')).toBeVisible();

      // 資料庫：B13 桌剛好 10 位
      expect(await seatOf(wang)).toEqual({ tableId: B13, seatOrder: 9 });
      expect(await seatOf(lee)).toEqual({ tableId: null, seatOrder: null });
      expect(await rosterNames(B13)).toHaveLength(10);
    });
  });

  test('B10 桌 11 位（「超過」），甲、乙同時各拖一位進 B10 桌：只有一人成功（B10 桌 12 位，Sonner 加「這一桌已超過 10 位。」）；另一人不儲存，重新載入並顯示「B10 桌已達 12 位，請先移出一位。」（COM-AC04、SEAT-R20、SEAT-R89）', async ({
    page,
    browser,
    baseURL,
  }) => {
    const jia = page; // 預設的 page 是甲
    const { wang, lee } = await seed(async (s) => {
      await s.fill(B10, 11, { department: '研發部', prefix: '十' });
      return {
        wang: await s.employee('王小明', { department: '業務部' }),
        lee: await s.employee('李美華', { department: '業務部' }),
      };
    });

    await withYi(browser, baseURL, jia, async (yi) => {
      await openSeating(jia);
      await openSeating(yi);
      for (const p of [jia, yi]) await expect(mapTable(p, B10)).toContainText('超過');

      // 兩人各自拖一位到 B10 桌上方（11 位還可以放），同時放開
      await startDrag(jia, personRow(jia, '王小明'));
      await dragOver(jia, tableButton(jia, B10));
      await startDrag(yi, personRow(yi, '李美華'));
      await dragOver(yi, tableButton(yi, B10));
      const savedJia = waitForOperation(jia);
      const savedYi = waitForOperation(yi);
      await Promise.all([drop(jia), drop(yi)]);
      const [resJia, resYi] = await Promise.all([savedJia, savedYi]);
      expect([resJia.ok(), resYi.ok()].filter(Boolean), '只有一人成功').toHaveLength(1);

      const jiaWon = resJia.ok();
      const winner = jiaWon ? { page: jia, name: '王小明', id: wang } : { page: yi, name: '李美華', id: lee };
      const loser = jiaWon ? { page: yi, name: '李美華', id: lee } : { page: jia, name: '王小明', id: wang };

      await expectToast(winner.page, `已把 ${winner.name} 安排到 B10 桌，這一桌已超過 10 位。`, { undo: true });
      await expectToast(loser.page, 'B10 桌已達 12 位，請先移出一位。', { undo: false });
      await expect(toast(loser.page, `已把 ${loser.name} 安排到 B10 桌`)).toHaveCount(0);

      // 失敗的一方重新載入最新資料：對方拖進去的人已入座，自己拖的人仍未入座
      await expect(personRow(loser.page, loser.name)).toBeVisible();
      await expect(personRow(loser.page, winner.name)).toHaveCount(0);
      await expect(mapTable(loser.page, B10)).toContainText('超過');

      // 資料庫：B10 桌剛好 12 位
      const names = await rosterNames(B10);
      expect(names).toHaveLength(12);
      expect(names[11]).toBe(winner.name);
      expect(names).not.toContain(loser.name);
      expect(await seatOf(loser.id)).toEqual({ tableId: null, seatOrder: null });
    });
  });
});

test.describe('資料已被別人刪除（COM-R07、COM-R08）', () => {
  test('乙正在把王小明拖到 B4 桌時，甲在員工名單刪除了王小明（已報名、眷屬坐 B7 桌）→ 乙放開：不儲存，重新載入，Sonner「資料已被其他人更新，已重新載入。」；王小明與眷屬都不在了（EMP-R41、EMP-R43）', async ({
    page,
    browser,
    baseURL,
  }) => {
    const jia = page; // 預設的 page 是甲
    const { lee } = await seed(async (s) => {
      const wang = await s.employee('王小明', { department: '業務部' });
      await s.dependent(wang, { tableId: B7 });
      return { lee: await s.employee('李美華', { department: '研發部', tableId: B4 }) };
    });

    await withYi(browser, baseURL, jia, async (yi) => {
      await employeesPage.gotoEmployees(jia);
      await openSeating(yi);
      await expect(mapTable(yi, B7)).toContainText('1/10');

      // 乙開始拖王小明，停在 B4 桌上方還沒放開
      await startDrag(yi, personRow(yi, '王小明'));
      await dragOver(yi, tableButton(yi, B4));

      // 甲在這時刪除王小明
      const menu = await employeesPage.openRowMenu(jia, employeesPage.rowOf(jia, '王小明'));
      await menu.getByRole('menuitem', { name: '刪除', exact: true }).click();
      const confirm = jia.getByRole('alertdialog', { name: '要刪除 王小明 嗎？' });
      await expect(confirm).toContainText('王小明 已報名尾牙，刪除後會一併取消報名、移除眷屬並空出座位。刪除後無法復原。');
      await confirm.getByRole('button', { name: '刪除員工', exact: true }).click();
      await expect(confirm).toBeHidden();
      await expectToast(jia, '已刪除 王小明。', { undo: false });
      await expect.poll(() => withDb((db) => db.hasEmployee('王小明'))).toBe(false);

      // 乙放開
      const saved = waitForOperation(yi);
      await drop(yi);
      expect((await saved).ok(), '乙的入座被拒').toBe(false);
      await expectToast(yi, CONFLICT_TOAST, { undo: false });
      await expect(toast(yi, '已把 王小明 安排到 B4 桌。')).toHaveCount(0);

      // 乙的畫面重新載入：王小明與眷屬都不在，B7 桌的座位空出來，B4 桌只有李美華
      await expect(personRow(yi, '王小明')).toHaveCount(0);
      await panelTab(yi, '全部').click();
      await expect(personRow(yi, '李美華')).toBeVisible();
      await expect(personRow(yi, '王小明')).toHaveCount(0);
      await expect(personRow(yi, '王小明_眷屬')).toHaveCount(0);
      await expect(mapTable(yi, B4)).toContainText('1/10');
      await expect(mapTable(yi, B7)).toContainText('0/10');

      // 資料庫
      expect(await rosterNames(B4)).toEqual(['李美華']);
      expect(await rosterNames(B7)).toEqual([]);
      expect(await seatOf(lee)).toEqual({ tableId: B4, seatOrder: 0 });
      expect(await withDb((db) => db.participantCount())).toBe(1);
    });
  });
});

test.describe('畫面開著時被改為檢視者（AUTH-R11、AUTH-R13、PRM-R05、PRM-R35）', () => {
  test('乙開著座位安排；甲在權限頁把乙改為檢視者 → 乙的畫面不會自己改變；乙下一次「入座…」不儲存，重新載入並顯示「你沒有編輯權限，已重新載入。」，畫面變成只能檢視', async ({
    page,
    browser,
    baseURL,
  }) => {
    const jia = page; // 預設的 page 是甲
    const { lee } = await seed(async (s) => {
      await s.employee('王大同', { department: '研發部', tableId: B4 });
      return { lee: await s.employee('李美華', { department: '業務部' }) };
    });

    await withYi(browser, baseURL, jia, async (yi) => {
      await openSeating(yi);
      await expect(yi.getByRole('button', { name: '新增人員', exact: true }).first()).toBeVisible();
      await expect(viewOnlyBadge(yi)).toHaveCount(0);

      // 甲在權限頁把乙改為檢視者
      await gotoPermissions(jia);
      await expectMemberList(jia, [
        { email: JIA.email, role: 'EDITOR' },
        { email: YI.email, role: 'EDITOR' },
      ]);
      await demoteAndConfirm(jia, YI.email);
      await expectToast(jia, changedToast(YI.email, 'VIEWER'), { undo: false });
      await expectMemberList(jia, [
        { email: JIA.email, role: 'EDITOR' },
        { email: YI.email, role: 'VIEWER' },
      ]);
      await expect.poll(() => memberList()).toEqual([
        { email: JIA.email, role: 'EDITOR' },
        { email: YI.email, role: 'VIEWER' },
      ]);

      // 乙的畫面不會自動更新（COM-R06）：仍有編輯操作
      await expect(viewOnlyBadge(yi)).toHaveCount(0);
      await expect(toolbarButton(yi, '自動排座')).toBeVisible();

      // 乙的下一次操作
      const dialog = await pickTable(yi, '李美華', B4, '剩 9 位');
      const saved = waitForOperation(yi);
      await dialog.getByRole('button', { name: '確認入座' }).click();
      expect((await saved).ok(), '乙的入座被拒').toBe(false);
      await expect(dialog).toBeHidden();
      await expectToast(yi, NOT_EDITOR_TOAST, { undo: false });
      await expect(toast(yi, '已把 李美華 安排到 B4 桌。')).toHaveCount(0);

      // 不儲存，重新載入最新資料
      expect(await seatOf(lee)).toEqual({ tableId: null, seatOrder: null });
      await expect(personRow(yi, '李美華')).toBeVisible();
      await expect(mapTable(yi, B4)).toContainText('1/10');

      // 畫面變成只能檢視，乙不必重新登入
      await expectViewOnly(yi);

      // 甲仍是編輯者
      await openSeating(jia);
      await expect(viewOnlyBadge(jia)).toHaveCount(0);
      await expect(toolbarButton(jia, '自動排座')).toBeVisible();
    });
  });
});

test.describe('畫面開著時被移除權限（AUTH-R11、AUTH-R17、AUTH-AC26、PRM-R11、D-026）', () => {
  test('乙開著座位安排；甲在權限頁移除乙 → 乙的畫面不會自己改變；乙下一次「入座…」不儲存，對話框關閉，畫面換成「沒有權限」頁，沒有 Sonner', async ({
    page,
    browser,
    baseURL,
  }) => {
    const jia = page; // 預設的 page 是甲
    const { lee } = await seed(async (s) => {
      await s.employee('王大同', { department: '研發部', tableId: B4 });
      return { lee: await s.employee('李美華', { department: '業務部' }) };
    });

    await withYi(browser, baseURL, jia, async (yi) => {
      await openSeating(yi);
      await expect(yi.getByRole('button', { name: '新增人員', exact: true }).first()).toBeVisible();

      // 甲在權限頁移除乙
      await gotoPermissions(jia);
      await removeAndConfirm(jia, YI.email);
      await expectToast(jia, removedToast(YI.email), { undo: false });
      await expectMemberList(jia, [{ email: JIA.email, role: 'EDITOR' }]);
      await expect.poll(() => memberList()).toEqual([{ email: JIA.email, role: 'EDITOR' }]);

      // 乙的畫面不會自動更新（COM-R06）：仍是座位安排、仍有編輯操作
      await expect(yi.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
      await expect(toolbarButton(yi, '自動排座')).toBeVisible();

      // 乙的下一次操作
      const dialog = await pickTable(yi, '李美華', B4, '剩 9 位');
      const saved = waitForOperation(yi);
      await dialog.getByRole('button', { name: '確認入座' }).click();
      expect((await saved).status(), '乙的入座被拒（403 NO_ACCESS）').toBe(403);
      await expect(dialog).toBeHidden();

      await expectNoAccessPage(yi, YI.email);
      await yi.waitForTimeout(500);
      await expect(toast(yi, '已把 李美華 安排到 B4 桌。')).toHaveCount(0);
      await expect(toast(yi, NOT_EDITOR_TOAST)).toHaveCount(0);
      await expect(toast(yi, CONFLICT_TOAST)).toHaveCount(0);
      expect(await seatOf(lee)).toEqual({ tableId: null, seatOrder: null });

      // 甲仍是編輯者
      await openSeating(jia);
      await expect(viewOnlyBadge(jia)).toHaveCount(0);
    });
  });
});

test.describe('兩人改同一桌的備註名稱（COM-R09、SEAT-R12）', () => {
  test('甲、乙都開著 B4 桌詳情：甲先改成「主桌」、乙再改成「供應商」→ 兩次都儲存、都不被拒；甲沒重新整理前仍看到自己的內容；重新整理後兩人都看到後改的「供應商」（COM-AC06、COM-AC07）', async ({
    page,
    browser,
    baseURL,
  }) => {
    const jia = page; // 預設的 page 是甲
    await seed(async (s) => {
      await s.fill(B4, 2, { department: '研發部', prefix: '四' });
    });

    await withYi(browser, baseURL, jia, async (yi) => {
      await openSeating(jia);
      await openSeating(yi);
      const jiaField = (await openTableDetail(jia, B4)).getByRole('textbox', { name: '備註名稱' });
      const yiField = (await openTableDetail(yi, B4)).getByRole('textbox', { name: '備註名稱' });
      await expect(jiaField).toHaveValue('');
      await expect(yiField).toHaveValue('');

      // 甲先改
      let saved = waitForTablePatch(jia, B4);
      await jiaField.fill('主桌');
      await jiaField.press('Tab');
      expect((await saved).ok(), '甲的備註名稱儲存成功').toBe(true);
      await expectToast(jia, '已儲存', { undo: false });
      await expect.poll(() => noteNameOf(B4)).toBe('主桌');

      // 乙的畫面不會自動更新（COM-R06），仍是空白；乙後改
      await expect(yiField).toHaveValue('');
      saved = waitForTablePatch(yi, B4);
      await yiField.fill('供應商');
      await yiField.press('Tab');
      expect((await saved).ok(), '乙的備註名稱儲存成功，不被拒').toBe(true);
      await expectToast(yi, '已儲存', { undo: false });
      await expect(toast(yi, CONFLICT_TOAST)).toHaveCount(0);
      await expect.poll(() => noteNameOf(B4)).toBe('供應商');

      // 甲沒重新整理前仍是自己的內容（COM-AC07）
      await expect(jiaField).toHaveValue('主桌');

      // 重新整理後兩人看到的都是後改的內容
      for (const [label, p] of [
        ['甲', jia],
        ['乙', yi],
      ] as const) {
        await openSeating(p);
        await zoomToRegular(p);
        await expect(mapTable(p, B4), label).toContainText('供應商');
        await expect(mapTable(p, B4), label).not.toContainText('主桌');
        const detail = await openTableDetail(p, B4);
        await expect(detail.getByRole('textbox', { name: '備註名稱' }), label).toHaveValue('供應商');
      }
    });
  });

  test('甲、乙同時改 B4 桌的備註名稱（同時離開欄位）→ 兩次都儲存、都不被拒；資料庫是其中一人的內容，兩人重新整理後看到的結果一致（COM-R09）', async ({
    page,
    browser,
    baseURL,
  }) => {
    const jia = page; // 預設的 page 是甲
    await seed(async (s) => {
      await s.fill(B4, 2, { department: '研發部', prefix: '四' });
    });

    await withYi(browser, baseURL, jia, async (yi) => {
      await openSeating(jia);
      await openSeating(yi);
      const jiaField = (await openTableDetail(jia, B4)).getByRole('textbox', { name: '備註名稱' });
      const yiField = (await openTableDetail(yi, B4)).getByRole('textbox', { name: '備註名稱' });

      const savedJia = waitForTablePatch(jia, B4);
      const savedYi = waitForTablePatch(yi, B4);
      await jiaField.fill('主桌');
      await yiField.fill('供應商');
      await Promise.all([jiaField.press('Tab'), yiField.press('Tab')]);
      const [resJia, resYi] = await Promise.all([savedJia, savedYi]);
      expect(resJia.ok(), '甲的備註名稱儲存成功').toBe(true);
      expect(resYi.ok(), '乙的備註名稱儲存成功').toBe(true);
      await expectToast(jia, '已儲存', { undo: false });
      await expectToast(yi, '已儲存', { undo: false });

      const final = await noteNameOf(B4);
      expect(['主桌', '供應商']).toContain(final);

      for (const [label, p] of [
        ['甲', jia],
        ['乙', yi],
      ] as const) {
        await openSeating(p);
        const detail = await openTableDetail(p, B4);
        await expect(detail.getByRole('textbox', { name: '備註名稱' }), label).toHaveValue(final ?? '');
      }
    });
  });
});
