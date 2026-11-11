// 座位安排的單元測試資料：只產生虛構的員工、參與人員與桌次，不連資料庫（docs/architecture.md 第 6 節）。
// 參與人員的 id 與對應員工的 id 相同，方便對照。
// 桌子與位置分開（D-027）：SeatTable 的 id 是桌子本身，position 是所在位置 1–30（null 是暫存區）；部署時 1–30 桌的 position = id。
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

/**
 * 一張一般桌（D-027）：預設沒有備註名稱、不在暫存區；內部編號 1–30 的桌預設在同號的位置（部署時的樣子），
 * 31 起（新增的桌）預設在暫存區（position null），要放在位置上時用 data 指定 position。
 */
export const normalTable = (id: number, data: Partial<SeatTable> = {}): SeatTable => ({
  id,
  kind: 'NORMAL',
  position: id <= TABLE_COUNT ? id : null,
  stagedAt: null,
  noteName: null,
  ...data,
});

/** 工作人員桌：id 0、kind STAFF、position null（不在 30 個位置裡，也不在暫存區） */
export const staffTable = (): SeatTable => ({ id: STAFF_TABLE_ID, kind: 'STAFF', position: null, stagedAt: null, noteName: null });

/** 工作人員桌（id 0）與第 1–30 桌（各在自己的位置、暫存區沒有桌）；可指定備註名稱 */
export function allTables(noteNames: Record<number, string> = {}): SeatTable[] {
  return [staffTable(), ...Array.from({ length: TABLE_COUNT }, (_, i) => normalTable(i + 1, { noteName: noteNames[i + 1] ?? null }))];
}

/** 暫存區的一桌：position null，stagedAt 是移入暫存區的時間（ISO 字串） */
export const stagedTable = (id: number, stagedAt: string, data: Partial<SeatTable> = {}): SeatTable =>
  normalTable(id, { position: null, stagedAt, ...data });

/** 拿掉這些位置上的桌：那些位置變成「未放桌」（D-027） */
export const withoutPositions = (tables: readonly SeatTable[], positions: readonly number[]): SeatTable[] =>
  tables.filter((t) => t.position === null || !positions.includes(t.position));

/** 把內部編號 id 的桌改成 data（例如移到暫存區、搬到別的位置） */
export const updateTable = (tables: readonly SeatTable[], id: number, data: Partial<SeatTable>): SeatTable[] =>
  tables.map((t) => (t.id === id ? { ...t, ...data } : t));

export function tableById(tables: readonly SeatTable[], id: number): SeatTable | undefined {
  return tables.find((t) => t.id === id);
}

/** 在這個位置上的桌（「未放桌」是 undefined） */
export function tableAtPosition(tables: readonly SeatTable[], position: number): SeatTable | undefined {
  return tables.find((t) => t.kind === 'NORMAL' && t.position === position);
}

/** 暫存區的桌，依移入的先後（最早的在前），回傳 id */
export const stagedIds = (tables: readonly SeatTable[]): number[] =>
  tables
    .filter((t) => t.kind === 'NORMAL' && t.position === null)
    .sort((a, b) => (a.stagedAt ?? '').localeCompare(b.stagedAt ?? '') || a.id - b.id)
    .map((t) => t.id);

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
