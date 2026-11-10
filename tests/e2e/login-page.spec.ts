// 登入頁：docs/spec/README.md 第 8.1 節（不套 App Shell、寬 400 px 的卡片、手機左右留 16 px）、
// AUTH-R03、AUTH-R04、AUTH-R05、AUTH-R07、第 14 節的登入文案；AUTH-AC04～AC07、AUTH-AC14。
// Google 登入本身不測：按下登入後攔住往 /api/auth 的請求，只看按鈕的狀態。
import { expect, test, type Page } from '@playwright/test';
import { isMobileWidth } from './helpers/page-checks';

const TITLE = '用公司帳號登入';
const DESCRIPTION = '請使用公司的 Google 帳號（@program.com.tw）登入。';
const BUTTON = '使用公司 Google 帳號登入';

const DENIED = ['這個帳號不能登入。', '只能使用公司的 Google 帳號（@program.com.tw），請換一個帳號再試一次。'] as const;
const FAILED = ['登入沒有完成。', '請檢查網路後再試一次。'] as const;
const EXPIRED = ['登入已過期。', '請重新登入，登入後會載入最新資料。'] as const;
const ALL_ERRORS = [DENIED[0], FAILED[0], EXPIRED[0]];

const loginButton = (page: Page) => page.getByRole('button', { name: BUTTON });

async function expectLoginBasics(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByText(DESCRIPTION)).toBeVisible();
  await expect(loginButton(page)).toBeVisible();
  await expect(loginButton(page)).toBeEnabled();
}

/** 只顯示指定的那一種錯誤提示 */
async function expectOnlyError(page: Page, title: string | null) {
  for (const t of ALL_ERRORS) {
    if (t === title) await expect(page.getByText(t)).toBeVisible();
    else await expect(page.getByText(t)).toHaveCount(0);
  }
}

test.describe('登入頁的內容', () => {
  test('標題、說明與登入按鈕；沒有錯誤提示', async ({ page }) => {
    await page.goto('/login');
    await expectLoginBasics(page);
    await expectOnlyError(page, null);
  });

  test('不套 App Shell：沒有導覽與使用者區塊', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    for (const name of ['座位安排', '參與人員', '員工名單']) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: '開啟選單' })).toHaveCount(0);
  });
});

test.describe('錯誤提示', () => {
  test('帳號被拒：「這個帳號不能登入。」與說明（AUTH-R03、AUTH-AC04、AUTH-AC05）', async ({ page }) => {
    await page.goto('/login?error=AccessDenied');
    await expectLoginBasics(page);
    await expect(page.getByText(DENIED[0])).toBeVisible();
    await expect(page.getByText(DENIED[1])).toBeVisible();
    await expectOnlyError(page, DENIED[0]);
  });

  for (const error of ['OAuthCallback', 'OAuthSignin', 'Callback']) {
    test(`Google 登入沒有完成（${error}）：「登入沒有完成。」與說明（AUTH-R04、AUTH-AC06）`, async ({ page }) => {
      await page.goto(`/login?error=${error}`);
      await expectLoginBasics(page);
      await expect(page.getByText(FAILED[0])).toBeVisible();
      await expect(page.getByText(FAILED[1])).toBeVisible();
      await expectOnlyError(page, FAILED[0]);
    });
  }

  test('登入過期：「登入已過期。」與說明（AUTH-R07）', async ({ page }) => {
    await page.goto('/login?expired=1');
    await expectLoginBasics(page);
    await expect(page.getByText(EXPIRED[0])).toBeVisible();
    await expect(page.getByText(EXPIRED[1])).toBeVisible();
    await expectOnlyError(page, EXPIRED[0]);
  });
});

test.describe('按下登入（AUTH-R05、AUTH-AC07）', () => {
  test('按鈕變成不能再按，再按一次不會重複送出', async ({ page }) => {
    await page.goto('/login');
    await expect(loginButton(page)).toBeEnabled();

    // 攔住往 Auth.js 的請求不回應，讓畫面停在「登入中」
    const authRequests: string[] = [];
    await page.route('**/api/auth/**', (route) => {
      authRequests.push(route.request().url());
    });

    await loginButton(page).click();
    await expect(loginButton(page)).toBeDisabled();
    await page.waitForTimeout(300);
    const afterFirstClick = authRequests.length;

    await loginButton(page)
      .click({ force: true, timeout: 2000 })
      .catch(() => undefined);
    await page.waitForTimeout(300);
    expect(authRequests.length).toBe(afterFirstClick);
  });
});

test.describe('卡片版面（第 8.1 節、AUTH-AC14）', () => {
  for (const path of ['/login', '/login?error=AccessDenied', '/login?error=OAuthCallback']) {
    test(`${path}：卡片完整顯示，桌面寬 400 px 置中，手機左右至少留 16 px`, async ({ page }) => {
      await page.goto(path);
      const heading = page.getByRole('heading', { level: 1, name: TITLE });
      await expect(heading).toBeVisible();
      // 卡片：標題外面最近一層有邊框（--border）的元素
      const box = await heading.evaluate((el) => {
        for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none') {
            const rect = node.getBoundingClientRect();
            return { x: rect.x, width: rect.width };
          }
        }
        return null;
      });
      const viewport = page.viewportSize();
      if (!box || !viewport) throw new Error('量不到卡片（有邊框的外框）或視窗大小');

      const left = box.x;
      const right = viewport.width - (box.x + box.width);
      if (isMobileWidth(page)) {
        expect(left).toBeGreaterThanOrEqual(16 - 0.5);
        expect(right).toBeGreaterThanOrEqual(16 - 0.5);
      } else {
        expect(Math.abs(box.width - 400)).toBeLessThanOrEqual(1);
        expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
      }
      await expect(loginButton(page)).toBeInViewport();
    });
  }
});
