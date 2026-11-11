// 復原與重做（工具列的「復原」「重做」，D-028）：docs/spec/seating.md v1.8 2.1.3（工具列）、2.1.11（手機）、4.1（文案）；
// SEAT-R76、R77（最近 20 步、參與人員頁的操作也記在同一份紀錄、一步要等儲存完成才記進紀錄、Sonner 的「復原」等於最近一步、
// 用工具列復原時那一步的 Sonner 一起關掉）、R79（「已復原。」「已重做。」都不帶按鈕）、R80（備註名稱、取消報名不能復原，也不清掉紀錄）、
// R90（檢視者沒有「復原」「重做」）、R99（重做）、R100（重新整理、別人改過資料而重新載入、改為檢視者時清掉）；
// 驗收條件 SEAT-AC129～AC138；docs/spec/auto-arrange.md ARR-R13；docs/spec/README.md 共用文案「已復原。」「已重做。」；
// docs/architecture.md 第 8.1 節（restore 也回傳 undo，前端用它做重做；紀錄只在瀏覽器記憶體）。
// 走真的伺服器，不攔截請求（只有 SEAT-AC129 為了確認「儲存完成前不能復原」，暫時擋住一次請求再放行）。
// 工具列按鈕與 Tooltip 的無障礙結構見 helpers/seating-page.ts 開頭（toolbarUndo、toolbarRedo 限定在 main 裡，不會找到 Sonner 的「復原」）。
// 每次操作先等伺服器回應，再看紀錄。資料都是虛構的。
// 桌號（D-019）：測試資料用內部編號（3 = B4、4 = B7、5 = B10、7 = B2），畫面上的字用桌號。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn, signInAsViewer, TEST_USER, YI } from './helpers/auth';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { gotoPeople, rowAction as peopleRowAction } from './helpers/participants-page';
import { makeViewer } from './helpers/permissions-db';
import { CONFLICT_TOAST, NOT_EDITOR_TOAST } from './helpers/permissions-page';
import { navigateTo, openEditorBrowser, waitForTablePatch } from './helpers/scenario';
import { noteNameOf, rosterNames, seatOf, seed } from './helpers/seating-data';
import {
  chooseOption,
  clickHistory,
  clickUndo,
  dragAndDrop,
  expectHistoryTooltip,
  expectStats,
  expectToast,
  mapTable,
  openSeating,
  openTableDetail,
  panelTab,
  peoplePanel,
  personRow,
  rowAction,
  showMap,
  showPeople,
  tableButton,
  titleFor,
  toast,
  toolbarButton,
  toolbarRedo,
  toolbarUndo,
  waitForOperation,
} from './helpers/seating-page';

const B4 = 3;
const B7 = 4;
const B10 = 5;
const B2 = 7;

const UNDONE = '已復原。';
const REDONE = '已重做。';
const UNSEATED = { tableId: null, seatOrder: null };

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面版面；手機見 SEAT-AC138');

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('量不到元素的位置');
  return box;
}

/** 人員面板（「全部」分頁）的列操作「入座…」，選這一桌，按「確認入座」，等儲存成功 */
async function seatByMenu(page: Page, name: string, table: number) {
  await showPeople(page);
  await panelTab(page, '全部').click();
  await rowAction(page, personRow(page, name), '入座…');
  const dialog = page.getByRole('dialog', { name: `安排 ${name} 入座`, exact: true });
  await chooseOption(page, dialog, /^桌次/, new RegExp(`^${titleFor(table)}`));
  const saved = waitForOperation(page);
  await dialog.getByRole('button', { name: '確認入座' }).click();
  expect((await saved).ok(), `${name} 入座成功`).toBe(true);
  await expect(dialog).toBeHidden();
}

/** 人員面板（「全部」分頁）的列操作「移出桌次」，等儲存成功 */
async function unseatByMenu(page: Page, name: string) {
  await showPeople(page);
  await panelTab(page, '全部').click();
  const saved = waitForOperation(page);
  await rowAction(page, personRow(page, name), '移出桌次');
  expect((await saved).ok(), `${name} 移出成功`).toBe(true);
}

test.describe('編輯者', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, requireBaseURL(baseURL));
  });

  test.describe('工具列的「復原」「重做」（2.1.3、SEAT-R77）', () => {
    test('SEAT-AC129：剛開啟時「復原」「重做」在「縮小」前面、都停用，Tooltip 是「復原」「重做」；把王小明拖到 B4 桌，儲存完成前「復原」仍停用，儲存完成後可以按，Tooltip「復原：已把 王小明 安排到 B4 桌。」；「重做」仍停用', async ({
      page,
    }) => {
      desktopOnly(page);
      const { wang } = await seed(async (s) => ({ wang: await s.employee('王小明', { department: '研發一部' }) }));
      await openSeating(page);

      await expect(toolbarUndo(page)).toBeVisible();
      await expect(toolbarRedo(page)).toBeVisible();
      await expect(toolbarUndo(page)).toBeDisabled();
      await expect(toolbarRedo(page)).toBeDisabled();

      // 由左到右：復原、重做、縮小，同一列
      const undo = await boxOf(toolbarUndo(page));
      const redo = await boxOf(toolbarRedo(page));
      const zoomOut = await boxOf(toolbarButton(page, '縮小'));
      expect(undo.x + undo.width, '「復原」在「重做」左邊').toBeLessThanOrEqual(redo.x + 1);
      expect(redo.x + redo.width, '「重做」在「縮小」左邊').toBeLessThanOrEqual(zoomOut.x + 1);
      const middle = (b: { y: number; height: number }) => b.y + b.height / 2;
      expect(Math.abs(middle(undo) - middle(zoomOut)), '「復原」和「縮小」在同一列').toBeLessThanOrEqual(4);
      expect(Math.abs(middle(redo) - middle(zoomOut)), '「重做」和「縮小」在同一列').toBeLessThanOrEqual(4);

      await expectHistoryTooltip(page, '復原', '復原');
      await expectHistoryTooltip(page, '重做', '重做');

      // 一步要等儲存完成才記進紀錄：先擋住這次的請求
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/api/seating/operations', async (route) => {
        await gate;
        await route.continue();
      });
      const saved = waitForOperation(page);
      await dragAndDrop(page, personRow(page, '王小明'), tableButton(page, B4));
      await expect(mapTable(page, B4)).toContainText('1/10'); // 畫面先更新
      await page.waitForTimeout(500);
      await expect(toolbarUndo(page), '還在儲存中的那一步不能用工具列復原').toBeDisabled();

      release();
      expect((await saved).ok()).toBe(true);
      await page.unroute('**/api/seating/operations');
      await expectToast(page, '已把 王小明 安排到 B4 桌。', { undo: true });
      await expect(toolbarUndo(page)).toBeEnabled();
      await expect(toolbarRedo(page)).toBeDisabled();
      await expectHistoryTooltip(page, '復原', '復原：已把 王小明 安排到 B4 桌。');
      await expectHistoryTooltip(page, '重做', '重做');
      expect(await seatOf(wang)).toEqual({ tableId: B4, seatOrder: 0 });
    });

    test('人員面板收合時，「復原」「重做」在「顯示人員面板」後面、「縮小」前面（2.1.3）', async ({ page }) => {
      desktopOnly(page);
      await seed(async (s) => {
        await s.employee('王小明');
      });
      await openSeating(page);
      await peoplePanel(page).getByRole('button', { name: '隱藏人員面板' }).click();
      await expect(toolbarButton(page, '顯示人員面板')).toBeVisible();

      const panel = await boxOf(toolbarButton(page, '顯示人員面板'));
      const undo = await boxOf(toolbarUndo(page));
      const redo = await boxOf(toolbarRedo(page));
      const zoomOut = await boxOf(toolbarButton(page, '縮小'));
      expect(panel.x + panel.width, '「顯示人員面板」在「復原」左邊').toBeLessThanOrEqual(undo.x + 1);
      expect(undo.x + undo.width).toBeLessThanOrEqual(redo.x + 1);
      expect(redo.x + redo.width).toBeLessThanOrEqual(zoomOut.x + 1);
    });
  });

  test.describe('一步一步復原、重做（SEAT-R77、SEAT-R79、SEAT-R99）', () => {
    test('SEAT-AC130：王小明入座 B4 桌、李大華入座 B4 桌、把王小明移出 → 按「復原」三次每次退一步、Sonner「已復原。」，最後兩人都未入座、「復原」停用 → 按「重做」三次依序做回來、Sonner「已重做。」，最後和三步做完時相同、「重做」停用；畫面、統計列與資料庫都跟著更新', async ({
      page,
    }) => {
      desktopOnly(page);
      test.setTimeout(120_000);
      const { wang, lee } = await seed(async (s) => ({
        wang: await s.employee('王小明', { department: '研發一部' }),
        lee: await s.employee('李大華', { department: '研發一部' }),
      }));
      await openSeating(page);

      const SEAT_WANG = '已把 王小明 安排到 B4 桌。';
      const SEAT_LEE = '已把 李大華 安排到 B4 桌。';
      const UNSEAT_WANG = '已把 王小明 移出 B4 桌。';

      await seatByMenu(page, '王小明', B4);
      await seatByMenu(page, '李大華', B4);
      await unseatByMenu(page, '王小明');
      await expect.poll(() => rosterNames(B4)).toEqual(['李大華']);
      await expectStats(page, { seated: 1, total: 2, unseated: 1, empty: 299, full: 0 });
      await expectHistoryTooltip(page, '復原', `復原：${UNSEAT_WANG}`);
      await expect(toolbarRedo(page)).toBeDisabled();

      // 復原第 3 步：王小明回到 B4 桌第 1 列
      await clickHistory(page, '復原');
      await expectToast(page, UNDONE, { undo: false });
      await expect.poll(() => rosterNames(B4)).toEqual(['王小明', '李大華']);
      await expectStats(page, { seated: 2, total: 2, unseated: 0, empty: 298, full: 0 });
      await expectHistoryTooltip(page, '復原', `復原：${SEAT_LEE}`);
      await expectHistoryTooltip(page, '重做', `重做：${UNSEAT_WANG}`);

      // 復原第 2 步：李大華回到未入座
      await clickHistory(page, '復原');
      await expect.poll(() => rosterNames(B4)).toEqual(['王小明']);
      await expectStats(page, { seated: 1, total: 2, unseated: 1, empty: 299, full: 0 });
      await expectHistoryTooltip(page, '復原', `復原：${SEAT_WANG}`);
      await expectHistoryTooltip(page, '重做', `重做：${SEAT_LEE}`);

      // 復原第 1 步：王小明也回到未入座，「復原」停用
      await clickHistory(page, '復原');
      await expect.poll(() => rosterNames(B4)).toEqual([]);
      await expectStats(page, { seated: 0, total: 2, unseated: 2, empty: 300, full: 0 });
      expect(await seatOf(wang)).toEqual(UNSEATED);
      expect(await seatOf(lee)).toEqual(UNSEATED);
      await expect(toolbarUndo(page)).toBeDisabled();
      await expectHistoryTooltip(page, '復原', '復原');
      await expectHistoryTooltip(page, '重做', `重做：${SEAT_WANG}`);

      // 重做第 1 步
      await clickHistory(page, '重做');
      await expectToast(page, REDONE, { undo: false });
      await expect.poll(() => rosterNames(B4)).toEqual(['王小明']);
      await expectStats(page, { seated: 1, total: 2, unseated: 1, empty: 299, full: 0 });
      await expectHistoryTooltip(page, '復原', `復原：${SEAT_WANG}`);
      await expectHistoryTooltip(page, '重做', `重做：${SEAT_LEE}`);

      // 重做第 2 步
      await clickHistory(page, '重做');
      await expect.poll(() => rosterNames(B4)).toEqual(['王小明', '李大華']);
      await expectHistoryTooltip(page, '復原', `復原：${SEAT_LEE}`);
      await expectHistoryTooltip(page, '重做', `重做：${UNSEAT_WANG}`);

      // 重做第 3 步：和三步做完時相同，「重做」停用
      await clickHistory(page, '重做');
      await expect.poll(() => rosterNames(B4)).toEqual(['李大華']);
      await expectStats(page, { seated: 1, total: 2, unseated: 1, empty: 299, full: 0 });
      expect(await seatOf(wang)).toEqual(UNSEATED);
      expect(await seatOf(lee)).toEqual({ tableId: B4, seatOrder: 0 });
      await expect(toolbarRedo(page)).toBeDisabled();
      await expectHistoryTooltip(page, '重做', '重做');
      await expectHistoryTooltip(page, '復原', `復原：${UNSEAT_WANG}`);
    });

    test('SEAT-AC131：做了兩步、按「復原」一次 →「重做」可以按 → 再把陳大文拖到 B2 桌 →「重做」停用、「復原」的 Tooltip 是陳大文那一步；再按「復原」兩次依序退回陳大文、王小明那兩步（李大華那一步不再能重做）', async ({
      page,
    }) => {
      desktopOnly(page);
      test.setTimeout(90_000);
      const { wang, lee, chen } = await seed(async (s) => ({
        wang: await s.employee('王小明', { department: '研發一部' }),
        lee: await s.employee('李大華', { department: '研發一部' }),
        chen: await s.employee('陳大文', { department: '業務部' }),
      }));
      await openSeating(page);

      await seatByMenu(page, '王小明', B4);
      await seatByMenu(page, '李大華', B4);
      await clickHistory(page, '復原');
      await expect.poll(() => seatOf(lee)).toEqual(UNSEATED);
      await expect(toolbarRedo(page)).toBeEnabled();
      await expectHistoryTooltip(page, '重做', '重做：已把 李大華 安排到 B4 桌。');

      // 做了新的可以復原的操作：不能再重做
      await panelTab(page, '全部').click();
      const saved = waitForOperation(page);
      await dragAndDrop(page, personRow(page, '陳大文'), tableButton(page, B2));
      expect((await saved).ok()).toBe(true);
      await expectToast(page, '已把 陳大文 安排到 B2 桌。', { undo: true });
      await expect(toolbarRedo(page)).toBeDisabled();
      await expectHistoryTooltip(page, '重做', '重做');
      await expectHistoryTooltip(page, '復原', '復原：已把 陳大文 安排到 B2 桌。');

      // 紀錄是：王小明入座、陳大文入座
      await clickHistory(page, '復原');
      await expect.poll(() => seatOf(chen)).toEqual(UNSEATED);
      await expectHistoryTooltip(page, '復原', '復原：已把 王小明 安排到 B4 桌。');
      await clickHistory(page, '復原');
      await expect.poll(() => seatOf(wang)).toEqual(UNSEATED);
      await expect(toolbarUndo(page)).toBeDisabled();
      expect(await seatOf(lee)).toEqual(UNSEATED);
    });

    test('SEAT-AC132：連續做 21 步可以復原的操作 → 按「復原」20 次後「復原」停用，第 1 步沒有復原（最多 20 步，超過時拿掉最舊的）', async ({
      page,
    }) => {
      desktopOnly(page);
      test.setTimeout(240_000);
      // 21 位分坐 B4、B7、B10 桌，每桌 7 位；21 步都是「移出桌次」
      const names = await seed(async (s) => {
        const list: string[] = [];
        for (const [prefix, table] of [
          ['甲', B4],
          ['乙', B7],
          ['丙', B10],
        ] as const) {
          for (let i = 1; i <= 7; i++) {
            await s.employee(`${prefix}${i}`, { department: '研發一部', tableId: table });
            list.push(`${prefix}${i}`);
          }
        }
        return list;
      });
      await openSeating(page);
      await expectStats(page, { seated: 21, total: 21, unseated: 0, empty: 279, full: 0 });

      const CODE: Record<string, string> = { 甲: 'B4', 乙: 'B7', 丙: 'B10' };
      const label = (name: string) => `已把 ${name} 移出 ${CODE[name.charAt(0)]} 桌。`;

      for (const name of names) await unseatByMenu(page, name);
      await expectStats(page, { seated: 0, total: 21, unseated: 21, empty: 300, full: 0 });
      await expectHistoryTooltip(page, '復原', `復原：${label('丙7')}`);

      // 第 k 次復原退回第 22−k 步；每次等 Tooltip 換成下一步，才按下一次
      for (let k = 1; k <= 20; k++) {
        await clickHistory(page, '復原');
        await expectStats(page, { seated: k, total: 21, unseated: 21 - k, empty: 300 - k, full: 0 });
        if (k < 20) await expectHistoryTooltip(page, '復原', `復原：${label(names[20 - k]!)}`);
      }
      await expect(toolbarUndo(page)).toBeDisabled();
      await expectHistoryTooltip(page, '復原', '復原');
      // 第 1 步（移出甲1）已經拿掉，甲1 仍未入座；其他 20 位都回到原本的桌
      await expectHistoryTooltip(page, '重做', '重做：已把 甲2 移出 B4 桌。');
      expect(await rosterNames(B4)).toEqual(['甲2', '甲3', '甲4', '甲5', '甲6', '甲7']);
      expect(await rosterNames(B7)).toEqual(['乙1', '乙2', '乙3', '乙4', '乙5', '乙6', '乙7']);
      expect(await rosterNames(B10)).toEqual(['丙1', '丙2', '丙3', '丙4', '丙5', '丙6', '丙7']);
      await showPeople(page);
      await panelTab(page, '未入座').click();
      await expect(personRow(page, '甲1')).toBeVisible();
    });
  });

  test.describe('同一份紀錄、不能復原的操作、清掉的時機（SEAT-R77、SEAT-R80、SEAT-R100）', () => {
    test('SEAT-AC133：在參與人員頁對 B4 桌的王小明按「移出桌次」→ 用左側導覽回到座位安排 →「復原」的 Tooltip 是「復原：已把 王小明 移出 B4 桌。」，按下後王小明回到 B4 桌原本的座號', async ({
      page,
    }) => {
      desktopOnly(page);
      const { wang } = await seed(async (s) => {
        await s.employee('三桌甲', { department: '研發一部', tableId: B4 });
        const id = await s.employee('王小明', { department: '研發一部', tableId: B4 });
        await s.employee('三桌乙', { department: '研發一部', tableId: B4 });
        return { wang: id };
      });
      await gotoPeople(page);

      const saved = waitForOperation(page);
      await peopleRowAction(page, '王小明', '移出桌次');
      expect((await saved).ok()).toBe(true);
      await expect.poll(() => seatOf(wang)).toEqual(UNSEATED);

      // 左側導覽只換主畫面、不重新載入（README 第 5 節），紀錄還在
      await navigateTo(page, '座位安排');
      await expect(tableButton(page, B4)).toBeVisible();
      await expect(toolbarUndo(page)).toBeEnabled();
      await expectHistoryTooltip(page, '復原', '復原：已把 王小明 移出 B4 桌。');

      await clickHistory(page, '復原');
      await expectToast(page, UNDONE, { undo: false });
      await expect.poll(() => seatOf(wang)).toEqual({ tableId: B4, seatOrder: 1 });
      expect(await rosterNames(B4)).toEqual(['三桌甲', '王小明', '三桌乙']);
      await expect(mapTable(page, B4)).toContainText('3/10');
    });

    test('SEAT-AC134：王小明入座 B4 桌後，改 B2 桌的備註名稱、取消李大華的報名 →「復原」仍可以按、Tooltip 仍是王小明那一步；按下後王小明回到未入座，B2 桌的備註名稱不變；重新整理 →「復原」「重做」都停用', async ({
      page,
    }) => {
      desktopOnly(page);
      const { wang } = await seed(async (s) => ({
        wang: await s.employee('王小明', { department: '研發一部' }),
        lee: await s.employee('李大華', { department: '業務部' }),
      }));
      await openSeating(page);
      await seatByMenu(page, '王小明', B4);
      await expectHistoryTooltip(page, '復原', '復原：已把 王小明 安排到 B4 桌。');

      // 改備註名稱（不能復原，SEAT-R80）
      const detail = await openTableDetail(page, B2);
      const field = detail.getByRole('textbox', { name: '備註名稱' });
      const patched = waitForTablePatch(page, B2);
      await field.fill('供應商');
      await field.press('Tab');
      expect((await patched).ok()).toBe(true);
      await expectToast(page, '已儲存', { undo: false });
      await detail.getByRole('button', { name: '關閉' }).first().click();
      await expect(toolbarUndo(page)).toBeEnabled();
      await expectHistoryTooltip(page, '復原', '復原：已把 王小明 安排到 B4 桌。');

      // 取消報名（不能復原，SEAT-R80）也不清掉紀錄
      await panelTab(page, '全部').click();
      await rowAction(page, personRow(page, '李大華'), '取消報名');
      const confirm = page.getByRole('alertdialog', { name: '要取消 李大華 的報名嗎？' });
      await confirm.getByRole('button', { name: '確認取消報名' }).click();
      await expect(confirm).toBeHidden();
      await expect(personRow(page, '李大華')).toHaveCount(0);
      await expect(toolbarUndo(page)).toBeEnabled();
      await expectHistoryTooltip(page, '復原', '復原：已把 王小明 安排到 B4 桌。');

      await clickHistory(page, '復原');
      await expect.poll(() => seatOf(wang)).toEqual(UNSEATED);
      expect(await noteNameOf(B2)).toBe('供應商');
      await expect(toolbarRedo(page)).toBeEnabled();

      // 重新整理：紀錄只在這個分頁的記憶體，都清掉（SEAT-R100）
      await openSeating(page);
      await expect(toolbarUndo(page)).toBeDisabled();
      await expect(toolbarRedo(page)).toBeDisabled();
      await expectHistoryTooltip(page, '復原', '復原');
      await expectHistoryTooltip(page, '重做', '重做');
    });

    test('SEAT-AC135：王小明入座 B4 桌，按 Sonner 的「復原」→ 王小明回到未入座、Sonner「已復原。」、「重做」可以按；李大華入座後改按工具列的「復原」→ 那一步的 Sonner 跟著關掉', async ({
      page,
    }) => {
      desktopOnly(page);
      const { wang, lee } = await seed(async (s) => ({
        wang: await s.employee('王小明', { department: '研發一部' }),
        lee: await s.employee('李大華', { department: '研發一部' }),
      }));
      await openSeating(page);

      await seatByMenu(page, '王小明', B4);
      await expectToast(page, '已把 王小明 安排到 B4 桌。', { undo: true });
      const restored = waitForOperation(page);
      await clickUndo(page, '已把 王小明 安排到 B4 桌。');
      expect((await restored).ok()).toBe(true);
      await expectToast(page, UNDONE, { undo: false });
      await expect.poll(() => seatOf(wang)).toEqual(UNSEATED);
      await expect(toolbarRedo(page)).toBeEnabled();
      await expect(toolbarUndo(page)).toBeDisabled();
      await expectHistoryTooltip(page, '重做', '重做：已把 王小明 安排到 B4 桌。');

      // 另一次入座，Sonner 還在畫面上時改按工具列的「復原」
      await seatByMenu(page, '李大華', B4);
      const leeToast = toast(page, '已把 李大華 安排到 B4 桌。');
      await expect(leeToast).toBeVisible();
      await clickHistory(page, '復原');
      // Sonner 本身約 6 秒才會自己消失；用工具列復原時要馬上關掉
      await expect(leeToast, '那一步的 Sonner 跟著關掉').toHaveCount(0, { timeout: 2000 });
      await expect.poll(() => seatOf(lee)).toEqual(UNSEATED);
      await expectHistoryTooltip(page, '重做', '重做：已把 李大華 安排到 B4 桌。');
    });

    test('改為檢視者（AUTH-R13）：下一次操作被拒、重新載入後，工具列沒有「復原」「重做」；之前那一步沒有被復原（SEAT-R90、SEAT-R100）', async ({
      page,
    }) => {
      desktopOnly(page);
      const { wang, lee } = await seed(async (s) => ({
        wang: await s.employee('王小明', { department: '研發一部' }),
        lee: await s.employee('李大華', { department: '研發一部' }),
      }));
      await openSeating(page);
      await seatByMenu(page, '王小明', B4);
      await expect(toolbarUndo(page)).toBeEnabled();

      await makeViewer(TEST_USER.email); // 別人在權限頁把我改為檢視者

      await rowAction(page, personRow(page, '李大華'), '入座…');
      const dialog = page.getByRole('dialog', { name: '安排 李大華 入座', exact: true });
      await chooseOption(page, dialog, /^桌次/, /^B4 桌/);
      const saved = waitForOperation(page);
      await dialog.getByRole('button', { name: '確認入座' }).click();
      expect((await saved).ok(), '入座被拒').toBe(false);
      await expectToast(page, NOT_EDITOR_TOAST, { undo: false });

      await expect(toolbarUndo(page)).toHaveCount(0);
      await expect(toolbarRedo(page)).toHaveCount(0);
      await expect(toolbarButton(page, '縮小')).toBeVisible();
      expect(await seatOf(wang)).toEqual({ tableId: B4, seatOrder: 0 });
      expect(await seatOf(lee)).toEqual(UNSEATED);
    });
  });

  test.describe('別人改過資料（SEAT-R86、SEAT-R100）', () => {
    test('SEAT-AC136：甲把王小明拖到 B4 桌 → 乙把王小明移到 B2 桌 → 甲按工具列「復原」→ 不儲存，甲的畫面重新載入並顯示「資料已被其他人更新，已重新載入。」，王小明仍在 B2 桌；甲的「復原」「重做」都停用', async ({
      page,
      browser,
      baseURL,
    }) => {
      desktopOnly(page);
      const jia = page; // 預設的 page 是甲（測試帳號，編輯者）
      const { wang } = await seed(async (s) => ({ wang: await s.employee('王小明', { department: '研發一部' }) }));
      await openSeating(jia);

      let saved = waitForOperation(jia);
      await dragAndDrop(jia, personRow(jia, '王小明'), tableButton(jia, B4));
      expect((await saved).ok()).toBe(true);
      await expectToast(jia, '已把 王小明 安排到 B4 桌。', { undo: true });
      await expect(toolbarUndo(jia)).toBeEnabled();

      // 乙（另一個瀏覽器的編輯者）把王小明移到 B2 桌
      const yiBrowser = await openEditorBrowser(browser, requireBaseURL(baseURL), YI, jia.viewportSize());
      try {
        const yi = yiBrowser.page;
        await openSeating(yi);
        await panelTab(yi, '全部').click();
        await rowAction(yi, personRow(yi, '王小明'), '移至其他桌次…');
        const dialog = yi.getByRole('dialog', { name: '把 王小明 移到其他桌次', exact: true });
        await chooseOption(yi, dialog, /^桌次/, /^B2 桌/);
        saved = waitForOperation(yi);
        await dialog.getByRole('button', { name: '確認移動' }).click();
        expect((await saved).ok(), '乙的搬移成功').toBe(true);
      } finally {
        await yiBrowser.context.close();
      }
      await expect.poll(() => seatOf(wang)).toEqual({ tableId: B2, seatOrder: 0 });

      // 甲的畫面還沒更新（COM-R06），按工具列的「復原」
      await toolbarUndo(jia).click();
      await expectToast(jia, CONFLICT_TOAST, { undo: false });
      await expect(toast(jia, UNDONE)).toHaveCount(0);
      expect(await seatOf(wang), '不儲存：王小明仍在 B2 桌').toEqual({ tableId: B2, seatOrder: 0 });

      // 甲的畫面重新載入最新資料，紀錄清掉
      await expect(mapTable(jia, B2)).toContainText('1/10');
      await expect(mapTable(jia, B4)).toContainText('0/10');
      await expect(toolbarUndo(jia)).toBeDisabled();
      await expect(toolbarRedo(jia)).toBeDisabled();
    });
  });

  test.describe('自動排座（ARR-R13）', () => {
    test('SEAT-AC137：「只排未入座」排了 12 位 → 按工具列「復原」回到自動排座之前 → 按「重做」回到排好的結果，Sonner「已重做。」', async ({
      page,
    }) => {
      desktopOnly(page);
      const ids = await seed(async (s) => {
        const list: number[] = [];
        for (let i = 1; i <= 12; i++) list.push(await s.employee(`業${i}`, { department: '業務部' }));
        return list;
      });
      await openSeating(page);
      await expectStats(page, { seated: 0, total: 12, unseated: 12, empty: 300, full: 0 });

      await showMap(page);
      await toolbarButton(page, '自動排座').click();
      const dialog = page.getByRole('dialog', { name: '自動排座', exact: true });
      await expect(dialog.getByRole('radio', { name: /^只排未入座的 12 位/ })).toBeChecked();
      let saved = waitForOperation(page);
      await dialog.getByRole('button', { name: '開始排座' }).click();
      expect((await saved).ok()).toBe(true);
      await expect(dialog).toBeHidden();

      // 排好的結果（每一位的桌次與座號）；Sonner 的桌數與統計列的已滿桌數依實際排的結果算
      const arranged = await Promise.all(ids.map((id) => seatOf(id)));
      expect(arranged.every((p) => p.tableId !== null), '12 位都排進桌次').toBe(true);
      const perTable = new Map<number | null, number>();
      for (const p of arranged) perTable.set(p.tableId, (perTable.get(p.tableId) ?? 0) + 1);
      const full = [...perTable.values()].filter((n) => n >= 10).length;
      const message = `已把 12 位安排到 ${perTable.size} 桌。`;
      await expectToast(page, message, { undo: true });
      await expectStats(page, { seated: 12, total: 12, unseated: 0, empty: 288, full });
      await expectHistoryTooltip(page, '復原', `復原：${message}`);

      await clickHistory(page, '復原');
      await expectToast(page, UNDONE, { undo: false });
      await expectStats(page, { seated: 0, total: 12, unseated: 12, empty: 300, full: 0 });
      for (const id of ids) expect(await seatOf(id)).toEqual(UNSEATED);
      await expectHistoryTooltip(page, '重做', `重做：${message}`);

      saved = waitForOperation(page);
      await toolbarRedo(page).click();
      expect((await saved).ok()).toBe(true);
      await expectToast(page, REDONE, { undo: false });
      await expectStats(page, { seated: 12, total: 12, unseated: 0, empty: 288, full });
      expect(await Promise.all(ids.map((id) => seatOf(id))), '回到排好的結果（含座位順序）').toEqual(arranged);
      await expect(toolbarRedo(page)).toBeDisabled();
      await expectHistoryTooltip(page, '復原', `復原：${message}`);
    });
  });

  test.describe('手機（2.1.11、SEAT-AC138）', () => {
    test('SEAT-AC138：視窗 375 px（與 320 px）的編輯者 → 工具列有「復原」「重做」，沒有整頁水平捲動；在「人員」分頁入座後回「座位圖」按「復原」→ 王小明回到未入座，「重做」可以按', async ({
      page,
    }) => {
      const { wang } = await seed(async (s) => ({
        wang: await s.employee('王小明', { department: '研發一部' }),
        lee: await s.employee('李大華', { department: '研發一部', tableId: B4 }),
      }));
      for (const width of [320, 375]) {
        await page.setViewportSize({ width, height: 800 });
        await openSeating(page);
        await showMap(page);
        await expect(toolbarUndo(page), `${width} px「復原」`).toBeVisible();
        await expect(toolbarRedo(page), `${width} px「重做」`).toBeVisible();
        await expect(toolbarUndo(page)).toBeDisabled();
        await expect(toolbarRedo(page)).toBeDisabled();
        for (const name of ['縮小', '放大', '適合視窗', '全部展開', '自動排座']) {
          await expect(toolbarButton(page, name), `${width} px「${name}」`).toBeVisible();
        }
        await expectNoHorizontalScroll(page);
      }

      // 375 px：在「人員」分頁用「入座…」，再回「座位圖」按工具列的「復原」
      await seatByMenu(page, '王小明', B4);
      await showMap(page);
      await expect(toolbarUndo(page)).toBeEnabled();
      await clickHistory(page, '復原');
      await expectToast(page, UNDONE, { undo: false });
      await expect.poll(() => seatOf(wang)).toEqual(UNSEATED);
      await expect(toolbarRedo(page)).toBeEnabled();
      await expectNoHorizontalScroll(page);
    });
  });
});

test.describe('檢視者（SEAT-R90）', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInAsViewer(context, requireBaseURL(baseURL));
  });

  test('SEAT-AC138：檢視者開啟座位安排 → 工具列沒有「復原」「重做」（隱藏，不是停用）；縮放與全部展開照常', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明', { department: '研發一部', tableId: B4 });
      await s.employee('李大華', { department: '研發一部' });
    });
    await openSeating(page);
    await showMap(page);

    await expect(toolbarUndo(page)).toHaveCount(0);
    await expect(toolbarRedo(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: '復原', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '重做', exact: true })).toHaveCount(0);
    for (const name of ['縮小', '放大', '適合視窗', '全部展開']) await expect(toolbarButton(page, name), name).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
