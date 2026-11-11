// 自動排座測試的資料建構與結果檢查（docs/spec/auto-arrange.md）。
// 寫法對照規格第 5.1 節：姓名都是虛構的；員工名單依加入的先後；眷屬的顯示名稱是「{員工姓名}_眷屬」；
// 沒有特別設定的：列出的人都已報名、都未入座；30 桌都沒有備註名稱、都是空桌；沒有工作人員。
// 每次執行 autoArrange 都另外檢查各條規則共同的不變條件（checkInvariants），個別測試只寫該驗收條件的預期結果。
//
// 受測介面（src/domain/auto-arrange.ts）：
//   autoArrange({ employees, participants, tables, mode }) → { changes, summary }
//   - 純函式；changes 只列位置有改變的人，tableId 為 null 表示回到未入座；seatOrder 0 起算（prisma/schema.prisma）。
//   - summary 是 src/contracts/seating.ts 的 AutoArrangeSummary：placed 排進桌次的人數、tableIds 有排進人的桌（桌子的 id，依所在位置由小到大）、
//     left 空位不夠留在未入座的人數。Sonner 的 {k} 是 tableIds 的個數（ARR-R14，D-019）。
// 桌子與位置分開（D-027）：tables 的每一張桌帶 position（1–30 是位置，null 是暫存區）。沒有特別設定時 30 個位置都有桌，
// 1–30 桌在同號的位置，所以填桌順序就是位置編號的順序（auto-arrange.md「填桌順序」：1 = B1、2 = A1、3 = B4…30 = A13）。
// 可用的桌是場上、沒有備註名稱的桌（ARR-R02）：暫存區的桌與「未放桌」的位置都不用；暫存的桌上的人不是候選人，也不動（ARR-R03、R04、R12）。
// 規格寫的桌號換成位置編號見 tests/helpers/table-codes.ts。
import { expect } from 'vitest';
import {
  STAFF_TABLE_ID,
  TABLE_CAPACITY,
  TABLE_COUNT,
  type Employee,
  type Participant,
  type SeatTable,
} from '@/contracts/entities';
import type { AutoArrangeSummary } from '@/contracts/seating';
import { autoArrange } from '@/domain/auto-arrange';
import { TABLE_CODE_BY_ID } from './table-codes';

export type ArrangeMode = 'unseatedOnly' | 'rebuild';
export const ARRANGE_MODES: readonly ArrangeMode[] = ['unseatedOnly', 'rebuild'];

export type Position = { tableId: number | null; seatOrder: number | null };
export type ArrangeChange = { participantId: number; tableId: number | null; seatOrder: number | null };

/** 失敗訊息用：id 3 →「B4 桌（3）」；不是 1–30 時寫 id */
const tableLabel = (id: number): string => {
  const code = TABLE_CODE_BY_ID.get(id);
  return code ? `${code} 桌（${id}）` : `id ${id} 的桌`;
};

/** 場上的一般桌（放在位置上） */
const isPlaced = (t: SeatTable): boolean => t.kind === 'NORMAL' && t.position !== null;

/** 「業1–業7」→ ['業1', '業2', …, '業7'] */
export const range = (prefix: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

/** 眷屬的顯示名稱「{員工姓名}_眷屬」 */
export const dep = (employeeName: string): string => `${employeeName}_眷屬`;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

export class Scenario {
  readonly employees: Employee[] = [];
  readonly participants: Participant[] = [];
  readonly tables: SeatTable[] = [
    { id: STAFF_TABLE_ID, kind: 'STAFF', position: null, stagedAt: null, noteName: null },
    ...Array.from({ length: TABLE_COUNT }, (_, i): SeatTable => ({ id: i + 1, kind: 'NORMAL', position: i + 1, stagedAt: null, noteName: null })),
  ];
  private stagedSeq = 0;
  private readonly byName = new Map<string, Participant>();
  private readonly nameById = new Map<number, string>();
  private employeeSeq = 0;
  private participantSeq = 1000;

  /** 加一位員工，排在員工名單最後。預設已報名、未入座；dependent 為 true 時同時加一位眷屬。 */
  addEmployee(
    name: string,
    department: string,
    team: string | null = null,
    opts: { dependent?: boolean; registered?: boolean } = {},
  ): this {
    this.employeeSeq += 1;
    const employeeId = this.employeeSeq;
    // 員工名單順序是 sortOrder（EMP-R07）；刻意不連續，id 也不等於順序
    this.employees.push({
      id: employeeId + 500,
      name,
      englishName: null,
      department,
      team,
      extension: null,
      region: null,
      office: null,
      note: null,
      declined: false,
      sortOrder: employeeId * 10,
    });
    if (opts.registered === false) return this;
    const host = this.addParticipant(name, { kind: 'EMPLOYEE', employeeId: employeeId + 500 });
    if (opts.dependent) this.addParticipant(dep(name), { kind: 'DEPENDENT', hostId: host.id, relation: '配偶' });
    return this;
  }

  /** 同部門、同組別的多位員工，依陣列順序加入員工名單；withDependent 是帶眷屬的人 */
  addGroup(department: string, team: string | null, names: readonly string[], withDependent: readonly string[] = []): this {
    for (const name of names) this.addEmployee(name, department, team, { dependent: withDependent.includes(name) });
    return this;
  }

  addGuest(name: string): this {
    this.addParticipant(name, { kind: 'GUEST', guestName: name });
    return this;
  }

  /** 內部編號 tableId 的桌依序再坐這些人，接在這一桌原本的人後面（座位順序 0 起算） */
  seat(tableId: number, names: readonly string[]): this {
    for (const name of names) {
      const p = this.get(name);
      const from = p.tableId;
      const start = this.participants.filter((x) => x.tableId === tableId && x !== p).length;
      p.tableId = tableId;
      p.seatOrder = start;
      if (from !== null && from !== tableId) this.compact(from);
    }
    return this;
  }

  /** 放進工作人員桌 */
  staff(names: readonly string[]): this {
    return this.seat(STAFF_TABLE_ID, names);
  }

  note(tableId: number, noteName: string): this {
    this.table(tableId).noteName = noteName;
    return this;
  }

  /** 刪掉這張桌（桌上不能有人）：它的位置變成「未放桌」（D-027） */
  removeTable(tableId: number): this {
    if (this.participants.some((p) => p.tableId === tableId)) throw new Error(`id ${tableId} 的桌上還有人`);
    const i = this.tables.findIndex((x) => x.id === tableId);
    if (i < 0) throw new Error(`沒有 id ${tableId} 的桌`);
    this.tables.splice(i, 1);
    return this;
  }

  /** 把這張桌移到暫存區（依呼叫順序排在暫存區最下面）；原位置變成「未放桌」 */
  stage(tableId: number): this {
    const t = this.table(tableId);
    this.stagedSeq += 1;
    t.position = null;
    t.stagedAt = new Date(Date.UTC(2026, 9, 1, 0, this.stagedSeq)).toISOString();
    return this;
  }

  /** 新增一張暫存的桌（id 31 起），回傳 this；之後用 seat(id, …) 放人（測試資料用，畫面上人不能放進暫存的桌） */
  addStagedTable(id: number, noteName: string | null = null): this {
    if (this.tables.some((x) => x.id === id)) throw new Error(`id ${id} 的桌已經有了`);
    this.stagedSeq += 1;
    this.tables.push({ id, kind: 'NORMAL', position: null, stagedAt: new Date(Date.UTC(2026, 9, 1, 0, this.stagedSeq)).toISOString(), noteName });
    return this;
  }

  /** 把這張桌放到位置 position（那個位置要是「未放桌」） */
  place(tableId: number, position: number): this {
    if (this.tables.some((x) => x.kind === 'NORMAL' && x.position === position)) throw new Error(`位置 ${position} 已有桌`);
    const t = this.table(tableId);
    t.position = position;
    t.stagedAt = null;
    return this;
  }

  private table(tableId: number): SeatTable {
    const t = this.tables.find((x) => x.id === tableId);
    if (!t) throw new Error(`沒有 id ${tableId} 的桌次`);
    return t;
  }

  get(name: string): Participant {
    const p = this.byName.get(name);
    if (!p) throw new Error(`測試資料沒有「${name}」`);
    return p;
  }

  id(name: string): number {
    return this.get(name).id;
  }

  nameOf(id: number): string {
    return this.nameById.get(id) ?? `#${id}`;
  }

  /** 執行自動排座並檢查共同的不變條件。reversedInput：把員工、參與人員、桌次的陣列倒過來傳入 */
  run(mode: ArrangeMode, opts: { reversedInput?: boolean } = {}): Outcome {
    const input = {
      employees: clone(this.employees),
      participants: clone(this.participants),
      tables: clone(this.tables),
      mode,
    };
    if (opts.reversedInput) {
      input.employees.reverse();
      input.participants.reverse();
      input.tables.reverse();
    }
    const before = clone(input);
    const result = autoArrange(input);
    expect(input, '自動排座是純函式，不改傳入的資料').toEqual(before);
    const outcome = new Outcome(this, mode, result.changes, result.summary);
    checkInvariants(this, outcome);
    return outcome;
  }

  private addParticipant(name: string, data: Partial<Participant> & Pick<Participant, 'kind'>): Participant {
    if (this.byName.has(name)) throw new Error(`測試資料的姓名重複：${name}`);
    this.participantSeq += 1;
    const p: Participant = {
      ...BLANK,
      id: this.participantSeq,
      createdAt: new Date(Date.UTC(2026, 9, 1) + this.participantSeq * 1000).toISOString(),
      ...data,
    };
    this.participants.push(p);
    this.byName.set(name, p);
    this.nameById.set(p.id, name);
    return p;
  }

  /** 有人離開後，這一桌其他人依原本的順序往前補（SEAT-R06） */
  private compact(tableId: number): void {
    this.participants
      .filter((x) => x.tableId === tableId)
      .sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0))
      .forEach((x, i) => {
        x.seatOrder = i;
      });
  }
}

/** 自動排座的結果：原本的位置套上 changes 之後的樣子 */
export class Outcome {
  readonly final: ReadonlyMap<number, Position>;

  constructor(
    readonly scenario: Scenario,
    readonly mode: ArrangeMode,
    readonly changes: readonly ArrangeChange[],
    readonly summary: AutoArrangeSummary,
  ) {
    const final = new Map<number, Position>(
      scenario.participants.map((p) => [p.id, { tableId: p.tableId, seatOrder: p.seatOrder }]),
    );
    for (const c of changes) final.set(c.participantId, { tableId: c.tableId, seatOrder: c.seatOrder });
    this.final = final;
  }

  /** 內部編號 tableId 那一桌依座位順序的顯示名稱（名單長度就是人數，後面的位子是空位） */
  table(tableId: number): string[] {
    return [...this.final.entries()]
      .filter(([, pos]) => pos.tableId === tableId)
      .sort((a, b) => (a[1].seatOrder ?? 0) - (b[1].seatOrder ?? 0))
      .map(([id]) => this.scenario.nameOf(id));
  }

  position(name: string): Position {
    const pos = this.final.get(this.scenario.id(name));
    if (!pos) throw new Error(`結果裡沒有「${name}」`);
    return pos;
  }

  /** 未入座的人（不含工作人員），依加入資料的先後 */
  unseated(): string[] {
    return this.scenario.participants
      .filter((p) => this.final.get(p.id)?.tableId === null)
      .map((p) => this.scenario.nameOf(p.id));
  }

  /** changes 裡的人，依加入資料的先後 */
  changedNames(): string[] {
    const ids = new Set(this.changes.map((c) => c.participantId));
    return this.scenario.participants.filter((p) => ids.has(p.id)).map((p) => this.scenario.nameOf(p.id));
  }
}

/**
 * 每次自動排座都要成立的條件：
 * - changes 只列位置有改變的人，每人最多一筆（介面約定）
 * - 工作人員、有備註名稱的桌上的人、暫存的桌上的人都不動；只排進可用的桌（場上、沒有備註名稱，ARR-R01、ARR-R02、ARR-R12、D-027）
 * - 外部貴賓一律不排；只排未入座時已入座的人與外部貴賓都不動（ARR-R01、ARR-R03）
 * - 清空後重排有排進人時，原本坐在可用桌的外部貴賓回到未入座（ARR-R04）
 * - 自動排座每桌最多排到 10 人（ARR-R17）：有排進人的桌、清空後重排的可用桌最後最多 10 人；
 *   其他桌（例如有備註名稱的桌、只排未入座時已有 10 位以上的桌）人數不增加，原本 11、12 位的照舊（D-018）。
 *   座位順序從 0 起連續（SEAT-R06）
 * - 眷屬和所屬員工都是候選人時，一定同桌、緊接在員工後面，或一起留在未入座（ARR-R05 ④、ARR-R09、D-009）
 * - 摘要：排進的人數、有排進人的桌（內部編號，由小到大；個數是 Sonner 的 {k}）、排不下的人數（ARR-R11、ARR-R14、ARR-R15）
 * - 一位都沒排進去時座位都不變，清空後重排也不清空（ARR-Q02 的目前假設）
 */
export function checkInvariants(s: Scenario, o: Outcome): void {
  // 可用的桌：場上、沒有備註名稱（ARR-R02，D-027）；暫存的桌與有備註名稱的桌都不動
  const usable = new Set(s.tables.filter((t) => isPlaced(t) && t.noteName === null).map((t) => t.id));
  const noteTables = new Set(s.tables.filter((t) => isPlaced(t) && t.noteName !== null).map((t) => t.id));
  const stagedTables = new Set(s.tables.filter((t) => t.kind === 'NORMAL' && t.position === null).map((t) => t.id));
  const positionOfTable = new Map(s.tables.map((t) => [t.id, t.position ?? 0]));
  const original = new Map(s.participants.map((p) => [p.id, p]));

  const ids = o.changes.map((c) => c.participantId);
  expect(new Set(ids).size, 'changes 每人最多一筆').toBe(ids.length);

  for (const c of o.changes) {
    const p = original.get(c.participantId);
    expect(p, `changes 裡的 ${c.participantId} 不是參與人員`).toBeDefined();
    if (!p) continue;
    const who = s.nameOf(p.id);
    expect(c.tableId === p.tableId && c.seatOrder === p.seatOrder, `${who} 的位置沒變，不該列在 changes`).toBe(false);
    expect(c.tableId === null, `${who} 的桌號與座位順序要同時有值或同時為 null`).toBe(c.seatOrder === null);
    expect(p.tableId === STAFF_TABLE_ID, `${who} 是工作人員，不該被移動`).toBe(false);
    expect(p.tableId !== null && noteTables.has(p.tableId), `${who} 坐在有備註名稱的桌，不該被移動`).toBe(false);
    expect(p.tableId !== null && stagedTables.has(p.tableId), `${who} 坐在暫存的桌，不該被移動（ARR-R03、R04、D-027）`).toBe(false);
    if (c.tableId !== null) expect(usable.has(c.tableId), `${who} 被排進 ${tableLabel(c.tableId)}，不是可用的桌`).toBe(true);
    if (p.kind === 'GUEST') {
      expect(c.tableId, `外部貴賓 ${who} 不會被排進桌次`).toBeNull();
      expect(o.mode, `只排未入座時外部貴賓 ${who} 不動`).toBe('rebuild');
    }
    if (o.mode === 'unseatedOnly') expect(p.tableId, `只排未入座時已入座的 ${who} 不動`).toBeNull();
  }

  const isCandidate = (p: Participant) =>
    p.kind !== 'GUEST' && (p.tableId === null || (o.mode === 'rebuild' && usable.has(p.tableId)));
  const candidates = s.participants.filter(isCandidate);
  const placed = candidates.filter((p) => o.final.get(p.id)?.tableId != null);

  for (const { id } of s.tables.filter((t) => t.kind === 'NORMAL')) {
    const orders = [...o.final.values()]
      .filter((pos) => pos.tableId === id)
      .map((pos) => pos.seatOrder ?? -1)
      .sort((a, b) => a - b);
    const beforeCount = s.participants.filter((p) => p.tableId === id).length;
    const gained = [...o.final.entries()].some(([pid, pos]) => pos.tableId === id && original.get(pid)?.tableId !== id);
    const rebuilt = o.mode === 'rebuild' && usable.has(id) && placed.length > 0;
    if (gained || rebuilt) {
      expect(orders.length, `${tableLabel(id)}排到超過 ${TABLE_CAPACITY} 人（ARR-R17）`).toBeLessThanOrEqual(TABLE_CAPACITY);
    } else {
      expect(orders.length, `${tableLabel(id)}沒有排進人，人數不該增加`).toBeLessThanOrEqual(beforeCount);
    }
    expect(orders, `${tableLabel(id)}的座位順序要從 0 起連續`).toEqual(orders.map((_, i) => i));
  }
  const tablesUsed = [...new Set(placed.map((p) => o.final.get(p.id)?.tableId ?? 0))].sort(
    (a, b) => (positionOfTable.get(a) ?? 0) - (positionOfTable.get(b) ?? 0),
  );
  expect(o.summary.placed, '摘要：這一次排進桌次的人數').toBe(placed.length);
  expect(o.summary.left, '摘要：排不下、留在未入座的人數').toBe(candidates.length - placed.length);
  expect(o.summary.tableIds, '摘要：有排進人的桌（桌子的 id），依所在位置由小到大').toEqual(tablesUsed);

  if (placed.length === 0) {
    expect(o.changes, '一位都沒排進去時座位都不變（ARR-Q02）').toEqual([]);
  } else if (o.mode === 'rebuild') {
    for (const p of s.participants) {
      if (p.kind === 'GUEST' && p.tableId !== null && usable.has(p.tableId)) {
        expect(o.final.get(p.id)?.tableId, `原本坐在 ${tableLabel(p.tableId)}的外部貴賓 ${s.nameOf(p.id)} 回到未入座`).toBeNull();
      }
    }
  }

  for (const d of candidates) {
    if (d.kind !== 'DEPENDENT' || d.hostId === null) continue;
    const host = original.get(d.hostId);
    if (!host || !isCandidate(host)) continue;
    const hp = o.final.get(host.id);
    const dp = o.final.get(d.id);
    const who = s.nameOf(d.id);
    if (hp?.tableId == null) {
      expect(dp?.tableId, `${s.nameOf(host.id)} 沒排進去時 ${who} 也留在未入座`).toBeNull();
      continue;
    }
    expect(dp?.tableId, `${who} 和所屬員工同桌`).toBe(hp.tableId);
    expect(dp?.seatOrder, `${who} 緊接在所屬員工後面`).toBe((hp.seatOrder ?? 0) + 1);
  }
}
