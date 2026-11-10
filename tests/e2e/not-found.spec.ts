// 找不到頁面：docs/spec/README.md 第 9 節「找不到頁面」、第 14 節、COM-AC12。
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { requireBaseURL } from './helpers/page-checks';

/** 「回到座位安排」可以是按鈕或連結（樣式是按鈕） */
const backButton = (page: Page) =>
  page
    .getByRole('link', { name: '回到座位安排', exact: true })
    .or(page.getByRole('button', { name: '回到座位安排', exact: true }));

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
});

for (const path of ['/no-such-page', '/people/no-such-page', '/employees/1/unknown']) {
  test(`開不存在的路徑 ${path}：顯示找不到頁面與「回到座位安排」（COM-AC12）`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: '找不到這個頁面。' })).toBeVisible();
    await expect(page.getByText('連結可能已失效，或內容已被移除。')).toBeVisible();
    await expect(backButton(page)).toBeVisible();
  });
}

test('按「回到座位安排」進入座位安排（/）', async ({ page }) => {
  await page.goto('/no-such-page');
  await backButton(page).click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await expect(page.getByRole('heading', { name: '找不到這個頁面。' })).toHaveCount(0);
});
