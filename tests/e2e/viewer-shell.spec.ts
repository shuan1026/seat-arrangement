// 三種身分的 App Shell：docs/spec/README.md 第 2 節（COM-R19、COM-R20）、第 4 節（編輯者四項導覽，檢視者三項，沒有權限的人看不到導覽）、
// 第 5 節（「權限」用 key-round；Header 右側依序是介面配色鈕與儲存狀態，檢視者是中性徽章「只能檢視」，桌面與 Mobile Header 都有）、
// AUTH-R11、AUTH-R14、AUTH-R16；驗收條件 COM-AC21、COM-AC22、COM-AC24、AUTH-AC15、AUTH-AC19；D-021、D-026。
// 檢視者用 helpers/auth.ts 的 signInAsViewer（以 VIEWER 寫進權限名單），沒有權限用 signInWithoutAccess；
// 甲、乙、丙是 docs/spec/permissions.md 第 5 節的虛構帳號。
import { expect, test, type Page } from '@playwright/test';
import { BING, JIA, signIn, signInAsViewer, signInWithoutAccess, YI } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { makeEditor, setMembers } from './helpers/permissions-db';
import {
  expectNoAccessPage,
  KEY_ROUND_PATH,
  navNames,
  openNav,
  recordWrites,
  saveStatusText,
  VIEW_ONLY,
  viewOnlyBadge,
  visibleHeader,
} from './helpers/permissions-page';
import { badgeLook, openSeating, panelSearch, showPeople, tokenBackground, tokenColor, toolbarButton } from './helpers/seating-page';
import { seed } from './helpers/seating-data';
import { filterSelect, chooseOption, gotoPeople, searchBox } from './helpers/participants-page';

const EDITOR_NAV = ['座位安排', '參與人員', '員工名單', '權限'];
const VIEWER_NAV = ['座位安排', '參與人員', '員工名單'];

test.beforeEach(async () => {
  await seed(async (s) => {
    await s.employee('王小明', { department: '研發一部', extension: '1234', tableId: 3 });
    await s.employee('李美華', { department: '業務部' });
  });
});

/** Header 只有「只能檢視」，沒有儲存狀態（COM-R20） */
async function expectViewOnlyHeader(page: Page) {
  await expect(viewOnlyBadge(page)).toBeVisible();
  await expect(saveStatusText(page)).toHaveCount(0);
  await expect(visibleHeader(page).getByRole('button', { name: '重試' })).toHaveCount(0);
}

test.describe('導覽（COM-AC21）', () => {
  test('編輯者：導覽有四項，第 4 項是「權限」（key-round 圖示）', async ({ page, context, baseURL }) => {
    await signIn(context, requireBaseURL(baseURL));
    await openSeating(page);
    const nav = await openNav(page);
    expect(await navNames(nav)).toEqual(EDITOR_NAV);
    const permissions = nav.getByRole('link', { name: '權限', exact: true });
    await expect(permissions).toHaveAttribute('href', '/permissions');
    await expect(permissions.locator(`svg path[d^="${KEY_ROUND_PATH}"]`)).toHaveCount(1);
  });

  test('檢視者：導覽只有座位安排、參與人員、員工名單三項', async ({ page, context, baseURL }) => {
    await signInAsViewer(context, requireBaseURL(baseURL));
    await openSeating(page);
    expect(await navNames(await openNav(page))).toEqual(VIEWER_NAV);
    await expect(page.getByRole('link', { name: '權限', exact: true })).toHaveCount(0);
  });
});

test.describe('AUTH-AC15：名單有甲（編輯者）、乙（檢視者），沒有丙', () => {
  test('甲登入是編輯者：導覽有「權限」、Header 是儲存狀態；乙登入是檢視者：看得到三頁的資料，導覽沒有「權限」，Header 顯示「只能檢視」；丙看到「沒有權限」頁', async ({
    page,
    context,
    baseURL,
    browser,
  }) => {
    const base = requireBaseURL(baseURL);
    await signIn(context, base, JIA);
    await setMembers([
      { email: JIA.email, role: 'EDITOR' },
      { email: YI.email, role: 'VIEWER' },
    ]);
    await openSeating(page);
    await expect(viewOnlyBadge(page)).toHaveCount(0);
    await expect(saveStatusText(page)).toBeVisible();
    expect(await navNames(await openNav(page))).toEqual(EDITOR_NAV);

    const newContext = () =>
      browser.newContext({ baseURL, viewport: page.viewportSize() ?? undefined, isMobile: isMobileWidth(page), hasTouch: isMobileWidth(page) });

    const yiContext = await newContext();
    try {
      await signInAsViewer(yiContext, base, YI);
      const yiPage = await yiContext.newPage();
      await openSeating(yiPage);
      await expectViewOnlyHeader(yiPage);
      expect(await navNames(await openNav(yiPage))).toEqual(VIEWER_NAV);
      if (isMobileWidth(yiPage)) await yiPage.keyboard.press('Escape');
      for (const [path, heading] of [
        ['/people', '參與人員'],
        ['/employees', '員工名單'],
      ] as const) {
        await yiPage.goto(path);
        await expect(yiPage.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
        await expect(yiPage.getByRole('main').getByText('王小明').first()).toBeVisible();
        await expectViewOnlyHeader(yiPage);
      }
    } finally {
      await yiContext.close();
    }

    const bingContext = await newContext();
    try {
      await signInWithoutAccess(bingContext, base, BING);
      const bingPage = await bingContext.newPage();
      await bingPage.goto('/');
      await expectNoAccessPage(bingPage, BING.email);
    } finally {
      await bingContext.close();
    }
  });
});

test.describe('Header（COM-R20、COM-AC22）', () => {
  test('檢視者：Header 右側依序是「介面配色」與中性徽章「只能檢視」，沒有儲存狀態（桌面與 320 px 的 Mobile Header）', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAsViewer(context, requireBaseURL(baseURL));
    await openSeating(page);

    await expectViewOnlyHeader(page);
    const palette = await visibleHeader(page).getByRole('button', { name: '介面配色', exact: true }).boundingBox();
    const badge = await viewOnlyBadge(page).boundingBox();
    if (!palette || !badge) throw new Error('量不到 Header 右側');
    expect(badge.x, '徽章在介面配色鈕右邊').toBeGreaterThanOrEqual(palette.x + palette.width - 1);

    // 中性徽章：--muted 底、--muted-foreground 字（README 第 11.1 節）
    const look = await badgeLook(visibleHeader(page), VIEW_ONLY);
    expect(look?.background).toBe(await tokenBackground(page, '--muted'));
    expect(look?.color).toBe(await tokenColor(page, '--muted-foreground'));
  });

  test('只能檢視，視窗 320 px：Mobile Header 右側同樣是「介面配色」與「只能檢視」', async ({ page, context, baseURL }) => {
    await signInAsViewer(context, requireBaseURL(baseURL));
    await page.setViewportSize({ width: 320, height: 700 });
    await openSeating(page);
    await expect(page.getByRole('button', { name: '開啟選單' })).toBeVisible();
    await expectViewOnlyHeader(page);
    const palette = await visibleHeader(page).getByRole('button', { name: '介面配色', exact: true }).boundingBox();
    const badge = await viewOnlyBadge(page).boundingBox();
    if (!palette || !badge) throw new Error('量不到 Mobile Header 右側');
    expect(badge.x).toBeGreaterThanOrEqual(palette.x + palette.width - 1);
    expect(badge.x + badge.width).toBeLessThanOrEqual(320);
  });

  test('COM-AC24：只能檢視時搜尋、篩選、縮放、匯出 → Header 始終只有「只能檢視」，不出現「儲存中…」或「已儲存」，也沒有送出任何寫入請求', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAsViewer(context, requireBaseURL(baseURL));
    const writes = recordWrites(page);
    await openSeating(page);

    await showPeople(page);
    await panelSearch(page).fill('王');
    await expectViewOnlyHeader(page);

    if (isMobileWidth(page)) await page.getByRole('tab', { name: '座位圖', exact: true }).click();
    await toolbarButton(page, '放大').click();
    await toolbarButton(page, '縮小').click();
    await expectViewOnlyHeader(page);

    await gotoPeople(page);
    await searchBox(page).fill('王');
    await searchBox(page).fill('');
    await chooseOption(page, filterSelect(page, '類別'), '員工');
    await expectViewOnlyHeader(page);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '匯出座位表', exact: true }).click();
    await download;
    await expectViewOnlyHeader(page);

    expect(writes).toEqual([]);
  });
});

test.describe('AUTH-AC19：檢視者被改為編輯者', () => {
  test('乙開著座位安排、甲把乙設為編輯者 → 乙的畫面不變；乙重新整理 → 出現「新增人員」「自動排座」與「權限」導覽，不必重新登入', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAsViewer(context, requireBaseURL(baseURL), YI);
    await openSeating(page);
    await expect(page.getByRole('button', { name: '新增人員', exact: true })).toHaveCount(0);

    await makeEditor(YI.email); // 甲在權限頁把乙設為編輯者
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: '新增人員', exact: true })).toHaveCount(0);
    await expect(viewOnlyBadge(page)).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expect(page.getByRole('button', { name: '新增人員', exact: true }).first()).toBeVisible();
    if (isMobileWidth(page)) await page.getByRole('tab', { name: '座位圖', exact: true }).click();
    await expect(toolbarButton(page, '自動排座')).toBeVisible();
    await expect(viewOnlyBadge(page)).toHaveCount(0);
    expect(await navNames(await openNav(page))).toEqual(EDITOR_NAV);
  });
});
