// 自動排座的入口、範圍對話框與結果提示（C 線的部分）：docs/spec/auto-arrange.md 2.1～2.4、4、ARR-R13～R15、
// ARR-AC16～AC18、ARR-Q02～Q04（目前假設）；docs/spec/seating.md 2.1.3、SEAT-R76、SEAT-R78。
// 排座規則由 D 線的 src/domain/auto-arrange.ts 測；階段 2 伺服器還沒登記排座函式，
// 所以這裡用 page.route 攔下 autoArrange 指令，回傳假的排座結果（等於假的 arranger）；復原也攔下，回傳快照裡的位置。
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { rosterNames, seed } from './helpers/seating-data';
import { clickUndo, expectNoToast, expectStats, expectToast, mapTable, openSeating, showMap, toolbarButton } from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
});

const DESCRIPTION = '依員工名單的部門與組別順序排進沒有備註名稱的桌，同組的人盡量排在一起，眷屬跟著員工，外部貴賓與工作人員不排。';

type Person = {
  id: number;
  kind: string;
  employeeId: number | null;
  hostId: number | null;
  guestName: string | null;
  tableId: number | null;
  seatOrder: number | null;
};
type State = { employees: { id: number; name: string }[]; participants: Person[] };
type Snapshot = { participants: { id: number; tableId: number | null; seatOrder: number | null }[]; tables: unknown[] };
type Plan = { changes: { name: string; tableId: number | null; seatOrder: number | null }[]; summary: { placed: number; tableIds: number[]; left: number } };

async function loadState(page: Page): Promise<State> {
  return page.evaluate(async () => (await (await fetch('/api/state')).json()) as State);
}

function idByName(state: State, name: string): number {
  const dependent = name.endsWith('_眷屬');
  const employeeName = dependent ? name.slice(0, -'_眷屬'.length) : name;
  const employee = state.employees.find((e) => e.name === employeeName);
  const host = state.participants.find((p) => p.kind === 'EMPLOYEE' && p.employeeId === employee?.id);
  const found = dependent
    ? state.participants.find((p) => p.kind === 'DEPENDENT' && p.hostId === host?.id)
    : (host ?? state.participants.find((p) => p.kind === 'GUEST' && p.guestName === name));
  if (!found) throw new Error(`找不到 ${name}`);
  return found.id;
}

/** 攔下座位指令：autoArrange 依 plan 回傳結果；restore 回傳快照裡的位置。回傳送出的指令清單 */
async function fakeArranger(page: Page, plan: Plan) {
  const state = await loadState(page);
  const byId = new Map(state.participants.map((p) => [p.id, p]));
  const sent: { type: string; mode?: string; snapshot?: Snapshot }[] = [];
  await page.route('**/api/seating/operations', async (route) => {
    const body = route.request().postDataJSON() as { type: string; mode?: string; snapshot?: Snapshot };
    sent.push(body);
    const json = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    if (body.type === 'autoArrange') {
      const changes = plan.changes.map((c) => ({ ...c, id: idByName(state, c.name) }));
      const participants = changes.map((c) => ({ ...byId.get(c.id)!, tableId: c.tableId, seatOrder: c.seatOrder }));
      const undo = {
        participants: changes.map((c) => ({ id: c.id, tableId: byId.get(c.id)!.tableId, seatOrder: byId.get(c.id)!.seatOrder })),
        tables: [],
      };
      await json({ participants, tables: [], undo, summary: plan.summary });
      return;
    }
    if (body.type === 'restore' && body.snapshot) {
      const participants = body.snapshot.participants.map((s) => ({ ...byId.get(s.id)!, tableId: s.tableId, seatOrder: s.seatOrder }));
      await json({ participants, tables: [], undo: { participants: [], tables: [] } });
      return;
    }
    await route.continue();
  });
  return sent;
}

/**
 * 第 1 桌「主桌」坐賓1、賓2；第 2 桌坐研發部 8 位；第 3 桌「供應商」沒有人；
 * 未入座：業1–業3（業務部）、外部貴賓賓4、工作甲的眷屬；工作甲是工作人員。
 * → 「只排未入座的 4 位」（業1–業3 與工作甲_眷屬）、「有備註名稱的 2 桌」。
 */
async function seedArrangeable() {
  await seed(async (s) => {
    await s.noteName(1, '主桌');
    await s.guest('賓1', { tableId: 1 });
    await s.guest('賓2', { tableId: 1 });
    await s.fill(2, 8, { department: '研發部', prefix: '研' });
    await s.noteName(3, '供應商');
    for (const name of ['業1', '業2', '業3']) await s.employee(name, { department: '業務部' });
    await s.guest('賓4');
    const staff = await s.staff('工作甲');
    await s.dependent(staff);
  });
}

async function openDialog(page: Page) {
  await showMap(page);
  await toolbarButton(page, '自動排座').click();
  const dialog = page.getByRole('dialog', { name: '自動排座', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

const PLAN_FOUR: Plan = {
  changes: [
    { name: '業1', tableId: 2, seatOrder: 8 },
    { name: '業2', tableId: 2, seatOrder: 9 },
    { name: '業3', tableId: 4, seatOrder: 0 },
    { name: '工作甲_眷屬', tableId: 4, seatOrder: 1 },
  ],
  summary: { placed: 4, tableIds: [2, 4], left: 0 },
};

test.describe('入口與範圍對話框（auto-arrange.md 2.1、2.2、ARR-R15）', () => {
  test('工具列的「自動排座」開啟對話框：標題、說明、兩個單選項與按鈕；有未入座的員工與眷屬時預設「只排未入座」（ARR-Q04）', async ({ page }) => {
    await seedArrangeable();
    await openSeating(page);
    const dialog = await openDialog(page);

    await expect(dialog).toContainText(DESCRIPTION);
    const unseatedOnly = dialog.getByRole('radio', { name: /^只排未入座的 4 位/ });
    const rebuild = dialog.getByRole('radio', { name: '清空後重排（有備註名稱的 2 桌不動）' });
    await expect(unseatedOnly).toBeEnabled();
    await expect(unseatedOnly).toBeChecked();
    await expect(rebuild).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: '開始排座' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '取消' })).toBeVisible();
  });

  test('沒有未入座的員工與眷屬：第一個選項「只排未入座的 0 位」停用並標示「沒有未入座的員工與眷屬」，「清空後重排」可以選且預設選取（ARR-AC16、ARR-Q04）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.fill(2, 3);
      await s.staff('工作甲');
      await s.guest('賓4');
    });
    await openSeating(page);
    const dialog = await openDialog(page);
    const unseatedOnly = dialog.getByRole('radio', { name: /^只排未入座的 0 位/ });
    await expect(unseatedOnly).toBeDisabled();
    await expect(dialog).toContainText('沒有未入座的員工與眷屬');
    const rebuild = dialog.getByRole('radio', { name: '清空後重排（有備註名稱的 0 桌不動）' });
    await expect(rebuild).toBeEnabled();
    await expect(rebuild).toBeChecked();
  });

  test('按「取消」：對話框關閉，座位都不變，不顯示 Sonner，也不送出指令（ARR-AC17）', async ({ page }) => {
    await seedArrangeable();
    await openSeating(page);
    const sent = await fakeArranger(page, PLAN_FOUR);
    const dialog = await openDialog(page);
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(300);
    await expectNoToast(page);
    expect(sent).toEqual([]);
    expect(await rosterNames(2)).toHaveLength(8);
  });
});

test.describe('開始排座與結果提示（ARR-R13、ARR-R14）', () => {
  test('按「開始排座」：關閉對話框、送出「只排未入座」、直接套用；Sonner「已把 4 位安排到第 2–4 桌。」帶「復原」；按「復原」一次回到排座前（ARR-R13、ARR-R14、SEAT-R76、SEAT-R78）', async ({
    page,
  }) => {
    await seedArrangeable();
    await openSeating(page);
    await expectStats(page, { seated: 10, total: 15, unseated: 5, empty: 290, full: 0 });
    const sent = await fakeArranger(page, PLAN_FOUR);

    const dialog = await openDialog(page);
    await dialog.getByRole('button', { name: '開始排座' }).click();
    await expect(dialog).toBeHidden();
    await expectToast(page, '已把 4 位安排到第 2–4 桌。', { undo: true });
    expect(sent[0]).toEqual({ type: 'autoArrange', mode: 'unseatedOnly' });
    await expect(mapTable(page, 2)).toContainText('已滿');
    await expect(mapTable(page, 4)).toContainText('2/10');
    await expectStats(page, { seated: 14, total: 15, unseated: 1, empty: 286, full: 1 });

    await clickUndo(page, '已把 4 位安排到第 2–4 桌。');
    await expectToast(page, '已復原。', { undo: false });
    const restore = sent.find((s) => s.type === 'restore');
    expect(restore?.snapshot?.participants).toHaveLength(4);
    for (const p of restore?.snapshot?.participants ?? []) expect(p).toMatchObject({ tableId: null, seatOrder: null });
    await expect(mapTable(page, 4)).toContainText('0/10');
    await expectStats(page, { seated: 10, total: 15, unseated: 5, empty: 290, full: 0 });
  });

  test('選「清空後重排」再按「開始排座」：送出 rebuild 範圍（auto-arrange.md 2.2）', async ({ page }) => {
    await seedArrangeable();
    await openSeating(page);
    const sent = await fakeArranger(page, PLAN_FOUR);
    const dialog = await openDialog(page);
    await dialog.getByRole('radio', { name: '清空後重排（有備註名稱的 2 桌不動）' }).check();
    await dialog.getByRole('button', { name: '開始排座' }).click();
    await expectToast(page, '已把 4 位安排到第 2–4 桌。', { undo: true });
    expect(sent[0]).toEqual({ type: 'autoArrange', mode: 'rebuild' });
  });

  test('有人排不下：Sonner「已把 {n} 位安排到第 {a}–{b} 桌，還有 {m} 位排不下，留在未入座。」帶「復原」（ARR-R14）', async ({ page }) => {
    await seedArrangeable();
    await openSeating(page);
    await fakeArranger(page, {
      changes: [
        { name: '業1', tableId: 29, seatOrder: 0 },
        { name: '業2', tableId: 29, seatOrder: 1 },
        { name: '業3', tableId: 30, seatOrder: 0 },
      ],
      summary: { placed: 3, tableIds: [29, 30], left: 1 },
    });
    const dialog = await openDialog(page);
    await dialog.getByRole('button', { name: '開始排座' }).click();
    await expectToast(page, '已把 3 位安排到第 29–30 桌，還有 1 位排不下，留在未入座。', { undo: true });
  });

  test('只排進一桌：Sonner「已把 {n} 位安排到第 {a} 桌。」（ARR-Q03 的目前假設）', async ({ page }) => {
    await seedArrangeable();
    await openSeating(page);
    await fakeArranger(page, {
      changes: [
        { name: '業1', tableId: 2, seatOrder: 8 },
        { name: '業2', tableId: 2, seatOrder: 9 },
      ],
      summary: { placed: 2, tableIds: [2], left: 0 },
    });
    const dialog = await openDialog(page);
    await dialog.getByRole('button', { name: '開始排座' }).click();
    await expectToast(page, '已把 2 位安排到第 2 桌。', { undo: true });
  });

  test('一位都沒排進去：座位都不變，警告 Sonner「沒有可以排的員工與眷屬。」不帶「復原」（ARR-Q02 的目前假設、ARR-AC14）', async ({ page }) => {
    await seedArrangeable();
    await openSeating(page);
    await fakeArranger(page, { changes: [], summary: { placed: 0, tableIds: [], left: 4 } });
    const dialog = await openDialog(page);
    await dialog.getByRole('button', { name: '開始排座' }).click();
    await expectToast(page, '沒有可以排的員工與眷屬。', { undo: false });
    await expectStats(page, { seated: 10, total: 15, unseated: 5, empty: 290, full: 0 });
  });
});

test.describe('手機（auto-arrange.md 2.4、ARR-AC18）', () => {
  test('座位圖分頁也有「自動排座」，開同一個對話框；按鈕滿版堆疊、「開始排座」在上；排完的提示與桌面相同', async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機版面');
    await seedArrangeable();
    await openSeating(page);
    await fakeArranger(page, PLAN_FOUR);
    const dialog = await openDialog(page);

    const start = await dialog.getByRole('button', { name: '開始排座' }).boundingBox();
    const cancel = await dialog.getByRole('button', { name: '取消' }).boundingBox();
    if (!start || !cancel) throw new Error('量不到按鈕');
    expect(start.y + start.height).toBeLessThanOrEqual(cancel.y + 1);
    expect(Math.abs(start.width - cancel.width)).toBeLessThanOrEqual(1);

    await dialog.getByRole('button', { name: '開始排座' }).click();
    await expectToast(page, '已把 4 位安排到第 2–4 桌。', { undo: true });
  });
});
