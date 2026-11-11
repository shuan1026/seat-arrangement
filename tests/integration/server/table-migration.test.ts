// 桌子與位置分開的 migration（D-027；docs/architecture.md 第 7.1 節「從固定 30 桌改成桌子與位置分開的 migration」、第 7.3 節）：
// 加上 position（unique，null 是暫存區）與 stagedAt；既有的 1–30 桌 position = id，工作人員桌（id 0）是 null；
// id 不改（不是 auto increment，新增的桌由服務層取最大 id 加 1，所以工作人員桌的 id 0 不會被改號），參與人員的 tableId 不必改。
// 部署後 30 桌都在原位置，畫面和部署前相同。
//
// 做法同 member-migration.test.ts：另建一個測試資料庫（{TEST_DATABASE_NAME}_tmig），依資料夾名稱的順序套用 D-027 之前的 migration，
// 寫入幾位已入座的參與人員（含工作人員桌）與備註名稱，再套用 D-027 的 migration，檢查桌子與參與人員。
// D-027 的 migration 是第一個 SQL 用到 `stagedAt` 欄位的 migration（資料夾名稱還不確定，不寫死）。
// SQL 用 mariadb 直接執行（和 prisma migrate deploy 一樣，一個檔案當一段 script 執行），不經過 Prisma Client。
// 「新增的桌 id 從 31 起」改用 API 的 createTable 驗證（tests/integration/api/seating-tables.test.ts），這裡不用不給 id 的 INSERT 驗證。
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createConnection, type Connection } from 'mariadb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseConfigFromEnv } from '../../../src/server/database-config';
import { loadTestEnv } from '../../helpers/test-database';

const MIGRATIONS_DIR = path.join(process.cwd(), 'prisma', 'migrations');
const DB_NAME = `${loadTestEnv()}_tmig`;

type Migration = { name: string; sql: string };

const migrations: Migration[] = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
  .map((name) => ({ name, sql: readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8') }));

const targetIndex = migrations.findIndex((m) => /`stagedAt`/.test(m.sql));
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

type Seat = { id: number; tableId: number | null; seatOrder: number | null };
type TableRow = { id: number; kind: string; position: number | null; stagedAt: string | null; noteName: string | null };

let seatsBefore: Seat[] = [];
let notesBefore: { id: number; noteName: string | null }[] = [];

beforeAll(async () => {
  if (!target) return;
  await onServer(async (c) => {
    await c.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    await c.query(`CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  });
  db = await connect(DB_NAME);
  for (const m of before) await conn().query(m.sql);

  // D-027 之前的資料：B4 桌（id 3）坐甲、乙，B10 桌（id 5）坐丙，工作人員桌（id 0）有丁，戊未入座；B1 桌（id 1）備註名稱「主桌」
  const people: [name: string, tableId: number | null, seatOrder: number | null][] = [
    ['測試甲', 3, 0],
    ['測試乙', 3, 1],
    ['測試丙', 5, 0],
    ['測試丁', 0, 0],
    ['測試戊', null, null],
  ];
  for (const [i, [name, tableId, seatOrder]] of people.entries()) {
    const e = await conn().query<{ insertId: number }>(
      'INSERT INTO `Employee` (`name`, `department`, `sortOrder`, `updatedAt`) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))',
      [name, '測試部', i + 1],
    );
    await conn().query(
      'INSERT INTO `Participant` (`kind`, `employeeId`, `tableId`, `seatOrder`, `updatedAt`) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))',
      ['EMPLOYEE', Number(e.insertId), tableId, seatOrder],
    );
  }
  await conn().query('UPDATE `SeatTable` SET `noteName` = ? WHERE `id` = ?', ['主桌', 1]);
  seatsBefore = await conn().query<Seat[]>('SELECT `id`, `tableId`, `seatOrder` FROM `Participant` ORDER BY `id`');
  notesBefore = await conn().query<{ id: number; noteName: string | null }[]>('SELECT `id`, `noteName` FROM `SeatTable` ORDER BY `id`');

  await conn().query(target.sql);
});

afterAll(async () => {
  await db?.end();
  if (target) await onServer((c) => c.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``));
});

const tables = () =>
  conn().query<TableRow[]>('SELECT `id`, `kind`, `position`, `stagedAt`, `noteName` FROM `SeatTable` ORDER BY `id`');

describe('D-027 的 migration：桌子加上 position、stagedAt', () => {
  it('找得到 D-027 的 migration（第一個用到 `stagedAt` 的），而且在建立 SeatTable 的 migration 之後', () => {
    expect(target, 'prisma/migrations 裡沒有用到 `stagedAt` 的 migration').toBeDefined();
    expect(before.some((m) => /CREATE TABLE `SeatTable`/.test(m.sql)), 'D-027 之前的 migration 建立了 SeatTable 表').toBe(true);
  });

  it('套用前的資料確實寫進去了（測試本身的前提）', () => {
    expect(seatsBefore).toHaveLength(5);
    expect(notesBefore).toHaveLength(31);
  });

  it('既有的 1–30 桌 position = id；工作人員桌（id 0、STAFF）position 是 null；stagedAt 都是 null（暫存區沒有桌）', async () => {
    const rows = await tables();
    expect(rows).toHaveLength(31);
    for (const t of rows) {
      const label = `id ${t.id}`;
      if (Number(t.id) === 0) {
        expect(t.kind, label).toBe('STAFF');
        expect(t.position, label).toBeNull();
      } else {
        expect(t.kind, label).toBe('NORMAL');
        expect(Number(t.position), label).toBe(Number(t.id));
      }
      expect(t.stagedAt, label).toBeNull();
    }
    expect(rows.map((t) => Number(t.id))).toEqual(Array.from({ length: 31 }, (_, i) => i));
  });

  it('備註名稱不變', async () => {
    const rows = await tables();
    expect(rows.map((t) => ({ id: Number(t.id), noteName: t.noteName }))).toEqual(notesBefore.map((t) => ({ id: Number(t.id), noteName: t.noteName })));
  });

  it('參與人員的 tableId、seatOrder 都不變（工作人員仍在 id 0 的桌）', async () => {
    const rows = await conn().query<Seat[]>('SELECT `id`, `tableId`, `seatOrder` FROM `Participant` ORDER BY `id`');
    const norm = (s: Seat) => ({ id: Number(s.id), tableId: s.tableId === null ? null : Number(s.tableId), seatOrder: s.seatOrder === null ? null : Number(s.seatOrder) });
    expect(rows.map(norm)).toEqual(seatsBefore.map(norm));
    expect(rows.map(norm).find((s) => s.tableId === 0)).toBeDefined();
  });

  it('position 是 unique：同一個位置不能有兩張桌；null（暫存區）可以有很多張', async () => {
    await expect(conn().query('UPDATE `SeatTable` SET `position` = 3 WHERE `id` = 7')).rejects.toThrow();
    await conn().query('UPDATE `SeatTable` SET `position` = NULL, `stagedAt` = CURRENT_TIMESTAMP(3) WHERE `id` IN (7, 8)');
    const staged = await conn().query<{ n: number }[]>('SELECT COUNT(*) AS `n` FROM `SeatTable` WHERE `kind` = ? AND `position` IS NULL', ['NORMAL']);
    expect(Number(staged[0]?.n)).toBe(2);
    await conn().query('UPDATE `SeatTable` SET `position` = `id`, `stagedAt` = NULL WHERE `id` IN (7, 8)');
  });

  it('id 不是 auto increment（新增的桌由服務層取最大 id 加 1；工作人員桌的 id 0 不會被當成「產生新編號」改號）', async () => {
    const columns = await conn().query<{ extra: string }[]>(
      'SELECT `EXTRA` AS `extra` FROM `information_schema`.`COLUMNS` WHERE `TABLE_SCHEMA` = ? AND `TABLE_NAME` = ? AND `COLUMN_NAME` = ?',
      [DB_NAME, 'SeatTable', 'id'],
    );
    expect(columns).toHaveLength(1);
    expect((columns[0]?.extra ?? '').toLowerCase()).not.toContain('auto_increment');
  });

  it('migration 之後可以照服務層的做法新增 id 31 的桌、放在「未放桌」的位置', async () => {
    await conn().query('DELETE FROM `SeatTable` WHERE `id` = 9');
    await conn().query("INSERT INTO `SeatTable` (`id`, `kind`, `position`, `updatedAt`) VALUES (31, 'NORMAL', 9, CURRENT_TIMESTAMP(3))");
    const rows = await tables();
    expect(rows.find((t) => Number(t.id) === 31)).toMatchObject({ kind: 'NORMAL', stagedAt: null, noteName: null });
    expect(Number(rows.find((t) => Number(t.id) === 31)?.position)).toBe(9);
  });
});
