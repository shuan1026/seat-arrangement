// 發布頁 /seats：docs/spec/permissions.md 第 2.3 節（版面、搜尋、座位圖、桌次名單、未發布、手機）、PRM-R21～R34、第 4.3 節文案；
// 驗收條件 PRM-AC23～AC35；待確認 PRM-Q01（已報名但未入座的人搜尋自己 → 目前假設「找不到「{關鍵字}」。」）；
// docs/spec/README.md AUTH-R15、AUTH-AC20（發布頁也要登入，登入後回到 /seats）、COM-R18（沿用這個瀏覽器的配色、沒有介面配色鈕）；D-021。
// 桌號（D-019）：測試資料用內部編號（1 = B1、2 = A1、3 = B4、5 = B10、6 = B13、7 = B2、9 = B8、17 = A3），畫面上用桌號。
// 座位圖、桌次、工具列與桌次名單的無障礙結構和座位安排頁相同（helpers/seating-page.ts 開頭）；發布頁的其他假設見 helpers/permissions-page.ts 開頭。
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { CODES_IN_LIST_ORDER } from '../helpers/table-codes';
import { signIn, signInAsViewer, VIEWER_USER } from './helpers/auth';
import { expectNoHorizontalScroll, fetchFromPage, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { STAFF_TABLE, withDb } from './helpers/participants-db';
import { setNoteName, setPublished } from './helpers/permissions-db';
import { gotoSeats, notFoundLine, NOT_PUBLISHED, recordWrites, resultLine, SEATS_TITLE, seatSearch } from './helpers/permissions-page';
import {
  blankPointIn,
  detailRows,
  dragAndDrop,
  hasBorderColor,
  hasDashedBorder,
  isInside,
  mapTable,
  openSeating,
  peoplePanel,
  seatMap,
  staffTable,
  tableButton,
  tableDetail,
  toolbarButton,
  zoomToRegular,
  zoomValue,
} from './helpers/seating-page';
import { anyThemeButton, chooseTheme, expectFirstFrame, expectPageTheme, recordFirstFrame } from './helpers/theme-page';

const B1 = 1;
const A1 = 2;
const B4 = 3;
const B10 = 5;
const B13 = 6;
const B2 = 7;
const A3 = 17;

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面才有滑過的 Tooltip 與拖移');

/**
 * 驗收條件的資料：B4 桌依序是王小明（研發一部，分機 1234、素食、備註「需要靠走道」）、王小明_眷屬（配偶、兒童椅）、林董（外部貴賓，測試科技 董事長）；
 * B2 桌備註名稱「主桌」、張主任（研發一部）；B10 桌 10 位、B13 桌 11 位、B8 桌沒有人；陳大華是工作人員；陳大文已報名但未入座。已發布。
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
    await db.fillTable(B10, 10);
    await db.fillTable(B13, 11);
    await db.registerNew({ name: '陳大華', department: '總務部' }, { tableId: STAFF_TABLE });
    await db.registerNew({ name: '陳大文', department: '研發一部' });
  });
  await setNoteName(B2, '主桌');
  await setPublished(published);
}

/** 只能檢視的同仁（丙）登入 */
async function asViewer(context: BrowserContext, baseURL: string | undefined) {
  await signInAsViewer(context, requireBaseURL(baseURL));
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
  test('編輯者與只能檢視的人開 /seats → 都只有 H1 與「座位表還沒有發布，請稍後再看。」，沒有搜尋框與座位圖；回應不含座位資料', async ({
    page,
    context,
    baseURL,
    browser,
  }) => {
    await seedSeats(false);
    await signIn(context, requireBaseURL(baseURL));

    const viewerContext = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? undefined });
    try {
      await asViewer(viewerContext, baseURL);
      const viewerPage = await viewerContext.newPage();
      for (const [label, p] of [
        ['編輯者', page],
        ['只能檢視', viewerPage],
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
    }
  });
});

test.describe('已發布：版面（PRM-R21、PRM-R23、PRM-R24、PRM-AC24）', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
  });

  test('丙開 /seats → 有 H1、搜尋框與座位圖；沒有 Sidebar、Header、導覽、使用者選單、介面配色鈕與儲存狀態', async ({ page }) => {
    await gotoSeats(page);
    await expect(seatSearch(page)).toBeVisible();
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
    // 工具列只有縮小、比例、放大、適合視窗（第 2.3 節）
    for (const name of ['縮小', '放大', '適合視窗']) await expect(toolbarButton(page, name), name).toBeVisible();
    for (const name of ['全部展開', '自動排座', '新增人員', '匯出座位表', '發布']) await expect(toolbarButton(page, name), name).toHaveCount(0);
  });

  test('30 桌與工作人員桌的位置和座位安排頁相同', async ({ page }) => {
    desktopOnly(page);
    await openSeating(page);
    const seating = await normalizedCenters(page);
    await gotoSeats(page);
    const seats = await normalizedCenters(page);
    for (const [name, p] of seating) {
      const q = seats.get(name);
      expect(q, name).toBeDefined();
      expect(Math.abs((q?.x ?? -1) - p.x), `${name} 的左右位置`).toBeLessThanOrEqual(0.02);
      expect(Math.abs((q?.y ?? -1) - p.y), `${name} 的上下位置`).toBeLessThanOrEqual(0.02);
    }
  });
});

test.describe('已發布：座位圖與桌次名單（PRM-R24～R28）', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
  });

  test('PRM-AC25：B2 顯示「主桌」、滑過有部門；B10「已滿」、B13「超過」、B8 是虛線的空桌；沒有拖移把手；拖桌次或名單不改變任何資料', async ({ page }) => {
    desktopOnly(page);
    const writes = recordWrites(page);
    await gotoSeats(page);
    await zoomToRegular(page);

    await expect(mapTable(page, B2)).toContainText('主桌');
    await tableButton(page, B2).hover();
    await expect(page.getByRole('tooltip').first()).toContainText('主桌・研發一部');
    await expect(mapTable(page, B10)).toContainText('已滿');
    await expect(mapTable(page, B13)).toContainText('超過');
    expect(await hasDashedBorder(mapTable(page, 9))).toBe(true);
    await expect(mapTable(page, 9)).toContainText('空桌');
    await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);

    const before = await withDb(async (db) => ({ b4: await db.seatedNames(B4), b8: await db.seatedNames(9) }));
    await dragAndDrop(page, tableButton(page, B4), mapTable(page, 9));
    await tableButton(page, B4).click();
    const detail = tableDetail(page, B4);
    await expect(detail).toBeVisible();
    await dragAndDrop(page, detailRows(detail).first(), mapTable(page, 9));
    await page.waitForTimeout(500);
    expect(await withDb(async (db) => ({ b4: await db.seatedNames(B4), b8: await db.seatedNames(9) }))).toEqual(before);
    expect(writes).toEqual([]);
  });

  test('PRM-AC26：點 B4 桌 → 標題「B4 桌」、副標「3/10 人」、「部門：研發一部＋貴賓」；名單 1～3 列是三個人、4～10 列「空位」；沒有分機、素食、兒童椅、備註、「貴賓」徽章、單位頭銜與操作按鈕；回應也不含這些', async ({
    page,
  }) => {
    await gotoSeats(page);
    await tableButton(page, B4).click();
    const detail = tableDetail(page, B4);
    await expect(detail).toBeVisible();

    await expect(detail.getByRole('heading', { name: 'B4 桌', exact: true })).toBeVisible();
    await expect(detail).toContainText('3/10 人');
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

  test('點另一桌換成那一桌；按關閉鈕關閉（PRM-R26）', async ({ page }) => {
    await gotoSeats(page);
    await tableButton(page, B4).click();
    await expect(tableDetail(page, B4)).toBeVisible();
    if (isMobileWidth(page)) {
      await tableDetail(page, B4).getByRole('button', { name: '關閉' }).first().click();
      await expect(tableDetail(page, B4)).toHaveCount(0);
      await tableButton(page, B2).click();
    } else {
      await tableButton(page, B2).click();
      await expect(tableDetail(page, B4)).toHaveCount(0);
    }
    const b2 = tableDetail(page, B2);
    await expect(b2).toBeVisible();
    await expect(b2).toContainText('主桌');
    await b2.getByRole('button', { name: '關閉' }).first().click();
    await expect(tableDetail(page, B2)).toHaveCount(0);
  });

  test('用鍵盤聚焦桌次後按 Enter 也開啟那一桌的名單（PRM-R26）', async ({ page }) => {
    desktopOnly(page);
    await gotoSeats(page);
    await tableButton(page, B4).focus();
    await page.keyboard.press('Enter');
    await expect(tableDetail(page, B4)).toBeVisible();
    await expect(detailRows(tableDetail(page, B4)).first()).toContainText('王小明');
  });

  test('工作人員桌的名單標題是「工作人員桌」', async ({ page }) => {
    await gotoSeats(page);
    await staffTable(page).getByRole('button', { name: /^工作人員桌/ }).click();
    const detail = page.getByRole('region', { name: '工作人員桌', exact: true }).or(page.getByRole('dialog', { name: '工作人員桌', exact: true }));
    await expect(detail.getByRole('heading', { name: '工作人員桌', exact: true })).toBeVisible();
    await expect(detail).toContainText('1/10 人');
    await expect(detailRows(detail).first()).toContainText('陳大華');
  });

  test('PRM-AC27：沒有人員面板、未入座名單與統計列；搜尋「陳大文」（已報名但未入座）→「找不到「陳大文」。」（PRM-Q01 目前假設）', async ({ page }) => {
    await gotoSeats(page);
    await expect(peoplePanel(page)).toHaveCount(0);
    await expect(page.getByText(/已入座|未入座/)).toHaveCount(0);
    await seatSearch(page).fill('陳大文');
    await expect(notFoundLine(page, '陳大文')).toBeVisible();
    await expect(page.getByText(/陳大文：/)).toHaveCount(0);
  });
});

test.describe('已發布：找座位（PRM-R30～R33）', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
  });

  test('PRM-AC28：搜尋「王小明」→「王小明：B4 桌」「王小明_眷屬：B4 桌」；B4 以 2 px --accent 標示並看得到；過了 4 秒仍標示；清空 → 結果與標示都消失', async ({
    page,
  }) => {
    await gotoSeats(page);
    await expect(seatSearch(page)).toHaveAttribute('placeholder', '輸入姓名找座位');
    // 先放大，讓 B4 桌可能在座位圖區外，確認搜尋會把第一個結果的桌次捲到看得到的位置
    for (let i = 0; i < 15; i++) await toolbarButton(page, '放大').click();
    await seatSearch(page).fill('王小明');

    await expectLinesInOrder(page, ['王小明：B4 桌', '王小明_眷屬：B4 桌']);
    await expect.poll(() => highlighted(page, B4)).toBe(true);
    await expect.poll(() => isInside(mapTable(page, B4), seatMap(page))).toBe(true);

    await page.waitForTimeout(4500);
    expect(await highlighted(page, B4), '過了 4 秒仍標示').toBe(true);

    await seatSearch(page).fill('');
    await expect(resultLine(page, '王小明：B4 桌')).toHaveCount(0);
    await expect(resultLine(page, '王小明_眷屬：B4 桌')).toHaveCount(0);
    await expect.poll(() => highlighted(page, B4)).toBe(false);
  });

  test('關鍵字去掉前後空白、英文不分大小寫；不比對分機、部門與單位', async ({ page }) => {
    await gotoSeats(page);
    await seatSearch(page).fill('  林董 ');
    await expect(resultLine(page, '林董：B4 桌')).toBeVisible();
    await seatSearch(page).fill('研發一部');
    await expect(notFoundLine(page, '研發一部')).toBeVisible();
    await seatSearch(page).fill('測試科技');
    await expect(notFoundLine(page, '測試科技')).toBeVisible();
  });

  test('PRM-AC29：陳大華是工作人員 → 搜尋「陳大華」→「陳大華：工作人員桌」，工作人員桌被標示', async ({ page }) => {
    await gotoSeats(page);
    await seatSearch(page).fill('陳大華');
    await expect(resultLine(page, '陳大華：工作人員桌')).toBeVisible();
    await expect.poll(() => hasBorderColor(page, staffTable(page), '--accent', '2px')).toBe(true);
  });

  test('PRM-AC31：搜尋「xyz」→「找不到「xyz」。」，沒有桌次被標示；用王小明的分機「1234」搜尋 → 也是找不到', async ({ page }) => {
    await gotoSeats(page);
    await seatSearch(page).fill('xyz');
    await expect(notFoundLine(page, 'xyz')).toBeVisible();
    expect(await hasBorderColor(page, seatMap(page), '--accent', '2px')).toBe(false);

    await seatSearch(page).fill('1234');
    await expect(notFoundLine(page, '1234')).toBeVisible();
    expect(await hasBorderColor(page, seatMap(page), '--accent', '2px')).toBe(false);
  });
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
    await gotoSeats(page);

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
  test('丙開著 /seats，甲停止發布 → 丙的頁面不變；丙重新整理 →「座位表還沒有發布，請稍後再看。」', async ({ page, context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
    await gotoSeats(page);
    await expect(seatMap(page)).toBeVisible();

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

test.describe('縮放（PRM-R25、PRM-AC33）', () => {
  test('開啟時是適合視窗、30 桌全部可見；放大到 120% 後重新整理 → 回到適合視窗；一直按縮小 → 最小停在 25%', async ({ page, context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
    await gotoSeats(page);

    for (const code of CODES_IN_LIST_ORDER) {
      expect(await isInside(seatMap(page).getByRole('group', { name: `${code} 桌`, exact: true }), seatMap(page)), `${code} 桌在座位圖區內`).toBe(true);
    }
    const fit = await zoomValue(page);

    for (let i = 0; i < 40 && (await zoomValue(page)) < 120; i++) await toolbarButton(page, '放大').click();
    expect(await zoomValue(page)).toBeGreaterThanOrEqual(120);
    await page.reload();
    await expect(seatMap(page)).toBeVisible();
    expect(await zoomValue(page), '重新整理後回到適合視窗').toBe(fit);

    for (let i = 0; i < 40; i++) await toolbarButton(page, '縮小').click();
    expect(await zoomValue(page)).toBe(25);
  });

  test('範圍和座位安排頁相同：一直按放大最大停在 200%；按「適合視窗」回到開啟時的比例；沒有「全部展開」（SEAT-R63、SEAT-R64）', async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSeats();
    await asViewer(context, baseURL);
    await gotoSeats(page);
    const fit = await zoomValue(page);
    for (let i = 0; i < 40; i++) await toolbarButton(page, '放大').click();
    expect(await zoomValue(page)).toBe(200);
    await toolbarButton(page, '適合視窗').click();
    expect(await zoomValue(page)).toBe(fit);
    await expect(toolbarButton(page, '全部展開')).toHaveCount(0);
  });

  test('按住 Ctrl 滾動滾輪改變比例；在空白處按住拖曳平移座位圖，整頁不捲動（SEAT-R66、SEAT-R67）', async ({ page, context, baseURL }) => {
    desktopOnly(page);
    await seedSeats();
    await asViewer(context, baseURL);
    await gotoSeats(page);
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
  /** 在目前的寬度開 /seats、搜尋「王」、點 B4 桌，檢查版面 */
  async function checkWidth(page: Page, width: number) {
    await gotoSeats(page);
    await expectNoHorizontalScroll(page);

    // 內容全寬，左右留 24 px（767 px 以下 16 px）
    const side = width <= 767 ? 16 : 24;
    const title = await page.getByRole('heading', { level: 1, name: SEATS_TITLE }).boundingBox();
    const search = await seatSearch(page).boundingBox();
    if (!title || !search) throw new Error('量不到標題或搜尋框');
    expect(Math.abs(title.x - side), `${width} px：左邊留白`).toBeLessThanOrEqual(2);
    if (width <= 767) expect(Math.abs(search.width - (width - 2 * side)), `${width} px：搜尋框滿版`).toBeLessThanOrEqual(4);
    else expect(Math.abs(search.width - 320), `${width} px：搜尋框寬 320 px`).toBeLessThanOrEqual(4);

    await seatSearch(page).fill('王');
    await expect(resultLine(page, '王小明：B4 桌')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await tableButton(page, B4).click();
    if (width <= 767) {
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
      const map = await seatMap(page).boundingBox();
      if (!box || !map) throw new Error('量不到名單或座位圖區');
      expect(Math.abs(box.width - 360), `${width} px：名單寬 360 px`).toBeLessThanOrEqual(2);
      expect(box.x + box.width, '在座位圖區的右側').toBeLessThanOrEqual(map.x + map.width + 1);
      expect(box.x + box.width, '貼著座位圖區的右側').toBeGreaterThan(map.x + map.width - 40);
      await expectNoHorizontalScroll(page);
      await panel.getByRole('button', { name: '關閉' }).first().click();
    }
  }

  test.beforeEach(async ({ context, baseURL }) => {
    await seedSeats();
    await asViewer(context, baseURL);
  });

  test('桌面瀏覽器：320、375、430、768、1024、1280 px 都沒有整頁水平捲動；767 px 以下搜尋框滿版、名單是 Dialog；以上名單從座位圖區右側浮出', async ({
    page,
  }) => {
    test.skip(isMobileWidth(page), '手機專案只驗 320 px（下一個測試）');
    for (const width of [320, 375, 430, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await test.step(`${width} px`, () => checkWidth(page, width));
    }
  });

  test('手機 320 px（觸控）：沒有整頁水平捲動、搜尋框滿版、名單是 Dialog', async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機寬度');
    await checkWidth(page, page.viewportSize()?.width ?? 320);
  });
});
