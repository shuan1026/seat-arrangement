// 座位異動指令的業務規則（docs/spec/seating.md 第 3 節；docs/architecture.md 第 7.2、8.1、11.3 節）。
// 前端（樂觀更新、事先擋下已滿的桌）與後端（交易內驗證並寫入）共用同一份純函式，不碰資料庫與畫面。
// - 一般桌的名單是有順序的清單，seatOrder 一律是 0..n-1 連續；有人離開時後面的人往前補（SEAT-R06、SEAT-Q01）。
// - 工作人員桌的順序不規定（SEAT-R34 依參與人員的預設排序顯示），新放進來的人接在最後。
// - undo 由操作前後的差異算出：只列位置有改變的人、備註名稱有改變的桌，值是操作前的狀態。
// - 每桌（含工作人員桌）標準 10 位、最多 12 位（SEAT-R02、SEAT-R88、D-018）：seat、seatMany 帶 allowOverflow（拖移、「加入人員」）
//   時上限 12 位，超過回 TABLE_LIMIT／STAFF_TABLE_LIMIT；不帶時（選擇桌次對話框）上限 10 位，回 TABLE_FULL／STAFF_TABLE_FULL。
//   restore、swap 上限 12 位。
import {
  STAFF_TABLE_CAPACITY,
  STAFF_TABLE_ID,
  TABLE_CAPACITY,
  TABLE_COUNT,
  type Participant,
  type SeatTable,
} from '@/contracts/entities';
import { TABLE_MAX_SEATS, type SeatingOperation, type SeatingSnapshot } from '@/contracts/seating';

export type SeatingData = { participants: Participant[]; tables: SeatTable[] };
export type SeatingViolation =
  /** 一般桌到 10 位（不帶 allowOverflow 的 seat、seatMany） */
  | 'TABLE_FULL'
  /** 一般桌到 12 位（帶 allowOverflow 的 seat、seatMany；restore） */
  | 'TABLE_LIMIT'
  /** 工作人員桌到 10 位（不帶 allowOverflow） */
  | 'STAFF_TABLE_FULL'
  /** 工作人員桌到 12 位（帶 allowOverflow；restore） */
  | 'STAFF_TABLE_LIMIT'
  | 'STAFF_EMPLOYEE_ONLY'
  | 'NOT_FOUND'
  | 'CONFLICT';
export type SeatingRuleResult =
  | { ok: true; data: SeatingData; undo: SeatingSnapshot }
  | { ok: false; violation: SeatingViolation };

/** 自動排座（autoArrange）不在這裡處理：伺服器用 src/domain/auto-arrange.ts 排座（src/server/services/seating.ts） */
export type RuleOperation = Exclude<SeatingOperation, { type: 'autoArrange' }>;

type Position = { tableId: number | null; seatOrder: number | null };

const isNormalTable = (tableId: number | null): tableId is number => tableId !== null && tableId >= 1 && tableId <= TABLE_COUNT;

/** 一桌的名單（依座號；座號相同時依 id），回傳參與人員 id */
export function rosterOf(participants: readonly Participant[], tableId: number): number[] {
  return participants
    .filter((p) => p.tableId === tableId)
    .sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0) || a.id - b.id)
    .map((p) => p.id);
}

/** 執行中的指令：在一份位置表上改，最後和操作前比對 */
class Draft {
  readonly pos = new Map<number, Position>();
  readonly notes = new Map<number, string | null>();
  readonly byId: Map<number, Participant>;

  constructor(readonly before: SeatingData) {
    this.byId = new Map(before.participants.map((p) => [p.id, p]));
    for (const p of before.participants) this.pos.set(p.id, { tableId: p.tableId, seatOrder: p.seatOrder });
    for (const t of before.tables) this.notes.set(t.id, t.noteName);
  }

  /** 目前（改到一半）的名單，依座號 */
  roster(tableId: number): number[] {
    return [...this.pos.entries()]
      .filter(([, p]) => p.tableId === tableId)
      .sort(([ia, a], [ib, b]) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0) || ia - ib)
      .map(([id]) => id);
  }

  /** 一般桌：照給定的順序寫成 0..n-1 */
  setRoster(tableId: number, ids: readonly number[]) {
    ids.forEach((id, i) => this.pos.set(id, { tableId, seatOrder: i }));
  }

  /** 離開目前所在的桌；一般桌其他人往前補（SEAT-R06） */
  leave(id: number) {
    const from = this.pos.get(id)?.tableId ?? null;
    this.pos.set(id, { tableId: null, seatOrder: null });
    if (isNormalTable(from)) this.setRoster(from, this.roster(from));
  }

  /** 放進工作人員桌，接在最後 */
  joinStaff(id: number) {
    const orders = [...this.pos.values()].filter((p) => p.tableId === STAFF_TABLE_ID).map((p) => p.seatOrder ?? 0);
    this.pos.set(id, { tableId: STAFF_TABLE_ID, seatOrder: orders.length ? Math.max(...orders) + 1 : 0 });
  }

  result(): Extract<SeatingRuleResult, { ok: true }> {
    const undo: SeatingSnapshot = { participants: [], tables: [] };
    const participants = this.before.participants.map((p) => {
      const next = this.pos.get(p.id)!;
      if (next.tableId === p.tableId && next.seatOrder === p.seatOrder) return p;
      undo.participants.push({ id: p.id, tableId: p.tableId, seatOrder: p.seatOrder });
      return { ...p, tableId: next.tableId, seatOrder: next.seatOrder };
    });
    const tables = this.before.tables.map((t) => {
      const noteName = this.notes.get(t.id) ?? null;
      if (noteName === t.noteName) return t;
      undo.tables.push({ id: t.id, noteName: t.noteName });
      return { ...t, noteName };
    });
    return { ok: true, data: { participants, tables }, undo };
  }
}

const fail = (violation: SeatingViolation): SeatingRuleResult => ({ ok: false, violation });

export function applySeatingOperation(data: SeatingData, op: RuleOperation): SeatingRuleResult {
  const d = new Draft(data);
  switch (op.type) {
    case 'seat':
      return seat(d, op.participantId, op.tableId, op.index, op.allowOverflow === true);
    case 'seatMany':
      return seatMany(d, op.tableId, op.participantIds, op.allowOverflow === true);
    case 'unseat': {
      if (!d.byId.has(op.participantId)) return fail('NOT_FOUND');
      if (d.pos.get(op.participantId)!.tableId !== null) d.leave(op.participantId);
      return d.result();
    }
    case 'reorder': {
      const current = d.roster(op.tableId);
      const next = op.participantIds;
      const same =
        next.length === current.length && new Set(next).size === next.length && next.every((id) => current.includes(id));
      if (!same) return fail('CONFLICT');
      d.setRoster(op.tableId, next);
      return d.result();
    }
    case 'clear': {
      for (const id of d.roster(op.tableId)) d.pos.set(id, { tableId: null, seatOrder: null });
      return d.result();
    }
    case 'swap': {
      if (op.tableA === op.tableB) return d.result();
      const a = d.roster(op.tableA);
      const b = d.roster(op.tableB);
      d.setRoster(op.tableB, a);
      d.setRoster(op.tableA, b);
      const noteA = d.notes.get(op.tableA) ?? null;
      d.notes.set(op.tableA, d.notes.get(op.tableB) ?? null);
      d.notes.set(op.tableB, noteA);
      return d.result();
    }
    case 'restore':
      return restore(d, op.snapshot);
  }
}

/** 這一桌最多能放幾位、超過時回哪個違規：帶 allowOverflow 時 12 位，不帶時 10 位 */
function capacity(tableId: number, allowOverflow: boolean): { max: number; violation: SeatingViolation } {
  const staff = tableId === STAFF_TABLE_ID;
  if (allowOverflow) return { max: TABLE_MAX_SEATS, violation: staff ? 'STAFF_TABLE_LIMIT' : 'TABLE_LIMIT' };
  return staff
    ? { max: STAFF_TABLE_CAPACITY, violation: 'STAFF_TABLE_FULL' }
    : { max: TABLE_CAPACITY, violation: 'TABLE_FULL' };
}

function seat(d: Draft, participantId: number, tableId: number, index: number | undefined, allowOverflow: boolean): SeatingRuleResult {
  const person = d.byId.get(participantId);
  if (!person) return fail('NOT_FOUND');
  const from = d.pos.get(participantId)!.tableId;
  const cap = capacity(tableId, allowOverflow);

  if (tableId === STAFF_TABLE_ID) {
    // 已經是工作人員：沒有作用（SEAT-R51）
    if (from === STAFF_TABLE_ID) return d.result();
    // 先看類別再看人數：眷屬、外部貴賓拖進 12 位的工作人員桌時，用「只有員工」的提示（SEAT-R41）
    if (person.kind !== 'EMPLOYEE') return fail('STAFF_EMPLOYEE_ONLY');
    if (d.roster(STAFF_TABLE_ID).length >= cap.max) return fail(cap.violation);
    d.leave(participantId);
    d.joinStaff(participantId);
    return d.result();
  }

  if (from === tableId) {
    // 放回自己所在的桌、沒有指定列：沒有作用（SEAT-Q03）；指定了列就是調整順序（SEAT-R32、SEAT-R33）
    if (index === undefined) return d.result();
    const others = d.roster(tableId).filter((id) => id !== participantId);
    others.splice(Math.min(index, others.length), 0, participantId);
    d.setRoster(tableId, others);
    return d.result();
  }

  const roster = d.roster(tableId);
  if (roster.length >= cap.max) return fail(cap.violation);
  d.leave(participantId);
  roster.splice(index === undefined ? roster.length : Math.min(index, roster.length), 0, participantId);
  d.setRoster(tableId, roster);
  return d.result();
}

function seatMany(d: Draft, tableId: number, participantIds: readonly number[], allowOverflow: boolean): SeatingRuleResult {
  const ids = [...new Set(participantIds)];
  if (ids.some((id) => !d.byId.has(id))) return fail('NOT_FOUND');
  const incoming = ids.filter((id) => d.pos.get(id)!.tableId !== tableId);
  const cap = capacity(tableId, allowOverflow);

  if (tableId === STAFF_TABLE_ID) {
    if (incoming.some((id) => d.byId.get(id)!.kind !== 'EMPLOYEE')) return fail('STAFF_EMPLOYEE_ONLY');
    if (d.roster(STAFF_TABLE_ID).length + incoming.length > cap.max) return fail(cap.violation);
    for (const id of incoming) {
      d.leave(id);
      d.joinStaff(id);
    }
    return d.result();
  }

  if (d.roster(tableId).length + incoming.length > cap.max) return fail(cap.violation);
  for (const id of incoming) d.leave(id);
  // 依勾選順序排到名單最後（SEAT-R31、SEAT-Q06）
  d.setRoster(tableId, [...d.roster(tableId), ...incoming]);
  return d.result();
}

function restore(d: Draft, snapshot: SeatingSnapshot): SeatingRuleResult {
  const tableIds = new Set(d.before.tables.map((t) => t.id));
  if (snapshot.participants.some((s) => !d.byId.has(s.id))) return fail('NOT_FOUND');
  if (snapshot.participants.some((s) => s.tableId !== null && !tableIds.has(s.tableId))) return fail('CONFLICT');
  if (snapshot.tables.some((t) => !tableIds.has(t.id))) return fail('CONFLICT');

  const restored = new Set<number>();
  const touched = new Set<number>();
  for (const s of snapshot.participants) {
    const prev = d.pos.get(s.id)!.tableId;
    if (prev !== null) touched.add(prev);
    if (s.tableId !== null) touched.add(s.tableId);
    d.pos.set(s.id, { tableId: s.tableId, seatOrder: s.tableId === null ? null : s.seatOrder });
    restored.add(s.id);
  }
  for (const t of snapshot.tables) d.notes.set(t.id, t.noteName);

  for (const tableId of touched) {
    const members = [...d.pos.entries()].filter(([, p]) => p.tableId === tableId);
    // 復原可以回到最多 12 位的狀態（SEAT-R88）；別人在這之間坐進來、會超過 12 位時不能復原
    if (tableId === STAFF_TABLE_ID) {
      if (members.length > TABLE_MAX_SEATS) return fail('STAFF_TABLE_LIMIT');
      if (members.some(([id]) => d.byId.get(id)!.kind !== 'EMPLOYEE')) return fail('STAFF_EMPLOYEE_ONLY');
      continue;
    }
    if (members.length > TABLE_MAX_SEATS) return fail('TABLE_LIMIT');
    // 座號相同時，復原回來的人佔回原本的座號，原本坐在那裡的人往後
    members.sort(
      ([ia, a], [ib, b]) =>
        (a.seatOrder ?? 0) - (b.seatOrder ?? 0) || Number(restored.has(ib)) - Number(restored.has(ia)) || ia - ib,
    );
    d.setRoster(
      tableId,
      members.map(([id]) => id),
    );
  }
  return d.result();
}

/** 桌次狀態（SEAT-R02、SEAT-R11、2.1.9）：0–9 位 open、10 位 full（已滿）、11–12 位 over（超過） */
export type TableStatus = 'open' | 'full' | 'over';
export function tableStatus(count: number): TableStatus {
  if (count > TABLE_CAPACITY) return 'over';
  return count >= TABLE_CAPACITY ? 'full' : 'open';
}

export type SeatingStats = {
  seated: number;
  total: number;
  unseated: number;
  /** 每桌只算到 10 位（10 減人數，超過的桌算 0） */
  emptySeats: number;
  /** 10 位以上的桌數（含超過的桌） */
  fullTables: number;
  /** 11、12 位的桌數 */
  overflowTables: number;
};

/**
 * 統計列（SEAT-R75）：已入座是 30 桌上的人數；總人數是不是工作人員的參與人員；未入座是總人數減已入座；
 * 空位每桌只算到 10 位；已滿是 10 位以上的桌數；超過是 11、12 位的桌數。工作人員桌的人與空位都不算（SEAT-R47）。
 */
export function seatingStats(participants: readonly Participant[]): SeatingStats {
  const perTable = new Map<number, number>();
  let seated = 0;
  let total = 0;
  for (const p of participants) {
    if (p.tableId === STAFF_TABLE_ID) continue;
    total++;
    if (isNormalTable(p.tableId)) {
      seated++;
      perTable.set(p.tableId, (perTable.get(p.tableId) ?? 0) + 1);
    }
  }
  const counts = [...perTable.values()];
  const filled = counts.reduce((n, c) => n + Math.min(c, TABLE_CAPACITY), 0);
  return {
    seated,
    total,
    unseated: total - seated,
    emptySeats: TABLE_COUNT * TABLE_CAPACITY - filled,
    fullTables: counts.filter((n) => tableStatus(n) !== 'open').length,
    overflowTables: counts.filter((n) => tableStatus(n) === 'over').length,
  };
}

/**
 * 套用排座結果等外部算好的位置後，把受影響的一般桌重排成 0..n-1；
 * 回傳排進人後超過 10 位的桌號（沒有時 null）。自動排座每桌只排到 10 位（ARR-R17）：
 * 只檢查有人排進來的桌（gained，省略時檢查全部受影響的桌），原本就有 11、12 位、只有人離開的桌不算。
 */
export function normalizeTables(
  participants: Participant[],
  tableIds: Iterable<number>,
  gained?: ReadonlySet<number>,
): { overfull: number | null } {
  for (const tableId of tableIds) {
    if (!isNormalTable(tableId)) continue;
    const members = participants
      .filter((p) => p.tableId === tableId)
      .sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0) || a.id - b.id);
    if (members.length > TABLE_CAPACITY && (!gained || gained.has(tableId))) return { overfull: tableId };
    members.forEach((p, i) => (p.seatOrder = i));
  }
  return { overfull: null };
}
