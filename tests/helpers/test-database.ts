// 測試資料庫：每次測試開始前重建，再套用全部 migration。
// 名稱由 TEST_DATABASE_NAME 指定；平行的功能線各用自己的一個（docs/plan/implementation-plan.md 第 5.3 節）。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'mariadb';
import { databaseConfigFromEnv } from '../../src/server/database-config';

export function loadTestEnv(): string {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const name = process.env.TEST_DATABASE_NAME || 'seat_test';
  if (!/^seat_test[a-z0-9_]*$/.test(name)) throw new Error(`測試資料庫名稱必須以 seat_test 開頭：${name}`);
  return name;
}

export async function recreateTestDatabase(name: string): Promise<void> {
  const cfg = databaseConfigFromEnv(process.env, name);
  const conn = await createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
    allowPublicKeyRetrieval: !cfg.ssl,
  });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await conn.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_NAME: name, DATABASE_URL: '' },
  });
}
