// 共用頁首 PageHead（src/components/shell/page-head.tsx）：員工名單頁與參與人員頁都用它。
// 767 px 以下，頁首的動作按鈕滿版、上下堆疊、主要按鈕在最上面，放在標題下方、工具列上方；桌面在標題右側排成一列。
// 依據：原型 ui-design-system/source-reference/html/prototype/prototype.css 的 .page-head、.page-actions 與手機規則
// （.page-actions { width: 100% }、.page-actions > .btn { flex: 1 1 100% }）；docs/spec/employees.md 2.1（頁首右側「新增員工」
// 「匯入員工名單」）、EMP-AC79 附近的手機規則；participants.md 2.1（頁首右側依序「新增人員」「匯入參與人員」「匯出座位表」）、
// 待確認 PPL-Q17 照原型（手機三個按鈕滿版放在標題下方、工具列上方）；docs/spec/README.md 第 9 節（不能整頁水平捲動）。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { cssVarBackground, backgroundOf, gotoEmployees } from './helpers/employees-page';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { gotoPeople, searchBox as peopleSearch } from './helpers/participants-page';
import { seed } from './helpers/seating-data';

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
  await seed(async (s) => {
    await s.employee('王小明', { department: '業務部' });
    await s.employeeOnly('李小華', { department: '研發部' });
  });
});

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('量不到元素的位置');
  return box;
}

/** 內容區（main 去掉左右內距）的左右邊界 */
async function contentEdges(page: Page): Promise<{ left: number; right: number }> {
  return page.getByRole('main').evaluate((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { left: r.left + parseFloat(s.paddingLeft), right: r.right - parseFloat(s.paddingRight) };
  });
}

/** 頁首的按鈕（頁首在空狀態之前，同名按鈕取第一個） */
const headButtons = (page: Page, names: readonly string[]) =>
  names.map((name) => page.getByRole('main').getByRole('button', { name, exact: true }).first());

const PAGES = [
  {
    label: '員工名單',
    open: (page: Page) => gotoEmployees(page),
    buttons: ['新增員工', '匯入員工名單'],
    toolbarFirst: (page: Page) => page.getByPlaceholder('搜尋姓名、分機、部門或組別'),
  },
  {
    label: '參與人員',
    open: (page: Page) => gotoPeople(page),
    buttons: ['新增人員', '匯入參與人員', '匯出座位表'],
    toolbarFirst: (page: Page) => peopleSearch(page),
  },
] as const;

/** 手機：每個按鈕都和內容區同寬、由上到下依序堆疊，在標題下方、工具列上方；第一個是主要按鈕 */
async function expectMobileHead(page: Page, p: (typeof PAGES)[number]) {
  const edges = await contentEdges(page);
  const title = await boxOf(page.getByRole('heading', { level: 1, name: p.label }));
  const boxes: Box[] = [];
  for (const button of headButtons(page, p.buttons)) {
    await expect(button).toBeVisible();
    boxes.push(await boxOf(button));
  }
  boxes.forEach((b, i) => {
    const name = p.buttons[i];
    expect(Math.abs(b.x - edges.left), `「${name}」左邊對齊內容區`).toBeLessThanOrEqual(1);
    expect(Math.abs(b.x + b.width - edges.right), `「${name}」右邊對齊內容區（滿版）`).toBeLessThanOrEqual(1);
  });
  expect(boxes[0]!.y, '按鈕在標題下方').toBeGreaterThanOrEqual(title.y + title.height - 1);
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i]!.y, `「${p.buttons[i]}」在「${p.buttons[i - 1]}」下面`).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height - 1);
  }
  const toolbar = await boxOf(p.toolbarFirst(page));
  const last = boxes[boxes.length - 1]!;
  expect(toolbar.y, '按鈕在工具列上方').toBeGreaterThanOrEqual(last.y + last.height - 1);

  // 主要按鈕在最上面：第一個按鈕是 Button primary（底色 --primary）
  await page.mouse.move(0, 0);
  const [first] = headButtons(page, p.buttons);
  expect(await backgroundOf(first!)).toBe(await cssVarBackground(page, '--primary'));
}

test.describe('手機（767 px 以下）：頁首按鈕滿版、上下堆疊、主要按鈕在最上面', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機寬度');
  });

  for (const p of PAGES) {
    test(`${p.label}頁：320、375、430 px 頁首的按鈕都滿版堆疊，主要按鈕在最上面；沒有整頁水平捲動`, async ({ page }) => {
      for (const width of [320, 375, 430]) {
        await page.setViewportSize({ width, height: 800 });
        await p.open(page);
        await test.step(`${width} px`, async () => {
          await expectMobileHead(page, p);
          await expectNoHorizontalScroll(page);
        });
      }
    });
  }

  test('參與人員頁沒有任何參與人員時（空狀態），頁首的三個按鈕仍然滿版堆疊', async ({ page }) => {
    await seed(async (s) => {
      await s.employeeOnly('李小華', { department: '研發部' });
    });
    await gotoPeople(page);
    await expect(page.getByText('還沒有參與人員。', { exact: true })).toBeVisible();
    const edges = await contentEdges(page);
    const boxes: Box[] = [];
    for (const button of headButtons(page, PAGES[1].buttons)) boxes.push(await boxOf(button));
    for (const b of boxes) expect(Math.abs(b.width - (edges.right - edges.left))).toBeLessThanOrEqual(1);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height - 1);
  });
});

test.describe('桌面：頁首按鈕在標題右側排成一列', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(isMobileWidth(page), '桌面寬度');
  });

  for (const p of PAGES) {
    test(`${p.label}頁：按鈕依序（${p.buttons.join('、')}）在同一列、標題右側，不是滿版`, async ({ page }) => {
      await p.open(page);
      const edges = await contentEdges(page);
      const title = await boxOf(page.getByRole('heading', { level: 1, name: p.label }));
      const boxes: Box[] = [];
      for (const button of headButtons(page, p.buttons)) boxes.push(await boxOf(button));
      for (let i = 1; i < boxes.length; i++) {
        expect(Math.abs(boxes[i]!.y - boxes[0]!.y), '同一列').toBeLessThanOrEqual(1);
        expect(boxes[i]!.x, '依序由左到右').toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width - 1);
      }
      expect(boxes[0]!.x, '在標題右側').toBeGreaterThan(title.x + title.width);
      expect(boxes[0]!.width, '桌面不是滿版').toBeLessThan((edges.right - edges.left) / 2);
    });
  }
});
