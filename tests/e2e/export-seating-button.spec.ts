// 「匯出座位表」按鈕接上 D 線的下載（階段 3，docs/plan/implementation-plan.md 第 5.2 節「匯出座位表按鈕」）：
// 參與人員頁頁首與座位安排頁頁首都放 src/components/features/export/export-seating-button.tsx 的 ExportSeatingButton。
// 依據：docs/spec/export.md 第 2 節、EXP-R01（直接下載、不開對話框，兩頁行為相同）、EXP-R02（和頁面上的搜尋、篩選無關）、
// EXP-R03（檔名「座位表_{台灣日期}.xlsx」）、EXP-R04、EXP-R06（成功提示）、EXP-R07（失敗提示）；驗收條件 EXP-AC01、AC02、AC04、
// AC09、AC18、AC19；participants.md PPL-R39、PPL-AC09 前半；seating.md 2.1.1。
// 登入已過期（D-016、EXP-AC21）：不下載、不顯示匯出失敗的 Sonner，依 docs/spec/README.md AUTH-R07 回到登入頁並顯示「登入已過期。」，
// 登入後回到原本的頁面。Google 登入本身不測：確認登入頁網址帶著原本的頁面（同 auth-guard.spec.ts），再用測試的 session cookie 回去。
// 工作表每一格的內容在 tests/unit/domain/seating-sheet.test.ts、tests/integration/api/export-seating.test.ts；這裡只確認按鈕下載的是
// 伺服器用資料庫目前的資料產生的檔案。資料用 tests/e2e/helpers/seating-data.ts 寫進測試資料庫（export.md 5.1 的「資料甲」，虛構）。
import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { chooseOption, filterSelect, gotoPeople, personRow, searchBox } from './helpers/participants-page';
import { seed } from './helpers/seating-data';
import { openSeating } from './helpers/seating-page';
import { cellText, cellTexts, loadWorkbook, mergeRanges, taiwanDateStamp } from '../helpers/export-xlsx';

const SUCCESS = '已匯出座位表。';
const FAILURE = '匯出座位表失敗，請確認網路連線後再試一次。';

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
});

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '下載的檔案和視窗寬度無關，內容只在桌面比對');

const exportButton = (page: Page) => page.getByRole('button', { name: '匯出座位表', exact: true });

/** export.md 5.1 的資料甲 */
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

/** 按「匯出座位表」，等下載完成；回傳下載與按下前後的台灣日期 */
async function clickExport(page: Page): Promise<{ download: Download; dates: string[] }> {
  const before = taiwanDateStamp();
  const downloading = page.waitForEvent('download');
  await exportButton(page).click();
  const download = await downloading;
  return { download, dates: [before, taiwanDateStamp()] };
}

/** 讀出下載的座位表：工作表名稱、每一格的文字、合併範圍 */
async function readSheet(download: Download) {
  const wb = await loadWorkbook(await readFile(await download.path()));
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('檔案裡沒有工作表');
  return { names: wb.worksheets.map((w) => w.name), ws, texts: Object.fromEntries(cellTexts(ws)), merges: mergeRanges(ws) };
}

/** 下載前後都沒有開任何對話框（EXP-R01） */
async function expectNoDialog(page: Page) {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
}

test.describe('參與人員頁頁首的「匯出座位表」（PPL-R39、EXP-R01）', () => {
  test('EXP-AC01、PPL-AC09：按下直接下載「座位表_{台灣日期}.xlsx」，不開對話框；只有一個工作表「座位表」，內容是資料庫目前的座位；Sonner「已匯出座位表。」', async ({
    page,
  }) => {
    desktopOnly(page);
    await seedDataA();
    await gotoPeople(page);
    await expect(exportButton(page)).toBeVisible();

    const { download, dates } = await clickExport(page);

    expect(dates.map((d) => `座位表_${d}.xlsx`)).toContain(download.suggestedFilename());
    await expect(page.getByText(SUCCESS, { exact: true })).toBeVisible();
    await expect(page.getByText(FAILURE, { exact: true })).toHaveCount(0);
    await expectNoDialog(page);

    const sheet = await readSheet(download);
    expect(sheet.names).toEqual(['座位表']);
    // EXP-AC04、EXP-AC09：主桌與工作人員區塊
    expect(cellText(sheet.ws.getCell('G1'))).toBe('第 1 桌\n主桌\n總經理室＋貴賓\n(3)');
    expect(cellText(sheet.ws.getCell('H1'))).toBe('王大同');
    expect(cellText(sheet.ws.getCell('H3'))).toBe('周董事(+兒童椅)(素食)');
    expect(cellText(sheet.ws.getCell('K1'))).toBe('工作人員\n(1)');
    expect(cellText(sheet.ws.getCell('L1'))).toBe('張家豪');
    expect(sheet.merges).toContain('G1:G10');
  });

  test('下載失敗（伺服器錯誤）：不下載，Sonner「匯出座位表失敗，請確認網路連線後再試一次。」；之後可以再按一次（EXP-R07、EXP-AC19）', async ({
    page,
  }) => {
    desktopOnly(page);
    await seedDataA();
    await gotoPeople(page);
    let downloads = 0;
    page.on('download', () => {
      downloads += 1;
    });
    await page.route('**/api/export/seating', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: 'x' } }) }),
    );

    await exportButton(page).click();
    await expect(page.getByText(FAILURE, { exact: true })).toBeVisible();
    await expect(page.getByText(SUCCESS, { exact: true })).toHaveCount(0);
    expect(downloads).toBe(0);

    await page.unroute('**/api/export/seating');
    await expect(exportButton(page)).toBeEnabled();
    const { download } = await clickExport(page);
    expect(download.suggestedFilename()).toMatch(/^座位表_\d{8}\.xlsx$/);
  });

  test('網路中斷：不下載，顯示匯出失敗的 Sonner（EXP-AC19）', async ({ page }) => {
    desktopOnly(page);
    await seedDataA();
    await gotoPeople(page);
    await page.route('**/api/export/seating', (route) => route.abort('internetdisconnected'));
    await exportButton(page).click();
    await expect(page.getByText(FAILURE, { exact: true })).toBeVisible();
  });

  test('EXP-AC18：參與人員頁搜尋「陳志明」並篩選「桌次：第 5 桌」後匯出 → 檔案內容和沒有搜尋、篩選時相同（EXP-R02）', async ({ page }) => {
    desktopOnly(page);
    await seedDataA();
    await gotoPeople(page);
    const plain = await readSheet((await clickExport(page)).download);

    await searchBox(page).fill('陳志明');
    await chooseOption(page, filterSelect(page, '桌次'), '第 5 桌', '5');
    await expect(personRow(page, '王大同')).toHaveCount(0);
    const filtered = await readSheet((await clickExport(page)).download);

    expect(filtered.texts).toEqual(plain.texts);
    expect(filtered.merges).toEqual(plain.merges);
  });
});

test.describe('座位安排頁頁首的「匯出座位表」（seating.md 2.1.1、EXP-R01）', () => {
  test('EXP-AC02：在座位安排頁頁首按「匯出座位表」→ 下載的檔案內容和參與人員頁的相同；不開對話框；Sonner「已匯出座位表。」', async ({
    page,
  }) => {
    desktopOnly(page);
    await seedDataA();
    await gotoPeople(page);
    const fromPeople = await readSheet((await clickExport(page)).download);

    await openSeating(page);
    const { download, dates } = await clickExport(page);

    expect(dates.map((d) => `座位表_${d}.xlsx`)).toContain(download.suggestedFilename());
    await expect(page.getByText(SUCCESS, { exact: true })).toBeVisible();
    await expectNoDialog(page);
    const fromSeating = await readSheet(download);
    expect(fromSeating.names).toEqual(['座位表']);
    expect(fromSeating.texts).toEqual(fromPeople.texts);
    expect(fromSeating.merges).toEqual(fromPeople.merges);
  });

  test('座位安排頁下載失敗：顯示匯出失敗的 Sonner，不下載（EXP-R07）', async ({ page }) => {
    desktopOnly(page);
    await seedDataA();
    await openSeating(page);
    let downloads = 0;
    page.on('download', () => {
      downloads += 1;
    });
    await page.route('**/api/export/seating', (route) => route.fulfill({ status: 503, body: '' }));
    await exportButton(page).click();
    await expect(page.getByText(FAILURE, { exact: true })).toBeVisible();
    expect(downloads).toBe(0);
  });
});

test.describe('手機（767 px 以下）', () => {
  test('兩個頁首的「匯出座位表」在手機也直接下載「座位表_{台灣日期}.xlsx」並顯示「已匯出座位表。」', async ({ page }) => {
    test.skip(!isMobileWidth(page), '手機寬度');
    await seedDataA();

    await gotoPeople(page);
    let { download, dates } = await clickExport(page);
    expect(dates.map((d) => `座位表_${d}.xlsx`)).toContain(download.suggestedFilename());
    await expect(page.getByText(SUCCESS, { exact: true })).toBeVisible();

    await openSeating(page);
    ({ download, dates } = await clickExport(page));
    expect(dates.map((d) => `座位表_${d}.xlsx`)).toContain(download.suggestedFilename());
    await expect(page.getByText(SUCCESS, { exact: true })).toBeVisible();
  });
});

/** 登入頁網址裡帶回去的頁面（接受相對或絕對網址；同 auth-guard.spec.ts） */
function callbackTarget(pageUrl: string): URL | undefined {
  const url = new URL(pageUrl);
  return [...url.searchParams.values()]
    .filter((v) => v.startsWith('/') || v.startsWith(url.origin))
    .map((v) => new URL(v, url.origin))
    .find((u) => u.origin === url.origin);
}

test.describe('登入已過期時按「匯出座位表」（D-016、EXP-AC21、AUTH-R07）', () => {
  // 手機開 /?table=5 時桌次詳情是 Dialog，會擋住頁首的按鈕，所以手機用不帶參數的座位安排頁
  const cases = [
    { label: '參與人員頁', desktop: '/people', mobile: '/people', heading: '參與人員' },
    { label: '座位安排頁', desktop: '/?table=5', mobile: '/', heading: '座位安排' },
  ];

  for (const c of cases) {
    test(`${c.label}：不下載檔案、不顯示匯出失敗的 Sonner；畫面回到登入頁並顯示「登入已過期。」；登入後回到原本的頁面（含網址參數）`, async ({
      page,
      context,
      baseURL,
    }) => {
      await seedDataA();
      const opened = new URL(isMobileWidth(page) ? c.mobile : c.desktop, 'http://localhost');
      await page.goto(`${opened.pathname}${opened.search}`);
      await expect(page.getByRole('heading', { level: 1, name: c.heading })).toBeVisible();
      await expect(exportButton(page)).toBeVisible();
      let downloads = 0;
      page.on('download', () => {
        downloads += 1;
      });

      // 登入過期：session cookie 失效，之後的 API 都回 401（AUTH-R08）
      await context.clearCookies();
      await exportButton(page).click();

      await expect(page).toHaveURL(/\/login(\?|$)/);
      await expect(page.getByRole('heading', { level: 1, name: '用公司帳號登入' })).toBeVisible();
      await expect(page.getByText('登入已過期。', { exact: true })).toBeVisible();
      await expect(page.getByText(FAILURE, { exact: true })).toHaveCount(0);
      await expect(page.getByText(SUCCESS, { exact: true })).toHaveCount(0);
      expect(downloads).toBe(0);
      expect(new URL(page.url()).searchParams.get('expired')).toBe('1');

      const target = callbackTarget(page.url());
      expect(target?.pathname, '登入頁網址帶著原本的頁面').toBe(opened.pathname);
      for (const [key, value] of opened.searchParams) expect(target?.searchParams.get(key), `網址參數 ${key}`).toBe(value);

      // 重新登入後開啟帶回去的網址 → 回到原本的頁面
      await signIn(context, requireBaseURL(baseURL));
      await page.goto(`${target?.pathname ?? '/'}${target?.search ?? ''}`);
      await expect(page.getByRole('heading', { level: 1, name: c.heading })).toBeVisible();
    });
  }
});
