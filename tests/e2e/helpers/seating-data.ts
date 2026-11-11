// 座位安排 E2E 的測試資料：直接寫進 E2E 伺服器使用的測試資料庫，只用虛構資料（docs/architecture.md 第 6 節）。
// 用 mariadb driver 下 SQL（同 tests/helpers/test-database.ts 的連線方式），不經過 src/server/db.ts：
// 那個模組 import 'server-only'，在 Playwright 的 Node 行程裡載入會丟錯。
// 欄位與表名依 prisma/migrations（D-027 起 SeatTable 有 position、stagedAt：position 1–30 是位置，null 是暫存區）。
// seed() 每次先把桌子恢復成 1–30 桌在原位置、暫存區沒有桌、刪掉 id > 30 的桌（tests/helpers/table-reset.ts），
// 所以測試資料的 tableId 1–30 一開始就是同號的位置；搬動之後要看某個位置上的名單用 rosterNamesAt(位置)。
import { createConnection, type Connection } from 'mariadb';
import { databaseConfigFromEnv } from '../../../src/server/database-config';
import { RESET_TABLES_SQL } from '../../helpers/table-reset';
import { loadTestEnv } from '../../helpers/test-database';

export const STAFF = 0;

async function connect(): Promise<Connection> {
  const cfg = databaseConfigFromEnv(process.env, loadTestEnv());
  return createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
    allowPublicKeyRetrieval: !cfg.ssl,
    insertIdAsNumber: true,
    bigIntAsNumber: true,
  });
}

async function withConnection<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  const conn = await connect();
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

export type PersonOptions = {
  department?: string;
  team?: string | null;
  extension?: string | null;
  /** null 或省略 = 未入座；0 = 工作人員桌 */
  tableId?: number | null;
  /** 省略時接在這一桌目前的人後面 */
  seatOrder?: number;
  childSeat?: boolean;
  vegetarian?: boolean;
};

export type GuestOptions = Omit<PersonOptions, 'department' | 'team' | 'extension'> & { organization?: string | null };

/** 建立測試資料的工具；每個方法回傳參與人員 id（employeeOnly 回傳員工 id） */
export class SeatingSeeder {
  private sortOrder = 0;
  private readonly nextSeat = new Map<number, number>();

  constructor(private readonly conn: Connection) {}

  private seatFor(tableId: number | null | undefined, seatOrder?: number): number | null {
    if (tableId == null) return null;
    const n = seatOrder ?? this.nextSeat.get(tableId) ?? 0;
    this.nextSeat.set(tableId, Math.max(n + 1, this.nextSeat.get(tableId) ?? 0));
    return n;
  }

  /** 員工名單上的員工（還沒報名），回傳員工 id */
  async employeeOnly(name: string, opts: Pick<PersonOptions, 'department' | 'team' | 'extension'> = {}): Promise<number> {
    this.sortOrder += 1;
    const r = await this.conn.query<{ insertId: number }>(
      'INSERT INTO `Employee` (`name`, `department`, `team`, `extension`, `sortOrder`, `updatedAt`) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))',
      [name, opts.department ?? '測試部', opts.team ?? null, opts.extension ?? null, this.sortOrder],
    );
    return Number(r.insertId);
  }

  private async participant(values: {
    kind: 'EMPLOYEE' | 'DEPENDENT' | 'GUEST';
    employeeId?: number | null;
    hostId?: number | null;
    guestName?: string | null;
    organization?: string | null;
    opts: GuestOptions;
  }): Promise<number> {
    const tableId = values.opts.tableId ?? null;
    const seatOrder = this.seatFor(tableId, values.opts.seatOrder);
    const r = await this.conn.query<{ insertId: number }>(
      'INSERT INTO `Participant` (`kind`, `employeeId`, `hostId`, `guestName`, `organization`, `childSeat`, `vegetarian`, `tableId`, `seatOrder`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))',
      [
        values.kind,
        values.employeeId ?? null,
        values.hostId ?? null,
        values.guestName ?? null,
        values.organization ?? null,
        values.opts.childSeat ?? false,
        values.opts.vegetarian ?? false,
        tableId,
        seatOrder,
      ],
    );
    return Number(r.insertId);
  }

  /** 已報名的員工 */
  async employee(name: string, opts: PersonOptions = {}): Promise<number> {
    const employeeId = await this.employeeOnly(name, opts);
    return this.participant({ kind: 'EMPLOYEE', employeeId, opts });
  }

  /** 工作人員（坐在工作人員桌的員工） */
  async staff(name: string, opts: Omit<PersonOptions, 'tableId' | 'seatOrder'> = {}): Promise<number> {
    return this.employee(name, { ...opts, tableId: STAFF });
  }

  /** 眷屬，顯示名稱是「{員工姓名}_眷屬」 */
  async dependent(hostParticipantId: number, opts: GuestOptions = {}): Promise<number> {
    return this.participant({ kind: 'DEPENDENT', hostId: hostParticipantId, opts });
  }

  /** 外部貴賓；單位／頭銜存在 organization */
  async guest(name: string, opts: GuestOptions = {}): Promise<number> {
    return this.participant({ kind: 'GUEST', guestName: name, organization: opts.organization ?? null, opts });
  }

  /** 在 tableId 接著坐 count 位員工，姓名「{prefix}{序號}」 */
  async fill(tableId: number, count: number, opts: Omit<PersonOptions, 'tableId' | 'seatOrder'> & { prefix?: string } = {}): Promise<number[]> {
    const ids: number[] = [];
    const prefix = opts.prefix ?? `座${tableId}員`;
    for (let i = 1; i <= count; i++) ids.push(await this.employee(`${prefix}${i}`, { ...opts, tableId }));
    return ids;
  }

  /** count 位未入座的員工 */
  async unseated(count: number, opts: Omit<PersonOptions, 'tableId' | 'seatOrder'> & { prefix?: string } = {}): Promise<number[]> {
    const ids: number[] = [];
    const prefix = opts.prefix ?? '待排員';
    for (let i = 1; i <= count; i++) ids.push(await this.employee(`${prefix}${i}`, opts));
    return ids;
  }

  async noteName(tableId: number, noteName: string | null): Promise<void> {
    await this.conn.query('UPDATE `SeatTable` SET `noteName` = ?, `updatedAt` = CURRENT_TIMESTAMP(3) WHERE `id` = ?', [
      noteName,
      tableId,
    ]);
  }

  // ---- 桌子與位置（D-027）

  private stagedSeq = 0;
  /** 暫存區的時間：依呼叫順序遞增的過去時間，先呼叫的排在暫存區上面 */
  private nextStagedAt(): string {
    this.stagedSeq += 1;
    return `2026-01-01 00:00:${String(this.stagedSeq).padStart(2, '0')}.000`;
  }

  /** 刪掉這個位置（1–30）上的桌：位置變成「未放桌」。要在讓人坐那一桌之前呼叫 */
  async emptyPosition(position: number): Promise<void> {
    await this.conn.query('DELETE FROM `SeatTable` WHERE `position` = ? AND `kind` = ?', [position, 'NORMAL']);
  }

  /** 新增一張暫存的桌（排在暫存區最下面），回傳桌子的 id（目前最大的 id 加 1，31 起）；之後用 tableId 讓人坐上去 */
  async stagedTable(noteName: string | null = null): Promise<number> {
    const rows = await this.conn.query<{ next: number }[]>('SELECT GREATEST(COALESCE(MAX(`id`), 0), 30) + 1 AS `next` FROM `SeatTable`');
    const id = Number(rows[0]?.next ?? 31);
    await this.conn.query(
      'INSERT INTO `SeatTable` (`id`, `kind`, `position`, `stagedAt`, `noteName`, `updatedAt`) VALUES (?, ?, NULL, ?, ?, CURRENT_TIMESTAMP(3))',
      [id, 'NORMAL', this.nextStagedAt(), noteName],
    );
    return id;
  }

  /** 把既有的桌（例如 1–30 桌）移到暫存區最下面：原位置變成「未放桌」 */
  async stage(tableId: number): Promise<void> {
    await this.conn.query('UPDATE `SeatTable` SET `position` = NULL, `stagedAt` = ?, `updatedAt` = CURRENT_TIMESTAMP(3) WHERE `id` = ?', [
      this.nextStagedAt(),
      tableId,
    ]);
  }
}

/** 桌子恢復成 1–30 桌在原位置、沒有備註名稱、暫存區沒有桌，刪掉 id > 30 的桌（要先刪掉參與人員） */
export async function resetTablesWith(conn: Connection): Promise<void> {
  for (const sql of RESET_TABLES_SQL) await conn.query(sql);
}

/** 清空資料（員工、參與人員、備註名稱），桌子恢復成部署時的樣子（D-027），再用 build 建立這個測試要的資料 */
export async function seed<T>(build: (s: SeatingSeeder) => Promise<T>): Promise<T> {
  return withConnection(async (conn) => {
    await conn.query('DELETE FROM `Participant` WHERE `hostId` IS NOT NULL');
    await conn.query('DELETE FROM `Participant`');
    await conn.query('DELETE FROM `Employee`');
    await resetTablesWith(conn);
    return build(new SeatingSeeder(conn));
  });
}

/** 在既有資料上再加資料（模擬別人剛改過；不清空）。新的 seeder 不知道既有的座號，入座時要自己指定 seatOrder */
export async function addMore<T>(build: (s: SeatingSeeder) => Promise<T>): Promise<T> {
  return withConnection(async (conn) => {
    const seeder = new SeatingSeeder(conn);
    return build(seeder);
  });
}

export async function seatOf(participantId: number): Promise<{ tableId: number | null; seatOrder: number | null }> {
  return withConnection(async (conn) => {
    const rows = await conn.query<{ tableId: number | null; seatOrder: number | null }[]>(
      'SELECT `tableId`, `seatOrder` FROM `Participant` WHERE `id` = ?',
      [participantId],
    );
    const row = rows[0];
    if (!row) throw new Error(`沒有參與人員 ${participantId}`);
    return { tableId: row.tableId, seatOrder: row.seatOrder };
  });
}

/** 一桌的名單（依座號）的顯示名稱 */
export async function rosterNames(tableId: number): Promise<string[]> {
  return withConnection(async (conn) => {
    const rows = await conn.query<{ kind: string; ename: string | null; hname: string | null; guestName: string | null }[]>(
      `SELECT p.kind, e.name AS ename, he.name AS hname, p.guestName
         FROM Participant p
         LEFT JOIN Employee e ON e.id = p.employeeId
         LEFT JOIN Participant h ON h.id = p.hostId
         LEFT JOIN Employee he ON he.id = h.employeeId
        WHERE p.tableId = ?
        ORDER BY p.seatOrder, p.id`,
      [tableId],
    );
    return rows.map((r) => (r.kind === 'GUEST' ? (r.guestName ?? '') : r.kind === 'DEPENDENT' ? `${r.hname ?? ''}_眷屬` : (r.ename ?? '')));
  });
}

// ---- 位置（D-027）：位置編號 1–30 與桌號的對應同 tests/helpers/table-codes.ts（3 = B4、7 = B2、9 = B8…）

/** 這個位置上的桌的 id；「未放桌」是 null */
export async function tableIdAt(position: number): Promise<number | null> {
  return withConnection(async (conn) => {
    const rows = await conn.query<{ id: number }[]>('SELECT `id` FROM `SeatTable` WHERE `position` = ? AND `kind` = ?', [position, 'NORMAL']);
    return rows[0] ? Number(rows[0].id) : null;
  });
}

/** 這個位置上的桌的名單（依座號的顯示名稱）；「未放桌」是空陣列 */
export async function rosterNamesAt(position: number): Promise<string[]> {
  const id = await tableIdAt(position);
  return id === null ? [] : rosterNames(id);
}

/** 這個位置上的桌的備註名稱；「未放桌」是 undefined */
export async function noteNameAt(position: number): Promise<string | null | undefined> {
  const id = await tableIdAt(position);
  return id === null ? undefined : noteNameOf(id);
}

/** 這張桌所在的位置；暫存區是 null；桌子不存在時是 undefined */
export async function positionOfTable(tableId: number): Promise<number | null | undefined> {
  return withConnection(async (conn) => {
    const rows = await conn.query<{ position: number | null }[]>('SELECT `position` FROM `SeatTable` WHERE `id` = ?', [tableId]);
    const row = rows[0];
    if (!row) return undefined;
    return row.position === null ? null : Number(row.position);
  });
}

/** 暫存區的桌，依移入的先後由上往下：id、備註名稱與名單 */
export async function stagedTables(): Promise<{ id: number; noteName: string | null; names: string[] }[]> {
  const rows = await withConnection((conn) =>
    conn.query<{ id: number; noteName: string | null }[]>(
      'SELECT `id`, `noteName` FROM `SeatTable` WHERE `kind` = ? AND `position` IS NULL ORDER BY `stagedAt`, `id`',
      ['NORMAL'],
    ),
  );
  const out: { id: number; noteName: string | null; names: string[] }[] = [];
  for (const r of rows) out.push({ id: Number(r.id), noteName: r.noteName, names: await rosterNames(Number(r.id)) });
  return out;
}

/** 一般桌（場上與暫存）的張數 */
export async function normalTableCount(): Promise<number> {
  return withConnection(async (conn) => {
    const rows = await conn.query<{ n: number }[]>('SELECT COUNT(*) AS `n` FROM `SeatTable` WHERE `kind` = ?', ['NORMAL']);
    return Number(rows[0]?.n ?? 0);
  });
}

export async function noteNameOf(tableId: number): Promise<string | null> {
  return withConnection(async (conn) => {
    const rows = await conn.query<{ noteName: string | null }[]>('SELECT `noteName` FROM `SeatTable` WHERE `id` = ?', [tableId]);
    return rows[0]?.noteName ?? null;
  });
}

export async function participantCount(): Promise<number> {
  return withConnection(async (conn) => {
    const rows = await conn.query<{ n: number }[]>('SELECT COUNT(*) AS n FROM `Participant`');
    return Number(rows[0]?.n ?? 0);
  });
}

/** 刪除一位參與人員（模擬別人剛刪掉） */
export async function deleteParticipant(participantId: number): Promise<void> {
  await withConnection(async (conn) => {
    await conn.query('DELETE FROM `Participant` WHERE `hostId` = ?', [participantId]);
    await conn.query('DELETE FROM `Participant` WHERE `id` = ?', [participantId]);
  });
}

/** 改員工名單上的部門（模擬在員工名單頁修改，SEAT-R10） */
export async function setEmployeeDepartmentByName(name: string, department: string): Promise<void> {
  await withConnection(async (conn) => {
    await conn.query('UPDATE `Employee` SET `department` = ?, `updatedAt` = CURRENT_TIMESTAMP(3) WHERE `name` = ?', [
      department,
      name,
    ]);
  });
}
