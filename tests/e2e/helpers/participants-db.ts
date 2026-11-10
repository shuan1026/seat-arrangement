// 參與人員 E2E 的測試資料：直接寫進 E2E 伺服器用的測試資料庫（TEST_DATABASE_NAME），只用虛構資料。
// 連線方式和 tests/helpers/test-database.ts（E2E 的 globalSetup）相同，用 mariadb 直接下 SQL：
// Prisma 產生的 client 是 ESM（用到 import.meta.url），Playwright 以 CommonJS 載入測試檔時不一定能用。
// 每個操作開一條連線、做完就關，不留連線在 Playwright 的 worker 裡。
import { createConnection, type Connection } from 'mariadb';
import { databaseConfigFromEnv } from '../../../src/server/database-config';
import { loadTestEnv } from '../../helpers/test-database';

/** 工作人員桌的 id（src/contracts/entities.ts 的 STAFF_TABLE_ID） */
export const STAFF_TABLE = 0;

export type EmployeeSeed = {
  name: string;
  department: string;
  extension?: string | null;
  team?: string | null;
  /** 員工名單順序；省略時排在最後 */
  sortOrder?: number;
};

export type ParticipantSeed = {
  childSeat?: boolean;
  vegetarian?: boolean;
  note?: string | null;
  /** 1–30 是桌號、0 是工作人員桌、null 是未入座；入座時排在那一桌名單的最後 */
  tableId?: number | null;
};

export type PersonRecord = {
  id: number;
  kind: 'EMPLOYEE' | 'DEPENDENT' | 'GUEST';
  displayName: string;
  employeeId: number | null;
  hostId: number | null;
  relation: string | null;
  organization: string | null;
  childSeat: boolean;
  vegetarian: boolean;
  note: string | null;
  tableId: number | null;
  seatOrder: number | null;
};

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export class PeopleDb {
  constructor(private readonly conn: Connection) {}

  /** 清空員工與參與人員，桌次備註名稱還原（和 tests/helpers/db.ts 的 resetData 相同） */
  async reset(): Promise<void> {
    await this.conn.query('DELETE FROM Participant WHERE hostId IS NOT NULL');
    await this.conn.query('DELETE FROM Participant');
    await this.conn.query('DELETE FROM Employee');
    await this.conn.query('UPDATE SeatTable SET noteName = NULL, updatedAt = NOW(3)');
  }

  /** 新增一位員工（還沒報名），回傳員工 id */
  async employee(e: EmployeeSeed): Promise<number> {
    let sortOrder = e.sortOrder;
    if (sortOrder === undefined) {
      const [row] = await this.conn.query<Row[]>('SELECT COALESCE(MAX(sortOrder), 0) + 1 AS next FROM Employee');
      sortOrder = num(row?.next) ?? 1;
    }
    const res = await this.conn.query<{ insertId: number | bigint }>(
      'INSERT INTO Employee (name, department, team, extension, sortOrder, updatedAt) VALUES (?, ?, ?, ?, ?, NOW(3))',
      [e.name, e.department, e.team ?? null, e.extension ?? null, sortOrder],
    );
    return Number(res.insertId);
  }

  async countAt(tableId: number): Promise<number> {
    const [row] = await this.conn.query<Row[]>('SELECT COUNT(*) AS n FROM Participant WHERE tableId = ?', [tableId]);
    return num(row?.n) ?? 0;
  }

  private async insert(
    data: { kind: PersonRecord['kind']; employeeId?: number; hostId?: number; relation?: string | null; guestName?: string; organization?: string | null } & ParticipantSeed,
  ): Promise<number> {
    const tableId = data.tableId ?? null;
    const seatOrder = tableId === null ? null : await this.countAt(tableId);
    const res = await this.conn.query<{ insertId: number | bigint }>(
      `INSERT INTO Participant
        (kind, employeeId, hostId, relation, guestName, organization, childSeat, vegetarian, note, tableId, seatOrder, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        data.kind,
        data.employeeId ?? null,
        data.hostId ?? null,
        data.relation ?? null,
        data.guestName ?? null,
        data.organization ?? null,
        data.childSeat ?? false,
        data.vegetarian ?? false,
        data.note ?? null,
        tableId,
        seatOrder,
      ],
    );
    return Number(res.insertId);
  }

  /** 員工加入尾牙，回傳參與人員 id */
  register(employeeId: number, p: ParticipantSeed = {}): Promise<number> {
    return this.insert({ kind: 'EMPLOYEE', employeeId, ...p });
  }

  /** 新增員工並加入尾牙 */
  async registerNew(e: EmployeeSeed, p: ParticipantSeed = {}): Promise<{ employeeId: number; participantId: number }> {
    const employeeId = await this.employee(e);
    return { employeeId, participantId: await this.register(employeeId, p) };
  }

  /** 新增一位眷屬，回傳參與人員 id */
  dependent(hostId: number, p: ParticipantSeed & { relation?: string | null } = {}): Promise<number> {
    return this.insert({ kind: 'DEPENDENT', hostId, ...p });
  }

  /** 新增一位外部貴賓，回傳參與人員 id */
  guest(guestName: string, p: ParticipantSeed & { organization?: string | null } = {}): Promise<number> {
    return this.insert({ kind: 'GUEST', guestName, ...p });
  }

  /** 新增 count 位外部貴賓（依序新增，名稱 `${prefix}${序號}`），可指定桌次 */
  async guests(count: number, prefix: string, tableId: number | null = null): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 1; i <= count; i++) ids.push(await this.guest(`${prefix}${i}`, { tableId }));
    return ids;
  }

  /** 讓這一桌多 count 位外部貴賓（名稱「佔位貴賓{桌號}-{序號}」） */
  fillTable(tableId: number, count: number): Promise<number[]> {
    return this.guests(count, `佔位貴賓${tableId}-`, tableId);
  }

  /** 工作人員桌多 count 位已報名的員工（總務部，名稱「工作人員{序號}」），回傳參與人員 id */
  async fillStaff(count: number): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 1; i <= count; i++) {
      const { participantId } = await this.registerNew({ name: `工作人員${i}`, department: '總務部' }, { tableId: STAFF_TABLE });
      ids.push(participantId);
    }
    return ids;
  }

  async updateEmployee(id: number, data: Partial<Pick<EmployeeSeed, 'name' | 'department' | 'extension'>>): Promise<void> {
    for (const [column, value] of Object.entries(data)) {
      await this.conn.query(`UPDATE Employee SET \`${column}\` = ?, updatedAt = NOW(3) WHERE id = ?`, [value ?? null, id]);
    }
  }

  /** 刪除員工（外鍵連動刪除他的報名與眷屬） */
  async deleteEmployee(id: number): Promise<void> {
    await this.conn.query('DELETE FROM Employee WHERE id = ?', [id]);
  }

  /** 全部參與人員（含顯示名稱：員工是姓名、眷屬是「{員工姓名}_眷屬」、外部貴賓是姓名） */
  async people(): Promise<PersonRecord[]> {
    const rows = await this.conn.query<Row[]>(
      `SELECT p.id, p.kind, p.employeeId, p.hostId, p.relation, p.guestName, p.organization, p.childSeat, p.vegetarian,
              p.note, p.tableId, p.seatOrder, e.name AS employeeName, he.name AS hostName
         FROM Participant p
         LEFT JOIN Employee e ON e.id = p.employeeId
         LEFT JOIN Participant h ON h.id = p.hostId
         LEFT JOIN Employee he ON he.id = h.employeeId
        ORDER BY p.id`,
    );
    return rows.map((r) => {
      const kind = String(r.kind) as PersonRecord['kind'];
      const displayName =
        kind === 'EMPLOYEE' ? (str(r.employeeName) ?? '') : kind === 'DEPENDENT' ? `${str(r.hostName) ?? ''}_眷屬` : (str(r.guestName) ?? '');
      return {
        id: Number(r.id),
        kind,
        displayName,
        employeeId: num(r.employeeId),
        hostId: num(r.hostId),
        relation: str(r.relation),
        organization: str(r.organization),
        childSeat: Boolean(Number(r.childSeat)),
        vegetarian: Boolean(Number(r.vegetarian)),
        note: str(r.note),
        tableId: num(r.tableId),
        seatOrder: num(r.seatOrder),
      };
    });
  }

  /** 依顯示名稱找一位參與人員；沒有時是 undefined */
  async find(displayName: string): Promise<PersonRecord | undefined> {
    return (await this.people()).find((p) => p.displayName === displayName);
  }

  /** 這一桌的名單（顯示名稱，依桌內順序） */
  async seatedNames(tableId: number): Promise<string[]> {
    return (await this.people())
      .filter((p) => p.tableId === tableId)
      .sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0))
      .map((p) => p.displayName);
  }

  async participantCount(): Promise<number> {
    const [row] = await this.conn.query<Row[]>('SELECT COUNT(*) AS n FROM Participant');
    return num(row?.n) ?? 0;
  }

  /** 員工名單上有沒有這個名字的員工 */
  async hasEmployee(name: string): Promise<boolean> {
    const [row] = await this.conn.query<Row[]>('SELECT COUNT(*) AS n FROM Employee WHERE name = ?', [name]);
    return (num(row?.n) ?? 0) > 0;
  }
}

async function connect(): Promise<Connection> {
  const name = loadTestEnv();
  const cfg = databaseConfigFromEnv(process.env, name);
  return createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
    allowPublicKeyRetrieval: !cfg.ssl,
  });
}

/** 開一條連線做事，做完就關 */
export async function withDb<T>(fn: (db: PeopleDb) => Promise<T>): Promise<T> {
  const conn = await connect();
  try {
    return await fn(new PeopleDb(conn));
  } finally {
    await conn.end();
  }
}

/** 示範資料的三位員工（都還沒報名）：王小明（研發一部，1234）、李美華（業務部，5678）、陳大文（研發一部，沒有分機） */
export async function demoEmployees(db: PeopleDb) {
  const wang = await db.employee({ name: '王小明', department: '研發一部', extension: '1234' });
  const lee = await db.employee({ name: '李美華', department: '業務部', extension: '5678' });
  const chen = await db.employee({ name: '陳大文', department: '研發一部' });
  return { wang, lee, chen };
}
