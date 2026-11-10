// 由資料推導、各頁共用的顯示規則（docs/spec/README.md 第 10 節；顯示名稱與部門見 participants.md；桌次部門標示見 seating.md）。
// 純函式：輸入全部資料的索引，不碰資料庫與畫面。
import { STAFF_TABLE_ID, type AppState, type Employee, type Participant } from '@/contracts/entities';

export type Directory = {
  employees: ReadonlyMap<number, Employee>;
  participants: ReadonlyMap<number, Participant>;
};

export const buildDirectory = (state: Pick<AppState, 'employees' | 'participants'>): Directory => ({
  employees: new Map(state.employees.map((e) => [e.id, e])),
  participants: new Map(state.participants.map((p) => [p.id, p])),
});

/** 員工本人，或眷屬的所屬員工；外部貴賓沒有 */
export function employeeOf(p: Participant, dir: Directory): Employee | undefined {
  if (p.kind === 'EMPLOYEE') return p.employeeId == null ? undefined : dir.employees.get(p.employeeId);
  if (p.kind === 'DEPENDENT') {
    const host = p.hostId == null ? undefined : dir.participants.get(p.hostId);
    return host?.employeeId == null ? undefined : dir.employees.get(host.employeeId);
  }
  return undefined;
}

/** 顯示名稱：員工為姓名；眷屬為「{員工姓名}_眷屬」，不加數字；外部貴賓為姓名 */
export function displayName(p: Participant, dir: Directory): string {
  if (p.kind === 'GUEST') return p.guestName ?? '';
  const e = employeeOf(p, dir);
  if (p.kind === 'DEPENDENT') return `${e?.name ?? ''}_眷屬`;
  return e?.name ?? '';
}

/** 部門：員工跟著員工名單；眷屬跟著所屬員工；外部貴賓沒有部門 */
export const departmentOf = (p: Participant, dir: Directory): string | null => employeeOf(p, dir)?.department ?? null;

/** 組別：同部門的規則；沒有組別時為 null */
export const teamOf = (p: Participant, dir: Directory): string | null => employeeOf(p, dir)?.team ?? null;

/** 分機：只有員工本人有；眷屬與外部貴賓沒有 */
export const extensionOf = (p: Participant, dir: Directory): string | null =>
  p.kind === 'EMPLOYEE' ? (employeeOf(p, dir)?.extension ?? null) : null;

/** 員工的第二行：「{部門}・分機 {分機}」；沒有分機時只顯示部門（COM-R10） */
export const employeeSecondLine = (e: Pick<Employee, 'department' | 'extension'>): string =>
  e.extension ? `${e.department}・分機 ${e.extension}` : e.department;

/** 座位安排人員面板的第二行：「{部門}・{組別}」；沒有組別時只顯示部門（COM-R11） */
export const panelSecondLine = (department: string, team: string | null): string =>
  team ? `${department}・${team}` : department;

export const isStaff = (p: Participant): boolean => p.tableId === STAFF_TABLE_ID;

/**
 * 桌次的部門標示：這一桌員工與眷屬（依所屬員工）的部門，依人數多到少排列；
 * 人數相同時依名單上先出現的在前。有外部貴賓時最後加「貴賓」。
 */
export function tableDepartmentLabels(seated: readonly Participant[], dir: Directory): string[] {
  const count = new Map<string, number>();
  let guests = 0;
  for (const p of seated) {
    if (p.kind === 'GUEST') {
      guests++;
      continue;
    }
    const d = departmentOf(p, dir);
    if (d) count.set(d, (count.get(d) ?? 0) + 1);
  }
  // Map 保留插入順序；sort 是穩定排序，人數相同時維持名單順序
  const labels = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
  if (guests > 0) labels.push('貴賓');
  return labels;
}

/** 以「＋」連接；沒有任何人時為「空桌」 */
export const tableDepartmentLabel = (seated: readonly Participant[], dir: Directory): string =>
  tableDepartmentLabels(seated, dir).join('＋') || '空桌';

/** 搜尋：姓名（顯示名稱）、部門、組別、分機、單位、稱謂，不分大小寫（COM-R14） */
export function matchesSearch(p: Participant, dir: Directory, query: string): boolean {
  const k = query.trim().toLowerCase();
  if (!k) return true;
  const e = employeeOf(p, dir);
  const fields = [displayName(p, dir), e?.department, e?.team, extensionOf(p, dir), p.organization, p.relation];
  return fields.some((s) => s != null && s.toLowerCase().includes(k));
}
