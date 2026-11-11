// 發布頁 /seats：docs/spec/permissions.md v1.1 第 2.3 節（版面、工具列、搜尋、座位圖、桌次名單、未發布、狀態、手機）、PRM-R21～R34、
// 第 4.3 節文案；驗收條件 PRM-AC23～AC36；待確認 PRM-Q01（已報名但未入座的人搜尋自己 → 目前假設「找不到「{關鍵字}」。」）；
// docs/spec/README.md AUTH-R15、AUTH-AC20（發布頁也要登入，登入後回到 /seats）、COM-R18（沿用這個瀏覽器的配色、沒有介面配色鈕）；D-021。
// D-026（permissions.md v1.2 PRM-R21）：編輯者、檢視者與沒有權限的公司帳號看到的內容相同。PRM-AC23 是甲（編輯者）、丙（檢視者）與丁（沒有權限），
// PRM-AC24 是丙（檢視者）與丁（沒有權限）；驗收條件裡沒寫到權限的人不在名單上（沒有權限），所以 PRM-AC32 的丙用沒有權限的帳號。
// 其他發布頁的內容測試用檢視者（signInAsViewer），三種身分看到的相同。
// D-025（發布頁預設全部展開、搜尋框移進工具列、不顯示人數）：
// - 開啟或重新整理時全部展開（含工作人員桌）、比例 100%、場地圖水平置中、從最上方開始；展開狀態與比例都不記住（PRM-R25）。
// - 工具列新增「全部展開／全部收合」：收合換回圓形並適合視窗；展開回到開啟時的樣子。桌面一列依序是縮小、比例、放大、適合視窗、
//   搜尋框（320 px）、切換鈕；767 px 以下第一列是縮放與切換鈕、第二列是滿版搜尋框。搜尋結果在工具列下方、座位圖區上方（第 2.3 節）。
// - 座位圖、名單卡片、桌次名單與桌次的無障礙名稱都不顯示人數與「已滿」「超過」（PRM-R24、PRM-AC25、PRM-AC36）；
//   名單卡片的列只有座號與顯示名稱，沒有「賓」、兒童椅、素食徽章；空位列與空桌的虛線保留（PRM-AC26）。
// - 載入中是 30 張展開卡片形狀的 Skeleton（第 2.3 節「狀態」）。
// - 座位安排頁不變（seating.md）：檔案最後一組測試確認同一份資料在座位安排頁仍顯示人數與狀態。
// 桌號（D-019）：測試資料用內部編號（1 = B1、2 = A1、3 = B4、5 = B10、6 = B13、7 = B2、9 = B8、12 = B3、17 = A3），畫面上用桌號。
// 座位圖、桌次、工具列與桌次名單的無障礙結構和座位安排頁相同（helpers/seating-page.ts 開頭）；發布頁的其他假設見 helpers/permissions-page.ts 開頭。
// 另外假設：region「座位圖」本身（或它裡面第一個 overflow 是 auto、scroll 的元素）是座位圖區的捲動容器，「水平置中」「從最上方開始」
// 用它的 scrollLeft、scrollTop 判斷；地標「舞台」在 A 內、B 內兩欄上方（seating.md 2.1.4），正好在場地圖左右的正中間。
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { CODES_IN_LIST_ORDER } from '../helpers/table-codes';
import { BING, DING, signIn, signInAsViewer, signInWithoutAccess, VIEWER_USER } from './helpers/auth';
import { expectNoHorizontalScroll, fetchFromPage, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { STAFF_TABLE, withDb } from './helpers/participants-db';
import { setNoteName, setPublished } from './helpers/permissions-db';
import {
  CHECK_PATH,
  gotoSeats,
  notFoundLine,
  NOT_PUBLISHED,
  recordWrites,
  resultLine,
  SEATS_TITLE,
  seatSearch,
} from './helpers/permissions-page';
import {
  blankPointIn,
  cardRows,
  circleBadge,
  detailRows,
  dragAndDrop,
  expandAll,
  expectRoster,
  expectSameBadgePlace,
  hasBorderColor,
  hasDashedBorder,
  isInside,
  landmark,
  mapTable,
  openSeating,
  openStaffDetail,
  openTableDetail,
  peoplePanel,
  seatMap,
  showMap,
  staffTable,
  staffTableButton,
  styleOfText,
  tableButton,
  tableDetail,
  tokenColor,
  toolbarButton,
  TRIANGLE_ALERT_PATH,
  zoomText,
  zoomToCompact,
  zoomToRegular,
  zoomValue,
  type CircleBadge,
} from './helpers/seating-page';
import { anyThemeButton, chooseTheme, expectFirstFrame, expectPageTheme, recordFirstFrame } from './helpers/theme-page';

const B1 = 1;
const A1 = 2;
const B4 = 3;
const B10 = 5;
const B13 = 6;
const B2 = 7;
const B8 = 9;
const B3 = 12;
const A3 = 17;

/** B10 桌：10 位研發一部的員工，沒有備註名稱（PRM-AC25、PRM-AC36） */
const B10_NAMES = Array.from({ length: 10 }, (_, i) => `研一同仁${i + 1}`);
/** B13 桌：11 位外部貴賓（participants-db 的 fillTable：「佔位貴賓6-{序號}」），部門標示是「貴賓」 */
const B13_NAMES = Array.from({ length: 11 }, (_, i) => `佔位貴賓${B13}-${i + 1}`);

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面才有滑過的 Tooltip、拖移與鍵盤');

/**
 * 驗收條件的資料：B4 桌依序是王小明（研發一部，分機 1234、素食、備註「需要靠走道」）、王小明_眷屬（配偶、兒童椅）、林董（外部貴賓，測試科技 董事長）；
 * B2 桌備註名稱「主桌」、張主任（研發一部）；B10 桌 10 位研發一部的員工；B13 桌 11 位外部貴賓；B8 桌沒有人；
 * 工作人員桌是陳大華（總務部）與 9 位工作人員（總務部），共 10 位；陳大文已報名但未入座。已發布。
 */
async function seedSeats(published = true) {
  await withDb(async (db) => {
    await db.reset();
    const { participantId: wang } = await db.registerNew(
      { name: '王小明', department: '研發一部', extension: '1234' },
      { tableId: B4, vegetarian: true, note: '需要靠走道' },
    );
    await db.dependent(wang, { relation: '配偶', childSeat: true, tableId: B4 });
    await db.guest('林董', { organization: '測試科技 董事長', tableId: B4 });
    await db.registerNew({ name: '張主任', department: '研發一部' }, { tableId: B2 });
    for (const name of B10_NAMES) await db.registerNew({ name, department: '研發一部' }, { tableId: B10 });
    await db.fillTable(B13, 11);
    await db.registerNew({ name: '陳大華', department: '總務部' }, { tableId: STAFF_TABLE });
    await db.fillStaff(9);
    await db.registerNew({ name: '陳大文', department: '研發一部' });
  });
  await setNoteName(B2, '主桌');
  await setPublished(published);
}

/** 檢視者登入（VIEWER_USER，以 VIEWER 寫進權限名單） */
async function asViewer(context: BrowserContext, baseURL: string | undefined) {
  await signInAsViewer(context, requireBaseURL(baseURL));
}

/** 沒有權限的同仁（丁，不在權限名單上）登入 */
async function asNoAccess(context: BrowserContext, baseURL: string | undefined) {
  await signInWithoutAccess(context, requireBaseURL(baseURL), DING);
}

/** 開已發布的 /seats，等座位圖量好大小、工具列顯示比例（畫好、可以操作）之後才繼續 */
async function openSeatsMap(page: Page) {
  await gotoSeats(page);
  await expect(seatMap(page)).toBeVisible();
  await expect(zoomText(page)).toBeVisible();
}

/** 重新整理已發布的 /seats，等座位圖畫好 */
async function reloadSeats(page: Page) {
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: SEATS_TITLE })).toBeVisible();
  await expect(seatMap(page)).toBeVisible();
  await expect(zoomText(page)).toBeVisible();
}

/** 按「全部收合」：換回圓形並適合視窗，按鈕變「全部展開」（PRM-R25） */
async function collapseAll(page: Page) {
  await toolbarButton(page, '全部收合').click();
  await expect(toolbarButton(page, '全部展開')).toBeVisible();
}

/** 「全部展開」／「全部收合」（文字依目前狀態切換） */
const toggleButton = (page: Page) => page.getByRole('button', { name: /^全部(展開|收合)$/ });

/** 頁面左右留白：內容全寬，左右 24 px（767 px 以下 16 px，第 2.3 節「版面」） */
const sideOf = (page: Page) => (isMobileWidth(page) ? 16 : 24);

/** 元素畫面上的文字，去掉所有空白（換行、空格） */
const textOf = async (loc: Locator) => (await loc.innerText()).replace(/\s+/g, '');

/** 元素畫面上的第一行文字 */
const firstLine = async (loc: Locator) =>
  (await loc.innerText())
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line) ?? '';

/** 人數與狀態的寫法：「{n}/10」（含桌次名單副標「{n}/10 人」）、「已滿」「超過」；D-025 之後發布頁都不顯示 */
const COUNT_OR_STATUS = /\d+\s*\/\s*10|已滿|超過/;

/** 一行一行的搜尋結果依序由上而下 */
async function expectLinesInOrder(page: Page, lines: string[]) {
  let lastY = -Infinity;
  for (const line of lines) {
    await expect(resultLine(page, line)).toBeVisible();
    const box = await resultLine(page, line).boundingBox();
    if (!box) throw new Error(`量不到「${line}」`);
    expect(box.y, `「${line}」的順序`).toBeGreaterThan(lastY);
    lastY = box.y;
  }
}

const highlighted = (page: Page, n: number) => hasBorderColor(page, mapTable(page, n), '--accent', '2px');

/**
 * 以 2 px --accent 標示的桌次（group 的名稱，例如「B4 桌」「工作人員桌」）。逐桌檢查每個元素，
 * 不用 hasBorderColor(seatMap)：展開卡片的元素超過 subtreeStyles 的 600 個上限，整個座位圖一起查會漏掉後面的桌次。
 */
async function highlightedTables(page: Page): Promise<string[]> {
  const accent = await tokenColor(page, '--accent');
  return seatMap(page).evaluate(
    (root, color) =>
      Array.from(root.querySelectorAll('[role="group"]'))
        .filter((group) =>
          [group, ...Array.from(group.querySelectorAll('*'))].some((el) => {
            const s = getComputedStyle(el);
            return s.borderTopColor === color && s.borderTopStyle !== 'none' && s.borderTopWidth === '2px';
          }),
        )
        .map(
          (group) =>
            group.getAttribute('aria-label') ??
            (group.getAttribute('aria-labelledby') ?? '')
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent ?? '')
              .join(' ')
              .trim(),
        ),
    accent,
  );
}

// ---- 版面量測

type Box = { x: number; y: number; width: number; height: number };
type Named = { name: string; box: Box };

async function boxOf(loc: Locator, label: string): Promise<Box> {
  const box = await loc.boundingBox();
  if (!box) throw new Error(`量不到${label}`);
  return box;
}

/** 兩個元素在同一列：上下範圍重疊超過較矮那個的一半 */
function sameRow(a: Box, b: Box): boolean {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap > Math.min(a.height, b.height) / 2;
}

/** 這幾個元素在同一列，由左到右依序排列 */
function expectRowInOrder(items: readonly Named[], label: string) {
  const first = items[0];
  if (!first) throw new Error(`${label}：沒有要比較的元素`);
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]!;
    const item = items[i]!;
    expect(sameRow(first.box, item.box), `${label}：「${item.name}」和「${first.name}」在同一列`).toBe(true);
    expect(item.box.x, `${label}：「${item.name}」在「${prev.name}」右邊`).toBeGreaterThanOrEqual(prev.box.x + prev.box.width - 1);
  }
}

/** 工具列各項的位置：縮小、比例、放大、適合視窗、搜尋框、「全部展開／全部收合」 */
async function toolbarBoxes(page: Page) {
  return {
    zoomOut: await boxOf(toolbarButton(page, '縮小'), '縮小'),
    pct: await boxOf(zoomText(page), '比例'),
    zoomIn: await boxOf(toolbarButton(page, '放大'), '放大'),
    fit: await boxOf(toolbarButton(page, '適合視窗'), '適合視窗'),
    search: await boxOf(seatSearch(page), '搜尋框'),
    toggle: await boxOf(toggleButton(page), '全部展開／全部收合'),
  };
}

/** 工具列（含搜尋框）最下緣 */
const toolbarBottom = (bar: Record<string, Box>) => Math.max(...Object.values(bar).map((b) => b.y + b.height));

/** 搜尋結果（或找不到的提示）在工具列下方、座位圖區上方，從頁面左邊開始（第 2.3 節「搜尋」、D-025） */
async function expectBetweenToolbarAndMap(page: Page, loc: Locator, side: number, label: string) {
  await expect(loc, label).toBeVisible();
  const box = await boxOf(loc, label);
  const bottom = toolbarBottom(await toolbarBoxes(page));
  const map = await boxOf(seatMap(page), '座位圖區');
  expect(box.y, `${label}在工具列（含搜尋框）下方`).toBeGreaterThanOrEqual(bottom - 1);
  expect(box.y + box.height, `${label}在座位圖區上方`).toBeLessThanOrEqual(map.y + 1);
  expect(Math.abs(box.x - side), `${label}從頁面左邊開始（左邊留 ${side} px，量到 ${box.x.toFixed(1)} px）`).toBeLessThanOrEqual(2);
}

// ---- 座位圖的捲動位置與開啟時的樣子（PRM-R25、D-025）

/** 座位圖區的捲動位置（region「座位圖」本身，或它裡面第一個可以捲動的元素） */
async function mapScroll(page: Page) {
  return seatMap(page).evaluate((root) => {
    const scrolls = (el: Element) => /(auto|scroll)/.test(`${getComputedStyle(el).overflowX} ${getComputedStyle(el).overflowY}`);
    const el = scrolls(root) ? root : (Array.from(root.querySelectorAll('*')).find(scrolls) ?? root);
    return { left: el.scrollLeft, top: el.scrollTop, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
}

/** 把座位圖區捲到指定位置（模擬使用者平移；超出範圍時瀏覽器會停在邊上） */
async function scrollMapTo(page: Page, to: { left: number; top: number }) {
  await seatMap(page).evaluate((root, p) => {
    const scrolls = (el: Element) => /(auto|scroll)/.test(`${getComputedStyle(el).overflowX} ${getComputedStyle(el).overflowY}`);
    const el = scrolls(root) ? root : (Array.from(root.querySelectorAll('*')).find(scrolls) ?? root);
    el.scrollTo(p.left, p.top);
  }, to);
}

/** 場地圖水平置中（scrollLeft 約為可左右捲動距離的一半）、從最上方開始（scrollTop 為 0） */
async function expectCenteredAtTop(page: Page, label: string) {
  await expect
    .poll(
      async () => {
        const s = await mapScroll(page);
        return Math.abs(s.left - (s.scrollWidth - s.clientWidth) / 2);
      },
      { message: `${label}：場地圖水平置中（scrollLeft 約為 (scrollWidth - clientWidth) / 2）` },
    )
    .toBeLessThanOrEqual(4);
  const s = await mapScroll(page);
  expect(s.scrollWidth, `${label}：100% 的場地圖比座位圖區寬，置中要靠捲動位置`).toBeGreaterThan(s.clientWidth);
  expect(s.top, `${label}：從最上方開始`).toBeLessThanOrEqual(1);
}

/** 看得到舞台：上下完整在座位圖區內；左右看得到的寬度是舞台寬與座位圖區寬中較小的那個，而且舞台在座位圖區的正中間 */
async function expectStageVisible(page: Page, label: string) {
  const stage = await boxOf(landmark(page, '舞台'), '舞台');
  const area = await boxOf(seatMap(page), '座位圖區');
  const shown = Math.min(stage.x + stage.width, area.x + area.width) - Math.max(stage.x, area.x);
  expect(shown, `${label}：看得到舞台（左右看得到 ${shown.toFixed(1)} px）`).toBeGreaterThanOrEqual(Math.min(stage.width, area.width) - 24);
  expect(stage.y, `${label}：舞台的上緣在座位圖區內`).toBeGreaterThanOrEqual(area.y - 1);
  expect(stage.y + stage.height, `${label}：舞台的下緣在座位圖區內`).toBeLessThanOrEqual(area.y + area.height + 1);
  const offCenter = stage.x + stage.width / 2 - (area.x + area.width / 2);
  expect(Math.abs(offCenter), `${label}：舞台在座位圖區左右的正中間（差 ${offCenter.toFixed(1)} px）`).toBeLessThanOrEqual(12);
}

/** 30 桌與工作人員桌都是名單卡片：10 列（B13 桌 11 位，12 列） */
async function expectAllCards(page: Page, label: string) {
  for (const code of CODES_IN_LIST_ORDER) {
    await expect(cardRows(page, code), `${label}：${code} 桌是名單卡片`).toHaveCount(code === 'B13' ? 12 : 10);
  }
  await expect(staffTable(page).getByRole('listitem'), `${label}：工作人員桌是名單卡片`).toHaveCount(10);
}

/** 30 桌與工作人員桌都是圓形：沒有名單列 */
async function expectAllCircles(page: Page, label: string) {
  for (const code of CODES_IN_LIST_ORDER) {
    await expect(cardRows(page, code), `${label}：${code} 桌是圓形（沒有名單列）`).toHaveCount(0);
  }
  await expect(staffTable(page).getByRole('listitem'), `${label}：工作人員桌是圓形`).toHaveCount(0);
  const round = await tableButton(page, B4).evaluate(
    (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) >= (el as HTMLElement).offsetWidth / 2 - 1,
  );
  expect(round, `${label}：B4 桌是圓形`).toBe(true);
}

/** 30 桌與工作人員桌都在座位圖區內（適合視窗，SEAT-R64） */
async function expectAllInside(page: Page, label: string) {
  const area = await boxOf(seatMap(page), '座位圖區');
  for (const code of CODES_IN_LIST_ORDER) {
    expect(await isInside(mapTable(page, code), area), `${label}：${code} 桌在座位圖區內`).toBe(true);
  }
  expect(await isInside(staffTable(page), area), `${label}：工作人員桌在座位圖區內`).toBe(true);
}

/** 開啟時的樣子（PRM-R25、PRM-AC33）：全部展開（含工作人員桌）、比例 100%、按鈕「全部收合」、水平置中、從最上方開始、看得到舞台 */
async function expectOpeningState(page: Page, label: string) {
  await expect.poll(() => zoomValue(page), { message: `${label}：比例 100%` }).toBe(100);
  await expect(toolbarButton(page, '全部收合'), `${label}：按鈕是「全部收合」`).toBeVisible();
  await expect(toolbarButton(page, '全部展開'), `${label}：沒有「全部展開」`).toHaveCount(0);
  await expectAllCards(page, label);
  await expectCenteredAtTop(page, label);
  await expectStageVisible(page, label);
}

/** 整頁畫面上的文字、30 桌與工作人員桌按鈕的無障礙名稱與描述，都沒有人數與「已滿」「超過」（PRM-R24、D-025） */
async function expectNoCounts(page: Page, label: string) {
  expect(await page.locator('body').innerText(), `${label}：畫面上的文字`).not.toMatch(COUNT_OR_STATUS);
  const buttons = [
    ...CODES_IN_LIST_ORDER.map((code) => ({ name: `${code} 桌`, loc: tableButton(page, code) })),
    { name: '工作人員桌', loc: staffTableButton(page) },
  ];
  for (const { name, loc } of buttons) {
    await expect(loc, `${label}：${name}的按鈕`).toHaveCount(1);
    await expect(loc, `${label}：${name}的無障礙名稱`).not.toHaveAccessibleName(COUNT_OR_STATUS);
    await expect(loc, `${label}：${name}的無障礙描述`).not.toHaveAccessibleDescription(COUNT_OR_STATUS);
  }
}

/**
 * 精簡顯示的圓形裡的桌號：文字正好是桌號、沒有被截斷、在圓形裡。用 circleBadge 量（找文字正好是 code 的元素；
 * 桌號沒有底色，量到的就是桌號文字本身），長度是未縮放的版面 px，回傳給標示前後比較位置與寬度。
 */
async function expectWholeCode(page: Page, n: number, code: string, label: string): Promise<CircleBadge> {
  const m = await circleBadge(page, n, code);
  if (!m) throw new Error(`${label}：${code} 桌的圓形裡找不到桌號「${code}」`);
  expect(m.text, `${label}：桌號`).toBe(code);
  expect(m.scrollWidth, `${label}：桌號「${code}」被截斷（文字要 ${m.scrollWidth} px，只有 ${m.clientWidth} px）`).toBeLessThanOrEqual(
    m.clientWidth,
  );
  // 圓形左右的邊框加內距相同：內容框左緣加右緣就是圓形的寬
  const circleWidth = m.contentLeft + m.contentRight;
  expect(m.x, `${label}：桌號超出圓形左緣`).toBeGreaterThanOrEqual(-0.5);
  expect(m.x + m.width, `${label}：桌號超出圓形右緣`).toBeLessThanOrEqual(circleWidth + 0.5);
  return m;
}

/** 開 from 桌的名單，再換成 to 桌：桌面直接點另一桌；手機的名單是 Dialog，先關掉再點。回傳 to 桌的名單 */
async function switchDetail(page: Page, from: number, to: number, label: string): Promise<Locator> {
  const first = await openTableDetail(page, from);
  if (isMobileWidth(page)) {
    await first.getByRole('button', { name: '關閉' }).first().click();
    await expect(tableDetail(page, from), `${label}：按關閉鈕關閉`).toHaveCount(0);
    await tableButton(page, to).click();
  } else {
    await tableButton(page, to).click();
    await expect(tableDetail(page, from), `${label}：點另一桌換成那一桌`).toHaveCount(0);
  }
  const second = tableDetail(page, to);
  await expect(second, label).toBeVisible();
  return second;
}

/** 桌次名單開著就按關閉鈕關掉 */
async function closeDetailIfOpen(page: Page, n: number) {
  const detail = tableDetail(page, n);
  if (await detail.isVisible()) {
    await detail.getByRole('button', { name: '關閉' }).first().click();
    await expect(detail).toHaveCount(0);
  }
}

/** 30 桌與工作人員桌的中心點，換成 0～1 的相對位置（不受縮放比例影響） */
async function normalizedCenters(page: Page): Promise<Map<string, { x: number; y: number }>> {
  const names = [...CODES_IN_LIST_ORDER.map((c) => `${c} 桌`), '工作人員桌'];
  const raw = new Map<string, { x: number; y: number }>();
  for (const name of names) {
    const box = await seatMap(page).getByRole('group', { name, exact: true }).boundingBox();
    if (!box) throw new Error(`量不到 ${name}`);
    raw.set(name, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }
  const xs = [...raw.values()].map((p) => p.x);
  const ys = [...raw.values()].map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return new Map([...raw].map(([name, p]) => [name, { x: (p.x - minX) / (maxX - minX), y: (p.y - minY) / (maxY - minY) }]));
}

test.describe('登入（AUTH-R15、AUTH-AC20）', () => {
  test('沒登入開 /seats → 導到登入頁，網址帶著 /seats；用公司帳號登入後回到 /seats', async ({ page, context, baseURL }) => {
    await seedSeats();
    await page.goto('/seats');
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByRole('heading', { level: 1, name: '用公司帳號登入' })).toBeVisible();
    const url = new URL(page.url());
    const target = [...url.searchParams.values()]
      .filter((v) => v.startsWith('/') || v.startsWith(url.origin))
      .map((v) => new URL(v, url.origin))
      .find((u) => u.origin === url.origin);
    expect(target?.pathname).toBe('/seats');

    await asViewer(context, baseURL);
    await page.goto(`${target?.pathname ?? ''}${target?.search ?? ''}`);
    await expect(page.getByRole('heading', { level: 1, name: SEATS_TITLE })).toBeVisible();
  });

  test('沒登入呼叫 GET /api/seats → 401，不回傳任何資料', async ({ page }) => {
    await seedSeats();
    await page.goto('/login');
    const res = await fetchFromPage(page, '/api/seats');
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('王小明');
  });
});

test.describe('未發布（PRM-R22、PRM-AC23）', () => {
  test('甲（編輯者）、丙（檢視者）與丁（沒有權限）分別開 /seats → 都只有 H1 與「座位表還沒有發布，請稍後再看。」，沒有搜尋框與座位圖；回應不含座位資料', async ({
    page,
    context,
    baseURL,
    browser,
  }) => {
    await seedSeats(false);
    await signIn(context, requireBaseURL(baseURL));

    const viewerContext = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? undefined });
    const noAccessContext = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? undefined });
    try {
      await signInAsViewer(viewerContext, requireBaseURL(baseURL), BING);
      await asNoAccess(noAccessContext, baseURL);
      const viewerPage = await viewerContext.newPage();
      const noAccessPage = await noAccessContext.newPage();
      for (const [label, p] of [
        ['編輯者', page],
        ['檢視者', viewerPage],
        ['沒有權限', noAccessPage],
      ] as const) {
        await gotoSeats(p);
        await expect(p.getByText(NOT_PUBLISHED, { exact: true }), label).toBeVisible();
        await expect(seatSearch(p), label).toHaveCount(0);
        await expect(seatMap(p), label).toHaveCount(0);
        // 空狀態沒有按鈕；也沒有 App Shell（第 2.3 節）
        await expect(p.getByRole('button'), label).toHaveCount(0);
        await expect(p.getByRole('navigation', { name: '主要導覽' }), label).toHaveCount(0);

        const html = await (await p.request.get('/seats')).text();
        for (const name of ['王小明', '林董', '張主任', '陳大華', '主桌']) expect(html, `${label}：頁面不含 ${name}`).not.toContain(name);
        const api = await fetchFromPage(p, '/api/seats');
        expect(api.status, label).toBe(200);
        expect(api.body, label).toEqual({ published: false });
      }
    } finally {
      await viewerContext.close();
      await noAccessContext.close();
    }
  });
});

test.describe('已發布：版面（PRM-R21、PRM-R23、PRM-R24、PRM-AC24）', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
  });

  test('PRM-AC24：丙開 /seats → 有 H1、工具列（縮小、比例、放大、適合視窗、提示「輸入姓名找座位」的搜尋框、「全部收合」）與座位圖；沒有 Sidebar、Header、導覽、使用者選單、介面配色鈕與儲存狀態', async ({
    page,
  }) => {
    await openSeatsMap(page);
    await expect(seatSearch(page)).toBeVisible();
    await expect(seatSearch(page)).toHaveAttribute('placeholder', '輸入姓名找座位');
    await expect(seatMap(page)).toBeVisible();
    await expect(seatMap(page).getByRole('group', { name: /^[AB]\d{1,2} 桌$/ })).toHaveCount(30);
    await expect(staffTable(page)).toBeVisible();

    await expect(page.getByRole('navigation', { name: '主要導覽' })).toHaveCount(0);
    await expect(page.getByRole('complementary')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '收合或展開側選單' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '開啟選單' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: new RegExp(VIEWER_USER.name) })).toHaveCount(0);
    await expect(anyThemeButton(page)).toHaveCount(0);
    await expect(page.getByText(/^(已儲存|儲存中…)/)).toHaveCount(0);
    await expect(page.getByText('只能檢視', { exact: true })).toHaveCount(0);
    // 工具列：縮小、比例、放大、適合視窗、搜尋框與切換鈕；開啟時全部展開，切換鈕是「全部收合」（第 2.3 節、D-025）；
    // 沒有座位安排頁的其他按鈕
    for (const name of ['縮小', '放大', '適合視窗', '全部收合']) await expect(toolbarButton(page, name), name).toBeVisible();
    await expect(zoomText(page)).toBeVisible();
    for (const name of ['全部展開', '自動排座', '新增人員', '匯出座位表', '發布', '顯示人員面板']) {
      await expect(toolbarButton(page, name), name).toHaveCount(0);
    }
  });

  test('PRM-AC24：丙（檢視者）與丁（沒有權限）開 /seats → 兩人看到的相同：H1、工具列（含搜尋框）與座位圖；都沒有 Sidebar、Header、導覽與介面配色鈕', async ({
    page,
    browser,
    baseURL,
  }) => {
    const dingContext = await browser.newContext({
      baseURL,
      viewport: page.viewportSize() ?? undefined,
      isMobile: isMobileWidth(page),
      hasTouch: isMobileWidth(page),
    });
    try {
      await asNoAccess(dingContext, baseURL);
      const ding = await dingContext.newPage();
      const seen: { tables: string[]; staff: number; text: string; api: unknown }[] = [];
      for (const p of [page, ding]) {
        await openSeatsMap(p);
        await expect(seatSearch(p)).toHaveAttribute('placeholder', '輸入姓名找座位');
        for (const name of ['縮小', '放大', '適合視窗', '全部收合']) await expect(toolbarButton(p, name), name).toBeVisible();
        await expect(p.getByRole('navigation', { name: '主要導覽' })).toHaveCount(0);
        await expect(p.getByRole('complementary')).toHaveCount(0);
        await expect(p.getByRole('button', { name: '收合或展開側選單' })).toHaveCount(0);
        await expect(p.getByRole('button', { name: '開啟選單' })).toHaveCount(0);
        await expect(anyThemeButton(p)).toHaveCount(0);
        await expect(p.getByText(/^(已儲存|儲存中…)/)).toHaveCount(0);
        await expect(p.getByRole('heading', { level: 1, name: '你沒有檢視權限' })).toHaveCount(0);
        const groups = seatMap(p).getByRole('group', { name: /^[AB]\d{1,2} 桌$/ });
        await expect(groups).toHaveCount(30);
        const tables: string[] = [];
        for (const g of await groups.all()) tables.push((await g.getAttribute('aria-label')) ?? (await g.innerText()));
        seen.push({
          tables: tables.sort(),
          staff: await staffTable(p).count(),
          text: (await seatMap(p).innerText()).replace(/\s+/g, ' '),
          api: (await fetchFromPage(p, '/api/seats')).body,
        });
      }
      expect(seen[1]?.tables, '桌次相同').toEqual(seen[0]?.tables);
      expect(seen[1]?.staff).toBe(1);
      expect(seen[1]?.text, '座位圖的內容相同').toBe(seen[0]?.text);
      expect(seen[1]?.api, '伺服器回傳的資料相同').toEqual(seen[0]?.api);
    } finally {
      await dingContext.close();
    }
  });

  test('30 桌與工作人員桌的位置和座位安排頁相同', async ({ page }) => {
    desktopOnly(page);
    await openSeating(page);
    const seating = await normalizedCenters(page);
    await openSeatsMap(page);
    const seats = await normalizedCenters(page);
    for (const [name, p] of seating) {
      const q = seats.get(name);
      expect(q, name).toBeDefined();
      expect(Math.abs((q?.x ?? -1) - p.x), `${name} 的左右位置`).toBeLessThanOrEqual(0.02);
      expect(Math.abs((q?.y ?? -1) - p.y), `${name} 的上下位置`).toBeLessThanOrEqual(0.02);
    }
  });
});

test.describe('已發布：座位圖與桌次名單（PRM-R24～R28、D-025）', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
  });

  test('PRM-AC25：開啟時（全部展開）B2 卡片有「B2 桌」與「主桌」；B10（10 位）、B13（11 位）卡片的標頭只有桌號、沒有人數與「已滿」「超過」，B13 列出 12 列；按「全部收合」→ B2 顯示「主桌」，B10、B13 只有桌號與部門，B8 是虛線的空桌；縮小到 80% 以下 → 每桌只有桌號；都沒有拖移把手', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openSeatsMap(page);
    await expect.poll(() => zoomValue(page)).toBe(100);
    const muted = await tokenColor(page, '--muted-foreground');

    // 全部展開（開啟時）
    await expect(mapTable(page, B2)).toContainText('B2 桌');
    await expect(mapTable(page, B2)).toContainText('主桌');
    for (const [n, title] of [
      [B10, 'B10 桌'],
      [B13, 'B13 桌'],
    ] as const) {
      expect(await firstLine(mapTable(page, n)), `展開：${title}卡片的標頭`).toBe(title);
      await expect(mapTable(page, n), `展開：${title}卡片沒有人數、「已滿」「超過」`).not.toContainText(COUNT_OR_STATUS);
      await expect(mapTable(page, n).locator(`svg path[d="${TRIANGLE_ALERT_PATH}"]`), `展開：${title}卡片沒有「超過」徽章的圖示`).toHaveCount(0);
      await expect(mapTable(page, n).locator(`svg path[d="${CHECK_PATH}"]`), `展開：${title}卡片沒有「已滿」徽章的圖示`).toHaveCount(0);
    }
    await expectRoster(cardRows(page, B10), B10_NAMES);
    // 11 位：12 列（11 位與 1 個空位，D-018）
    await expectRoster(cardRows(page, B13), B13_NAMES, 12);
    expect(await hasDashedBorder(mapTable(page, B8)), '展開：B8 是虛線的空桌').toBe(true);
    expect((await styleOfText(mapTable(page, B8), 'B8 桌'))?.color, '展開：空桌的桌號變淡').toBe(muted);
    await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' }), '展開：沒有拖移把手').toHaveCount(0);
    await expectNoCounts(page, '展開');

    // 全部收合：一般顯示（80% 以上）只有桌號與備註名稱或部門
    await collapseAll(page);
    await zoomToRegular(page);
    expect(await textOf(tableButton(page, B2)), '收合：B2 顯示桌號與「主桌」').toBe('B2主桌');
    expect(await textOf(tableButton(page, B10)), '收合：B10 只有桌號與部門').toBe('B10研發一部');
    expect(await textOf(tableButton(page, B13)), '收合：B13 只有桌號與部門').toBe('B13貴賓');
    await expect(mapTable(page, B8)).toContainText('空桌');
    expect(await hasDashedBorder(mapTable(page, B8)), '收合：B8 是虛線的空桌').toBe(true);
    expect((await styleOfText(mapTable(page, B8), 'B8'))?.color, '收合：空桌的桌號變淡').toBe(muted);
    await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' }), '收合：沒有拖移把手').toHaveCount(0);
    await expectNoCounts(page, '收合');

    // 精簡顯示（低於 80%）：每桌只有桌號
    await zoomToCompact(page);
    for (const code of CODES_IN_LIST_ORDER) {
      expect(await textOf(tableButton(page, code)), `精簡顯示：${code} 桌只有桌號`).toBe(code);
    }
    await expect(staffTableButton(page), '精簡顯示：工作人員桌沒有人數').not.toContainText(/\d/);
    expect(await hasDashedBorder(mapTable(page, B8)), '精簡顯示：B8 是虛線的空桌').toBe(true);
    await expectNoCounts(page, '精簡顯示');
  });

  test('PRM-AC25、PRM-R28：沒有拖移把手；滑過 B2 的 Tooltip 有部門；拖名單卡片的列與標頭、拖桌次、拖桌次名單的列都不會改變任何資料，也不送出任何寫入', async ({
    page,
  }) => {
    desktopOnly(page);
    const writes = recordWrites(page);
    await openSeatsMap(page);
    const snapshot = () =>
      withDb(async (db) => ({ b4: await db.seatedNames(B4), b3: await db.seatedNames(B3), b8: await db.seatedNames(B8) }));
    const before = await snapshot();

    // 全部展開（開啟時）：B4 卡片第 1 列拖到同一張卡片的空位列、拖到 B3 桌的卡片；卡片標頭拖到 B3 桌
    await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);
    await dragAndDrop(page, cardRows(page, B4).first(), cardRows(page, B4).nth(4));
    // 放開的位置和按下的位置在同一張卡片裡時可能算一次點擊、開啟 B4 桌的名單；關掉再拖下一次
    await closeDetailIfOpen(page, B4);
    await dragAndDrop(page, cardRows(page, B4).first(), mapTable(page, B3));
    await closeDetailIfOpen(page, B4);
    await dragAndDrop(page, tableButton(page, B4), mapTable(page, B3));
    await closeDetailIfOpen(page, B4);
    await expectRoster(cardRows(page, B4), ['王小明', '王小明_眷屬', '林董']);

    // 全部收合：滑過 B2 有部門；拖桌次到 B8 桌、拖桌次名單的列到 B8 桌
    await collapseAll(page);
    await zoomToRegular(page);
    await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);
    await tableButton(page, B2).hover();
    await expect(page.getByRole('tooltip').first()).toContainText('主桌・研發一部');
    await dragAndDrop(page, tableButton(page, B4), mapTable(page, B8));
    const detail = await openTableDetail(page, B4);
    await dragAndDrop(page, detailRows(detail).first(), mapTable(page, B8));
    await page.waitForTimeout(500);
    expect(await snapshot()).toEqual(before);
    expect(writes).toEqual([]);
  });

  test('PRM-AC36：聚焦 B10 桌（10 位、研發一部、沒有備註名稱）→ 無障礙名稱「B10 桌，研發一部」；B2 桌 →「B2 桌，主桌，研發一部」；工作人員桌 →「工作人員桌・總務部」；展開、收合與精簡顯示都一樣，不含人數與「已滿」「超過」', async ({
    page,
  }) => {
    await openSeatsMap(page);
    const expected: readonly { loc: Locator; name: string }[] = [
      { loc: tableButton(page, B10), name: 'B10 桌，研發一部' },
      { loc: tableButton(page, B2), name: 'B2 桌，主桌，研發一部' },
      { loc: tableButton(page, B4), name: 'B4 桌，研發一部＋貴賓' },
      { loc: tableButton(page, B13), name: 'B13 桌，貴賓' },
      { loc: staffTableButton(page), name: '工作人員桌・總務部' },
    ];
    const check = async (label: string) => {
      for (const { loc, name } of expected) {
        await loc.focus();
        await expect(loc, `${label}：${name} 取得焦點`).toBeFocused();
        await expect(loc, `${label}：無障礙名稱`).toHaveAccessibleName(name);
      }
    };

    await check('展開');
    await collapseAll(page);
    await zoomToRegular(page);
    await check('收合');
    await zoomToCompact(page);
    await check('精簡顯示');
  });

  test('PRM-AC26：B4 卡片的名單 1～3 列是「王小明」「王小明_眷屬」「林董」，沒有「賓」、兒童椅、素食徽章；點 B4 桌 → 標題「B4 桌」、沒有人數副標、「部門：研發一部＋貴賓」，1～3 列是三個人、4～10 列「空位」；畫面沒有分機、素食、兒童椅、備註、「貴賓」徽章、單位頭銜與操作按鈕；回應也不含這些', async ({
    page,
  }) => {
    await openSeatsMap(page);

    // 開啟時全部展開：B4 的名單卡片每列只有座號與顯示名稱（第 2.3 節「座位圖」、D-025）
    const cardList = cardRows(page, B4);
    await expect(cardList).toHaveCount(10);
    const cardTexts = (await cardList.allInnerTexts()).map((t) => t.replace(/\s+/g, ''));
    expect(cardTexts).toEqual(['1王小明', '2王小明_眷屬', '3林董', ...Array.from({ length: 7 }, (_, i) => `${i + 4}空位`)]);
    await expect(cardList.getByText('賓', { exact: true }), '沒有「賓」徽章').toHaveCount(0);
    await expect(cardList.getByLabel(/兒童椅|素食|貴賓/), '沒有兒童椅、素食、貴賓的標示').toHaveCount(0);
    await expect(cardList.locator('svg'), '名單列沒有圖示徽章').toHaveCount(0);
    for (const hidden of ['1234', '素食', '兒童椅', '需要靠走道', '測試科技', '董事長', '配偶']) {
      await expect(seatMap(page).getByText(hidden), `座位圖沒有「${hidden}」`).toHaveCount(0);
    }

    const detail = await openTableDetail(page, B4);
    await expect(detail.getByRole('heading', { name: 'B4 桌', exact: true })).toBeVisible();
    // 沒有副標：不顯示人數（D-025）
    await expect(detail, '沒有人數副標').not.toContainText(/\d+\s*\/\s*10|\d+\s*人/);
    await expect(detail).toContainText('部門：研發一部＋貴賓');
    const rows = detailRows(detail);
    await expect(rows).toHaveCount(10);
    const texts = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, ''));
    expect(texts).toEqual(['1王小明', '2王小明_眷屬', '3林董', ...Array.from({ length: 7 }, (_, i) => `${i + 4}空位`)]);
    for (const hidden of ['1234', '素食', '兒童椅', '需要靠走道', '測試科技', '董事長', '配偶']) {
      await expect(detail.getByText(hidden), hidden).toHaveCount(0);
    }
    await expect(detail.getByRole('img', { name: /兒童椅|素食/ })).toHaveCount(0);
    const buttons = detail.getByRole('button');
    const count = await buttons.count();
    expect(count, '有關閉鈕').toBeGreaterThan(0);
    for (let i = 0; i < count; i++) await expect(buttons.nth(i)).toHaveAccessibleName('關閉');

    const api = await fetchFromPage(page, '/api/seats');
    const text = JSON.stringify(api.body);
    for (const hidden of ['1234', '需要靠走道', '測試科技', '董事長', '配偶', 'vegetarian', 'childSeat', 'extension']) {
      expect(text, hidden).not.toContain(hidden);
    }
  });

  test('點另一桌換成那一桌；按關閉鈕關閉；展開的卡片與收合的圓形都可以點（PRM-R26）', async ({ page }) => {
    await openSeatsMap(page);
    // 展開的卡片（開啟時）：B2 桌換成 A3 桌（A 區內側那一欄，桌面時不會被從右側浮出的名單蓋住）
    const a3 = await switchDetail(page, B2, A3, '展開的卡片');
    await a3.getByRole('button', { name: '關閉' }).first().click();
    await expect(tableDetail(page, A3)).toHaveCount(0);

    // 收合的圓形
    await collapseAll(page);
    const b2 = await switchDetail(page, B4, B2, '收合的圓形');
    await expect(b2).toContainText('主桌');
    await b2.getByRole('button', { name: '關閉' }).first().click();
    await expect(tableDetail(page, B2)).toHaveCount(0);
  });

  test('用鍵盤聚焦桌次後按 Enter 也開啟那一桌的名單：展開的卡片與收合的圓形都可以（PRM-R26）', async ({ page }) => {
    desktopOnly(page);
    await openSeatsMap(page);
    await tableButton(page, B4).focus();
    await page.keyboard.press('Enter');
    await expect(tableDetail(page, B4)).toBeVisible();
    await expect(detailRows(tableDetail(page, B4)).first()).toContainText('王小明');
    await tableDetail(page, B4).getByRole('button', { name: '關閉' }).first().click();
    await expect(tableDetail(page, B4)).toHaveCount(0);

    await collapseAll(page);
    await tableButton(page, B2).focus();
    await page.keyboard.press('Enter');
    await expect(tableDetail(page, B2)).toBeVisible();
    await expect(detailRows(tableDetail(page, B2)).first()).toContainText('張主任');
  });

  test('工作人員桌的名單標題是「工作人員桌」，沒有人數副標（D-025）', async ({ page }) => {
    await openSeatsMap(page);
    const detail = await openStaffDetail(page);
    await expect(detail.getByRole('heading', { name: '工作人員桌', exact: true })).toBeVisible();
    await expect(detail, '沒有人數副標').not.toContainText(/\d+\s*\/\s*10/);
    await expect(detailRows(detail)).toHaveCount(10);
    await expect(detailRows(detail).first()).toContainText('陳大華');
  });

  test('PRM-AC27：沒有人員面板、未入座名單與統計列；搜尋「陳大文」（已報名但未入座）→「找不到「陳大文」。」（PRM-Q01 目前假設）', async ({ page }) => {
    await openSeatsMap(page);
    await expect(peoplePanel(page)).toHaveCount(0);
    await expect(page.getByText(/已入座|未入座/)).toHaveCount(0);
    await seatSearch(page).fill('陳大文');
    await expect(notFoundLine(page, '陳大文')).toBeVisible();
    await expect(page.getByText(/陳大文：/)).toHaveCount(0);
  });
});

// D-027（permissions.md v1.3）：發布頁不顯示「未放桌」的位置（沒有虛線框與位置代碼），也不畫暫存區；暫存區的桌上的人搜尋不到
test.describe('已發布：「未放桌」與暫存區（PRM-R24、PRM-R30、PRM-AC45、D-027）', () => {
  test('PRM-AC45：B8 是「未放桌」、暫存區有一桌坐陳大文 → /seats 的 B8 位置什麼都沒有、沒有暫存區；搜尋「陳大文」→「找不到「陳大文」。」；伺服器回傳的資料不含 B8 與暫存的桌', async ({
    page,
    context,
    baseURL,
  }) => {
    const staged = await withDb(async (db) => {
      await db.reset();
      await db.registerNew({ name: '王小明', department: '研發一部' }, { tableId: B4 });
      await db.emptyPosition(B8);
      const id = await db.stagedTable('暫放');
      await db.registerNew({ name: '陳大文', department: '研發一部' }, { tableId: id });
      return id;
    });
    await setPublished(true);
    await asViewer(context, baseURL);
    await openSeatsMap(page);

    await expect(seatMap(page).getByRole('group', { name: 'B8 桌', exact: true })).toHaveCount(0);
    await expect(seatMap(page).getByText('B8', { exact: true })).toHaveCount(0);
    await expect(page.getByText('未放桌')).toHaveCount(0);
    await expect(page.getByRole('region', { name: '暫存區', exact: true })).toHaveCount(0);
    await expect(page.getByText('暫存區')).toHaveCount(0);
    await expect(page.getByText('暫存', { exact: true })).toHaveCount(0);
    await expect(seatMap(page).getByRole('group', { name: /^[AB]\d{1,2} 桌$/ })).toHaveCount(29);
    await expect(seatMap(page).getByRole('group', { name: 'B4 桌', exact: true })).toBeVisible();

    await seatSearch(page).fill('陳大文');
    await expect(notFoundLine(page, '陳大文')).toBeVisible();
    await expect(page.getByText(/陳大文：/)).toHaveCount(0);

    const { status, body } = await fetchFromPage(page, '/api/seats');
    expect(status).toBe(200);
    const tables = (body as { tables: { id: number; position: number | null }[] }).tables;
    expect(tables.map((t) => t.id)).not.toContain(staged);
    expect(tables.map((t) => t.id)).not.toContain(B8);
    expect(tables.map((t) => t.position)).not.toContain(B8);
    expect(JSON.stringify(body)).not.toContain('陳大文');
  });

  test('場地圖的寬度和沒有暫存區時相同：暫存區有一桌時，30 個位置與工作人員桌的相對位置不變（PRM-R24）', async ({ page, context, baseURL }) => {
    desktopOnly(page);
    await withDb(async (db) => {
      await db.reset();
      await db.registerNew({ name: '王小明', department: '研發一部' }, { tableId: B4 });
    });
    await setPublished(true);
    await asViewer(context, baseURL);
    await openSeatsMap(page);
    const widthWithout = await seatMap(page).evaluate((el) => el.scrollWidth);

    await withDb(async (db) => {
      const id = await db.stagedTable('暫放');
      await db.registerNew({ name: '陳大文', department: '研發一部' }, { tableId: id });
    });
    await reloadSeats(page);
    expect(await seatMap(page).evaluate((el) => el.scrollWidth)).toBe(widthWithout);
  });
});

test.describe('已發布：找座位（PRM-R30～R33）', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
  });

  test('PRM-AC28：搜尋「王小明」→ 工具列下方的結果「王小明：B4 桌」「王小明_眷屬：B4 桌」；B4 的名單卡片以 2 px --accent 標示並捲到座位圖區內看得到；過了 4 秒仍標示；清空 → 結果與標示都消失', async ({
    page,
  }) => {
    await openSeatsMap(page);
    await expect(seatSearch(page)).toHaveAttribute('placeholder', '輸入姓名找座位');
    await expect.poll(() => zoomValue(page)).toBe(100);
    // 開啟時（100%、水平置中）B4 桌在 B 區最外側那一欄，卡片沒有完整在座位圖區內；搜尋要把它捲到看得到的位置
    expect(await isInside(mapTable(page, B4), seatMap(page)), '搜尋前 B4 桌的卡片沒有完整在座位圖區內').toBe(false);

    await seatSearch(page).fill('王小明');
    await expectLinesInOrder(page, ['王小明：B4 桌', '王小明_眷屬：B4 桌']);
    await expectBetweenToolbarAndMap(page, resultLine(page, '王小明：B4 桌'), sideOf(page), '搜尋結果');
    await expect.poll(() => highlightedTables(page)).toEqual(['B4 桌']);
    await expect(cardRows(page, B4), '標示的是名單卡片').toHaveCount(10);
    await expect.poll(() => isInside(mapTable(page, B4), seatMap(page))).toBe(true);

    await page.waitForTimeout(4500);
    expect(await highlighted(page, B4), '過了 4 秒仍標示').toBe(true);

    await seatSearch(page).fill('');
    await expect(resultLine(page, '王小明：B4 桌')).toHaveCount(0);
    await expect(resultLine(page, '王小明_眷屬：B4 桌')).toHaveCount(0);
    await expect.poll(() => highlightedTables(page)).toEqual([]);
  });

  test('關鍵字去掉前後空白、英文不分大小寫；不比對分機、部門與單位', async ({ page }) => {
    await openSeatsMap(page);
    await seatSearch(page).fill('  林董 ');
    await expect(resultLine(page, '林董：B4 桌')).toBeVisible();
    await seatSearch(page).fill('研發一部');
    await expect(notFoundLine(page, '研發一部')).toBeVisible();
    await seatSearch(page).fill('測試科技');
    await expect(notFoundLine(page, '測試科技')).toBeVisible();
  });

  test('PRM-AC29：陳大華是工作人員 → 搜尋「陳大華」→「陳大華：工作人員桌」，工作人員桌被標示', async ({ page }) => {
    await openSeatsMap(page);
    await seatSearch(page).fill('陳大華');
    await expect(resultLine(page, '陳大華：工作人員桌')).toBeVisible();
    await expect.poll(() => hasBorderColor(page, staffTable(page), '--accent', '2px')).toBe(true);
  });

  test('PRM-AC31：搜尋「xyz」→「找不到「xyz」。」，沒有桌次被標示；用王小明的分機「1234」搜尋 → 也是找不到', async ({ page }) => {
    await openSeatsMap(page);
    await seatSearch(page).fill('xyz');
    await expect(notFoundLine(page, 'xyz')).toBeVisible();
    expect(await highlightedTables(page)).toEqual([]);

    await seatSearch(page).fill('1234');
    await expect(notFoundLine(page, '1234')).toBeVisible();
    expect(await highlightedTables(page)).toEqual([]);
  });
});

test.describe('精簡顯示時的搜尋標示：只有桌號，沒有人數與「已滿」「超過」（PRM-R24、PRM-R31、D-025；seating.md 2.1.6、2.1.9）', () => {
  // 發布頁不顯示人數與狀態（D-025），全部收合後比例低於 80% 的精簡顯示只有桌號。標示是 2 px 的 --accent 邊框（2.1.9），
  // 邊框加粗時內距同步少 1 px：桌號仍完整顯示、在圓形裡，位置與寬度和標示前相同。桌面與手機 320 px 都跑。
  test.beforeEach(async ({ context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
  });

  for (const { n, code, count, keyword } of [
    { n: B10, code: 'B10', count: 10, keyword: '研一同仁10' },
    { n: B13, code: 'B13', count: 11, keyword: `佔位貴賓${B13}-11` },
  ] as const) {
    test(`${count} 位的 ${code} 桌：全部收合、比例低於 80% 時圓形只有桌號「${code}」；搜尋「${keyword}」以 2 px --accent 標示時仍只有桌號、沒有「已滿」「超過」，桌號完整顯示，位置與寬度和標示前相同`, async ({
      page,
    }) => {
      await openSeatsMap(page);
      await collapseAll(page);
      await zoomToCompact(page);

      expect(await textOf(tableButton(page, n)), `標示前：${code} 桌只有桌號`).toBe(code);
      const before = await expectWholeCode(page, n, code, '標示前');

      await seatSearch(page).fill(keyword);
      await expect(resultLine(page, `${keyword}：${code} 桌`)).toBeVisible();
      await expect.poll(() => highlighted(page, n)).toBe(true);
      expect(await zoomValue(page), '搜尋後仍是精簡顯示').toBeLessThan(80);

      expect(await textOf(tableButton(page, n)), `標示中：${code} 桌只有桌號`).toBe(code);
      await expect(mapTable(page, n), '標示中：沒有人數與「已滿」「超過」').not.toContainText(COUNT_OR_STATUS);
      const during = await expectWholeCode(page, n, code, '標示中');
      expectSameBadgePlace(before, during, '標示前後的桌號');
      // 標示一直留著（PRM-R31），量的時候仍在標示中
      expect(await highlighted(page, n), '量的時候仍在標示中').toBe(true);
    });
  }
});

test.describe('同名（PRM-R32、PRM-AC30）', () => {
  test('研發一部的王小明在 B4、業務部的王小明在 A3；「貴賓席」兩位在 B1、A1 → 結果加部門或「（貴賓）」，依 A 區、B 區的順序；所在的桌都被標示', async ({
    page,
    context,
    baseURL,
  }) => {
    await withDb(async (db) => {
      await db.reset();
      await db.registerNew({ name: '王小明', department: '研發一部' }, { tableId: B4 });
      await db.registerNew({ name: '王小明', department: '業務部' }, { tableId: A3 });
      await db.guest('貴賓席', { tableId: B1 });
      await db.guest('貴賓席', { tableId: A1 });
    });
    await setPublished(true);
    await asViewer(context, baseURL);
    await openSeatsMap(page);

    await seatSearch(page).fill('王小明');
    await expectLinesInOrder(page, ['王小明（業務部）：A3 桌', '王小明（研發一部）：B4 桌']);
    await expect(resultLine(page, '王小明：B4 桌')).toHaveCount(0);
    await expect.poll(() => highlighted(page, A3)).toBe(true);
    await expect.poll(() => highlighted(page, B4)).toBe(true);

    await seatSearch(page).fill('貴賓席');
    await expectLinesInOrder(page, ['貴賓席（貴賓）：A1 桌', '貴賓席（貴賓）：B1 桌']);
    await expect.poll(() => highlighted(page, A1)).toBe(true);
    await expect.poll(() => highlighted(page, B1)).toBe(true);
    await expect.poll(() => highlighted(page, A3)).toBe(false);
  });
});

test.describe('內容是開啟當下的資料（PRM-R29、PRM-AC32）', () => {
  test('丙（沒有權限）開著 /seats，甲停止發布 → 丙的頁面不變；丙重新整理 →「座位表還沒有發布，請稍後再看。」', async ({ page, context, baseURL }) => {
    await seedSeats();
    await signInWithoutAccess(context, requireBaseURL(baseURL), BING);
    await openSeatsMap(page);

    await setPublished(false); // 甲在對話框取消打勾
    await page.waitForTimeout(1000);
    await expect(seatMap(page)).toBeVisible();
    await seatSearch(page).fill('王小明');
    await expect(resultLine(page, '王小明：B4 桌')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: SEATS_TITLE })).toBeVisible();
    await expect(page.getByText(NOT_PUBLISHED, { exact: true })).toBeVisible();
    await expect(seatSearch(page)).toHaveCount(0);
  });
});

test.describe('開啟時全部展開、全部收合與縮放（PRM-R25、PRM-AC33、D-025）', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
  });

  test('PRM-AC33：開啟時所有桌次（含工作人員桌）都是名單卡片、比例 100%、按鈕是「全部收合」；場地圖水平置中、從最上方開始，看得到舞台', async ({
    page,
  }) => {
    await openSeatsMap(page);
    await expectOpeningState(page, `開啟時（${page.viewportSize()?.width ?? 0} px）`);
  });

  test('PRM-AC33：按「全部收合」→ 圓形、適合視窗、30 桌全部可見，按鈕變「全部展開」；放大到 120% 後重新整理 → 回到全部展開、100%、水平置中；收合後放大並捲到下面，再按「全部展開」→ 名單卡片、100%、水平置中、從最上方開始；一直按縮小 → 最小停在 25%', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSeatsMap(page);
    await expectOpeningState(page, '開啟時');

    await collapseAll(page);
    await expect(toolbarButton(page, '全部收合'), '收合後沒有「全部收合」').toHaveCount(0);
    await expectAllCircles(page, '全部收合');
    await expect(async () => {
      await expectAllInside(page, '全部收合');
    }).toPass({ timeout: 5_000 });
    const fit = await zoomValue(page);
    await toolbarButton(page, '適合視窗').click();
    await expect.poll(() => zoomValue(page), { message: '全部收合後就是適合視窗的比例' }).toBe(fit);

    for (let i = 0; i < 40 && (await zoomValue(page)) < 120; i++) await toolbarButton(page, '放大').click();
    expect(await zoomValue(page)).toBeGreaterThanOrEqual(120);
    await reloadSeats(page);
    await expectOpeningState(page, '收合並放大到 120% 後重新整理');

    // 收合、放大到 200% 並把座位圖捲到左下，再按「全部展開」：回到開啟時的樣子，不沿用比例與捲動位置
    await collapseAll(page);
    for (let i = 0; i < 40; i++) await toolbarButton(page, '放大').click();
    expect(await zoomValue(page)).toBe(200);
    await scrollMapTo(page, { left: 0, top: 1_000_000 });
    expect((await mapScroll(page)).top, '先把座位圖捲到下面').toBeGreaterThan(0);
    await expandAll(page);
    await expectOpeningState(page, '再按「全部展開」');

    for (let i = 0; i < 40; i++) await toolbarButton(page, '縮小').click();
    expect(await zoomValue(page)).toBe(25);
  });

  test('展開狀態與比例都不記住：全部收合後重新整理、再開一次都回到全部展開與 100%；全部展開時放大後重新整理也回到 100%；座位安排頁記住的展開狀態與比例不會帶到發布頁（PRM-R25）', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSeatsMap(page);
    await collapseAll(page);
    await reloadSeats(page);
    await expectOpeningState(page, '全部收合後重新整理');

    await collapseAll(page);
    await openSeatsMap(page);
    await expectOpeningState(page, '全部收合後再開一次');

    for (let i = 0; i < 2; i++) await toolbarButton(page, '放大').click();
    expect(await zoomValue(page)).toBeGreaterThan(100);
    await reloadSeats(page);
    await expectOpeningState(page, '全部展開時放大後重新整理');

    // 座位安排頁（只能檢視也能展開與縮放）會記住自己的檢視（SEAT-R70），發布頁不沿用
    await openSeating(page);
    await showMap(page);
    await expandAll(page);
    for (let i = 0; i < 2; i++) await toolbarButton(page, '放大').click();
    expect(await zoomValue(page)).toBeGreaterThan(100);
    await openSeatsMap(page);
    await expectOpeningState(page, '座位安排頁全部展開並放大之後');

    await openSeating(page);
    await showMap(page);
    if (await toolbarButton(page, '全部收合').isVisible()) await toolbarButton(page, '全部收合').click();
    await expect(toolbarButton(page, '全部展開')).toBeVisible();
    for (let i = 0; i < 3; i++) await toolbarButton(page, '放大').click();
    await openSeatsMap(page);
    await expectOpeningState(page, '座位安排頁全部收合並手動縮放之後');
  });

  test('範圍和座位安排頁相同：一直按放大最大停在 200%；全部收合後放大，再按「適合視窗」→ 回到全部收合時的比例，30 桌全部可見（SEAT-R63、SEAT-R64）', async ({
    page,
  }) => {
    await openSeatsMap(page);
    for (let i = 0; i < 40; i++) await toolbarButton(page, '放大').click();
    expect(await zoomValue(page)).toBe(200);

    await collapseAll(page);
    const fit = await zoomValue(page);
    for (let i = 0; i < 3; i++) await toolbarButton(page, '放大').click();
    expect(await zoomValue(page)).not.toBe(fit);
    await toolbarButton(page, '適合視窗').click();
    await expect.poll(() => zoomValue(page)).toBe(fit);
    await expect(async () => {
      await expectAllInside(page, '適合視窗');
    }).toPass({ timeout: 5_000 });
  });

  test('按住 Ctrl 滾動滾輪改變比例；在空白處按住拖曳平移座位圖，整頁不捲動（SEAT-R66、SEAT-R67）', async ({ page }) => {
    desktopOnly(page);
    await openSeatsMap(page);
    const map = await seatMap(page).boundingBox();
    if (!map) throw new Error('量不到座位圖區');
    const before = await zoomValue(page);

    await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await expect.poll(() => zoomValue(page)).toBeGreaterThan(before);

    for (let i = 0; i < 25; i++) await toolbarButton(page, '放大').click();
    const point = await blankPointIn(seatMap(page));
    const t1 = await mapTable(page, B1).boundingBox();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x - 60, point.y - 40, { steps: 6 });
    await page.mouse.move(point.x - 160, point.y - 120, { steps: 10 });
    await page.mouse.up();
    const t1After = await mapTable(page, B1).boundingBox();
    if (!t1 || !t1After) throw new Error('量不到 B1 桌');
    expect(Math.abs(t1After.x - t1.x) + Math.abs(t1After.y - t1.y)).toBeGreaterThan(50);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
    await expectNoHorizontalScroll(page);
  });
});

test.describe('介面配色（PRM-R23、COM-R18、PRM-AC34）', () => {
  test('這個瀏覽器選了深色 → 開 /seats 是深色，第一次繪製就是深色；頁面上沒有介面配色鈕', async ({ page, context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
    await recordFirstFrame(context);
    await openSeating(page);
    await chooseTheme(page, 'dark');
    await expectPageTheme(page, 'dark');

    await page.goto('/seats');
    await expectFirstFrame(page, 'dark');
    await expect(page.getByRole('heading', { level: 1, name: SEATS_TITLE })).toBeVisible();
    await expectPageTheme(page, 'dark');
    await expect(anyThemeButton(page)).toHaveCount(0);
  });
});

test.describe('各種寬度（PRM-R34、PRM-AC35、第 2.3 節）', () => {
  /**
   * 在目前的寬度開 /seats、搜尋「xyz」與「王」、點 B4 桌，檢查版面：
   * 768 px 以上工具列一列，依序是縮小、比例、放大、適合視窗、搜尋框（320 px）、「全部收合」；
   * 767 px 以下第一列是縮小、比例、放大、適合視窗、「全部收合」，第二列是滿版的搜尋框；
   * 搜尋結果（與找不到的提示）在工具列下方、座位圖區上方，從頁面左邊開始；名單桌面從座位圖區右側浮出、手機是 Dialog。
   */
  async function checkWidth(page: Page, width: number) {
    await openSeatsMap(page);
    await expect.poll(() => zoomValue(page)).toBe(100);
    await expectNoHorizontalScroll(page);

    // 內容全寬，左右留 24 px（767 px 以下 16 px）
    const mobile = width <= 767;
    const side = mobile ? 16 : 24;
    const title = await boxOf(page.getByRole('heading', { level: 1, name: SEATS_TITLE }), '標題');
    expect(Math.abs(title.x - side), `${width} px：左邊留白`).toBeLessThanOrEqual(2);

    await expect(toolbarButton(page, '全部收合'), `${width} px：切換鈕是「全部收合」`).toBeVisible();
    const bar = await toolbarBoxes(page);
    expect(bar.zoomOut.y, `${width} px：工具列在標題下方`).toBeGreaterThanOrEqual(title.y + title.height - 1);
    const zoomItems: Named[] = [
      { name: '縮小', box: bar.zoomOut },
      { name: '比例', box: bar.pct },
      { name: '放大', box: bar.zoomIn },
      { name: '適合視窗', box: bar.fit },
    ];
    if (mobile) {
      const firstRow: Named[] = [...zoomItems, { name: '全部收合', box: bar.toggle }];
      expectRowInOrder(firstRow, `${width} px 工具列第一列`);
      const firstRowBottom = Math.max(...firstRow.map((i) => i.box.y + i.box.height));
      expect(bar.search.y, `${width} px：搜尋框在工具列第二列`).toBeGreaterThanOrEqual(firstRowBottom - 1);
      expect(Math.abs(bar.search.x - side), `${width} px：搜尋框從左邊留白開始`).toBeLessThanOrEqual(2);
      expect(Math.abs(bar.search.width - (width - 2 * side)), `${width} px：搜尋框滿版`).toBeLessThanOrEqual(4);
    } else {
      expectRowInOrder([...zoomItems, { name: '搜尋框', box: bar.search }, { name: '全部收合', box: bar.toggle }], `${width} px 工具列`);
      expect(Math.abs(bar.search.width - 320), `${width} px：搜尋框寬 320 px`).toBeLessThanOrEqual(4);
    }
    const map = await boxOf(seatMap(page), '座位圖區');
    expect(map.y, `${width} px：座位圖區在工具列下方`).toBeGreaterThanOrEqual(toolbarBottom(bar) - 1);

    await seatSearch(page).fill('xyz');
    await expectBetweenToolbarAndMap(page, notFoundLine(page, 'xyz'), side, `${width} px：「找不到「xyz」。」`);
    await seatSearch(page).fill('王');
    await expectBetweenToolbarAndMap(page, resultLine(page, '王小明：B4 桌'), side, `${width} px：搜尋結果`);
    await expectNoHorizontalScroll(page);

    await tableButton(page, B4).click();
    if (mobile) {
      const dialog = page.getByRole('dialog', { name: 'B4 桌', exact: true });
      await expect(dialog, `${width} px：名單是 Dialog`).toBeVisible();
      const box = await dialog.boundingBox();
      if (!box) throw new Error('量不到 Dialog');
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await expectNoHorizontalScroll(page);
      await dialog.getByRole('button', { name: '關閉' }).first().click();
    } else {
      const panel = page.getByRole('region', { name: 'B4 桌', exact: true });
      await expect(panel, `${width} px：名單從座位圖區右側浮出`).toBeVisible();
      await expect(page.getByRole('dialog', { name: 'B4 桌', exact: true })).toHaveCount(0);
      const box = await panel.boundingBox();
      const mapBox = await seatMap(page).boundingBox();
      if (!box || !mapBox) throw new Error('量不到名單或座位圖區');
      expect(Math.abs(box.width - 360), `${width} px：名單寬 360 px`).toBeLessThanOrEqual(2);
      expect(box.x + box.width, '在座位圖區的右側').toBeLessThanOrEqual(mapBox.x + mapBox.width + 1);
      expect(box.x + box.width, '貼著座位圖區的右側').toBeGreaterThan(mapBox.x + mapBox.width - 40);
      await expectNoHorizontalScroll(page);
      await panel.getByRole('button', { name: '關閉' }).first().click();
    }
  }

  test.beforeEach(async ({ context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
  });

  test('桌面瀏覽器：320、375、430、768、1024、1280 px 都沒有整頁水平捲動；768 px 以上工具列一列（縮小、比例、放大、適合視窗、搜尋框、「全部收合」），767 px 以下第一列是縮放與「全部收合」、第二列是滿版搜尋框；結果在工具列下方；767 px 以下名單是 Dialog，以上從座位圖區右側浮出', async ({
    page,
  }) => {
    test.skip(isMobileWidth(page), '手機專案只驗 320 px（下一個測試）');
    test.setTimeout(120_000);
    for (const width of [320, 375, 430, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await test.step(`${width} px`, () => checkWidth(page, width));
    }
  });

  test('手機 320 px（觸控）：沒有整頁水平捲動；工具列第一列是縮放與「全部收合」、第二列是滿版搜尋框，結果在搜尋框下方；名單是 Dialog', async ({
    page,
  }) => {
    test.skip(!isMobileWidth(page), '手機寬度');
    await checkWidth(page, page.viewportSize()?.width ?? 320);
  });
});

test.describe('載入中（第 2.3 節「狀態」、D-025）', () => {
  // 關掉 JavaScript 開 /seats：畫面停在伺服器送出的載入中畫面（loading.tsx 的串流 fallback，或發布頁在瀏覽器量好座位圖區大小之前的
  // Skeleton），可以量 Skeleton 的形狀。卡片形狀：寬高都至少 40 px、寬高比 0.6～2、圓角小於短邊的 1/4（不是圓形）；
  // 包住 3 個以上卡片形狀的是外層（格線、欄），不算一張卡片；卡片裡面的區塊也不重複算。
  test.use({ javaScriptEnabled: false });

  test('座位圖顯示 30 張展開卡片形狀的 Skeleton（不是圓形），不顯示文字', async ({ page, context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
    await page.goto('/seats', { waitUntil: 'domcontentloaded' });
    const loading = page.getByRole('status', { name: '載入中' }).filter({ visible: true }).first();
    await expect(loading, '關掉 JavaScript 時畫面停在載入中').toBeVisible();

    const info = await loading.evaluate((region) => {
      const els = Array.from(region.querySelectorAll('*'));
      const radius = (el: Element) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const isCircle = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width >= 40 && Math.abs(r.width - r.height) < 1 && radius(el) >= r.width / 2 - 1;
      };
      const isCardShape = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 40) return false;
        const ratio = r.width / r.height;
        return ratio >= 0.6 && ratio <= 2 && radius(el) < Math.min(r.width, r.height) / 4;
      };
      const shapes = els.filter(isCardShape);
      const inside = (el: Element) => shapes.filter((s) => s !== el && el.contains(s)).length;
      const candidates = shapes.filter((s) => inside(s) < 3);
      const cards = candidates.filter((c) => !candidates.some((o) => o !== c && o.contains(c)));
      return { text: (region as HTMLElement).innerText.trim(), circles: els.filter(isCircle).length, cards: cards.length };
    });
    expect(info.text, '載入中不顯示文字').toBe('');
    expect(info.circles, '沒有圓形的 Skeleton（D-025 改成卡片）').toBe(0);
    expect(info.cards, '30 張展開卡片形狀的 Skeleton').toBe(30);
  });
});

test.describe('座位安排頁不變（D-025 只改發布頁）', () => {
  test('同一份資料在座位安排頁：B4 仍顯示「3/10」、B10「已滿」、B13「超過」、工作人員桌「已滿」，B4 的無障礙名稱仍有人數；展開後名單列仍有素食、兒童椅標示與「賓」', async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSeats();
    await asViewer(context, baseURL);
    await openSeating(page);
    await showMap(page);
    await expect(mapTable(page, B4)).toContainText('3/10');
    await expect(mapTable(page, B10)).toContainText('已滿');
    await expect(mapTable(page, B13)).toContainText('超過');
    await expect(staffTable(page)).toContainText('已滿');
    // 座位安排頁的無障礙名稱以人數結尾（helpers/seating-page.ts 開頭：例如「B4 桌，主桌，研發一部，4/10」）
    await expect(tableButton(page, B4)).toHaveAccessibleName(/^B4 桌，.*3\/10$/);

    await expandAll(page);
    await expect(mapTable(page, B10)).toContainText('已滿');
    await expect(mapTable(page, B13)).toContainText('超過');
    const rows = cardRows(page, B4);
    await expect(rows.nth(0).getByLabel('素食', { exact: true })).toHaveCount(1);
    await expect(rows.nth(1).getByLabel('兒童椅', { exact: true })).toHaveCount(1);
    await expect(rows.nth(2)).toContainText('賓');
  });
});
