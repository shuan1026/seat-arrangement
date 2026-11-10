// 座位安排的單元測試資料：只產生虛構的員工、參與人員與桌次，不連資料庫（docs/architecture.md 第 6 節）。
// 參與人員的 id 與對應員工的 id 相同，方便對照。
import { STAFF_TABLE_ID, TABLE_COUNT, type Employee, type Participant, type SeatTable } from '@/contracts/entities';

const BLANK: Omit<Participant, 'id' | 'kind'> = {
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
  createdAt: '2026-11-10T00:00:00.000Z',
};

export const employee = (id: number, data: Partial<Employee> = {}): Employee => ({
  id,
  name: `測試員工${id}`,
  englishName: null,
  department: '測試部',
  team: null,
  extension: null,
  region: null,
  office: null,
  note: null,
  declined: false,
  sortOrder: id,
  ...data,
});

/** 員工類別的參與人員；employeeId 預設和 id 相同 */
export const asEmployee = (id: number, data: Partial<Participant> = {}): Participant => ({
  ...BLANK,
  id,
  kind: 'EMPLOYEE',
  employeeId: id,
  ...data,
});

export const asDependent = (id: number, hostId: number, data: Partial<Participant> = {}): Participant => ({
  ...BLANK,
  id,
  kind: 'DEPENDENT',
  hostId,
  ...data,
});

export const asGuest = (id: number, data: Partial<Participant> = {}): Participant => ({
  ...BLANK,
  id,
  kind: 'GUEST',
  guestName: `測試貴賓${id}`,
  ...data,
});

/** 工作人員桌（id 0）與第 1–30 桌；可指定備註名稱 */
export function allTables(noteNames: Record<number, string> = {}): SeatTable[] {
  return Array.from({ length: TABLE_COUNT + 1 }, (_, id) => ({
    id,
    kind: id === STAFF_TABLE_ID ? 'STAFF' : 'NORMAL',
    noteName: noteNames[id] ?? null,
  }));
}

/** 在 tableId 坐 count 位員工，參與人員 id 從 firstId 起，座號（seatOrder）從 startOrder 起連續 */
export function seatEmployees(firstId: number, tableId: number, count: number, startOrder = 0): Participant[] {
  return Array.from({ length: count }, (_, i) =>
    asEmployee(firstId + i, { tableId, seatOrder: tableId === STAFF_TABLE_ID ? i : startOrder + i }),
  );
}

/** 一桌的名單（依座號），回傳參與人員 id */
export const rosterIds = (participants: readonly Participant[], tableId: number): number[] =>
  participants
    .filter((p) => p.tableId === tableId)
    .sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0) || a.id - b.id)
    .map((p) => p.id);

/** 工作人員桌的人（不依座號，只看有誰），由小到大 */
export const staffIds = (participants: readonly Participant[]): number[] =>
  participants
    .filter((p) => p.tableId === STAFF_TABLE_ID)
    .map((p) => p.id)
    .sort((a, b) => a - b);

export function positionOf(participants: readonly Participant[], id: number): { tableId: number | null; seatOrder: number | null } {
  const p = participants.find((x) => x.id === id);
  if (!p) throw new Error(`沒有參與人員 ${id}`);
  return { tableId: p.tableId, seatOrder: p.seatOrder };
}
