// 通訊錄 CSV 的列 → 員工（docs/spec/employees.md 第 3.8 節 EMP-R45～R62；D-012）。
// 純函式：輸入 src/server/csv.ts parseCsv 的結果（第一列是表頭，每格已去掉前後空白），
// 回傳要匯入的員工、略過的列數與需要處理的列。以「姓名＋部門」對應既有員工（新增或更新）是服務層的事。
// 匯入員工名單對話框與 seed（D-007）共用。
import { ROSTER_TEMPLATE_HEADER } from '@/contracts/employees';
import type { ImportRowError } from '@/contracts/imports';

/** 員工名單只存這 7 個欄位：手機號碼與代接群組不存（EMP-R56） */
export type RosterEmployee = {
  name: string;
  englishName: string | null;
  department: string;
  team: string | null;
  extension: string | null;
  region: string | null;
  office: string | null;
};

export type RosterSourceRow = { row: number; values: string[] };

export type RosterParseResult =
  | { ok: false }
  | {
      ok: true;
      /** 依檔案中第一次出現的順序；姓名加部門相同的列已合併 */
      employees: RosterEmployee[];
      /** 和 employees 一一對應：每位員工來自檔案的哪些列 */
      sources: RosterSourceRow[][];
      /** 檔案有沒有「組別」欄；沒有時 team 一律 null，既有員工的組別不改（EMP-R62） */
      hasTeamColumn: boolean;
      /** 略過、不算需要處理的列（EMP-R49～R51） */
      skipped: number;
      errors: ImportRowError[];
      /** 錯誤清單 CSV 的表頭：列號、原因，接著是檔案的欄名 */
      header: string[];
    };

type Column = (typeof ROSTER_TEMPLATE_HEADER)[number];

/** 可以省略的欄：沒有時照常匯入（EMP-R62） */
const OPTIONAL_COLUMNS: ReadonlySet<Column> = new Set(['組別']);

/** 資料庫欄位的長度上限（prisma/schema.prisma、src/contracts/employees.ts）：超過的列列為需要處理，不寫入 */
const MAX_LENGTH: Record<keyof RosterEmployee, number> = {
  name: 50,
  englishName: 100,
  department: 50,
  team: 50,
  extension: 50,
  region: 20,
  office: 50,
};

const FIELD_LABEL: Record<keyof RosterEmployee, Column> = {
  name: '姓名',
  englishName: '英文名',
  department: '部門',
  team: '組別',
  extension: '分機',
  region: '地區',
  office: '辦公室',
};

/** 錯誤清單的原因（EMP-Q03：錯誤情況與文案依 D-008 先照目前做法，只把部門空白列為錯誤；另加資料超過欄位長度） */
export const ROSTER_ERROR_REASON = {
  departmentMissing: '部門是空白的，請填上部門後重新匯入。',
  tooLong: (label: string, max: number) => `${label}超過 ${max} 個字，請縮短後重新匯入。`,
  /** EMP-R55、D-012：服務層使用 */
  ambiguousExisting: '員工名單已有兩位以上姓名與部門都相同的員工，請先在員工名單確認後再匯入。',
} as const;

/** 多個分機以「／」連接（COM-R15） */
export const EXTENSION_SEPARATOR = '／';

/** 「姓名＋部門」：對應既有員工與合併同一人的鍵 */
export const rosterKey = (name: string, department: string): string => `${name}\u0000${department}`;

/** 欄名前後的空白與 BOM 忽略（EMP-R62） */
const normalizeHeader = (cell: string) => cell.replace(/^﻿/, '').trim();

const optional = (v: string): string | null => (v ? v : null);

/** 分機「N/A」視為沒有分機（EMP-R53） */
const extensionOf = (v: string): string | null => (!v || v.toUpperCase() === 'N/A' ? null : v);

export function parseRoster(rows: string[][]): RosterParseResult {
  const [rawHeader, ...body] = rows;
  if (!rawHeader) return { ok: false };
  const header = rawHeader.map((c) => normalizeHeader(c ?? ''));

  // 欄名對應到欄位位置：順序不限；沒有欄名的欄（序號）忽略；同名的欄取第一欄
  const index = new Map<string, number>();
  header.forEach((name, i) => {
    if (name && !index.has(name)) index.set(name, i);
  });
  for (const column of ROSTER_TEMPLATE_HEADER) {
    if (!OPTIONAL_COLUMNS.has(column) && !index.has(column)) return { ok: false };
  }
  const hasTeamColumn = index.has('組別');
  const cell = (values: readonly string[], column: Column) => {
    const i = index.get(column);
    return i === undefined ? '' : (values[i] ?? '').trim();
  };

  const groups = new Map<string, { first: RosterEmployee; extensions: string[]; sources: RosterSourceRow[] }>();
  const errors: ImportRowError[] = [];
  let skipped = 0;

  body.forEach((values, i) => {
    const row = i + 2; // 表頭是第 1 列
    const name = cell(values, '姓名');
    const department = cell(values, '部門');
    const englishName = cell(values, '英文名');
    // 略過規則先於錯誤判斷（EMP-R51）：總機資訊與空白列、「空位」、公共區域、英文名空白的設備列
    if (!name || name === '空位' || department === '公共區域' || !englishName) {
      skipped++;
      return;
    }
    const source = { row, values: [...values] };
    if (!department) {
      errors.push({ row, reason: ROSTER_ERROR_REASON.departmentMissing, values: source.values });
      return;
    }
    const extension = extensionOf(cell(values, '分機'));
    const key = rosterKey(name, department);
    const group = groups.get(key);
    if (group) {
      // 同一人多列：分機依列順序連接，其他欄位取第一列（EMP-R52、D-012）
      if (extension) group.extensions.push(extension);
      group.sources.push(source);
      return;
    }
    groups.set(key, {
      first: {
        name,
        englishName,
        department,
        team: hasTeamColumn ? optional(cell(values, '組別')) : null,
        extension,
        region: optional(cell(values, '地區')),
        office: optional(cell(values, '辦公室')),
      },
      extensions: extension ? [extension] : [],
      sources: [source],
    });
  });

  const employees: RosterEmployee[] = [];
  const sources: RosterSourceRow[][] = [];
  for (const g of groups.values()) {
    const employee: RosterEmployee = {
      ...g.first,
      extension: g.extensions.length ? g.extensions.join(EXTENSION_SEPARATOR) : null,
    };
    // 超過資料庫欄位長度的資料不能寫入：這位員工的每一列都列為需要處理
    const tooLong = (Object.keys(MAX_LENGTH) as (keyof RosterEmployee)[]).find(
      (k) => (employee[k]?.length ?? 0) > MAX_LENGTH[k],
    );
    if (tooLong) {
      const reason = ROSTER_ERROR_REASON.tooLong(FIELD_LABEL[tooLong], MAX_LENGTH[tooLong]);
      for (const s of g.sources) errors.push({ row: s.row, reason, values: s.values });
      continue;
    }
    employees.push(employee);
    sources.push(g.sources);
  }

  errors.sort((a, b) => a.row - b.row);
  return { ok: true, employees, sources, hasTeamColumn, skipped, errors, header: ['列號', '原因', ...header] };
}
