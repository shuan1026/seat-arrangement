// 參與人員的業務規則（docs/spec/participants.md 第 2、3 節）。純函式：不碰資料庫與畫面，前端與後端共用。
// 顯示名稱、部門、分機與搜尋的共用規則在 display.ts。
import {
  STAFF_TABLE_CAPACITY,
  STAFF_TABLE_ID,
  TABLE_CAPACITY,
  type Employee,
  type Participant,
  type ParticipantKind,
  type SeatTable,
} from '@/contracts/entities';
import { departmentOf, employeeOf, matchesSearch, type Directory } from './display';
import { placedInListOrder } from './tables';

/** 判斷入座狀態要用的桌（D-027）：暫存的桌（position 是 null 的一般桌）上的人算未入座 */
export type TablesForSeat = readonly Pick<SeatTable, 'id' | 'kind' | 'position'>[];

/** 坐在暫存的桌上（SEAT-R94、D-027） */
export const onStagedTable = (p: Pick<Participant, 'tableId'>, tables?: TablesForSeat): boolean =>
  p.tableId != null && p.tableId !== STAFF_TABLE_ID && !!tables?.some((t) => t.id === p.tableId && t.kind === 'NORMAL' && t.position === null);

/**
 * 入座狀態（PPL-R25）：坐在場上的桌是已入座；工作人員自成一類，不算已入座也不算未入座（PPL-R10）。
 * 給了 tables 時，暫存的桌上的人算未入座（PPL-R26、D-027）
 */
export type SeatState = 'seated' | 'unseated' | 'staff';

export const seatState = (p: Pick<Participant, 'tableId'>, tables?: TablesForSeat): SeatState =>
  p.tableId === STAFF_TABLE_ID ? 'staff' : p.tableId == null || onStagedTable(p, tables) ? 'unseated' : 'seated';

/** 類別欄（PPL-R29）：員工／眷屬（{稱謂}）／眷屬／外部貴賓 */
export function kindLabel(p: Pick<Participant, 'kind' | 'relation'>): string {
  if (p.kind === 'EMPLOYEE') return '員工';
  if (p.kind === 'GUEST') return '外部貴賓';
  return p.relation ? `眷屬（${p.relation}）` : '眷屬';
}

/** 類別的名稱（新增人員對話框的類別選項、類別篩選） */
export const KIND_NAMES: Record<ParticipantKind, string> = { EMPLOYEE: '員工', DEPENDENT: '眷屬', GUEST: '外部貴賓' };

/** 部門或單位欄（PPL-R30）：員工與眷屬是部門（眷屬跟著所屬員工），外部貴賓是單位／頭銜；沒有時是 null */
export const unitLabel = (p: Participant, dir: Directory): string | null =>
  p.kind === 'GUEST' ? p.organization || null : departmentOf(p, dir);

/** 列操作（第 2.2 節）：編輯／入座…或移至其他桌次…／移出桌次／取消報名（員工）或刪除（眷屬、外部貴賓） */
export type RowAction = 'edit' | 'seat' | 'move' | 'unseat' | 'cancelRegistration' | 'delete';

export function rowActions(p: Participant, tables?: TablesForSeat): RowAction[] {
  const remove: RowAction = p.kind === 'EMPLOYEE' ? 'cancelRegistration' : 'delete';
  // 暫存的桌上的人：編輯／入座…／移出桌次／取消報名或刪除（第 2.2 節、D-027）
  if (onStagedTable(p, tables)) return ['edit', 'seat', 'unseat', remove];
  switch (seatState(p)) {
    case 'staff':
      return ['edit', remove];
    case 'seated':
      return ['edit', 'move', 'unseat', remove];
    default:
      return ['edit', 'seat', remove];
  }
}

const byRoster = (a: Employee, b: Employee) => a.sortOrder - b.sortOrder || a.id - b.id;

/** 員工名單依 sortOrder 排好（部門、組別與員工的順序都由它決定，PPL-Q13） */
export const rosterOrder = (employees: Iterable<Employee>): Employee[] => [...employees].sort(byRoster);

/**
 * 員工在員工名單順序中的位置（PPL-Q13 的原型做法；auto-arrange.md ARR-Q05）：
 * ①部門依員工名單上先出現的順序；②同部門內，組別依先出現的順序，沒有組別的排在該部門最後；③員工名單順序。
 * 看整份員工名單，含沒有報名的員工。
 */
export function rosterRanker(employees: Iterable<Employee>): (e: Employee) => [dept: number, team: number, order: number] {
  const depts = new Map<string, number>();
  const teams = new Map<string, Map<string, number>>();
  const order = new Map<number, number>();
  rosterOrder(employees).forEach((e, i) => {
    order.set(e.id, i);
    if (!depts.has(e.department)) depts.set(e.department, depts.size);
    let deptTeams = teams.get(e.department);
    if (!deptTeams) {
      deptTeams = new Map();
      teams.set(e.department, deptTeams);
    }
    if (e.team && !deptTeams.has(e.team)) deptTeams.set(e.team, deptTeams.size);
  });
  return (e) => {
    const deptTeams = teams.get(e.department);
    const noTeam = deptTeams?.size ?? 0;
    return [
      depts.get(e.department) ?? depts.size,
      e.team ? (deptTeams?.get(e.team) ?? noTeam) : noTeam,
      order.get(e.id) ?? order.size,
    ];
  };
}

/**
 * 參與人員的預設排序（PPL-R20、PPL-Q13 的原型做法）。參與人員頁、座位安排的人員面板、自動排座（auto-arrange.md ARR-R05）
 * 與匯出座位表的工作人員區塊都用這一份：
 * 員工依員工名單的部門、組別與員工順序（rosterRanker）；眷屬緊接在所屬員工的下一列；
 * 找不到員工的人排在所有員工與眷屬之後；外部貴賓排最後，依新增的先後。結果和傳入陣列的順序無關。
 */
export function participantComparator(dir: Directory): (a: Participant, b: Participant) => number {
  const rank = rosterRanker(dir.employees.values());
  const keys = new Map<number, number[]>();
  const keyOf = (p: Participant): number[] => {
    const cached = keys.get(p.id);
    if (cached) return cached;
    let key: number[];
    if (p.kind === 'GUEST') {
      key = [2];
    } else {
      const e = employeeOf(p, dir);
      key = e ? [0, ...rank(e), p.kind === 'DEPENDENT' ? 1 : 0] : [1];
    }
    keys.set(p.id, key);
    return key;
  };
  return (a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const d = (ka[i] ?? 0) - (kb[i] ?? 0);
      if (d !== 0) return d;
    }
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id - b.id;
  };
}

/** 依預設排序排好（participantComparator）；不改變傳入的陣列 */
export const sortParticipants = (list: readonly Participant[], dir: Directory): Participant[] =>
  [...list].sort(participantComparator(dir));

/** 部門篩選的選項（PPL-R24）：員工名單上的部門，不重複，依員工名單順序 */
export function departmentOptions(employees: readonly Employee[]): string[] {
  const out: string[] = [];
  for (const e of rosterOrder(employees)) if (!out.includes(e.department)) out.push(e.department);
  return out;
}

/** 工具列的四個篩選；null 是「不限」（PPL-R22） */
export type ParticipantFilters = {
  kind: ParticipantKind | null;
  department: string | null;
  seat: SeatState | null;
  tableId: number | null;
};

export const NO_FILTERS: ParticipantFilters = { kind: null, department: null, seat: null, tableId: null };

export const hasFilters = (f: ParticipantFilters): boolean =>
  f.kind !== null || f.department !== null || f.seat !== null || f.tableId !== null;

/** 搜尋與篩選同時作用（PPL-R21～R26）；保留傳入的順序 */
export function filterParticipants(
  list: readonly Participant[],
  dir: Directory,
  query: string,
  f: ParticipantFilters,
  tables?: TablesForSeat,
): Participant[] {
  return list.filter(
    (p) =>
      (f.kind === null || p.kind === f.kind) &&
      // 外部貴賓沒有部門，不符合任何部門（PPL-R24）
      (f.department === null || departmentOf(p, dir) === f.department) &&
      (f.seat === null || seatState(p, tables) === f.seat) &&
      // 桌次篩選的值是桌子 id；工作人員桌的 id 是 0，不會是選項（PPL-R26）
      (f.tableId === null || p.tableId === f.tableId) &&
      matchesSearch(p, dir, query),
  );
}

/** 桌次選項：tableId 是桌子 id（桌號依它所在的位置，D-027） */
export type TableChoice = { tableId: number; remaining: number; disabled: boolean };

/** 沒有給桌時：30 桌都在原位置（桌子 id 等於位置編號） */
const DEFAULT_TABLES: TablesForSeat = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, kind: 'NORMAL' as const, position: i + 1 }));

/** 這一桌目前的人數（1–30 桌或工作人員桌） */
export const seatedCount = (participants: readonly Participant[], tableId: number): number =>
  participants.reduce((n, p) => (p.tableId === tableId ? n + 1 : n), 0);

/**
 * 對話框的桌次選項（PPL-R56、PPL-Q08）：場上的桌依 A1～A15、B1～B15 排列（D-019）與剩幾位；已滿的停用，
 * 但 self（編輯中的人）目前所在的桌次不算已滿。不列「未放桌」的位置與暫存的桌（D-027）。
 */
export function tableChoices(
  participants: readonly Participant[],
  self?: Participant | null,
  tables: TablesForSeat = DEFAULT_TABLES,
): TableChoice[] {
  return placedInListOrder(tables).map((t) => {
    const remaining = TABLE_CAPACITY - seatedCount(participants, t.id);
    return { tableId: t.id, remaining, disabled: remaining <= 0 && self?.tableId !== t.id };
  });
}

/** 「工作人員」能不能勾（PPL-R54）：工作人員桌未滿 10 位，或 self 已經是工作人員 */
export const canMarkStaff = (participants: readonly Participant[], self?: Participant | null): boolean =>
  self?.tableId === STAFF_TABLE_ID || seatedCount(participants, STAFF_TABLE_ID) < STAFF_TABLE_CAPACITY;

// ---- 座位異動後的名單（前端立即反映結果用；後端在交易內做同樣的事，docs/architecture.md 第 7.2 節）

/** 把這幾桌的桌內順序重排成 0..n-1（依原本的順序） */
function resequence(list: Participant[], tableIds: Iterable<number>): Participant[] {
  let out = list;
  for (const tableId of new Set(tableIds)) {
    const seated = out
      .filter((p) => p.tableId === tableId)
      .sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0) || a.id - b.id);
    const order = new Map(seated.map((p, i) => [p.id, i]));
    out = out.map((p) => (order.has(p.id) && p.seatOrder !== order.get(p.id) ? { ...p, seatOrder: order.get(p.id)! } : p));
  }
  return out;
}

/** 移除這些人（取消報名時連同眷屬），原本的桌次其他人順序不變、重排為連續（PPL-R14、PPL-R15） */
export function removeParticipants(list: readonly Participant[], ids: readonly number[]): Participant[] {
  const gone = new Set(ids);
  const tables = list.filter((p) => gone.has(p.id) && p.tableId != null).map((p) => p.tableId!);
  return resequence(
    list.filter((p) => !gone.has(p.id)),
    tables,
  );
}

/** 這位員工與他的眷屬（取消報名時一併移除的人） */
export function withDependent(list: readonly Participant[], p: Participant): number[] {
  if (p.kind !== 'EMPLOYEE') return [p.id];
  return [p.id, ...list.filter((d) => d.hostId === p.id).map((d) => d.id)];
}

/** 把一個人移到某一桌名單的最後（tableId 是 null 時變成未入座）；原桌其他人順序不變（PPL-R17、PPL-R36） */
export function moveParticipant(list: readonly Participant[], id: number, tableId: number | null): Participant[] {
  const p = list.find((x) => x.id === id);
  if (!p || p.tableId === tableId) return [...list];
  const from = p.tableId;
  const seatOrder = tableId == null ? null : seatedCount(list, tableId);
  const moved = list.map((x) => (x.id === id ? { ...x, tableId, seatOrder } : x));
  return from == null ? moved : resequence(moved, [from]);
}

/** 用伺服器回應的資料覆蓋同一個 id 的人，回應裡新的人加在最後 */
export function mergeParticipants(list: readonly Participant[], updates: readonly Participant[]): Participant[] {
  const byId = new Map(updates.map((p) => [p.id, p]));
  const merged = list.map((p) => byId.get(p.id) ?? p);
  const known = new Set(list.map((p) => p.id));
  return [...merged, ...updates.filter((p) => !known.has(p.id))];
}
