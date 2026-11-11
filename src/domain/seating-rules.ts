// 座位異動指令的業務規則（docs/spec/seating.md 第 3 節；docs/architecture.md 第 7.2、8.1、11.3 節）。
// 前端（樂觀更新、事先擋下已滿的桌）與後端（交易內驗證並寫入）共用同一份純函式，不碰資料庫與畫面。
// - 一般桌的名單是有順序的清單，seatOrder 一律是 0..n-1 連續；有人離開時後面的人往前補（SEAT-R06、SEAT-Q01）。
// - 工作人員桌的順序不規定（SEAT-R34 依參與人員的預設排序顯示），新放進來的人接在最後。
// - undo 由操作前後的差異算出：只列位置有改變的人、備註名稱有改變的桌，值是操作前的狀態。
// - 每桌（含工作人員桌）標準 10 位、最多 12 位（SEAT-R02、SEAT-R88、D-018）：seat、seatMany 帶 allowOverflow（拖移、「加入人員」）
//   時上限 12 位，超過回 TABLE_LIMIT／STAFF_TABLE_LIMIT；不帶時（選擇桌次對話框）上限 10 位，回 TABLE_FULL／STAFF_TABLE_FULL。
//   restore、moveTable 上限 12 位（搬動桌子不改變人數）。
// - 桌子與位置分開（D-027）：桌子的 position 是位置 1–30，null 是暫存區。暫存的桌不能入座（SEAT-R92）；
//   moveTable、createTable、deleteTable 改桌子，undo 記下動到的桌的原樣（新增的桌 exists 是 false）。
import {
  STAFF_TABLE_CAPACITY,
  STAFF_TABLE_ID,
  TABLE_CAPACITY,
  type Participant,
  type SeatTable,
} from '@/contracts/entities';
import { TABLE_MAX_SEATS, type SeatingOperation, type SeatingSnapshot } from '@/contracts/seating';
import { isPlaced, nextTableId } from './tables';

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
type TableState = Pick<SeatTable, 'kind' | 'position' | 'stagedAt' | 'noteName'>;

/** 指令的時間與新增桌的 id；省略時用現在的時間與目前最大的 id 加 1（伺服器在交易內算好傳入） */
export type ApplyOptions = { now?: string; nextTableId?: number };

/** 一般桌的 id 是 1 以上（工作人員桌是 0） */
const isNormalTableId = (tableId: number | null): tableId is number => tableId !== null && tableId !== STAFF_TABLE_ID;

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
  /** 目前的桌（刪除的桌拿掉、新增的桌加進來） */
  readonly tables = new Map<number, TableState>();
  readonly byId: Map<number, Participant>;

  constructor(
    readonly before: SeatingData,
    readonly now: string,
    readonly newTableId: number,
  ) {
    this.byId = new Map(before.participants.map((p) => [p.id, p]));
    for (const p of before.participants) this.pos.set(p.id, { tableId: p.tableId, seatOrder: p.seatOrder });
    for (const t of before.tables) this.tables.set(t.id, { kind: t.kind, position: t.position, stagedAt: t.stagedAt, noteName: t.noteName });
  }

  /** 一般桌（場上或暫存） */
  isNormal(tableId: number | null): tableId is number {
    return isNormalTableId(tableId) && this.tables.get(tableId)?.kind === 'NORMAL';
  }

  /** 暫存的桌：人不能放進去（SEAT-R92） */
  isStaged(tableId: number): boolean {
    const t = this.tables.get(tableId);
    return !!t && t.kind === 'NORMAL' && t.position === null;
  }

  /** 在這個位置上的桌 id */
  occupant(position: number): number | null {
    for (const [id, t] of this.tables) if (t.kind === 'NORMAL' && t.position === position) return id;
    return null;
  }

  /** 移到暫存區最下面 */
  stage(tableId: number) {
    const t = this.tables.get(tableId)!;
    this.tables.set(tableId, { ...t, position: null, stagedAt: this.now });
  }

  /** 放到位置上 */
  place(tableId: number, position: number) {
    const t = this.tables.get(tableId)!;
    this.tables.set(tableId, { ...t, position, stagedAt: null });
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
    if (this.isNormal(from)) this.setRoster(from, this.roster(from));
  }

  /** 放進工作人員桌，接在最後 */
  joinStaff(id: number) {
    const orders = [...this.pos.values()].filter((p) => p.tableId === STAFF_TABLE_ID).map((p) => p.seatOrder ?? 0);
    this.pos.set(id, { tableId: STAFF_TABLE_ID, seatOrder: orders.length ? Math.max(...orders) + 1 : 0 });
  }

  result(): Extract<SeatingRuleResult, { ok: true }> {
    const expect: NonNullable<SeatingSnapshot['expect']> = { participants: [], tables: [] };
    const undo: SeatingSnapshot = { participants: [], tables: [], expect };
    const participants = this.before.participants.map((p) => {
      const next = this.pos.get(p.id)!;
      if (next.tableId === p.tableId && next.seatOrder === p.seatOrder) return p;
      undo.participants.push({ id: p.id, tableId: p.tableId, seatOrder: p.seatOrder });
      expect.participants.push({ id: p.id, tableId: next.tableId });
      return { ...p, tableId: next.tableId, seatOrder: next.seatOrder };
    });
    const tables: SeatTable[] = [];
    for (const t of this.before.tables) {
      const cur = this.tables.get(t.id);
      const same = cur && cur.position === t.position && cur.stagedAt === t.stagedAt && cur.noteName === t.noteName;
      if (!same) {
        undo.tables.push({ id: t.id, kind: t.kind, position: t.position, stagedAt: t.stagedAt, noteName: t.noteName, exists: true });
        expect.tables.push({ id: t.id, position: cur?.position ?? null, exists: !!cur });
      }
      if (cur) tables.push(same ? t : { ...t, ...cur });
    }
    const beforeIds = new Set(this.before.tables.map((t) => t.id));
    for (const [id, cur] of this.tables) {
      if (beforeIds.has(id)) continue;
      undo.tables.push({ id, kind: cur.kind, position: null, stagedAt: null, noteName: null, exists: false });
      expect.tables.push({ id, position: cur.position, exists: true });
      tables.push({ id, ...cur });
    }
    // 沒有任何改變時不帶 expect，快照只有空的 participants 與 tables
    if (!expect.participants.length && !expect.tables.length) delete undo.expect;
    return { ok: true, data: { participants, tables }, undo };
  }
}

const fail = (violation: SeatingViolation): SeatingRuleResult => ({ ok: false, violation });

export function applySeatingOperation(data: SeatingData, op: RuleOperation, options: ApplyOptions = {}): SeatingRuleResult {
  const d = new Draft(data, options.now ?? new Date().toISOString(), options.nextTableId ?? nextTableId(data.tables));
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
      if (!d.isNormal(op.tableId)) return fail('NOT_FOUND');
      if (d.isStaged(op.tableId)) return fail('CONFLICT');
      const current = d.roster(op.tableId);
      const next = op.participantIds;
      const same =
        next.length === current.length && new Set(next).size === next.length && next.every((id) => current.includes(id));
      if (!same) return fail('CONFLICT');
      d.setRoster(op.tableId, next);
      return d.result();
    }
    case 'clear': {
      if (!d.isNormal(op.tableId)) return fail('NOT_FOUND');
      if (d.isStaged(op.tableId)) return fail('CONFLICT');
      for (const id of d.roster(op.tableId)) d.pos.set(id, { tableId: null, seatOrder: null });
      return d.result();
    }
    case 'moveTable':
      return moveTable(d, op.tableId, op.to, op.expectedTableId);
    case 'createTable': {
      // 這個位置已有桌（例如別人剛新增或放上去）：不新增（SEAT-R85）
      if (d.occupant(op.position) !== null) return fail('CONFLICT');
      d.tables.set(d.newTableId, { kind: 'NORMAL', position: op.position, stagedAt: null, noteName: null });
      return d.result();
    }
    case 'deleteTable': {
      if (!d.tables.has(op.tableId)) return fail('NOT_FOUND');
      if (!d.isNormal(op.tableId)) return fail('CONFLICT');
      // 桌上的人變成一般的未入座（不刪除人員，SEAT-R97），備註名稱跟著桌子一起刪除
      for (const id of d.roster(op.tableId)) d.pos.set(id, { tableId: null, seatOrder: null });
      d.tables.delete(op.tableId);
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

/**
 * 搬動桌子（SEAT-R35、R36、D-027）：名單與備註名稱跟著桌子（id），只改 position 與 stagedAt。
 * expectedTableId 是畫面上目標位置的桌（「未放桌」是 null）；和現在不同表示別人剛改過，不搬（SEAT-R85）。
 */
function moveTable(d: Draft, tableId: number, to: number | 'staging', expectedTableId: number | null): SeatingRuleResult {
  if (!d.tables.has(tableId)) return fail('NOT_FOUND');
  if (!d.isNormal(tableId)) return fail('CONFLICT');
  const from = d.tables.get(tableId)!.position;

  if (to === 'staging') {
    // 暫存的桌放回暫存區：沒有作用（SEAT-R38）
    if (from === null) return d.result();
    d.stage(tableId);
    return d.result();
  }

  const occupant = d.occupant(to);
  if (occupant !== expectedTableId) return fail('CONFLICT');
  // 放回自己所在的位置：沒有作用（SEAT-R38）
  if (occupant === tableId) return d.result();
  if (occupant === null) {
    d.place(tableId, to);
    return d.result();
  }
  if (from === null) {
    // 暫存的桌放到有桌的位置：交換，原本那桌移到暫存區最下面
    d.stage(occupant);
    d.place(tableId, to);
    return d.result();
  }
  // 場上兩桌對調位置
  d.place(occupant, from);
  d.place(tableId, to);
  return d.result();
}

function seat(d: Draft, participantId: number, tableId: number, index: number | undefined, allowOverflow: boolean): SeatingRuleResult {
  const person = d.byId.get(participantId);
  if (!person) return fail('NOT_FOUND');
  if (tableId !== STAFF_TABLE_ID) {
    if (!d.isNormal(tableId)) return fail('NOT_FOUND');
    // 暫存的桌不能放人（SEAT-R92）
    if (d.isStaged(tableId)) return fail('CONFLICT');
  }
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
  if (tableId !== STAFF_TABLE_ID) {
    if (!d.isNormal(tableId)) return fail('NOT_FOUND');
    if (d.isStaged(tableId)) return fail('CONFLICT');
  }
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
  if (snapshot.participants.some((s) => !d.byId.has(s.id))) return fail('NOT_FOUND');

  // 這一步做完之後，動到的人或桌被別人改過：不能復原或重做（SEAT-R100、D-028）。
  // 只比人的所在桌與桌子的有無、位置；別人坐進同一桌、調整同一桌的順序不算
  if (snapshot.expect) {
    for (const e of snapshot.expect.participants) {
      if (!d.byId.has(e.id)) return fail('NOT_FOUND');
      if (d.pos.get(e.id)!.tableId !== e.tableId) return fail('CONFLICT');
    }
    for (const e of snapshot.expect.tables) {
      const cur = d.tables.get(e.id);
      if (!!cur !== e.exists || (cur && cur.position !== e.position)) return fail('CONFLICT');
    }
  }

  // 先還原要留下的桌子（D-027）：這次刪掉的桌以原本的 id 重建、搬動的桌放回原位。
  // 這次新增的桌（exists 是 false）等人都移回去之後再刪
  const removing = snapshot.tables.filter((t) => !t.exists && d.tables.has(t.id));
  for (const t of snapshot.tables) {
    if (!t.exists) continue;
    const cur = d.tables.get(t.id);
    d.tables.set(t.id, { kind: cur?.kind ?? t.kind, position: t.position, stagedAt: t.stagedAt, noteName: t.noteName });
  }
  for (const t of removing) {
    const cur = d.tables.get(t.id)!;
    d.tables.set(t.id, { ...cur, position: null, stagedAt: null });
  }
  // 位置被別的桌佔走（例如別人在這之間放了桌）：不能復原
  const used = new Map<number, number>();
  for (const [id, t] of d.tables) {
    if (t.kind !== 'NORMAL' || t.position === null) continue;
    if (used.has(t.position)) return fail('CONFLICT');
    used.set(t.position, id);
  }

  const removingIds = new Set(removing.map((t) => t.id));
  if (snapshot.participants.some((s) => s.tableId !== null && (!d.tables.has(s.tableId) || removingIds.has(s.tableId)))) {
    return fail('CONFLICT');
  }
  const restored = new Set<number>();
  const touched = new Set<number>();
  for (const s of snapshot.participants) {
    const prev = d.pos.get(s.id)!.tableId;
    if (prev !== null) touched.add(prev);
    if (s.tableId !== null) touched.add(s.tableId);
    d.pos.set(s.id, { tableId: s.tableId, seatOrder: s.tableId === null ? null : s.seatOrder });
    restored.add(s.id);
  }

  for (const tableId of touched) {
    if (!d.tables.has(tableId)) continue;
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
  // 最後刪掉這次新增的桌：桌上的人應該都已經移回原處；還有人（別人坐進去的）就不能復原
  for (const t of removing) {
    if (d.roster(t.id).length > 0) return fail('CONFLICT');
    d.tables.delete(t.id);
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
 * 統計列（SEAT-R75）：已入座是場上的桌（放在位置上的桌）上的人數；總人數是不是工作人員的參與人員；未入座是總人數減已入座
 * （含暫存的桌上的人，SEAT-R94）；空位只算場上的桌，每桌只算到 10 位；已滿是 10 位以上的桌數；超過是 11、12 位的桌數。
 * 工作人員桌、暫存的桌與「未放桌」的位置都不算（SEAT-R47、D-027）。
 */
export function seatingStats(participants: readonly Participant[], tables: readonly SeatTable[]): SeatingStats {
  const placed = tables.filter(isPlaced);
  const perTable = new Map<number, number>(placed.map((t) => [t.id, 0]));
  let seated = 0;
  let total = 0;
  for (const p of participants) {
    if (p.tableId === STAFF_TABLE_ID) continue;
    total++;
    if (p.tableId !== null && perTable.has(p.tableId)) {
      seated++;
      perTable.set(p.tableId, perTable.get(p.tableId)! + 1);
    }
  }
  const counts = [...perTable.values()];
  const filled = counts.reduce((n, c) => n + Math.min(c, TABLE_CAPACITY), 0);
  return {
    seated,
    total,
    unseated: total - seated,
    emptySeats: placed.length * TABLE_CAPACITY - filled,
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
    if (!isNormalTableId(tableId)) continue;
    const members = participants
      .filter((p) => p.tableId === tableId)
      .sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0) || a.id - b.id);
    if (members.length > TABLE_CAPACITY && (!gained || gained.has(tableId))) return { overfull: tableId };
    members.forEach((p, i) => (p.seatOrder = i));
  }
  return { overfull: null };
}
