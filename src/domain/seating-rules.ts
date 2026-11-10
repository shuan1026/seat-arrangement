// 座位異動指令的業務規則（docs/spec/seating.md 第 3 節；docs/architecture.md 第 7.2、8.1、11.3 節）。
// 前端（樂觀更新、事先擋下已滿的桌）與後端（交易內驗證並寫入）共用同一份純函式，不碰資料庫與畫面。
// - 一般桌的名單是有順序的清單，seatOrder 一律是 0..n-1 連續；有人離開時後面的人往前補（SEAT-R06、SEAT-Q01）。
// - 工作人員桌的順序不規定（SEAT-R34 依參與人員的預設排序顯示），新放進來的人接在最後。
// - undo 由操作前後的差異算出：只列位置有改變的人、備註名稱有改變的桌，值是操作前的狀態。
import {
  STAFF_TABLE_CAPACITY,
  STAFF_TABLE_ID,
  TABLE_CAPACITY,
  TABLE_COUNT,
  type Participant,
  type SeatTable,
} from '@/contracts/entities';
import type { SeatingOperation, SeatingSnapshot } from '@/contracts/seating';

export type SeatingData = { participants: Participant[]; tables: SeatTable[] };
export type SeatingViolation = 'TABLE_FULL' | 'STAFF_TABLE_FULL' | 'STAFF_EMPLOYEE_ONLY' | 'NOT_FOUND' | 'CONFLICT';
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
      return seat(d, op.participantId, op.tableId, op.index);
    case 'seatMany':
      return seatMany(d, op.tableId, op.participantIds);
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

function seat(d: Draft, participantId: number, tableId: number, index: number | undefined): SeatingRuleResult {
  const person = d.byId.get(participantId);
  if (!person) return fail('NOT_FOUND');
  const from = d.pos.get(participantId)!.tableId;

  if (tableId === STAFF_TABLE_ID) {
    // 已經是工作人員：沒有作用（SEAT-R51）
    if (from === STAFF_TABLE_ID) return d.result();
    if (person.kind !== 'EMPLOYEE') return fail('STAFF_EMPLOYEE_ONLY');
    if (d.roster(STAFF_TABLE_ID).length >= STAFF_TABLE_CAPACITY) return fail('STAFF_TABLE_FULL');
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
  if (roster.length >= TABLE_CAPACITY) return fail('TABLE_FULL');
  d.leave(participantId);
  roster.splice(index === undefined ? roster.length : Math.min(index, roster.length), 0, participantId);
  d.setRoster(tableId, roster);
  return d.result();
}

function seatMany(d: Draft, tableId: number, participantIds: readonly number[]): SeatingRuleResult {
  const ids = [...new Set(participantIds)];
  if (ids.some((id) => !d.byId.has(id))) return fail('NOT_FOUND');
  const incoming = ids.filter((id) => d.pos.get(id)!.tableId !== tableId);

  if (tableId === STAFF_TABLE_ID) {
    if (incoming.some((id) => d.byId.get(id)!.kind !== 'EMPLOYEE')) return fail('STAFF_EMPLOYEE_ONLY');
    if (d.roster(STAFF_TABLE_ID).length + incoming.length > STAFF_TABLE_CAPACITY) return fail('STAFF_TABLE_FULL');
    for (const id of incoming) {
      d.leave(id);
      d.joinStaff(id);
    }
    return d.result();
  }

  if (d.roster(tableId).length + incoming.length > TABLE_CAPACITY) return fail('TABLE_FULL');
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
    if (tableId === STAFF_TABLE_ID) {
      if (members.length > STAFF_TABLE_CAPACITY) return fail('STAFF_TABLE_FULL');
      if (members.some(([id]) => d.byId.get(id)!.kind !== 'EMPLOYEE')) return fail('STAFF_EMPLOYEE_ONLY');
      continue;
    }
    if (members.length > TABLE_CAPACITY) return fail('TABLE_FULL');
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

export type SeatingStats = { seated: number; total: number; unseated: number; emptySeats: number; fullTables: number };

/**
 * 統計列（SEAT-R75）：已入座是 30 桌上的人數；總人數是不是工作人員的參與人員；未入座是總人數減已入座；
 * 空位是 300 減已入座；已滿是滿 10 位的桌數。工作人員桌的人與空位都不算（SEAT-R47）。
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
  const fullTables = [...perTable.values()].filter((n) => n >= TABLE_CAPACITY).length;
  return { seated, total, unseated: total - seated, emptySeats: TABLE_COUNT * TABLE_CAPACITY - seated, fullTables };
}

/** 套用排座結果等外部算好的位置後，把受影響的一般桌重排成 0..n-1；回傳超過 10 位的桌號（沒有時 null） */
export function normalizeTables(participants: Participant[], tableIds: Iterable<number>): { overfull: number | null } {
  for (const tableId of tableIds) {
    if (!isNormalTable(tableId)) continue;
    const members = participants
      .filter((p) => p.tableId === tableId)
      .sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0) || a.id - b.id);
    if (members.length > TABLE_CAPACITY) return { overfull: tableId };
    members.forEach((p, i) => (p.seatOrder = i));
  }
  return { overfull: null };
}
