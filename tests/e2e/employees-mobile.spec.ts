// 員工名單的手機版（767 px 以下）：docs/spec/employees.md 第 2.1～2.7 節的「手機」列、EMP-R26，
// 驗收條件 EMP-AC76～AC79；README 第 9 節（對話框寬度隨視窗縮小、按鈕滿版堆疊、主要按鈕在上；不可整頁水平捲動）、COM-AC11。
// 只在 mobile-320 project 跑；EMP-AC76、AC77、AC79 指定 375 px，測試內改視窗寬度。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { closeDb, insertEmployees, registerEmployee, resetData } from './helpers/employees-db';
import {
  HEADER_CHECKBOX,
  boxOf,
  bulkButton,
  filterTrigger,
  gotoEmployees,
  openRowMenu,
  pageButton,
  pickBox,
  rowOf,
  searchBox,
  takenBox,
} from './helpers/employees-page';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';

test.beforeEach(async ({ context, baseURL, page }) => {
  test.skip(!isMobileWidth(page), '只在手機寬度驗證');
  await resetData();
  await signIn(context, requireBaseURL(baseURL));
});

test.afterAll(async () => {
  await resetData();
  await closeDb();
});

const NOTE = '只給承辦人看的備註';

/** 王小明（未報名，有英文名、組別、分機、地區與備註）、李小華（已報名）、張三（未報名） */
async function seed() {
  const [, li] = await insertEmployees([
    {
      name: '王小明',
      englishName: 'Xiaoming',
      department: '業務部',
      team: '北區組',
      extension: '1234',
      region: '台北',
      note: NOTE,
    },
    { name: '李小華', department: '研發部', team: '韌體組', extension: '2001', region: '台中' },
    { name: '張三', department: '研發部', team: '韌體組', extension: '2002', region: '台北' },
  ]);
  await registerEmployee(li!);
}

const at375 = (page: Page) => page.setViewportSize({ width: 375, height: 800 });

/** 對話框在手機上：寬度隨視窗縮小（左右各留 16 px）、按鈕滿版堆疊、主要按鈕或確認鈕在最上面 */
async function expectMobileDialog(page: Page, dialog: Locator, primary: string, secondary: string) {
  const viewport = page.viewportSize()?.width ?? 0;
  const box = await boxOf(dialog);
  expect(box.width, '對話框寬度隨視窗縮小').toBeLessThanOrEqual(viewport - 32 + 1);
  expect(box.x).toBeGreaterThanOrEqual(16 - 1);

  const main = await boxOf(dialog.getByRole('button', { name: primary, exact: true }));
  const other = await boxOf(dialog.getByRole('button', { name: secondary, exact: true }));
  expect(main.y + main.height, `「${primary}」在「${secondary}」上面`).toBeLessThanOrEqual(other.y + 1);
  expect(Math.abs(main.width - other.width), '按鈕同寬').toBeLessThanOrEqual(1);
  expect(Math.abs(main.x - other.x), '按鈕左右對齊').toBeLessThanOrEqual(1);
  expect(main.width, '按鈕滿版').toBeGreaterThan(box.width * 0.7);
}

test('EMP-AC76：375 px → 工具列依序堆疊搜尋、篩選、主要動作；表格改成堆疊卡片，不顯示備註；勾選框在卡片左上角；沒有全選（2.2、2.3、EMP-R26）', async ({
  page,
}) => {
  await at375(page);
  await seed();
  await gotoEmployees(page);

  // 卡片：姓名（下方英文名）、部門、組別、分機、地區、報名狀態，不顯示備註
  const card = rowOf(page, '王小明');
  for (const text of ['王小明', 'Xiaoming', '業務部', '北區組', '1234', '台北', '未報名']) {
    await expect(card.getByText(text, { exact: true }).first()).toBeVisible();
  }
  await expect(card.getByText(NOTE)).toBeHidden();
  const name = await boxOf(card.getByText('王小明', { exact: true }));
  const english = await boxOf(card.getByText('Xiaoming', { exact: true }));
  expect(english.y).toBeGreaterThanOrEqual(name.y + name.height - 1);

  // 勾選框在卡片左上角
  const cardBox = await boxOf(card);
  const check = await boxOf(pickBox(page, '王小明'));
  expect(check.x - cardBox.x).toBeLessThanOrEqual(40);
  expect(check.y - cardBox.y).toBeLessThanOrEqual(40);
  expect(check.x).toBeLessThan(name.x);
  expect(check.y).toBeLessThanOrEqual(name.y + name.height);

  // 沒有全選
  await expect(page.getByRole('checkbox', { name: HEADER_CHECKBOX })).toBeHidden();

  // 工具列：搜尋 → 篩選 → 主要動作（勾選後出現的批次按鈕）
  await pickBox(page, '王小明').click();
  const search = await boxOf(searchBox(page));
  const filters = await Promise.all((['部門', '組別', '地區'] as const).map((f) => boxOf(filterTrigger(page, f))));
  const bulk = await boxOf(bulkButton(page, 1));
  const filtersTop = Math.min(...filters.map((b) => b.y));
  const filtersBottom = Math.max(...filters.map((b) => b.y + b.height));
  expect(search.y + search.height, '搜尋在篩選上面').toBeLessThanOrEqual(filtersTop + 1);
  expect(filtersBottom, '篩選在主要動作上面').toBeLessThanOrEqual(bulk.y + 1);

  await expectNoHorizontalScroll(page);
});

test('EMP-AC77：375 px → 勾選 2 張未報名的卡片 →「加入尾牙（2 位）」→ 確認對話框；已報名員工的卡片勾選框停用（EMP-R26、R22）', async ({
  page,
}) => {
  await at375(page);
  await seed();
  await gotoEmployees(page);

  await expect(takenBox(page, '李小華')).toBeDisabled();
  await pickBox(page, '王小明').click();
  await pickBox(page, '張三').click();
  await expect(bulkButton(page, 2)).toBeVisible();

  await bulkButton(page, 2).click();
  const dialog = page.getByRole('alertdialog', { name: '要把 2 位員工加入尾牙嗎？' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('只加入員工本人，眷屬請之後在參與人員補上。')).toBeVisible();
  await expectMobileDialog(page, dialog, '加入尾牙', '取消');
  // 按下「加入尾牙」之後的結果（同 EMP-AC30）在 tests/unit/components/employees-page.test.tsx 以假的 API 驗證，階段 3 接上 B 線的 API 後再測
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toBeHidden();
});

test('EMP-AC78：320 px → 搜尋框的提示文字完整顯示、沒有截斷；沒有整頁水平捲動（EMP-R11、2.1）', async ({ page }) => {
  await seed();
  await gotoEmployees(page);
  expect(page.viewportSize()?.width).toBe(320);

  const input = searchBox(page);
  await expect(input).toBeVisible();
  const fit = await input.evaluate((el) => {
    const input = el as HTMLInputElement;
    const s = getComputedStyle(input);
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return { text: Number.POSITIVE_INFINITY, available: 0 };
    ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const text = ctx.measureText(input.placeholder).width;
    const available = input.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    return { text, available };
  });
  expect(fit.text, '提示文字的寬度不超過輸入框可用的寬度').toBeLessThanOrEqual(fit.available);
  await expectNoHorizontalScroll(page);
});

test('EMP-AC79：375 px → 新增員工對話框、刪除確認與匯入對話框的寬度隨視窗縮小，按鈕滿版堆疊，主要按鈕或確認鈕在最上面（2.4、2.5、2.7）', async ({
  page,
}) => {
  await at375(page);
  await seed();
  await gotoEmployees(page);

  await pageButton(page, '新增員工').click();
  const add = page.getByRole('dialog', { name: '新增員工' });
  await expect(add).toBeVisible();
  await expectMobileDialog(page, add, '新增員工', '取消');
  await add.getByRole('button', { name: '取消', exact: true }).click();
  await expect(add).toBeHidden();

  const menu = await openRowMenu(page, rowOf(page, '張三'));
  await menu.getByRole('menuitem', { name: '刪除' }).click();
  const confirm = page.getByRole('alertdialog', { name: '要刪除 張三 嗎？' });
  await expect(confirm).toBeVisible();
  await expectMobileDialog(page, confirm, '刪除員工', '取消');
  await confirm.getByRole('button', { name: '取消', exact: true }).click();
  await expect(confirm).toBeHidden();

  await pageButton(page, '匯入員工名單').click();
  const importer = page.getByRole('dialog', { name: '匯入員工名單' });
  await expect(importer).toBeVisible();
  await expectMobileDialog(page, importer, '開始匯入', '取消');
});

test('320 px 開著新增員工、編輯員工、刪除確認與匯入對話框時也沒有整頁水平捲動（COM-AC11）', async ({ page }) => {
  await seed();
  await gotoEmployees(page);

  await pageButton(page, '新增員工').click();
  await expect(page.getByRole('dialog', { name: '新增員工' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.keyboard.press('Escape');

  let menu = await openRowMenu(page, rowOf(page, '王小明'));
  await menu.getByRole('menuitem', { name: '編輯' }).click();
  await expect(page.getByRole('dialog', { name: '編輯員工' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.keyboard.press('Escape');

  menu = await openRowMenu(page, rowOf(page, '王小明'));
  await menu.getByRole('menuitem', { name: '刪除' }).click();
  await expect(page.getByRole('alertdialog', { name: '要刪除 王小明 嗎？' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.keyboard.press('Escape');

  await pageButton(page, '匯入員工名單').click();
  await expect(page.getByRole('dialog', { name: '匯入員工名單' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('320 px 開著篩選與列操作選單時沒有整頁水平捲動，選單不被裁切（2.2、COM-AC11）', async ({ page }) => {
  await seed();
  await gotoEmployees(page);

  await filterTrigger(page, '部門').click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const box = await boxOf(listbox);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await expectNoHorizontalScroll(page);
  await page.keyboard.press('Escape');

  const menu = await openRowMenu(page, rowOf(page, '王小明'));
  const menuBox = await boxOf(menu);
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(320);
  await expectNoHorizontalScroll(page);
});
