import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';
import { databaseConfigFromEnv, databaseUrl } from './src/server/database-config';

// 本機開發讀 .env；正式環境由平台注入環境變數（沒有 .env 檔）
if (existsSync('.env')) process.loadEnvFile('.env');

// 設了 DATABASE_URL 就直接用（例如 CI）；否則由 DATABASE_* 組出來
const url = process.env.DATABASE_URL || (process.env.DATABASE_HOST ? databaseUrl(databaseConfigFromEnv()) : undefined);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: { url },
});
