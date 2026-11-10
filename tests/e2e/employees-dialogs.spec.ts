// 新增、編輯、刪除員工：docs/spec/employees.md 第 2.4、2.5 節，EMP-R31～R43，驗收條件 EMP-AC39～AC48、AC51～AC56，
// 第 4.2 節文案；README 第 9 節（欄位錯誤：離開欄位時驗證、送出時顯示全部錯誤並聚焦第一個）、COM-R07～R09；
// 待確認 EMP-Q06（辦公室不顯示、不能編輯，但編輯時保留）、Q08 第 8 點、Q10（部門欄位用原型的文案）依 D-008。
// 參與人員與座位圖跟著變（EMP-AC49、AC50）的資料面在 tests/integration/api/employees.test.ts，畫面在階段 3 測。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import {
  closeDb,
  deleteEmployeeRow,
  employeeRows,
  insertDependent,
  insertEmployee,
  insertEmployees,
  participantRows,
  registerEmployee,
  resetData,
  seatedCount,
} from './helpers/employees-db';
import {
  CONFLICT_TOAST,
  backgroundOf,
  boxOf,
  cellOf,
  cssVarBackground,
  choose,
  chooseNew,
  dataRows,
  expectNoUndo,
  expectToast,
  filterTrigger,
  gotoEmployees,
  openRowMenu,
  optionsOf,
  pageButton,
  rowOf,
} from './helpers/employees-page';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';

test.beforeEach(async ({ context, baseURL }) => {
  await resetData();
  await signIn(context, requireBaseURL(baseURL));
});

test.afterAll(async () => {
  await resetData();
  await closeDb();
});

const field = {
  name: (d: Locator) => d.getByRole('textbox', { name: '姓名', exact: true }),
  englishName: (d: Locator) => d.getByRole('textbox', { name: '英文名', exact: true }),
  department: (d: Locator) => d.getByRole('combobox', { name: '部門', exact: true }),
  team: (d: Locator) => d.getByRole('combobox', { name: '組別', exact: true }),
  extension: (d: Locator) => d.getByRole('textbox', { name: '分機', exact: true }),
  region: (d: Locator) => d.getByRole('combobox', { name: '地區', exact: true }),
  note: (d: Locator) => d.getByRole('textbox', { name: '備註', exact: true }),
};

async function openAddDialog(page: Page): Promise<Locator> {
  await pageButton(page, '新增員工').click();
  const dialog = page.getByRole('dialog', { name: '新增員工' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openEditDialog(page: Page, row: Locator): Promise<Locator> {
  const menu = await openRowMenu(page, row);
  await menu.getByRole('menuitem', { name: '編輯' }).click();
  const dialog = page.getByRole('dialog', { name: '編輯員工' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openDeleteDialog(page: Page, row: Locator, name: string): Promise<Locator> {
  const menu = await openRowMenu(page, row);
  await menu.getByRole('menuitem', { name: '刪除' }).click();
  const dialog = page.getByRole('alertdialog', { name: `要刪除 ${name} 嗎？` });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** 研發部（韌體組、軟體組）、業務部（北區組），地區台北、台中 */
async function seedTeams() {
  return insertEmployees([
    { name: '研發甲', department: '研發部', team: '韌體組', region: '台北' },
    { name: '研發乙', department: '研發部', team: '軟體組', region: '台中' },
    { name: '業務甲', department: '業務部', team: '北區組', region: '台北' },
  ]);
}

test.describe('新增員工對話框（EMP-R32～R38、2.5）', () => {
  test('欄位依序為姓名、英文名、部門、組別、分機、地區、備註，提示文字與按鈕；沒有辦公室（2.5、第 4.2 節、EMP-Q06、EMP-Q10）', async ({ page }) => {
    await seedTeams();
    await gotoEmployees(page);
    const dialog = await openAddDialog(page);

    const order = [field.name, field.englishName, field.department, field.team, field.extension, field.region, field.note];
    let lastY = -1;
    for (const f of order) {
      const box = await boxOf(f(dialog));
      expect(box.y).toBeGreaterThan(lastY);
      lastY = box.y;
    }

    await expect(field.name(dialog)).toHaveValue('');
    await expect(field.englishName(dialog)).toHaveAttribute('placeholder', '例如 Tony');
    await expect(field.extension(dialog)).toHaveAttribute('placeholder', '例如 1234');
    await expect(field.note(dialog)).toHaveAttribute('placeholder', '只給承辦人看');
    await expect(field.department(dialog)).toHaveText('選擇部門');
    await expect(dialog.getByText('選擇既有部門，或輸入新的部門名稱')).toBeVisible();
    await expect(field.team(dialog)).toHaveText('選擇或輸入組別');
    await expect(field.region(dialog)).toHaveText('選擇或輸入地區');
    await expect(dialog.getByText('辦公室')).toHaveCount(0);

    await expect(dialog.getByRole('button', { name: '新增員工', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeVisible();
  });

  test('EMP-AC39：姓名填「張三」、部門選「研發部」→ 對話框關閉，名單出現張三、「未報名」；Sonner「已新增 張三。」沒有「復原」（EMP-R32、R38、R31）', async ({
    page,
  }) => {
    await seedTeams();
    await gotoEmployees(page);
    const dialog = await openAddDialog(page);

    await field.name(dialog).fill('張三');
    await choose(page, field.department(dialog), '研發部');
    await dialog.getByRole('button', { name: '新增員工', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expectToast(page, '已新增 張三。');
    await expectNoUndo(page);
    await expect(cellOf(rowOf(page, '張三'), 'status')).toHaveText('未報名');
    await expect(cellOf(rowOf(page, '張三'), 'department')).toHaveText('研發部');
    await expect.poll(async () => (await employeeRows()).filter((e) => e.name === '張三').map((e) => e.department)).toEqual(['研發部']);
    expect(await participantRows()).toEqual([]);
  });

  test('填好全部欄位新增：每個欄位都存下來', async ({ page }) => {
    await seedTeams();
    await gotoEmployees(page);
    const dialog = await openAddDialog(page);

    await field.name(dialog).fill('王小明');
    await field.englishName(dialog).fill('Xiaoming');
    await choose(page, field.department(dialog), '業務部');
    await choose(page, field.team(dialog), '北區組');
    await field.extension(dialog).fill('1234');
    await choose(page, field.region(dialog), '台北');
    await field.note(dialog).fill('素食');
    await dialog.getByRole('button', { name: '新增員工', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect
      .poll(async () => (await employeeRows()).find((e) => e.name === '王小明'))
      .toMatchObject({ englishName: 'Xiaoming', department: '業務部', team: '北區組', extension: '1234', region: '台北', note: '素食', office: null });
  });

  test('按「取消」關閉對話框，不新增', async ({ page }) => {
    await seedTeams();
    await gotoEmployees(page);
    const dialog = await openAddDialog(page);
    await field.name(dialog).fill('張三');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(rowOf(page, '張三')).toHaveCount(0);
    expect(await employeeRows()).toHaveLength(3);
  });

  test('EMP-AC40：姓名與部門都空白按「新增員工」→「請輸入姓名。」「請選擇部門。」，焦點移到姓名，不新增（EMP-R33）', async ({ page }) => {
    await seedTeams();
    await gotoEmployees(page);
    const dialog = await openAddDialog(page);

    await dialog.getByRole('button', { name: '新增員工', exact: true }).click();
    await expect(dialog.getByText('請輸入姓名。')).toBeVisible();
    await expect(dialog.getByText('請選擇部門。')).toBeVisible();
    await expect(field.name(dialog)).toBeFocused();
    await expect(dialog).toBeVisible();
    expect(await employeeRows()).toHaveLength(3);

    // 錯誤文字在欄位下方
    const nameBox = await boxOf(field.name(dialog));
    const errorBox = await boxOf(dialog.getByText('請輸入姓名。'));
    expect(errorBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
  });

  test('EMP-AC41：姓名填好、部門空白，離開部門欄 → 部門下方顯示「請選擇部門。」（EMP-R33、README 第 9 節）', async ({ page }) => {
    await seedTeams();
    await gotoEmployees(page);
    const dialog = await openAddDialog(page);

    await field.name(dialog).fill('張三');
    await field.department(dialog).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByText('請選擇部門。')).toBeVisible();
    await expect(dialog.getByText('請輸入姓名。')).toHaveCount(0);
  });

  test('只有空白的姓名算沒填（EMP-Q08 第 8 點）', async ({ page }) => {
    await seedTeams();
    await gotoEmployees(page);
    const dialog = await openAddDialog(page);
    await field.name(dialog).fill('   ');
    await choose(page, field.department(dialog), '研發部');
    await dialog.getByRole('button', { name: '新增員工', exact: true }).click();
    await expect(dialog.getByText('請輸入姓名。')).toBeVisible();
    expect(await employeeRows()).toHaveLength(3);
  });

  test('EMP-AC42：在部門輸入「品保部」並選用 → 新增後部門篩選出現「品保部」（EMP-R34、R04、EMP-Q10）', async ({ page }) => {
    await seedTeams();
    await gotoEmployees(page);
    const dialog = await openAddDialog(page);

    await field.name(dialog).fill('品保新人');
    await chooseNew(page, field.department(dialog), '品保部', '新增部門「品保部」');
    await expect(field.department(dialog)).toHaveText('品保部');
    await dialog.getByRole('button', { name: '新增員工', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectToast(page, '已新增 品保新人。');

    expect(await optionsOf(page, filterTrigger(page, '部門'))).toContain('品保部');
  });

  test('EMP-AC43：部門選研發部 → 組別選項只有韌體組、軟體組；選韌體組後部門改成業務部 → 組別清空，選項換成北區組（EMP-R35）', async ({
    page,
  }) => {
    await seedTeams();
    await gotoEmployees(page);
    const dialog = await openAddDialog(page);

    await choose(page, field.department(dialog), '研發部');
    expect(await optionsOf(page, field.team(dialog))).toEqual(['韌體組', '軟體組']);
    await choose(page, field.team(dialog), '韌體組');
    await expect(field.team(dialog)).toHaveText('韌體組');

    await choose(page, field.department(dialog), '業務部');
    await expect(field.team(dialog)).toHaveText('選擇或輸入組別');
    expect(await optionsOf(page, field.team(dialog))).toEqual(['北區組']);
  });

  test('EMP-AC44：部門研發部、組別輸入「測試組」→「新增組別「測試組」」；儲存後組別是測試組，組別篩選（部門研發部）出現測試組（EMP-R35、R04）', async ({
    page,
  }) => {
    await seedTeams();
    await gotoEmployees(page);
    const dialog = await openAddDialog(page);

    await field.name(dialog).fill('測試新人');
    await choose(page, field.department(dialog), '研發部');
    await chooseNew(page, field.team(dialog), '測試組', '新增組別「測試組」');
    await dialog.getByRole('button', { name: '新增員工', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(async () => (await employeeRows()).find((e) => e.name === '測試新人')?.team).toBe('測試組');
    await expect(cellOf(rowOf(page, '測試新人'), 'team')).toHaveText('測試組');
    await choose(page, filterTrigger(page, '部門'), '研發部');
    expect(await optionsOf(page, filterTrigger(page, '組別'))).toContain('測試組');
  });

  test('EMP-AC45：地區輸入「高雄」→「新增地區「高雄」」；儲存後地區篩選出現高雄（EMP-R36、R04）', async ({ page }) => {
    await seedTeams();
    await gotoEmployees(page);
    const dialog = await openAddDialog(page);

    await field.name(dialog).fill('高雄新人');
    await choose(page, field.department(dialog), '業務部');
    expect(await optionsOf(page, field.region(dialog))).toEqual(expect.arrayContaining(['台北', '台中']));
    await chooseNew(page, field.region(dialog), '高雄', '新增地區「高雄」');
    await dialog.getByRole('button', { name: '新增員工', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(async () => (await employeeRows()).find((e) => e.name === '高雄新人')?.region).toBe('高雄');
    expect(await optionsOf(page, filterTrigger(page, '地區'))).toContain('高雄');
  });

  test('EMP-AC46：已有王小明（業務部）→ 新增時姓名填「王小明」→ 同名提示；部門選研發部仍可新增，名單有兩位王小明（EMP-R37）', async ({
    page,
  }) => {
    await insertEmployees([
      { name: '王小明', department: '業務部', extension: '1234' },
      { name: '研發甲', department: '研發部' },
    ]);
    await gotoEmployees(page);
    const dialog = await openAddDialog(page);

    await field.name(dialog).fill('王小明');
    await field.name(dialog).blur();
    await expect(dialog.getByText('已經有一位 王小明（業務部），請確認不是同一個人。')).toBeVisible();

    await choose(page, field.department(dialog), '研發部');
    await dialog.getByRole('button', { name: '新增員工', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectToast(page, '已新增 王小明。');

    await expect(rowOf(page, '王小明')).toHaveCount(2);
    await expect(rowOf(page, '王小明').filter({ hasText: '業務部' })).toHaveCount(1);
    await expect(rowOf(page, '王小明').filter({ hasText: '研發部' })).toHaveCount(1);
  });

  test('姓名改成不同名後同名提示消失', async ({ page }) => {
    await insertEmployee({ name: '王小明', department: '業務部' });
    await gotoEmployees(page);
    const dialog = await openAddDialog(page);
    await field.name(dialog).fill('王小明');
    await field.name(dialog).blur();
    await expect(dialog.getByText(/^已經有一位 王小明/)).toBeVisible();
    await field.name(dialog).fill('王小華');
    await field.name(dialog).blur();
    await expect(dialog.getByText(/^已經有一位/)).toHaveCount(0);
  });
});

test.describe('編輯員工對話框（EMP-R32、R37～R40）', () => {
  test('EMP-AC47：名單只有一位王小明 → 開啟他的「編輯員工」→ 不顯示同名提示（EMP-R37）', async ({ page }) => {
    await insertEmployee({ name: '王小明', department: '業務部' });
    await gotoEmployees(page);
    const dialog = await openEditDialog(page, rowOf(page, '王小明'));
    await expect(field.name(dialog)).toHaveValue('王小明');
    await field.name(dialog).blur();
    await expect(dialog.getByText(/^已經有一位/)).toHaveCount(0);
  });

  test('EMP-AC48：「編輯員工」帶入目前的資料；分機改成 1300 按「儲存」→ 對話框關閉，分機欄 1300；Sonner「已儲存」沒有「復原」（EMP-R32、R38、R31）', async ({
    page,
  }) => {
    await insertEmployee({
      name: '王小明',
      englishName: 'Xiaoming',
      department: '業務部',
      team: '北區組',
      extension: '1234',
      region: '台北',
      note: '素食',
    });
    await gotoEmployees(page);
    const dialog = await openEditDialog(page, rowOf(page, '王小明'));

    await expect(field.name(dialog)).toHaveValue('王小明');
    await expect(field.englishName(dialog)).toHaveValue('Xiaoming');
    await expect(field.department(dialog)).toHaveText('業務部');
    await expect(field.team(dialog)).toHaveText('北區組');
    await expect(field.extension(dialog)).toHaveValue('1234');
    await expect(field.region(dialog)).toHaveText('台北');
    await expect(field.note(dialog)).toHaveValue('素食');
    await expect(dialog.getByRole('button', { name: '儲存', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeVisible();

    await field.extension(dialog).fill('1300');
    await dialog.getByRole('button', { name: '儲存', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(cellOf(rowOf(page, '王小明'), 'extension')).toHaveText('1300');
    await expectToast(page, '已儲存');
    await expectNoUndo(page);
    await expect.poll(async () => (await employeeRows())[0]?.extension).toBe('1300');
  });

  test('編輯不會清掉匯入時存下的辦公室（EMP-Q06 第 4 點：辦公室有存、畫面不顯示）', async ({ page }) => {
    await insertEmployee({ name: '王小明', department: '業務部', extension: '1234', office: '台北辦公室' });
    await gotoEmployees(page);
    const dialog = await openEditDialog(page, rowOf(page, '王小明'));
    await expect(dialog.getByText('辦公室')).toHaveCount(0);
    await field.extension(dialog).fill('1300');
    await dialog.getByRole('button', { name: '儲存', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await employeeRows())[0]).toMatchObject({ extension: '1300', office: '台北辦公室' });
  });

  test('編輯已報名的員工：報名與座位不變（EMP-R39）', async ({ page }) => {
    const id = await insertEmployee({ name: '王小明', department: '業務部', extension: '1234' });
    const p = await registerEmployee(id, { tableId: 5, seatOrder: 0 });
    await insertDependent(p, { tableId: 5, seatOrder: 1 });
    await gotoEmployees(page);

    const dialog = await openEditDialog(page, rowOf(page, '王小明'));
    await field.name(dialog).fill('王大明');
    await field.extension(dialog).fill('1300');
    await dialog.getByRole('button', { name: '儲存', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(cellOf(rowOf(page, '王大明'), 'status')).toHaveText('已報名');
    await expect.poll(async () => (await employeeRows())[0]).toMatchObject({ name: '王大明', extension: '1300' });
    expect(await seatedCount(5)).toBe(2);
  });

  test('EMP-AC51：甲開著員工名單，乙刪除了王小明 → 甲編輯王小明並儲存 → 不儲存，重新載入，Sonner「資料已被其他人更新，已重新載入。」（EMP-R40、COM-R07、R08）', async ({
    page,
  }) => {
    const wang = await insertEmployee({ name: '王小明', department: '業務部', extension: '1234' });
    await insertEmployee({ name: '李小華', department: '研發部' });
    await gotoEmployees(page);

    const dialog = await openEditDialog(page, rowOf(page, '王小明'));
    await deleteEmployeeRow(wang);
    await field.extension(dialog).fill('1300');
    await dialog.getByRole('button', { name: '儲存', exact: true }).click();

    await expectToast(page, CONFLICT_TOAST);
    await expect(rowOf(page, '王小明')).toHaveCount(0);
    await expect(rowOf(page, '李小華')).toHaveCount(1);
    expect((await employeeRows()).map((e) => e.name)).toEqual(['李小華']);
  });

  test('甲開著員工名單，乙刪除了王小明 → 甲刪除王小明 → 重新載入並顯示提示（EMP-R40）', async ({ page }) => {
    const wang = await insertEmployee({ name: '王小明', department: '業務部' });
    await insertEmployee({ name: '李小華', department: '研發部' });
    await gotoEmployees(page);

    const dialog = await openDeleteDialog(page, rowOf(page, '王小明'), '王小明');
    await deleteEmployeeRow(wang);
    await dialog.getByRole('button', { name: '刪除員工' }).click();
    await expectToast(page, CONFLICT_TOAST);
    await expect(rowOf(page, '王小明')).toHaveCount(0);
    await expect(rowOf(page, '李小華')).toHaveCount(1);
  });
});

test.describe('刪除員工（EMP-R41～R43）', () => {
  test('EMP-AC52：王小明未報名 →「要刪除 王小明 嗎？」「刪除後無法復原。」「刪除員工」「取消」；按「刪除員工」→ 移除，Sonner「已刪除 王小明。」沒有「復原」（EMP-R41、R42、R31）', async ({
    page,
  }) => {
    await insertEmployees([
      { name: '王小明', department: '業務部' },
      { name: '李小華', department: '研發部' },
    ]);
    await gotoEmployees(page);

    const dialog = await openDeleteDialog(page, rowOf(page, '王小明'), '王小明');
    await expect(dialog.getByText('刪除後無法復原。', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '刪除員工', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(rowOf(page, '王小明')).toHaveCount(0);
    await expectToast(page, '已刪除 王小明。');
    await expectNoUndo(page);
    await expect.poll(async () => (await employeeRows()).map((e) => e.name)).toEqual(['李小華']);
  });

  test('EMP-AC53：李小華已報名、帶一位眷屬，兩人坐 B10 桌（內部編號 5，8/10）→ 已報名的內文；按「刪除員工」→ 從員工名單與參與人員移除，眷屬也移除，B10 桌 6/10（EMP-R41、R43）', async ({
    page,
  }) => {
    const ids = await insertEmployees([
      { name: '同桌一', department: '研發部' },
      { name: '李小華', department: '研發部' },
      { name: '同桌二', department: '研發部' },
      { name: '同桌三', department: '研發部' },
      { name: '同桌四', department: '研發部' },
      { name: '同桌五', department: '研發部' },
      { name: '同桌六', department: '研發部' },
    ]);
    let order = 0;
    let liParticipant = 0;
    for (const [i, id] of ids.entries()) {
      const p = await registerEmployee(id, { tableId: 5, seatOrder: order++ });
      if (i === 1) {
        liParticipant = p;
        await insertDependent(p, { tableId: 5, seatOrder: order++ });
      }
    }
    expect(await seatedCount(5)).toBe(8);
    await gotoEmployees(page);

    const dialog = await openDeleteDialog(page, rowOf(page, '李小華'), '李小華');
    await expect(
      dialog.getByText('李小華 已報名尾牙，刪除後會一併取消報名、移除眷屬並空出座位。刪除後無法復原。'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: '刪除員工', exact: true }).click();

    await expect(rowOf(page, '李小華')).toHaveCount(0);
    await expectToast(page, '已刪除 李小華。');
    await expect.poll(() => seatedCount(5)).toBe(6);
    const participants = await participantRows();
    expect(participants.some((p) => p.id === liParticipant || p.hostId === liParticipant)).toBe(false);
    expect((await employeeRows()).some((e) => e.name === '李小華')).toBe(false);
  });

  test('EMP-AC54：王小明已報名且是工作人員 → 刪除 → 工作人員桌少一位，參與人員沒有王小明（EMP-R43）', async ({ page }) => {
    const [wang, other] = await insertEmployees([
      { name: '王小明', department: '業務部' },
      { name: '值勤同事', department: '研發部' },
    ]);
    await registerEmployee(wang!, { tableId: 0, seatOrder: 0 });
    await registerEmployee(other!, { tableId: 0, seatOrder: 1 });
    await gotoEmployees(page);

    const dialog = await openDeleteDialog(page, rowOf(page, '王小明'), '王小明');
    await expect(dialog.getByText(/^王小明 已報名尾牙/)).toBeVisible();
    await dialog.getByRole('button', { name: '刪除員工', exact: true }).click();

    await expect.poll(() => seatedCount(0)).toBe(1);
    expect((await participantRows()).some((p) => p.employeeId === wang)).toBe(false);
  });

  test('EMP-AC55：品保部只有一位員工 → 刪除他 → 部門篩選與新增員工對話框的部門選項都沒有「品保部」（EMP-R04）', async ({ page }) => {
    await insertEmployees([
      { name: '研發甲', department: '研發部' },
      { name: '品保唯一', department: '品保部' },
    ]);
    await gotoEmployees(page);
    expect(await optionsOf(page, filterTrigger(page, '部門'))).toContain('品保部');

    const dialog = await openDeleteDialog(page, rowOf(page, '品保唯一'), '品保唯一');
    await dialog.getByRole('button', { name: '刪除員工', exact: true }).click();
    await expect(rowOf(page, '品保唯一')).toHaveCount(0);

    expect(await optionsOf(page, filterTrigger(page, '部門'))).not.toContain('品保部');
    const add = await openAddDialog(page);
    expect(await optionsOf(page, field.department(add))).toEqual(['研發部']);
  });

  test('EMP-AC56：刪除確認按「取消」→ 王小明仍在名單（EMP-R41）', async ({ page }) => {
    await insertEmployee({ name: '王小明', department: '業務部' });
    await gotoEmployees(page);
    const dialog = await openDeleteDialog(page, rowOf(page, '王小明'), '王小明');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(dataRows(page)).toHaveCount(1);
    expect(await employeeRows()).toHaveLength(1);
  });

  test('刪除確認鈕「刪除員工」用 destructive-primary；桌面「取消」在左、「刪除員工」在右（2.4、README 第 9 節）', async ({ page }) => {
    await insertEmployee({ name: '王小明', department: '業務部' });
    await gotoEmployees(page);
    const dialog = await openDeleteDialog(page, rowOf(page, '王小明'), '王小明');
    const confirmButton = dialog.getByRole('button', { name: '刪除員工', exact: true });
    await page.mouse.move(0, 0);
    expect(await backgroundOf(confirmButton)).toBe(await cssVarBackground(page, '--destructive'));

    if (!isMobileWidth(page)) {
      const cancel = await boxOf(dialog.getByRole('button', { name: '取消', exact: true }));
      const confirm = await boxOf(confirmButton);
      expect(cancel.x + cancel.width).toBeLessThanOrEqual(confirm.x + 1);
    }
  });
});
