// 員工名單的業務規則（docs/spec/employees.md 第 3.1～3.6 節）：報名狀態、排列、清單、搜尋、篩選、空狀態、勾選與列操作。
// 純函式：輸入員工名單與參與人員，不碰資料庫與畫面；員工名單頁、自動排座與伺服器端共用。
// 「員工名單順序」是 Employee.sortOrder（docs/architecture.md 第 7.1 節；EMP-Q09 依 D-008：依建立的先後、匯入更新不改位置）。
// 報名狀態有三種（EMP-R03、D-014）：已報名由參與人員自動判斷；沒有參與人員時，Employee.declined 是承辦人標記的「不參加」。
import type { Employee, Participant } from '@/contracts/entities';

export type RegistrationStatus = 'unregistered' | 'registered' | 'declined';

/** Tabs 的分頁：全部，或只列某一種報名狀態（EMP-R08） */
export type RegistrationTab = 'all' | RegistrationStatus;

/** 三項篩選；null 是「不限」（EMP-R12） */
export type EmployeeFilters = { department: string | null; team: string | null; region: string | null };

export const NO_FILTERS: EmployeeFilters = { department: null, team: null, region: null };

/** EMP-R17 的六種空狀態 */
export type EmployeeEmptyState =
  'no-employees' | 'no-search-results' | 'no-filter-results' | 'no-unregistered' | 'none-registered' | 'no-declined';

/** 列操作選單的項目（EMP-R27） */
export type EmployeeRowAction = 'join' | 'decline' | 'undecline' | 'view' | 'cancel' | 'edit' | 'delete';

export type EmployeeView = { tab: RegistrationTab; query: string; filters: EmployeeFilters };

/** 依員工名單順序（sortOrder，相同時依 id）；不改動輸入 */
const byListOrder = (employees: readonly Employee[]): Employee[] =>
  [...employees].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

/** 已報名的員工：參與人員中有對應的員工（含工作人員）；眷屬與外部貴賓不算（EMP-R03） */
export function registeredEmployeeIds(participants: readonly Participant[]): Set<number> {
  const ids = new Set<number>();
  for (const p of participants) if (p.kind === 'EMPLOYEE' && p.employeeId != null) ids.add(p.employeeId);
  return ids;
}

/**
 * 報名狀態（EMP-R03）：有對應的參與人員（含工作人員）一律是已報名，不看不參加的標記；
 * 沒有時，承辦人標記為不參加的是不參加，其餘是未報名。
 */
export function registrationStatusOf(employee: Employee, registered: ReadonlySet<number>): RegistrationStatus {
  if (registered.has(employee.id)) return 'registered';
  return employee.declined ? 'declined' : 'unregistered';
}

/**
 * 加入尾牙後清掉不參加的標記（EMP-R64）：有對應參與人員（員工本人）的員工不再帶著標記。
 * 前端用伺服器回應校正 store 時套用，和伺服器加入時的做法一致；沒有要清的人時回傳原本的陣列。
 */
export function clearDeclinedOfRegistered(employees: Employee[], participants: readonly Participant[]): Employee[] {
  const joined = registeredEmployeeIds(participants);
  if (!employees.some((e) => e.declined && joined.has(e.id))) return employees;
  return employees.map((e) => (e.declined && joined.has(e.id) ? { ...e, declined: false } : e));
}

/**
 * 列操作（EMP-R27）：未報名「加入尾牙」「標記為不參加」「編輯」「刪除」；不參加「加入尾牙」「改回未報名」「編輯」「刪除」；
 * 已報名「查看參與資料」「取消報名」「編輯」「刪除」。
 */
export function employeeRowActions(status: RegistrationStatus): EmployeeRowAction[] {
  switch (status) {
    case 'registered':
      return ['view', 'cancel', 'edit', 'delete'];
    case 'declined':
      return ['join', 'undecline', 'edit', 'delete'];
    default:
      return ['join', 'decline', 'edit', 'delete'];
  }
}

/** 每個部門的組別，依在該部門首次出現的先後（員工名單順序） */
function teamsByDepartment(ordered: readonly Employee[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of ordered) {
    let list = map.get(e.department);
    if (!list) {
      list = [];
      map.set(e.department, list);
    }
    if (e.team && !list.includes(e.team)) list.push(e.team);
  }
  return map;
}

/**
 * 依部門、組別排列（EMP-R07，和自動排座相同）：部門依在員工名單順序中首次出現的先後；
 * 部門內依組別首次出現的先後，沒有組別的排在該部門最後；同組內依員工名單順序。
 */
export function sortEmployees(employees: readonly Employee[]): Employee[] {
  const ordered = byListOrder(employees);
  const teams = teamsByDepartment(ordered);
  const deptRank = new Map([...teams.keys()].map((d, i) => [d, i]));
  const order = new Map(ordered.map((e, i) => [e.id, i]));
  const rank = (e: Employee): [number, number, number] => {
    const list = teams.get(e.department) ?? [];
    return [deptRank.get(e.department) ?? 0, e.team ? list.indexOf(e.team) : list.length, order.get(e.id) ?? 0];
  };
  const ranked = ordered.map((e) => [rank(e), e] as const);
  ranked.sort(([a], [b]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return ranked.map(([, e]) => e);
}

/** 部門清單：只列至少有一位員工的部門，依首次出現的先後（EMP-R04） */
export const departmentOptions = (employees: readonly Employee[]): string[] => [
  ...teamsByDepartment(byListOrder(employees)).keys(),
];

/**
 * 組別清單（EMP-R13）：選了部門只列那個部門的組別；沒選時依部門順序列出所有部門的組別，
 * 不同部門的同名組別每個部門各列一次（EMP-Q11 依 D-008 照原型）。
 */
export function teamOptions(employees: readonly Employee[], department: string | null): string[] {
  const teams = teamsByDepartment(byListOrder(employees));
  if (department != null) return [...(teams.get(department) ?? [])];
  return [...teams.values()].flat();
}

/** 地區清單：員工名單既有的地區，依首次出現的先後（EMP-R04、EMP-R36） */
export function regionOptions(employees: readonly Employee[]): string[] {
  const out: string[] = [];
  for (const e of byListOrder(employees)) if (e.region && !out.includes(e.region)) out.push(e.region);
  return out;
}

/** Tabs 的人數：永遠是整份名單，不受搜尋與篩選影響；「全部」等於三種狀態相加（EMP-R08、EMP-Q08 第 4 點） */
export function tabCounts(
  employees: readonly Employee[],
  registered: ReadonlySet<number>,
): Record<RegistrationTab, number> {
  const counts = { all: employees.length, unregistered: 0, registered: 0, declined: 0 };
  for (const e of employees) counts[registrationStatusOf(e, registered)]++;
  return counts;
}

/** 關鍵字：去掉前後空白（含全形空白）、不分英文大小寫（EMP-Q08 第 5 點） */
export const normalizeQuery = (query: string): string => query.trim().toLowerCase();

/** 搜尋比對姓名、英文名、分機、部門與組別，任一欄位包含關鍵字就列出；不比對地區與備註（EMP-R11） */
export function matchesEmployeeSearch(employee: Employee, query: string): boolean {
  const k = normalizeQuery(query);
  if (!k) return true;
  return [employee.name, employee.englishName, employee.extension, employee.department, employee.team].some(
    (field) => field != null && field.toLowerCase().includes(k),
  );
}

const hasFilters = (f: EmployeeFilters) => f.department != null || f.team != null || f.region != null;

/**
 * 分頁（Tabs）、關鍵字與每一項篩選同時生效（EMP-R15），回傳依 EMP-R07 排序的列。
 * 組別篩選只比對組別名稱（EMP-Q11）：沒選部門時會列出所有部門中同名組別的員工。
 */
export function filterEmployees(
  employees: readonly Employee[],
  registered: ReadonlySet<number>,
  view: EmployeeView,
): Employee[] {
  const { tab, query, filters } = view;
  return sortEmployees(employees).filter(
    (e) =>
      (tab === 'all' || registrationStatusOf(e, registered) === tab) &&
      (filters.department == null || e.department === filters.department) &&
      (filters.team == null || e.team === filters.team) &&
      (filters.region == null || e.region === filters.region) &&
      matchesEmployeeSearch(e, query),
  );
}

/** 換部門篩選：已選的組別不屬於新部門的組別清單就清掉（EMP-R14） */
export function changeDepartmentFilter(
  employees: readonly Employee[],
  filters: EmployeeFilters,
  department: string | null,
): EmployeeFilters {
  const keepTeam = filters.team != null && teamOptions(employees, department).includes(filters.team);
  return { ...filters, department, team: keepTeam ? filters.team : null };
}

/**
 * 空狀態（EMP-R17）。同時有關鍵字與篩選而沒有結果時顯示搜尋無結果（EMP-Q08 第 6 點）。
 * 只有空白的關鍵字等於沒有關鍵字。
 */
export function emptyStateOf(s: { total: number; visible: number } & EmployeeView): EmployeeEmptyState | null {
  if (s.total === 0) return 'no-employees';
  if (s.visible > 0) return null;
  if (normalizeQuery(s.query)) return 'no-search-results';
  if (hasFilters(s.filters)) return 'no-filter-results';
  if (s.tab === 'unregistered') return 'no-unregistered';
  if (s.tab === 'registered') return 'none-registered';
  if (s.tab === 'declined') return 'no-declined';
  // 「全部」分頁、沒有關鍵字與篩選卻沒有列：只會發生在沒有員工時，已在第一行處理
  return 'no-employees';
}

/** 能勾的員工：只有未報名的（EMP-R18）；已報名與不參加的列勾選框停用 */
const isPickable = (employee: Employee, registered: ReadonlySet<number>): boolean =>
  registrationStatusOf(employee, registered) === 'unregistered';

/** 這一頁能勾的列（EMP-R18） */
const pickableIds = (pageRows: readonly Employee[], registered: ReadonlySet<number>) =>
  pageRows.filter((e) => isPickable(e, registered)).map((e) => e.id);

/**
 * 表頭勾選框（EMP-R20）：能勾的列全部勾選為勾選、只勾一部分為不確定、都沒勾為未勾選；
 * 其他頁的勾選不影響；這一頁沒有能勾的列時停用（EMP-Q08 第 2 點）。
 */
export function headerCheckState(
  pageRows: readonly Employee[],
  registered: ReadonlySet<number>,
  selected: ReadonlySet<number>,
): { checked: boolean | 'indeterminate'; disabled: boolean } {
  const ids = pickableIds(pageRows, registered);
  if (ids.length === 0) return { checked: false, disabled: true };
  const n = ids.filter((id) => selected.has(id)).length;
  return { checked: n === 0 ? false : n === ids.length ? true : 'indeterminate', disabled: false };
}

/** 表頭全選只作用於這一頁的未報名列，不勾已報名與不參加的列；其他頁的勾選保留（EMP-R19、EMP-Q08 第 1 點）。回傳新的集合 */
export function toggleAllOnPage(
  pageRows: readonly Employee[],
  registered: ReadonlySet<number>,
  selected: ReadonlySet<number>,
  checked: boolean,
): Set<number> {
  const next = new Set(selected);
  for (const id of pickableIds(pageRows, registered)) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

/**
 * 「加入尾牙（{n} 位）」要送出的員工：勾選中還在名單、還是未報名的（EMP-R21、EMP-R23），含看不到的勾選；
 * 勾選後被標記為不參加的不算（勾選框停用，D-014 不參加的不能一次加入多位）
 */
export function selectedToJoin(
  employees: readonly Employee[],
  registered: ReadonlySet<number>,
  selected: ReadonlySet<number>,
): number[] {
  return byListOrder(employees)
    .filter((e) => selected.has(e.id) && isPickable(e, registered))
    .map((e) => e.id);
}

/** 同名提示：和另一位員工姓名相同（去掉前後空白後完全相同）；編輯時不和自己比（EMP-R37） */
export function findSameNameEmployee(
  employees: readonly Employee[],
  name: string,
  excludeId?: number,
): Employee | undefined {
  const n = name.trim();
  if (!n) return undefined;
  return byListOrder(employees).find((e) => e.name === n && e.id !== excludeId);
}
