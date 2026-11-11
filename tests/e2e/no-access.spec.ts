// 沒有權限的公司帳號與「沒有權限」頁（D-026）：docs/spec/README.md 第 2 節（三種身分；每個人登入後的首頁都是座位安排，沒有權限的人在那裡
// 看到「沒有權限」頁）、第 4 節（沒有權限的人看不到導覽，在原本的網址顯示「沒有權限」頁）、第 8.1 節（和登入頁相同：不套 App Shell，
// 底色、光暈與卡片相同，沒有介面配色鈕，配色沿用這個瀏覽器的選擇；卡片由上到下 Logo、標題、說明、目前登入的帳號（太長時換行，不截斷）、
// 「查看座位表」「登出」滿版上下排列；手機同登入頁）、AUTH-R14、AUTH-R16、AUTH-R17、第 14 節文案；
// 驗收條件 AUTH-AC21～AC27；docs/architecture.md 第 8.2 節（403 NO_ACCESS 的前端處理）、第 9.3 節、第 10.3 節第 8 點。
// 「別人在權限頁改了名單」用 helpers/permissions-db.ts 直接改資料庫模擬。甲、乙、丙、丁是 docs/spec/permissions.md 第 5 節的虛構帳號。
// 每支測試開頭自己設定名單與資料（手機組依序跑在同一個資料庫上）。無障礙結構的假設見 helpers/permissions-page.ts 開頭。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { BING, JIA, signIn, signInAsViewer, signInWithoutAccess, YI, type TestUser } from './helpers/auth';
import { expectNoHorizontalScroll, fetchFromPage, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { withDb } from './helpers/participants-db';
import { chooseOption, gotoPeople, listedNames, openNewPersonDialog, searchBox, selectField } from './helpers/participants-page';
import { makeViewer, removeMember, setMembers, setPublished } from './helpers/permissions-db';
import {
  currentAccount,
  expectNoAccessPage,
  NO_ACCESS_DESCRIPTION,
  noAccessHeading,
  NOT_PUBLISHED,
  recordWrites,
  SEATS_TITLE,
  seatsLink,
  signOutButton,
  viewOnlyBadge,
} from './helpers/permissions-page';
import { seatOf, seed } from './helpers/seating-data';
import { dragAndDrop, expectNoToast, mapTable, openSeating, personRow, seatMap, tableButton } from './helpers/seating-page';
import { anyThemeButton, chooseTheme, expectFirstFrame, expectPageTheme, LOGO_ALT, recordFirstFrame } from './helpers/theme-page';

const B4 = 3;
/**
 * 排座資料裡的字（員工姓名、部門、備註名稱），「沒有權限」時畫面與伺服器的回應都不能有。
 * 不放分機這類數字：HTML 裡的靜態檔雜湊可能剛好含有同樣的數字。
 */
const SECRETS = ['王小明', '李美華', '研發一部', '主桌'];

/** 王小明（研發一部，分機 1234）坐 B4 桌，B4 桌備註名稱「主桌」；李美華未入座 */
async function seedSample() {
  return seed(async (s) => {
    const wang = await s.employee('王小明', { department: '研發一部', extension: '1234', tableId: B4 });
    const lee = await s.employee('李美華', { department: '業務部' });
    await s.noteName(B4, '主桌');
    return { wang, lee };
  });
}

/** 伺服器回給這個網址的 HTML（含 React Server Components 的資料），帶著這個頁面的 cookie */
const serverHtml = async (page: Page, path: string) => (await page.request.get(path)).text();

/** 「沒有權限」頁的卡片：標題外面最近一層有邊框（--border）的元素（同 login-page.spec.ts 的量法） */
async function cardBox(page: Page) {
  const box = await noAccessHeading(page).evaluate((el) => {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none') {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }
    }
    return null;
  });
  if (!box) throw new Error('量不到卡片（有邊框的外框）');
  return box;
}

async function boxOf(loc: Locator, label: string) {
  const b = await loc.boundingBox();
  if (!b) throw new Error(`量不到${label}`);
  return b;
}

test.describe('AUTH-AC21：丙不在權限名單上，登入後進入座位安排', () => {
  test('網址是 /，顯示「沒有權限」頁：沒有 Sidebar、Header 與導覽；卡片由上到下是 Logo、標題、說明、「目前登入：bing@program.com.tw」、「查看座位表」「登出」；畫面與伺服器的回應都沒有排座資料', async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSample();
    await signInWithoutAccess(context, requireBaseURL(baseURL), BING);
    const writes = recordWrites(page);

    await page.goto('/');
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expectNoAccessPage(page, BING.email);
    await expect(page.getByRole('heading', { level: 1, name: '座位安排', exact: true })).toHaveCount(0);
    await expect(seatMap(page)).toHaveCount(0);

    // 由上到下的順序
    const logo = page.getByRole('img', { name: LOGO_ALT }).filter({ visible: true });
    await expect(logo).toHaveCount(1);
    const order: [string, Locator][] = [
      ['Logo', logo],
      ['標題', noAccessHeading(page)],
      ['說明', page.getByText(NO_ACCESS_DESCRIPTION, { exact: true })],
      ['目前登入', page.getByText(currentAccount(BING.email), { exact: true })],
      ['查看座位表', seatsLink(page)],
      ['登出', signOutButton(page)],
    ];
    let lastBottom = -Infinity;
    for (const [label, loc] of order) {
      const b = await boxOf(loc, label);
      expect(b.y, `${label}在上一個的下方`).toBeGreaterThanOrEqual(lastBottom - 1);
      lastBottom = b.y + b.height;
    }

    // 畫面與伺服器的回應都沒有任何排座資料（AUTH-R16：不載入任何排座資料）
    const body = await page.locator('body').innerText();
    const html = await serverHtml(page, '/');
    for (const secret of SECRETS) {
      expect(body, `畫面不含 ${secret}`).not.toContain(secret);
      expect(html, `伺服器回傳的 HTML 不含 ${secret}`).not.toContain(secret);
    }
    const state = await fetchFromPage(page, '/api/state');
    expect(state.status).toBe(403);
    expect(state.body).toEqual({ error: expect.objectContaining({ code: 'NO_ACCESS' }) });
    expect(writes).toEqual([]);
  });
});

test.describe('AUTH-AC22：丙直接開三頁與權限頁、呼叫 API', () => {
  test('/people?q=王、/employees、/permissions → 網址都不變（含網址參數），每一頁都是「沒有權限」頁，伺服器回傳的 HTML 不含排座資料', async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSample();
    await signInWithoutAccess(context, requireBaseURL(baseURL), BING);
    await setMembers([{ email: JIA.email, role: 'EDITOR' }]);

    for (const path of [`/people?q=${encodeURIComponent('王')}`, '/employees', '/permissions']) {
      await page.goto(path);
      const expected = new URL(path, 'http://x');
      await expect(page, path).toHaveURL((url) => url.pathname === expected.pathname && url.search === expected.search);
      await expectNoAccessPage(page, BING.email);
      for (const heading of ['參與人員', '員工名單', '權限']) {
        await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toHaveCount(0);
      }
      const html = await serverHtml(page, path);
      for (const secret of [...SECRETS, JIA.email]) expect(html, `${path}：不含 ${secret}`).not.toContain(secret);
    }
  });

  test('讀取全部資料的 API 與匯出座位表 → 403 NO_ACCESS，回應只有錯誤；已發布時發布頁的 API → 200 有座位', async ({ page, context, baseURL }) => {
    await seedSample();
    await setPublished(true);
    try {
      await signInWithoutAccess(context, requireBaseURL(baseURL), BING);
      await page.goto('/');
      await expectNoAccessPage(page, BING.email);

      for (const path of ['/api/state', '/api/export/seating']) {
        const res = await fetchFromPage(page, path);
        expect(res.status, path).toBe(403);
        expect(res.body, path).toEqual({ error: expect.objectContaining({ code: 'NO_ACCESS' }) });
        for (const secret of [...SECRETS, '1234']) expect(JSON.stringify(res.body), `${path}：不含 ${secret}`).not.toContain(secret);
      }
      const seats = await fetchFromPage(page, '/api/seats');
      expect(seats.status).toBe(200);
      expect((seats.body as { published: boolean }).published).toBe(true);
      expect(JSON.stringify(seats.body)).toContain('王小明');
    } finally {
      await setPublished(false);
    }
  });
});

test.describe('AUTH-AC23：「查看座位表」與「登出」', () => {
  test('按「查看座位表」→ 開啟 /seats；回到「沒有權限」頁按「登出」→ 不需確認，回到登入頁並顯示「已登出。」', async ({ page, context, baseURL }) => {
    await seedSample();
    await setPublished(false);
    await signInWithoutAccess(context, requireBaseURL(baseURL), BING);

    await page.goto('/');
    await expectNoAccessPage(page, BING.email);
    await seatsLink(page).click();
    await expect(page).toHaveURL((url) => url.pathname === '/seats');
    await expect(page.getByRole('heading', { level: 1, name: SEATS_TITLE })).toBeVisible();
    await expect(page.getByText(NOT_PUBLISHED, { exact: true })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expectNoAccessPage(page, BING.email);
    await signOutButton(page).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByRole('heading', { level: 1, name: '用公司帳號登入' })).toBeVisible();
    await expect(page.getByText('已登出。')).toBeVisible();
    expect((await fetchFromPage(page, '/api/seats')).status).toBe(401);
  });
});

test.describe('AUTH-AC24：開著「沒有權限」頁時被加為檢視者', () => {
  test('丙的畫面不變；丙重新整理 → 同一個網址顯示座位安排的內容，Header 顯示「只能檢視」，不必重新登入', async ({ page, context, baseURL }) => {
    await seedSample();
    await signInWithoutAccess(context, requireBaseURL(baseURL), BING);
    await page.goto('/');
    await expectNoAccessPage(page, BING.email);

    await makeViewer(BING.email); // 甲在權限頁把丙加為檢視者
    await page.waitForTimeout(500);
    await expectNoAccessPage(page, BING.email); // 畫面不會自動改變（COM-R06）

    await page.reload();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expect(tableButton(page, 1)).toBeVisible();
    await expect(viewOnlyBadge(page)).toBeVisible();
    await expect(noAccessHeading(page)).toHaveCount(0);
  });

  test('開著 /employees 的「沒有權限」頁時被加為檢視者 → 重新整理同一頁就看到員工名單', async ({ page, context, baseURL }) => {
    await seedSample();
    await signInWithoutAccess(context, requireBaseURL(baseURL), BING);
    await page.goto('/employees');
    await expectNoAccessPage(page, BING.email);

    await makeViewer(BING.email);
    await page.reload();
    await expect(page).toHaveURL((url) => url.pathname === '/employees');
    await expect(page.getByRole('heading', { level: 1, name: '員工名單' })).toBeVisible();
    await expect(page.getByRole('main').getByText('王小明').first()).toBeVisible();
    await expect(viewOnlyBadge(page)).toBeVisible();
  });
});

test.describe('AUTH-AC25：檢視者開著參與人員時被移除', () => {
  test('乙的畫面不變，照常搜尋 → 乙按「匯出座位表」→ 不下載檔案，畫面換成「沒有權限」頁', async ({ page, context, baseURL }) => {
    await seedSample();
    await signInAsViewer(context, requireBaseURL(baseURL), YI);
    await gotoPeople(page);
    await expect(viewOnlyBadge(page)).toBeVisible();

    await removeMember(YI.email); // 甲在權限頁移除了乙
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { level: 1, name: '參與人員' })).toBeVisible(); // 畫面不會自動改變（COM-R06）

    // 搜尋在瀏覽器裡計算，照常可以用
    await searchBox(page).fill('1234');
    await expect.poll(() => listedNames(page)).toEqual(['王小明']);
    await searchBox(page).fill('');

    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    await page.getByRole('main').getByRole('button', { name: '匯出座位表', exact: true }).click();

    await expectNoAccessPage(page, YI.email);
    await expect(page).toHaveURL((url) => url.pathname === '/people');
    await page.waitForTimeout(500);
    expect(downloads, '沒有下載檔案').toEqual([]);
    await expect(page.getByText('匯出座位表失敗，請確認網路連線後再試一次。')).toHaveCount(0);
  });

  test('同樣的前提，乙改成重新整理 → 也是「沒有權限」頁', async ({ page, context, baseURL }) => {
    await seedSample();
    await signInAsViewer(context, requireBaseURL(baseURL), YI);
    await gotoPeople(page);

    await removeMember(YI.email);
    await page.reload();

    await expect(page).toHaveURL((url) => url.pathname === '/people');
    await expectNoAccessPage(page, YI.email);
    const body = await page.locator('body').innerText();
    for (const secret of SECRETS) expect(body).not.toContain(secret);
  });
});

test.describe('AUTH-AC26：編輯者開著座位安排時被移除（AUTH-R17）', () => {
  test('甲把王小明拖到 B4 桌，接著馬上再拖一位 → 兩次都不儲存（王小明仍未入座），畫面換成「沒有權限」頁，沒有 Sonner', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(isMobileWidth(page), '桌面才有拖移');
    const { wang, lee } = await seed(async (s) => {
      await s.employee('王大同', { department: '研發一部', tableId: B4 });
      return { wang: await s.employee('王小明', { department: '研發一部' }), lee: await s.employee('李美華', { department: '業務部' }) };
    });
    await signIn(context, requireBaseURL(baseURL), JIA);
    await setMembers([
      { email: JIA.email, role: 'EDITOR' },
      { email: YI.email, role: 'EDITOR' },
    ]);
    await openSeating(page);
    await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' }).first()).toBeVisible();

    await removeMember(JIA.email); // 乙在權限頁移除了甲

    // 第一次拖移的請求先攔住，確定第二次拖移時畫面還是座位安排（後續操作排在佇列裡）
    const held: { continue: () => Promise<void> }[] = [];
    const sent: string[] = [];
    await page.route('**/api/seating/operations', async (route) => {
      sent.push(route.request().method());
      if (held.length === 0) held.push(route);
      else await route.continue();
    });
    await dragAndDrop(page, personRow(page, '王小明'), mapTable(page, B4));
    await expect.poll(() => held.length).toBe(1);
    await dragAndDrop(page, personRow(page, '李美華'), mapTable(page, B4));
    await page.waitForTimeout(300);
    expect(sent, '第二次操作排在佇列裡，還沒送出').toHaveLength(1);
    await held[0]?.continue();

    await expectNoAccessPage(page, JIA.email);
    await page.waitForTimeout(500);
    expect(sent, '第一次被拒之後，第二次操作一併取消，不送出').toHaveLength(1);
    await expectNoToast(page);
    expect(await seatOf(wang)).toEqual({ tableId: null, seatOrder: null });
    expect(await seatOf(lee)).toEqual({ tableId: null, seatOrder: null });
    await page.unroute('**/api/seating/operations');
  });

  test('甲開著新增人員對話框並選好陳大文時被移除 → 按「新增人員」→ 不新增，對話框關閉，畫面換成「沒有權限」頁，沒有 Sonner', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(isMobileWidth(page), '桌面的對話框');
    await withDb(async (db) => {
      await db.reset();
      await db.employee({ name: '陳大文', department: '研發一部' });
    });
    await signIn(context, requireBaseURL(baseURL), JIA);
    await setMembers([
      { email: JIA.email, role: 'EDITOR' },
      { email: YI.email, role: 'EDITOR' },
    ]);
    await gotoPeople(page);
    const dialog = await openNewPersonDialog(page);
    await chooseOption(page, selectField(dialog, '員工'), /^陳大文（研發一部）/, '陳大文');

    await removeMember(JIA.email); // 乙在權限頁移除了甲

    await dialog.getByRole('button', { name: '新增人員', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectNoAccessPage(page, JIA.email);
    await page.waitForTimeout(500);
    await expectNoToast(page);
    expect(await withDb((db) => db.find('陳大文'))).toBeUndefined();
  });
});

test.describe('AUTH-AC27：版面（第 8.1 節）', () => {
  const LONG: TestUser = {
    name: '長帳號同仁',
    email: 'a-very-long-account-name-for-wrapping-0123456789abcdefghijklmnopqrstuvwxyz@program.com.tw',
    sub: 'e2e-long-no-access',
  };

  test('帳號是很長的 email → 卡片完整顯示、左右至少留 16 px（桌面寬 400 px 置中）；email 換行完整顯示；「查看座位表」「登出」滿版上下排列；沒有水平捲動', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInWithoutAccess(context, requireBaseURL(baseURL), LONG);
    await page.goto('/');
    await expectNoAccessPage(page, LONG.email);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('量不到視窗大小');

    const card = await cardBox(page);
    const left = card.x;
    const right = viewport.width - (card.x + card.width);
    expect(left, '左邊至少留 16 px').toBeGreaterThanOrEqual(16 - 0.5);
    expect(right, '右邊至少留 16 px').toBeGreaterThanOrEqual(16 - 0.5);
    if (!isMobileWidth(page)) {
      expect(Math.abs(card.width - 400), '桌面卡片寬 400 px').toBeLessThanOrEqual(1);
      expect(Math.abs(left - right), '桌面卡片置中').toBeLessThanOrEqual(1);
    }

    // email 換行完整顯示：不截斷、在卡片裡、換成兩行以上
    const account = page.getByText(currentAccount(LONG.email), { exact: true });
    const fits = await account.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        notTruncated: el.scrollWidth <= el.clientWidth + 1 && s.textOverflow !== 'ellipsis',
        left: r.left,
        right: r.right,
        height: r.height,
        lineHeight: parseFloat(s.lineHeight) || 20,
      };
    });
    expect(fits.notTruncated, 'email 沒有被截斷').toBe(true);
    expect(fits.left).toBeGreaterThanOrEqual(card.x - 1);
    expect(fits.right, 'email 沒有超出卡片').toBeLessThanOrEqual(card.x + card.width + 1);
    expect(fits.height, '長 email 換成兩行以上').toBeGreaterThan(fits.lineHeight * 1.5);

    // 兩個按鈕滿版、上下排列，都在畫面內
    const seats = await boxOf(seatsLink(page), '「查看座位表」');
    const signOut = await boxOf(signOutButton(page), '「登出」');
    expect(signOut.y, '「登出」在「查看座位表」下方').toBeGreaterThanOrEqual(seats.y + seats.height - 1);
    expect(Math.abs(seats.width - signOut.width), '兩個按鈕同寬').toBeLessThanOrEqual(1);
    expect(Math.abs(seats.x - signOut.x), '左緣對齊').toBeLessThanOrEqual(1);
    expect(seats.width, '按鈕滿版（卡片內寬的大部分）').toBeGreaterThan(card.width * 0.7);
    await expect(seatsLink(page)).toBeInViewport();
    await expect(signOutButton(page)).toBeInViewport();
    await expectNoHorizontalScroll(page);
  });

  test('卡片的樣式和登入頁相同（底色、邊框、圓角、陰影），整頁底色相同', async ({ page, context, baseURL, browser }) => {
    /** 標題外面最近一層有邊框的元素（卡片）的樣式，與 <body> 的底色 */
    const cardStyle = (p: Page, title: string) =>
      p.getByRole('heading', { level: 1, name: title }).evaluate((el) => {
        for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
          const s = getComputedStyle(node);
          if (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none') {
            return {
              background: s.backgroundColor,
              borderColor: s.borderTopColor,
              borderWidth: s.borderTopWidth,
              radius: s.borderTopLeftRadius,
              shadow: s.boxShadow,
              width: node.getBoundingClientRect().width,
              page: getComputedStyle(document.body).backgroundColor,
            };
          }
        }
        return null;
      });

    const loginContext = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? undefined });
    try {
      const login = await loginContext.newPage();
      await login.goto('/login');
      const loginCard = await cardStyle(login, '用公司帳號登入');
      expect(loginCard, '量得到登入頁的卡片').not.toBeNull();

      await signInWithoutAccess(context, requireBaseURL(baseURL), BING);
      await page.goto('/');
      await expectNoAccessPage(page, BING.email);
      expect(await cardStyle(page, '你沒有檢視權限')).toEqual(loginCard);
    } finally {
      await loginContext.close();
    }
  });

  test('這個瀏覽器選了深色 → 「沒有權限」頁是深色，第一次繪製就是深色；頁面上沒有介面配色鈕', async ({ page, context, baseURL }) => {
    await seedSample();
    // 乙還是檢視者時在座位安排選了深色，之後被移除（配色記在這個瀏覽器，COM-R18）
    await signInAsViewer(context, requireBaseURL(baseURL), YI);
    await recordFirstFrame(context);
    await openSeating(page);
    await chooseTheme(page, 'dark');
    await expectPageTheme(page, 'dark');

    await removeMember(YI.email);
    await page.reload();
    await expectFirstFrame(page, 'dark');
    await expectNoAccessPage(page, YI.email);
    await expectPageTheme(page, 'dark');
    await expect(anyThemeButton(page)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
});

test.describe('README 第 2、4 節：沒有權限的人只能看發布頁', () => {
  test('已發布 → 丁開 /seats 看得到座位圖；開座位安排是「沒有權限」頁', async ({ page, context, baseURL }) => {
    await seedSample();
    await setPublished(true);
    await signInWithoutAccess(context, requireBaseURL(baseURL));
    try {
      await page.goto('/seats');
      await expect(page.getByRole('heading', { level: 1, name: SEATS_TITLE })).toBeVisible();
      await expect(seatMap(page)).toBeVisible();

      await page.goto('/');
      await expect(noAccessHeading(page)).toBeVisible();
      await expect(seatMap(page)).toHaveCount(0);
    } finally {
      await setPublished(false);
    }
  });

  test('用原本的 session 開啟（不必重新登入）：被移除的編輯者下一次開啟頁面就是「沒有權限」頁', async ({ page, context, baseURL }) => {
    await seedSample();
    await signIn(context, requireBaseURL(baseURL), JIA);
    await setMembers([
      { email: JIA.email, role: 'EDITOR' },
      { email: YI.email, role: 'EDITOR' },
    ]);
    await openSeating(page);
    await removeMember(JIA.email);
    // 重新開啟頁面時依當下的名單判斷（AUTH-R11）
    await page.goto('/employees');
    await expect(page).toHaveURL((url) => url.pathname === '/employees');
    await expectNoAccessPage(page, JIA.email);
  });
});
