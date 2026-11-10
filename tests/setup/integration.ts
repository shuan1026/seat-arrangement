// 每個整合測試檔載入前：改連測試資料庫、關掉 Log 輸出。src/server/db.ts 在第一次 import 時讀環境變數。
import { vi } from 'vitest';
import { loadTestEnv } from '../helpers/test-database';

process.env.DATABASE_NAME = loadTestEnv();
process.env.LOG_SILENT = '1';
process.env.ALLOWED_EMAIL_DOMAIN = 'program.com.tw';

// server-only 只能在 Next.js 伺服器端使用；測試環境直接放行
vi.mock('server-only', () => ({}));
