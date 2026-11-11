// 編輯者名單改成權限名單的 migration（D-026；docs/architecture.md 第 7.1 節「從編輯者名單改成權限名單」、第 7.3 節、第 15.1 節
// 「migration 後既有的列都是編輯者」）：新增的 migration 把 Editor 表改名為 Member（unique 索引一併改名，讓 schema 與資料庫一致），
// 加上 role 欄位；既有的列都成為 EDITOR，之後拿掉預設值，每次新增都由程式指定權限。部署後名單上只有原本的編輯者。
//
// 做法：另建一個測試資料庫（{TEST_DATABASE_NAME}_mig），依資料夾名稱的順序套用 prisma/migrations 裡 D-026 之前的 migration，
// 寫入兩列 Editor，再套用 D-026 的 migration，檢查兩列都變成 Member、role = 'EDITOR'，id、email、createdAt、createdBy 都不變。
// D-026 的 migration 是第一個 SQL 用到 `Member` 表的 migration（資料夾名稱還不確定，不寫死）。
// SQL 用 mariadb 直接執行（和 prisma migrate deploy 一樣，一個檔案當一段 script 執行），不經過 Prisma Client。
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createConnection, type Connection } from 'mariadb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseConfigFromEnv } from '../../../src/server/database-config';
import { loadTestEnv } from '../../helpers/test-database';

const MIGRATIONS_DIR = path.join(process.cwd(), 'prisma', 'migrations');
const DB_NAME = `${loadTestEnv()}_mig`;

type Migration = { name: string; sql: string };

const migrations: Migration[] = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
  .map((name) => ({ name, sql: readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8') }));

const targetIndex = migrations.findIndex((m) => /`Member`/.test(m.sql));
const target = migrations[targetIndex];
const before = migrations.slice(0, Math.max(targetIndex, 0));

async function connect(database?: string): Promise<Connection> {
  const cfg = databaseConfigFromEnv(process.env, DB_NAME);
  return createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
    allowPublicKeyRetrieval: !cfg.ssl,
    multipleStatements: true,
    insertIdAsNumber: true,
    bigIntAsNumber: true,
  });
}

async function onServer<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  const conn = await connect();
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

let db: Connection | undefined;
const conn = (): Connection => {
  if (!db) throw new Error('migration 測試資料庫還沒連上');
  return db;
};

type Row = { id: number; email: string; createdAt: string; createdBy: string | null };
/** createdAt 用字串比對（到毫秒），不受連線時區影響 */
const SELECT_ROWS = (table: string) =>
  `SELECT \`id\`, \`email\`, DATE_FORMAT(\`createdAt\`, '%Y-%m-%d %H:%i:%s.%f') AS \`createdAt\`, \`createdBy\` FROM \`${table}\` ORDER BY \`id\``;

let editorsBefore: Row[] = [];

beforeAll(async () => {
  if (!target) return;
  await onServer(async (c) => {
    await c.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    await c.query(`CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  });
  db = await connect(DB_NAME);
  for (const m of before) await conn().query(m.sql);

  // D-026 之前的編輯者名單：甲由 INITIAL_EDITOR_EMAILS 寫入（createdBy 是 null），乙由甲在權限頁新增。
  // 加入時間用固定的過去時間，之後新增的（預設是現在）一定排在後面，不受資料庫主機時鐘影響
  await conn().query(
    'INSERT INTO `Editor` (`email`, `createdAt`, `createdBy`) VALUES (?, ?, ?), (?, ?, ?)',
    ['jia@program.com.tw', '2001-02-03 08:00:00.123', null, 'yi@program.com.tw', '2001-02-04 09:30:00.456', 'jia@program.com.tw'],
  );
  editorsBefore = await conn().query<Row[]>(SELECT_ROWS('Editor'));

  await conn().query(target.sql);
});

afterAll(async () => {
  await db?.end();
  if (target) {
    await onServer((c) => c.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``));
  }
});

describe('D-026 的 migration：Editor 改名為 Member、加上 role', () => {
  it('找得到 D-026 的 migration（第一個用到 `Member` 表的），而且在建立 Editor 的 migration 之後', () => {
    expect(target, 'prisma/migrations 裡沒有用到 `Member` 表的 migration').toBeDefined();
    expect(before.some((m) => /CREATE TABLE `Editor`/.test(m.sql)), 'D-026 之前的 migration 建立了 Editor 表').toBe(true);
  });

  it('套用前的兩列 Editor 確實寫進去了（測試本身的前提）', () => {
    expect(editorsBefore).toHaveLength(2);
  });

  it('兩列都變成 Member，role 是 EDITOR；id、email、createdAt、createdBy 都不變', async () => {
    const rows = await conn().query<(Row & { role: string })[]>(
      `SELECT \`id\`, \`email\`, \`role\`, DATE_FORMAT(\`createdAt\`, '%Y-%m-%d %H:%i:%s.%f') AS \`createdAt\`, \`createdBy\` FROM \`Member\` ORDER BY \`id\``,
    );
    expect(rows.map((r) => ({ id: Number(r.id), email: r.email, createdAt: r.createdAt, createdBy: r.createdBy }))).toEqual(
      editorsBefore.map((r) => ({ id: Number(r.id), email: r.email, createdAt: r.createdAt, createdBy: r.createdBy })),
    );
    expect(rows.map((r) => r.role)).toEqual(['EDITOR', 'EDITOR']);
    expect(rows.map((r) => r.createdAt)).toEqual(['2001-02-03 08:00:00.123000', '2001-02-04 09:30:00.456000']);
  });

  it('Editor 表已經不存在', async () => {
    const tables = await conn().query<Record<string, string>[]>(
      'SELECT `TABLE_NAME` AS `name` FROM `information_schema`.`TABLES` WHERE `TABLE_SCHEMA` = ? AND `TABLE_NAME` IN (?, ?)',
      [DB_NAME, 'Editor', 'Member'],
    );
    expect(tables.map((t) => t.name)).toEqual(['Member']);
  });

  it('role 是 EDITOR、VIEWER 兩種，不能是空的，也沒有預設值（之後新增都由程式指定）', async () => {
    const columns = await conn().query<{ type: string; nullable: string; def: string | null }[]>(
      'SELECT `COLUMN_TYPE` AS `type`, `IS_NULLABLE` AS `nullable`, `COLUMN_DEFAULT` AS `def` FROM `information_schema`.`COLUMNS` ' +
        'WHERE `TABLE_SCHEMA` = ? AND `TABLE_NAME` = ? AND `COLUMN_NAME` = ?',
      [DB_NAME, 'Member', 'role'],
    );
    expect(columns).toHaveLength(1);
    expect(columns[0]?.type.replace(/\s/g, '').toLowerCase()).toBe("enum('editor','viewer')");
    expect(columns[0]?.nullable).toBe('NO');
    expect(columns[0]?.def ?? null).toBeNull();
  });

  it('email 的 unique 索引一併改名為 Member_email_key：同一個 email 不能再加一次', async () => {
    const indexes = await conn().query<{ name: string; nonUnique: number }[]>(
      'SELECT `INDEX_NAME` AS `name`, `NON_UNIQUE` AS `nonUnique` FROM `information_schema`.`STATISTICS` ' +
        'WHERE `TABLE_SCHEMA` = ? AND `TABLE_NAME` = ? AND `COLUMN_NAME` = ?',
      [DB_NAME, 'Member', 'email'],
    );
    expect(indexes.map((i) => ({ name: i.name, nonUnique: Number(i.nonUnique) }))).toEqual([{ name: 'Member_email_key', nonUnique: 0 }]);
    await expect(conn().query('INSERT INTO `Member` (`email`, `role`) VALUES (?, ?)', ['jia@program.com.tw', 'VIEWER'])).rejects.toThrow();
  });

  it('migration 之後可以新增檢視者，加入時間預設是現在、排在原本的編輯者後面', async () => {
    await conn().query('INSERT INTO `Member` (`email`, `role`) VALUES (?, ?)', ['bing@program.com.tw', 'VIEWER']);
    const rows = await conn().query<{ email: string; role: string }[]>('SELECT `email`, `role` FROM `Member` ORDER BY `createdAt`, `id`');
    expect(rows.map((r) => [r.email, r.role])).toEqual([
      ['jia@program.com.tw', 'EDITOR'],
      ['yi@program.com.tw', 'EDITOR'],
      ['bing@program.com.tw', 'VIEWER'],
    ]);
  });
});
