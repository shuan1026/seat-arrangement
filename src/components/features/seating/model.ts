// 座位安排畫面用的推導資料：桌次名單、部門標示、人員的第二行、預設排序與文案（docs/spec/seating.md 第 2、4 節）。
// 只讀 store 的資料，不改資料；改座位一律走 src/domain/seating-rules.ts。
import {
  STAFF_TABLE_CAPACITY,
  STAFF_TABLE_ID,
  TABLE_CAPACITY,
  TABLE_COUNT,
  type AppState,
  type Employee,
  type Participant,
} from '@/contracts/entities';
import { TABLE_MAX_SEATS } from '@/contracts/seating';
import {
  departmentOf,
  displayName,
  employeeOf,
  employeeSecondLine,
  matchesSearch,
  tableDepartmentLabels,
  teamOf,
  type Directory,
} from '@/domain/display';
import { tableTitle } from '@/domain/layout';
import { sortParticipants } from '@/domain/participants';
import { tableStatus, type TableStatus } from '@/domain/seating-rules';

/** 每桌標準 10 位；拖移與「加入人員」最多放到 12 位（SEAT-R02、D-018） */
export const CAPACITY = TABLE_CAPACITY;
export const MAX_SEATS = TABLE_MAX_SEATS;

/** 名單列數：標準 10 列，這一桌有 11、12 位時 12 列（2.1.7、2.3.1、2.5.2） */
export const rosterRows = (count: number): number => (count > CAPACITY ? MAX_SEATS : CAPACITY);
export const NOTE_SUGGESTIONS = ['主桌', '董事貴賓', '供應商', '客戶貴賓'] as const;
export const CATEGORY_LABEL: Record<Participant['kind'], string> = { EMPLOYEE: '員工', DEPENDENT: '眷屬', GUEST: '外部貴賓' };

/**
 * 座位圖上一桌收合（或精簡顯示）時需要的資料：桌號、備註名稱、部門標示與人數。
 * 座位安排頁用完整的 TableInfo；發布頁只有這些（docs/spec/permissions.md 第 2.3 節，PRM-R24）。
 */
export type TableFace = {
  id: number;
  isStaff: boolean;
  noteName: string | null;
  /** 部門標示，例如「研發一部＋業務部」；沒有人時「空桌」（SEAT-R07～R09） */
  label: string;
  count: number;
  /** 人數標示：0–9 位 {n}/10、10 位「已滿」、11、12 位「超過」（SEAT-R11） */
  status: TableStatus;
};

export type TableInfo = TableFace & {
  /** 依座號（工作人員桌依參與人員的預設排序，SEAT-R34） */
  roster: Participant[];
  /** 部門標示；沒有人時空陣列 */
  labels: string[];
  /** 10 位以上（含超過）：選單類入口停用並標示「已滿」（SEAT-R23、SEAT-R88） */
  full: boolean;
  /** 已有 12 位：拖移擋下、「加入人員」停用（SEAT-R20、SEAT-R30、SEAT-R42） */
  max: boolean;
  childSeats: number;
  vegetarians: number;
};

/** 有完整名單的桌次（座位安排頁）；發布頁的桌次只有 TableFace */
export const isTableInfo = (t: TableFace): t is TableInfo => 'roster' in t;

/** 發布頁的桌次：沒有參與人員資料，只有依名單順序的顯示名稱，展開卡片用（docs/spec/permissions.md 第 2.3 節、D-025） */
export type PublicTableFace = TableFace & { names: readonly string[] };
export const isPublicTableFace = (t: TableFace): t is PublicTableFace => 'names' in t;

/** 部門在員工名單中第一次出現的順序 */
export function departmentsInOrder(employees: readonly Employee[]): string[] {
  const out: string[] = [];
  for (const e of employees) if (e.department && !out.includes(e.department)) out.push(e.department);
  return out;
}

/** 參與人員的預設排序（participants.md PPL-R20、PPL-Q13）：和參與人員頁同一份，見 src/domain/participants.ts */
export const sortPeople = (data: Pick<AppState, 'participants'>, dir: Directory): Participant[] =>
  sortParticipants(data.participants, dir);

/** 30 桌與工作人員桌的名單與標示 */
export function buildTables(data: AppState, dir: Directory, sorted: readonly Participant[]): Map<number, TableInfo> {
  const notes = new Map(data.tables.map((t) => [t.id, t.noteName]));
  const out = new Map<number, TableInfo>();
  const byTable = new Map<number, Participant[]>();
  for (const p of data.participants) {
    if (p.tableId === null) continue;
    const list = byTable.get(p.tableId) ?? [];
    list.push(p);
    byTable.set(p.tableId, list);
  }
  const rank = new Map(sorted.map((p, i) => [p.id, i]));
  for (let id = 0; id <= TABLE_COUNT; id++) {
    const isStaff = id === STAFF_TABLE_ID;
    const roster = [...(byTable.get(id) ?? [])].sort(
      isStaff
        ? (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
        : (a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0) || a.id - b.id,
    );
    const labels = tableDepartmentLabels(roster, dir);
    out.set(id, {
      id,
      isStaff,
      noteName: isStaff ? null : (notes.get(id) ?? null),
      roster,
      labels,
      label: labels.join('＋') || '空桌',
      count: roster.length,
      full: roster.length >= (isStaff ? STAFF_TABLE_CAPACITY : TABLE_CAPACITY),
      max: roster.length >= MAX_SEATS,
      status: tableStatus(roster.length),
      childSeats: roster.filter((p) => p.childSeat).length,
      vegetarians: roster.filter((p) => p.vegetarian).length,
    });
  }
  return out;
}

/** 外部貴賓的單位／頭銜 */
export const guestOrg = (p: Participant): string => [p.organization, p.title].filter(Boolean).join(' ');

/** 人員面板第二行（SEAT-R56、COM-R11）：員工與眷屬「部門」與「組別」分開回傳，外部貴賓是單位／頭銜 */
export function panelMeta(p: Participant, dir: Directory): { department: string; team: string | null } {
  if (p.kind === 'GUEST') return { department: guestOrg(p) || '—', team: null };
  return { department: departmentOf(p, dir) ?? '—', team: teamOf(p, dir) };
}

/** 桌次詳情、加入人員對話框的第二行（COM-R10）：員工「部門・分機」、眷屬部門、外部貴賓單位／頭銜 */
export function detailMeta(p: Participant, dir: Directory): string {
  if (p.kind === 'GUEST') return guestOrg(p) || '—';
  if (p.kind === 'EMPLOYEE') {
    const e = employeeOf(p, dir);
    return e ? employeeSecondLine(e) : '—';
  }
  return departmentOf(p, dir) ?? '—';
}

/** 搜尋（SEAT-R54）：顯示名稱、分機、部門、組別與單位／頭銜 */
export const searchMatch = (p: Participant, dir: Directory, q: string): boolean =>
  matchesSearch(p, dir, q) || (!!q.trim() && !!p.title?.toLowerCase().includes(q.trim().toLowerCase()));

export const nameOf = (p: Participant, dir: Directory) => displayName(p, dir);

/** 「{備註名稱或部門}」：有備註名稱用備註名稱，沒有時用部門；空桌又沒有備註名稱時沒有（SEAT-R23、SEAT-Q05） */
export const tableDesc = (t: TableInfo): string => t.noteName || t.labels.join('＋');

/** 收合桌次的 Tooltip：「{備註名稱}・{部門}」，沒有備註名稱時只有部門（SEAT-R13） */
export const tableTooltip = (t: Pick<TableFace, 'noteName' | 'label'>): string => (t.noteName ? `${t.noteName}・${t.label}` : t.label);

// ---- 文案（docs/spec/seating.md 第 4 節）

export const msg = {
  // 參數是內部編號；文案用「{桌號} 桌」（D-019，README 第 12 節）
  seated: (name: string, n: number) => `已把 ${name} 安排到 ${tableTitle(n)}。`,
  moved: (name: string, from: number, to: number) => `已把 ${name} 從 ${tableTitle(from)}移到 ${tableTitle(to)}。`,
  staffToTable: (name: string, to: number) => `已把 ${name} 從工作人員桌移到 ${tableTitle(to)}。`,
  unseated: (name: string, n: number) => `已把 ${name} 移出 ${tableTitle(n)}。`,
  reordered: (n: number) => `已調整 ${tableTitle(n)}的座位順序。`,
  toStaff: (name: string) => `已把 ${name} 放進工作人員桌。`,
  tableToStaff: (name: string, from: number) => `已把 ${name} 從 ${tableTitle(from)}移到工作人員桌。`,
  unstaffed: (name: string) => `已把 ${name} 移出工作人員桌。`,
  swapped: (a: number, b: number) => `已把 ${tableTitle(a)}和 ${tableTitle(b)}對調。`,
  cleared: (n: number) => `已清空 ${tableTitle(n)}。`,
  added: (x: number, n: number) => `已把 ${x} 位人員加入 ${tableTitle(n)}。`,
  addedStaff: (x: number) => `已把 ${x} 位人員放進工作人員桌。`,
  staffFull: '工作人員桌已滿，請先移出一位。',
  staffLimit: '工作人員桌已達 12 位，請先移出一位。',
  employeeOnly: '只有員工可以放進工作人員桌。',
  undone: '已復原。',
  saved: '已儲存',
};

/** 放進來後這一桌超過 10 位：成功的 Sonner 後面加上「這一桌已超過 10 位。」（SEAT-R89） */
export const withOverflowNote = (text: string): string => text.replace(/。$/, '，這一桌已超過 10 位。');

/** 入座或搬移到一般桌的提示（SEAT-R18、R19、R45） */
export function seatMessage(p: Participant, name: string, to: number): string {
  if (p.tableId === STAFF_TABLE_ID) return msg.staffToTable(name, to);
  if (p.tableId === null) return msg.seated(name, to);
  return msg.moved(name, p.tableId, to);
}
