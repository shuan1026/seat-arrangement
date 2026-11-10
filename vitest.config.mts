import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// 副檔名用 .mts：package.json 沒有 "type": "module"，.ts 會被當成 CommonJS 載入，
// Vite 的 configLoader: 'native'（之後的預設）不支援；.mts 明確是 ES module。
//
// 兩個測試專案：
// - unit：不連資料庫（domain、contracts、client 狀態、元件），可以平行
// - integration：連 MySQL 測試資料庫（服務層與 API），依序執行，每個檔案前清空資料
export default defineConfig({
  plugins: [react()],
  // tsconfig.json 的 paths（@/*）由 Vite 內建解析
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['tests/setup/unit.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/setup/integration-global.ts'],
          setupFiles: ['tests/setup/integration.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
