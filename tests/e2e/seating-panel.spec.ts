// 人員面板與找人：docs/spec/seating.md 2.2、4.2；SEAT-R52～R62；SEAT-AC50～AC64；
// docs/spec/README.md COM-R11、COM-R14、COM-AC14。
// 面板的列表、搜尋、篩選、空狀態、列操作在桌面與手機（「人員」分頁）都測；找人與面板收合只在桌面測。
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { seed } from './helpers/seating-data';
import {
  expectStats,
  hasBorderColor,
  isInside,
  mapTable,
  menuItemsOf,
  openSeating,
  openTableDetail,
  panelSearch,
  panelTab,
  peoplePanel,
  personRow,
  seatMap,
  showPeople,
  tableButton,
  toolbarButton,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
});

const rows = (page: Page) => peoplePanel(page).getByRole('listitem');
const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面版面');

async function open(page: Page) {
  await openSeating(page);
  await showPeople(page);
}

async function pick(page: Page, field: '部門' | '類別', option: string) {
  await peoplePanel(page).getByRole('combobox', { name: field }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test.describe('分頁（SEAT-R53、SEAT-R47）', () => {
  test('預設「未入座」分頁：只有未入座、不是工作人員的人，人數不含工作人員；「全部」列出所有參與人員，含工作人員（SEAT-AC50）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.employee('王小明');
      await s.employee('李小華');
      await s.employee('甲', { tableId: 3 });
      await s.staff('工作甲');
    });
    await open(page);

    await expect(panelTab(page, '未入座')).toHaveAttribute('aria-selected', 'true');
    await expect(panelTab(page, '未入座')).toHaveText(/^未入座\s*2$/);
    await expect(panelTab(page, '全部')).toHaveText(/^全部\s*4$/);
    await expect(rows(page)).toHaveCount(2);
    await expect(personRow(page, '工作甲')).toHaveCount(0);

    await panelTab(page, '全部').click();
    await expect(rows(page)).toHaveCount(4);
    await expect(personRow(page, '工作甲')).toHaveCount(1);
  });

  test('「全部」分頁第二行右側：已入座「第 {n} 桌」、未入座「未入座」、工作人員「工作人員」（SEAT-R57）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 3 });
      await s.employee('李小華');
      await s.staff('工作甲');
    });
    await open(page);
    await panelTab(page, '全部').click();
    await expect(personRow(page, '王小明').getByRole('button', { name: '第 3 桌', exact: true })).toBeVisible();
    await expect(personRow(page, '李小華')).toContainText('未入座');
    await expect(personRow(page, '工作甲')).toContainText('工作人員');
  });

  test('只列參與人員：員工名單上還沒報名的人不會出現（SEAT-R52）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明');
      await s.employeeOnly('未報名甲');
    });
    await open(page);
    await panelTab(page, '全部').click();
    await expect(rows(page)).toHaveCount(1);
    await expect(personRow(page, '未報名甲')).toHaveCount(0);
  });
});

test.describe('人員列（SEAT-R56、2.2.2、COM-R11）', () => {
  test('第二行：員工與眷屬「{部門}・{組別}」，沒有組別只顯示部門；外部貴賓顯示單位／頭銜；不放分機；外部貴賓有「貴賓」徽章（SEAT-AC61）', async ({
    page,
  }) => {
    await seed(async (s) => {
      const wang = await s.employee('王小明', { department: '研發一部', team: '前端組', extension: '1234' });
      await s.dependent(wang);
      await s.employee('陳大文', { department: '研發一部', extension: '5678' });
      await s.guest('林董', { organization: '測試科技 董事長' });
    });
    await open(page);

    await expect(personRow(page, '王小明')).toContainText('研發一部・前端組');
    await expect(personRow(page, '王小明_眷屬')).toContainText('研發一部・前端組');
    await expect(personRow(page, '陳大文')).toContainText('研發一部');
    await expect(personRow(page, '陳大文')).not.toContainText('・');
    await expect(personRow(page, '林董')).toContainText('測試科技 董事長');
    await expect(personRow(page, '林董').getByText('貴賓', { exact: true })).toBeVisible();
    for (const name of ['王小明', '陳大文']) {
      await expect(personRow(page, name)).not.toContainText('1234');
      await expect(personRow(page, name)).not.toContainText('5678');
      await expect(personRow(page, name)).not.toContainText('分機');
    }
  });

  test('部門名稱很長時，部門截斷、組別完整顯示（SEAT-AC61、2.2.2）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('長部門員', { department: '非常非常長的部門名稱用來測試截斷效果的研發處第一部門', team: '後端組' });
    });
    await open(page);
    const row = personRow(page, '長部門員');
    const team = row.getByText('後端組');
    await expect(team).toBeVisible();
    expect(await team.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await isInside(team, row)).toBe(true);
  });

  test('列操作依人員狀態（SEAT-R58、2.2.3、SEAT-AC62）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('未坐員工');
      const seatedEmp = await s.employee('已坐員工', { tableId: 3 });
      await s.dependent(seatedEmp, { tableId: 3 });
      await s.guest('未坐貴賓');
      await s.guest('已坐貴賓', { tableId: 4 });
      const host = await s.employee('有眷屬員工', { tableId: 5 });
      await s.dependent(host);
      await s.staff('工作甲');
    });
    await open(page);
    await panelTab(page, '全部').click();

    expect(await menuItemsOf(page, personRow(page, '未坐員工'))).toEqual(['入座…', '編輯', '取消報名']);
    expect(await menuItemsOf(page, personRow(page, '有眷屬員工_眷屬'))).toEqual(['入座…', '編輯', '刪除']);
    expect(await menuItemsOf(page, personRow(page, '未坐貴賓'))).toEqual(['入座…', '編輯', '刪除']);
    expect(await menuItemsOf(page, personRow(page, '已坐員工'))).toEqual(['移至其他桌次…', '移出桌次', '編輯', '取消報名']);
    expect(await menuItemsOf(page, personRow(page, '已坐員工_眷屬'))).toEqual(['移至其他桌次…', '移出桌次', '編輯', '刪除']);
    expect(await menuItemsOf(page, personRow(page, '已坐貴賓'))).toEqual(['移至其他桌次…', '移出桌次', '編輯', '刪除']);
    expect(await menuItemsOf(page, personRow(page, '工作甲'))).toEqual(['移出工作人員桌', '編輯', '取消報名']);
  });
});

test.describe('搜尋與篩選（SEAT-R54、SEAT-R55）', () => {
  test('用分機、組別、外部貴賓的單位搜尋（SEAT-AC51、COM-R14、COM-AC14）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明', { department: '研發一部', team: '前端組', extension: '1234' });
      await s.employee('陳大文', { department: '研發一部', team: '前端組' });
      await s.employee('李小華', { department: '業務部' });
      await s.guest('林董', { organization: '測試科技 董事長' });
    });
    await open(page);
    await expect(panelSearch(page)).toBeVisible();

    await panelSearch(page).fill('1234');
    await expect(rows(page)).toHaveCount(1);
    await expect(personRow(page, '王小明')).toHaveCount(1);
    await expect(personRow(page, '王小明')).not.toContainText('1234');

    await panelSearch(page).fill('前端組');
    await expect(rows(page)).toHaveCount(2);
    await expect(personRow(page, '陳大文')).toHaveCount(1);

    await panelSearch(page).fill('測試科技');
    await expect(rows(page)).toHaveCount(1);
    await expect(personRow(page, '林董')).toHaveCount(1);
  });

  test('部門篩選（第一項「不限」、可搜尋「搜尋部門」）列出該部門員工與眷屬；再選類別「眷屬」；切換分頁時篩選保留（SEAT-AC52）', async ({ page }) => {
    await seed(async (s) => {
      const wang = await s.employee('王小明', { department: '研發一部' });
      await s.dependent(wang);
      await s.employee('陳大文', { department: '研發一部' });
      const lee = await s.employee('李小華', { department: '業務部' });
      await s.dependent(lee);
      await s.guest('林董');
    });
    await open(page);

    await peoplePanel(page).getByRole('combobox', { name: '部門' }).click();
    await expect(page.getByRole('option').first()).toHaveText('不限');
    await expect(page.getByPlaceholder('搜尋部門')).toBeVisible();
    await page.getByRole('option', { name: '研發一部', exact: true }).click();
    await expect(rows(page)).toHaveCount(3);
    for (const name of ['王小明', '王小明_眷屬', '陳大文']) await expect(personRow(page, name)).toHaveCount(1);

    await peoplePanel(page).getByRole('combobox', { name: '類別' }).click();
    expect((await page.getByRole('option').allInnerTexts()).map((t) => t.trim())).toEqual(['不限', '員工', '眷屬', '外部貴賓']);
    await page.getByRole('option', { name: '眷屬', exact: true }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(personRow(page, '王小明_眷屬')).toHaveCount(1);

    await panelTab(page, '全部').click();
    await expect(rows(page)).toHaveCount(1);
    await expect(personRow(page, '王小明_眷屬')).toHaveCount(1);
  });

  test('搜尋字在兩個分頁共用，切換分頁時保留（SEAT-R55）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明');
      await s.employee('王大同', { tableId: 3 });
      await s.employee('李小華');
    });
    await open(page);
    await panelSearch(page).fill('王');
    await expect(rows(page)).toHaveCount(1);
    await panelTab(page, '全部').click();
    await expect(panelSearch(page)).toHaveValue('王');
    await expect(rows(page)).toHaveCount(2);
  });
});

test.describe('空狀態（SEAT-R59、SEAT-R60）', () => {
  test('「未入座」搜尋到 1 位已入座的人：「{顯示名稱} 已入座，在第 {n} 桌。」；按「在全部中查看」切到「全部」、保留搜尋字（SEAT-AC53）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 3 });
      await s.employee('李小華');
    });
    await open(page);
    await panelSearch(page).fill('王小明');
    await expect(peoplePanel(page).getByText('王小明 已入座，在第 3 桌。')).toBeVisible();
    await peoplePanel(page).getByRole('button', { name: '在全部中查看' }).click();
    await expect(panelTab(page, '全部')).toHaveAttribute('aria-selected', 'true');
    await expect(panelSearch(page)).toHaveValue('王小明');
    await expect(personRow(page, '王小明')).toHaveCount(1);
  });

  test('「未入座」搜尋到 1 位工作人員：「{顯示名稱} 在工作人員桌。」（SEAT-AC54）', async ({ page }) => {
    await seed(async (s) => {
      await s.staff('王小明');
      await s.employee('李小華');
    });
    await open(page);
    await panelSearch(page).fill('王小明');
    await expect(peoplePanel(page).getByText('王小明 在工作人員桌。')).toBeVisible();
    await expect(peoplePanel(page).getByRole('button', { name: '在全部中查看' })).toBeVisible();
  });

  test('「未入座」搜尋到 2 位以上已入座的人：「未入座裡找不到「{關鍵字}」。」「全部有 {n} 位符合。」與「在全部中查看」（SEAT-AC55）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 3 });
      await s.employee('王大同', { tableId: 4 });
      await s.employee('王美美', { tableId: 5 });
      await s.employee('李小華');
    });
    await open(page);
    await panelSearch(page).fill('王');
    await expect(peoplePanel(page).getByText('未入座裡找不到「王」。')).toBeVisible();
    await expect(peoplePanel(page).getByText('全部有 3 位符合。')).toBeVisible();
    await expect(peoplePanel(page).getByRole('button', { name: '在全部中查看' })).toBeVisible();
  });

  test('搜尋沒有結果：「找不到「xyz」。」，按「清除搜尋」清空搜尋框、清單恢復（SEAT-AC56）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明');
      await s.employee('李小華');
    });
    await open(page);
    await panelSearch(page).fill('xyz');
    await expect(peoplePanel(page).getByText('找不到「xyz」。')).toBeVisible();
    await peoplePanel(page).getByRole('button', { name: '清除搜尋' }).click();
    await expect(panelSearch(page)).toHaveValue('');
    await expect(rows(page)).toHaveCount(2);
  });

  test('沒有搜尋字、篩選到沒有人：「找不到符合條件的人員。」，按「清除篩選」兩個篩選都回到不限（SEAT-AC57）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('李小華', { department: '業務部' });
      await s.guest('林董');
    });
    await open(page);
    await pick(page, '部門', '業務部');
    await pick(page, '類別', '外部貴賓');
    await expect(peoplePanel(page).getByText('找不到符合條件的人員。')).toBeVisible();
    await peoplePanel(page).getByRole('button', { name: '清除篩選' }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(peoplePanel(page).getByRole('combobox', { name: '部門' })).not.toContainText('業務部');
    await expect(peoplePanel(page).getByRole('combobox', { name: '類別' })).not.toContainText('外部貴賓');
  });

  test('沒有任何參與人員：「還沒有參與人員。」與說明、「前往員工名單」；座位圖 30 桌都是空桌；統計列全為 0（SEAT-AC58）', async ({ page }) => {
    await seed(async (s) => {
      await s.employeeOnly('未報名甲');
    });
    await openSeating(page);
    await expectStats(page, { seated: 0, total: 0, unseated: 0, empty: 300, full: 0 });
    for (let n = 1; n <= 30; n++) await expect(mapTable(page, n), `第 ${n} 桌`).toContainText('0/10');
    if (!isMobileWidth(page)) {
      await toolbarButton(page, '全部展開').click();
      for (let n = 1; n <= 30; n++) await expect(mapTable(page, n), `第 ${n} 桌`).toContainText('空桌');
    }

    await showPeople(page);
    await expect(peoplePanel(page).getByText('還沒有參與人員。')).toBeVisible();
    await expect(peoplePanel(page)).toContainText('到員工名單把報名的員工加入尾牙，或新增貴賓與眷屬後，就可以開始安排座位。');
    const go = peoplePanel(page)
      .getByRole('link', { name: '前往員工名單' })
      .or(peoplePanel(page).getByRole('button', { name: '前往員工名單' }));
    await go.click();
    await expect(page).toHaveURL((url) => url.pathname === '/employees');
  });

  test('非工作人員都已入座：「所有人都已入座。」「新增人員後會出現在這裡。」（SEAT-AC59）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 3 });
      await s.staff('工作甲');
    });
    await open(page);
    await expect(peoplePanel(page).getByText('所有人都已入座。')).toBeVisible();
    await expect(peoplePanel(page).getByText('新增人員後會出現在這裡。')).toBeVisible();
    await expect(panelTab(page, '未入座')).toHaveText(/^未入座\s*0$/);
  });
});

test.describe('找人（SEAT-R62）', () => {
  test('按「全部」分頁的「第 12 桌」：座位圖捲到第 12 桌、2 px --accent 邊框 4 秒後恢復；詳情打開時第 12 桌不被蓋住（SEAT-AC60）', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 12 });
      await s.fill(3, 1);
    });
    await openSeating(page);
    for (let i = 0; i < 25; i++) await toolbarButton(page, '放大').click();
    await panelTab(page, '全部').click();

    await personRow(page, '王小明').getByRole('button', { name: '第 12 桌', exact: true }).click();
    await expect.poll(() => isInside(mapTable(page, 12), seatMap(page))).toBe(true);
    await expect.poll(() => hasBorderColor(page, mapTable(page, 12), '--accent', '2px')).toBe(true);
    await expect.poll(() => hasBorderColor(page, mapTable(page, 12), '--accent', '2px'), { timeout: 7000 }).toBe(false);

    await openTableDetail(page, 3);
    await personRow(page, '王小明').getByRole('button', { name: '第 12 桌', exact: true }).click();
    await expect.poll(() => isInside(mapTable(page, 12), seatMap(page))).toBe(true);
    const table = await mapTable(page, 12).boundingBox();
    const detail = await page
      .getByRole('region', { name: '第 3 桌', exact: true })
      .or(page.getByRole('dialog', { name: '第 3 桌', exact: true }))
      .boundingBox();
    if (!table || !detail) throw new Error('量不到第 12 桌或詳情');
    expect(table.x + table.width <= detail.x || table.x >= detail.x + detail.width, '第 12 桌不被詳情蓋住').toBe(true);
  });
});

test.describe('收合人員面板（SEAT-R61、SEAT-R70）', () => {
  test('按收合鈕：面板收起、座位圖佔滿寬度、工具列出現「顯示人員面板」；按下後恢復；收合後重新開啟仍收合（SEAT-AC63）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.employee('王小明');
    });
    await openSeating(page);
    const before = await seatMap(page).boundingBox();

    await peoplePanel(page).getByRole('button', { name: '隱藏人員面板' }).click();
    await expect(peoplePanel(page)).toBeHidden();
    await expect(toolbarButton(page, '顯示人員面板')).toBeVisible();
    const wide = await seatMap(page).boundingBox();
    expect((wide?.width ?? 0) - (before?.width ?? 0)).toBeGreaterThanOrEqual(200);

    await toolbarButton(page, '顯示人員面板').click();
    await expect(peoplePanel(page)).toBeVisible();
    await expect(toolbarButton(page, '顯示人員面板')).toHaveCount(0);

    await peoplePanel(page).getByRole('button', { name: '隱藏人員面板' }).click();
    await openSeating(page);
    await expect(peoplePanel(page)).toBeHidden();
    await expect(toolbarButton(page, '顯示人員面板')).toBeVisible();
  });

  test('沒有手動開關過：1000 px 寬預設收合、1280 px 寬預設顯示（SEAT-AC64）', async ({ page }) => {
    desktopOnly(page);
    await seed(async () => {});
    await page.setViewportSize({ width: 1000, height: 800 });
    await openSeating(page);
    await expect(peoplePanel(page)).toBeHidden();
    await expect(toolbarButton(page, '顯示人員面板')).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await openSeating(page);
    await expect(peoplePanel(page)).toBeVisible();
    await expect(toolbarButton(page, '顯示人員面板')).toHaveCount(0);
  });

  test('面板寬 280 px（2.2.1）', async ({ page }) => {
    desktopOnly(page);
    await seed(async () => {});
    await openSeating(page);
    const box = await peoplePanel(page).boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(280);
    await expect(tableButton(page, 1)).toBeVisible();
  });
});
