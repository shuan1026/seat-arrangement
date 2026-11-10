// @vitest-environment node
// 資料庫連線設定：docs/architecture.md 第 2 節（平台提供 DATABASE_* 五個變數、必須開 SSL 不驗憑證、連線池預設 3）、
// 第 14.1 節（migration 連線字串：密碼 URL 編碼、sslaccept=accept_invalid_certs）、第 14.2 節（環境變數）。
import { describe, expect, it } from 'vitest';
import { databaseConfigFromEnv, databaseUrl, type DatabaseConfig } from '@/server/database-config';

const env = (vars: Record<string, string | undefined>) => vars as NodeJS.ProcessEnv;

const BASE = {
  DATABASE_HOST: 'db.example.internal',
  DATABASE_PORT: '3317',
  DATABASE_NAME: 'seat_app',
  DATABASE_USER: 'seat_user',
  DATABASE_PASSWORD: 'not-a-real-password',
};

describe('databaseConfigFromEnv', () => {
  it('讀取平台提供的五個變數', () => {
    expect(databaseConfigFromEnv(env(BASE))).toMatchObject({
      host: 'db.example.internal',
      port: 3317,
      database: 'seat_app',
      user: 'seat_user',
      password: 'not-a-real-password',
    });
  });

  it('預設值：埠號 3306、開 SSL、連線池 3', () => {
    const cfg = databaseConfigFromEnv(env({ ...BASE, DATABASE_PORT: undefined }));
    expect(cfg.port).toBe(3306);
    expect(cfg.ssl).toBe(true);
    expect(cfg.connectionLimit).toBe(3);
  });

  it.each(['DATABASE_HOST', 'DATABASE_USER', 'DATABASE_NAME'])('缺少 %s 時報錯並指出缺哪一個', (key) => {
    expect(() => databaseConfigFromEnv(env({ ...BASE, [key]: undefined }))).toThrow(key);
    expect(() => databaseConfigFromEnv(env({ ...BASE, [key]: '' }))).toThrow(key);
  });

  it('指定測試資料庫時改連那一個，不需要 DATABASE_NAME', () => {
    expect(databaseConfigFromEnv(env(BASE), 'seat_test_x').database).toBe('seat_test_x');
    expect(databaseConfigFromEnv(env({ ...BASE, DATABASE_NAME: undefined }), 'seat_test_x').database).toBe(
      'seat_test_x',
    );
  });

  it.each(['abc', '0', '-1', '3.5'])('埠號不是正整數（%s）時報錯', (port) => {
    expect(() => databaseConfigFromEnv(env({ ...BASE, DATABASE_PORT: port }))).toThrow();
  });

  it('可以設定連線池上限', () => {
    expect(databaseConfigFromEnv(env({ ...BASE, DATABASE_CONNECTION_LIMIT: '5' })).connectionLimit).toBe(5);
  });

  it.each(['abc', '0', '-2'])('連線池上限不是正整數（%s）時報錯', (limit) => {
    expect(() => databaseConfigFromEnv(env({ ...BASE, DATABASE_CONNECTION_LIMIT: limit }))).toThrow();
  });

  it.each(['false', 'FALSE', '0', 'no', 'off'])('DATABASE_SSL=%s 時關閉 SSL', (value) => {
    expect(databaseConfigFromEnv(env({ ...BASE, DATABASE_SSL: value })).ssl).toBe(false);
  });

  it.each(['true', '1', 'yes', ''])('DATABASE_SSL=%s 時開啟 SSL', (value) => {
    expect(databaseConfigFromEnv(env({ ...BASE, DATABASE_SSL: value })).ssl).toBe(true);
  });
});

describe('databaseUrl', () => {
  const cfg = (data: Partial<DatabaseConfig> = {}): DatabaseConfig => ({
    host: 'db.example.internal',
    port: 3306,
    user: 'seat_user',
    password: 'plain',
    database: 'seat_app',
    ssl: true,
    connectionLimit: 3,
    ...data,
  });

  it('組出 MySQL 連線字串', () => {
    const url = new URL(databaseUrl(cfg()));
    expect(url.protocol).toBe('mysql:');
    expect(url.hostname).toBe('db.example.internal');
    expect(url.port).toBe('3306');
    expect(url.username).toBe('seat_user');
    expect(url.pathname).toBe('/seat_app');
  });

  it('密碼含特殊字元時做 URL 編碼，解碼後與原密碼相同', () => {
    const password = 'p@ss:w/rd#?%& 測';
    const raw = databaseUrl(cfg({ password }));
    expect(raw.split('@')).toHaveLength(2);
    expect(raw).toContain(encodeURIComponent(password));
    const url = new URL(raw);
    expect(decodeURIComponent(url.password)).toBe(password);
    expect(url.hostname).toBe('db.example.internal');
    expect(url.port).toBe('3306');
  });

  it('帳號含特殊字元時也做 URL 編碼', () => {
    const user = 'seat@user';
    const url = new URL(databaseUrl(cfg({ user })));
    expect(decodeURIComponent(url.username)).toBe(user);
    expect(url.hostname).toBe('db.example.internal');
  });

  it('開 SSL 時不驗證憑證（sslaccept=accept_invalid_certs）', () => {
    const url = new URL(databaseUrl(cfg({ ssl: true })));
    expect(url.searchParams.get('sslaccept')).toBe('accept_invalid_certs');
  });

  it('關閉 SSL 時不帶 sslaccept', () => {
    expect(databaseUrl(cfg({ ssl: false }))).not.toContain('sslaccept');
  });
});
