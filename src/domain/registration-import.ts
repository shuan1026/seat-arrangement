// Google 表單尾牙報名表的匯入計畫（D-010；docs/spec/participants.md 第 3.6 節、第 4.4 節；docs/architecture.md 第 11.2 節）。
// 純函式：輸入 CSV 解析後的二維陣列、員工名單與目前的參與人員，輸出要新增、要更新與需要處理的人。
// 參與人員頁的匯入與正式版的 seed 共用這一份（D-007）。不讀也不輸出電子郵件與填寫時間（PPL-R67）。
import type { Employee, Participant } from '@/contracts/entities';

export type RegistrationDependent = { childSeat: boolean; vegetarian: boolean };

/** 還沒報名的員工：新增一位員工（PPL-R72），攜帶眷屬時同時新增一位眷屬（PPL-R73） */
export type RegistrationCreate = {
  /** 採用的那一列（同一人填好幾次時是最後一列）；表頭是第 1 列 */
  row: number;
  employeeId: number;
  vegetarian: boolean;
  note: string | null;
  dependent: RegistrationDependent | null;
};

/** 已報名的員工：依表單更新（PPL-R80、PPL-R81、PPL-R83） */
export type RegistrationUpdate = {
  row: number;
  participantId: number;
  vegetarian: boolean;
  /** 匯入後的備註：系統已有備註時保留，沒有時才用表單的備註（D-013） */
  note: string | null;
  /** null：不動眷屬；participantId 是 null：補一位；否則更新那位眷屬 */
  dependent: (RegistrationDependent & { participantId: number | null }) | null;
};

/** 需要處理的人（PPL-R71、PPL-R82、PPL-R83）；name、department 是表單上填的文字（去掉前後空白） */
export type RegistrationIssue = { row: number; name: string; department: string; reason: string };

export type RegistrationPlan =
  | { ok: false; error: 'FORMAT' }
  | { ok: true; create: RegistrationCreate[]; update: RegistrationUpdate[]; issues: RegistrationIssue[] };

/** 錯誤清單的原因（第 4.4 節，PPL-Q26 的目前假設） */
export const REGISTRATION_ISSUE_REASON = {
  notFound: (name: string) => `員工名單上找不到 ${name}。`,
  ambiguous: (name: string) => `員工名單上有多位 ${name}，部門也無法判斷是哪一位。`,
  notAttending: (name: string) => `${name} 已報名，但最後一次填寫不參加；要取消請到參與人員手動取消報名。`,
  noDependent: (name: string) => `${name} 已有眷屬，但最後一次填寫沒有攜帶眷屬；要移除請到參與人員手動刪除眷屬。`,
} as const;

/** 比對用：相容字元轉成一般字（例如 ⽛→牙、⼀→一），去掉半形與全形空白與 BOM（PPL-R66、PPL-R71） */
export const normalizeText = (s: string): string => s.normalize('NFKC').replace(/[\s　﻿]+/g, '');

/** PPL-R66 表：欄位 → 正規化後的表頭要包含的文字 */
const COLUMNS = {
  name: '名字',
  department: '部門',
  attending: '是否會參加',
  dependent: '是否攜帶眷屬',
  childSeat: '兒童座椅',
  diet: '您的飲食習慣',
  meatOrVeg: '吃葷還是吃素',
  dependentDiet: '眷屬的飲食習慣',
  note: '備註',
} as const;
type Column = keyof typeof COLUMNS;
/** 「本人葷素」這一欄可以不存在（PPL-R68） */
const OPTIONAL: readonly Column[] = ['meatOrVeg'];

/** 回答去掉前後空白後以「是」開頭就算「是」（PPL-Q01） */
const isYes = (v: string) => v.normalize('NFKC').trim().startsWith('是');
/** 含「素」而且不含「葷」才標素食（PPL-Q23） */
const isVegetarian = (v: string) => v.includes('素') && !v.includes('葷');
const textOrNull = (v: string) => v.trim() || null;

type Answer = { row: number; cells: Record<Column, string>; employee: Employee | null; ambiguous: boolean };

export function parseRegistrations(
  rows: readonly (readonly string[])[],
  employees: readonly Employee[],
  participants: readonly Participant[] = [],
): RegistrationPlan {
  const [header, ...body] = rows;
  if (!header) return { ok: false, error: 'FORMAT' };
  const normalized = header.map((h) => normalizeText(h ?? ''));
  const index = {} as Record<Column, number>;
  for (const column of Object.keys(COLUMNS) as Column[]) {
    const at = normalized.findIndex((h) => h.includes(COLUMNS[column]));
    if (at < 0 && !OPTIONAL.includes(column)) return { ok: false, error: 'FORMAT' };
    index[column] = at;
  }

  const byName = new Map<string, Employee[]>();
  for (const e of employees) {
    const key = normalizeText(e.name);
    byName.set(key, [...(byName.get(key) ?? []), e]);
  }
  const registration = new Map<number, Participant>();
  const dependentOf = new Map<number, Participant>();
  for (const p of participants) {
    if (p.kind === 'EMPLOYEE' && p.employeeId != null) registration.set(p.employeeId, p);
    if (p.kind === 'DEPENDENT' && p.hostId != null) dependentOf.set(p.hostId, p);
  }

  // 同一人填好幾次時以最後一列為準（PPL-R69）：對應得到員工名單的以員工判斷，對不到的以名字與部門判斷（PPL-Q24）
  const latest = new Map<string, Answer>();
  body.forEach((cells, i) => {
    const read = (column: Column) => (index[column] >= 0 ? (cells[index[column]] ?? '') : '');
    const answer = Object.fromEntries((Object.keys(COLUMNS) as Column[]).map((c) => [c, read(c)])) as Record<Column, string>;
    const name = normalizeText(answer.name);
    if (!name) return; // 沒有名字的列無法判斷是誰
    const department = normalizeText(answer.department);
    const sameName = byName.get(name) ?? [];
    const candidates = sameName.length > 1 ? sameName.filter((e) => normalizeText(e.department) === department) : sameName;
    const employee = candidates.length === 1 ? candidates[0]! : null;
    const key = employee ? `e:${employee.id}` : `u:${name}\u0000${department}`;
    latest.delete(key); // 重新插入，讓 Map 的順序跟著最後一列
    latest.set(key, { row: i + 2, cells: answer, employee, ambiguous: sameName.length > 1 });
  });

  const create: RegistrationCreate[] = [];
  const update: RegistrationUpdate[] = [];
  const issues: RegistrationIssue[] = [];
  for (const { row, cells, employee, ambiguous } of latest.values()) {
    const attending = isYes(cells.attending);
    const name = cells.name.trim();
    const issue = (reason: string) => issues.push({ row, name, department: cells.department.trim(), reason });

    if (!employee) {
      // 對不到員工名單、沒有參加的人不新增，也不算需要處理（PPL-R70）
      if (attending) issue(ambiguous ? REGISTRATION_ISSUE_REASON.ambiguous(name) : REGISTRATION_ISSUE_REASON.notFound(name));
      continue;
    }

    const vegetarian = isVegetarian(cells.diet) || isVegetarian(cells.meatOrVeg);
    const formNote = textOrNull(cells.note);
    // 沒有攜帶眷屬時不看兒童座椅欄（PPL-Q25）
    const dependent = isYes(cells.dependent)
      ? { childSeat: isYes(cells.childSeat), vegetarian: isVegetarian(cells.dependentDiet) }
      : null;
    const registered = registration.get(employee.id);

    if (!registered) {
      if (attending) create.push({ row, employeeId: employee.id, vegetarian, note: formNote, dependent });
      continue;
    }
    // 已報名的員工最後一次填不參加：不自動取消報名，列為需要處理（PPL-R82）
    if (!attending) {
      issue(REGISTRATION_ISSUE_REASON.notAttending(name));
      continue;
    }
    const existing = dependentOf.get(registered.id);
    update.push({
      row,
      participantId: registered.id,
      vegetarian,
      note: registered.note || formNote,
      dependent: dependent ? { participantId: existing?.id ?? null, ...dependent } : null,
    });
    // 系統有眷屬、表單沒有攜帶眷屬：不刪除眷屬，列為需要處理（PPL-R83）
    if (!dependent && existing) issue(REGISTRATION_ISSUE_REASON.noDependent(name));
  }

  const byRow = <T extends { row: number }>(a: T, b: T) => a.row - b.row;
  return { ok: true, create: create.sort(byRow), update: update.sort(byRow), issues: issues.sort(byRow) };
}
