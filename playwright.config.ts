import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

if (existsSync('.env')) process.loadEnvFile('.env');

// 每條平行線用自己的埠號與測試資料庫（docs/plan/implementation-plan.md 第 5.3 節）
const port = Number(process.env.E2E_PORT || 3100);
const testDb = process.env.TEST_DATABASE_NAME || 'seat_test';
const baseURL = `http://localhost:${port}`;
const channel = process.env.PLAYWRIGHT_CHANNEL || 'chrome';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // 分組同時跑時（scripts/e2e.mjs）每組用自己的輸出與報告資料夾
  outputDir: process.env.E2E_OUTPUT_DIR || 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: process.env.E2E_REPORT_DIR || 'playwright-report' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // 前端改動要在 320 px 與桌面寬度驗證（AGENTS.md）
  // 用本機已安裝的 Google Chrome，不必另外下載 Playwright 的瀏覽器；
  // 要用 Playwright 自帶的瀏覽器時設 PLAYWRIGHT_CHANNEL=chromium（需先 npx playwright install chromium）
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1280, height: 800 } } },
    {
      name: 'mobile-320',
      use: {
        ...devices['Desktop Chrome'],
        channel,
        viewport: { width: 320, height: 700 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  // 用正式建置跑 E2E：開發模式邊跑邊編譯頁面，編譯完會觸發整頁重新載入，測試會不穩定；
  // 正式建置也比較接近 aiborn 上實際跑的版本。設 E2E_DEV=1 可改用 next dev（除錯用）。
  // npm run test:e2e（scripts/e2e.mjs）先建置一次再分組，各組設 E2E_SKIP_BUILD=1 只啟動伺服器。
  webServer: {
    command:
      process.env.E2E_DEV === '1'
        ? `npx next dev --port ${port}`
        : process.env.E2E_SKIP_BUILD === '1'
          ? `npx next start --port ${port}`
          : `npx next build && npx next start --port ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATABASE_NAME: testDb,
      NEXTAUTH_URL: baseURL,
      NEXTAUTH_SECRET: process.env.E2E_NEXTAUTH_SECRET || 'e2e-only-secret-not-for-production',
      ALLOWED_EMAIL_DOMAIN: 'program.com.tw',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || 'e2e-client-id',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || 'e2e-client-secret',
      APP_ENV: 'test',
      // 伺服器比 globalSetup（重建測試資料庫）更早啟動，啟動時不能讀寫資料庫：不寫入初始編輯者（D-021）。
      // 明確設成空字串，就算本機 .env 填了 INITIAL_EDITOR_EMAILS 也不會套用（Next.js 不覆寫已存在的環境變數）。
      INITIAL_EDITOR_EMAILS: '',
    },
  },
});
