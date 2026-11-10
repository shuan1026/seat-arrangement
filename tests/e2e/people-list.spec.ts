// 參與人員頁：清單與顯示、搜尋與篩選、分頁、和員工名單的連動、手機版面、整頁水平捲動。
// 依據：docs/spec/participants.md 第 2.1 節、第 4.1 節的文案、PPL-R12、R16、R19～R33、R39、R40、R75、R76、R78，
// PPL-AC01～AC08、AC09（匯入的部分）、AC10～AC24、AC71～AC75、AC77；待確認 PPL-Q13～Q16、Q18、Q19 依原型做法（D-008）；
// docs/spec/README.md 第 9 節（整頁不能水平捲動）、第 14 節（分頁文案）。
// 「匯出座位表」按鈕（D 線）與「第 n 桌」開啟的桌次詳情（C 線）在階段 3 接上，這裡只測連結網址。
// 資料直接寫進測試資料庫（tests/e2e/helpers/participants-db.ts），都是虛構資料。
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { demoEmployees, STAFF_TABLE, withDb } from './helpers/participants-db';
import {
  boxOf,
  cellOf,
  chooseOption,
  COLUMNS,
  filterChip,
  filterSelect,
  gotoPeople,
  listedNames,
  markIn,
  openImportDialog,
  openNewPersonDialog,
  openOptions,
  optionIn,
  personRow,
  SEARCH_LABEL,
  searchBox,
} from './helpers/participants-page';

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
  await withDb((db) => db.reset());
});

test.afterAll(async () => {
  await withDb((db) => db.reset());
});

const desktopOnly = async ({ page }: { page: Page }) => {
  test.skip(isMobileWidth(page), '桌面版面；手機版面在「手機（767 px 以下）」另外測');
};

/** 王小明在第 3 桌、有眷屬（配偶，未入座）；李美華未入座；陳大文是工作人員；外部貴賓林董（○○科技 董事長）未入座 */
async function seedFilterDemo() {
  return withDb(async (db) => {
    const { wang, lee, chen } = await demoEmployees(db);
    const pWang = await db.register(wang, { tableId: 3 });
    await db.dependent(pWang, { relation: '配偶' });
    await db.register(lee);
    await db.register(chen, { tableId: STAFF_TABLE });
    await db.guest('林董', { organization: '○○科技 董事長' });
    return { wang, lee, chen };
  });
}

test.describe('頁首與表格', () => {
  test.beforeEach(desktopOnly);

  test('頁首：H1「參與人員」、頁面說明、「新增人員」「匯入參與人員」（第 2.1 節、第 4.1 節）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.register(wang);
    });
    await gotoPeople(page);
    await expect(page.getByText('管理報名尾牙的員工、他們的眷屬與外部貴賓。', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '新增人員' })).toBeVisible();
    await expect(page.getByRole('button', { name: '匯入參與人員' })).toBeVisible();
  });

  test('表格欄位依序是顯示名稱、類別、部門或單位、分機、標示、桌次、備註，最右一欄是列操作（第 2.1 節）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.register(wang);
    });
    await gotoPeople(page);
    const headers = page.getByRole('columnheader');
    for (const [i, column] of COLUMNS.entries()) {
      await expect(headers.nth(i)).toHaveText(column);
    }
    await expect(personRow(page, '王小明').getByRole('button', { name: '更多操作' })).toBeVisible();
  });

  test('員工與眷屬：顯示名稱、類別、部門或單位、分機；眷屬緊接在員工下一列（PPL-AC01）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang, lee } = await demoEmployees(db);
      await db.register(lee);
      const pWang = await db.register(wang);
      await db.dependent(pWang, { relation: '配偶' });
    });
    await gotoPeople(page);

    const wang = personRow(page, '王小明');
    await expect(cellOf(wang, '顯示名稱')).toHaveText('王小明');
    await expect(cellOf(wang, '類別')).toHaveText('員工');
    await expect(cellOf(wang, '部門或單位')).toHaveText('研發一部');
    await expect(cellOf(wang, '分機')).toHaveText('1234');

    const dependent = personRow(page, '王小明_眷屬');
    await expect(cellOf(dependent, '顯示名稱')).toHaveText('王小明_眷屬');
    await expect(cellOf(dependent, '類別')).toHaveText('眷屬（配偶）');
    await expect(cellOf(dependent, '部門或單位')).toHaveText('研發一部');
    await expect(cellOf(dependent, '分機')).toHaveText('—');

    await expect.poll(() => listedNames(page)).toEqual(['王小明', '王小明_眷屬', '李美華']);
  });

  test('外部貴賓：名稱旁有「貴賓」徽章、沒有兒童椅與素食；標示欄並排兩個標示；排在最後（PPL-AC02）', async ({ page }) => {
    await withDb(async (db) => {
      await db.guest('林董', { organization: '○○科技 董事長', childSeat: true, vegetarian: true });
      const { wang, lee } = await demoEmployees(db);
      await db.register(wang);
      await db.register(lee);
    });
    await gotoPeople(page);

    const lin = personRow(page, '林董');
    const name = cellOf(lin, '顯示名稱');
    await expect(name).toContainText('林董');
    await expect(name).toContainText('貴賓');
    await expect(markIn(name, '兒童椅')).toHaveCount(0);
    await expect(markIn(name, '素食')).toHaveCount(0);
    await expect(cellOf(lin, '類別')).toHaveText('外部貴賓');
    await expect(cellOf(lin, '部門或單位')).toHaveText('○○科技 董事長');
    await expect(cellOf(lin, '分機')).toHaveText('—');
    await expect(markIn(cellOf(lin, '標示'), '兒童椅')).toBeVisible();
    await expect(markIn(cellOf(lin, '標示'), '素食')).toBeVisible();

    await expect.poll(() => listedNames(page)).toEqual(['王小明', '李美華', '林董']);
  });

  test('眷屬沒填稱謂、沒有標示：類別「眷屬」、標示「—」、名稱旁沒有徽章；備註空白顯示「—」（PPL-AC03、PPL-Q18）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      const pWang = await db.register(wang);
      await db.dependent(pWang);
    });
    await gotoPeople(page);

    const dependent = personRow(page, '王小明_眷屬');
    await expect(cellOf(dependent, '顯示名稱')).toHaveText('王小明_眷屬');
    await expect(cellOf(dependent, '類別')).toHaveText('眷屬');
    await expect(cellOf(dependent, '標示')).toHaveText('—');
    await expect(cellOf(dependent, '備註')).toHaveText('—');
  });

  test('員工的兒童椅與素食在「標示」欄，備註在「備註」欄（PPL-R32、PPL-R11）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.register(wang, { childSeat: true, note: '需要靠走道' });
    });
    await gotoPeople(page);
    const wang = personRow(page, '王小明');
    await expect(markIn(cellOf(wang, '標示'), '兒童椅')).toBeVisible();
    await expect(markIn(cellOf(wang, '標示'), '素食')).toHaveCount(0);
    await expect(markIn(cellOf(wang, '顯示名稱'), '兒童椅')).toHaveCount(0);
    await expect(cellOf(wang, '備註')).toHaveText('需要靠走道');
  });

  test('員工名單上沒有分機的員工：分機欄「—」（PPL-AC04）', async ({ page }) => {
    await withDb(async (db) => {
      const { chen } = await demoEmployees(db);
      await db.register(chen);
    });
    await gotoPeople(page);
    await expect(cellOf(personRow(page, '陳大文'), '分機')).toHaveText('—');
  });

  test('桌次欄：「第 3 桌」「未入座」「工作人員」（PPL-AC05、PPL-R33）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang, lee, chen } = await demoEmployees(db);
      await db.register(wang, { tableId: 3 });
      await db.register(lee);
      await db.register(chen, { tableId: STAFF_TABLE });
    });
    await gotoPeople(page);
    await expect(cellOf(personRow(page, '王小明'), '桌次')).toHaveText('第 3 桌');
    await expect(cellOf(personRow(page, '李美華'), '桌次')).toHaveText('未入座');
    await expect(cellOf(personRow(page, '陳大文'), '桌次')).toHaveText('工作人員');
  });

  test('按「第 3 桌」開啟座位安排並帶著第 3 桌（/?table=3）（PPL-AC06、PPL-R33）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.register(wang, { tableId: 3 });
    });
    await gotoPeople(page);
    const link = cellOf(personRow(page, '王小明'), '桌次').getByRole('link', { name: '第 3 桌' });
    await expect(link).toHaveAttribute('href', '/?table=3');
    await link.click();
    await expect(page).toHaveURL((url) => url.pathname === '/' && url.searchParams.get('table') === '3');
  });

  test('員工名單上沒報名的員工不會出現（PPL-AC07、PPL-R19）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.register(wang);
    });
    await gotoPeople(page);
    await expect(personRow(page, '王小明')).toHaveCount(1);
    await expect(personRow(page, '陳大文')).toHaveCount(0);
    await expect(personRow(page, '李美華')).toHaveCount(0);
  });

  test('預設排序：依員工名單的部門順序，眷屬緊接在所屬員工後面，外部貴賓排在最後（PPL-R20、PPL-Q13）', async ({ page }) => {
    await withDb(async (db) => {
      await db.guest('林董');
      const { wang, lee, chen } = await demoEmployees(db);
      await db.register(lee);
      await db.register(chen);
      const pWang = await db.register(wang);
      await db.dependent(pWang);
    });
    await gotoPeople(page);
    await expect.poll(() => listedNames(page)).toEqual(['王小明', '王小明_眷屬', '陳大文', '李美華', '林董']);
  });

  test('還沒有任何參與人員：顯示空狀態；「前往員工名單」開啟 /employees（PPL-AC08、PPL-R40）', async ({ page }) => {
    await gotoPeople(page);
    await expect(page.getByText('還沒有參與人員。', { exact: true })).toBeVisible();
    await expect(
      page.getByText('到員工名單把報名的員工加入尾牙，或新增貴賓與眷屬後，就可以開始安排座位。', { exact: true }),
    ).toBeVisible();
    const goEmployees = page
      .getByRole('link', { name: '前往員工名單' })
      .or(page.getByRole('button', { name: '前往員工名單' }));
    await expect(goEmployees).toBeVisible();
    await goEmployees.click();
    await expect(page).toHaveURL((url) => url.pathname === '/employees');
  });

  test('還沒有任何參與人員：空狀態的「新增人員」開啟新增人員對話框（PPL-AC08）', async ({ page }) => {
    await gotoPeople(page);
    await expect(page.getByText('還沒有參與人員。', { exact: true })).toBeVisible();
    // 頁首與空狀態各有一個「新增人員」，空狀態的在後面
    await page.getByRole('button', { name: '新增人員' }).last().click();
    await expect(page.getByRole('dialog', { name: '新增人員' })).toBeVisible();
  });

  test('「新增人員」開啟新增人員對話框；「匯入參與人員」開啟匯入參與人員對話框（PPL-R39、PPL-AC09）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.register(wang);
    });
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();
    await openImportDialog(page);
  });
});

test.describe('搜尋與篩選', () => {
  test.beforeEach(desktopOnly);

  test('用分機搜尋：只列出王小明，不列出他的眷屬（PPL-AC10）', async ({ page }) => {
    await seedFilterDemo();
    await gotoPeople(page);
    await expect(searchBox(page)).toHaveAttribute('placeholder', SEARCH_LABEL);
    await searchBox(page).fill('1234');
    await expect.poll(() => listedNames(page)).toEqual(['王小明']);
  });

  test('用員工姓名搜尋：員工與眷屬都列出（PPL-AC11）', async ({ page }) => {
    await seedFilterDemo();
    await gotoPeople(page);
    await searchBox(page).fill('王小明');
    await expect.poll(() => listedNames(page)).toEqual(['王小明', '王小明_眷屬']);
  });

  test('用外部貴賓的單位搜尋（PPL-AC12）', async ({ page }) => {
    await seedFilterDemo();
    await gotoPeople(page);
    await searchBox(page).fill('○○科技');
    await expect.poll(() => listedNames(page)).toEqual(['林董']);
  });

  test('搜尋沒有結果：「找不到「xyz」。」與「清除搜尋」；清除後搜尋框清空、列出全部（PPL-AC13、PPL-R40）', async ({ page }) => {
    await seedFilterDemo();
    await gotoPeople(page);
    await searchBox(page).fill('xyz');
    await expect(page.getByText('找不到「xyz」。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清除搜尋' }).click();
    await expect(searchBox(page)).toHaveValue('');
    // 預設排序：研發一部（王小明、陳大文）在業務部（李美華）前面，外部貴賓最後（PPL-R20、PPL-Q13）
    await expect.poll(() => listedNames(page)).toEqual(['王小明', '王小明_眷屬', '陳大文', '李美華', '林董']);
  });

  test('類別選「眷屬」：只列出眷屬；工具列下方出現「眷屬」篩選按鈕與「清除篩選」（PPL-AC14、PPL-R23、PPL-R27）', async ({ page }) => {
    await seedFilterDemo();
    await gotoPeople(page);
    const listbox = await openOptions(page, filterSelect(page, '類別'));
    await expect(listbox.getByRole('option')).toHaveText(['不限', '員工', '眷屬', '外部貴賓']);
    await optionIn(listbox, '眷屬').click();
    await expect.poll(() => listedNames(page)).toEqual(['王小明_眷屬']);
    await expect(filterChip(page, '眷屬')).toBeVisible();
    await expect(page.getByRole('button', { name: '清除篩選' })).toBeVisible();
  });

  test('部門選「研發一部」（可搜尋）：列出王小明與王小明_眷屬，不列出李美華與林董（PPL-AC15、PPL-R24）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang, lee } = await demoEmployees(db);
      const pWang = await db.register(wang);
      await db.dependent(pWang);
      await db.register(lee);
      await db.guest('林董');
      // 沒報名的員工的部門也是選項
      await db.employee({ name: '測試員工甲', department: '總務部' });
    });
    await gotoPeople(page);
    const listbox = await openOptions(page, filterSelect(page, '部門'));
    await expect(optionIn(listbox, '不限')).toBeVisible();
    await expect(optionIn(listbox, '總務部')).toBeVisible();
    await expect(page.getByPlaceholder('搜尋部門')).toBeVisible();
    await page.keyboard.type('研發');
    await optionIn(listbox, '研發一部').click();
    await expect.poll(() => listedNames(page)).toEqual(['王小明', '王小明_眷屬']);
  });

  test('入座狀態依序選「已入座」「未入座」「工作人員」：分別只列出王小明、李美華、陳大文（PPL-AC16、PPL-R25）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang, lee, chen } = await demoEmployees(db);
      await db.register(wang, { tableId: 3 });
      await db.register(lee);
      await db.register(chen, { tableId: STAFF_TABLE });
    });
    await gotoPeople(page);
    const listbox = await openOptions(page, filterSelect(page, '入座狀態'));
    await expect(listbox.getByRole('option')).toHaveText(['不限', '已入座', '未入座', '工作人員']);
    await optionIn(listbox, '已入座').click();
    await expect.poll(() => listedNames(page)).toEqual(['王小明']);
    await chooseOption(page, filterSelect(page, '入座狀態'), '未入座');
    await expect.poll(() => listedNames(page)).toEqual(['李美華']);
    await chooseOption(page, filterSelect(page, '入座狀態'), '工作人員');
    await expect.poll(() => listedNames(page)).toEqual(['陳大文']);
  });

  test('桌次選「第 3 桌」（可搜尋桌號）：只列出王小明；未入座與工作人員都不列出（PPL-AC17、PPL-R26）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang, lee, chen } = await demoEmployees(db);
      await db.register(wang, { tableId: 3 });
      await db.register(lee);
      await db.register(chen, { tableId: STAFF_TABLE });
    });
    await gotoPeople(page);
    const listbox = await openOptions(page, filterSelect(page, '桌次'));
    await expect(listbox.getByRole('option')).toHaveCount(31);
    await expect(listbox.getByRole('option').first()).toHaveText('不限');
    await expect(page.getByPlaceholder('搜尋桌號')).toBeVisible();
    await page.keyboard.type('3');
    await optionIn(listbox, '第 3 桌').click();
    await expect.poll(() => listedNames(page)).toEqual(['王小明']);
  });

  test('類別「員工」、入座狀態「未入座」、搜尋「王」同時作用：只列出王小明（PPL-AC18、PPL-R22）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang, lee } = await demoEmployees(db);
      const pWang = await db.register(wang);
      await db.dependent(pWang);
      await db.register(lee);
    });
    await gotoPeople(page);
    await chooseOption(page, filterSelect(page, '類別'), '員工');
    await chooseOption(page, filterSelect(page, '入座狀態'), '未入座');
    await searchBox(page).fill('王');
    await expect.poll(() => listedNames(page)).toEqual(['王小明']);
  });

  test('按篩選按鈕只移除那一項；「清除篩選」把四個篩選都改回不限，搜尋框不變（PPL-AC19、PPL-R27）', async ({ page }) => {
    await seedFilterDemo();
    await gotoPeople(page);
    await chooseOption(page, filterSelect(page, '類別'), '員工');
    await chooseOption(page, filterSelect(page, '部門'), '研發一部', '研發');
    await searchBox(page).fill('王');
    await expect.poll(() => listedNames(page)).toEqual(['王小明']);

    await filterChip(page, '員工').click();
    await expect(filterChip(page, '員工')).toHaveCount(0);
    await expect(filterChip(page, '研發一部')).toBeVisible();
    await expect.poll(() => listedNames(page)).toEqual(['王小明', '王小明_眷屬']);

    await page.getByRole('button', { name: '清除篩選' }).first().click();
    await expect(filterChip(page, '研發一部')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '清除篩選' })).toHaveCount(0);
    await expect(searchBox(page)).toHaveValue('王');
    await expect.poll(() => listedNames(page)).toEqual(['王小明', '王小明_眷屬']);
  });

  test('沒有搜尋字、篩選沒有結果：「找不到符合條件的人員。」與「清除篩選」；按下後列出全部（PPL-AC20、PPL-R40）', async ({ page }) => {
    await seedFilterDemo();
    await gotoPeople(page);
    await chooseOption(page, filterSelect(page, '類別'), '外部貴賓');
    await chooseOption(page, filterSelect(page, '部門'), '研發一部', '研發');
    await expect(page.getByText('找不到符合條件的人員。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清除篩選' }).last().click();
    // 預設排序：研發一部（王小明、陳大文）在業務部（李美華）前面，外部貴賓最後（PPL-R20、PPL-Q13）
    await expect.poll(() => listedNames(page)).toEqual(['王小明', '王小明_眷屬', '陳大文', '李美華', '林董']);
  });

  test('同時有搜尋字與篩選而沒有結果：顯示搜尋無結果（PPL-Q16 的原型做法）', async ({ page }) => {
    await seedFilterDemo();
    await gotoPeople(page);
    await chooseOption(page, filterSelect(page, '類別'), '員工');
    await searchBox(page).fill('xyz');
    await expect(page.getByText('找不到「xyz」。', { exact: true })).toBeVisible();
  });

  test('從員工名單「查看參與資料」進來（/people?employee={id}）：以這位員工的姓名搜尋（PPL-Q19、EMP-Q07）', async ({ page }) => {
    const { lee } = await seedFilterDemo();
    await gotoPeople(page, `/people?employee=${lee}`);
    await expect(searchBox(page)).toHaveValue('李美華');
    await expect.poll(() => listedNames(page)).toEqual(['李美華']);
  });
});

test.describe('分頁（PPL-R28、docs/spec/README.md 第 14 節）', () => {
  test('共 20 位：都在第 1 頁，摘要「第 1-20 列，共 20 列」（PPL-AC21）', async ({ page }) => {
    await withDb((db) => db.guests(20, '測試貴賓'));
    await gotoPeople(page);
    await expect(page.getByText('第 1-20 列，共 20 列', { exact: true })).toBeVisible();
    await expect(personRow(page, '測試貴賓20')).toHaveCount(1);
    await expect(page.getByRole('row').filter({ has: page.getByRole('cell') })).toHaveCount(20);
  });

  test('共 21 位：第 2 頁只有 1 列，摘要「第 21-21 列，共 21 列」（PPL-AC22）', async ({ page }) => {
    await withDb((db) => db.guests(21, '測試貴賓'));
    await gotoPeople(page);
    await expect(page.getByText('第 1-20 列，共 21 列', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '下一頁' }).click();
    await expect(page.getByText('第 21-21 列，共 21 列', { exact: true })).toBeVisible();
    await expect(page.getByRole('row').filter({ has: page.getByRole('cell') })).toHaveCount(1);
    await expect.poll(() => listedNames(page)).toEqual(['測試貴賓21']);
  });

  test('共 140 位（7 頁）：頁碼 1 到 7 全部列出，沒有省略號（PPL-AC23）', async ({ page }) => {
    test.skip(isMobileWidth(page), '手機的分頁只有第一頁、上一頁、下一頁、最後一頁');
    await withDb((db) => db.guests(140, '測試貴賓'));
    await gotoPeople(page);
    const nav = page.getByRole('navigation', { name: '分頁' });
    await expect(nav.getByRole('button', { name: /^第 \d+ 頁$/ })).toHaveCount(7);
    for (let p = 1; p <= 7; p++) await expect(nav.getByRole('button', { name: `第 ${p} 頁` })).toBeVisible();
    await expect(nav.getByText('…')).toHaveCount(0);
  });

  test('共 141 位（8 頁）、在第 1 頁：頁碼有 1 與 8，中間有省略號，沒有列出全部 8 個頁碼（PPL-AC24）', async ({ page }) => {
    test.skip(isMobileWidth(page), '手機的分頁只有第一頁、上一頁、下一頁、最後一頁');
    await withDb((db) => db.guests(141, '測試貴賓'));
    await gotoPeople(page);
    const nav = page.getByRole('navigation', { name: '分頁' });
    await expect(nav.getByRole('button', { name: '第 1 頁' })).toBeVisible();
    await expect(nav.getByRole('button', { name: '第 8 頁' })).toBeVisible();
    await expect(nav.getByText('…').first()).toBeVisible();
    expect(await nav.getByRole('button', { name: /^第 \d+ 頁$/ }).count()).toBeLessThan(8);
  });

  test('搜尋改變時回到第 1 頁（PPL-Q15 的原型做法）', async ({ page }) => {
    await withDb((db) => db.guests(21, '測試貴賓'));
    await gotoPeople(page);
    await page.getByRole('button', { name: '下一頁' }).click();
    await expect(page.getByText('第 21-21 列，共 21 列', { exact: true })).toBeVisible();
    await searchBox(page).fill('測試貴賓2');
    // 測試貴賓2、測試貴賓20、測試貴賓21
    await expect(page.getByText('第 1-3 列，共 3 列', { exact: true })).toBeVisible();
  });
});

test.describe('和員工名單的連動（PPL-R12、PPL-R16）', () => {
  test.beforeEach(desktopOnly);

  test('員工名單把王小明改名為王曉明：顯示「王曉明」與「王曉明_眷屬」（PPL-AC71）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      const pWang = await db.register(wang);
      await db.dependent(pWang);
      await db.updateEmployee(wang, { name: '王曉明' });
    });
    await gotoPeople(page);
    await expect.poll(() => listedNames(page)).toEqual(['王曉明', '王曉明_眷屬']);
  });

  test('員工名單把王小明改到業務部、分機 5679：部門與分機跟著變，部門篩選「業務部」列出兩人（PPL-AC72）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      const pWang = await db.register(wang);
      await db.dependent(pWang);
      await db.updateEmployee(wang, { department: '業務部', extension: '5679' });
    });
    await gotoPeople(page);
    await expect(cellOf(personRow(page, '王小明'), '部門或單位')).toHaveText('業務部');
    await expect(cellOf(personRow(page, '王小明'), '分機')).toHaveText('5679');
    await expect(cellOf(personRow(page, '王小明_眷屬'), '部門或單位')).toHaveText('業務部');
    await chooseOption(page, filterSelect(page, '部門'), '業務部', '業務');
    await expect.poll(() => listedNames(page)).toEqual(['王小明', '王小明_眷屬']);
  });

  test('員工名單刪除王小明：王小明與眷屬都不在，第 3 桌少 2 人（PPL-AC73）', async ({ page }) => {
    const wangId = await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.fillTable(3, 1);
      const pWang = await db.register(wang, { tableId: 3 });
      await db.dependent(pWang, { tableId: 3 });
      return wang;
    });
    await withDb((db) => db.deleteEmployee(wangId));
    await gotoPeople(page);
    await expect(personRow(page, '王小明')).toHaveCount(0);
    await expect(personRow(page, '王小明_眷屬')).toHaveCount(0);
    expect(await withDb((db) => db.seatedNames(3))).toEqual(['佔位貴賓3-1']);
  });
});

test.describe('手機（767 px 以下）', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機寬度才有堆疊卡片與滿版工具列');
    await page.setViewportSize({ width: 375, height: 800 });
  });

  test('視窗 375 px：每位人員是一張卡片，有顯示名稱、類別、部門或單位、分機、標示、桌次與列操作，沒有備註；整頁沒有水平捲動（PPL-AC74、PPL-R75、PPL-R78）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.register(wang, { tableId: 3, vegetarian: true, note: '需要靠走道' });
      await db.guest('林董', { organization: '○○科技 董事長' });
    });
    await gotoPeople(page);

    // 不是表格：沒有欄位標題列
    await expect(page.getByRole('columnheader', { name: '顯示名稱' })).toBeHidden();

    const card = personRow(page, '王小明');
    await expect(card).toBeVisible();
    for (const text of ['王小明', '員工', '研發一部', '1234', '第 3 桌']) {
      await expect(card).toContainText(text);
    }
    await expect(markIn(card, '素食')).toBeVisible();
    await expect(card.getByText('需要靠走道')).toBeHidden();
    await expect(card.getByRole('button', { name: '更多操作' })).toBeVisible();

    // 卡片：欄位由上到下堆疊
    const nameBox = await boxOf(card.getByText('王小明', { exact: true }));
    const unitBox = await boxOf(card.getByText('研發一部', { exact: true }));
    expect(unitBox.y).toBeGreaterThan(nameBox.y);

    await expect(personRow(page, '林董')).toContainText('○○科技 董事長');
    await expectNoHorizontalScroll(page);
  });

  test('視窗 375 px：工具列的搜尋、類別、部門、入座狀態、桌次由上到下各自滿版（PPL-AC75、PPL-R76）', async ({ page }) => {
    await withDb(async (db) => {
      const { wang } = await demoEmployees(db);
      await db.register(wang);
    });
    await gotoPeople(page);
    const boxes: Awaited<ReturnType<typeof boxOf>>[] = [];
    for (const item of [
      searchBox(page),
      filterSelect(page, '類別'),
      filterSelect(page, '部門'),
      filterSelect(page, '入座狀態'),
      filterSelect(page, '桌次'),
    ]) {
      boxes.push(await boxOf(item));
    }
    const [first, ...rest] = boxes;
    if (!first) throw new Error('量不到工具列');
    expect(first.width).toBeGreaterThan(375 * 0.7);
    let previous = first;
    for (const box of rest) {
      expect(Math.abs(box.x - first.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(box.width - first.width)).toBeLessThanOrEqual(2);
      expect(box.y).toBeGreaterThanOrEqual(previous.y + previous.height - 1);
      previous = box;
    }
  });
});

test.describe('整頁水平捲動（PPL-R78、PPL-AC77）', () => {
  test('320、375、430、768、1024、1280 px：參與人員頁、新增人員對話框、匯入參與人員對話框都沒有整頁水平捲動', async ({ page }) => {
    test.skip(isMobileWidth(page), '各種寬度在同一個測試裡逐一設定，只跑一次');
    await withDb(async (db) => {
      const { wang, lee } = await demoEmployees(db);
      const pWang = await db.register(wang, { tableId: 3, childSeat: true, vegetarian: true, note: '這是一段比較長的備註，用來確認窄螢幕不會撐出水平捲動' });
      await db.dependent(pWang, { relation: '配偶' });
      await db.register(lee);
      await db.guest('林董', { organization: '○○科技股份有限公司 董事長兼總經理' });
    });

    for (const width of [320, 375, 430, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await gotoPeople(page);
      await expectNoHorizontalScroll(page);

      const personDialog = await openNewPersonDialog(page);
      await expectNoHorizontalScroll(page);
      await personDialog.getByRole('button', { name: '取消' }).click();
      await expect(personDialog).toBeHidden();

      const importDialog = await openImportDialog(page);
      await expectNoHorizontalScroll(page);
      await importDialog.getByRole('button', { name: '取消' }).click();
      await expect(importDialog).toBeHidden();
    }
  });
});
