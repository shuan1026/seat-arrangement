// 參與人員的業務規則（docs/spec/participants.md 第 2、3 節）。純函式：不碰資料庫與畫面，前端與後端共用。
// 顯示名稱、部門、分機與搜尋的共用規則在 display.ts。
import {
  STAFF_TABLE_CAPACITY,
  STAFF_TABLE_ID,
  TABLE_CAPACITY,
  TABLE_COUNT,
  type Employee,
  type Participant,
  type ParticipantKind,
} from '@/contracts/entities';
import { departmentOf, employeeOf, matchesSearch, type Directory } from './display';

/** 入座狀態（PPL-R25）：坐在 1–30 桌是已入座；工作人員自成一類，不算已入座也不算未入座（PPL-R10） */
export type SeatState = 'seated' | 'unseated' | 'staff';

export const seatState = (p: Pick<Participant, 'tableId'>): SeatState =>
  p.tableId === STAFF_TABLE_ID ? 'staff' : p.tableId == null ? 'unseated' : 'seated';

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

export function rowActions(p: Participant): RowAction[] {
  const remove: RowAction = p.kind === 'EMPLOYEE' ? 'cancelRegistration' : 'delete';
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
 * 預設排序（PPL-R20、PPL-Q13 的原型做法）：
 * 部門依員工名單上先出現的順序；部門內依組別先出現的順序，沒有組別的排最後；同組依員工名單順序；
 * 眷屬緊接在所屬員工的下一列；外部貴賓排在所有員工與眷屬之後，依新增順序。不改變傳入的陣列。
 */
export function sortParticipants(list: readonly Participant[], dir: Directory): Participant[] {
  const roster = rosterOrder(dir.employees.values());
  const deptRank = new Map<string, number>();
  const teamRank = new Map<string, number>();
  const empRank = new Map<number, number>();
  roster.forEach((e, i) => {
    if (!deptRank.has(e.department)) deptRank.set(e.department, deptRank.size);
    const team = e.team ? `${e.department}\u0000${e.team}` : null;
    if (team && !teamRank.has(team)) teamRank.set(team, i);
    empRank.set(e.id, i);
  });
  const MISSING = Number.MAX_SAFE_INTEGER;

  type Key = { group: number; dept: number; team: number; emp: number; dependent: number; created: string; id: number };
  const keyOf = (p: Participant): Key => {
    if (p.kind === 'GUEST') return { group: 1, dept: 0, team: 0, emp: 0, dependent: 0, created: p.createdAt, id: p.id };
    const e = employeeOf(p, dir);
    const team = e?.team ? teamRank.get(`${e.department}\u0000${e.team}`) : undefined;
    return {
      group: 0,
      dept: e ? (deptRank.get(e.department) ?? MISSING) : MISSING,
      team: team ?? MISSING,
      emp: e ? (empRank.get(e.id) ?? MISSING) : MISSING,
      dependent: p.kind === 'DEPENDENT' ? 1 : 0,
      created: '',
      id: p.id,
    };
  };
  const keys = new Map(list.map((p) => [p.id, keyOf(p)]));
  const cmp = (a: Participant, b: Participant): number => {
    const ka = keys.get(a.id)!;
    const kb = keys.get(b.id)!;
    return (
      ka.group - kb.group ||
      ka.dept - kb.dept ||
      ka.team - kb.team ||
      ka.emp - kb.emp ||
      ka.dependent - kb.dependent ||
      (ka.created < kb.created ? -1 : ka.created > kb.created ? 1 : 0) ||
      ka.id - kb.id
    );
  };
  return [...list].sort(cmp);
}

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
): Participant[] {
  return list.filter(
    (p) =>
      (f.kind === null || p.kind === f.kind) &&
      // 外部貴賓沒有部門，不符合任何部門（PPL-R24）
      (f.department === null || departmentOf(p, dir) === f.department) &&
      (f.seat === null || seatState(p) === f.seat) &&
      // 工作人員桌的 id 是 0，不會等於 1–30 的桌號（PPL-R26）
      (f.tableId === null || p.tableId === f.tableId) &&
      matchesSearch(p, dir, query),
  );
}

export type TableChoice = { tableId: number; remaining: number; disabled: boolean };

/** 這一桌目前的人數（1–30 桌或工作人員桌） */
export const seatedCount = (participants: readonly Participant[], tableId: number): number =>
  participants.reduce((n, p) => (p.tableId === tableId ? n + 1 : n), 0);

/**
 * 對話框的桌次選項（PPL-R56、PPL-Q08）：第 1～30 桌與剩幾位；已滿的停用，
 * 但 self（編輯中的人）目前所在的桌次不算已滿。
 */
export function tableChoices(participants: readonly Participant[], self?: Participant | null): TableChoice[] {
  return Array.from({ length: TABLE_COUNT }, (_, i) => {
    const tableId = i + 1;
    const remaining = TABLE_CAPACITY - seatedCount(participants, tableId);
    return { tableId, remaining, disabled: remaining <= 0 && self?.tableId !== tableId };
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
