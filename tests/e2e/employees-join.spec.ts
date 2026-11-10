// 員工名單頁接上參與人員（階段 3，docs/plan/implementation-plan.md 第 5.2 節「員工名單的加入尾牙」）：
// - 單筆「加入尾牙」開啟參與人員的新增人員對話框（PersonDialog，join 模式），真的寫進資料庫：
//   docs/spec/employees.md EMP-R28、EMP-R23、EMP-AC33、EMP-AC35；participants.md 第 2.4 節、PPL-R45、PPL-R46、PPL-R53、
//   PPL-R56、PPL-R57、PPL-R61、PPL-R62、PPL-AC58、PPL-AC59；待確認 PPL-Q12（加入尾牙並同時加眷屬時用「已把 {姓名} 加入尾牙。」）。
// - 一次加入多位與取消報名走真的伺服器（POST /api/participants/bulk-join、DELETE /api/participants/{id}），確認資料庫真的改變：
//   EMP-R22～R24、EMP-R30、EMP-R31、EMP-AC30、EMP-AC32、EMP-AC36、EMP-AC77（按下確認之後）；PPL-R63、PPL-AC60。
//   EMP-AC31、EMP-AC37（按「取消」「返回」不改變資料庫）在 employees-list.spec.ts 已經用資料庫確認；
//   A 線用假 fetch 的元件測試（tests/unit/components/employees-page.test.tsx）保留不動。
// - 「查看參與資料」開到 /people?employee={員工 id}，參與人員頁顯示這位員工：EMP-R29、EMP-AC38；
//   待確認 EMP-Q07、PPL-Q19 照原型：以這位員工的姓名帶入搜尋框。
// 資料用 tests/e2e/helpers/employees-db.ts 直接寫進測試資料庫，都是虛構資料。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import {
  closeDb,
  insertDependent,
  insertEmployee,
  insertEmployees,
  numbered,
  participantRows,
  registerEmployee,
  resetData,
  seatedCount,
  type ParticipantRow,
} from './helpers/employees-db';
import {
  CONFLICT_TOAST,
  boxOf,
  bulkButton,
  cellOf,
  expectNoUndo,
  expectToast,
  gotoEmployees,
  openRowMenu,
  pickBox,
  rowOf,
  tabCount,
  tabOf,
  takenBox,
} from './helpers/employees-page';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import {
  checkbox,
  chooseOption,
  gotoPeople,
  isLocked,
  personRow,
  searchBox as peopleSearchBox,
  selectField,
  shownValue,
} from './helpers/participants-page';

test.beforeEach(async ({ context, baseURL }) => {
  await resetData();
  await signIn(context, requireBaseURL(baseURL));
});

test.afterAll(async () => {
  await resetData();
  await closeDb();
});

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面版面；手機另外測');

/** 報名狀態：桌面看「報名狀態」欄，手機看卡片上的徽章 */
async function expectStatus(page: Page, name: string, status: '已報名' | '未報名') {
  const row = rowOf(page, name);
  if (isMobileWidth(page)) await expect(row.getByText(status, { exact: true })).toBeVisible();
  else await expect(cellOf(row, 'status')).toHaveText(status);
}

/** 列操作的「加入尾牙」開啟新增人員對話框（EMP-R28） */
async function openJoinDialog(page: Page, name: string): Promise<Locator> {
  const menu = await openRowMenu(page, rowOf(page, name));
  await menu.getByRole('menuitem', { name: '加入尾牙', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新增人員' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const joinButton = (dialog: Locator) => dialog.getByRole('button', { name: '加入尾牙', exact: true });

/** 某位員工的報名（類別為員工的參與人員） */
const registrationOf = (rows: readonly ParticipantRow[], employeeId: number) =>
  rows.filter((p) => p.kind === 'EMPLOYEE' && p.employeeId === employeeId);
const dependentsOf = (rows: readonly ParticipantRow[], hostId: number) =>
  rows.filter((p) => p.kind === 'DEPENDENT' && p.hostId === hostId);

test.describe('單筆「加入尾牙」開啟新增人員對話框（EMP-R28、PPL-R61、PPL-R62）', () => {
  test('EMP-AC35、PPL-AC58：類別固定為員工、員工帶入王小明且不能改，主要按鈕「加入尾牙」；勾「同時加一位眷屬」並加入 → 資料庫多了王小明與王小明_眷屬（未入座）；員工名單顯示「已報名」；Sonner「已把 王小明 加入尾牙。」沒有「復原」；參與人員頁看得到兩人', async ({
    page,
  }) => {
    const [wang, li] = await insertEmployees([
      { name: '王小明', department: '業務部', extension: '1234' },
      { name: '李小華', department: '研發部' },
    ]);
    await registerEmployee(li!);
    await gotoEmployees(page);

    const dialog = await openJoinDialog(page, '王小明');
    // 第 2.4 節：標題仍是「新增人員」；類別固定為「員工」且停用；員工欄位帶入這一位且停用
    const kind = selectField(dialog, '類別');
    await expect(kind).toContainText('員工');
    expect(await isLocked(kind)).toBe(true);
    const employee = dialog.getByLabel(/^員工\*?$/).first();
    expect(await shownValue(employee)).toContain('王小明（業務部・分機 1234）');
    expect(await isLocked(employee)).toBe(true);
    await expect(joinButton(dialog)).toBeVisible();
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '新增人員', exact: true })).toHaveCount(0);

    await checkbox(dialog, '同時加一位眷屬').check();
    await joinButton(dialog).click();

    await expect(dialog).toBeHidden();
    await expectToast(page, '已把 王小明 加入尾牙。');
    await expectNoUndo(page);
    await expectStatus(page, '王小明', '已報名');
    await expect(takenBox(page, '王小明')).toBeDisabled();

    await expect.poll(async () => registrationOf(await participantRows(), wang!).length).toBe(1);
    const rows = await participantRows();
    const [host] = registrationOf(rows, wang!);
    expect(host).toMatchObject({ tableId: null, seatOrder: null });
    expect(dependentsOf(rows, host!.id)).toEqual([expect.objectContaining({ tableId: null, seatOrder: null })]);

    // 重新整理後仍是已報名（COM-R05）
    await page.reload();
    await expectStatus(page, '王小明', '已報名');

    await gotoPeople(page);
    await expect(personRow(page, '王小明')).toHaveCount(1);
    await expect(personRow(page, '王小明_眷屬')).toHaveCount(1);
  });

  test('只加員工本人：資料庫只多一位員工、沒有眷屬；Tabs 人數跟著變（EMP-R08、PPL-R62）', async ({ page }) => {
    desktopOnly(page);
    const [wang] = await insertEmployees([
      { name: '王小明', department: '業務部' },
      { name: '李小華', department: '研發部' },
    ]);
    await gotoEmployees(page);
    await expect(tabOf(page, '未報名')).toHaveText(tabCount('未報名', 2));

    await joinButton(await openJoinDialog(page, '王小明')).click();

    await expectToast(page, '已把 王小明 加入尾牙。');
    await expect(tabOf(page, '全部')).toHaveText(tabCount('全部', 2));
    await expect(tabOf(page, '未報名')).toHaveText(tabCount('未報名', 1));
    await expect(tabOf(page, '已報名')).toHaveText(tabCount('已報名', 1));
    await expect.poll(async () => (await participantRows()).length).toBe(1);
    expect(registrationOf(await participantRows(), wang!)).toEqual([
      expect.objectContaining({ kind: 'EMPLOYEE', tableId: null, seatOrder: null }),
    ]);
    // 已報名的員工：列操作換成「查看參與資料」「取消報名」，沒有「加入尾牙」（EMP-R27）
    const menu = await openRowMenu(page, rowOf(page, '王小明'));
    await expect(menu.getByRole('menuitem', { name: '查看參與資料' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: '加入尾牙', exact: true })).toHaveCount(0);
  });

  test('PPL-AC59：第 3 桌剩 5 位，勾「同時加一位眷屬」、桌次選第 3 桌 → 陳大文與陳大文_眷屬都新增，都在第 3 桌、排在原本的人後面（PPL-R46、PPL-R56、PPL-R57）', async ({
    page,
  }) => {
    desktopOnly(page);
    const ids = await insertEmployees([...numbered(5, '三桌員工', '業務部'), { name: '陳大文', department: '研發一部' }]);
    const chen = ids[5]!;
    for (const [i, id] of ids.slice(0, 5).entries()) await registerEmployee(id, { tableId: 3, seatOrder: i });
    await gotoEmployees(page);

    const dialog = await openJoinDialog(page, '陳大文');
    await checkbox(dialog, '同時加一位眷屬').check();
    await chooseOption(page, selectField(dialog, '桌次'), /^第 3 桌（剩 5 位）/);
    await joinButton(dialog).click();

    await expect(dialog).toBeHidden();
    await expectToast(page, '已把 陳大文 加入尾牙。');
    await expect.poll(() => seatedCount(3)).toBe(7);
    const rows = await participantRows();
    const [host] = registrationOf(rows, chen);
    expect(host).toMatchObject({ tableId: 3, seatOrder: 5 });
    expect(dependentsOf(rows, host!.id)).toEqual([expect.objectContaining({ tableId: 3, seatOrder: 6 })]);
  });

  test('第 3 桌只剩 1 位：陳大文入座、眷屬留在未入座，Sonner「第 3 桌只剩 1 位，陳大文_眷屬先留在未入座。」（PPL-R57）', async ({ page }) => {
    desktopOnly(page);
    const ids = await insertEmployees([...numbered(9, '三桌員工', '業務部'), { name: '陳大文', department: '研發一部' }]);
    const chen = ids[9]!;
    for (const [i, id] of ids.slice(0, 9).entries()) await registerEmployee(id, { tableId: 3, seatOrder: i });
    await gotoEmployees(page);

    const dialog = await openJoinDialog(page, '陳大文');
    await checkbox(dialog, '同時加一位眷屬').check();
    await chooseOption(page, selectField(dialog, '桌次'), /^第 3 桌（剩 1 位）/);
    await joinButton(dialog).click();

    await expectToast(page, '第 3 桌只剩 1 位，陳大文_眷屬先留在未入座。');
    await expect.poll(() => seatedCount(3)).toBe(10);
    const rows = await participantRows();
    const [host] = registrationOf(rows, chen);
    expect(host).toMatchObject({ tableId: 3 });
    expect(dependentsOf(rows, host!.id)).toEqual([expect.objectContaining({ tableId: null })]);
  });

  test('勾「工作人員」：桌次欄位隱藏；加入後放在工作人員桌（PPL-R53）', async ({ page }) => {
    desktopOnly(page);
    const [wang] = await insertEmployees([{ name: '王小明', department: '業務部' }]);
    await gotoEmployees(page);

    const dialog = await openJoinDialog(page, '王小明');
    await checkbox(dialog, '工作人員').check();
    await expect(selectField(dialog, '桌次')).toHaveCount(0);
    await joinButton(dialog).click();

    await expectToast(page, '已把 王小明 加入尾牙。');
    await expect.poll(async () => registrationOf(await participantRows(), wang!)[0]?.tableId).toBe(0);
  });

  test('按「取消」：對話框關閉，沒有加入任何人，仍是未報名（PPL-R60）', async ({ page }) => {
    await insertEmployees([{ name: '王小明', department: '業務部' }]);
    await gotoEmployees(page);

    const dialog = await openJoinDialog(page, '王小明');
    await checkbox(dialog, '同時加一位眷屬').check();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expectStatus(page, '王小明', '未報名');
    expect(await participantRows()).toEqual([]);
  });

  test('對話框開著時，這位員工被別人加入尾牙：不新增，員工欄位顯示「王小明 已經報名了。」；資料庫只有一筆報名（PPL-R45、COM-R07）', async ({
    page,
  }) => {
    desktopOnly(page);
    const [wang] = await insertEmployees([{ name: '王小明', department: '業務部' }]);
    await gotoEmployees(page);

    const dialog = await openJoinDialog(page, '王小明');
    await registerEmployee(wang!); // 另一個人在這時加入
    await joinButton(dialog).click();

    await expect(dialog.getByText('王小明 已經報名了。', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('已把 王小明 加入尾牙。', { exact: true })).toHaveCount(0);
    expect(registrationOf(await participantRows(), wang!)).toHaveLength(1);
  });

  test('EMP-AC33、EMP-R23：已勾選王小明與張三 → 王小明經單筆「加入尾牙」完成 → 他的勾選消失、勾選框停用；批次按鈕變成「加入尾牙（1 位）」；張三也加入後批次按鈕消失', async ({
    page,
  }) => {
    await insertEmployees([
      { name: '王小明', department: '業務部' },
      { name: '張三', department: '研發部' },
      { name: '李小華', department: '研發部' },
    ]);
    await gotoEmployees(page);
    await pickBox(page, '王小明').click();
    await pickBox(page, '張三').click();
    await expect(bulkButton(page, 2)).toBeVisible();

    await joinButton(await openJoinDialog(page, '王小明')).click();
    await expectToast(page, '已把 王小明 加入尾牙。');

    await expect(takenBox(page, '王小明')).toBeDisabled();
    await expect(takenBox(page, '王小明')).not.toBeChecked();
    await expect(pickBox(page, '張三')).toBeChecked();
    await expect(bulkButton(page, 1)).toBeVisible();

    await joinButton(await openJoinDialog(page, '張三')).click();
    await expectToast(page, '已把 張三 加入尾牙。');
    await expect(bulkButton(page)).toHaveCount(0);
    await expect(pickBox(page, '李小華')).not.toBeChecked();
  });
});

test.describe('一次加入多位走真的伺服器（EMP-R22～R24、PPL-R63）', () => {
  test('EMP-AC30、PPL-AC60：勾 3 位按「加入尾牙（3 位）」並確認 → 資料庫多了這 3 位員工、沒有眷屬、都未入座；3 列變成「已報名」且勾選框停用；Tabs 更新；Sonner「已把 3 位員工加入尾牙。」沒有「復原」；批次按鈕消失', async ({
    page,
  }) => {
    const ids = await insertEmployees(numbered(4));
    await gotoEmployees(page);
    for (const name of ['員工01', '員工02', '員工04']) await pickBox(page, name).click();
    await bulkButton(page, 3).click();
    const dialog = page.getByRole('alertdialog', { name: '要把 3 位員工加入尾牙嗎？' });
    await dialog.getByRole('button', { name: '加入尾牙', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expectToast(page, '已把 3 位員工加入尾牙。');
    await expectNoUndo(page);
    await expect(bulkButton(page)).toHaveCount(0);
    for (const name of ['員工01', '員工02', '員工04']) {
      await expectStatus(page, name, '已報名');
      await expect(takenBox(page, name)).toBeDisabled();
    }
    await expectStatus(page, '員工03', '未報名');
    await expect(tabOf(page, '未報名')).toHaveText(tabCount('未報名', 1));
    await expect(tabOf(page, '已報名')).toHaveText(tabCount('已報名', 3));

    await expect.poll(async () => (await participantRows()).length).toBe(3);
    const rows = await participantRows();
    expect(rows.map((p) => p.employeeId).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([ids[0], ids[1], ids[3]]);
    for (const p of rows) expect(p).toMatchObject({ kind: 'EMPLOYEE', tableId: null, seatOrder: null });

    await page.reload();
    await expectStatus(page, '員工02', '已報名');

    await gotoPeople(page);
    for (const name of ['員工01', '員工02', '員工04']) {
      await expect(personRow(page, name)).toHaveCount(1);
      await expect(personRow(page, name)).toContainText('未入座');
    }
    await expect(personRow(page, '員工03')).toHaveCount(0);
  });

  test('EMP-AC32：勾選王小明與李小華，李小華先被別人加入尾牙 → 整批不儲存，重新載入並顯示「資料已被其他人更新，已重新載入。」；王小明仍是未報名（EMP-R24、COM-R07、COM-R08）', async ({
    page,
  }) => {
    desktopOnly(page);
    const [wang, li] = await insertEmployees([
      { name: '王小明', department: '業務部' },
      { name: '李小華', department: '研發部' },
    ]);
    await gotoEmployees(page);
    await pickBox(page, '王小明').click();
    await pickBox(page, '李小華').click();

    await registerEmployee(li!); // 另一台電腦先把李小華加入尾牙
    await bulkButton(page, 2).click();
    await page
      .getByRole('alertdialog', { name: '要把 2 位員工加入尾牙嗎？' })
      .getByRole('button', { name: '加入尾牙', exact: true })
      .click();

    await expectToast(page, CONFLICT_TOAST);
    await expect(page.getByText('已把 2 位員工加入尾牙。', { exact: true })).toHaveCount(0);
    // 重新載入後看到別人的改動：李小華已報名；王小明沒有被加入
    await expectStatus(page, '李小華', '已報名');
    await expectStatus(page, '王小明', '未報名');
    const rows = await participantRows();
    expect(registrationOf(rows, wang!)).toEqual([]);
    expect(registrationOf(rows, li!)).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });

  test('EMP-AC77：375 px，勾選 2 張未報名的卡片並確認 → 資料庫多了這 2 位、卡片變成「已報名」、勾選框停用（EMP-R26、EMP-R22）', async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機寬度');
    await page.setViewportSize({ width: 375, height: 800 });
    const [wang, , zhang] = await insertEmployees([
      { name: '王小明', department: '業務部' },
      { name: '李小華', department: '研發部' },
      { name: '張三', department: '研發部' },
    ]);
    await gotoEmployees(page);
    await pickBox(page, '王小明').click();
    await pickBox(page, '張三').click();
    await bulkButton(page, 2).click();
    await page
      .getByRole('alertdialog', { name: '要把 2 位員工加入尾牙嗎？' })
      .getByRole('button', { name: '加入尾牙', exact: true })
      .click();

    await expectToast(page, '已把 2 位員工加入尾牙。');
    for (const name of ['王小明', '張三']) {
      await expectStatus(page, name, '已報名');
      await expect(takenBox(page, name)).toBeDisabled();
    }
    await expect.poll(async () => (await participantRows()).map((p) => p.employeeId).sort()).toEqual([wang, zhang].sort());
  });
});

test.describe('取消報名走真的伺服器（EMP-R30、EMP-R31）', () => {
  test('EMP-AC36：李小華帶眷屬坐第 5 桌 → 確認取消報名 → 資料庫移除李小華與眷屬，第 5 桌空出 2 個位子；李小華仍在員工名單、顯示「未報名」；Sonner「已取消 李小華 的報名。」沒有「復原」；之後可以再加入', async ({
    page,
  }) => {
    const li = await insertEmployee({ name: '李小華', department: '研發部' });
    const zhang = await insertEmployee({ name: '張三', department: '研發部' });
    const pLi = await registerEmployee(li, { tableId: 5, seatOrder: 0 });
    await insertDependent(pLi, { tableId: 5, seatOrder: 1 });
    await registerEmployee(zhang, { tableId: 5, seatOrder: 2 });
    await gotoEmployees(page);

    const menu = await openRowMenu(page, rowOf(page, '李小華'));
    await menu.getByRole('menuitem', { name: '取消報名' }).click();
    const dialog = page.getByRole('alertdialog', { name: '要取消 李小華 的報名嗎？' });
    await dialog.getByRole('button', { name: '確認取消報名' }).click();

    await expect(dialog).toBeHidden();
    await expectToast(page, '已取消 李小華 的報名。');
    await expectNoUndo(page);
    await expectStatus(page, '李小華', '未報名');
    await expect.poll(() => seatedCount(5)).toBe(1);
    const rows = await participantRows();
    expect(registrationOf(rows, li)).toEqual([]);
    expect(dependentsOf(rows, pLi)).toEqual([]);
    // 同桌其他人往前補（SEAT-R06）
    expect(registrationOf(rows, zhang)).toEqual([expect.objectContaining({ tableId: 5, seatOrder: 0 })]);

    await page.reload();
    await expectStatus(page, '李小華', '未報名');
    const again = await openRowMenu(page, rowOf(page, '李小華'));
    await expect(again.getByRole('menuitem', { name: '加入尾牙', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    await gotoPeople(page);
    await expect(personRow(page, '李小華')).toHaveCount(0);
    await expect(personRow(page, '李小華_眷屬')).toHaveCount(0);
    await expect(personRow(page, '張三')).toHaveCount(1);
  });
});

test.describe('查看參與資料（EMP-R29、EMP-Q07）', () => {
  test('EMP-AC38：李小華已報名、帶眷屬 →「查看參與資料」→ 開啟 /people?employee={id}，搜尋框帶入「李小華」，看得到李小華與眷屬，不列其他人', async ({
    page,
  }) => {
    const [wang, li] = await insertEmployees([
      { name: '王小明', department: '業務部' },
      { name: '李小華', department: '研發部', extension: '2001' },
    ]);
    await registerEmployee(wang!);
    const pLi = await registerEmployee(li!, { tableId: 5, seatOrder: 0 });
    await insertDependent(pLi);
    await gotoEmployees(page);

    const menu = await openRowMenu(page, rowOf(page, '李小華'));
    await menu.getByRole('menuitem', { name: '查看參與資料' }).click();

    await expect(page).toHaveURL((url) => url.pathname === '/people' && url.searchParams.get('employee') === String(li));
    await expect(page.getByRole('heading', { level: 1, name: '參與人員' })).toBeVisible();
    await expect(peopleSearchBox(page)).toHaveValue('李小華');
    await expect(personRow(page, '李小華')).toHaveCount(1);
    await expect(personRow(page, '李小華')).toContainText('第 5 桌');
    await expect(personRow(page, '李小華_眷屬')).toHaveCount(1);
    await expect(personRow(page, '王小明')).toHaveCount(0);
  });

  test('清空搜尋框後列出全部參與人員', async ({ page }) => {
    desktopOnly(page);
    const [wang, li] = await insertEmployees([
      { name: '王小明', department: '業務部' },
      { name: '李小華', department: '研發部' },
    ]);
    await registerEmployee(wang!);
    await registerEmployee(li!);
    await gotoPeople(page, `/people?employee=${li}`);
    await expect(peopleSearchBox(page)).toHaveValue('李小華');
    await peopleSearchBox(page).fill('');
    await expect(personRow(page, '王小明')).toHaveCount(1);
    await expect(personRow(page, '李小華')).toHaveCount(1);
  });
});

test.describe('版面', () => {
  test('單筆加入的對話框在手機上：按鈕滿版堆疊，「加入尾牙」在最上面（README 第 9 節、PPL-R77）', async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機寬度');
    await insertEmployees([{ name: '王小明', department: '業務部' }]);
    await gotoEmployees(page);
    const dialog = await openJoinDialog(page, '王小明');
    const join = await boxOf(joinButton(dialog));
    const cancel = await boxOf(dialog.getByRole('button', { name: '取消', exact: true }));
    expect(join.y + join.height).toBeLessThanOrEqual(cancel.y + 1);
    expect(Math.abs(join.width - cancel.width)).toBeLessThanOrEqual(1);
  });
});
