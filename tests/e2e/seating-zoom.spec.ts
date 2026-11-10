// 縮放、展開與檢視：docs/spec/seating.md 2.1.4～2.1.7、3.11；SEAT-R63～R71；SEAT-AC65～AC74；
// SEAT-Q07（縮小、放大每次加減 10 個百分點，原型的做法，目前假設）。
// 縮放比例由工具列的「{n}%」讀出。這個檔案自己設定視窗寬度，只在 desktop project 跑。
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { seed, STAFF } from './helpers/seating-data';
import {
  blankPointIn,
  expandAll,
  isInside,
  mapTable,
  openSeating,
  openTableDetail,
  seatMap,
  staffTable,
  styleOfText,
  tableDetail,
  tableHandle,
  toolbarButton,
  zoomValue,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL, page }) => {
  test.skip(isMobileWidth(page), '這個檔案自己設定視窗寬度，只在 desktop project 跑');
  await signIn(context, requireBaseURL(baseURL));
});

const allTables = (page: Page) => [...Array.from({ length: 30 }, (_, i) => mapTable(page, i + 1)), staffTable(page)];

/** 30 桌與工作人員桌都在 area 裡 */
async function expectAllInside(page: Page, area: { x: number; y: number; width: number; height: number }) {
  for (const t of allTables(page)) expect(await isInside(t, area), (await t.getAttribute('aria-label')) ?? undefined).toBe(true);
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
    if (!t1 || !t1After) throw new Error('量不到第 1 桌');
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
    const number = await styleOfText(mapTable(page, 7), '7');
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
    await expect(mapTable(page, 7)).toContainText('第 7 桌');
    await expect(staffTable(page)).toContainText('工作人員桌');

    await toolbarButton(page, '全部收合').click();
    await expect(toolbarButton(page, '全部展開')).toBeVisible();
    await expect(mapTable(page, 3).getByRole('listitem')).toHaveCount(0);
    await expect.poll(() => zoomValue(page)).toBe(fit);
  });

  test('展開的卡片寬 280 px、同一欄的卡片不會互相重疊（2.1.7）', async ({ page }) => {
    await seedBasic();
    await openSeating(page);
    await expandAll(page);
    const a = await mapTable(page, 3).boundingBox();
    const b = await mapTable(page, 4).boundingBox();
    if (!a || !b) throw new Error('量不到卡片');
    expect(Math.round(a.width)).toBe(280);
    expect(a.y + a.height).toBeLessThanOrEqual(b.y);
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
      const boxes = await Promise.all(allTables(page).map((t) => t.boundingBox()));
      const left = Math.min(...boxes.map((b) => b?.x ?? Infinity));
      const right = Math.max(...boxes.map((b) => (b ? b.x + b.width : -Infinity)));
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
    const boxes = await Promise.all(allTables(page).map((t) => t.boundingBox()));
    const left = Math.min(...boxes.map((b) => b?.x ?? Infinity));
    const right = Math.max(...boxes.map((b) => (b ? b.x + b.width : -Infinity)));
    expect(Math.abs(left - map.x - (d.x - right))).toBeLessThanOrEqual(12);
  });
});
