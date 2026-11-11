// 縮放、展開與檢視：docs/spec/seating.md 2.1.4～2.1.7、3.11；SEAT-R63～R71；SEAT-AC65～AC74；
// SEAT-Q07（縮小、放大每次加減 10 個百分點，原型的做法，目前假設）。
// 展開卡片的尺寸與間距（D-022）：2.1.7 卡片寬 256 px、左右空 12 px（欄距 268 px）、上下空 12 px（同一欄列距 232 px；
// 有桌次 11、12 位時 258 px）、不互相重疊、工作人員桌同一個寬度；2.1.8 名單列高 24 px 與字級不變、姓名完整顯示；
// 收合圓形（2.1.5）與桌次詳情（2.3.1）不變。展開後比例是 100%（SEAT-R69），量到的 px 就是卡片的實際尺寸。
// 縮放比例由工具列的「{n}%」讀出。這個檔案自己設定視窗寬度，只在 desktop project 跑。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { seed, STAFF } from './helpers/seating-data';
import {
  blankPointIn,
  cardRows,
  expandAll,
  isInside,
  mapTable,
  openSeating,
  openTableDetail,
  rowWithName,
  seatMap,
  staffTable,
  staffTableButton,
  stagingArea,
  styleOfText,
  tableButton,
  tableDetail,
  tableHandle,
  toolbarButton,
  zoomToRegular,
  zoomValue,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL, page }) => {
  test.skip(isMobileWidth(page), '這個檔案自己設定視窗寬度，只在 desktop project 跑');
  await signIn(context, requireBaseURL(baseURL));
});

const allTables = (page: Page) => [...Array.from({ length: 30 }, (_, i) => mapTable(page, i + 1)), staffTable(page)];

/**
 * 30 桌、工作人員桌與暫存區都在 area 裡。D-027 起暫存區是場地圖的一部分（B 區外側列右邊一欄，seating.md 2.1.12），
 * 「適合視窗」時也算進去：SEAT-R64「讓 30 個位置、工作人員桌與暫存區全部可見」
 */
async function expectAllInside(page: Page, area: { x: number; y: number; width: number; height: number }) {
  for (const t of allTables(page)) expect(await isInside(t, area), (await t.getAttribute('aria-label')) ?? undefined).toBe(true);
  expect(await isInside(stagingArea(page), area), '暫存區').toBe(true);
}

/**
 * 整張場地圖的左右邊界（量置中用）：左邊界是桌次外框的最左邊；右邊界取桌次外框與暫存區兩者的最右邊。
 * D-027 起暫存區是場地圖的一部分（seating.md 2.1.12、SEAT-R64），置中的對象是包含暫存區的整張場地圖（SEAT-R67）
 */
async function venueBounds(page: Page): Promise<{ left: number; right: number }> {
  const boxes = await Promise.all(allTables(page).map((t) => t.boundingBox()));
  const staging = await stagingArea(page).boundingBox();
  if (!staging) throw new Error('量不到暫存區');
  const left = Math.min(...boxes.map((b) => b?.x ?? Infinity));
  const right = Math.max(...boxes.map((b) => (b ? b.x + b.width : -Infinity)), staging.x + staging.width);
  return { left, right };
}

async function mapBox(page: Page) {
  const box = await seatMap(page).boundingBox();
  if (!box) throw new Error('量不到座位圖區');
  return box;
}

async function clickTimes(page: Page, name: '放大' | '縮小', times: number) {
  for (let i = 0; i < times; i++) await toolbarButton(page, name).click();
}

async function seedBasic() {
  await seed(async (s) => {
    await s.noteName(7, '主桌');
    await s.fill(7, 2, { department: '研發一部', prefix: '七' });
    await s.fill(5, 10, { prefix: '滿' });
    await s.staff('工作甲');
  });
}

test.describe('適合視窗（SEAT-R64、SEAT-R65、SEAT-R71）', () => {
  test('沒有記住的手動縮放：開啟時 30 桌全部在座位圖區內可見，顯示目前比例（SEAT-AC65）', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    const value = await zoomValue(page);
    expect(value).toBeGreaterThanOrEqual(25);
    expect(value).toBeLessThanOrEqual(200);
    await expectAllInside(page, await mapBox(page));
  });

  test('適合視窗狀態把視窗縮窄：重新計算比例，仍全部可見；手動放大後再縮窄，比例不變（SEAT-R64、SEAT-R71、SEAT-AC66）', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    const wide = await zoomValue(page);

    await page.setViewportSize({ width: 1100, height: 800 });
    await expect.poll(() => zoomValue(page)).toBeLessThan(wide);
    await expectAllInside(page, await mapBox(page));

    await clickTimes(page, '放大', 3);
    const manual = await zoomValue(page);
    await page.setViewportSize({ width: 1000, height: 760 });
    await page.waitForTimeout(300);
    expect(await zoomValue(page)).toBe(manual);
  });

  test('打開桌次詳情時只用沒被詳情蓋住的寬度適合，30 桌都在沒被蓋住的區域內；關閉後回到用整個座位圖區適合（SEAT-R65、SEAT-AC67）', async ({
    page,
  }) => {
    await seedBasic();
    await openSeating(page);
    // 收合側選單與人員面板，讓沒被詳情蓋住的寬度算出的比例不低於 35%
    await page.getByRole('button', { name: '收合或展開側選單' }).click();
    await page.getByRole('button', { name: '隱藏人員面板' }).click();
    await page.waitForTimeout(300);
    const whole = await zoomValue(page);

    const detail = await openTableDetail(page, 7);
    await page.waitForTimeout(300);
    const map = await mapBox(page);
    const d = await detail.boundingBox();
    if (!d) throw new Error('量不到詳情');
    expect(await zoomValue(page)).toBeGreaterThanOrEqual(35);
    await expectAllInside(page, { x: map.x, y: map.y, width: d.x - map.x, height: map.height });

    await detail.getByRole('button', { name: '關閉' }).click();
    await expect.poll(() => zoomValue(page)).toBe(whole);
  });

  test('沒被蓋住的寬度算出的比例低於 35% 時，改用整個座位圖區適合（SEAT-R65、SEAT-AC67）', async ({ page }) => {
    await seedBasic();
    await page.setViewportSize({ width: 1024, height: 800 });
    await openSeating(page);
    const whole = await zoomValue(page);
    await openTableDetail(page, 7);
    await page.waitForTimeout(300);
    expect(await zoomValue(page)).toBe(whole);
    await expectAllInside(page, await mapBox(page));
  });

  test('手動縮放後開關桌次詳情：比例不變（SEAT-R71）', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    await clickTimes(page, '放大', 2);
    const manual = await zoomValue(page);
    await openTableDetail(page, 7);
    expect(await zoomValue(page)).toBe(manual);
    await tableDetail(page, 7).getByRole('button', { name: '關閉' }).click();
    expect(await zoomValue(page)).toBe(manual);
  });

  test('按「適合視窗」回到自動適合（SEAT-R64）', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    const fit = await zoomValue(page);
    await clickTimes(page, '放大', 4);
    expect(await zoomValue(page)).not.toBe(fit);
    await toolbarButton(page, '適合視窗').click();
    await expect.poll(() => zoomValue(page)).toBe(fit);
    await expectAllInside(page, await mapBox(page));
  });
});

test.describe('縮放（SEAT-R63、SEAT-R66、SEAT-R67）', () => {
  test('一直按「放大」最大停在 200%；一直按「縮小」最小停在 25%（SEAT-AC68）', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    await clickTimes(page, '放大', 25);
    expect(await zoomValue(page)).toBe(200);
    await toolbarButton(page, '放大').click();
    expect(await zoomValue(page)).toBe(200);
    await clickTimes(page, '縮小', 25);
    expect(await zoomValue(page)).toBe(25);
    await toolbarButton(page, '縮小').click();
    expect(await zoomValue(page)).toBe(25);
  });

  test('「放大」「縮小」每次加減 10 個百分點（SEAT-Q07 的目前假設）', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    await clickTimes(page, '縮小', 25);
    await toolbarButton(page, '放大').click();
    expect(await zoomValue(page)).toBe(35);
    await toolbarButton(page, '放大').click();
    expect(await zoomValue(page)).toBe(45);
    await toolbarButton(page, '縮小').click();
    expect(await zoomValue(page)).toBe(35);
  });

  test('按住 Ctrl 滾動滾輪改變比例；在空白處按住拖曳平移座位圖，整頁不捲動（SEAT-R66、SEAT-R67、SEAT-AC69）', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    const map = await mapBox(page);
    const before = await zoomValue(page);

    await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await expect.poll(() => zoomValue(page)).toBeGreaterThan(before);
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);

    await clickTimes(page, '放大', 25);
    const point = await blankPointIn(seatMap(page));
    const t1 = await mapTable(page, 1).boundingBox();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x - 60, point.y - 40, { steps: 6 });
    await page.mouse.move(point.x - 160, point.y - 120, { steps: 10 });
    await page.mouse.up();
    const t1After = await mapTable(page, 1).boundingBox();
    if (!t1 || !t1After) throw new Error('量不到 B1 桌');
    expect(Math.abs(t1After.x - t1.x) + Math.abs(t1After.y - t1.y)).toBeGreaterThan(50);
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
    await expectNoHorizontalScroll(page);
  });
});

test.describe('精簡顯示（SEAT-R68、2.1.6、SEAT-AC70）', () => {
  /** 比例 → 是否應該精簡顯示；檢查桌號字級、把手大小、備註名稱與已滿徽章 */
  async function expectDisplayFor(page: Page) {
    const value = await zoomValue(page);
    const compact = value < 80;
    // 內部編號 7 是 B2 桌：桌號文字「B2」（D-019）
    const number = await styleOfText(mapTable(page, 7), 'B2');
    expect(number?.fontSize, `${value}% 的桌號字級`).toBe(compact ? '36px' : '20px');
    const handle = await tableHandle(page, 7).evaluate((el) => getComputedStyle(el).width);
    expect(handle, `${value}% 的把手`).toBe(compact ? '36px' : '24px');
    if (compact) await expect(mapTable(page, 7)).not.toContainText('主桌');
    else await expect(mapTable(page, 7)).toContainText('主桌');
    // 已滿徽章：精簡顯示時高 28 px（文字本身或往上兩層的徽章外框，計算後的高度不受縮放影響）
    const badgeHeights = await mapTable(page, 5)
      .getByText('已滿', { exact: true })
      .evaluate((el) => {
        const heights: string[] = [];
        let node: Element | null = el;
        for (let i = 0; i < 3 && node; i++) {
          heights.push(getComputedStyle(node).height);
          node = node.parentElement;
        }
        return heights;
      });
    if (compact) expect(badgeHeights, `${value}% 的已滿徽章`).toContain('28px');
    else expect(badgeHeights, `${value}% 的已滿徽章`).not.toContain('28px');
    return value;
  }

  test('75% 時桌次只顯示大號桌號與人數（已滿是放大的徽章），備註名稱與部門只在 Tooltip，把手 36 px；80% 時恢復一般收合顯示', async ({
    page,
  }) => {
    await seedBasic();
    await openSeating(page);

    await clickTimes(page, '縮小', 25);
    await clickTimes(page, '放大', 5);
    const low = await expectDisplayFor(page);
    expect(low).toBeGreaterThanOrEqual(70);
    expect(low).toBeLessThan(80);

    await clickTimes(page, '放大', 25);
    await clickTimes(page, '縮小', 12);
    const edge = await expectDisplayFor(page);
    expect(edge).toBeGreaterThanOrEqual(80);
    expect(edge).toBeLessThan(90);

    await toolbarButton(page, '縮小').click();
    expect(await expectDisplayFor(page)).toBeLessThan(80);
  });
});

test.describe('全部展開與收合（SEAT-R69、SEAT-AC71）', () => {
  test('「全部展開」所有桌次與工作人員桌換成 10 列名單卡片、比例 100%、按鈕變「全部收合」；「全部收合」換回圓形並適合視窗', async ({
    page,
  }) => {
    await seedBasic();
    await openSeating(page);
    const fit = await zoomValue(page);
    await expect(mapTable(page, 3).getByRole('listitem')).toHaveCount(0);

    await expandAll(page);
    expect(await zoomValue(page)).toBe(100);
    for (const t of allTables(page)) await expect(t.getByRole('listitem')).toHaveCount(10);
    // 展開卡片的標頭寫「{桌號} 桌」（2.1.7）
    await expect(mapTable(page, 7)).toContainText('B2 桌');
    await expect(staffTable(page)).toContainText('工作人員桌');

    await toolbarButton(page, '全部收合').click();
    await expect(toolbarButton(page, '全部展開')).toBeVisible();
    await expect(mapTable(page, 3).getByRole('listitem')).toHaveCount(0);
    await expect.poll(() => zoomValue(page)).toBe(fit);
  });

  // D-022：卡片寬由 280 px 改為 256 px
  test('展開的卡片寬 256 px、同一欄的卡片不會互相重疊（2.1.7、D-022）', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    await expandAll(page);
    const a = await mapTable(page, 3).boundingBox();
    const b = await mapTable(page, 4).boundingBox();
    if (!a || !b) throw new Error('量不到卡片');
    expect(Math.round(a.width)).toBe(256);
    expect(a.y + a.height).toBeLessThanOrEqual(b.y);
  });
});

// ---- 展開卡片的尺寸與間距（2.1.7、D-022）

type Box = { x: number; y: number; width: number; height: number };

const STAFF_CARD = '工作人員桌';
/** B 外欄由上到下：最上面是工作人員桌（2.1.4、2.5.1） */
const B_OUTER: readonly string[] = [STAFF_CARD, 'B4', 'B7', 'B10', 'B13'];
/** 2.1.4 的欄與列：六欄由左到右，每欄由上（靠近舞台）到下；共 30 桌加工作人員桌 */
const COLUMNS: readonly { name: string; cards: readonly string[] }[] = [
  { name: 'A 外', cards: ['A4', 'A7', 'A10', 'A13'] },
  { name: 'A 中', cards: ['A2', 'A5', 'A8', 'A11', 'A14'] },
  { name: 'A 內', cards: ['A1', 'A3', 'A6', 'A9', 'A12', 'A15'] },
  { name: 'B 內', cards: ['B1', 'B3', 'B6', 'B9', 'B12', 'B15'] },
  { name: 'B 中', cards: ['B2', 'B5', 'B8', 'B11', 'B14'] },
  { name: 'B 外', cards: B_OUTER },
];
const ALL_CARDS = COLUMNS.flatMap((c) => c.cards);

const cardOf = (page: Page, ref: string) => (ref === STAFF_CARD ? staffTable(page) : mapTable(page, ref));
const labelOf = (ref: string) => (ref === STAFF_CARD ? ref : `${ref} 桌`);

async function cardBox(page: Page, ref: string): Promise<Box> {
  const box = await cardOf(page, ref).boundingBox();
  if (!box) throw new Error(`量不到${labelOf(ref)}`);
  return box;
}

async function columnBoxes(page: Page, cards: readonly string[]): Promise<Box[]> {
  return Promise.all(cards.map((ref) => cardBox(page, ref)));
}

/** 比例 100% 時量到的 px，容許 1 px 誤差 */
function expectPx(actual: number, expected: number, what: string) {
  expect(Math.abs(actual - expected), `${what}：量到 ${actual.toFixed(1)} px，應為 ${expected} px`).toBeLessThanOrEqual(1);
}

/** 全部展開，並確認比例是 100%（SEAT-R69），之後量到的 px 就是卡片的實際尺寸 */
async function expandAt100(page: Page) {
  await expandAll(page);
  expect(await zoomValue(page)).toBe(100);
}

/** 30 桌與工作人員桌的卡片兩兩都不重疊（容許 0.5 px 誤差） */
async function expectNoCardsOverlap(page: Page) {
  const boxes = await Promise.all(ALL_CARDS.map((ref) => cardBox(page, ref)));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const overlap =
        a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
      expect(overlap, `${labelOf(ALL_CARDS[i]!)}、${labelOf(ALL_CARDS[j]!)}重疊`).toBe(false);
    }
  }
}

test.describe('展開卡片的寬度與間距（2.1.7、D-022）', () => {
  test('30 桌與工作人員桌的卡片都寬 256 px；同一欄的卡片左右對齊；相鄰兩欄的卡片左右空 12 px（欄距 268 px）', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    await expandAt100(page);

    for (const ref of ALL_CARDS) expectPx((await cardBox(page, ref)).width, 256, `${labelOf(ref)}的卡片寬`);

    const firsts: { name: string; box: Box }[] = [];
    for (const column of COLUMNS) {
      const boxes = await columnBoxes(page, column.cards);
      const top = boxes[0]!;
      boxes.forEach((b, k) =>
        expectPx(b.x, top.x, `${column.name}欄：${labelOf(column.cards[k]!)}和${labelOf(column.cards[0]!)}左右對齊`),
      );
      firsts.push({ name: column.name, box: top });
    }
    // 六欄由左到右的五對相鄰欄（含 A 內與 B 內之間）
    for (let i = 1; i < firsts.length; i++) {
      const left = firsts[i - 1]!;
      const right = firsts[i]!;
      expectPx(right.box.x - left.box.x, 268, `${left.name}欄到${right.name}欄的欄距`);
      expectPx(right.box.x - (left.box.x + left.box.width), 12, `${left.name}欄和${right.name}欄的卡片之間左右的空隙`);
    }
  });

  test('同一欄的卡片上下空 12 px（列距 232 px），六欄都一樣；所有卡片都不重疊', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    await expandAt100(page);

    for (const column of COLUMNS) {
      const boxes = await columnBoxes(page, column.cards);
      for (let k = 1; k < boxes.length; k++) {
        const upper = boxes[k - 1]!;
        const lower = boxes[k]!;
        const pair = `${column.name}欄 ${labelOf(column.cards[k - 1]!)}→${labelOf(column.cards[k]!)}`;
        expectPx(lower.y - upper.y, 232, `${pair}的列距`);
        expectPx(lower.y - (upper.y + upper.height), 12, `${pair}之間上下的空隙`);
      }
    }
    await expectNoCardsOverlap(page);
  });

  for (const count of [11, 12]) {
    test(`B10 桌有 ${count} 位：B10 桌卡片 12 列、變高；B 外欄的列距 258 px，B10 桌卡片下方仍空 12 px；卡片仍寬 256 px、都不重疊（D-018、D-022）`, async ({
      page,
    }) => {
      await seed(async (s) => {
        await s.fill(5, count, { prefix: '五' });
        await s.fill(4, 3, { prefix: '四' });
        await s.staff('工作甲');
      });
      await openSeating(page);
      await expandAt100(page);
      await expect(cardRows(page, 'B10')).toHaveCount(12);
      await expect(cardRows(page, 'B7')).toHaveCount(10);

      const boxes = await columnBoxes(page, B_OUTER);
      for (let k = 1; k < boxes.length; k++) {
        expectPx(boxes[k]!.y - boxes[k - 1]!.y, 258, `B 外欄 ${labelOf(B_OUTER[k - 1]!)}→${labelOf(B_OUTER[k]!)}的列距`);
      }
      const b7 = boxes[B_OUTER.indexOf('B7')]!;
      const b10 = boxes[B_OUTER.indexOf('B10')]!;
      const b13 = boxes[B_OUTER.indexOf('B13')]!;
      expect(b10.height, 'B10 桌卡片跟著變高').toBeGreaterThan(b7.height);
      expectPx(b13.y - (b10.y + b10.height), 12, 'B10 桌（12 列）卡片和下面 B13 桌之間上下的空隙');

      for (const ref of ALL_CARDS) expectPx((await cardBox(page, ref)).width, 256, `${labelOf(ref)}的卡片寬`);
      await expectNoCardsOverlap(page);
    });
  }

  test('工作人員桌的展開卡片同一個寬度 256 px，和 B 外欄的卡片左右對齊，10 列名單（2.1.7、2.5.1）', async ({ page }) => {
    await seed(async (s) => {
      await s.staff('工作甲', { department: '研發一部' });
      await s.staff('工作乙', { department: '研發一部' });
      await s.fill(3, 2, { prefix: '三' });
    });
    await openSeating(page);
    await expandAt100(page);
    await expect(staffTable(page).getByRole('listitem')).toHaveCount(10);
    const staff = await cardBox(page, STAFF_CARD);
    const b4 = await cardBox(page, 'B4');
    expectPx(staff.width, 256, '工作人員桌的卡片寬');
    expectPx(staff.width, b4.width, '工作人員桌和 B4 桌的卡片同寬');
    expectPx(staff.x, b4.x, '工作人員桌和 B4 桌左右對齊');
    expectPx(b4.y - (staff.y + staff.height), 12, '工作人員桌和下面 B4 桌之間上下的空隙');
  });

  test('工作人員桌有 12 位：卡片 12 列、寬 256 px，和下面的 B4 桌不重疊；所有卡片都不重疊（2.5.1、D-018、D-022）', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(STAFF, 12, { prefix: '工作' });
      await s.fill(3, 10, { prefix: '三' });
    });
    await openSeating(page);
    await expandAt100(page);
    await expect(staffTable(page).getByRole('listitem')).toHaveCount(12);
    const staff = await cardBox(page, STAFF_CARD);
    const b4 = await cardBox(page, 'B4');
    expectPx(staff.width, 256, '工作人員桌的卡片寬');
    expect(staff.height, '工作人員桌卡片跟著變高').toBeGreaterThan(b4.height);
    expect(staff.y + staff.height, '工作人員桌卡片的下緣不超過 B4 桌的上緣').toBeLessThanOrEqual(b4.y + 0.5);
    await expectNoCardsOverlap(page);
  });

  test('只改展開卡片：收合後的圓形仍是直徑 88 px（含工作人員桌），桌次詳情仍寬 360 px（2.1.5、2.3.1、D-022 的範圍）', async ({
    page,
  }) => {
    await seedBasic();
    await openSeating(page);
    await expandAll(page);
    await toolbarButton(page, '全部收合').click();
    await expect(toolbarButton(page, '全部展開')).toBeVisible();
    // 80% 以上是一般收合（精簡顯示見 2.1.6）
    await zoomToRegular(page);
    for (const [label, button] of [
      ['B4 桌', tableButton(page, 'B4')],
      ['A1 桌', tableButton(page, 'A1')],
      ['工作人員桌', staffTableButton(page)],
    ] as const) {
      const size = await button.evaluate((el) => [getComputedStyle(el).width, getComputedStyle(el).height]);
      expect(size, `收合的${label}`).toEqual(['88px', '88px']);
    }

    const detail = await openTableDetail(page, 'B4');
    const box = await detail.boundingBox();
    expect(Math.round(box?.width ?? 0), '桌次詳情的寬').toBe(360);
  });
});

// ---- 展開卡片的名單列（2.1.8、D-022）

/** 計算後的字級 token（例如 --font-size-xs） */
async function tokenFontSize(page: Page, token: string): Promise<string> {
  return page.evaluate((t) => {
    const d = document.createElement('div');
    d.style.fontSize = `var(${t})`;
    document.body.appendChild(d);
    const v = getComputedStyle(d).fontSize;
    d.remove();
    return v;
  }, token);
}

/** 從元素往上到桌次（group）為止，沒有任何會裁切內容的外層把它切掉 */
async function notClippedInCard(loc: Locator): Promise<boolean> {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (let a = el.parentElement; a && a.getAttribute('role') !== 'group'; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const b = a.getBoundingClientRect();
      if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) return false;
    }
    return true;
  });
}

/** 名單列裡的姓名完整顯示：沒有被截斷（內容沒有超出自己的框）、外框在名單列裡、沒有被外層裁切 */
async function expectWholeName(row: Locator, name: string): Promise<Locator> {
  const text = row.getByText(name, { exact: true });
  await expect(text, name).toHaveCount(1);
  expect(await text.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${name} 沒有被截斷`).toBe(true);
  expect(await isInside(text, row), `${name} 的外框在名單列裡`).toBe(true);
  expect(await notClippedInCard(text), `${name} 沒有被外層裁切`).toBe(true);
  return text;
}

test.describe('展開卡片的名單列：名字完整顯示（2.1.8、D-022）', () => {
  test('6 個字元的眷屬顯示名稱加一個兒童椅或素食標示：名字完整顯示、沒有被截斷；標示並排在名字右邊、也在名單列裡；名單列高 24 px、姓名仍是 Text-xs', async ({
    page,
  }) => {
    // 「王小明_眷屬」「陳美玲_眷屬」都是 6 個字元；分別排在名單第 2、第 7 列（兩欄各 5 列，兩欄都看到）
    await seed(async (s) => {
      const wang = await s.employee('王小明', { department: '研發一部', tableId: 3 });
      await s.dependent(wang, { tableId: 3, childSeat: true });
      await s.fill(3, 3, { prefix: '甲' });
      const chen = await s.employee('陳美玲', { department: '研發一部', tableId: 3 });
      await s.dependent(chen, { tableId: 3, vegetarian: true });
    });
    await openSeating(page);
    await expandAt100(page);
    expectPx((await cardBox(page, 'B4')).width, 256, 'B4 桌的卡片寬');

    const rows = cardRows(page, 'B4');
    await expect(rows).toHaveCount(10);
    // 名單列高 24 px 不變（D-022）
    expect(await rows.evaluateAll((els) => els.map((el) => getComputedStyle(el).height))).toEqual(
      Array.from({ length: 10 }, () => '24px'),
    );
    const xs = await tokenFontSize(page, '--font-size-xs');

    for (const [name, mark, other] of [
      ['王小明_眷屬', '兒童椅', '素食'],
      ['陳美玲_眷屬', '素食', '兒童椅'],
    ] as const) {
      const row = rowWithName(rows, page, name);
      await expect(row, name).toHaveCount(1);
      expect(await isInside(row, mapTable(page, 'B4')), `${name} 那一列在卡片裡`).toBe(true);
      await expect(row.getByLabel(other), `${name} 只有${mark}標示`).toHaveCount(0);

      const text = await expectWholeName(row, name);
      // 字級不變：不是靠縮小字級塞進去（2.1.8 Text-xs、D-022）
      expect(await text.evaluate((el) => getComputedStyle(el).fontSize), `${name} 的字級`).toBe(xs);

      // 寬 256 px 時，最長的眷屬名加一個小標示仍並排完整顯示（D-022）
      const badge = row.getByLabel(mark);
      await expect(badge, `${name} 的${mark}標示`).toHaveCount(1);
      expect(await isInside(badge, row), `${name} 的${mark}標示在名單列裡`).toBe(true);
      expect(await notClippedInCard(badge), `${name} 的${mark}標示沒有被外層裁切`).toBe(true);
      const n = await text.boundingBox();
      const b = await badge.boundingBox();
      if (!n || !b) throw new Error(`量不到 ${name} 或${mark}標示`);
      expect(b.x, `${mark}標示在 ${name} 的右邊、沒有蓋住名字`).toBeGreaterThanOrEqual(n.x + n.width - 1);
    }
  });

  test('眷屬同時有兒童椅與素食兩個標示：名字仍完整顯示、沒有被截斷，外框在名單列裡（2.1.8）', async ({ page }) => {
    await seed(async (s) => {
      const wang = await s.employee('王小明', { department: '研發一部', tableId: 3 });
      await s.dependent(wang, { tableId: 3, childSeat: true, vegetarian: true });
      await s.fill(3, 3, { prefix: '甲' });
      const chen = await s.employee('陳美玲', { department: '研發一部', tableId: 3 });
      await s.dependent(chen, { tableId: 3, childSeat: true, vegetarian: true });
    });
    await openSeating(page);
    await expandAt100(page);

    const rows = cardRows(page, 'B4');
    for (const name of ['王小明_眷屬', '陳美玲_眷屬']) {
      const row = rowWithName(rows, page, name);
      await expect(row, name).toHaveCount(1);
      await expect(row.getByLabel('兒童椅'), `${name} 的兒童椅標示`).toHaveCount(1);
      await expect(row.getByLabel('素食'), `${name} 的素食標示`).toHaveCount(1);
      await expectWholeName(row, name);
    }
  });
});

test.describe('記住檢視（SEAT-R70、SEAT-AC72、SEAT-AC73）', () => {
  test('桌面展開並手動縮放到 120%：重新開啟仍是展開、120%；按「適合視窗」後重新開啟是自動適合', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    await expandAll(page);
    await clickTimes(page, '放大', 2);
    expect(await zoomValue(page)).toBe(120);

    await openSeating(page);
    await expect(toolbarButton(page, '全部收合')).toBeVisible();
    expect(await zoomValue(page)).toBe(120);

    await toolbarButton(page, '適合視窗').click();
    await page.waitForTimeout(300);
    const fit = await zoomValue(page);
    await openSeating(page);
    expect(await zoomValue(page)).toBe(fit);
    await page.setViewportSize({ width: 1100, height: 800 });
    await expect.poll(() => zoomValue(page)).not.toBe(fit);
  });

  test('桌面手動縮放的比例不會帶到手機（375 px）', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    await clickTimes(page, '放大', 25);
    expect(await zoomValue(page)).toBe(200);

    await page.setViewportSize({ width: 375, height: 800 });
    await openSeating(page);
    expect(await zoomValue(page)).not.toBe(200);
    await expectAllInside(page, await mapBox(page));
  });
});

test.describe('整頁不能水平捲動、場地圖置中（SEAT-R67、SEAT-AC74）', () => {
  for (const width of [320, 375, 430, 768, 1024, 1280]) {
    test(`${width} px：沒有整頁水平捲動；場地圖比座位圖區窄時水平置中`, async ({ page }) => {
      await seed(async (s) => {
        await s.fill(3, 2);
        await s.fill(STAFF, 1, { prefix: '工作' });
      });
      await page.setViewportSize({ width, height: 800 });
      await openSeating(page);
      await expectNoHorizontalScroll(page);

      const map = await mapBox(page);
      // 場地圖的右邊界含暫存區（D-027）
      const { left, right } = await venueBounds(page);
      const gapLeft = left - map.x;
      const gapRight = map.x + map.width - right;
      expect(gapLeft).toBeGreaterThanOrEqual(-1);
      expect(gapRight).toBeGreaterThanOrEqual(-1);
      expect(Math.abs(gapLeft - gapRight), `左右留白 ${gapLeft} / ${gapRight}`).toBeLessThanOrEqual(12);
    });
  }

  test('打開桌次詳情時，場地圖在沒被詳情蓋住的區域置中（SEAT-R67）', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    await page.getByRole('button', { name: '收合或展開側選單' }).click();
    await page.getByRole('button', { name: '隱藏人員面板' }).click();
    const detail = await openTableDetail(page, 7);
    await page.waitForTimeout(300);
    const map = await mapBox(page);
    const d = await detail.boundingBox();
    if (!d) throw new Error('量不到詳情');
    // 場地圖的右邊界含暫存區（D-027）
    const { left, right } = await venueBounds(page);
    expect(Math.abs(left - map.x - (d.x - right)), `左右留白 ${left - map.x} / ${d.x - right}`).toBeLessThanOrEqual(12);
  });
});
