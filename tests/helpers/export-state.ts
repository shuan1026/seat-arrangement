// 匯出座位表測試的資料建構（docs/spec/export.md 第 5.1 節「資料甲」與各驗收條件的資料）。
// 姓名都是規格裡的虛構示範資料，或「員1」「未1」這類代號。員工名單依加入的先後；外部貴賓依加入的先後新增（createdAt）。
import {
  STAFF_TABLE_ID,
  TABLE_COUNT,
  type AppState,
  type Employee,
  type Participant,
  type SeatTable,
} from '@/contracts/entities';

type Marks = { childSeat?: boolean; vegetarian?: boolean };

const BLANK: Omit<Participant, 'id' | 'kind' | 'createdAt'> = {
  employeeId: null,
  hostId: null,
  relation: null,
  guestName: null,
  organization: null,
  title: null,
  childSeat: false,
  vegetarian: false,
  note: null,
  tableId: null,
  seatOrder: null,
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class SheetData {
  readonly employees: Employee[] = [];
  readonly participants: Participant[] = [];
  readonly tables: SeatTable[] = [
    { id: STAFF_TABLE_ID, kind: 'STAFF', noteName: null },
    ...Array.from({ length: TABLE_COUNT }, (_, i): SeatTable => ({ id: i + 1, kind: 'NORMAL', noteName: null })),
  ];
  private readonly byName = new Map<string, Participant>();
  private employeeSeq = 0;
  private participantSeq = 0;

  /** 加一位員工，排在員工名單最後；預設已報名、未入座 */
  employee(
    name: string,
    department: string,
    opts: Marks & { team?: string | null; extension?: string | null; registered?: boolean } = {},
  ): this {
    this.employeeSeq += 1;
    const id = 100 + this.employeeSeq;
    this.employees.push({
      id,
      name,
      englishName: null,
      department,
      team: opts.team ?? null,
      extension: opts.extension ?? null,
      region: null,
      office: null,
      note: null,
      sortOrder: this.employeeSeq * 10,
    });
    if (opts.registered !== false) {
      this.add(name, { kind: 'EMPLOYEE', employeeId: id, childSeat: !!opts.childSeat, vegetarian: !!opts.vegetarian });
    }
    return this;
  }

  /** 加一位眷屬，顯示名稱是「{員工姓名}_眷屬」 */
  dependent(hostName: string, opts: Marks = {}): this {
    const host = this.get(hostName);
    this.add(`${hostName}_眷屬`, {
      kind: 'DEPENDENT',
      hostId: host.id,
      relation: '配偶',
      childSeat: !!opts.childSeat,
      vegetarian: !!opts.vegetarian,
    });
    return this;
  }

  /** 加一位外部貴賓；createdAt 可以指定新增的時間 */
  guest(name: string, opts: Marks & { createdAt?: string } = {}): this {
    this.add(
      name,
      { kind: 'GUEST', guestName: name, organization: '測試科技', childSeat: !!opts.childSeat, vegetarian: !!opts.vegetarian },
      opts.createdAt,
    );
    return this;
  }

  /** 第 n 桌依序再坐這些人，接在原本的人後面；離開的桌其他人依原本的順序往前補（SEAT-R06） */
  seat(tableId: number, names: readonly string[]): this {
    for (const name of names) {
      const p = this.get(name);
      const from = p.tableId;
      p.seatOrder = this.participants.filter((x) => x.tableId === tableId && x !== p).length;
      p.tableId = tableId;
      if (from !== null && from !== tableId) this.compact(from);
    }
    return this;
  }

  /** 放進工作人員桌（只有員工可以是工作人員，PPL-R10） */
  staff(names: readonly string[]): this {
    return this.seat(STAFF_TABLE_ID, names);
  }

  /** 移出桌次，變成未入座 */
  unseat(names: readonly string[]): this {
    for (const name of names) {
      const p = this.get(name);
      const from = p.tableId;
      p.tableId = null;
      p.seatOrder = null;
      if (from !== null) this.compact(from);
    }
    return this;
  }

  note(tableId: number, noteName: string): this {
    const t = this.tables.find((x) => x.id === tableId);
    if (!t) throw new Error(`沒有第 ${tableId} 桌`);
    t.noteName = noteName;
    return this;
  }

  get(name: string): Participant {
    const p = this.byName.get(name);
    if (!p) throw new Error(`測試資料沒有「${name}」`);
    return p;
  }

  /** 傳給 buildSeatingSheet 的資料（複本）；reversed 把每個陣列倒過來 */
  state(opts: { reversed?: boolean } = {}): AppState {
    const s: AppState = { employees: clone(this.employees), participants: clone(this.participants), tables: clone(this.tables) };
    if (opts.reversed) {
      s.employees.reverse();
      s.participants.reverse();
      s.tables.reverse();
    }
    return s;
  }

  private add(name: string, data: Partial<Participant> & Pick<Participant, 'kind'>, createdAt?: string): Participant {
    if (this.byName.has(name)) throw new Error(`測試資料的姓名重複：${name}`);
    this.participantSeq += 1;
    const p: Participant = {
      ...BLANK,
      id: 1000 + this.participantSeq,
      createdAt: createdAt ?? new Date(Date.UTC(2026, 9, 1) + this.participantSeq * 60_000).toISOString(),
      ...data,
    };
    this.participants.push(p);
    this.byName.set(name, p);
    return p;
  }

  private compact(tableId: number): void {
    this.participants
      .filter((x) => x.tableId === tableId)
      .sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0))
      .forEach((x, i) => {
        x.seatOrder = i;
      });
  }
}

/**
 * 資料甲（export.md 第 5.1 節）：
 * 員工名單依序王大同、李小華（總經理室）、陳志明、林美玲（業務部）、張家豪（研發部）；陳志明的眷屬需要兒童椅；
 * 外部貴賓周董事（兒童椅、素食）、吳協理；林美玲素食；張家豪是工作人員；
 * 第 1 桌「主桌」王大同、李小華、周董事；第 5 桌陳志明、陳志明_眷屬、林美玲；第 17 桌「供應商」沒有人；第 22 桌「客戶貴賓」吳協理。
 */
export function sampleA(): SheetData {
  return new SheetData()
    .employee('王大同', '總經理室')
    .employee('李小華', '總經理室')
    .employee('陳志明', '業務部')
    .employee('林美玲', '業務部', { vegetarian: true })
    .employee('張家豪', '研發部')
    .dependent('陳志明', { childSeat: true })
    .guest('周董事', { childSeat: true, vegetarian: true })
    .guest('吳協理')
    .staff(['張家豪'])
    .note(1, '主桌')
    .seat(1, ['王大同', '李小華', '周董事'])
    .seat(5, ['陳志明', '陳志明_眷屬', '林美玲'])
    .note(17, '供應商')
    .note(22, '客戶貴賓')
    .seat(22, ['吳協理']);
}
