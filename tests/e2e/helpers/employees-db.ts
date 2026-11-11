// 員工名單 E2E 的測試資料：直接寫進測試資料庫（和 E2E 伺服器同一個 TEST_DATABASE_NAME，見 playwright.config.ts）。
// 用 mariadb 連線下 SQL（和 tests/helpers/test-database.ts、Prisma 的 MariaDB adapter 同一個 driver），不經 Prisma Client：
// 產生的 Prisma Client（src/generated/prisma）用 import.meta 與 server-only，Playwright 以 CommonJS 載入測試檔時讀不進來。
// 只放虛構資料。
import { createPool, type Pool, type UpsertResult } from 'mariadb';
import { databaseConfigFromEnv } from '../../../src/server/database-config';
import { RESET_TABLES_SQL } from '../../helpers/table-reset';
import { loadTestEnv } from '../../helpers/test-database';

let pool: Pool | null = null;
let seq = 0;

function db(): Pool {
  if (!pool) {
    const cfg = databaseConfigFromEnv(process.env, loadTestEnv());
    pool = createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
      allowPublicKeyRetrieval: !cfg.ssl,
      connectionLimit: 2,
      insertIdAsNumber: true,
      bigIntAsNumber: true,
    });
  }
  return pool;
}

/** 每個測試檔最後呼叫：關閉連線 */
export async function closeDb(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

/** 清空員工與參與人員，桌子恢復成 1–30 桌在原位置、沒有備註名稱、暫存區沒有桌（同 tests/helpers/db.ts 的 resetData，D-027） */
export async function resetData(): Promise<void> {
  const conn = db();
  await conn.query('DELETE FROM `Participant` WHERE `hostId` IS NOT NULL');
  await conn.query('DELETE FROM `Participant`');
  await conn.query('DELETE FROM `Employee`');
  for (const sql of RESET_TABLES_SQL) await conn.query(sql);
}

export type EmployeeSeed = {
  name: string;
  department: string;
  englishName?: string | null;
  team?: string | null;
  extension?: string | null;
  region?: string | null;
  office?: string | null;
  note?: string | null;
  /** 承辦人標記為不參加（D-014）；省略時是 false */
  declined?: boolean;
};

/** 新增一位員工，依呼叫順序排在員工名單最後；回傳 id */
export async function insertEmployee(e: EmployeeSeed): Promise<number> {
  seq += 1;
  const res = await db().query<UpsertResult>(
    'INSERT INTO `Employee` (`name`, `englishName`, `department`, `team`, `extension`, `region`, `office`, `note`, `declined`, `sortOrder`, `updatedAt`) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))',
    [
      e.name,
      e.englishName ?? null,
      e.department,
      e.team ?? null,
      e.extension ?? null,
      e.region ?? null,
      e.office ?? null,
      e.note ?? null,
      e.declined ?? false,
      seq,
    ],
  );
  return Number(res.insertId);
}

/** 直接改資料庫裡的不參加標記（模擬另一個人標記或改回） */
export async function setDeclined(employeeId: number, declined: boolean): Promise<void> {
  await db().query('UPDATE `Employee` SET `declined` = ?, `updatedAt` = CURRENT_TIMESTAMP(3) WHERE `id` = ?', [declined, employeeId]);
}

/** 資料庫裡這位員工的不參加標記；員工不存在時是 null */
export async function declinedOf(employeeId: number): Promise<boolean | null> {
  const rows = await db().query<{ declined: number | boolean }[]>('SELECT `declined` FROM `Employee` WHERE `id` = ?', [employeeId]);
  const row = rows[0];
  return row === undefined ? null : Boolean(Number(row.declined));
}

/** 依序新增多位員工；回傳 id（順序同輸入） */
export async function insertEmployees(list: readonly EmployeeSeed[]): Promise<number[]> {
  const ids: number[] = [];
  for (const e of list) ids.push(await insertEmployee(e));
  return ids;
}

/** n 位「{prefix}01」起編號的員工（同一個部門） */
export const numbered = (n: number, prefix = '員工', department = '測試部'): EmployeeSeed[] =>
  Array.from({ length: n }, (_, i) => ({ name: `${prefix}${String(i + 1).padStart(2, '0')}`, department }));

type Seat = { tableId?: number | null; seatOrder?: number | null };

/** 把員工加入尾牙（可指定桌次；0 是工作人員桌）；回傳參與人員 id */
export async function registerEmployee(employeeId: number, seat: Seat = {}): Promise<number> {
  const res = await db().query<UpsertResult>(
    'INSERT INTO `Participant` (`kind`, `employeeId`, `tableId`, `seatOrder`, `updatedAt`) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))',
    ['EMPLOYEE', employeeId, seat.tableId ?? null, seat.seatOrder ?? null],
  );
  return Number(res.insertId);
}

/** 為已報名的員工（參與人員 id）加一位眷屬；回傳眷屬的參與人員 id */
export async function insertDependent(hostId: number, seat: Seat = {}): Promise<number> {
  const res = await db().query<UpsertResult>(
    'INSERT INTO `Participant` (`kind`, `hostId`, `relation`, `tableId`, `seatOrder`, `updatedAt`) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))',
    ['DEPENDENT', hostId, '配偶', seat.tableId ?? null, seat.seatOrder ?? null],
  );
  return Number(res.insertId);
}

/** 模擬另一個人刪除員工（外鍵 cascade 一併刪除參與人員與眷屬） */
export async function deleteEmployeeRow(id: number): Promise<void> {
  await db().query('DELETE FROM `Employee` WHERE `id` = ?', [id]);
}

export type EmployeeRow = {
  id: number;
  name: string;
  englishName: string | null;
  department: string;
  team: string | null;
  extension: string | null;
  region: string | null;
  office: string | null;
  note: string | null;
  declined: boolean;
  sortOrder: number;
};

export async function employeeRows(): Promise<EmployeeRow[]> {
  const rows = await db().query<(Omit<EmployeeRow, 'declined'> & { declined: number | boolean })[]>(
    'SELECT `id`, `name`, `englishName`, `department`, `team`, `extension`, `region`, `office`, `note`, `declined`, `sortOrder` FROM `Employee` ORDER BY `sortOrder`, `id`',
  );
  return rows.map((r) => ({ ...r, declined: Boolean(Number(r.declined)) }));
}

export type ParticipantRow = {
  id: number;
  kind: 'EMPLOYEE' | 'DEPENDENT' | 'GUEST';
  employeeId: number | null;
  hostId: number | null;
  tableId: number | null;
  seatOrder: number | null;
};

export async function participantRows(): Promise<ParticipantRow[]> {
  const rows = await db().query<ParticipantRow[]>(
    'SELECT `id`, `kind`, `employeeId`, `hostId`, `tableId`, `seatOrder` FROM `Participant` ORDER BY `id`',
  );
  return [...rows];
}

/** 某一桌（0 是工作人員桌）目前的人數 */
export async function seatedCount(tableId: number): Promise<number> {
  const rows = await db().query<{ n: number | bigint }[]>('SELECT COUNT(*) AS `n` FROM `Participant` WHERE `tableId` = ?', [
    tableId,
  ]);
  return Number(rows[0]?.n ?? 0);
}
