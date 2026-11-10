// 新增、編輯人員對話框（PersonDialog 的 create、edit 模式）。
// 依據：docs/spec/participants.md 第 2.3 節、第 4.2 節的文案、PPL-R01～R11、R41～R60、R77，PPL-AC33～AC57、AC76（新增人員對話框）；
// 待確認 PPL-Q07（編輯時變更類別）、PPL-Q08（編輯時的桌次）、PPL-Q09（類別預設「員工」）、PPL-Q10（已有眷屬的員工停用並標示
// 「・已有眷屬」）、PPL-Q11（「找不到？請先到員工名單新增。」一直顯示）依原型做法（D-008）；
// docs/spec/README.md 第 9 節（欄位錯誤：離開欄位時驗證，送出時顯示全部錯誤並聚焦第一個）、COM-R07（別人剛改過資料）。
// 從員工名單開啟的「加入尾牙」（join 模式）在 tests/unit/components/people-person-dialog.test.tsx 與階段 3 測。
// 員工名單上標記為不參加的員工（D-014）：選項照常可選、後面標示「不參加」，加入後標記清掉（PPL-R42、PPL-AC84）。
// 資料直接寫進測試資料庫（tests/e2e/helpers/participants-db.ts），都是虛構資料。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import {
  cellOf as employeeCell,
  gotoEmployees,
  rowOf as employeeRow,
  tabCount as employeeTabCount,
  tabOf as employeeTab,
} from './helpers/employees-page';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { demoEmployees, STAFF_TABLE, withDb } from './helpers/participants-db';
import {
  boxOf,
  cellOf,
  checkbox,
  chooseOption,
  expectToast,
  gotoPeople,
  isLocked,
  listedNames,
  markIn,
  openEditDialog,
  openNewPersonDialog,
  openOptions,
  optionIn,
  personRow,
  selectField,
  shownValue,
  textField,
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

/** 示範資料：王小明、李美華已報名（未入座），陳大文未報名 */
async function seedDemo() {
  return withDb(async (db) => {
    const ids = await demoEmployees(db);
    const pWang = await db.register(ids.wang);
    const pLee = await db.register(ids.lee);
    return { ...ids, pWang, pLee };
  });
}

/** 這個人坐在哪一桌（null 是未入座）；找不到這個人時是「沒有這個人」 */
async function tableOf(name: string) {
  const person = await withDb((db) => db.find(name));
  return person ? person.tableId : '沒有這個人';
}

const countNamed = (name: string) =>
  withDb(async (db) => (await db.people()).filter((p) => p.displayName === name).length);

/** 下拉的提示文字：顯示在欄位上（還沒選時），或在選單的搜尋欄 */
const hint = (page: Page, field: Locator, text: string) =>
  field.filter({ hasText: text }).or(page.getByPlaceholder(text)).first();

const save = (dialog: Locator, label = '新增人員') => dialog.getByRole('button', { name: label, exact: true }).click();

test.describe('新增人員：員工', () => {
  test.beforeEach(desktopOnly);

  test('新增陳大文、桌次留「未入座」：選好時下方顯示部門；儲存後清單出現陳大文、未入座，Sonner「已新增 陳大文。」（PPL-AC36、PPL-R44、PPL-R56、PPL-R60）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);

    // 類別預設「員工」（PPL-Q09）；欄位與說明（第 2.3 節、PPL-R52、PPL-Q11）
    await expect(selectField(dialog, '類別')).toHaveText('員工');
    await expect(dialog.getByText('找不到？請先到員工名單新增。', { exact: true })).toBeVisible();
    for (const label of ['需要兒童椅', '素食', '工作人員', '同時加一位眷屬']) {
      await expect(checkbox(dialog, label)).toBeVisible();
    }
    await expect(textField(dialog, '備註')).toBeVisible();
    await expect(selectField(dialog, '桌次')).toHaveText('未入座');
    await expect(dialog.getByText('也可以之後在座位圖拖移入座。', { exact: true })).toBeVisible();

    await chooseOption(page, selectField(dialog, '員工'), /^陳大文（研發一部）/, '陳大文');
    await expect(dialog.getByText('研發一部', { exact: true })).toBeVisible();
    await save(dialog);

    await expect(dialog).toBeHidden();
    await expectToast(page, '已新增 陳大文。');
    // 新增不能復原（PPL-R18）
    await expect(toasts(page).getByRole('button', { name: '復原' })).toHaveCount(0);
    await expect(cellOf(personRow(page, '陳大文'), '桌次')).toHaveText('未入座');
    await expect.poll(() => tableOf('陳大文')).toBeNull();
  });

  test('員工選項：「{姓名}（{部門}・分機 {分機}）」，沒有分機時只有部門；可用分機或部門搜尋；選好後顯示「{部門}・分機 {分機}」（PPL-R42、PPL-R44、COM-R10、COM-R14）', async ({ page }) => {
    await seedDemo();
    await withDb((db) => db.employee({ name: '張三', department: '業務部', extension: '2468' }));
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    const employee = selectField(dialog, '員工');

    let listbox = await openOptions(page, employee);
    await expect(hint(page, employee, '搜尋姓名、分機或部門')).toBeVisible();
    await page.keyboard.type('2468');
    await expect(listbox.getByRole('option')).toHaveCount(1);
    await expect(optionIn(listbox, /^張三（業務部・分機 2468）/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(listbox).toBeHidden();

    listbox = await openOptions(page, employee, '研發一部');
    await expect(optionIn(listbox, /^陳大文（研發一部）/)).toBeVisible();
    await expect(optionIn(listbox, /^王小明（研發一部・分機 1234）/)).toBeVisible();
    await expect(optionIn(listbox, /^張三/)).toHaveCount(0);
    await page.keyboard.press('Escape');

    await chooseOption(page, employee, /^張三（業務部・分機 2468）/, '張三');
    await expect(dialog.getByText('業務部・分機 2468', { exact: true })).toBeVisible();
  });

  test('已報名的王小明：選項停用，顯示「王小明（研發一部・分機 1234）・已報名」（PPL-AC37、PPL-R03、PPL-R43）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    const listbox = await openOptions(page, selectField(dialog, '員工'), '王小明');
    const option = optionIn(listbox, /^王小明（研發一部・分機 1234）/);
    await expect(option).toBeDisabled();
    await expect(option).toContainText('王小明（研發一部・分機 1234）・已報名');
  });

  test('別人剛把陳大文加入尾牙：按「新增人員」不新增，員工欄位顯示「陳大文 已經報名了。」；清單中陳大文只有一列（PPL-AC38、PPL-R45、COM-R07）', async ({ page }) => {
    const { chen } = await seedDemo();
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '員工'), /^陳大文（研發一部）/, '陳大文');

    await withDb((db) => db.register(chen)); // 別人在這時把陳大文加入尾牙
    await save(dialog);

    await expect(dialog.getByText('陳大文 已經報名了。', { exact: true })).toBeVisible();
    expect(await countNamed('陳大文')).toBe(1);
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();
    await expect(personRow(page, '陳大文')).toHaveCount(1);
  });

  test('另有一位未報名的同名王小明（業務部，9999）：兩個選項以部門與分機區分，選後者新增（PPL-AC39、PPL-R42、PPL-R43）', async ({ page }) => {
    await seedDemo();
    await withDb((db) => db.employee({ name: '王小明', department: '業務部', extension: '9999' }));
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);

    const listbox = await openOptions(page, selectField(dialog, '員工'), '王小明');
    await expect(listbox.getByRole('option')).toHaveCount(2);
    const registered = optionIn(listbox, /^王小明（研發一部・分機 1234）/);
    await expect(registered).toBeDisabled();
    await expect(registered).toContainText('・已報名');
    const other = optionIn(listbox, /^王小明（業務部・分機 9999）/);
    await expect(other).toBeEnabled();
    await expect(other).not.toContainText('已報名');
    await other.click();
    await save(dialog);

    await expect(dialog).toBeHidden();
    const row = personRow(page, '王小明').filter({ hasText: '9999' });
    await expect(cellOf(row, '部門或單位')).toHaveText('業務部');
    await expect(cellOf(row, '分機')).toHaveText('9999');
  });

  test('PPL-AC84：陳大文在員工名單標記為不參加 → 員工欄位搜尋「陳大文」，選項可以選、後面標示「不參加」；選他並按「新增人員」→ 新增為參與人員；員工名單上是已報名，「不參加」分頁沒有他（PPL-R42、EMP-R64、D-014）', async ({
    page,
  }) => {
    const { chen } = await withDb(async (db) => {
      const wang = await db.employee({ name: '王小明', department: '研發一部', extension: '1234' });
      const lee = await db.employee({ name: '李美華', department: '業務部', extension: '5678' });
      const chen = await db.employee({ name: '陳大文', department: '研發一部', declined: true });
      await db.register(wang);
      await db.register(lee);
      return { chen };
    });
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);

    const listbox = await openOptions(page, selectField(dialog, '員工'), '陳大文');
    const option = optionIn(listbox, /^陳大文（研發一部）/);
    await expect(option).toBeEnabled();
    await expect(option).toHaveText(/陳大文（研發一部）.*不參加/);
    await expect(option).not.toContainText('已報名');
    await option.click();
    await expect(listbox).toBeHidden();
    await save(dialog);

    await expect(dialog).toBeHidden();
    await expectToast(page, '已新增 陳大文。');
    await expect(personRow(page, '陳大文')).toHaveCount(1);
    await expect.poll(() => countNamed('陳大文')).toBe(1);
    await expect.poll(() => withDb((db) => db.declinedOf(chen))).toBe(false);

    // 員工名單：陳大文是已報名，「不參加」分頁沒有他（EMP-R64）
    await gotoEmployees(page);
    await expect(employeeCell(employeeRow(page, '陳大文'), 'status')).toHaveText('已報名');
    await expect(employeeTab(page, '不參加')).toHaveText(employeeTabCount('不參加', 0));
    await employeeTab(page, '不參加').click();
    await expect(employeeRow(page, '陳大文')).toHaveCount(0);
    await expect(page.getByText('沒有標記為不參加的員工。')).toBeVisible();
  });

  test('不參加的員工和其他員工一樣可用分機或部門搜尋到；已報名的同事仍是停用並標示「・已報名」（PPL-R42、PPL-R43、D-014）', async ({ page }) => {
    await withDb(async (db) => {
      const wang = await db.employee({ name: '王小明', department: '研發一部', extension: '1234' });
      await db.employee({ name: '張三', department: '業務部', extension: '2468', declined: true });
      await db.register(wang);
    });
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);

    let listbox = await openOptions(page, selectField(dialog, '員工'), '2468');
    const zhang = optionIn(listbox, /^張三（業務部・分機 2468）/);
    await expect(zhang).toBeEnabled();
    await expect(zhang).toContainText('不參加');
    await page.keyboard.press('Escape');
    await expect(listbox).toBeHidden();

    listbox = await openOptions(page, selectField(dialog, '員工'), '王小明');
    const wang = optionIn(listbox, /^王小明（研發一部・分機 1234）/);
    await expect(wang).toBeDisabled();
    await expect(wang).toContainText('・已報名');
    await expect(wang).not.toContainText('不參加');
  });

  test('勾「同時加一位眷屬」才展開眷屬欄位；稱謂選「子女」、勾「眷屬需要兒童椅」：新增陳大文與陳大文_眷屬（PPL-AC40、PPL-R46、PPL-R50）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '員工'), /^陳大文（研發一部）/, '陳大文');

    await expect(selectField(dialog, '眷屬稱謂')).toHaveCount(0);
    await expect(checkbox(dialog, '眷屬需要兒童椅')).toHaveCount(0);
    await checkbox(dialog, '同時加一位眷屬').check();
    await expect(checkbox(dialog, '眷屬素食')).toBeVisible();
    await chooseOption(page, selectField(dialog, '眷屬稱謂'), '子女');
    await checkbox(dialog, '眷屬需要兒童椅').check();
    await save(dialog);

    await expect(dialog).toBeHidden();
    await expectToast(page, '已新增 陳大文 與 1 位眷屬。');
    const dependent = personRow(page, '陳大文_眷屬');
    await expect(cellOf(dependent, '類別')).toHaveText('眷屬（子女）');
    await expect(markIn(cellOf(dependent, '標示'), '兒童椅')).toBeVisible();
    await expect(cellOf(personRow(page, '陳大文'), '標示')).toHaveText('—');
  });

  test('第 3 桌剩 5 位：同時加眷屬並選「第 3 桌（剩 5 位）」，兩人都在第 3 桌（PPL-AC41、PPL-R56、PPL-R57）', async ({ page }) => {
    await seedDemo();
    await withDb((db) => db.fillTable(3, 5));
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '員工'), /^陳大文（研發一部）/, '陳大文');
    await checkbox(dialog, '同時加一位眷屬').check();
    await chooseOption(page, selectField(dialog, '桌次'), /^第 3 桌（剩 5 位）/);
    await save(dialog);

    await expect(dialog).toBeHidden();
    await expect(cellOf(personRow(page, '陳大文'), '桌次')).toHaveText('第 3 桌');
    await expect(cellOf(personRow(page, '陳大文_眷屬'), '桌次')).toHaveText('第 3 桌');
  });

  test('第 3 桌只剩 1 位：陳大文入座、陳大文_眷屬未入座，Sonner「第 3 桌只剩 1 位，陳大文_眷屬先留在未入座。」（PPL-AC42、PPL-R57）', async ({ page }) => {
    await seedDemo();
    await withDb((db) => db.fillTable(3, 9));
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '員工'), /^陳大文（研發一部）/, '陳大文');
    await checkbox(dialog, '同時加一位眷屬').check();
    await chooseOption(page, selectField(dialog, '桌次'), /^第 3 桌（剩 1 位）/);
    await save(dialog);

    await expect(dialog).toBeHidden();
    await expectToast(page, '第 3 桌只剩 1 位，陳大文_眷屬先留在未入座。');
    await expect(cellOf(personRow(page, '陳大文'), '桌次')).toHaveText('第 3 桌');
    await expect(cellOf(personRow(page, '陳大文_眷屬'), '桌次')).toHaveText('未入座');
  });

  test('第 4 桌已坐滿 10 位：桌次選項停用並標示「已滿」；選項是「未入座」與第 1～30 桌（PPL-AC43、PPL-R56）', async ({ page }) => {
    await seedDemo();
    await withDb((db) => db.fillTable(4, 10));
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    const listbox = await openOptions(page, selectField(dialog, '桌次'));
    await expect(listbox.getByRole('option')).toHaveCount(31);
    await expect(listbox.getByRole('option').first()).toHaveText('未入座');
    const full = optionIn(listbox, /^第 4 桌/);
    await expect(full).toBeDisabled();
    await expect(full).toContainText('已滿');
    await expect(optionIn(listbox, /^第 5 桌（剩 10 位）/)).toBeEnabled();
  });

  test('工作人員桌有 3 位：勾「工作人員」後桌次欄位消失；同時加眷屬；儲存後陳大文是工作人員、工作人員桌 4 位、眷屬未入座（PPL-AC44、PPL-R10、PPL-R53）', async ({ page }) => {
    await seedDemo();
    await withDb((db) => db.fillStaff(3));
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '員工'), /^陳大文（研發一部）/, '陳大文');

    await expect(
      dialog.getByText('活動當天值勤，放在座位圖右上角的工作人員桌，不算入座統計。', { exact: true }),
    ).toBeVisible();
    await checkbox(dialog, '工作人員').check();
    await expect(selectField(dialog, '桌次')).toHaveCount(0);
    await checkbox(dialog, '同時加一位眷屬').check();
    await save(dialog);

    await expect(dialog).toBeHidden();
    await expect(cellOf(personRow(page, '陳大文'), '桌次')).toHaveText('工作人員');
    await expect(cellOf(personRow(page, '陳大文_眷屬'), '桌次')).toHaveText('未入座');
    await expect.poll(() => withDb((db) => db.countAt(STAFF_TABLE))).toBe(4);
  });

  test('工作人員桌已有 10 位：新增時「工作人員」停用並顯示「工作人員桌已滿，請先移出一位。」；編輯其中一位工作人員時是勾選且可操作的（PPL-AC45、PPL-R54）', async ({ page }) => {
    await seedDemo();
    await withDb((db) => db.fillStaff(10));
    await gotoPeople(page);

    const dialog = await openNewPersonDialog(page);
    await expect(checkbox(dialog, '工作人員')).toBeDisabled();
    await expect(dialog.getByText('工作人員桌已滿，請先移出一位。', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();

    const edit = await openEditDialog(page, '工作人員2');
    await expect(checkbox(edit, '工作人員')).toBeChecked();
    await expect(checkbox(edit, '工作人員')).toBeEnabled();
  });

  test('按「取消」：對話框關閉，清單沒有新增任何人；按 Esc 也一樣（PPL-AC56、PPL-R60）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const before = await withDb((db) => db.participantCount());

    let dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '員工'), /^陳大文（研發一部）/, '陳大文');
    await textField(dialog, '備註').fill('需要靠走道');
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();

    dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '類別'), '外部貴賓');
    await textField(dialog, '姓名').fill('林董');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await expect(personRow(page, '陳大文')).toHaveCount(0);
    await expect(personRow(page, '林董')).toHaveCount(0);
    expect(await withDb((db) => db.participantCount())).toBe(before);
  });
});

test.describe('新增人員：眷屬', () => {
  test.beforeEach(desktopOnly);

  test('所屬員工只列已報名的員工，帶部門與分機；選王小明後顯示「將顯示為「王小明_眷屬」」；儲存後部門是研發一部（PPL-AC49、PPL-R04、PPL-R07、PPL-R08、PPL-R48）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '類別'), '眷屬');

    const host = selectField(dialog, '所屬員工');
    const listbox = await openOptions(page, host);
    await expect(hint(page, host, '搜尋員工姓名')).toBeVisible();
    await expect(optionIn(listbox, /^王小明/)).toContainText('研發一部・分機 1234');
    await expect(optionIn(listbox, /^李美華/)).toContainText('業務部・分機 5678');
    await expect(optionIn(listbox, /陳大文/)).toHaveCount(0);
    await optionIn(listbox, /^王小明/).click();

    await expect(dialog.getByText('將顯示為「王小明_眷屬」', { exact: true })).toBeVisible();
    await save(dialog);

    await expect(dialog).toBeHidden();
    await expectToast(page, '已新增 王小明_眷屬。');
    await expect(cellOf(personRow(page, '王小明_眷屬'), '部門或單位')).toHaveText('研發一部');
    await expect(cellOf(personRow(page, '王小明_眷屬'), '類別')).toHaveText('眷屬');
  });

  test('所屬員工可以用分機搜尋（PPL-R48、COM-R14）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '類別'), '眷屬');
    const listbox = await openOptions(page, selectField(dialog, '所屬員工'), '5678');
    await expect(listbox.getByRole('option')).toHaveCount(1);
    await expect(optionIn(listbox, /^李美華/)).toBeVisible();
  });

  test('已有眷屬的員工：所屬員工選項停用並標示「・已有眷屬」（PPL-Q10 的原型做法）', async ({ page }) => {
    const { pWang } = await seedDemo();
    await withDb((db) => db.dependent(pWang));
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '類別'), '眷屬');
    const listbox = await openOptions(page, selectField(dialog, '所屬員工'));
    const taken = optionIn(listbox, /^王小明/);
    await expect(taken).toBeDisabled();
    await expect(taken).toContainText('・已有眷屬');
    await expect(optionIn(listbox, /^李美華/)).toBeEnabled();
  });

  test('別人剛替王小明加了眷屬：按「新增人員」不儲存，所屬員工欄位顯示「王小明 已經有一位眷屬，一位員工最多一位。」（PPL-AC50、PPL-R49）', async ({ page }) => {
    const { pWang } = await seedDemo();
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '類別'), '眷屬');
    await chooseOption(page, selectField(dialog, '所屬員工'), /^王小明/, '王小明');

    await withDb((db) => db.dependent(pWang)); // 別人在這時替王小明加了眷屬
    await save(dialog);

    await expect(dialog.getByText('王小明 已經有一位眷屬，一位員工最多一位。', { exact: true })).toBeVisible();
    expect(await countNamed('王小明_眷屬')).toBe(1);
  });

  test('稱謂輸入「外婆」：出現「新增稱謂「外婆」」，按下並儲存後類別顯示「眷屬（外婆）」（PPL-AC53、PPL-R50）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '類別'), '眷屬');
    await chooseOption(page, selectField(dialog, '所屬員工'), /^王小明/, '王小明');

    const relation = selectField(dialog, '稱謂');
    const listbox = await openOptions(page, relation);
    await expect(hint(page, relation, '選擇或輸入稱謂')).toBeVisible();
    for (const common of ['配偶', '子女', '父母', '兄弟姊妹']) {
      await expect(optionIn(listbox, common)).toBeVisible();
    }
    await page.keyboard.type('外婆');
    await page
      .getByRole('option', { name: '新增稱謂「外婆」' })
      .or(page.getByRole('button', { name: '新增稱謂「外婆」' }))
      .click();
    await save(dialog);

    await expect(dialog).toBeHidden();
    await expect(cellOf(personRow(page, '王小明_眷屬'), '類別')).toHaveText('眷屬（外婆）');
  });
});

test.describe('新增人員：類別與外部貴賓', () => {
  test.beforeEach(desktopOnly);

  test('類別選項是員工／眷屬／外部貴賓；換類別只顯示新類別的欄位；必填沒填時不儲存並顯示欄位錯誤（PPL-AC54、PPL-R01、PPL-R41、PPL-R51、PPL-R59）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const before = await withDb((db) => db.participantCount());
    const dialog = await openNewPersonDialog(page);
    const kind = selectField(dialog, '類別');

    const listbox = await openOptions(page, kind);
    await expect(listbox.getByRole('option')).toHaveText(['員工', '眷屬', '外部貴賓']);
    await optionIn(listbox, '外部貴賓').click();

    // 外部貴賓：姓名、單位／頭銜、需要兒童椅、素食、備註、桌次
    await expect(textField(dialog, '姓名')).toBeVisible();
    await expect(textField(dialog, '單位／頭銜')).toBeVisible();
    await expect(checkbox(dialog, '需要兒童椅')).toBeVisible();
    await expect(checkbox(dialog, '素食')).toBeVisible();
    await expect(textField(dialog, '備註')).toBeVisible();
    await expect(selectField(dialog, '桌次')).toBeVisible();
    for (const hidden of ['員工', '所屬員工', '稱謂']) await expect(selectField(dialog, hidden)).toHaveCount(0);
    for (const hidden of ['工作人員', '同時加一位眷屬']) await expect(checkbox(dialog, hidden)).toHaveCount(0);

    await save(dialog);
    await expect(dialog.getByText('請輸入姓名。', { exact: true })).toBeVisible();
    await expect(textField(dialog, '姓名')).toBeFocused();

    // 眷屬：所屬員工、稱謂、需要兒童椅、素食、備註、桌次
    await chooseOption(page, kind, '眷屬');
    await expect(selectField(dialog, '所屬員工')).toBeVisible();
    await expect(selectField(dialog, '稱謂')).toBeVisible();
    await expect(checkbox(dialog, '需要兒童椅')).toBeVisible();
    await expect(checkbox(dialog, '素食')).toBeVisible();
    await expect(textField(dialog, '備註')).toBeVisible();
    await expect(selectField(dialog, '桌次')).toBeVisible();
    await expect(textField(dialog, '姓名')).toHaveCount(0);
    await expect(textField(dialog, '單位／頭銜')).toHaveCount(0);
    await expect(checkbox(dialog, '工作人員')).toHaveCount(0);
    await save(dialog);
    await expect(dialog.getByText('請選擇所屬員工。', { exact: true })).toBeVisible();

    // 員工
    await chooseOption(page, kind, '員工');
    await expect(selectField(dialog, '所屬員工')).toHaveCount(0);
    await save(dialog);
    await expect(dialog.getByText('請選擇員工。', { exact: true })).toBeVisible();

    await expect(dialog).toBeVisible();
    expect(await withDb((db) => db.participantCount())).toBe(before);
  });

  test('姓名欄離開時就驗證（docs/spec/README.md 第 9 節、PPL-R59）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '類別'), '外部貴賓');
    await textField(dialog, '姓名').focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByText('請輸入姓名。', { exact: true })).toBeVisible();
  });

  test('姓名填「貴賓席」、單位／頭銜空白：儲存成功，Sonner「已新增 貴賓席。」（PPL-AC55、PPL-R06、PPL-R51）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '類別'), '外部貴賓');
    await expect(textField(dialog, '單位／頭銜')).toHaveAttribute('placeholder', '例如 ○○科技 總經理');
    await expect(textField(dialog, '備註')).toHaveAttribute('placeholder', '只給承辦人看，例如需要靠走道');
    await textField(dialog, '姓名').fill('貴賓席');
    await save(dialog);

    await expect(dialog).toBeHidden();
    await expectToast(page, '已新增 貴賓席。');
    const row = personRow(page, '貴賓席');
    await expect(cellOf(row, '類別')).toHaveText('外部貴賓');
    await expect(cellOf(row, '顯示名稱')).toContainText('貴賓席');
    await expect(cellOf(row, '桌次')).toHaveText('未入座');
  });

  test('外部貴賓勾需要兒童椅與素食、填單位：清單的標示與部門或單位跟著顯示（PPL-R09、PPL-R52、PPL-AC02）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '類別'), '外部貴賓');
    await textField(dialog, '姓名').fill('林董');
    await textField(dialog, '單位／頭銜').fill('○○科技 董事長');
    await checkbox(dialog, '需要兒童椅').check();
    await checkbox(dialog, '素食').check();
    await save(dialog);

    await expect(dialog).toBeHidden();
    const row = personRow(page, '林董');
    await expect(cellOf(row, '部門或單位')).toHaveText('○○科技 董事長');
    await expect(markIn(cellOf(row, '標示'), '兒童椅')).toBeVisible();
    await expect(markIn(cellOf(row, '標示'), '素食')).toBeVisible();
  });
});

test.describe('編輯人員', () => {
  test.beforeEach(desktopOnly);

  test('編輯王小明：員工欄位唯讀顯示「王小明（研發一部・分機 1234）」與說明；沒有「同時加一位眷屬」；主要按鈕「儲存」（PPL-AC47、PPL-R02、PPL-R46、PPL-R47）', async ({ page }) => {
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openEditDialog(page, '王小明');

    const employee = dialog.getByLabel(/^員工\*?$/);
    await expect(employee).toBeVisible();
    expect(await shownValue(employee)).toContain('王小明（研發一部・分機 1234）');
    expect(await isLocked(employee)).toBe(true);
    await expect(dialog.getByText('姓名、部門與分機請到員工名單修改。', { exact: true })).toBeVisible();
    await expect(checkbox(dialog, '同時加一位眷屬')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '儲存', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '新增人員', exact: true })).toHaveCount(0);
  });

  test('王小明有 1 位眷屬：類別欄位停用，Alert「王小明 有 1 位眷屬，要變更類別請先處理眷屬。」（PPL-AC48、PPL-R58）', async ({ page }) => {
    const { pWang } = await seedDemo();
    await withDb((db) => db.dependent(pWang));
    await gotoPeople(page);
    const dialog = await openEditDialog(page, '王小明');
    await expect(selectField(dialog, '類別')).toBeDisabled();
    await expect(dialog.getByText('王小明 有 1 位眷屬，要變更類別請先處理眷屬。', { exact: true })).toBeVisible();
  });

  test('王小明與眷屬在第 3 桌：勾「工作人員」儲存後移到工作人員桌，第 3 桌少 1 人、眷屬仍在第 3 桌（PPL-AC46、PPL-R10、PPL-R55）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.guest('測試貴賓甲', { tableId: 3 });
      const pWang = await db.register(wang, { tableId: 3 });
      await db.dependent(pWang, { tableId: 3 });
    });
    await gotoPeople(page);
    const dialog = await openEditDialog(page, '王小明');
    await checkbox(dialog, '工作人員').check();
    await expect(selectField(dialog, '桌次')).toHaveCount(0);
    await save(dialog, '儲存');

    await expect(dialog).toBeHidden();
    await expectToast(page, '已儲存，王小明 已從第 3 桌移到工作人員桌。');
    await expect(cellOf(personRow(page, '王小明'), '桌次')).toHaveText('工作人員');
    await expect(cellOf(personRow(page, '王小明_眷屬'), '桌次')).toHaveText('第 3 桌');
    await expect.poll(() => withDb((db) => db.seatedNames(3))).toEqual(['測試貴賓甲', '王小明_眷屬']);
  });

  test('編輯王小明_眷屬只改備註：儲存成功，Sonner「已儲存」，備註欄是新內容（PPL-AC51、PPL-R11、PPL-R49、PPL-R60）', async ({ page }) => {
    const { pWang } = await seedDemo();
    await withDb((db) => db.dependent(pWang, { relation: '配偶' }));
    await gotoPeople(page);
    const dialog = await openEditDialog(page, '王小明_眷屬');
    await textField(dialog, '備註').fill('需要靠走道');
    await save(dialog, '儲存');

    await expect(dialog).toBeHidden();
    await expectToast(page, '已儲存');
    await expect(cellOf(personRow(page, '王小明_眷屬'), '備註')).toHaveText('需要靠走道');
    await expect(cellOf(personRow(page, '王小明_眷屬'), '類別')).toHaveText('眷屬（配偶）');
  });

  test('王小明_眷屬的所屬員工改成李美華：變成「李美華_眷屬」、業務部，排在李美華下一列（PPL-AC52、PPL-R13、PPL-R20）', async ({ page }) => {
    const { pWang } = await seedDemo();
    await withDb((db) => db.dependent(pWang));
    await gotoPeople(page);
    const dialog = await openEditDialog(page, '王小明_眷屬');
    await chooseOption(page, selectField(dialog, '所屬員工'), /^李美華/, '李美華');
    await expect(dialog.getByText('將顯示為「李美華_眷屬」', { exact: true })).toBeVisible();
    await save(dialog, '儲存');

    await expect(dialog).toBeHidden();
    await expect(personRow(page, '王小明_眷屬')).toHaveCount(0);
    await expect(cellOf(personRow(page, '李美華_眷屬'), '部門或單位')).toHaveText('業務部');
    await expect.poll(() => listedNames(page)).toEqual(['王小明', '李美華', '李美華_眷屬']);
  });

  test('編輯林董勾「素食」：Sonner「已儲存」，標示欄出現「素食」（PPL-AC57、PPL-R52）', async ({ page }) => {
    await withDb((db) => db.guest('林董', { organization: '○○科技 董事長' }));
    await gotoPeople(page);
    const dialog = await openEditDialog(page, '林董');
    await expect(textField(dialog, '姓名')).toHaveValue('林董');
    await expect(textField(dialog, '單位／頭銜')).toHaveValue('○○科技 董事長');
    await checkbox(dialog, '素食').check();
    await save(dialog, '儲存');

    await expect(dialog).toBeHidden();
    await expectToast(page, '已儲存');
    // 編輯不能復原（PPL-R18）
    await expect(toasts(page).getByRole('button', { name: '復原' })).toHaveCount(0);
    await expect(markIn(cellOf(personRow(page, '林董'), '標示'), '素食')).toBeVisible();
  });

  test('編輯時桌次是目前的桌次，可以改回「未入座」；自己所在的已滿桌次不算已滿（PPL-Q08）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang, lee } = await demoEmployees(db);
      await db.register(lee, { tableId: 3 });
      await db.fillTable(4, 9);
      await db.register(wang, { tableId: 4 });
    });
    await gotoPeople(page);

    let dialog = await openEditDialog(page, '王小明');
    let listbox = await openOptions(page, selectField(dialog, '桌次'));
    await expect(optionIn(listbox, /^第 4 桌/)).toBeEnabled();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();

    dialog = await openEditDialog(page, '李美華');
    await expect(selectField(dialog, '桌次')).toContainText('第 3 桌');
    listbox = await openOptions(page, selectField(dialog, '桌次'));
    await expect(optionIn(listbox, /^第 4 桌/)).toBeDisabled();
    await optionIn(listbox, '未入座').click();
    await save(dialog, '儲存');

    await expect(dialog).toBeHidden();
    await expect(cellOf(personRow(page, '李美華'), '桌次')).toHaveText('未入座');
    await expect.poll(() => tableOf('李美華')).toBeNull();
  });

  test('編輯外部貴賓可以變更類別：改成員工並選一位還沒報名的員工，座位保留（PPL-Q07 的目前假設）', async ({ page }) => {
    await withDb(async (db) => {
      await demoEmployees(db);
      await db.guest('林董', { tableId: 5 });
    });
    await gotoPeople(page);
    const dialog = await openEditDialog(page, '林董');
    expect(await isLocked(selectField(dialog, '類別'))).toBe(false);
    await chooseOption(page, selectField(dialog, '類別'), '員工');
    await chooseOption(page, selectField(dialog, '員工'), /^陳大文（研發一部）/, '陳大文');
    await save(dialog, '儲存');

    await expect(dialog).toBeHidden();
    await expect(personRow(page, '林董')).toHaveCount(0);
    const row = personRow(page, '陳大文');
    await expect(cellOf(row, '類別')).toHaveText('員工');
    await expect(cellOf(row, '桌次')).toHaveText('第 5 桌');
  });
});

test.describe('手機（767 px 以下）', () => {
  test('視窗 375 px：新增人員對話框寬度隨視窗縮小，按鈕滿版堆疊、「新增人員」在最上面（PPL-AC76、PPL-R77）', async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機寬度才堆疊按鈕');
    await page.setViewportSize({ width: 375, height: 800 });
    await seedDemo();
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);

    const panel = await boxOf(dialog);
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(375);
    const primary = await boxOf(dialog.getByRole('button', { name: '新增人員', exact: true }));
    const cancel = await boxOf(dialog.getByRole('button', { name: '取消', exact: true }));
    expect(primary.y + primary.height).toBeLessThanOrEqual(cancel.y + 1);
    expect(Math.abs(primary.width - cancel.width)).toBeLessThanOrEqual(1);
    expect(primary.width).toBeGreaterThan(panel.width * 0.7);
  });
});
