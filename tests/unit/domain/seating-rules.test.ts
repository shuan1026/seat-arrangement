// 座位指令的業務規則（前端與後端共用的純函式）：docs/spec/seating.md 第 3 節
// SEAT-R01、R02（30 桌、每桌標準 10 位、最多 12 位，D-018）、R06（名單連續、有人離開時往前補，SEAT-Q01）、
// R16～R20（入座、插入、搬移、12 位擋下）、R26、R28（移出）、R29（清空、備註名稱保留）、R30、R31（加入人員，SEAT-Q06：依勾選順序）、
// R32、R33（調整順序）、R35、R36、R38（搬動桌子：對調、搬到「未放桌」、移到暫存區、從暫存區放回，D-027）、R40～R46、R50、R51（工作人員桌）、
// R75（統計列：只算場上的桌，暫存的桌上的人算未入座，D-027）、R76～R78（復原的範圍，含桌子的搬動、新增與刪除）、
// R88（只有拖移與「加入人員」可以放進第 11、12 位；選單類入口到 10 位為止；復原與搬動桌子可以回到 12 位）、5.12 節 SEAT-AC91～AC98；
// D-027：SEAT-R92、R94（人不能放進暫存的桌；暫存的桌上的人可以移出或入座別桌）、R96（新增桌）、R97（刪除桌）、R98（工作人員桌不受影響）、
// 5.14 節 SEAT-AC108～AC114、AC118、AC121～AC124、AC126；
// docs/architecture.md 第 7.2 節（標準 10 位、最多 12 位、工作人員桌只放員工、seatOrder 重排為 0..n-1）、
// 第 8.1 節（每個指令回傳 undo；seat、seatMany 帶 allowOverflow 時上限 12、不帶時上限 10；restore、moveTable 上限 12；
// 10 位擋下回 TABLE_FULL、12 位擋下回 TABLE_LIMIT；seat、seatMany、reorder、clear 指到暫存的桌回 CONFLICT；restore 的快照記桌子）；
// docs/decision-record.md D-018、D-027；docs/spec/README.md COM-R07（別人剛改過資料、操作不能完成）。
// 桌子用 id（工作人員桌 0），位置用 position（1–30，null 是暫存區），畫面上的桌號不在這一層（D-019、D-027）。
// make() 的資料是部署時的樣子：1–30 桌在同號的位置（3 = B4、5 = B10、6 = B13、7 = B2、9 = B8、17 = A3，對應見 tests/helpers/table-codes.ts）。
//
// 假設 src/domain/seating-rules.ts 的匯出（實作請照這個介面）：
//
//   import type { Participant, SeatTable } from '@/contracts/entities';
//   import type { SeatingOperation, SeatingSnapshot } from '@/contracts/seating';
//
//   export type SeatingData = { participants: Participant[]; tables: SeatTable[] };
//   export type SeatingViolation =
//     | 'TABLE_FULL'          // 一般桌到 10 位（不帶 allowOverflow 的 seat、seatMany）
//     | 'TABLE_LIMIT'         // 一般桌到 12 位（帶 allowOverflow 的 seat、seatMany；restore）
//     | 'STAFF_TABLE_FULL'    // 工作人員桌到 10 位（不帶 allowOverflow）
//     | 'STAFF_TABLE_LIMIT'   // 工作人員桌到 12 位（帶 allowOverflow；restore）
//     | 'STAFF_EMPLOYEE_ONLY' | 'NOT_FOUND' | 'CONFLICT';
//   export type SeatingRuleResult =
//     | { ok: true; data: SeatingData; undo: SeatingSnapshot }
//     | { ok: false; violation: SeatingViolation };
//
//   /** 自動排座（autoArrange）不在這裡處理，見 src/server/services/seating.ts 的 registerAutoArranger。
//    *  moveTable、createTable、deleteTable 也在這裡算（D-027）；第三個參數可以省略：移到暫存區的時間用現在，新增桌的 id 用目前最大的 id 加 1 */
//   export function applySeatingOperation(data: SeatingData, op: Exclude<SeatingOperation, { type: 'autoArrange' }>, options?): SeatingRuleResult;
//
//   export type SeatingStats = {
//     seated: number; total: number; unseated: number;
//     emptySeats: number;      // 場上的桌每桌只算到 10 位（10 減人數，超過的桌算 0）
//     fullTables: number;      // 場上 10 位以上的桌數（含超過的桌）
//     overflowTables: number;  // 場上 11、12 位的桌數
//   };
//   export function seatingStats(participants: readonly Participant[], tables: readonly SeatTable[]): SeatingStats;  // D-027 多了 tables
//
//   /** 桌次狀態（SEAT-R02、SEAT-R11、2.1.9）：0–9 位 'open'、10 位 'full'（已滿）、11–12 位 'over'（超過） */
//   export function tableStatus(count: number): 'open' | 'full' | 'over';
//
// 回傳約定：
// - 不修改傳入的 data；成功時 data 是操作後的完整資料（全部參與人員與桌次；刪除的桌不在裡面、新增的桌在裡面）。
// - 一般桌的 seatOrder 一律是 0..n-1 連續（名單順序）；工作人員桌的 seatOrder 不規定（SEAT-R34 依預設排序顯示）。
// - undo 正好列出「位置（tableId、seatOrder）有改變的參與人員」與「位置、暫存時間或備註名稱有改變、被刪除或新增的桌」，
//   值是操作前的狀態（桌子是 { id, kind, position, stagedAt, noteName, exists }，新增的桌 exists 是 false）；
//   把 undo 用 restore 送回去，就回到操作前。沒有任何改變（例如 SEAT-R38、R51、SEAT-Q03）時 ok 為 true、undo 兩個陣列都是空的。
// - 違反規則時 ok 為 false，violation 是對應的錯誤碼（src/contracts/errors.ts）。
import { describe, expect, it } from 'vitest';
import { STAFF_TABLE_ID, TABLE_CAPACITY, type Participant, type SeatTable } from '@/contracts/entities';
import type { SeatingOperation, SeatingSnapshot } from '@/contracts/seating';
import {
  applySeatingOperation,
  seatingStats,
  tableStatus,
  type SeatingData,
  type SeatingRuleResult,
} from '@/domain/seating-rules';
import {
  allTables,
  asDependent,
  asEmployee,
  asGuest,
  normalTable,
  positionOf,
  rosterIds,
  seatEmployees,
  stagedIds,
  stagedTable,
  staffIds,
  tableAtPosition,
  tableById,
  updateTable,
  withoutPositions,
} from '../../helpers/seating-fixtures';

type Op = Exclude<SeatingOperation, { type: 'autoArrange' }>;

const make = (participants: Participant[], noteNames: Record<number, string> = {}, tables?: SeatTable[]): SeatingData => ({
  participants,
  tables: tables ?? allTables(noteNames),
});

/** 桌子在比對時看的部分：位置、暫存時間、備註名稱 */
const viewOf = (t: SeatTable | undefined) => (t ? { position: t.position, stagedAt: t.stagedAt, noteName: t.noteName } : undefined);
const tableIdsOf = (data: SeatingData) => data.tables.map((t) => t.id).sort((a, b) => a - b);

/** 暫存區的時間都用 2025 年（比「現在」早），移到暫存區的桌一定排在它們後面 */
const EARLY = '2025-03-01T08:00:00.000Z';
const EARLIER = '2025-02-01T08:00:00.000Z';

function expectOk(result: SeatingRuleResult): Extract<SeatingRuleResult, { ok: true }> {
  if (!result.ok) throw new Error(`預期成功，卻違反 ${result.violation}`);
  return result;
}

function expectViolation(result: SeatingRuleResult): string {
  if (result.ok) throw new Error('預期違反規則，卻成功');
  return result.violation;
}

/**
 * 一般桌（場上與暫存，含新增的桌）的 seatOrder 是 0..n-1 連續（docs/architecture.md 第 7.2 節）；
 * 每位入座的人都坐在存在的桌；一個位置最多一張桌（position unique，D-027）
 */
function expectContiguous(data: SeatingData) {
  for (const t of data.tables.filter((x) => x.kind === 'NORMAL')) {
    const orders = data.participants
      .filter((p) => p.tableId === t.id)
      .map((p) => p.seatOrder)
      .sort((a, b) => (a ?? -1) - (b ?? -1));
    expect(orders, `id ${t.id} 的桌的座號`).toEqual(orders.map((_, i) => i));
  }
  const ids = new Set(data.tables.map((t) => t.id));
  for (const p of data.participants) {
    if (p.tableId === null) expect(p.seatOrder, `未入座的 ${p.id} 沒有座號`).toBeNull();
    else expect(ids.has(p.tableId), `參與人員 ${p.id} 坐的 id ${p.tableId} 的桌不存在`).toBe(true);
  }
  const positions = data.tables.filter((t) => t.kind === 'NORMAL' && t.position !== null).map((t) => t.position);
  expect(new Set(positions).size, '一個位置最多一張桌').toBe(positions.length);
  expect(data.tables.find((t) => t.id === STAFF_TABLE_ID), '工作人員桌一直都在').toMatchObject({ kind: 'STAFF', position: null });
}

/** undo 正好是「有改變的人與桌」操作前的值；新增的桌 exists 是 false（D-027） */
function expectUndoIsBeforeOfChanged(before: SeatingData, after: SeatingData, undo: SeatingSnapshot) {
  const changedPeople = before.participants
    .filter((p) => {
      const a = positionOf(after.participants, p.id);
      return a.tableId !== p.tableId || a.seatOrder !== p.seatOrder;
    })
    .map((p) => p.id)
    .sort((a, b) => a - b);
  expect(undo.participants.map((u) => u.id).sort((a, b) => a - b)).toEqual(changedPeople);
  for (const u of undo.participants) {
    expect(u).toEqual({ id: u.id, ...positionOf(before.participants, u.id) });
  }

  const changedTables = before.tables
    .filter((t) => {
      const a = tableById(after.tables, t.id);
      return !a || a.position !== t.position || a.stagedAt !== t.stagedAt || a.noteName !== t.noteName;
    })
    .map((t) => t.id);
  const created = after.tables.filter((t) => !tableById(before.tables, t.id)).map((t) => t.id);
  expect(undo.tables.map((t) => t.id).sort((a, b) => a - b)).toEqual([...changedTables, ...created].sort((a, b) => a - b));
  for (const u of undo.tables) {
    const b = tableById(before.tables, u.id);
    if (b) expect(u, `id ${u.id} 的桌`).toEqual({ id: b.id, kind: b.kind, position: b.position, stagedAt: b.stagedAt, noteName: b.noteName, exists: true });
    else expect(u.exists, `id ${u.id} 的桌是這次新增的`).toBe(false);
  }
}

/** 把 undo 送回 restore，就回到操作前（SEAT-R78）：人的座位、桌子的位置、暫存順序與備註名稱；新增的桌刪掉、刪掉的桌回來 */
function expectUndoRestores(before: SeatingData, after: SeatingData, undo: SeatingSnapshot) {
  const restored = expectOk(applySeatingOperation(after, { type: 'restore', snapshot: undo })).data;
  for (const p of before.participants) {
    expect(positionOf(restored.participants, p.id), `參與人員 ${p.id}`).toEqual(positionOf(before.participants, p.id));
  }
  expect(tableIdsOf(restored), '桌子回到操作前的那幾張').toEqual(tableIdsOf(before));
  for (const t of before.tables) {
    expect(viewOf(tableById(restored.tables, t.id)), `id ${t.id} 的桌的位置、暫存時間與備註名稱`).toEqual(viewOf(t));
  }
  expect(stagedIds(restored.tables), '暫存區的順序').toEqual(stagedIds(before.tables));
  expectContiguous(restored);
}

/** 執行一個應該成功的指令，並檢查共通約定：不改輸入、名單連續、undo 正確、可以復原 */
function run(before: SeatingData, op: Op): SeatingData {
  const snapshot = structuredClone(before);
  const result = expectOk(applySeatingOperation(before, op));
  expect(before, '不修改傳入的資料').toEqual(snapshot);
  expect(result.data.participants.map((p) => p.id).sort((a, b) => a - b)).toEqual(
    before.participants.map((p) => p.id).sort((a, b) => a - b),
  );
  const delta = op.type === 'createTable' ? 1 : op.type === 'deleteTable' ? -1 : 0;
  expect(result.data.tables).toHaveLength(before.tables.length + delta);
  expectContiguous(result.data);
  expectUndoIsBeforeOfChanged(before, result.data, result.undo);
  expectUndoRestores(before, result.data, result.undo);
  return result.data;
}

/** 執行一個應該違反規則的指令：回傳錯誤碼，輸入不變 */
function reject(before: SeatingData, op: Op): string {
  const snapshot = structuredClone(before);
  const violation = expectViolation(applySeatingOperation(before, op));
  expect(before).toEqual(snapshot);
  return violation;
}

/** 沒有作用：成功、undo 為空、人的位置與桌子都不變 */
function expectNoEffect(before: SeatingData, op: Op) {
  const result = expectOk(applySeatingOperation(before, op));
  expect(result.undo).toEqual({ participants: [], tables: [] });
  for (const p of before.participants) {
    expect(positionOf(result.data.participants, p.id)).toEqual(positionOf(before.participants, p.id));
  }
  expect(tableIdsOf(result.data)).toEqual(tableIdsOf(before));
  for (const t of before.tables) {
    expect(viewOf(tableById(result.data.tables, t.id)), `id ${t.id} 的桌`).toEqual(viewOf(t));
  }
}

/** 被拒絕（違反哪一條不限定）：ok 是 false，輸入不變 */
function rejectAny(before: SeatingData, op: Op) {
  const snapshot = structuredClone(before);
  expect(applySeatingOperation(before, op).ok).toBe(false);
  expect(before).toEqual(snapshot);
}

const WANG = 100; // 王小明：員工
const WANG_DEP = 101; // 王小明_眷屬
const LIN = 102; // 林董：外部貴賓

describe('seat：入座（SEAT-R16、R17、R18）', () => {
  it('未入座的人放到桌次，排到名單最後（SEAT-R16、SEAT-AC01）', () => {
    const before = make([...seatEmployees(1, 3, 4), asEmployee(WANG)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 3 });
    expect(rosterIds(after.participants, 3)).toEqual([1, 2, 3, 4, WANG]);
    expect(positionOf(after.participants, WANG)).toEqual({ tableId: 3, seatOrder: 4 });
  });

  it('放在名單的某一列：插入那一列，原本那一列與之後的人往後移（SEAT-R17、SEAT-AC02）', () => {
    const before = make([...seatEmployees(1, 3, 3), asEmployee(WANG)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 3, index: 1 });
    expect(rosterIds(after.participants, 3)).toEqual([1, WANG, 2, 3]);
  });

  it('放在第 1 列：排在最前面（SEAT-R17）', () => {
    const before = make([...seatEmployees(1, 3, 3), asEmployee(WANG)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 3, index: 0 });
    expect(rosterIds(after.participants, 3)).toEqual([WANG, 1, 2, 3]);
  });

  it('放在空位列（位置超過現有人數）：排到名單最後，名單仍從座號 1 連續（SEAT-R17、SEAT-R06、SEAT-AC03）', () => {
    const before = make([...seatEmployees(1, 3, 2), asEmployee(WANG)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 3, index: 6 });
    expect(rosterIds(after.participants, 3)).toEqual([1, 2, WANG]);
    expect(positionOf(after.participants, WANG)).toEqual({ tableId: 3, seatOrder: 2 });
  });

  it('空桌入座：成為第 1 位', () => {
    const before = make([asEmployee(WANG)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 9 });
    expect(positionOf(after.participants, WANG)).toEqual({ tableId: 9, seatOrder: 0 });
  });

  it('眷屬、外部貴賓也可以入座一般桌', () => {
    const before = make([asEmployee(WANG), asDependent(WANG_DEP, WANG), asGuest(LIN)]);
    const a = run(before, { type: 'seat', participantId: WANG_DEP, tableId: 3 });
    const b = run(a, { type: 'seat', participantId: LIN, tableId: 3 });
    expect(rosterIds(b.participants, 3)).toEqual([WANG_DEP, LIN]);
  });

  it('不帶 allowOverflow（選擇桌次）：第 10 位可以入座，滿 10 位後第 11 位回 TABLE_FULL（SEAT-R23、SEAT-R88、SEAT-AC13）', () => {
    const before = make([...seatEmployees(1, 5, 9), asEmployee(WANG), asEmployee(200)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 5 });
    expect(rosterIds(after.participants, 5)).toHaveLength(TABLE_CAPACITY);
    expect(reject(after, { type: 'seat', participantId: 200, tableId: 5 })).toBe('TABLE_FULL');
  });

  it('不帶 allowOverflow（選擇桌次）：目標桌已滿、這位不在這一桌，不入座，回 TABLE_FULL，資料不變（SEAT-R23、SEAT-R88、SEAT-AC94）', () => {
    const before = make([...seatEmployees(1, 5, 10), asEmployee(WANG)]);
    expect(reject(before, { type: 'seat', participantId: WANG, tableId: 5 })).toBe('TABLE_FULL');
    expect(reject(before, { type: 'seat', participantId: WANG, tableId: 5, index: 0 })).toBe('TABLE_FULL');
  });

  it('找不到這位參與人員（已被別人刪除）：回 NOT_FOUND（COM-R07）', () => {
    const before = make([...seatEmployees(1, 3, 2)]);
    expect(reject(before, { type: 'seat', participantId: 999, tableId: 3 })).toBe('NOT_FOUND');
  });
});

describe('seat：搬移（SEAT-R19、R06、R20）', () => {
  it('已在某一桌的人放到另一桌：離開原桌，原桌其他人依原本順序往前補（SEAT-R19、SEAT-R06、SEAT-Q01、SEAT-AC04）', () => {
    // B4 桌（3）：1、王小明、2、3；B2 桌（7）：11、12
    const before = make([
      asEmployee(1, { tableId: 3, seatOrder: 0 }),
      asEmployee(WANG, { tableId: 3, seatOrder: 1 }),
      asEmployee(2, { tableId: 3, seatOrder: 2 }),
      asEmployee(3, { tableId: 3, seatOrder: 3 }),
      ...seatEmployees(11, 7, 2),
    ]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 7 });
    expect(rosterIds(after.participants, 3)).toEqual([1, 2, 3]);
    expect(rosterIds(after.participants, 7)).toEqual([11, 12, WANG]);
  });

  it('搬移時可以指定放在目標桌的某一列（SEAT-R17）', () => {
    const before = make([asEmployee(WANG, { tableId: 3, seatOrder: 0 }), ...seatEmployees(11, 7, 2)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 7, index: 0 });
    expect(rosterIds(after.participants, 7)).toEqual([WANG, 11, 12]);
    expect(rosterIds(after.participants, 3)).toEqual([]);
  });

  it('不帶 allowOverflow（選擇桌次「移至其他桌次…」）：目標桌已滿，不搬移，回 TABLE_FULL，留在原桌（SEAT-R23、SEAT-R88）', () => {
    const before = make([asEmployee(WANG, { tableId: 3, seatOrder: 0 }), ...seatEmployees(1, 5, 10)]);
    expect(reject(before, { type: 'seat', participantId: WANG, tableId: 5 })).toBe('TABLE_FULL');
  });

  it('放到自己所在的桌、沒有指定列（例如收合的圓形）：沒有作用（SEAT-Q03 的目前假設）', () => {
    const before = make([asEmployee(WANG, { tableId: 3, seatOrder: 0 }), ...seatEmployees(1, 3, 2, 1)]);
    expectNoEffect(before, { type: 'seat', participantId: WANG, tableId: 3 });
  });

  it('已滿的桌次，桌內的人放到同一桌的另一列：只改變順序，不算已滿（SEAT-R20、SEAT-R33）', () => {
    const before = make(seatEmployees(1, 5, 10));
    const after = run(before, { type: 'seat', participantId: 10, tableId: 5, index: 0 });
    expect(rosterIds(after.participants, 5)).toEqual([10, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('seat：工作人員桌（SEAT-R40～R45、R51）', () => {
  it('未入座的員工放進工作人員桌，成為工作人員（SEAT-R40、SEAT-R43、SEAT-AC38）', () => {
    const before = make([asEmployee(WANG)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: STAFF_TABLE_ID });
    expect(positionOf(after.participants, WANG).tableId).toBe(STAFF_TABLE_ID);
  });

  it('坐在桌次的員工放進工作人員桌：離開原桌，原桌其他人依序往前補（SEAT-R43、SEAT-AC39）', () => {
    const before = make([asEmployee(WANG, { tableId: 3, seatOrder: 0 }), ...seatEmployees(1, 3, 3, 1)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: STAFF_TABLE_ID });
    expect(positionOf(after.participants, WANG).tableId).toBe(STAFF_TABLE_ID);
    expect(rosterIds(after.participants, 3)).toEqual([1, 2, 3]);
  });

  it('員工成為工作人員時，眷屬留在原本的桌次（SEAT-R44、SEAT-AC40）', () => {
    const before = make([
      asEmployee(WANG, { tableId: 3, seatOrder: 0 }),
      asDependent(WANG_DEP, WANG, { tableId: 3, seatOrder: 1 }),
    ]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: STAFF_TABLE_ID });
    expect(positionOf(after.participants, WANG_DEP)).toEqual({ tableId: 3, seatOrder: 0 });
  });

  it('未入座的眷屬在員工成為工作人員後仍未入座（SEAT-R44）', () => {
    const before = make([asEmployee(WANG), asDependent(WANG_DEP, WANG)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: STAFF_TABLE_ID });
    expect(positionOf(after.participants, WANG_DEP)).toEqual({ tableId: null, seatOrder: null });
  });

  it('眷屬、外部貴賓不能放進工作人員桌：回 STAFF_EMPLOYEE_ONLY，人員留在原處（SEAT-R41、SEAT-AC41）', () => {
    const before = make([
      asEmployee(WANG),
      asDependent(WANG_DEP, WANG),
      asGuest(LIN, { tableId: 12, seatOrder: 0 }),
    ]);
    expect(reject(before, { type: 'seat', participantId: WANG_DEP, tableId: STAFF_TABLE_ID })).toBe(
      'STAFF_EMPLOYEE_ONLY',
    );
    expect(reject(before, { type: 'seat', participantId: LIN, tableId: STAFF_TABLE_ID })).toBe('STAFF_EMPLOYEE_ONLY');
  });

  it('不帶 allowOverflow：工作人員桌有 9 位時還能放 1 位；滿 10 位後回 STAFF_TABLE_FULL（docs/architecture.md 第 8.1 節、SEAT-R88）', () => {
    const before = make([...seatEmployees(1, STAFF_TABLE_ID, 9), asEmployee(WANG), asEmployee(200, { tableId: 3, seatOrder: 0 })]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: STAFF_TABLE_ID });
    expect(staffIds(after.participants)).toHaveLength(10);
    expect(reject(after, { type: 'seat', participantId: 200, tableId: STAFF_TABLE_ID })).toBe('STAFF_TABLE_FULL');
  });

  it('已經是工作人員的人放回工作人員桌：沒有作用（SEAT-R51、SEAT-AC49）', () => {
    const before = make([...seatEmployees(1, STAFF_TABLE_ID, 10)]);
    expectNoEffect(before, { type: 'seat', participantId: 3, tableId: STAFF_TABLE_ID });
  });

  it('工作人員放到某一桌：入座那一桌、排到名單最後，不再是工作人員（SEAT-R45、SEAT-AC43）', () => {
    const before = make([asEmployee(WANG, { tableId: STAFF_TABLE_ID, seatOrder: 0 }), ...seatEmployees(11, 7, 3)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 7 });
    expect(rosterIds(after.participants, 7)).toEqual([11, 12, 13, WANG]);
    expect(staffIds(after.participants)).toEqual([]);
  });

  it('工作人員放到某一桌的某一列：插入那一列（SEAT-R45 依 SEAT-R17）', () => {
    const before = make([asEmployee(WANG, { tableId: STAFF_TABLE_ID, seatOrder: 0 }), ...seatEmployees(11, 7, 3)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 7, index: 1 });
    expect(rosterIds(after.participants, 7)).toEqual([11, WANG, 12, 13]);
  });

  it('不帶 allowOverflow：工作人員放到已滿的桌，回 TABLE_FULL，仍是工作人員（SEAT-R45、SEAT-R88）', () => {
    const before = make([asEmployee(WANG, { tableId: STAFF_TABLE_ID, seatOrder: 0 }), ...seatEmployees(1, 5, 10)]);
    expect(reject(before, { type: 'seat', participantId: WANG, tableId: 5 })).toBe('TABLE_FULL');
  });
});

describe('seatMany：加入人員（SEAT-R30、R31、R50）', () => {
  it('勾選的人依勾選順序排到名單最後（SEAT-R31、SEAT-Q06 的目前假設、SEAT-AC18）', () => {
    const before = make([...seatEmployees(1, 3, 7), asEmployee(50), asEmployee(51), asEmployee(52)]);
    const after = run(before, { type: 'seatMany', tableId: 3, participantIds: [52, 50, 51] });
    expect(rosterIds(after.participants, 3)).toEqual([1, 2, 3, 4, 5, 6, 7, 52, 50, 51]);
  });

  it('不帶 allowOverflow：超過 10 位，整批不加入，回 TABLE_FULL（docs/architecture.md 第 8.1 節）', () => {
    const before = make([...seatEmployees(1, 3, 7), asEmployee(50), asEmployee(51), asEmployee(52), asEmployee(53)]);
    expect(reject(before, { type: 'seatMany', tableId: 3, participantIds: [50, 51, 52, 53] })).toBe('TABLE_FULL');
  });

  it('其中一位找不到（已被別人刪除）：整批不加入，回 NOT_FOUND（COM-R07）', () => {
    const before = make([asEmployee(50)]);
    expect(reject(before, { type: 'seatMany', tableId: 3, participantIds: [50, 999] })).toBe('NOT_FOUND');
  });

  it('加入工作人員桌：已入座與未入座的員工都成為工作人員，已入座的人離開原桌（SEAT-R50、SEAT-AC47）', () => {
    // 工作人員桌 8 位；陳大華（60）在 B4 桌（3）第 2 列；乙（61）未入座
    const before = make([
      ...seatEmployees(1, STAFF_TABLE_ID, 8),
      asEmployee(20, { tableId: 3, seatOrder: 0 }),
      asEmployee(60, { tableId: 3, seatOrder: 1 }),
      asEmployee(21, { tableId: 3, seatOrder: 2 }),
      asEmployee(61),
    ]);
    const after = run(before, { type: 'seatMany', tableId: STAFF_TABLE_ID, participantIds: [60, 61] });
    expect(staffIds(after.participants)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 60, 61]);
    expect(rosterIds(after.participants, 3)).toEqual([20, 21]);
  });

  it('不帶 allowOverflow：加入工作人員桌超過 10 位，整批不加入，回 STAFF_TABLE_FULL（docs/architecture.md 第 8.1 節）', () => {
    const before = make([...seatEmployees(1, STAFF_TABLE_ID, 9), asEmployee(60), asEmployee(61)]);
    expect(reject(before, { type: 'seatMany', tableId: STAFF_TABLE_ID, participantIds: [60, 61] })).toBe(
      'STAFF_TABLE_FULL',
    );
  });

  it('加入工作人員桌的人裡有眷屬或外部貴賓：整批不加入，回 STAFF_EMPLOYEE_ONLY（SEAT-R41、SEAT-R50）', () => {
    const before = make([asEmployee(WANG), asDependent(WANG_DEP, WANG), asGuest(LIN)]);
    expect(reject(before, { type: 'seatMany', tableId: STAFF_TABLE_ID, participantIds: [WANG, WANG_DEP] })).toBe(
      'STAFF_EMPLOYEE_ONLY',
    );
    expect(reject(before, { type: 'seatMany', tableId: STAFF_TABLE_ID, participantIds: [LIN] })).toBe(
      'STAFF_EMPLOYEE_ONLY',
    );
  });
});

describe('unseat：移出桌次與工作人員桌（SEAT-R26、R28、R46）', () => {
  it('移出後變成未入座，原桌其他人依原本順序往前補；人員仍在參與人員裡（SEAT-R26、SEAT-R28、SEAT-AC05）', () => {
    const before = make([
      asEmployee(1, { tableId: 3, seatOrder: 0 }),
      asEmployee(WANG, { tableId: 3, seatOrder: 1 }),
      asEmployee(2, { tableId: 3, seatOrder: 2 }),
    ]);
    const after = run(before, { type: 'unseat', participantId: WANG });
    expect(positionOf(after.participants, WANG)).toEqual({ tableId: null, seatOrder: null });
    expect(rosterIds(after.participants, 3)).toEqual([1, 2]);
    expect(after.participants).toHaveLength(3);
  });

  it('工作人員移出工作人員桌：不再是工作人員，變成未入座（SEAT-R46、SEAT-AC45）', () => {
    const before = make([...seatEmployees(1, STAFF_TABLE_ID, 3)]);
    const after = run(before, { type: 'unseat', participantId: 2 });
    expect(positionOf(after.participants, 2)).toEqual({ tableId: null, seatOrder: null });
    expect(staffIds(after.participants)).toEqual([1, 3]);
  });

  it('找不到這位參與人員：回 NOT_FOUND（COM-R07）', () => {
    expect(reject(make([]), { type: 'unseat', participantId: 999 })).toBe('NOT_FOUND');
  });
});

describe('reorder：桌內調整順序（SEAT-R32、R33）', () => {
  it('只改變順序，人數不變（SEAT-R32、SEAT-AC07）', () => {
    // 甲 1、乙 2、丙 3、丁 4 → 丁、甲、乙、丙
    const before = make(seatEmployees(1, 3, 4));
    const after = run(before, { type: 'reorder', tableId: 3, participantIds: [4, 1, 2, 3] });
    expect(rosterIds(after.participants, 3)).toEqual([4, 1, 2, 3]);
  });

  it('已滿的桌次也可以調整順序（SEAT-R33、SEAT-AC16）', () => {
    const before = make(seatEmployees(1, 5, 10));
    const after = run(before, { type: 'reorder', tableId: 5, participantIds: [10, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
    expect(rosterIds(after.participants, 5)).toEqual([10, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('送來的名單和這一桌目前的人不一樣（別人剛改過）：回 CONFLICT，資料不變（COM-R07）', () => {
    const before = make([...seatEmployees(1, 3, 3), asEmployee(9)]);
    // 少了一位
    expect(reject(before, { type: 'reorder', tableId: 3, participantIds: [2, 1] })).toBe('CONFLICT');
    // 多了不在這一桌的人
    expect(reject(before, { type: 'reorder', tableId: 3, participantIds: [3, 2, 1, 9] })).toBe('CONFLICT');
  });
});

describe('clear：清空桌次（SEAT-R28、R29）', () => {
  it('這一桌的人全部變成未入座，備註名稱保留（SEAT-R29、SEAT-AC36）', () => {
    const before = make([...seatEmployees(1, 3, 6), ...seatEmployees(11, 7, 2)], { 3: '主桌' });
    const after = run(before, { type: 'clear', tableId: 3 });
    expect(rosterIds(after.participants, 3)).toEqual([]);
    for (let id = 1; id <= 6; id++) expect(positionOf(after.participants, id)).toEqual({ tableId: null, seatOrder: null });
    expect(after.tables.find((t) => t.id === 3)?.noteName).toBe('主桌');
    expect(rosterIds(after.participants, 7)).toEqual([11, 12]);
    expect(after.participants).toHaveLength(8);
  });

  it('空桌清空：沒有作用', () => {
    expectNoEffect(make([...seatEmployees(1, 3, 2)], { 9: '供應商' }), { type: 'clear', tableId: 9 });
  });
});

/** 這個位置上的桌的名單（「未放桌」是 undefined） */
const rosterAtPosition = (data: SeatingData, position: number): number[] | undefined => {
  const t = tableAtPosition(data.tables, position);
  return t ? rosterIds(data.participants, t.id) : undefined;
};

describe('moveTable：場上的桌 → 另一個有桌的位置，兩桌對調位置（SEAT-R35、R36、D-027）', () => {
  it('B4 桌（id 3，「主桌」，甲、乙）拖到 B2（id 7，丙、丁、戊）：兩桌交換 position；名單（含順序）與備註名稱跟著桌子（SEAT-AC30）', () => {
    const before = make([...seatEmployees(1, 3, 2), ...seatEmployees(11, 7, 3)], { 3: '主桌' });
    const after = run(before, { type: 'moveTable', tableId: 3, to: 7, expectedTableId: 7 });
    expect(tableById(after.tables, 3)).toMatchObject({ position: 7, stagedAt: null, noteName: '主桌' });
    expect(tableById(after.tables, 7)).toMatchObject({ position: 3, stagedAt: null, noteName: null });
    // 名單跟著桌子（id）走，不搬人：B4 位置上是丙、丁、戊，B2 位置上是甲、乙
    expect(rosterAtPosition(after, 3)).toEqual([11, 12, 13]);
    expect(rosterAtPosition(after, 7)).toEqual([1, 2]);
    expect(rosterIds(after.participants, 3)).toEqual([1, 2]);
    for (const p of before.participants) expect(positionOf(after.participants, p.id), '人的座位不變').toEqual(positionOf(before.participants, p.id));
  });

  it('只改兩桌的位置：undo 只有這兩桌，沒有人（D-027：搬動、對調都只改 position 與 stagedAt）', () => {
    const before = make([...seatEmployees(1, 3, 2), ...seatEmployees(11, 7, 3)], { 3: '主桌' });
    const result = expectOk(applySeatingOperation(before, { type: 'moveTable', tableId: 3, to: 7, expectedTableId: 7 }));
    expect(result.undo.participants).toEqual([]);
    expect(result.undo.tables.map((t) => t.id).sort((a, b) => a - b)).toEqual([3, 7]);
  });

  it('已滿的桌也可以對調（SEAT-R35、SEAT-AC35）', () => {
    const before = make([...seatEmployees(1, 3, 3), ...seatEmployees(11, 7, 10)]);
    const after = run(before, { type: 'moveTable', tableId: 3, to: 7, expectedTableId: 7 });
    expect(rosterAtPosition(after, 3)).toHaveLength(10);
    expect(rosterAtPosition(after, 7)).toEqual([1, 2, 3]);
  });

  it('拖到空桌（有擺桌、沒有人）也是對調：B4 位置變成那張空桌，沒有備註名稱（SEAT-R36、SEAT-AC32）', () => {
    const before = make(seatEmployees(1, 3, 2), { 3: '主桌' });
    const after = run(before, { type: 'moveTable', tableId: 3, to: 9, expectedTableId: 9 });
    expect(tableAtPosition(after.tables, 9)).toMatchObject({ id: 3, noteName: '主桌' });
    expect(rosterAtPosition(after, 9)).toEqual([1, 2]);
    expect(tableAtPosition(after.tables, 3)).toMatchObject({ id: 9, noteName: null });
    expect(rosterAtPosition(after, 3)).toEqual([]);
  });

  it('放回自己的位置：沒有作用（SEAT-R38、SEAT-AC33）', () => {
    expectNoEffect(make(seatEmployees(1, 3, 2), { 3: '主桌' }), { type: 'moveTable', tableId: 3, to: 3, expectedTableId: 3 });
  });

  it('其他桌、暫存區與工作人員桌不受影響（SEAT-R98）', () => {
    const tables = [...allTables({ 8: '供應商' }), stagedTable(31, EARLY)];
    const before = make(
      [...seatEmployees(1, 3, 2), ...seatEmployees(11, 7, 1), ...seatEmployees(21, 8, 2), ...seatEmployees(41, 31, 1), ...seatEmployees(51, STAFF_TABLE_ID, 2)],
      {},
      tables,
    );
    const after = run(before, { type: 'moveTable', tableId: 3, to: 7, expectedTableId: 7 });
    expect(rosterIds(after.participants, 8)).toEqual([21, 22]);
    expect(viewOf(tableById(after.tables, 8))).toEqual({ position: 8, stagedAt: null, noteName: '供應商' });
    expect(viewOf(tableById(after.tables, 31))).toEqual({ position: null, stagedAt: EARLY, noteName: null });
    expect(staffIds(after.participants)).toEqual([51, 52]);
    expect(tableById(after.tables, STAFF_TABLE_ID)).toMatchObject({ kind: 'STAFF', position: null, stagedAt: null });
  });
});

describe('moveTable：場上的桌 → 「未放桌」的位置，整桌搬過去（SEAT-R35、R36、SEAT-AC109）', () => {
  it('B4 桌（「主桌」，甲、乙）搬到 B8（未放桌）：B8 有這一桌，B4 變成「未放桌」；復原後回來', () => {
    const before = make(seatEmployees(1, 3, 2), { 3: '主桌' }, withoutPositions(allTables({ 3: '主桌' }), [9]));
    const after = run(before, { type: 'moveTable', tableId: 3, to: 9, expectedTableId: null });
    expect(tableAtPosition(after.tables, 9)).toMatchObject({ id: 3, noteName: '主桌', stagedAt: null });
    expect(rosterAtPosition(after, 9)).toEqual([1, 2]);
    expect(tableAtPosition(after.tables, 3), 'B4 變成「未放桌」').toBeUndefined();
    expect(after.tables.filter((t) => t.kind === 'NORMAL')).toHaveLength(29);
  });
});

describe('moveTable：場上的桌 → 暫存區（SEAT-R35、R91、SEAT-AC110、AC114）', () => {
  it('B4 桌移到暫存區：position null、stagedAt 有值；B4 變成「未放桌」；名單與備註名稱跟著桌子，人仍坐在這一桌', () => {
    const before = make(seatEmployees(1, 3, 2), { 3: '主桌' });
    const after = run(before, { type: 'moveTable', tableId: 3, to: 'staging', expectedTableId: null });
    const t = tableById(after.tables, 3);
    expect(t).toMatchObject({ position: null, noteName: '主桌' });
    expect(typeof t?.stagedAt).toBe('string');
    expect(Number.isNaN(Date.parse(t?.stagedAt ?? '')), 'stagedAt 是 ISO 時間').toBe(false);
    expect(tableAtPosition(after.tables, 3)).toBeUndefined();
    expect(rosterIds(after.participants, 3)).toEqual([1, 2]);
  });

  it('排在暫存區最下面：先前移入的桌在上面（2.1.12、SEAT-AC114）', () => {
    const tables = [...allTables(), stagedTable(31, EARLIER), stagedTable(32, EARLY)];
    const before = make([...seatEmployees(1, 31, 1), ...seatEmployees(11, 32, 1), ...seatEmployees(21, 3, 1)], {}, tables);
    const after = run(before, { type: 'moveTable', tableId: 3, to: 'staging', expectedTableId: null });
    expect(stagedIds(after.tables)).toEqual([31, 32, 3]);
  });

  it('已滿、超過的桌也可以移到暫存區', () => {
    const before = make(seatEmployees(1, 5, 12));
    const after = run(before, { type: 'moveTable', tableId: 5, to: 'staging', expectedTableId: null });
    expect(rosterIds(after.participants, 5)).toHaveLength(12);
    expect(tableById(after.tables, 5)?.position).toBeNull();
  });
});

describe('moveTable：暫存的桌 → 「未放桌」的位置，放上去（SEAT-R35、R93、SEAT-AC111、AC117）', () => {
  it('暫存的桌（「主桌」，甲、乙）放到 A3（id 17 的位置，未放桌）：position 17、stagedAt null，暫存區沒有桌', () => {
    const tables = [...withoutPositions(allTables(), [17]), stagedTable(31, EARLY, { noteName: '主桌' })];
    const before = make(seatEmployees(1, 31, 2), {}, tables);
    const after = run(before, { type: 'moveTable', tableId: 31, to: 17, expectedTableId: null });
    expect(tableById(after.tables, 31)).toMatchObject({ position: 17, stagedAt: null, noteName: '主桌' });
    expect(rosterAtPosition(after, 17)).toEqual([1, 2]);
    expect(stagedIds(after.tables)).toEqual([]);
  });

  it('暫存區有兩桌，放回一桌：另一桌仍在暫存區、時間不變', () => {
    const tables = [...withoutPositions(allTables(), [17]), stagedTable(31, EARLIER), stagedTable(32, EARLY)];
    const before = make([], {}, tables);
    const after = run(before, { type: 'moveTable', tableId: 31, to: 17, expectedTableId: null });
    expect(stagedIds(after.tables)).toEqual([32]);
    expect(tableById(after.tables, 32)?.stagedAt).toBe(EARLY);
  });
});

describe('moveTable：暫存的桌 → 有桌的位置，交換（SEAT-R35、SEAT-AC112）', () => {
  it('暫存的桌（坐丙）放到 B2（坐丁）：B2 變成坐丙的桌；原本坐丁的桌移到暫存區最下面；復原後回到原狀', () => {
    const tables = [...allTables(), stagedTable(31, EARLIER), stagedTable(32, EARLY)];
    const before = make([...seatEmployees(1, 31, 1), ...seatEmployees(11, 7, 1)], {}, tables);
    const after = run(before, { type: 'moveTable', tableId: 31, to: 7, expectedTableId: 7 });
    expect(tableAtPosition(after.tables, 7)?.id).toBe(31);
    expect(rosterAtPosition(after, 7)).toEqual([1]);
    expect(tableById(after.tables, 31)?.stagedAt).toBeNull();
    const old = tableById(after.tables, 7);
    expect(old?.position).toBeNull();
    expect(typeof old?.stagedAt).toBe('string');
    expect(stagedIds(after.tables), '原本那桌排在暫存區最下面').toEqual([32, 7]);
    expect(rosterIds(after.participants, 7)).toEqual([11]);
  });
});

describe('moveTable：沒有作用與被拒（SEAT-R38、SEAT-R85、SEAT-R98）', () => {
  it('暫存的桌放回暫存區：沒有作用', () => {
    const before = make([], {}, [...allTables(), stagedTable(31, EARLY)]);
    expectNoEffect(before, { type: 'moveTable', tableId: 31, to: 'staging', expectedTableId: null });
  });

  it('畫面上以為目標是「未放桌」，其實已有桌（別人剛放上去）：CONFLICT，資料不變（SEAT-AC124）', () => {
    const tables = [...allTables(), stagedTable(31, EARLY)];
    const before = make([], {}, tables);
    expect(reject(before, { type: 'moveTable', tableId: 31, to: 9, expectedTableId: null })).toBe('CONFLICT');
  });

  it('畫面上以為目標位置是某一桌，其實是別桌或「未放桌」：CONFLICT', () => {
    const before = make([], {}, withoutPositions(allTables(), [9]));
    expect(reject(before, { type: 'moveTable', tableId: 3, to: 7, expectedTableId: 12 })).toBe('CONFLICT');
    expect(reject(before, { type: 'moveTable', tableId: 3, to: 9, expectedTableId: 9 })).toBe('CONFLICT');
  });

  it('要搬的桌已被刪除：被拒，資料不變', () => {
    rejectAny(make([], {}, withoutPositions(allTables(), [3])), { type: 'moveTable', tableId: 3, to: 'staging', expectedTableId: null });
  });

  it('工作人員桌不能搬動、不能移到暫存區（SEAT-R98、SEAT-AC126）', () => {
    const before = make(seatEmployees(1, STAFF_TABLE_ID, 2));
    rejectAny(before, { type: 'moveTable', tableId: STAFF_TABLE_ID, to: 'staging', expectedTableId: null });
    rejectAny(before, { type: 'moveTable', tableId: STAFF_TABLE_ID, to: 3, expectedTableId: 3 });
  });
});

describe('三桌輪換（SEAT-AC113）', () => {
  it('A1（id 2）坐甲、B1（id 1）坐乙、B4（id 3）坐丙 → A1 拖到暫存區、B1 拖到 A1、B4 拖到 B1、暫存的桌拖到 B4 → A1 坐乙、B1 坐丙、B4 坐甲，暫存區沒有桌', () => {
    const JIA = 101;
    const YI = 102;
    const BING = 103;
    const s0 = make([asEmployee(JIA, { tableId: 2, seatOrder: 0 }), asEmployee(YI, { tableId: 1, seatOrder: 0 }), asEmployee(BING, { tableId: 3, seatOrder: 0 })]);
    const s1 = run(s0, { type: 'moveTable', tableId: 2, to: 'staging', expectedTableId: null });
    const s2 = run(s1, { type: 'moveTable', tableId: 1, to: 2, expectedTableId: null });
    const s3 = run(s2, { type: 'moveTable', tableId: 3, to: 1, expectedTableId: null });
    const s4 = run(s3, { type: 'moveTable', tableId: 2, to: 3, expectedTableId: null });
    expect(rosterAtPosition(s4, 2), 'A1').toEqual([YI]);
    expect(rosterAtPosition(s4, 1), 'B1').toEqual([BING]);
    expect(rosterAtPosition(s4, 3), 'B4').toEqual([JIA]);
    expect(stagedIds(s4.tables)).toEqual([]);
  });
});

describe('createTable：在「未放桌」的位置新增一張空桌（SEAT-R96、SEAT-AC121）', () => {
  it('B8（位置 9）是「未放桌」→ 新增：一張沒有人、沒有備註名稱的桌在位置 9；id 是新的（31 起）；復原後刪掉，B8 回到「未放桌」', () => {
    const before = make(seatEmployees(1, 3, 2), {}, withoutPositions(allTables(), [9]));
    const after = run(before, { type: 'createTable', position: 9 });
    const created = tableAtPosition(after.tables, 9);
    expect(created).toMatchObject({ kind: 'NORMAL', position: 9, stagedAt: null, noteName: null });
    expect(created!.id).toBeGreaterThan(30);
    expect(tableById(before.tables, created!.id), '不和既有的桌同一個 id').toBeUndefined();
    expect(rosterIds(after.participants, created!.id)).toEqual([]);
  });

  it('已有 31 張以上的桌時，新的 id 不和任何一張重複', () => {
    const tables = [...withoutPositions(allTables(), [9]), stagedTable(31, EARLY), stagedTable(35, EARLY)];
    const after = run(make([], {}, tables), { type: 'createTable', position: 9 });
    const created = tableAtPosition(after.tables, 9)!;
    expect([...Array.from({ length: 32 }, (_, i) => i), 35]).not.toContain(created.id);
  });

  it('位置已有桌（例如別人剛新增或放上去）：CONFLICT，不新增（SEAT-R85）', () => {
    const before = make([]);
    expect(reject(before, { type: 'createTable', position: 9 })).toBe('CONFLICT');
  });
});

describe('deleteTable：刪除桌（SEAT-R97、SEAT-R28、SEAT-AC122、AC123）', () => {
  it('B4 桌（id 3，「主桌」，6 位）刪除：這一桌不見、B4 變成「未放桌」；6 位變成未入座（人不刪）；復原後桌子、名單順序與「主桌」都回來', () => {
    const before = make([...seatEmployees(1, 3, 6), ...seatEmployees(11, 7, 2)], { 3: '主桌' });
    const after = run(before, { type: 'deleteTable', tableId: 3 });
    expect(tableById(after.tables, 3)).toBeUndefined();
    expect(tableAtPosition(after.tables, 3)).toBeUndefined();
    for (let id = 1; id <= 6; id++) expect(positionOf(after.participants, id)).toEqual({ tableId: null, seatOrder: null });
    expect(after.participants).toHaveLength(8);
    expect(rosterIds(after.participants, 7)).toEqual([11, 12]);
  });

  it('undo 有這一桌操作前的樣子（exists true）與 6 位原本的座位', () => {
    const before = make(seatEmployees(1, 3, 6), { 3: '主桌' });
    const result = expectOk(applySeatingOperation(before, { type: 'deleteTable', tableId: 3 }));
    expect(result.undo.tables).toEqual([{ id: 3, kind: 'NORMAL', position: 3, stagedAt: null, noteName: '主桌', exists: true }]);
    expect(result.undo.participants.map((p) => p.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('空桌刪除：只有桌子不見（SEAT-AC123）', () => {
    const after = run(make([]), { type: 'deleteTable', tableId: 8 });
    expect(tableAtPosition(after.tables, 8)).toBeUndefined();
  });

  it('暫存的桌刪除：桌上的人變成一般的未入座；暫存區其他桌不變；復原後回到暫存區原本的順序（SEAT-AC123）', () => {
    const tables = [...allTables(), stagedTable(31, EARLIER), stagedTable(32, EARLY, { noteName: '供應商' })];
    const before = make([...seatEmployees(1, 31, 2), ...seatEmployees(11, 32, 1)], {}, tables);
    const after = run(before, { type: 'deleteTable', tableId: 31 });
    expect(tableById(after.tables, 31)).toBeUndefined();
    expect(positionOf(after.participants, 1)).toEqual({ tableId: null, seatOrder: null });
    expect(stagedIds(after.tables)).toEqual([32]);
  });

  it('新增的桌也可以刪（id 31 起）', () => {
    const tables = [...withoutPositions(allTables(), [9]), normalTable(31, { position: 9 })];
    const after = run(make(seatEmployees(1, 31, 1), {}, tables), { type: 'deleteTable', tableId: 31 });
    expect(tableAtPosition(after.tables, 9)).toBeUndefined();
  });

  it('已被刪除：NOT_FOUND（docs/architecture.md 第 8.1 節）', () => {
    expect(reject(make([], {}, withoutPositions(allTables(), [3])), { type: 'deleteTable', tableId: 3 })).toBe('NOT_FOUND');
  });

  it('工作人員桌不能刪（SEAT-R98、SEAT-AC126）', () => {
    rejectAny(make(seatEmployees(1, STAFF_TABLE_ID, 2)), { type: 'deleteTable', tableId: STAFF_TABLE_ID });
  });
});

describe('暫存的桌：人不能放進去，可以出來（SEAT-R92、SEAT-R94、docs/architecture.md 第 8.1 節）', () => {
  const stagedData = () =>
    make([...seatEmployees(1, 31, 2), asEmployee(WANG), ...seatEmployees(11, 7, 1)], {}, [...allTables(), stagedTable(31, EARLY)]);

  it('seat 到暫存的桌（拖移或選單）：CONFLICT，資料不變（SEAT-AC118）', () => {
    expect(reject(stagedData(), { type: 'seat', participantId: WANG, tableId: 31 })).toBe('CONFLICT');
    expect(reject(stagedData(), { type: 'seat', participantId: WANG, tableId: 31, allowOverflow: true })).toBe('CONFLICT');
    expect(reject(stagedData(), { type: 'seat', participantId: 11, tableId: 31, index: 0, allowOverflow: true })).toBe('CONFLICT');
  });

  it('seatMany 到暫存的桌：CONFLICT', () => {
    expect(reject(stagedData(), { type: 'seatMany', tableId: 31, participantIds: [WANG], allowOverflow: true })).toBe('CONFLICT');
  });

  it('暫存的桌內不能調整順序：reorder 是 CONFLICT；也沒有清空：clear 是 CONFLICT', () => {
    expect(reject(stagedData(), { type: 'reorder', tableId: 31, participantIds: [2, 1] })).toBe('CONFLICT');
    expect(reject(stagedData(), { type: 'clear', tableId: 31 })).toBe('CONFLICT');
  });

  it('暫存的桌上的人放到同一張暫存的桌的某一列（桌內拖移）：CONFLICT 或沒有作用，順序不變', () => {
    const before = stagedData();
    const result = applySeatingOperation(before, { type: 'seat', participantId: 2, tableId: 31, index: 0, allowOverflow: true });
    if (result.ok) expect(rosterIds(result.data.participants, 31)).toEqual([1, 2]);
    else expect(result.violation).toBe('CONFLICT');
  });

  it('暫存的桌上的人拖到場上的桌：離開暫存的桌入座；暫存的桌其他人往前補（SEAT-R94、SEAT-AC118）', () => {
    const after = run(stagedData(), { type: 'seat', participantId: 1, tableId: 7, allowOverflow: true });
    expect(rosterIds(after.participants, 7)).toEqual([11, 1]);
    expect(rosterIds(after.participants, 31)).toEqual([2]);
  });

  it('暫存的桌上的人「移出桌次」：變成一般的未入座；復原後回到暫存的桌原本的座號（SEAT-R94、SEAT-AC118）', () => {
    const after = run(stagedData(), { type: 'unseat', participantId: 1 });
    expect(positionOf(after.participants, 1)).toEqual({ tableId: null, seatOrder: null });
    expect(rosterIds(after.participants, 31)).toEqual([2]);
  });

  it('暫存的桌上的員工可以放進工作人員桌', () => {
    const after = run(stagedData(), { type: 'seat', participantId: 1, tableId: STAFF_TABLE_ID, allowOverflow: true });
    expect(staffIds(after.participants)).toEqual([1]);
  });
});

describe('新增的桌（id 31 起）放在位置上時和一般桌相同（D-027）', () => {
  it('可以入座、加入人員、調整順序、清空', () => {
    const tables = [...withoutPositions(allTables(), [9]), normalTable(31, { position: 9 })];
    const before = make([asEmployee(1), asEmployee(2), asEmployee(3)], {}, tables);
    const a = run(before, { type: 'seat', participantId: 1, tableId: 31 });
    const b = run(a, { type: 'seatMany', tableId: 31, participantIds: [2, 3] });
    expect(rosterIds(b.participants, 31)).toEqual([1, 2, 3]);
    const c = run(b, { type: 'reorder', tableId: 31, participantIds: [3, 1, 2] });
    expect(rosterIds(c.participants, 31)).toEqual([3, 1, 2]);
    const d = run(c, { type: 'clear', tableId: 31 });
    expect(rosterIds(d.participants, 31)).toEqual([]);
  });
});

describe('restore：復原（SEAT-R76～R78）', () => {
  it('搬移後復原：回到原本的桌次與座號，兩桌的名單順序回到操作前（SEAT-R78、SEAT-AC75）', () => {
    const before = make([
      asEmployee(1, { tableId: 3, seatOrder: 0 }),
      asEmployee(WANG, { tableId: 3, seatOrder: 1 }),
      asEmployee(2, { tableId: 3, seatOrder: 2 }),
      ...seatEmployees(11, 7, 2),
    ]);
    const moved = expectOk(applySeatingOperation(before, { type: 'seat', participantId: WANG, tableId: 7 }));
    const restored = expectOk(applySeatingOperation(moved.data, { type: 'restore', snapshot: moved.undo })).data;
    expect(rosterIds(restored.participants, 3)).toEqual([1, WANG, 2]);
    expect(rosterIds(restored.participants, 7)).toEqual([11, 12]);
  });

  it('從桌次放進工作人員桌後復原：不再是工作人員，回到原本的座號（SEAT-R78、SEAT-AC80）', () => {
    const before = make([...seatEmployees(1, 3, 3), asEmployee(WANG, { tableId: 3, seatOrder: 3 }), asEmployee(5, { tableId: 3, seatOrder: 4 })]);
    const staffed = expectOk(applySeatingOperation(before, { type: 'seat', participantId: WANG, tableId: STAFF_TABLE_ID }));
    const restored = expectOk(applySeatingOperation(staffed.data, { type: 'restore', snapshot: staffed.undo })).data;
    expect(rosterIds(restored.participants, 3)).toEqual([1, 2, 3, WANG, 5]);
    expect(staffIds(restored.participants)).toEqual([]);
  });

  it('加入多位後復原：這次加入的人全部回到未入座（SEAT-R78、SEAT-AC79）', () => {
    const before = make([...seatEmployees(1, 3, 7), asEmployee(50), asEmployee(51), asEmployee(52)]);
    const added = expectOk(applySeatingOperation(before, { type: 'seatMany', tableId: 3, participantIds: [50, 51, 52] }));
    const restored = expectOk(applySeatingOperation(added.data, { type: 'restore', snapshot: added.undo })).data;
    expect(rosterIds(restored.participants, 3)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const id of [50, 51, 52]) expect(positionOf(restored.participants, id)).toEqual({ tableId: null, seatOrder: null });
  });

  it('對調後復原：兩桌回到對調前的位置，名單、順序與備註名稱也回到原位置（SEAT-R78、SEAT-AC76）', () => {
    const before = make([...seatEmployees(1, 3, 2), ...seatEmployees(11, 7, 3)], { 3: '主桌' });
    const swapped = expectOk(applySeatingOperation(before, { type: 'moveTable', tableId: 3, to: 7, expectedTableId: 7 }));
    const restored = expectOk(applySeatingOperation(swapped.data, { type: 'restore', snapshot: swapped.undo })).data;
    expect(tableAtPosition(restored.tables, 3)).toMatchObject({ id: 3, noteName: '主桌' });
    expect(tableAtPosition(restored.tables, 7)).toMatchObject({ id: 7, noteName: null });
    expect(rosterIds(restored.participants, 3)).toEqual([1, 2]);
    expect(rosterIds(restored.participants, 7)).toEqual([11, 12, 13]);
  });

  it('搬到「未放桌」後復原：桌子回到原位置，被佔用的位置回到「未放桌」（SEAT-R78、SEAT-AC109）', () => {
    const before = make(seatEmployees(1, 3, 2), { 3: '主桌' }, withoutPositions(allTables({ 3: '主桌' }), [9]));
    const moved = expectOk(applySeatingOperation(before, { type: 'moveTable', tableId: 3, to: 9, expectedTableId: null }));
    const restored = expectOk(applySeatingOperation(moved.data, { type: 'restore', snapshot: moved.undo })).data;
    expect(tableAtPosition(restored.tables, 3)).toMatchObject({ id: 3, noteName: '主桌' });
    expect(tableAtPosition(restored.tables, 9)).toBeUndefined();
  });

  it('暫存的桌放到有桌的位置（交換）後復原：兩桌都回到原處，暫存區的順序也還原（SEAT-R78、SEAT-AC112）', () => {
    const tables = [...allTables(), stagedTable(31, EARLIER), stagedTable(32, EARLY)];
    const before = make([...seatEmployees(1, 31, 1), ...seatEmployees(11, 7, 1)], {}, tables);
    const swapped = expectOk(applySeatingOperation(before, { type: 'moveTable', tableId: 31, to: 7, expectedTableId: 7 }));
    const restored = expectOk(applySeatingOperation(swapped.data, { type: 'restore', snapshot: swapped.undo })).data;
    expect(tableAtPosition(restored.tables, 7)?.id).toBe(7);
    expect(rosterIds(restored.participants, 7)).toEqual([11]);
    expect(stagedIds(restored.tables)).toEqual([31, 32]);
    expect(viewOf(tableById(restored.tables, 31))).toEqual({ position: null, stagedAt: EARLIER, noteName: null });
  });

  it('新增後復原：新增的桌刪掉（SEAT-R78、SEAT-AC121）', () => {
    const before = make([], {}, withoutPositions(allTables(), [9]));
    const created = expectOk(applySeatingOperation(before, { type: 'createTable', position: 9 }));
    const newId = tableAtPosition(created.data.tables, 9)!.id;
    expect(created.undo.tables).toEqual([expect.objectContaining({ id: newId, exists: false })]);
    const restored = expectOk(applySeatingOperation(created.data, { type: 'restore', snapshot: created.undo })).data;
    expect(tableById(restored.tables, newId)).toBeUndefined();
    expect(tableAtPosition(restored.tables, 9)).toBeUndefined();
  });

  it('刪除後復原：以原本的 id 重建，回到原本的位置，名單、座位順序與備註名稱都還原（SEAT-R78、SEAT-AC122）', () => {
    const before = make(seatEmployees(1, 3, 6), { 3: '主桌' });
    const deleted = expectOk(applySeatingOperation(before, { type: 'deleteTable', tableId: 3 }));
    const restored = expectOk(applySeatingOperation(deleted.data, { type: 'restore', snapshot: deleted.undo })).data;
    expect(tableById(restored.tables, 3)).toMatchObject({ kind: 'NORMAL', position: 3, stagedAt: null, noteName: '主桌' });
    expect(rosterIds(restored.participants, 3)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('刪除暫存的桌後復原：回到暫存區原本的順序（SEAT-R78）', () => {
    const tables = [...allTables(), stagedTable(31, EARLIER), stagedTable(32, EARLY)];
    const before = make(seatEmployees(1, 31, 2), {}, tables);
    const deleted = expectOk(applySeatingOperation(before, { type: 'deleteTable', tableId: 31 }));
    const restored = expectOk(applySeatingOperation(deleted.data, { type: 'restore', snapshot: deleted.undo })).data;
    expect(stagedIds(restored.tables)).toEqual([31, 32]);
    expect(rosterIds(restored.participants, 31)).toEqual([1, 2]);
  });

  it('復原搬動時，原位置已被別人放了另一桌：被拒，資料不變（一個位置只能有一張桌；COM-R07、SEAT-R85）', () => {
    const before = make([], {}, withoutPositions(allTables(), [9]));
    const moved = expectOk(applySeatingOperation(before, { type: 'moveTable', tableId: 3, to: 9, expectedTableId: null }));
    // 別人在 B4（現在是「未放桌」）新增了一桌
    const othersAdded = expectOk(applySeatingOperation(moved.data, { type: 'createTable', position: 3 }));
    rejectAny(othersAdded.data, { type: 'restore', snapshot: moved.undo });
  });

  it('復原會讓某一桌變成 11 位（別人在這之間坐進來）：復原上限是 12 位，可以復原，回到原本的座號（SEAT-R88、D-018）', () => {
    // 原本王小明在 B10 桌（5）第 1 位（共 10 位），移出後別人補進 B10 桌，再復原就會變成 11 位
    const before = make([asEmployee(WANG, { tableId: 5, seatOrder: 0 }), ...seatEmployees(1, 5, 9, 1), asEmployee(60)]);
    const removed = expectOk(applySeatingOperation(before, { type: 'unseat', participantId: WANG }));
    const othersSat = expectOk(applySeatingOperation(removed.data, { type: 'seat', participantId: 60, tableId: 5 }));
    const restored = run(othersSat.data, { type: 'restore', snapshot: removed.undo });
    expect(rosterIds(restored.participants, 5)).toEqual([WANG, 1, 2, 3, 4, 5, 6, 7, 8, 9, 60]);
  });

  it('復原會讓某一桌變成 13 位（別人在這之間坐滿 12 位）：回 TABLE_LIMIT，資料不變（SEAT-R02、SEAT-R88、COM-R07）', () => {
    // 王小明在 B10 桌（5）（共 12 位），移出後別人補進第 12 位，再復原就會變成 13 位
    const before = make([asEmployee(WANG, { tableId: 5, seatOrder: 0 }), ...seatEmployees(1, 5, 11, 1), asEmployee(60)]);
    const removed = expectOk(applySeatingOperation(before, { type: 'unseat', participantId: WANG }));
    const othersSat = expectOk(
      applySeatingOperation(removed.data, { type: 'seat', participantId: 60, tableId: 5, allowOverflow: true }),
    );
    expect(rosterIds(othersSat.data.participants, 5)).toHaveLength(12);
    expect(reject(othersSat.data, { type: 'restore', snapshot: removed.undo })).toBe('TABLE_LIMIT');
  });

  it('復原的人已被別人刪除：回 NOT_FOUND（COM-R07）', () => {
    const data = make(seatEmployees(1, 3, 2));
    const snapshot: SeatingSnapshot = { participants: [{ id: 999, tableId: 3, seatOrder: 0 }], tables: [] };
    expect(reject(data, { type: 'restore', snapshot })).toBe('NOT_FOUND');
  });
});

describe('統計列（SEAT-R75、SEAT-R47）', () => {
  it('沒有任何參與人員：已入座 0／0・未入座 0・空位 300・已滿 0 桌，沒有超過的桌（SEAT-AC58）', () => {
    expect(seatingStats([], allTables())).toEqual({
      seated: 0,
      total: 0,
      unseated: 0,
      emptySeats: 300,
      fullTables: 0,
      overflowTables: 0,
    });
  });

  it('已入座是 30 桌上的人數；總人數不含工作人員；未入座是總人數減已入座；空位每桌算到 10 位；已滿是 10 位以上的桌數（沒有超過的桌時空位等於 300 減已入座）', () => {
    const participants = [
      ...seatEmployees(1, 3, 4),
      ...seatEmployees(11, 5, 10),
      ...seatEmployees(31, 7, 10),
      asEmployee(50),
      asDependent(51, 50),
      asGuest(52),
      ...seatEmployees(60, STAFF_TABLE_ID, 3),
    ];
    expect(seatingStats(participants, allTables())).toEqual({
      seated: 24,
      total: 27,
      unseated: 3,
      emptySeats: 276,
      fullTables: 2,
      overflowTables: 0,
    });
  });

  it('工作人員不算已入座、不算未入座、也不算總人數（SEAT-R47、SEAT-AC38、SEAT-AC39）', () => {
    const before = [asEmployee(WANG, { tableId: 3, seatOrder: 0 }), asEmployee(1)];
    const after = [asEmployee(WANG, { tableId: STAFF_TABLE_ID, seatOrder: 0 }), asEmployee(1)];
    expect(seatingStats(before, allTables())).toEqual({
      seated: 1,
      total: 2,
      unseated: 1,
      emptySeats: 299,
      fullTables: 0,
      overflowTables: 0,
    });
    // 從桌次放進工作人員桌：已入座與總人數各減 1，未入座不變
    expect(seatingStats(after, allTables())).toEqual({
      seated: 0,
      total: 1,
      unseated: 1,
      emptySeats: 300,
      fullTables: 0,
      overflowTables: 0,
    });
  });
});

describe('D-027 統計列只算場上的桌（SEAT-R75、SEAT-R94）', () => {
  it('SEAT-AC108：B4、B8 是「未放桌」，其他 28 桌都是空桌，參與人員 20 位都未入座 →「已入座 0／20・未入座 20・空位 280・已滿 0 桌」', () => {
    const participants = Array.from({ length: 20 }, (_, i) => asEmployee(100 + i));
    expect(seatingStats(participants, withoutPositions(allTables(), [3, 9]))).toEqual({
      seated: 0,
      total: 20,
      unseated: 20,
      emptySeats: 280,
      fullTables: 0,
      overflowTables: 0,
    });
  });

  it('暫存的桌上的人算未入座；暫存的桌不算空位、已滿與超過（SEAT-AC110）', () => {
    // B4 桌（3）有甲、乙；移到暫存區前後
    const people = [...seatEmployees(1, 3, 2), asEmployee(9)];
    expect(seatingStats(people, allTables())).toEqual({
      seated: 2,
      total: 3,
      unseated: 1,
      emptySeats: 298,
      fullTables: 0,
      overflowTables: 0,
    });
    // 移到暫存區：已入座少 2、未入座多 2；B4 變成「未放桌」，空位只算其他 29 桌
    expect(seatingStats(people, updateTable(allTables(), 3, { position: null, stagedAt: EARLY }))).toEqual({
      seated: 0,
      total: 3,
      unseated: 3,
      emptySeats: 290,
      fullTables: 0,
      overflowTables: 0,
    });
  });

  it('暫存的桌有 10、12 位：不算已滿、不算超過，人都算未入座', () => {
    const tables = [...allTables(), stagedTable(31, EARLIER), stagedTable(32, EARLY)];
    const people = [...seatEmployees(1, 31, 10), ...seatEmployees(21, 32, 12), ...seatEmployees(41, 5, 10)];
    expect(seatingStats(people, tables)).toEqual({
      seated: 10,
      total: 32,
      unseated: 22,
      emptySeats: 290,
      fullTables: 1,
      overflowTables: 0,
    });
  });

  it('搬到別的位置、新增的桌（id 31 起）放在位置上：照位置上的桌算', () => {
    // B8（9）的桌刪掉，在 B8 新增一張 id 31 的桌、坐 10 位；30 個位置都有桌
    const tables = [...withoutPositions(allTables(), [9]), normalTable(31, { position: 9 })];
    const people = seatEmployees(1, 31, 10);
    expect(seatingStats(people, tables)).toEqual({
      seated: 10,
      total: 10,
      unseated: 0,
      emptySeats: 290,
      fullTables: 1,
      overflowTables: 0,
    });
  });

  it('30 個位置都是「未放桌」、桌子都在暫存區：空位 0，所有人都是未入座', () => {
    const tables = allTables().map((t, i) => (t.kind === 'NORMAL' ? { ...t, position: null, stagedAt: `2025-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z` } : t));
    const people = seatEmployees(1, 3, 4);
    expect(seatingStats(people, tables)).toEqual({ seated: 0, total: 4, unseated: 4, emptySeats: 0, fullTables: 0, overflowTables: 0 });
  });

  it('工作人員仍不算在內（SEAT-R47）', () => {
    const tables = [...allTables(), stagedTable(31, EARLY)];
    const people = [...seatEmployees(1, STAFF_TABLE_ID, 3), ...seatEmployees(11, 31, 2)];
    expect(seatingStats(people, tables)).toMatchObject({ seated: 0, total: 2, unseated: 2 });
  });
});

// ---- D-018 每桌可以放到 12 位 ----

/** 從 first 起連續 count 個 id */
const ids = (first: number, count: number): number[] => Array.from({ length: count }, (_, i) => first + i);

describe('D-018 拖移（seat 帶 allowOverflow）：每桌最多 12 位（SEAT-R02、SEAT-R20、SEAT-R88、docs/architecture.md 第 8.1 節）', () => {
  it.each([9, 10, 11])('有 %i 位的桌：未入座的人放進來，排到名單最後（SEAT-R16、SEAT-R20、SEAT-AC91）', (n) => {
    const before = make([...seatEmployees(1, 5, n), asEmployee(WANG)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 5, allowOverflow: true });
    expect(rosterIds(after.participants, 5)).toEqual([...ids(1, n), WANG]);
    expect(positionOf(after.participants, WANG)).toEqual({ tableId: 5, seatOrder: n });
  });

  it('已有 12 位：不入座，回 TABLE_LIMIT，資料不變（SEAT-R20、SEAT-AC14、SEAT-AC92）', () => {
    const before = make([...seatEmployees(1, 5, 12), asEmployee(WANG)]);
    expect(reject(before, { type: 'seat', participantId: WANG, tableId: 5, allowOverflow: true })).toBe('TABLE_LIMIT');
    expect(reject(before, { type: 'seat', participantId: WANG, tableId: 5, index: 0, allowOverflow: true })).toBe(
      'TABLE_LIMIT',
    );
  });

  it('10 位的桌連續放進第 11、12 位，第 13 位回 TABLE_LIMIT（邊界 10／11／12／13）', () => {
    const before = make([...seatEmployees(1, 5, 10), asEmployee(50), asEmployee(51), asEmployee(52)]);
    const eleven = run(before, { type: 'seat', participantId: 50, tableId: 5, allowOverflow: true });
    const twelve = run(eleven, { type: 'seat', participantId: 51, tableId: 5, allowOverflow: true });
    expect(rosterIds(twelve.participants, 5)).toEqual([...ids(1, 10), 50, 51]);
    expect(reject(twelve, { type: 'seat', participantId: 52, tableId: 5, allowOverflow: true })).toBe('TABLE_LIMIT');
  });

  it('放在名單的某一列：插入那一列，原本那一列與之後的人往後移，成為 11 位（SEAT-R17）', () => {
    const before = make([...seatEmployees(1, 5, 10), asEmployee(WANG)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 5, index: 2, allowOverflow: true });
    expect(rosterIds(after.participants, 5)).toEqual([1, 2, WANG, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('放在第 12 列（空位列）：排到名單最後，名單仍從座號 1 連續（SEAT-R17、SEAT-R06）', () => {
    const before = make([...seatEmployees(1, 5, 10), asEmployee(WANG)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 5, index: 11, allowOverflow: true });
    expect(rosterIds(after.participants, 5)).toEqual([...ids(1, 10), WANG]);
    expect(positionOf(after.participants, WANG)).toEqual({ tableId: 5, seatOrder: 10 });
  });

  it('搬移：已入座的人拖到 10 位的桌，成為第 11 位；原桌其他人依原本順序往前補（SEAT-R19、SEAT-R06）', () => {
    const before = make([
      asEmployee(40, { tableId: 3, seatOrder: 0 }),
      asEmployee(WANG, { tableId: 3, seatOrder: 1 }),
      asEmployee(41, { tableId: 3, seatOrder: 2 }),
      ...seatEmployees(1, 5, 10),
    ]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 5, allowOverflow: true });
    expect(rosterIds(after.participants, 5)).toEqual([...ids(1, 10), WANG]);
    expect(rosterIds(after.participants, 3)).toEqual([40, 41]);
  });

  it('搬移：已入座的人拖到 12 位的桌，回 TABLE_LIMIT，留在原桌（SEAT-R20、SEAT-AC15）', () => {
    const before = make([asEmployee(WANG, { tableId: 3, seatOrder: 0 }), ...seatEmployees(1, 5, 12)]);
    expect(reject(before, { type: 'seat', participantId: WANG, tableId: 5, allowOverflow: true })).toBe('TABLE_LIMIT');
  });

  it('工作人員拖到 11 位的桌：入座第 12 位，不再是工作人員（SEAT-R45）', () => {
    const before = make([asEmployee(WANG, { tableId: STAFF_TABLE_ID, seatOrder: 0 }), ...seatEmployees(1, 5, 11)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 5, allowOverflow: true });
    expect(rosterIds(after.participants, 5)).toEqual([...ids(1, 11), WANG]);
    expect(staffIds(after.participants)).toEqual([]);
  });

  it('工作人員拖到 12 位的桌：回 TABLE_LIMIT，仍是工作人員（SEAT-R45、SEAT-AC44）', () => {
    const before = make([asEmployee(WANG, { tableId: STAFF_TABLE_ID, seatOrder: 0 }), ...seatEmployees(1, 5, 12)]);
    expect(reject(before, { type: 'seat', participantId: WANG, tableId: 5, allowOverflow: true })).toBe('TABLE_LIMIT');
  });

  it('12 位的桌內把人放到同一桌的另一列：只改變順序，不受上限影響（SEAT-R32、SEAT-R33）', () => {
    const before = make(seatEmployees(1, 5, 12));
    const after = run(before, { type: 'seat', participantId: 12, tableId: 5, index: 0, allowOverflow: true });
    expect(rosterIds(after.participants, 5)).toEqual([12, ...ids(1, 11)]);
  });

  it('12 位的桌，桌內的人放回同一桌的圓形（沒有指定列）：沒有作用（SEAT-Q03 的目前假設）', () => {
    expectNoEffect(make(seatEmployees(1, 5, 12)), { type: 'seat', participantId: 3, tableId: 5, allowOverflow: true });
  });

  it('allowOverflow: false 與不帶相同：10 位的桌回 TABLE_FULL（docs/architecture.md 第 8.1 節）', () => {
    const before = make([...seatEmployees(1, 5, 10), asEmployee(WANG)]);
    expect(reject(before, { type: 'seat', participantId: WANG, tableId: 5, allowOverflow: false })).toBe('TABLE_FULL');
  });

  it.each([10, 11, 12])(
    '不帶 allowOverflow（選擇桌次）：有 %i 位的桌回 TABLE_FULL，不是 TABLE_LIMIT（SEAT-R23、SEAT-R86、SEAT-R88、SEAT-AC94、SEAT-AC97）',
    (n) => {
      const before = make([...seatEmployees(1, 5, n), asEmployee(WANG, { tableId: 3, seatOrder: 0 }), asEmployee(60)]);
      expect(reject(before, { type: 'seat', participantId: 60, tableId: 5 })).toBe('TABLE_FULL');
      expect(reject(before, { type: 'seat', participantId: WANG, tableId: 5 })).toBe('TABLE_FULL');
    },
  );
});

describe('D-018 工作人員桌：和一般桌相同，標準 10 位、最多 12 位（SEAT-R42、SEAT-AC42、SEAT-AC95）', () => {
  it.each([9, 10, 11])('帶 allowOverflow：工作人員桌有 %i 位，未入座的員工放進來成為工作人員（SEAT-R42、SEAT-AC95）', (n) => {
    const before = make([...seatEmployees(1, STAFF_TABLE_ID, n), asEmployee(WANG)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: STAFF_TABLE_ID, allowOverflow: true });
    expect(staffIds(after.participants)).toEqual([...ids(1, n), WANG]);
  });

  it('帶 allowOverflow：從桌次拖進 10 位的工作人員桌，成為第 11 位；原桌其他人往前補（SEAT-R43）', () => {
    const before = make([
      asEmployee(WANG, { tableId: 3, seatOrder: 0 }),
      asEmployee(40, { tableId: 3, seatOrder: 1 }),
      ...seatEmployees(1, STAFF_TABLE_ID, 10),
    ]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: STAFF_TABLE_ID, allowOverflow: true });
    expect(staffIds(after.participants)).toHaveLength(11);
    expect(staffIds(after.participants)).toContain(WANG);
    expect(rosterIds(after.participants, 3)).toEqual([40]);
  });

  it('帶 allowOverflow：工作人員桌已有 12 位，回 STAFF_TABLE_LIMIT，員工留在原處（SEAT-R42、SEAT-AC42、SEAT-AC95）', () => {
    const before = make([
      ...seatEmployees(1, STAFF_TABLE_ID, 12),
      asEmployee(WANG),
      asEmployee(200, { tableId: 3, seatOrder: 0 }),
    ]);
    expect(reject(before, { type: 'seat', participantId: WANG, tableId: STAFF_TABLE_ID, allowOverflow: true })).toBe(
      'STAFF_TABLE_LIMIT',
    );
    expect(reject(before, { type: 'seat', participantId: 200, tableId: STAFF_TABLE_ID, allowOverflow: true })).toBe(
      'STAFF_TABLE_LIMIT',
    );
  });

  it('工作人員桌 11 位：帶 allowOverflow 連續拖進兩位，第一位成為第 12 位，第二位回 STAFF_TABLE_LIMIT（SEAT-AC42）', () => {
    const before = make([...seatEmployees(1, STAFF_TABLE_ID, 11), asEmployee(50), asEmployee(51, { tableId: 3, seatOrder: 0 })]);
    const twelve = run(before, { type: 'seat', participantId: 50, tableId: STAFF_TABLE_ID, allowOverflow: true });
    expect(staffIds(twelve.participants)).toHaveLength(12);
    expect(reject(twelve, { type: 'seat', participantId: 51, tableId: STAFF_TABLE_ID, allowOverflow: true })).toBe(
      'STAFF_TABLE_LIMIT',
    );
  });

  it.each([10, 11, 12])('不帶 allowOverflow：工作人員桌有 %i 位，回 STAFF_TABLE_FULL（SEAT-R88、PPL-R54）', (n) => {
    const before = make([...seatEmployees(1, STAFF_TABLE_ID, n), asEmployee(WANG)]);
    expect(reject(before, { type: 'seat', participantId: WANG, tableId: STAFF_TABLE_ID })).toBe('STAFF_TABLE_FULL');
  });

  it('帶 allowOverflow 也只有員工可以放進工作人員桌：眷屬、外部貴賓回 STAFF_EMPLOYEE_ONLY（SEAT-R41）', () => {
    const before = make([...seatEmployees(1, STAFF_TABLE_ID, 3), asEmployee(WANG), asDependent(WANG_DEP, WANG), asGuest(LIN)]);
    expect(reject(before, { type: 'seat', participantId: WANG_DEP, tableId: STAFF_TABLE_ID, allowOverflow: true })).toBe(
      'STAFF_EMPLOYEE_ONLY',
    );
    expect(reject(before, { type: 'seat', participantId: LIN, tableId: STAFF_TABLE_ID, allowOverflow: true })).toBe(
      'STAFF_EMPLOYEE_ONLY',
    );
  });

  it('已經是工作人員的人放回 12 位的工作人員桌：沒有作用（SEAT-R51）', () => {
    expectNoEffect(make(seatEmployees(1, STAFF_TABLE_ID, 12)), {
      type: 'seat',
      participantId: 4,
      tableId: STAFF_TABLE_ID,
      allowOverflow: true,
    });
  });
});

describe('D-018「加入人員」（seatMany 帶 allowOverflow）：最多勾到這一桌 12 位（SEAT-R30、SEAT-R31、SEAT-R50、SEAT-AC93）', () => {
  it.each([
    [0, 12],
    [7, 5],
    [9, 3],
    [10, 2],
    [11, 1],
  ])('有 %i 位的桌加入 %i 位：剛好 12 位，依勾選順序排到最後（SEAT-R31、SEAT-Q06）', (n, k) => {
    const incoming = ids(200, k);
    const picked = [...incoming].reverse();
    const before = make([...seatEmployees(1, 3, n), ...incoming.map((id) => asEmployee(id))]);
    const after = run(before, { type: 'seatMany', tableId: 3, participantIds: picked, allowOverflow: true });
    expect(rosterIds(after.participants, 3)).toEqual([...ids(1, n), ...picked]);
  });

  it.each([
    [7, 6],
    [10, 3],
    [11, 2],
    [12, 1],
  ])('有 %i 位的桌加入 %i 位：超過 12 位，整批不加入，回 TABLE_LIMIT', (n, k) => {
    const incoming = ids(200, k);
    const before = make([...seatEmployees(1, 3, n), ...incoming.map((id) => asEmployee(id))]);
    expect(reject(before, { type: 'seatMany', tableId: 3, participantIds: incoming, allowOverflow: true })).toBe(
      'TABLE_LIMIT',
    );
  });

  it('勾的人裡有已經在這一桌的人：不算新加入；11 位的桌加入自己人與 1 位新的人，剛好 12 位', () => {
    const before = make([...seatEmployees(1, 3, 11), asEmployee(200)]);
    const after = run(before, { type: 'seatMany', tableId: 3, participantIds: [5, 200], allowOverflow: true });
    expect(rosterIds(after.participants, 3)).toEqual([...ids(1, 11), 200]);
  });

  it.each([
    [8, 4],
    [10, 2],
    [11, 1],
  ])('工作人員桌有 %i 位、加入 %i 位：剛好 12 位，都成為工作人員（SEAT-R50）', (n, k) => {
    const incoming = ids(200, k);
    const before = make([...seatEmployees(1, STAFF_TABLE_ID, n), ...incoming.map((id) => asEmployee(id))]);
    const after = run(before, { type: 'seatMany', tableId: STAFF_TABLE_ID, participantIds: incoming, allowOverflow: true });
    expect(staffIds(after.participants)).toEqual([...ids(1, n), ...incoming]);
  });

  it.each([
    [9, 4],
    [11, 2],
    [12, 1],
  ])('工作人員桌有 %i 位、加入 %i 位：超過 12 位，整批不加入，回 STAFF_TABLE_LIMIT（SEAT-R50）', (n, k) => {
    const incoming = ids(200, k);
    const before = make([...seatEmployees(1, STAFF_TABLE_ID, n), ...incoming.map((id) => asEmployee(id))]);
    expect(
      reject(before, { type: 'seatMany', tableId: STAFF_TABLE_ID, participantIds: incoming, allowOverflow: true }),
    ).toBe('STAFF_TABLE_LIMIT');
  });

  it('不帶 allowOverflow：9 位的桌加入 2 位回 TABLE_FULL；工作人員桌 9 位加入 2 位回 STAFF_TABLE_FULL（docs/architecture.md 第 8.1 節）', () => {
    const before = make([...seatEmployees(1, 3, 9), ...seatEmployees(20, STAFF_TABLE_ID, 9), asEmployee(200), asEmployee(201)]);
    expect(reject(before, { type: 'seatMany', tableId: 3, participantIds: [200, 201] })).toBe('TABLE_FULL');
    expect(reject(before, { type: 'seatMany', tableId: STAFF_TABLE_ID, participantIds: [200, 201] })).toBe(
      'STAFF_TABLE_FULL',
    );
  });

  it('10 位的桌加入 2 位後復原：這 2 位回到未入座，B4 桌（3）回到原本的 10 位（SEAT-R78、SEAT-AC79）', () => {
    const before = make([...seatEmployees(1, 3, 10), asEmployee(200), asEmployee(201)]);
    const added = expectOk(
      applySeatingOperation(before, { type: 'seatMany', tableId: 3, participantIds: [200, 201], allowOverflow: true }),
    );
    const restored = expectOk(applySeatingOperation(added.data, { type: 'restore', snapshot: added.undo })).data;
    expect(rosterIds(restored.participants, 3)).toEqual(ids(1, 10));
    for (const id of [200, 201]) expect(positionOf(restored.participants, id)).toEqual({ tableId: null, seatOrder: null });
  });
});

describe('D-018 復原、對調、調整順序、清空可以處理 11、12 位的桌（SEAT-R88、SEAT-AC98）', () => {
  it('11 位的桌移出一位後按「復原」：回到 11 位、原本的座號（SEAT-R78、SEAT-AC98）', () => {
    const before = make(seatEmployees(1, 5, 11));
    const removed = expectOk(applySeatingOperation(before, { type: 'unseat', participantId: 4 }));
    expect(rosterIds(removed.data.participants, 5)).toHaveLength(10);
    const restored = run(removed.data, { type: 'restore', snapshot: removed.undo });
    expect(rosterIds(restored.participants, 5)).toEqual(ids(1, 11));
    expect(positionOf(restored.participants, 4)).toEqual({ tableId: 5, seatOrder: 3 });
  });

  it('12 位的桌把第 12 位搬到別桌後復原：回到 12 位（SEAT-R78）', () => {
    const before = make(seatEmployees(1, 5, 12));
    const moved = expectOk(applySeatingOperation(before, { type: 'seat', participantId: 12, tableId: 7, allowOverflow: true }));
    const restored = run(moved.data, { type: 'restore', snapshot: moved.undo });
    expect(rosterIds(restored.participants, 5)).toEqual(ids(1, 12));
    expect(rosterIds(restored.participants, 7)).toEqual([]);
  });

  it('工作人員桌 11 位移出一位、別人補進後再復原：變成 12 位，可以復原（SEAT-R88）', () => {
    const before = make([...seatEmployees(1, STAFF_TABLE_ID, 11), asEmployee(60)]);
    const removed = expectOk(applySeatingOperation(before, { type: 'unseat', participantId: 3 }));
    const othersIn = expectOk(
      applySeatingOperation(removed.data, { type: 'seat', participantId: 60, tableId: STAFF_TABLE_ID, allowOverflow: true }),
    );
    const restored = run(othersIn.data, { type: 'restore', snapshot: removed.undo });
    expect(staffIds(restored.participants)).toEqual([...ids(1, 11), 60]);
  });

  it('工作人員桌 12 位移出一位、別人補進第 12 位後再復原：會變成 13 位，回 STAFF_TABLE_LIMIT，資料不變（SEAT-R88、COM-R07）', () => {
    const before = make([...seatEmployees(1, STAFF_TABLE_ID, 12), asEmployee(60)]);
    const removed = expectOk(applySeatingOperation(before, { type: 'unseat', participantId: 3 }));
    const othersIn = expectOk(
      applySeatingOperation(removed.data, { type: 'seat', participantId: 60, tableId: STAFF_TABLE_ID, allowOverflow: true }),
    );
    expect(reject(othersIn.data, { type: 'restore', snapshot: removed.undo })).toBe('STAFF_TABLE_LIMIT');
  });

  it('11 位的 B10 桌（5）和 9 位的 B13 桌（6）對調：名單整組交換，B13 的位置變成 11 位（SEAT-R35、SEAT-AC98）', () => {
    const before = make([...seatEmployees(1, 5, 11), ...seatEmployees(31, 6, 9)]);
    const after = run(before, { type: 'moveTable', tableId: 5, to: 6, expectedTableId: 6 });
    expect(rosterAtPosition(after, 6)).toEqual(ids(1, 11));
    expect(rosterAtPosition(after, 5)).toEqual(ids(31, 9));
  });

  it('12 位的桌和 12 位的桌對調、12 位的桌和空桌對調：都可以（SEAT-R35、SEAT-R36）', () => {
    const before = make([...seatEmployees(1, 5, 12), ...seatEmployees(31, 6, 12)], { 5: '主桌' });
    const swapped = run(before, { type: 'moveTable', tableId: 5, to: 6, expectedTableId: 6 });
    expect(rosterAtPosition(swapped, 5)).toEqual(ids(31, 12));
    expect(rosterAtPosition(swapped, 6)).toEqual(ids(1, 12));
    // 「主桌」那一桌（id 5）現在在 B13 的位置（6），再和 B8 的位置（9，空桌）對調
    const moved = run(swapped, { type: 'moveTable', tableId: 5, to: 9, expectedTableId: 9 });
    expect(rosterAtPosition(moved, 9)).toEqual(ids(1, 12));
    expect(tableAtPosition(moved.tables, 9)?.noteName).toBe('主桌');
    expect(rosterAtPosition(moved, 6)).toEqual([]);
  });

  it('12 位的桌也可以搬到「未放桌」、移到暫存區再放回（D-027）', () => {
    const before = make(seatEmployees(1, 5, 12), {}, withoutPositions(allTables(), [9]));
    const moved = run(before, { type: 'moveTable', tableId: 5, to: 9, expectedTableId: null });
    const staged = run(moved, { type: 'moveTable', tableId: 5, to: 'staging', expectedTableId: null });
    const back = run(staged, { type: 'moveTable', tableId: 5, to: 5, expectedTableId: null });
    expect(rosterAtPosition(back, 5)).toEqual(ids(1, 12));
  });

  it('12 位的桌可以調整順序（SEAT-R32、SEAT-R33）', () => {
    const before = make(seatEmployees(1, 5, 12));
    const next = [12, 11, ...ids(1, 10)];
    const after = run(before, { type: 'reorder', tableId: 5, participantIds: next });
    expect(rosterIds(after.participants, 5)).toEqual(next);
  });

  it('12 位的桌清空：12 位都回到未入座；復原後回到原本的座號（SEAT-R29、SEAT-R78）', () => {
    const before = make(seatEmployees(1, 5, 12));
    const cleared = run(before, { type: 'clear', tableId: 5 });
    expect(rosterIds(cleared.participants, 5)).toEqual([]);
  });
});

describe('D-018 統計列（SEAT-R75）', () => {
  it('空位每桌只算到 10 位（超過的桌算 0）；已滿是 10 位以上的桌數（含超過）；超過是 11、12 位的桌數；工作人員桌都不算', () => {
    const participants = [
      ...seatEmployees(1, 3, 4), // 4 位：空位 6
      ...seatEmployees(11, 5, 11), // 11 位：超過，空位 0
      ...seatEmployees(31, 7, 10), // 10 位：已滿，空位 0
      ...seatEmployees(51, 9, 12), // 12 位：超過，空位 0
      asEmployee(80),
      ...seatEmployees(90, STAFF_TABLE_ID, 12),
    ];
    expect(seatingStats(participants, allTables())).toEqual({
      seated: 37,
      total: 38,
      unseated: 1,
      // 6 + 其他 26 桌 × 10；不是 300 − 37
      emptySeats: 266,
      fullTables: 3,
      overflowTables: 2,
    });
  });

  it('SEAT-AC91：B10 桌（5）10 位再放進 1 位 → 已滿 1 桌・超過 1 桌，空位不因 B10 桌變成負數', () => {
    const before = make([...seatEmployees(1, 5, 10), asEmployee(WANG)]);
    expect(seatingStats(before.participants, before.tables)).toEqual({
      seated: 10,
      total: 11,
      unseated: 1,
      emptySeats: 290,
      fullTables: 1,
      overflowTables: 0,
    });
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 5, allowOverflow: true });
    expect(seatingStats(after.participants, after.tables)).toEqual({
      seated: 11,
      total: 11,
      unseated: 0,
      emptySeats: 290,
      fullTables: 1,
      overflowTables: 1,
    });
  });

  it('30 桌都是 12 位：空位 0、已滿 30 桌、超過 30 桌', () => {
    const participants = Array.from({ length: 30 }, (_, t) => seatEmployees(1000 + t * 20, t + 1, 12)).flat();
    expect(seatingStats(participants, allTables())).toEqual({
      seated: 360,
      total: 360,
      unseated: 0,
      emptySeats: 0,
      fullTables: 30,
      overflowTables: 30,
    });
  });

  it('工作人員桌 11、12 位不算已滿、也不算超過（SEAT-R47、SEAT-R75）', () => {
    expect(seatingStats(seatEmployees(1, STAFF_TABLE_ID, 12), allTables())).toEqual({
      seated: 0,
      total: 0,
      unseated: 0,
      emptySeats: 300,
      fullTables: 0,
      overflowTables: 0,
    });
  });
});

describe('D-018 桌次狀態（SEAT-R02、SEAT-R11、2.1.9）', () => {
  it.each([
    [0, 'open'],
    [1, 'open'],
    [9, 'open'],
    [10, 'full'],
    [11, 'over'],
    [12, 'over'],
  ] as const)('%i 位：%s', (count, status) => {
    expect(tableStatus(count)).toBe(status);
  });
});
