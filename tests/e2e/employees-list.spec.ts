// 員工名單頁：清單、Tabs、排列、分頁、搜尋、篩選、空狀態、勾選與列操作。
// docs/spec/employees.md 第 2.1～2.4、2.6 節，EMP-R03～R30，驗收條件 EMP-AC01～AC06、AC08～AC31、AC34～AC38，
// 待確認 EMP-Q07、Q08 依 D-008 照「原型或現況」欄的做法；頁面版型 ui-design-system/source-reference/html/employees.html。
// 跨線的部分這裡只測到按下按鈕前（docs/plan/implementation-plan.md 第 5.2 節）：
// - 一次加入多位與取消報名送出後的結果：tests/unit/components/employees-page.test.tsx 用假的 API 驗證，
//   階段 3 接上後走真的伺服器的 E2E 在 employees-join.spec.ts；
// - 單筆「加入尾牙」開啟 B 線的新增人員對話框（EMP-R28、EMP-AC35）、「查看參與資料」開啟後的內容（EMP-AC38）也在 employees-join.spec.ts。
// 「不參加」（D-014）讓 Tabs 變成四個、未報名的列操作多「標記為不參加」、「未報名」的空狀態改為「沒有未報名的員工。」，
// 這裡的 EMP-AC01、AC24、AC34 依新規則更新；不參加的完整情境（EMP-AC80～AC86）在 employees-declined.spec.ts。
// 資料用 tests/e2e/helpers/employees-db.ts 直接寫進測試資料庫。
import { expect, test } from '@playwright/test';
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
} from './helpers/employees-db';
import {
  HEADER_CHECKBOX,
  TAB_LABELS,
  backgroundOf,
  boxOf,
  bulkButton,
  cellOf,
  choose,
  colorOf,
  cssVarBackground,
  cssVarColor,
  dataRows,
  filterBadge,
  filterTrigger,
  gotoEmployees,
  openRowMenu,
  optionsOf,
  pickBox,
  rowOf,
  searchBox,
  tabCount,
  tabOf,
  takenBox,
} from './helpers/employees-page';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';

test.beforeEach(async ({ context, baseURL }) => {
  await resetData();
  await signIn(context, requireBaseURL(baseURL));
});

test.afterAll(async () => {
  await resetData();
  await closeDb();
});

/** 王小明（業務部）、李小華（研發部）、張三（研發部）；李小華已報名 */
async function seedThree() {
  const [wang, li, zhang] = await insertEmployees([
    { name: '王小明', englishName: 'Xiaoming', department: '業務部', team: '北區組', extension: '1234', region: '台北' },
    { name: '李小華', englishName: 'Lisa', department: '研發部', team: '韌體組', extension: '2001', region: '台中' },
    { name: '張三', department: '研發部', team: '韌體組', region: '台北' },
  ]);
  const liParticipant = await registerEmployee(li!);
  return { wang: wang!, li: li!, zhang: zhang!, liParticipant };
}

/** 搜尋與篩選用：研發部（韌體組 3 位、軟體組 1 位、沒有組別 1 位，都在台中）、業務部（北區組，台北） */
async function seedDepartments() {
  return insertEmployees([
    { name: '甲員工', department: '研發部', team: '韌體組', region: '台中' },
    { name: '乙員工', department: '研發部', team: '軟體組', region: '台中' },
    { name: '丙員工', department: '研發部', team: '韌體組', region: '台中' },
    { name: '丁員工', department: '業務部', team: '北區組', region: '台北' },
    { name: '戊員工', department: '研發部', region: '台中' },
    { name: '己員工', department: '研發部', team: '韌體組', region: '台中' },
    { name: '庚員工', department: '業務部', team: '北區組', region: '台北', extension: '3001' },
  ]);
}

test.describe('清單與報名狀態（EMP-01）', () => {
  test('EMP-AC01：3 位員工中 1 位已報名 → 顯示「全部」分頁，Tabs「全部 3」「未報名 2」「已報名 1」「不參加 0」，3 列各自的報名狀態（EMP-R03、R06、R08）', async ({
    page,
  }) => {
    await seedThree();
    await gotoEmployees(page);

    await expect(tabOf(page, '全部')).toHaveAttribute('aria-selected', 'true');
    await expect(tabOf(page, '全部')).toHaveText(tabCount('全部', 3));
    await expect(tabOf(page, '未報名')).toHaveText(tabCount('未報名', 2));
    await expect(tabOf(page, '已報名')).toHaveText(tabCount('已報名', 1));
    await expect(tabOf(page, '不參加')).toHaveText(tabCount('不參加', 0));

    await expect(dataRows(page)).toHaveCount(3);
    await expect(cellOf(rowOf(page, '王小明'), 'status')).toHaveText('未報名');
    await expect(cellOf(rowOf(page, '李小華'), 'status')).toHaveText('已報名');
    await expect(cellOf(rowOf(page, '張三'), 'status')).toHaveText('未報名');
  });

  test('頁面標題、說明與頁首按鈕；人數只放在 Tabs 上；Tabs 依序是「全部」「未報名」「已報名」「不參加」（2.1、2.2、第 4.1 節、D-014）', async ({
    page,
  }) => {
    await seedThree();
    await gotoEmployees(page);
    await expect(page.getByText('公司全部員工。把報名尾牙的人加入，參與人員就會出現在座位安排。')).toBeVisible();
    await expect(page.getByRole('button', { name: '新增員工', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '匯入員工名單', exact: true })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(4);
    for (const [i, label] of TAB_LABELS.entries()) {
      await expect(page.getByRole('tab').nth(i)).toHaveText(new RegExp(`^${label}\\s*\\d+$`));
    }
  });

  test('EMP-AC02：按「未報名」只列 2 位未報名，按「已報名」只列 1 位已報名（EMP-R08）', async ({ page }) => {
    await seedThree();
    await gotoEmployees(page);

    await tabOf(page, '未報名').click();
    await expect(tabOf(page, '未報名')).toHaveAttribute('aria-selected', 'true');
    await expect(dataRows(page)).toHaveCount(2);
    await expect(rowOf(page, '李小華')).toHaveCount(0);

    await tabOf(page, '已報名').click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(rowOf(page, '李小華')).toHaveCount(1);
  });

  test('EMP-AC03：被設為工作人員的員工顯示「已報名」，在「已報名」分頁找得到（EMP-R03）', async ({ page }) => {
    const [staff] = await insertEmployees([{ name: '值勤同事', department: '研發部' }, { name: '其他同事', department: '研發部' }]);
    await registerEmployee(staff!, { tableId: 0, seatOrder: 0 });
    await gotoEmployees(page);

    await expect(cellOf(rowOf(page, '值勤同事'), 'status')).toHaveText('已報名');
    await tabOf(page, '已報名').click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(rowOf(page, '值勤同事')).toHaveCount(1);
  });

  test('EMP-AC04：甲（研發部、韌體組）、乙（業務部）、丙（研發部、軟體組）、丁（研發部、沒有組別）、戊（研發部、韌體組）→ 甲、戊、丙、丁、乙（EMP-R07）', async ({
    page,
  }) => {
    await insertEmployees([
      { name: '甲', department: '研發部', team: '韌體組' },
      { name: '乙', department: '業務部' },
      { name: '丙', department: '研發部', team: '軟體組' },
      { name: '丁', department: '研發部' },
      { name: '戊', department: '研發部', team: '韌體組' },
    ]);
    await gotoEmployees(page);
    await expect(dataRows(page)).toHaveCount(5);
    for (const [i, name] of ['甲', '戊', '丙', '丁', '乙'].entries()) {
      await expect(cellOf(dataRows(page).nth(i), 'name')).toContainText(name);
    }
  });

  test('EMP-AC05：有英文名、沒有組別、分機與地區的員工 → 姓名下方顯示英文名；組別、分機、地區顯示「—」；備註空白也是「—」（EMP-R10、EMP-Q08 第 7 點）', async ({
    page,
  }) => {
    await insertEmployee({ name: '王小明', englishName: 'Tony', department: '業務部' });
    await gotoEmployees(page);

    const row = rowOf(page, '王小明');
    const name = cellOf(row, 'name');
    await expect(name).toContainText('王小明');
    await expect(name).toContainText('Tony');
    const nameBox = await name.getByText('王小明', { exact: true }).boundingBox();
    const englishBox = await name.getByText('Tony', { exact: true }).boundingBox();
    expect(englishBox!.y, '英文名在姓名下方').toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height - 1);

    await expect(cellOf(row, 'department')).toHaveText('業務部');
    await expect(cellOf(row, 'team')).toHaveText('—');
    await expect(cellOf(row, 'extension')).toHaveText('—');
    await expect(cellOf(row, 'region')).toHaveText('—');
    // 手機卡片不顯示備註（2.3），只在桌面檢查
    if (!isMobileWidth(page)) await expect(cellOf(row, 'note')).toHaveText('—');
  });

  test('沒有英文名時姓名欄只顯示姓名（EMP-R10）', async ({ page }) => {
    await insertEmployee({ name: '張三', department: '研發部', extension: '2002' });
    await gotoEmployees(page);
    await expect(cellOf(rowOf(page, '張三'), 'name')).toHaveText('張三');
    await expect(cellOf(rowOf(page, '張三'), 'extension')).toHaveText('2002');
  });

  test('表格欄位依序為勾選、姓名、部門、組別、分機、地區、報名狀態、備註、列操作；沒有辦公室欄（EMP-R10、2.3、EMP-Q06）', async ({
    page,
  }) => {
    test.skip(isMobileWidth(page), '手機是堆疊卡片，沒有表頭');
    await insertEmployee({ name: '王小明', department: '業務部', office: '台北辦公室', note: '素食' });
    await gotoEmployees(page);

    const headers = page.getByRole('columnheader');
    await expect(headers).toHaveCount(9);
    await expect(headers.nth(0).getByRole('checkbox', { name: HEADER_CHECKBOX })).toBeVisible();
    for (const [i, label] of ['姓名', '部門', '組別', '分機', '地區', '報名狀態', '備註'].entries()) {
      await expect(headers.nth(i + 1)).toHaveText(label);
    }
    await expect(page.getByText('台北辦公室')).toHaveCount(0);
    await expect(cellOf(rowOf(page, '王小明'), 'note')).toHaveText('素食');
  });

  test('EMP-AC06：已報名的員工帶一位眷屬 → 只有員工本人一列，沒有眷屬的列（EMP-R05）', async ({ page }) => {
    const id = await insertEmployee({ name: '李小華', department: '研發部' });
    const p = await registerEmployee(id, { tableId: 5, seatOrder: 0 });
    await insertDependent(p, { tableId: 5, seatOrder: 1 });
    await gotoEmployees(page);

    await expect(dataRows(page)).toHaveCount(1);
    await expect(page.getByText('李小華_眷屬')).toHaveCount(0);
    await expect(tabOf(page, '全部')).toHaveText(tabCount('全部', 1));
  });
});

test.describe('分頁（EMP-R09）', () => {
  test('EMP-AC08：只有 1 位員工 → 1 列、1 頁，摘要「第 1-1 列，共 1 列」', async ({ page }) => {
    await insertEmployee({ name: '王小明', department: '業務部' });
    await gotoEmployees(page);
    await expect(dataRows(page)).toHaveCount(1);
    await expect(page.getByText('第 1-1 列，共 1 列')).toBeVisible();
    await expect(page.getByRole('button', { name: '第 2 頁' })).toHaveCount(0);
  });

  test('EMP-AC09：剛好 20 位 → 只有 1 頁，顯示 20 列', async ({ page }) => {
    await insertEmployees(numbered(20));
    await gotoEmployees(page);
    await expect(dataRows(page)).toHaveCount(20);
    await expect(page.getByText('第 1-20 列，共 20 列')).toBeVisible();
    await expect(page.getByRole('button', { name: '第 2 頁' })).toHaveCount(0);
  });

  test('EMP-AC10：21 位 → 到第 2 頁只有 1 列，摘要「第 21-21 列，共 21 列」', async ({ page }) => {
    await insertEmployees(numbered(21));
    await gotoEmployees(page);
    await expect(dataRows(page)).toHaveCount(20);
    await page.getByRole('button', { name: '下一頁' }).click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(rowOf(page, '員工21')).toHaveCount(1);
    await expect(page.getByText('第 21-21 列，共 21 列')).toBeVisible();
  });

  test('EMP-AC11：160 位（8 頁）→ 頁碼只列第一頁、最後一頁與目前頁附近，中間用省略號', async ({ page }) => {
    test.skip(isMobileWidth(page), '手機的分頁導覽只有第一頁、上一頁、下一頁、最後一頁');
    await insertEmployees(numbered(160));
    await gotoEmployees(page);

    const nav = page.getByRole('navigation', { name: '分頁' });
    await expect(nav.getByRole('button', { name: '第 1 頁' })).toBeVisible();
    await expect(nav.getByRole('button', { name: '第 8 頁' })).toBeVisible();
    await expect(nav.getByRole('button', { name: '第 6 頁' })).toHaveCount(0);
    await expect(nav.getByText('…')).toHaveCount(1);

    await nav.getByRole('button', { name: '第 8 頁' }).click();
    await expect(page.getByText('第 141-160 列，共 160 列')).toBeVisible();
    await expect(nav.getByRole('button', { name: '第 1 頁' })).toBeVisible();
    await expect(nav.getByRole('button', { name: '第 7 頁' })).toBeVisible();
    await expect(nav.getByRole('button', { name: '第 3 頁' })).toHaveCount(0);
    await expect(nav.getByText('…')).toHaveCount(1);
  });

  test('改搜尋後回到第 1 頁（EMP-Q08 第 3 點）', async ({ page }) => {
    await insertEmployees(numbered(25));
    await gotoEmployees(page);
    await page.getByRole('button', { name: '下一頁' }).click();
    await expect(page.getByText('第 21-25 列，共 25 列')).toBeVisible();

    await searchBox(page).fill('員工');
    await expect(page.getByText('第 1-20 列，共 25 列')).toBeVisible();
  });

  test('換分頁（Tabs）後回到第 1 頁（EMP-Q08 第 3 點）', async ({ page }) => {
    await insertEmployees(numbered(25));
    await gotoEmployees(page);
    await page.getByRole('button', { name: '下一頁' }).click();
    await expect(page.getByText('第 21-25 列，共 25 列')).toBeVisible();

    await tabOf(page, '未報名').click();
    await expect(page.getByText('第 1-20 列，共 25 列')).toBeVisible();
  });
});

test.describe('搜尋（EMP-R11、EMP-R15）', () => {
  test('搜尋框的提示文字是「搜尋姓名、分機、部門或組別」（2.2、第 4.1 節）', async ({ page }) => {
    await seedThree();
    await gotoEmployees(page);
    await expect(searchBox(page)).toBeVisible();
  });

  test('EMP-AC12：王小明的英文名是 Xiaoming → 搜尋「Xiaoming」列出王小明；不分大小寫（EMP-Q08 第 5 點）', async ({ page }) => {
    await seedThree();
    await gotoEmployees(page);
    await searchBox(page).fill('Xiaoming');
    await expect(dataRows(page)).toHaveCount(1);
    await expect(rowOf(page, '王小明')).toHaveCount(1);

    await searchBox(page).fill('xiaoMING');
    await expect(rowOf(page, '王小明')).toHaveCount(1);
  });

  test('EMP-AC13：王小明的分機是 1234 → 搜尋「1234」列出王小明；關鍵字前後的空白不影響（EMP-Q08 第 5 點）', async ({ page }) => {
    await seedThree();
    await gotoEmployees(page);
    await searchBox(page).fill('1234');
    await expect(dataRows(page)).toHaveCount(1);
    await expect(rowOf(page, '王小明')).toHaveCount(1);

    await searchBox(page).fill('  1234 ');
    await expect(dataRows(page)).toHaveCount(1);
  });

  test('EMP-AC14：研發部韌體組有 3 位 → 搜尋「韌體組」列出這 3 位；搜尋「研發部」列出研發部所有員工', async ({ page }) => {
    await seedDepartments();
    await gotoEmployees(page);

    await searchBox(page).fill('韌體組');
    await expect(dataRows(page)).toHaveCount(3);
    for (const name of ['甲員工', '丙員工', '己員工']) await expect(rowOf(page, name)).toHaveCount(1);

    await searchBox(page).fill('研發部');
    await expect(dataRows(page)).toHaveCount(5);
    await expect(rowOf(page, '丁員工')).toHaveCount(0);
  });

  test('EMP-AC15：搜尋「無此人」→「找不到「無此人」。」與「清除搜尋」；按「清除搜尋」→ 關鍵字清空，恢復列出員工（EMP-R17）', async ({
    page,
  }) => {
    await seedThree();
    await gotoEmployees(page);
    await searchBox(page).fill('無此人');
    await expect(page.getByText('找不到「無此人」。')).toBeVisible();
    await expect(dataRows(page)).toHaveCount(0);

    await page.getByRole('button', { name: '清除搜尋' }).click();
    await expect(searchBox(page)).toHaveValue('');
    await expect(dataRows(page)).toHaveCount(3);
  });

  test('EMP-AC22：王小明已報名 → 在「未報名」搜尋找不到他；在「已報名」搜尋列出他（EMP-R15）', async ({ page }) => {
    const [wang] = await insertEmployees([
      { name: '王小明', department: '業務部' },
      { name: '李小華', department: '研發部' },
    ]);
    await registerEmployee(wang!);
    await gotoEmployees(page);

    await tabOf(page, '未報名').click();
    await searchBox(page).fill('王小明');
    await expect(dataRows(page)).toHaveCount(0);
    await expect(page.getByText('找不到「王小明」。')).toBeVisible();

    await tabOf(page, '已報名').click();
    await expect(searchBox(page)).toHaveValue('王小明');
    await expect(dataRows(page)).toHaveCount(1);
    await expect(rowOf(page, '王小明')).toHaveCount(1);
  });

  test('Tabs 上的人數不受搜尋與篩選影響，永遠是整份名單（EMP-Q08 第 4 點）', async ({ page }) => {
    await seedThree();
    await gotoEmployees(page);
    await searchBox(page).fill('王小明');
    await expect(dataRows(page)).toHaveCount(1);
    await expect(tabOf(page, '全部')).toHaveText(tabCount('全部', 3));
    await expect(tabOf(page, '未報名')).toHaveText(tabCount('未報名', 2));
    await expect(tabOf(page, '已報名')).toHaveText(tabCount('已報名', 1));
    await expect(tabOf(page, '不參加')).toHaveText(tabCount('不參加', 0));
  });
});

test.describe('篩選（EMP-R12～R17）', () => {
  test('沒有套用篩選時不顯示徽章與「清除篩選」（2.2）', async ({ page }) => {
    await seedDepartments();
    await gotoEmployees(page);
    await expect(page.getByRole('button', { name: '清除篩選' })).toHaveCount(0);
  });

  test('三項篩選的第一項都是「不限」；部門與組別篩選可以搜尋，提示「搜尋部門」「搜尋組別」（EMP-R12、2.2）', async ({ page }) => {
    await seedDepartments();
    await gotoEmployees(page);

    expect(await optionsOf(page, filterTrigger(page, '部門'))).toEqual(['不限', '研發部', '業務部']);
    expect((await optionsOf(page, filterTrigger(page, '組別')))[0]).toBe('不限');
    const regions = await optionsOf(page, filterTrigger(page, '地區'));
    expect(regions[0]).toBe('不限');
    expect(regions.slice(1).sort()).toEqual(['台中', '台北'].sort());

    await filterTrigger(page, '部門').click();
    await page.getByPlaceholder('搜尋部門').fill('業務');
    await expect(page.getByRole('option', { name: '業務部', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: '研發部', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await filterTrigger(page, '組別').click();
    await expect(page.getByPlaceholder('搜尋組別')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('EMP-AC16：部門篩選選「研發部」→ 只列研發部；出現「研發部」徽章與「清除篩選」；組別篩選只剩「不限」「韌體組」「軟體組」（EMP-R12、R13、R16）', async ({
    page,
  }) => {
    await seedDepartments();
    await gotoEmployees(page);

    await choose(page, filterTrigger(page, '部門'), '研發部');
    await expect(dataRows(page)).toHaveCount(5);
    await expect(rowOf(page, '業務部')).toHaveCount(0);
    await expect(filterBadge(page, '研發部')).toBeVisible();
    await expect(page.getByRole('button', { name: '清除篩選' }).first()).toBeVisible();

    expect(await optionsOf(page, filterTrigger(page, '組別'))).toEqual(['不限', '韌體組', '軟體組']);
  });

  test('EMP-AC17：部門篩選為「不限」→ 組別篩選是「不限」與全部組別，依部門順序排列（EMP-R13）', async ({ page }) => {
    await seedDepartments();
    await gotoEmployees(page);
    expect(await optionsOf(page, filterTrigger(page, '組別'))).toEqual(['不限', '韌體組', '軟體組', '北區組']);
  });

  test('EMP-AC18：部門「研發部」、組別「韌體組」→ 部門改成「業務部」→ 組別篩選清掉，只列業務部，組別選項換成業務部的（EMP-R14）', async ({
    page,
  }) => {
    await seedDepartments();
    await gotoEmployees(page);

    await choose(page, filterTrigger(page, '部門'), '研發部');
    await choose(page, filterTrigger(page, '組別'), '韌體組');
    await expect(dataRows(page)).toHaveCount(3);
    await expect(filterBadge(page, '韌體組')).toBeVisible();

    await choose(page, filterTrigger(page, '部門'), '業務部');
    await expect(filterBadge(page, '韌體組')).toHaveCount(0);
    await expect(filterBadge(page, '業務部')).toBeVisible();
    await expect(dataRows(page)).toHaveCount(2);
    for (const name of ['丁員工', '庚員工']) await expect(rowOf(page, name)).toHaveCount(1);
    expect(await optionsOf(page, filterTrigger(page, '組別'))).toEqual(['不限', '北區組']);
  });

  test('EMP-AC19：有台中、台北兩個地區 → 地區篩選選「台北」→ 只列地區是台北的員工（EMP-R12）', async ({ page }) => {
    await seedDepartments();
    await gotoEmployees(page);
    await choose(page, filterTrigger(page, '地區'), '台北');
    await expect(dataRows(page)).toHaveCount(2);
    for (const name of ['丁員工', '庚員工']) await expect(rowOf(page, name)).toHaveCount(1);
  });

  test('EMP-AC20：部門「研發部」、地區「台北」沒有符合的員工 →「找不到符合條件的員工。」與「清除篩選」；按下 → 三項篩選都回到不限（EMP-R16、R17）', async ({
    page,
  }) => {
    await seedDepartments();
    await gotoEmployees(page);

    await choose(page, filterTrigger(page, '部門'), '研發部');
    await choose(page, filterTrigger(page, '地區'), '台北');
    await expect(dataRows(page)).toHaveCount(0);
    await expect(page.getByText('找不到符合條件的員工。')).toBeVisible();

    await page.getByRole('button', { name: '清除篩選' }).last().click();
    await expect(page.getByRole('button', { name: '清除篩選' })).toHaveCount(0);
    await expect(filterBadge(page, '研發部')).toHaveCount(0);
    await expect(filterBadge(page, '台北')).toHaveCount(0);
    await expect(dataRows(page)).toHaveCount(7);
  });

  test('「清除篩選」一次清掉部門、組別、地區，不清搜尋（EMP-R16、EMP-AC20）', async ({ page }) => {
    await seedDepartments();
    await gotoEmployees(page);

    await searchBox(page).fill('員工');
    await choose(page, filterTrigger(page, '部門'), '研發部');
    await choose(page, filterTrigger(page, '組別'), '韌體組');
    await choose(page, filterTrigger(page, '地區'), '台中');
    await expect(dataRows(page)).toHaveCount(3);

    await page.getByRole('button', { name: '清除篩選' }).click();
    await expect(page.getByRole('button', { name: '清除篩選' })).toHaveCount(0);
    await expect(searchBox(page)).toHaveValue('員工');
    await expect(dataRows(page)).toHaveCount(7);
  });

  test('EMP-AC21：套用了部門與地區篩選 → 按「台北」徽章 → 只移除地區篩選，部門篩選保留（EMP-R16）', async ({ page }) => {
    await seedDepartments();
    await gotoEmployees(page);

    await choose(page, filterTrigger(page, '部門'), '業務部');
    await choose(page, filterTrigger(page, '地區'), '台北');
    await expect(dataRows(page)).toHaveCount(2);

    await filterBadge(page, '台北').click();
    await expect(filterBadge(page, '台北')).toHaveCount(0);
    await expect(filterBadge(page, '業務部')).toBeVisible();
    await expect(dataRows(page)).toHaveCount(2);
    await expect(rowOf(page, '研發部')).toHaveCount(0);
  });

  test('同時有關鍵字與篩選而沒有結果：顯示搜尋無結果（EMP-Q08 第 6 點）', async ({ page }) => {
    await seedDepartments();
    await gotoEmployees(page);
    await choose(page, filterTrigger(page, '部門'), '研發部');
    await searchBox(page).fill('庚員工');
    await expect(page.getByText('找不到「庚員工」。')).toBeVisible();
    await expect(page.getByText('找不到符合條件的員工。')).toHaveCount(0);
  });

  test('組別篩選搜尋到指定組別後，只列那個組別的員工', async ({ page }) => {
    await seedDepartments();
    await gotoEmployees(page);
    await filterTrigger(page, '組別').click();
    await page.getByPlaceholder('搜尋組別').fill('軟體');
    await page.getByRole('option', { name: '軟體組', exact: true }).click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(rowOf(page, '乙員工')).toHaveCount(1);
  });
});

test.describe('空狀態（EMP-R17）', () => {
  test('EMP-AC23：沒有任何員工 →「還沒有員工名單。」與說明、「匯入員工名單」「新增員工」都能開啟對應的對話框；不顯示 Tabs 與工具列（EMP-Q08 第 9 點）', async ({
    page,
  }) => {
    await gotoEmployees(page);
    await expect(page.getByText('還沒有員工名單。')).toBeVisible();
    await expect(page.getByText('匯入公司員工名單，或先新增幾位員工。')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(searchBox(page)).toHaveCount(0);

    const importButtons = page.getByRole('button', { name: '匯入員工名單', exact: true });
    const addButtons = page.getByRole('button', { name: '新增員工', exact: true });
    await expect(importButtons).toHaveCount(2);
    await expect(addButtons).toHaveCount(2);

    for (let i = 0; i < 2; i++) {
      await importButtons.nth(i).click();
      const dialog = page.getByRole('dialog', { name: '匯入員工名單' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: '取消' }).click();
      await expect(dialog).toBeHidden();

      await addButtons.nth(i).click();
      const add = page.getByRole('dialog', { name: '新增員工' });
      await expect(add).toBeVisible();
      await add.getByRole('button', { name: '取消' }).click();
      await expect(add).toBeHidden();
    }
  });

  test('EMP-AC24：所有員工都已報名 → 按「未報名」→「沒有未報名的員工。」，Tabs「未報名 0」（EMP-R08、EMP-R17、D-014）', async ({ page }) => {
    const ids = await insertEmployees(numbered(2));
    for (const id of ids) await registerEmployee(id);
    await gotoEmployees(page);

    await tabOf(page, '未報名').click();
    await expect(page.getByText('沒有未報名的員工。')).toBeVisible();
    await expect(page.getByText('所有員工都已報名。')).toHaveCount(0);
    await expect(tabOf(page, '未報名')).toHaveText(tabCount('未報名', 0));
    await expect(dataRows(page)).toHaveCount(0);
  });

  test('EMP-AC25：還沒有人報名 → 按「已報名」→「還沒有員工報名。」與「在「全部」分頁把報名的員工加入尾牙。」', async ({ page }) => {
    await insertEmployees(numbered(2));
    await gotoEmployees(page);

    await tabOf(page, '已報名').click();
    await expect(page.getByText('還沒有員工報名。')).toBeVisible();
    await expect(page.getByText('在「全部」分頁把報名的員工加入尾牙。')).toBeVisible();
    await expect(tabOf(page, '已報名')).toHaveText(tabCount('已報名', 0));
  });
});

test.describe('勾選與一次加入多位（EMP-R18～R26）', () => {
  test('EMP-AC26：王小明已報名、李小華未報名 → 王小明的勾選框停用「王小明 已報名」；李小華「勾選 李小華」可勾；表頭「全選這一頁未報名的員工」（EMP-R18、R25）', async ({
    page,
  }) => {
    const [wang] = await insertEmployees([
      { name: '王小明', department: '業務部' },
      { name: '李小華', department: '研發部' },
    ]);
    await registerEmployee(wang!);
    await gotoEmployees(page);

    await expect(takenBox(page, '王小明')).toBeDisabled();
    await expect(takenBox(page, '王小明')).not.toBeChecked();
    await expect(pickBox(page, '李小華')).toBeEnabled();
    await pickBox(page, '李小華').click();
    await expect(pickBox(page, '李小華')).toBeChecked();

    if (!isMobileWidth(page)) {
      await expect(page.getByRole('checkbox', { name: HEADER_CHECKBOX })).toBeVisible();
    }
  });

  test('桌面工具列依序為搜尋、部門、組別、地區篩選，勾選後批次按鈕出現在右側（2.2）', async ({ page }) => {
    test.skip(isMobileWidth(page), '手機工具列是堆疊的，見 employees-mobile.spec.ts');
    await seedThree();
    await gotoEmployees(page);
    await pickBox(page, '王小明').click();

    const boxes = await Promise.all(
      [searchBox(page), filterTrigger(page, '部門'), filterTrigger(page, '組別'), filterTrigger(page, '地區'), bulkButton(page, 1)].map(
        (l) => boxOf(l),
      ),
    );
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]!.x, `第 ${i + 1} 個在第 ${i} 個右邊`).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width - 1);
    }
  });

  test('沒有勾選時不顯示批次按鈕；勾 1 位出現「加入尾牙（1 位）」，取消勾選後消失（EMP-R21）', async ({ page }) => {
    await seedThree();
    await gotoEmployees(page);
    await expect(bulkButton(page)).toHaveCount(0);

    await pickBox(page, '王小明').click();
    await expect(bulkButton(page, 1)).toBeVisible();
    await pickBox(page, '王小明').click();
    await expect(bulkButton(page)).toHaveCount(0);
  });

  test('EMP-AC27：25 位未報名（2 頁）→ 第 1 頁按表頭全選 → 20 位勾選、「加入尾牙（20 位）」；第 2 頁的 5 位沒被勾（EMP-R19、R21）', async ({
    page,
  }) => {
    test.skip(isMobileWidth(page), '手機卡片沒有全選（EMP-R26）');
    await insertEmployees(numbered(25));
    await gotoEmployees(page);

    await page.getByRole('checkbox', { name: HEADER_CHECKBOX }).click();
    const picks = page.getByRole('checkbox', { name: /^勾選 / });
    await expect(picks).toHaveCount(20);
    for (const box of await picks.all()) await expect(box).toBeChecked();
    await expect(bulkButton(page, 20)).toBeVisible();

    await page.getByRole('button', { name: '下一頁' }).click();
    await expect(picks).toHaveCount(5);
    for (const box of await picks.all()) await expect(box).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: HEADER_CHECKBOX })).not.toBeChecked();
    // 換頁後勾選保留，{n} 包含看不到的勾選（EMP-Q08 第 1 點）
    await expect(bulkButton(page, 20)).toBeVisible();
  });

  test('EMP-AC28：這一頁 20 列中 5 位已報名 → 按表頭全選 → 勾選 15 位，已報名的 5 列停用、未勾；「加入尾牙（15 位）」（EMP-R19）', async ({
    page,
  }) => {
    test.skip(isMobileWidth(page), '手機卡片沒有全選（EMP-R26）');
    const ids = await insertEmployees(numbered(20));
    for (const id of ids.slice(0, 5)) await registerEmployee(id);
    await gotoEmployees(page);

    await page.getByRole('checkbox', { name: HEADER_CHECKBOX }).click();
    const picks = page.getByRole('checkbox', { name: /^勾選 / });
    await expect(picks).toHaveCount(15);
    for (const box of await picks.all()) await expect(box).toBeChecked();
    const taken = page.getByRole('checkbox', { name: / 已報名$/ });
    await expect(taken).toHaveCount(5);
    for (const box of await taken.all()) {
      await expect(box).toBeDisabled();
      await expect(box).not.toBeChecked();
    }
    await expect(bulkButton(page, 15)).toBeVisible();
  });

  test('EMP-AC29：這一頁 15 位可勾 → 勾 3 位表頭不確定；勾滿 15 位表頭勾選；按表頭 → 全部取消，批次按鈕消失（EMP-R20、R21）', async ({
    page,
  }) => {
    test.skip(isMobileWidth(page), '手機卡片沒有全選（EMP-R26）');
    const ids = await insertEmployees(numbered(20));
    for (const id of ids.slice(15)) await registerEmployee(id);
    await gotoEmployees(page);

    const header = page.getByRole('checkbox', { name: HEADER_CHECKBOX });
    await expect(header).not.toBeChecked();
    for (const n of [1, 2, 3]) await pickBox(page, `員工0${n}`).click();
    await expect(header).toBeChecked({ indeterminate: true });
    await expect(bulkButton(page, 3)).toBeVisible();

    for (let n = 4; n <= 15; n++) await pickBox(page, `員工${String(n).padStart(2, '0')}`).click();
    await expect(header).toBeChecked();
    await expect(bulkButton(page, 15)).toBeVisible();

    await header.click();
    for (const box of await page.getByRole('checkbox', { name: /^勾選 / }).all()) await expect(box).not.toBeChecked();
    await expect(bulkButton(page)).toHaveCount(0);
  });

  test('這一頁沒有能勾的列時，表頭全選停用（EMP-Q08 第 2 點）', async ({ page }) => {
    test.skip(isMobileWidth(page), '手機卡片沒有全選（EMP-R26）');
    const ids = await insertEmployees(numbered(2));
    for (const id of ids) await registerEmployee(id);
    await gotoEmployees(page);
    await expect(page.getByRole('checkbox', { name: HEADER_CHECKBOX })).toBeDisabled();
  });

  test('改搜尋後勾選保留，{n} 包含看不到的勾選（EMP-Q08 第 1 點）', async ({ page }) => {
    await seedThree();
    await gotoEmployees(page);
    await pickBox(page, '王小明').click();
    await searchBox(page).fill('張三');
    await expect(dataRows(page)).toHaveCount(1);
    await pickBox(page, '張三').click();
    await expect(bulkButton(page, 2)).toBeVisible();
  });

  test('EMP-AC30（按下確認前）：勾 3 位按「加入尾牙（3 位）」→ 確認對話框的標題、內文與按鈕（EMP-R22、第 4.1 節）', async ({ page }) => {
    await insertEmployees(numbered(4));
    await gotoEmployees(page);
    for (const name of ['員工01', '員工02', '員工04']) await pickBox(page, name).click();
    await bulkButton(page, 3).click();

    const dialog = page.getByRole('alertdialog', { name: '要把 3 位員工加入尾牙嗎？' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('只加入員工本人，眷屬請之後在參與人員補上。')).toBeVisible();
    const confirm = dialog.getByRole('button', { name: '加入尾牙', exact: true });
    await expect(confirm).toBeVisible();
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeVisible();
    // 確認鈕用 Button primary，不是危險樣式（2.4）
    await page.mouse.move(0, 0);
    expect(await backgroundOf(confirm)).toBe(await cssVarBackground(page, '--primary'));
  });

  test('EMP-AC31：確認對話框按「取消」→ 沒有任何員工加入尾牙（EMP-R22）', async ({ page }) => {
    await insertEmployees(numbered(4));
    await gotoEmployees(page);
    for (const name of ['員工01', '員工02', '員工04']) await pickBox(page, name).click();
    await bulkButton(page, 3).click();

    const dialog = page.getByRole('alertdialog', { name: '要把 3 位員工加入尾牙嗎？' });
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await participantRows()).toEqual([]);
    for (const name of ['員工01', '員工02', '員工04']) await expect(cellOf(rowOf(page, name), 'status')).toHaveText('未報名');
  });
});

test.describe('列操作（EMP-R27～R30）', () => {
  test('EMP-AC34：未報名「加入尾牙」「標記為不參加」「編輯」「刪除」；已報名「查看參與資料」「取消報名」「編輯」「刪除」；「刪除」「取消報名」是危險樣式（EMP-R27、D-014）', async ({
    page,
  }) => {
    await seedThree();
    await gotoEmployees(page);
    const danger = await cssVarColor(page, '--destructive-text');

    let menu = await openRowMenu(page, rowOf(page, '王小明'));
    await expect(menu.getByRole('menuitem')).toHaveText(['加入尾牙', '標記為不參加', '編輯', '刪除']);
    expect(await colorOf(menu.getByRole('menuitem', { name: '刪除' }))).toBe(danger);
    expect(await colorOf(menu.getByRole('menuitem', { name: '編輯' }))).not.toBe(danger);
    expect(await colorOf(menu.getByRole('menuitem', { name: '加入尾牙' }))).not.toBe(danger);
    expect(await colorOf(menu.getByRole('menuitem', { name: '標記為不參加' }))).not.toBe(danger);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    menu = await openRowMenu(page, rowOf(page, '李小華'));
    await expect(menu.getByRole('menuitem')).toHaveText(['查看參與資料', '取消報名', '編輯', '刪除']);
    expect(await colorOf(menu.getByRole('menuitem', { name: '取消報名' }))).toBe(danger);
    expect(await colorOf(menu.getByRole('menuitem', { name: '刪除' }))).toBe(danger);
    expect(await colorOf(menu.getByRole('menuitem', { name: '查看參與資料' }))).not.toBe(danger);
  });

  test('列操作選單按鈕的無障礙名稱是「更多操作」（README 第 14 節）', async ({ page }) => {
    await seedThree();
    await gotoEmployees(page);
    await expect(page.getByRole('button', { name: '更多操作' })).toHaveCount(3);
  });

  test('EMP-AC36（按下確認前）、AC37：李小華已報名、帶眷屬坐第 5 桌 →「取消報名」的確認對話框；按「返回」→ 仍是已報名，參與人員與座位不變（EMP-R30）', async ({
    page,
  }) => {
    const li = await insertEmployee({ name: '李小華', department: '研發部' });
    const p = await registerEmployee(li, { tableId: 5, seatOrder: 0 });
    await insertDependent(p, { tableId: 5, seatOrder: 1 });
    await gotoEmployees(page);

    const menu = await openRowMenu(page, rowOf(page, '李小華'));
    await menu.getByRole('menuitem', { name: '取消報名' }).click();
    const dialog = page.getByRole('alertdialog', { name: '要取消 李小華 的報名嗎？' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText('李小華 會從參與人員移除，眷屬一併移除，已安排的座位會空出來；員工名單不受影響，之後可以再加入。'),
    ).toBeVisible();
    const confirm = dialog.getByRole('button', { name: '確認取消報名' });
    await expect(confirm).toBeVisible();
    // 確認鈕用 destructive-primary（2.4）
    await page.mouse.move(0, 0);
    expect(await backgroundOf(confirm)).toBe(await cssVarBackground(page, '--destructive'));

    await dialog.getByRole('button', { name: '返回' }).click();
    await expect(dialog).toBeHidden();
    await expect(cellOf(rowOf(page, '李小華'), 'status')).toHaveText('已報名');
    expect(await participantRows()).toHaveLength(2);
    expect(await seatedCount(5)).toBe(2);
  });

  test('EMP-AC38（開啟的網址）、EMP-Q07：「查看參與資料」開啟參與人員頁 /people?employee={員工 id}（EMP-R29）', async ({ page }) => {
    const { li } = await seedThree();
    await gotoEmployees(page);
    const menu = await openRowMenu(page, rowOf(page, '李小華'));
    await menu.getByRole('menuitem', { name: '查看參與資料' }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/people' && url.searchParams.get('employee') === String(li));
  });

  test('EMP-AC35（入口）：未報名的員工有單筆「加入尾牙」，已報名的沒有（EMP-R28、2.6）', async ({ page }) => {
    await seedThree();
    await gotoEmployees(page);
    let menu = await openRowMenu(page, rowOf(page, '張三'));
    await expect(menu.getByRole('menuitem', { name: '加入尾牙' })).toBeVisible();
    await page.keyboard.press('Escape');
    menu = await openRowMenu(page, rowOf(page, '李小華'));
    await expect(menu.getByRole('menuitem', { name: '加入尾牙' })).toHaveCount(0);
  });
});

test.describe('版面', () => {
  test('有資料時沒有整頁水平捲動（2.1、COM-AC11）', async ({ page }) => {
    await insertEmployees([
      {
        name: '王小明',
        englishName: 'Xiaoming-With-A-Very-Long-English-Name',
        department: '業務部與很長的部門名稱測試',
        team: '北區組',
        extension: '1234／1235／1236',
        region: '台北',
        note: '這是一段很長的備註，用來確認表格不會撐開整頁而出現水平捲動。'.repeat(3),
      },
      ...numbered(5),
    ]);
    await gotoEmployees(page);
    await expect(dataRows(page)).toHaveCount(6);
    await expectNoHorizontalScroll(page);
  });
});
