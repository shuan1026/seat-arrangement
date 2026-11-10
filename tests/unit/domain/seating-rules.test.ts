// 座位指令的業務規則（前端與後端共用的純函式）：docs/spec/seating.md 第 3 節
// SEAT-R01、R02（30 桌、每桌 10 位）、R06（名單連續、有人離開時往前補，SEAT-Q01）、R16～R20（入座、插入、搬移、已滿）、
// R26、R28（移出）、R29（清空、備註名稱保留）、R30、R31（加入人員，SEAT-Q06：依勾選順序）、R32、R33（調整順序）、
// R35、R36、R38（對調）、R40～R46、R50、R51（工作人員桌）、R75（統計列）、R76～R78（復原的範圍）；
// docs/architecture.md 第 7.2 節（每桌最多 10 位、工作人員桌只放員工、seatOrder 重排為 0..n-1）、第 8.1 節（每個指令回傳 undo）；
// docs/spec/README.md COM-R07（別人剛改過資料、操作不能完成）。
//
// 假設 src/domain/seating-rules.ts 的匯出（實作請照這個介面）：
//
//   import type { Participant, SeatTable } from '@/contracts/entities';
//   import type { SeatingOperation, SeatingSnapshot } from '@/contracts/seating';
//
//   export type SeatingData = { participants: Participant[]; tables: SeatTable[] };
//   export type SeatingViolation = 'TABLE_FULL' | 'STAFF_TABLE_FULL' | 'STAFF_EMPLOYEE_ONLY' | 'NOT_FOUND' | 'CONFLICT';
//   export type SeatingRuleResult =
//     | { ok: true; data: SeatingData; undo: SeatingSnapshot }
//     | { ok: false; violation: SeatingViolation };
//
//   /** 自動排座（autoArrange）不在這裡處理，見 src/server/services/seating.ts 的 registerAutoArranger */
//   export function applySeatingOperation(data: SeatingData, op: Exclude<SeatingOperation, { type: 'autoArrange' }>): SeatingRuleResult;
//
//   export type SeatingStats = { seated: number; total: number; unseated: number; emptySeats: number; fullTables: number };
//   export function seatingStats(participants: readonly Participant[]): SeatingStats;
//
// 回傳約定：
// - 不修改傳入的 data；成功時 data 是操作後的完整資料（全部參與人員與桌次）。
// - 一般桌的 seatOrder 一律是 0..n-1 連續（名單順序）；工作人員桌的 seatOrder 不規定（SEAT-R34 依預設排序顯示）。
// - undo 正好列出「位置（tableId、seatOrder）有改變的參與人員」與「備註名稱有改變的桌次」，值是操作前的狀態；
//   把 undo 用 restore 送回去，就回到操作前。沒有任何改變（例如 SEAT-R38、R51、SEAT-Q03）時 ok 為 true、undo 兩個陣列都是空的。
// - 違反規則時 ok 為 false，violation 是對應的錯誤碼（src/contracts/errors.ts）。
import { describe, expect, it } from 'vitest';
import { STAFF_TABLE_ID, TABLE_CAPACITY, type Participant } from '@/contracts/entities';
import type { SeatingOperation, SeatingSnapshot } from '@/contracts/seating';
import { applySeatingOperation, seatingStats, type SeatingData, type SeatingRuleResult } from '@/domain/seating-rules';
import {
  allTables,
  asDependent,
  asEmployee,
  asGuest,
  positionOf,
  rosterIds,
  seatEmployees,
  staffIds,
} from '../../helpers/seating-fixtures';

type Op = Exclude<SeatingOperation, { type: 'autoArrange' }>;

const make = (participants: Participant[], noteNames: Record<number, string> = {}): SeatingData => ({
  participants,
  tables: allTables(noteNames),
});

function expectOk(result: SeatingRuleResult): Extract<SeatingRuleResult, { ok: true }> {
  if (!result.ok) throw new Error(`預期成功，卻違反 ${result.violation}`);
  return result;
}

function expectViolation(result: SeatingRuleResult): string {
  if (result.ok) throw new Error('預期違反規則，卻成功');
  return result.violation;
}

/** 一般桌的 seatOrder 是 0..n-1 連續（docs/architecture.md 第 7.2 節） */
function expectContiguous(data: SeatingData) {
  for (let t = 1; t <= 30; t++) {
    const orders = data.participants
      .filter((p) => p.tableId === t)
      .map((p) => p.seatOrder)
      .sort((a, b) => (a ?? -1) - (b ?? -1));
    expect(orders, `第 ${t} 桌的座號`).toEqual(orders.map((_, i) => i));
  }
  for (const p of data.participants) {
    if (p.tableId === null) expect(p.seatOrder, `未入座的 ${p.id} 沒有座號`).toBeNull();
  }
}

/** undo 正好是「有改變的人與桌」操作前的值 */
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
    .filter((t) => after.tables.find((x) => x.id === t.id)?.noteName !== t.noteName)
    .map((t) => t.id)
    .sort((a, b) => a - b);
  expect(undo.tables.map((t) => t.id).sort((a, b) => a - b)).toEqual(changedTables);
  for (const u of undo.tables) {
    expect(u.noteName).toBe(before.tables.find((t) => t.id === u.id)?.noteName ?? null);
  }
}

/** 把 undo 送回 restore，就回到操作前（SEAT-R78） */
function expectUndoRestores(before: SeatingData, after: SeatingData, undo: SeatingSnapshot) {
  const restored = expectOk(applySeatingOperation(after, { type: 'restore', snapshot: undo })).data;
  for (const p of before.participants) {
    expect(positionOf(restored.participants, p.id), `參與人員 ${p.id}`).toEqual(positionOf(before.participants, p.id));
  }
  for (const t of before.tables) {
    expect(restored.tables.find((x) => x.id === t.id)?.noteName ?? null, `第 ${t.id} 桌的備註名稱`).toBe(t.noteName);
  }
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
  expect(result.data.tables).toHaveLength(31);
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

/** 沒有作用：成功、undo 為空、位置都不變 */
function expectNoEffect(before: SeatingData, op: Op) {
  const result = expectOk(applySeatingOperation(before, op));
  expect(result.undo).toEqual({ participants: [], tables: [] });
  for (const p of before.participants) {
    expect(positionOf(result.data.participants, p.id)).toEqual(positionOf(before.participants, p.id));
  }
  for (const t of before.tables) {
    expect(result.data.tables.find((x) => x.id === t.id)?.noteName ?? null).toBe(t.noteName);
  }
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

  it('第 10 位可以入座，滿 10 位後第 11 位不能入座（SEAT-R02、SEAT-AC13）', () => {
    const before = make([...seatEmployees(1, 5, 9), asEmployee(WANG), asEmployee(200)]);
    const after = run(before, { type: 'seat', participantId: WANG, tableId: 5 });
    expect(rosterIds(after.participants, 5)).toHaveLength(TABLE_CAPACITY);
    expect(reject(after, { type: 'seat', participantId: 200, tableId: 5 })).toBe('TABLE_FULL');
  });

  it('目標桌已滿、被拖的人不在這一桌：不入座，回 TABLE_FULL，資料不變（SEAT-R20、SEAT-AC14）', () => {
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
    // 第 3 桌：1、王小明、2、3；第 7 桌：11、12
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

  it('目標桌已滿：不搬移，回 TABLE_FULL，被拖的人留在原桌（SEAT-R20、SEAT-AC15）', () => {
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

  it('工作人員桌有 9 位時還能放 1 位；滿 10 位後不能再放：回 STAFF_TABLE_FULL（SEAT-R05、SEAT-R42、SEAT-AC42）', () => {
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

  it('工作人員放到已滿的桌：回 TABLE_FULL，仍是工作人員（SEAT-R45、SEAT-AC44）', () => {
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

  it('超過剩餘的座位數：整批不加入，回 TABLE_FULL（SEAT-R30）', () => {
    const before = make([...seatEmployees(1, 3, 7), asEmployee(50), asEmployee(51), asEmployee(52), asEmployee(53)]);
    expect(reject(before, { type: 'seatMany', tableId: 3, participantIds: [50, 51, 52, 53] })).toBe('TABLE_FULL');
  });

  it('其中一位找不到（已被別人刪除）：整批不加入，回 NOT_FOUND（COM-R07）', () => {
    const before = make([asEmployee(50)]);
    expect(reject(before, { type: 'seatMany', tableId: 3, participantIds: [50, 999] })).toBe('NOT_FOUND');
  });

  it('加入工作人員桌：已入座與未入座的員工都成為工作人員，已入座的人離開原桌（SEAT-R50、SEAT-AC47）', () => {
    // 工作人員桌 8 位；陳大華（60）在第 3 桌第 2 列；乙（61）未入座
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

  it('加入工作人員桌超過剩餘位數：整批不加入，回 STAFF_TABLE_FULL（SEAT-R42、SEAT-R50）', () => {
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

describe('swap：對調桌次（SEAT-R35、R36、R38）', () => {
  it('兩桌的名單（含順序）與備註名稱整組對調（SEAT-R35、SEAT-AC30）', () => {
    // 第 3 桌「主桌」：甲 1、乙 2；第 7 桌沒有備註名稱：丙 11、丁 12、戊 13
    const before = make([...seatEmployees(1, 3, 2), ...seatEmployees(11, 7, 3)], { 3: '主桌' });
    const after = run(before, { type: 'swap', tableA: 3, tableB: 7 });
    expect(rosterIds(after.participants, 3)).toEqual([11, 12, 13]);
    expect(rosterIds(after.participants, 7)).toEqual([1, 2]);
    expect(after.tables.find((t) => t.id === 3)?.noteName).toBeNull();
    expect(after.tables.find((t) => t.id === 7)?.noteName).toBe('主桌');
  });

  it('已滿的桌次也可以對調（SEAT-R35、SEAT-AC35）', () => {
    const before = make([...seatEmployees(1, 3, 3), ...seatEmployees(11, 7, 10)]);
    const after = run(before, { type: 'swap', tableA: 3, tableB: 7 });
    expect(rosterIds(after.participants, 3)).toHaveLength(10);
    expect(rosterIds(after.participants, 7)).toEqual([1, 2, 3]);
  });

  it('拖到空桌：整桌（名單與備註名稱）搬過去，原本的桌變成空桌、沒有備註名稱（SEAT-R36、SEAT-AC32）', () => {
    const before = make(seatEmployees(1, 3, 2), { 3: '主桌' });
    const after = run(before, { type: 'swap', tableA: 3, tableB: 9 });
    expect(rosterIds(after.participants, 9)).toEqual([1, 2]);
    expect(after.tables.find((t) => t.id === 9)?.noteName).toBe('主桌');
    expect(rosterIds(after.participants, 3)).toEqual([]);
    expect(after.tables.find((t) => t.id === 3)?.noteName).toBeNull();
  });

  it('和自己對調：沒有作用（SEAT-R38、SEAT-AC33）', () => {
    expectNoEffect(make(seatEmployees(1, 3, 2), { 3: '主桌' }), { type: 'swap', tableA: 3, tableB: 3 });
  });

  it('其他桌與工作人員桌不受影響', () => {
    const before = make([...seatEmployees(1, 3, 2), ...seatEmployees(11, 7, 1), ...seatEmployees(21, 8, 2), ...seatEmployees(31, STAFF_TABLE_ID, 2)], {
      8: '供應商',
    });
    const after = run(before, { type: 'swap', tableA: 3, tableB: 7 });
    expect(rosterIds(after.participants, 8)).toEqual([21, 22]);
    expect(after.tables.find((t) => t.id === 8)?.noteName).toBe('供應商');
    expect(staffIds(after.participants)).toEqual([31, 32]);
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

  it('對調後復原：兩桌的名單、順序與備註名稱回到對調前（SEAT-R78、SEAT-AC76）', () => {
    const before = make([...seatEmployees(1, 3, 2), ...seatEmployees(11, 7, 3)], { 3: '主桌' });
    const swapped = expectOk(applySeatingOperation(before, { type: 'swap', tableA: 3, tableB: 7 }));
    const restored = expectOk(applySeatingOperation(swapped.data, { type: 'restore', snapshot: swapped.undo })).data;
    expect(rosterIds(restored.participants, 3)).toEqual([1, 2]);
    expect(rosterIds(restored.participants, 7)).toEqual([11, 12, 13]);
    expect(restored.tables.find((t) => t.id === 3)?.noteName).toBe('主桌');
    expect(restored.tables.find((t) => t.id === 7)?.noteName).toBeNull();
  });

  it('復原會讓某一桌超過 10 位（別人在這之間坐進來）：回 TABLE_FULL，資料不變（SEAT-R02、COM-R07）', () => {
    // 原本王小明在第 5 桌（共 10 位），移出後別人補進第 5 桌，再復原就會變成 11 位
    const before = make([asEmployee(WANG, { tableId: 5, seatOrder: 0 }), ...seatEmployees(1, 5, 9, 1), asEmployee(60)]);
    const removed = expectOk(applySeatingOperation(before, { type: 'unseat', participantId: WANG }));
    const othersSat = expectOk(applySeatingOperation(removed.data, { type: 'seat', participantId: 60, tableId: 5 }));
    expect(reject(othersSat.data, { type: 'restore', snapshot: removed.undo })).toBe('TABLE_FULL');
  });

  it('復原的人已被別人刪除：回 NOT_FOUND（COM-R07）', () => {
    const data = make(seatEmployees(1, 3, 2));
    const snapshot: SeatingSnapshot = { participants: [{ id: 999, tableId: 3, seatOrder: 0 }], tables: [] };
    expect(reject(data, { type: 'restore', snapshot })).toBe('NOT_FOUND');
  });
});

describe('統計列（SEAT-R75、SEAT-R47）', () => {
  it('沒有任何參與人員：已入座 0／0・未入座 0・空位 300・已滿 0 桌（SEAT-AC58）', () => {
    expect(seatingStats([])).toEqual({ seated: 0, total: 0, unseated: 0, emptySeats: 300, fullTables: 0 });
  });

  it('已入座是 30 桌上的人數；總人數不含工作人員；未入座是總人數減已入座；空位是 300 減已入座；已滿是滿 10 位的桌數', () => {
    const participants = [
      ...seatEmployees(1, 3, 4),
      ...seatEmployees(11, 5, 10),
      ...seatEmployees(31, 7, 10),
      asEmployee(50),
      asDependent(51, 50),
      asGuest(52),
      ...seatEmployees(60, STAFF_TABLE_ID, 3),
    ];
    expect(seatingStats(participants)).toEqual({ seated: 24, total: 27, unseated: 3, emptySeats: 276, fullTables: 2 });
  });

  it('工作人員不算已入座、不算未入座、也不算總人數（SEAT-R47、SEAT-AC38、SEAT-AC39）', () => {
    const before = [asEmployee(WANG, { tableId: 3, seatOrder: 0 }), asEmployee(1)];
    const after = [asEmployee(WANG, { tableId: STAFF_TABLE_ID, seatOrder: 0 }), asEmployee(1)];
    expect(seatingStats(before)).toEqual({ seated: 1, total: 2, unseated: 1, emptySeats: 299, fullTables: 0 });
    // 從桌次放進工作人員桌：已入座與總人數各減 1，未入座不變
    expect(seatingStats(after)).toEqual({ seated: 0, total: 1, unseated: 1, emptySeats: 300, fullTables: 0 });
  });
});
