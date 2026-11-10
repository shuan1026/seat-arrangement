// 深色時的各頁、對話框、選單、Sonner 與匯出：docs/spec/README.md COM-R17、COM-R18（配色只換顏色；匯出的座位表不受配色影響）、
// 第 11 節（語意 token、狀態徽章）、COM-AC19、COM-AC20；docs/spec/export.md EXP-R21（匯出一律用淺色主題的色碼）、EXP-R22；
// 設計系統 02-foundations.md「深色 Dark」（表面三層：頁面 --background、卡片與側選單 --card、浮層 --popover）；決策 D-020。
//
// COM-AC19 的「文字與背景都看得清楚」：頁面上每一段看得到的文字，和它實際的底色（半透明底色一層層疊上去）對比至少 3:1
// （helpers/theme-page.ts 的 lowContrastTexts；3:1 是 WCAG 對大字與介面元件的最低要求，用來抓「深底深字」這類看不見的情況）。
// 徽章另外確認文字色是深色主題的 --status-*-fg、對比至少 4.5:1；空桌的虛線邊框和桌次底色的對比至少 1.3:1（和淺色時相當）。
// 預期的色碼由 tests/helpers/theme-tokens.ts 從 src/styles/tokens.css 的 :root[data-theme="dark"] 算出。
// 測試資料用 tests/e2e/helpers/seating-data.ts 寫進測試資料庫，桌次用資料庫的內部編號（D-019 之後畫面上的桌號不同，這裡不看桌號）。
import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Worksheet } from 'exceljs';
import { signIn } from './helpers/auth';
import { rowOf } from './helpers/employees-page';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { personRow } from './helpers/participants-page';
import { seed } from './helpers/seating-data';
import { seatMap, zoomToRegular } from './helpers/seating-page';
import {
  chooseTheme,
  dashedBorders,
  desktopSidebar,
  expectPageTheme,
  gotoPage,
  lookOf,
  lowContrastTexts,
  openThemeMenu,
  SWITCHED,
  THEME_LABEL,
  toastWith,
  visibleHeader,
} from './helpers/theme-page';
import { colorClose, expectedSheetColors, tintWithWhite, toHex, type Rgb } from '../helpers/export-colors';
import { LAST_COLUMN, toAddress } from '../helpers/export-sheet';
import { BORDER_SIDES, borderRgb, fillRgb, loadWorkbook } from '../helpers/export-xlsx';
import { themeTokenHex, themeTokenRgb } from '../helpers/theme-tokens';

const dark = (token: string) => themeTokenHex('dark', token);

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '只在桌面檢查');

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
});

/** 在座位安排選「深色」 */
async function chooseDarkOnSeating(page: Page) {
  await gotoPage(page, '/', '座位安排');
  await chooseTheme(page, 'dark');
  await expectPageTheme(page, 'dark');
}

/**
 * 三頁都有內容的資料：
 * 內部編號 5 的桌坐 11 位（「超過」）、7 的桌坐 10 位（「已滿」）、3 的桌一位貴賓（兒童椅、素食），其餘桌是空桌（虛線）；
 * 兩位未入座（「未入座」），一位員工沒報名（「未報名」）。
 */
async function seedDemo() {
  await seed(async (s) => {
    await s.fill(5, 11, { department: '業務部', prefix: '業' });
    await s.fill(7, 10, { department: '研發部', prefix: '研' });
    await s.guest('周董事', { tableId: 3, childSeat: true, vegetarian: true, organization: '虛構科技' });
    await s.unseated(2, { department: '總務部', prefix: '待' });
    await s.employeeOnly('未報員甲', { department: '總務部' });
  });
}

/** 等某個元素（含祖先）的透明度到 1：對話框、選單、Sonner 的開啟動畫結束 */
async function waitOpaque(loc: Locator) {
  await expect.poll(async () => (await lookOf(loc)).opacity).toBe(1);
}

async function expectReadable(scope: Locator) {
  const low = await lowContrastTexts(scope);
  expect(low, `對比不足 3:1 的文字：\n${JSON.stringify(low, null, 2)}`).toEqual([]);
}

test.describe('COM-AC19 已選深色：三個頁面', () => {
  const PAGES = [
    { path: '/', heading: '座位安排', ready: (page: Page) => seatMap(page) },
    { path: '/people', heading: '參與人員', ready: (page: Page) => personRow(page, '業1').first() },
    { path: '/employees', heading: '員工名單', ready: (page: Page) => rowOf(page, '業1').first() },
  ];

  for (const p of PAGES) {
    test(`${p.heading}：整頁、Header 與側選單是深色的 token，H1 用 --foreground；所有看得到的文字和底色的對比至少 3:1`, async ({
      page,
    }) => {
      await seedDemo();
      await chooseDarkOnSeating(page);
      await gotoPage(page, p.path, p.heading);
      await expect(p.ready(page)).toBeVisible();
      await page.waitForLoadState('networkidle');

      await expectPageTheme(page, 'dark');
      expect((await lookOf(visibleHeader(page))).background, 'Header 的底色').toBe(dark('--background'));
      if (!isMobileWidth(page)) {
        expect((await lookOf(desktopSidebar(page))).background, 'Sidebar 的底色').toBe(dark('--sidebar'));
      }
      expect((await lookOf(page.getByRole('heading', { level: 1, name: p.heading }))).color, 'H1 的文字色').toBe(
        dark('--foreground'),
      );
      await expectReadable(page.locator('body'));
    });
  }

  test('座位圖：「超過」「已滿」徽章的文字是深色的 --status-pending-fg／--status-positive-fg，有自己的底色、看得清楚；空桌的虛線邊框和桌次底色分得出來', async ({
    page,
  }) => {
    desktopOnly(page);
    await seedDemo();
    await chooseDarkOnSeating(page);
    await expect(seatMap(page)).toBeVisible();
    await zoomToRegular(page);

    const over = await lookOf(seatMap(page), '超過');
    expect(over.color, '「超過」的文字色').toBe(dark('--status-pending-fg'));
    expect(over.ratio, '「超過」的對比').toBeGreaterThanOrEqual(4.5);
    expect(over.background, '「超過」要有自己的底色').not.toBe(dark('--card'));

    const full = await lookOf(seatMap(page), '已滿');
    expect(full.color, '「已滿」的文字色').toBe(dark('--status-positive-fg'));
    expect(full.ratio, '「已滿」的對比').toBeGreaterThanOrEqual(4.5);
    expect(full.background, '「已滿」要有自己的底色').not.toBe(dark('--card'));
    expect(full.background, '「已滿」與「超過」的底色不同').not.toBe(over.background);

    const dashed = await dashedBorders(seatMap(page));
    expect(dashed.length, '座位圖上要有空桌的虛線邊框').toBeGreaterThan(0);
    for (const d of dashed) {
      expect(d.ratio, `虛線 ${d.border} 在 ${d.background} 上`).toBeGreaterThanOrEqual(1.3);
      expect(d.border, '虛線用的是深色主題的顏色').not.toBe(themeTokenHex('light', '--border'));
    }
  });

  test('參與人員的「未入座」、員工名單的「已報名」「未報名」徽章：文字是深色的 --status-*-fg，看得清楚', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('甲員工', { department: '業務部' });
      await s.employeeOnly('乙員工', { department: '業務部' });
    });
    await chooseDarkOnSeating(page);

    await gotoPage(page, '/people', '參與人員');
    const unseated = await lookOf(personRow(page, '甲員工'), '未入座');
    expect(unseated.color, '「未入座」的文字色').toBe(dark('--status-pending-fg'));
    expect(unseated.ratio, '「未入座」的對比').toBeGreaterThanOrEqual(4.5);

    await gotoPage(page, '/employees', '員工名單');
    const joined = await lookOf(rowOf(page, '甲員工'), '已報名');
    expect(joined.color, '「已報名」的文字色').toBe(dark('--status-positive-fg'));
    expect(joined.ratio, '「已報名」的對比').toBeGreaterThanOrEqual(4.5);
    const notJoined = await lookOf(rowOf(page, '乙員工'), '未報名');
    expect(notJoined.color, '「未報名」的文字色').toBe(dark('--status-pending-fg'));
    expect(notJoined.ratio, '「未報名」的對比').toBeGreaterThanOrEqual(4.5);
  });

  test('對話框（新增人員）：底色是深色的 --card、標題用 --foreground；對話框裡所有文字看得清楚', async ({ page }) => {
    await seedDemo();
    await chooseDarkOnSeating(page);
    await gotoPage(page, '/people', '參與人員');

    await page.getByRole('button', { name: '新增人員', exact: true }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog', { name: '新增人員' });
    await expect(dialog).toBeVisible();
    await waitOpaque(dialog);

    const title = await lookOf(dialog.getByRole('heading', { name: '新增人員' }));
    expect(title.background, '對話框的底色').toBe(dark('--card'));
    expect(title.color, '對話框標題的文字色').toBe(dark('--foreground'));
    await expectReadable(dialog);
  });

  test('選單：介面配色選單與列操作選單的底色是深色的 --popover，標題「介面配色」用 --muted-foreground；選單裡所有文字看得清楚', async ({
    page,
  }) => {
    await seedDemo();
    await chooseDarkOnSeating(page);
    await gotoPage(page, '/people', '參與人員');

    const menu = await openThemeMenu(page);
    await waitOpaque(menu);
    expect((await lookOf(menu)).background, '介面配色選單的底色').toBe(dark('--popover'));
    expect((await lookOf(menu, THEME_LABEL)).color, '選單標題的文字色').toBe(dark('--muted-foreground'));
    await expectReadable(menu);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    await personRow(page, '業1').first().getByRole('button', { name: '更多操作' }).click();
    const rowMenu = page.getByRole('menu');
    await expect(rowMenu).toBeVisible();
    await waitOpaque(rowMenu);
    expect((await lookOf(rowMenu)).background, '列操作選單的底色').toBe(dark('--popover'));
    await expectReadable(rowMenu);
  });

  test('Sonner：「已切換為深色。」的底色是深色的 --card、文字用 --foreground，看得清楚', async ({ page }) => {
    await gotoPage(page, '/', '座位安排');
    await chooseTheme(page, 'dark');
    const toast = toastWith(page, SWITCHED.dark);
    await expect(toast).toBeVisible();
    await waitOpaque(toast);

    const look = await lookOf(toast, SWITCHED.dark);
    expect(look.background, 'Sonner 的底色').toBe(dark('--card'));
    expect(look.color, 'Sonner 的文字色').toBe(dark('--foreground'));
    await expectReadable(toast);
  });
});

// ---- COM-AC20：匯出座位表

type CellStyle = { fill: string | null; borders: (string | null)[] };

/** 工作表每一格（A 到 L 欄、到最後一列）的底色與四邊框線色碼 */
function stylesOf(ws: Worksheet): Record<string, CellStyle> {
  const out: Record<string, CellStyle> = {};
  for (let r = 1; r <= ws.rowCount; r++) {
    for (let c = 1; c <= LAST_COLUMN; c++) {
      const cell = ws.getCell(r, c);
      out[toAddress(r, c)] = { fill: fillRgb(cell), borders: BORDER_SIDES.map((side) => borderRgb(cell, side)) };
    }
  }
  return out;
}

const exportButton = (page: Page) => page.getByRole('button', { name: '匯出座位表', exact: true });

/** 按「匯出座位表」，讀回下載的工作表 */
async function downloadSheet(page: Page): Promise<Worksheet> {
  await expect(exportButton(page)).toBeEnabled();
  const downloading = page.waitForEvent('download');
  await exportButton(page).click();
  const download = await downloading;
  const ws = (await loadWorkbook(await readFile(await download.path()))).worksheets[0];
  if (!ws) throw new Error('檔案裡沒有工作表');
  return ws;
}

/** export.md 5.1 的資料甲：貴賓、兒童椅、素食、標題格四種底色都會出現 */
async function seedDataA() {
  await seed(async (s) => {
    await s.noteName(1, '主桌');
    await s.noteName(17, '供應商');
    await s.noteName(22, '客戶貴賓');
    await s.employee('王大同', { department: '總經理室', tableId: 1 });
    await s.employee('李小華', { department: '總經理室', tableId: 1 });
    await s.guest('周董事', { tableId: 1, childSeat: true, vegetarian: true });
    const chen = await s.employee('陳志明', { department: '業務部', tableId: 5 });
    await s.dependent(chen, { tableId: 5, childSeat: true });
    await s.employee('林美玲', { department: '業務部', tableId: 5, vegetarian: true });
    await s.staff('張家豪', { department: '研發部' });
    await s.guest('吳協理', { tableId: 22 });
  });
}

type Category = 'guest' | 'childSeat' | 'vegetarian' | 'header';
const CATEGORIES: readonly Category[] = ['guest', 'childSeat', 'vegetarian', 'header'];

test.describe('COM-AC20 匯出座位表不受配色影響（EXP-R21）', () => {
  test('已選深色 → 匯出 → 每一格的底色與框線和淺色時匯出的相同；底色與框線都是淺色主題的色碼', async ({ page }) => {
    desktopOnly(page);
    await seedDataA();
    await gotoPage(page, '/people', '參與人員');
    const light = stylesOf(await downloadSheet(page));

    await chooseTheme(page, 'dark');
    await expectPageTheme(page, 'dark');
    const darkSheet = stylesOf(await downloadSheet(page));

    expect(darkSheet).toEqual(light);

    // 色碼是淺色主題的 token 換算的（EXP-Q04 的目前假設），不是深色主題的
    const LIGHT = expectedSheetColors();
    const DARK: Record<Category | 'border', Rgb> = {
      guest: tintWithWhite(themeTokenRgb('dark', '--chart-cat-2'), 24),
      childSeat: tintWithWhite(themeTokenRgb('dark', '--chart-cat-4'), 34),
      vegetarian: tintWithWhite(themeTokenRgb('dark', '--chart-cat-5'), 26),
      header: themeTokenRgb('dark', '--muted'),
      border: themeTokenRgb('dark', '--semantic-border'),
    };
    const fills = new Set(Object.values(darkSheet).flatMap((s) => (s.fill ? [s.fill] : [])));
    expect(fills.size, `底色：${[...fills].join(', ')}`).toBe(4);
    for (const fill of fills) {
      expect(
        CATEGORIES.filter((k) => colorClose(fill, LIGHT[k])),
        `${fill} 不是淺色主題的底色`,
      ).toHaveLength(1);
      expect(
        CATEGORIES.filter((k) => colorClose(fill, DARK[k], 3)),
        `${fill} 是深色主題換算的底色（深色：${CATEGORIES.map((k) => toHex(DARK[k])).join(', ')}）`,
      ).toEqual([]);
    }
    const borders = new Set(Object.values(darkSheet).flatMap((s) => s.borders.filter((b): b is string => b !== null)));
    expect(borders.size).toBeGreaterThan(0);
    for (const b of borders) {
      expect(colorClose(b, LIGHT.border), `框線 ${b} 不是淺色主題的 --semantic-border`).toBe(true);
      expect(colorClose(b, DARK.border, 3), `框線 ${b} 是深色主題的 --semantic-border`).toBe(false);
    }
  });
});
