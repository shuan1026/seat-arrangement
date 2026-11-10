// seed 匯入真實名單的匯入程式（docs/plan/implementation-plan.md 第 6 節第 4 項）。
// 依據：
// - D-007：員工表是空的、而且 roster.csv 與 registrations.csv 都存在時，先匯入員工名單、再匯入報名表；在同一個
//   READ COMMITTED 交易內完成，交易一開始先鎖住工作人員桌那一列（SELECT id FROM SeatTable WHERE id = 0 FOR UPDATE，
//   到 commit／rollback 才放開），避免多個執行個體重複匯入；員工表已有資料時跳過並記 Log；對不到員工名單的人不匯入、記在 Log。
// - D-012、docs/spec/employees.md EMP-R44～R62：roster.csv 是通訊錄匯出檔加「組別」欄，沿用畫面匯入的規則。
// - D-010、docs/spec/participants.md PPL-R64～R85：registrations.csv 是 Google 表單原檔，沿用畫面匯入的規則。
// - D-015：可選的 staff.csv（姓名、部門）與 tables.csv（桌號、備註名稱）；對不到、沒有報名、工作人員超過 10 位、
//   桌號不在 1～30、備註名稱超過 20 字的列略過並記 Log，其他照常；工作人員的眷屬不另外處理；seed 不自動排座。
// - docs/architecture.md 第 7.1 節（工作人員 = 坐在工作人員桌 tableId 0 的員工）、第 7.3 節（任何一列以外的錯誤就整批
//   不寫入；匯入摘要寫進 Log、不印電子郵件）、第 15.2 節（Log 不記分機、email 與 CSV 內容）；
//   docs/spec/seating.md SEAT-R42、SEAT-R44；備註名稱上限 20 字依 SEAT-Q13 的目前假設（src/contracts/seating.ts）。
// 只用暫存資料夾裡的虛構 CSV，不讀 prisma/seed-data/ 或任何真實資料。
//
// 介面假設（實作時照這裡做）：
// - src/server/seed-import.ts 匯出 importSeedFiles（型別是 SeedImporter），由伺服器啟動流程（src/server/seed-startup.ts）登記。
// - SEED_FILES 增加 staff: 'staff.csv'、tables: 'tables.csv'；runSeed 只在檔案存在時把路徑放進 files.staff、files.tables。
// - SeedSummary 的欄位：
//     employees          新增的員工人數
//     participants       報名的員工人數（不含眷屬）
//     dependents         眷屬人數
//     unmatched          報名表中對不到員工名單的人數
//     staff              放進工作人員桌的人數
//     staffSkipped       staff.csv 略過的列數（對不到、沒有報名、工作人員桌已滿）
//     tableNotes         寫入備註名稱的桌數
//     tableNotesSkipped  tables.csv 略過的列數（桌號不是 1～30 的整數、備註名稱空白或超過 20 字）
//   完全空白的列算不算在 *Skipped 裡規格沒寫，測試不斷言。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import type * as SeedModule from '@/server/seed';
import { registerSeedImporter, runSeed, SEED_FILES } from '@/server/seed';
import { importSeedFiles } from '@/server/seed-import';
import { prisma, resetData } from '../../helpers/db';
import {
  ADDRESS_BOOK_HEADER,
  FAKE_MOBILE,
  FAKE_PICKUP_GROUP,
  headerRenamed,
  headerWithout,
  rosterCsv,
  rosterPerson,
  SWITCHBOARD_ROW,
  withSerial,
  type RosterRecord,
} from '../../helpers/employees-roster';
import { createRegisteredEmployee } from '../../helpers/factory';
import {
  answer,
  FORM_COLUMNS,
  FULL_WIDTH_HEADERS,
  registrationCsv,
  ROSTER_CSV,
  toCsvText,
  type RegistrationAnswer,
  type RegistrationColumn,
} from '../../helpers/participants-registration-csv';

const ENABLED: NodeJS.ProcessEnv = { ...process.env, SEED_IMPORT: '1' };

// ---- 虛構的資料檔

/** roster.csv：通訊錄匯出檔（第一欄是沒有欄名的序號、「姓名」欄名前有空白）最後加「組別」欄（D-007、D-012） */
const ROSTER_HEADER: readonly string[] = [...ADDRESS_BOOK_HEADER, '組別'];
const rosterFile = (records: readonly RosterRecord[]) => rosterCsv(withSerial(records), ROSTER_HEADER);

/** registrations.csv：Google 表單匯出的原檔，UTF-8 含 BOM、表頭有全形空白（PPL-R66、PPL-Q01） */
const registrationFile = (
  answers: readonly RegistrationAnswer[],
  columns: readonly RegistrationColumn[] = FORM_COLUMNS,
) => `﻿${registrationCsv(answers, { columns, headers: FULL_WIDTH_HEADERS })}`;

/** staff.csv：欄位「姓名、部門」（D-015） */
const staffFile = (rows: readonly (readonly string[])[], header: readonly string[] = ['姓名', '部門']) =>
  toCsvText([header, ...rows]);

/** tables.csv：欄位「桌號、備註名稱」（D-015） */
const tablesFile = (rows: readonly (readonly string[])[], header: readonly string[] = ['桌號', '備註名稱']) =>
  toCsvText([header, ...rows]);

/** 虛構的分機：要能在 Log 裡辨認出來（不會和筆數、耗時混淆） */
const EXT_A = '#8642';
const EXT_B = '#8643';
const FORM_NOTE = '需要靠走道';

/** 員工名單：6 位員工，加上各種略過的列、一列有錯誤、同一人兩列 */
const MAIN_ROSTER: RosterRecord[] = [
  rosterPerson('王小明', '研發一部', { 分機: EXT_A, 組別: '前端組' }),
  SWITCHBOARD_ROW, // 總機資訊列：略過（EMP-R49）
  rosterPerson('陳大文', '研發一部', { 組別: '後端組' }),
  rosterPerson('李美華', '業務部'),
  rosterPerson('張三', '業務部'),
  rosterPerson('李四', '行政部'),
  rosterPerson('空位', '研發一部', { 英文名: '空位' }), // 略過（EMP-R50）
  rosterPerson('第一會議室', '公共區域', { 英文名: 'Meeting Room' }), // 略過（EMP-R51）
  rosterPerson('主機房', '研發一部', { 英文名: '' }), // 一般部門裡的設備列：略過（EMP-R51、D-012）
  rosterPerson('孫七', ''), // 部門空白：有錯誤的列，不匯入（EMP-R58）
  rosterPerson('王小明', '研發一部', { 分機: EXT_B }), // 同一人第二列：合併分機（EMP-R52）
  rosterPerson('周八', '研發二部'),
];

/** 報名表：王小明攜帶眷屬、陳大文與李美華參加；張三不參加；趙六對不到員工名單；周八最後一次改成不參加 */
const MAIN_FORM: RegistrationAnswer[] = [
  answer(`王小明／研發一部／是／是／是／葷食／素食／${FORM_NOTE}`),
  answer('陳大文／研發一部／是／否／否／葷食'),
  answer('周八／研發二部／是'),
  answer('李美華／業務部／是'),
  answer('張三／業務部／否'),
  answer('趙六／行政部／是'),
  answer('周八／研發二部／否'),
];

/** 工作人員：檔案順序和員工名單不同；趙六對不到、張三填不參加、李四沒有填報名表 */
const MAIN_STAFF = [
  ['李美華', '業務部'],
  ['趙六', '行政部'],
  ['王小明', '研發一部'],
  ['張三', '業務部'],
  ['李四', '行政部'],
];

/** 備註名稱：0（工作人員桌）與 31 不是 1～30 */
const MAIN_TABLES = [
  ['1', '主桌'],
  ['2', '董事桌'],
  ['17', '供應商桌 1'],
  ['0', '工作人員桌'],
  ['31', '第三十一桌'],
];
const MAIN_NOTES = { 1: '主桌', 2: '董事桌', 17: '供應商桌 1' };

const MAIN_SUMMARY = {
  employees: 6,
  participants: 3,
  dependents: 1,
  unmatched: 1,
  staff: 2,
  staffSkipped: 3,
  tableNotes: 3,
  tableNotesSkipped: 2,
};

type SeedFiles = { roster?: string; registrations?: string; staff?: string; tables?: string };

const mainFiles = (): SeedFiles => ({
  roster: rosterFile(MAIN_ROSTER),
  registrations: registrationFile(MAIN_FORM),
  staff: staffFile(MAIN_STAFF),
  tables: tablesFile(MAIN_TABLES),
});

/** 給 staff.csv、tables.csv 的測試用：王小明、陳大文、李美華都已報名 */
const threeRegistered = (): SeedFiles => ({
  roster: rosterFile([
    rosterPerson('王小明', '研發一部'),
    rosterPerson('陳大文', '研發一部'),
    rosterPerson('李美華', '業務部'),
  ]),
  registrations: registrationFile([
    answer('王小明／研發一部／是'),
    answer('陳大文／研發一部／是'),
    answer('李美華／業務部／是'),
  ]),
});

// ---- 測試環境

let dir: string;
const cleanups: (() => void)[] = [];

beforeEach(async () => {
  await resetData();
  dir = mkdtempSync(path.join(os.tmpdir(), 'seat-seed-import-test-'));
  registerSeedImporter(importSeedFiles);
});

afterEach(() => {
  for (const fn of cleanups.splice(0).reverse()) fn();
  rmSync(dir, { recursive: true, force: true });
});

function writeSeedFiles(files: SeedFiles) {
  for (const [key, text] of Object.entries(files) as [keyof SeedFiles, string | undefined][]) {
    if (text !== undefined) writeFileSync(path.join(dir, SEED_FILES[key]), text);
  }
}

// ---- 查詢

async function registrationOf(name: string, department?: string) {
  const employee = await prisma.employee.findFirst({ where: { name, ...(department ? { department } : {}) } });
  if (!employee) return null;
  return prisma.participant.findUnique({ where: { employeeId: employee.id }, include: { dependent: true } });
}

/** 工作人員桌的名單（依桌內順序） */
async function staffTable() {
  const seated = await prisma.participant.findMany({
    where: { tableId: STAFF_TABLE_ID },
    include: { employee: true },
    orderBy: { seatOrder: 'asc' },
  });
  return seated.map((p) => ({
    name: p.employee?.name ?? null,
    department: p.employee?.department ?? null,
    kind: p.kind,
    seatOrder: p.seatOrder,
  }));
}

/** 預期的工作人員桌：依序從 0 起連續 */
const staffAt = (...people: (readonly [string, string])[]) =>
  people.map(([name, department], seatOrder) => ({ name, department, kind: 'EMPLOYEE', seatOrder }));

/** 有備註名稱的桌次：桌號 → 備註名稱 */
async function noteNames(): Promise<Record<number, string>> {
  const tables = await prisma.seatTable.findMany({ where: { noteName: { not: null } }, orderBy: { id: 'asc' } });
  return Object.fromEntries(tables.map((t) => [t.id, t.noteName ?? ''] as const));
}

/** 打開 Log 輸出（整合測試預設 LOG_SILENT=1）並收集每一行 */
function captureLogs() {
  const saved = process.env.LOG_SILENT;
  delete process.env.LOG_SILENT;
  const raw: string[] = [];
  const collect = (...args: unknown[]) => {
    raw.push(args.map(String).join(' '));
  };
  const spies = [
    vi.spyOn(console, 'info').mockImplementation(collect),
    vi.spyOn(console, 'error').mockImplementation(collect),
    vi.spyOn(console, 'warn').mockImplementation(collect),
    vi.spyOn(console, 'log').mockImplementation(collect),
  ];
  cleanups.push(() => {
    for (const s of spies) s.mockRestore();
    if (saved === undefined) delete process.env.LOG_SILENT;
    else process.env.LOG_SILENT = saved;
  });
  return {
    raw,
    events: () =>
      raw.flatMap((line) => {
        try {
          return [JSON.parse(line) as Record<string, unknown>];
        } catch {
          return [];
        }
      }),
  };
}

// ---- 測試

describe('匯入員工名單與報名表（D-007）', () => {
  it('員工表是空的、兩個資料檔都在：回傳 imported 與匯入摘要的筆數', async () => {
    writeSeedFiles(mainFiles());
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({ status: 'imported', ...MAIN_SUMMARY });
  });

  it('員工名單照畫面匯入的規則：通訊錄匯出檔的表頭可以匯入；略過總機、空位、公共區域、設備列；部門空白的列不匯入；同一人合併分機；依檔案順序（EMP-R49～R58、EMP-R62）', async () => {
    writeSeedFiles(mainFiles());
    await runSeed(ENABLED, dir);

    const employees = await prisma.employee.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    expect(employees.map((e) => e.name)).toEqual(['王小明', '陳大文', '李美華', '張三', '李四', '周八']);
    expect(employees[0]).toMatchObject({
      name: '王小明',
      department: '研發一部',
      team: '前端組',
      extension: `${EXT_A}／${EXT_B}`,
    });
    expect(employees[1]).toMatchObject({ name: '陳大文', team: '後端組' });
  });

  it('報名表照畫面匯入的規則：只收最後一次參加的人、眷屬與兒童椅、素食、備註；對不到員工名單的人不匯入（PPL-R69～R74、PPL-R85）', async () => {
    writeSeedFiles(mainFiles());
    await runSeed(ENABLED, dir);

    const wang = await registrationOf('王小明');
    expect(wang).toMatchObject({ kind: 'EMPLOYEE', vegetarian: false, note: FORM_NOTE });
    expect(wang?.dependent).toMatchObject({
      kind: 'DEPENDENT',
      relation: null,
      childSeat: true,
      vegetarian: true,
      tableId: null,
      seatOrder: null,
    });
    expect(await registrationOf('陳大文')).toMatchObject({ kind: 'EMPLOYEE', dependent: null });
    expect(await registrationOf('李美華')).toMatchObject({ kind: 'EMPLOYEE' });
    expect(await registrationOf('張三')).toBeNull(); // 填不參加
    expect(await registrationOf('周八')).toBeNull(); // 最後一次填不參加
    expect(await registrationOf('李四')).toBeNull(); // 沒有填報名表
    expect(await prisma.employee.count({ where: { name: '趙六' } })).toBe(0); // 對不到員工名單，不新增員工
    expect(await prisma.participant.count({ where: { kind: 'EMPLOYEE' } })).toBe(3);
    expect(await prisma.participant.count({ where: { kind: 'DEPENDENT' } })).toBe(1);
    expect(await prisma.participant.count({ where: { kind: 'GUEST' } })).toBe(0);
  });

  it('seed 不自動排座：除了工作人員，所有參與人員都是未入座（D-015）', async () => {
    writeSeedFiles(mainFiles());
    await runSeed(ENABLED, dir);

    expect(await prisma.participant.count({ where: { tableId: { gte: 1 } } })).toBe(0);
    const staffIds = (await prisma.participant.findMany({ where: { tableId: STAFF_TABLE_ID } })).map((p) => p.id);
    const unseated = await prisma.participant.findMany({ where: { id: { notIn: staffIds } } });
    expect(unseated).toHaveLength(2); // 陳大文、王小明的眷屬
    for (const p of unseated) expect(p).toMatchObject({ tableId: null, seatOrder: null });
  });
});

describe('staff.csv：預設工作人員（D-015）', () => {
  it('對得到而且已報名的人放進工作人員桌：依 staff.csv 的順序（不是員工名單的順序），桌內順序從 0 起連續', async () => {
    writeSeedFiles(mainFiles());
    await runSeed(ENABLED, dir);
    expect(await staffTable()).toEqual(staffAt(['李美華', '業務部'], ['王小明', '研發一部']));
  });

  it('工作人員的眷屬不進工作人員桌，維持未入座（SEAT-R44）', async () => {
    writeSeedFiles(mainFiles());
    await runSeed(ENABLED, dir);
    const wang = await registrationOf('王小明');
    expect(wang).toMatchObject({ tableId: STAFF_TABLE_ID });
    expect(wang?.dependent).toMatchObject({ tableId: null, seatOrder: null });
  });

  it('姓名加部門對不到員工名單（名單上沒有、部門不同、姓名空白）：那一列略過，其他照常', async () => {
    writeSeedFiles({
      ...threeRegistered(),
      staff: staffFile([
        ['李美華', '業務部'],
        ['趙六', '行政部'],
        ['陳大文', '業務部'],
        ['', '業務部'],
        ['王小明', '研發一部'],
      ]),
    });
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({ status: 'imported', staff: 2, staffSkipped: 3 });
    expect(await staffTable()).toEqual(staffAt(['李美華', '業務部'], ['王小明', '研發一部']));
    expect(await registrationOf('陳大文')).toMatchObject({ tableId: null, seatOrder: null });
  });

  it('員工名單上有同名的人時，以部門對到那一位', async () => {
    writeSeedFiles({
      roster: rosterFile([rosterPerson('王小明', '研發一部'), rosterPerson('王小明', '業務部')]),
      registrations: registrationFile([answer('王小明／研發一部／是'), answer('王小明／業務部／是')]),
      staff: staffFile([['王小明', '業務部']]),
    });
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({ status: 'imported', staff: 1, staffSkipped: 0 });
    expect(await staffTable()).toEqual(staffAt(['王小明', '業務部']));
    expect(await registrationOf('王小明', '研發一部')).toMatchObject({ tableId: null });
  });

  it('對得到但沒有報名（沒有填報名表、填不參加、最後一次改成不參加）：那一列略過，也不會因此加入尾牙', async () => {
    writeSeedFiles({
      roster: rosterFile([
        rosterPerson('王小明', '研發一部'),
        rosterPerson('陳大文', '研發一部'),
        rosterPerson('李美華', '業務部'),
        rosterPerson('張三', '業務部'),
        rosterPerson('李四', '行政部'),
      ]),
      registrations: registrationFile([
        answer('王小明／研發一部／是'),
        answer('陳大文／研發一部／是'),
        answer('張三／業務部／否'),
        answer('李美華／業務部／是'),
        answer('陳大文／研發一部／否'),
      ]),
      staff: staffFile([
        ['張三', '業務部'],
        ['王小明', '研發一部'],
        ['李四', '行政部'],
        ['陳大文', '研發一部'],
        ['李美華', '業務部'],
      ]),
    });
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({ status: 'imported', staff: 2, staffSkipped: 3 });
    expect(await staffTable()).toEqual(staffAt(['王小明', '研發一部'], ['李美華', '業務部']));
    expect(await registrationOf('張三')).toBeNull();
    expect(await registrationOf('李四')).toBeNull();
    expect(await registrationOf('陳大文')).toBeNull();
    expect(await prisma.participant.count()).toBe(2);
  });

  it('工作人員桌已滿 10 位：第 11 位起略過，仍是已報名、未入座；略過的列不佔位子（SEAT-R42）', async () => {
    const crew = Array.from({ length: 12 }, (_, i) => `測試員工${String(i + 1).padStart(2, '0')}`);
    writeSeedFiles({
      roster: rosterFile(crew.map((name) => rosterPerson(name, '測試部'))),
      registrations: registrationFile(crew.map((name) => answer(`${name}／測試部／是`))),
      staff: staffFile([
        ...crew.slice(0, 5).map((name) => [name, '測試部']),
        ['查無此人', '測試部'],
        ...crew.slice(5).map((name) => [name, '測試部']),
      ]),
    });

    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({ status: 'imported', staff: 10, staffSkipped: 3 });
    expect(await staffTable()).toEqual(staffAt(...crew.slice(0, 10).map((name) => [name, '測試部'] as const)));
    for (const name of crew.slice(10)) {
      expect(await registrationOf(name)).toMatchObject({ kind: 'EMPLOYEE', tableId: null, seatOrder: null });
    }
  });

  it('空白列略過，其他照常；桌內順序仍從 0 起連續', async () => {
    writeSeedFiles({
      ...threeRegistered(),
      staff: staffFile([['王小明', '研發一部'], [''], ['', ''], ['李美華', '業務部']]),
    });
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({ status: 'imported', staff: 2 });
    expect(await staffTable()).toEqual(staffAt(['王小明', '研發一部'], ['李美華', '業務部']));
  });

  it('沒有 staff.csv：跳過這一步，沒有人是工作人員，其他照常匯入', async () => {
    const { staff, ...rest } = mainFiles();
    expect(staff).toBeDefined();
    writeSeedFiles(rest);
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({
      status: 'imported',
      employees: 6,
      participants: 3,
      staff: 0,
      staffSkipped: 0,
      tableNotes: 3,
    });
    expect(await staffTable()).toEqual([]);
    expect(await prisma.participant.count({ where: { tableId: { not: null } } })).toBe(0);
    expect(await noteNames()).toEqual(MAIN_NOTES);
  });
});

describe('tables.csv：備註名稱（D-015）', () => {
  it('寫入第 1～30 桌的備註名稱；工作人員桌（0）與 31 略過', async () => {
    writeSeedFiles(mainFiles());
    await runSeed(ENABLED, dir);
    expect(await noteNames()).toEqual(MAIN_NOTES);
  });

  it('桌號不是 1～30 的整數（0、31、文字、小數、負數、空白）：那一列略過，其他照常', async () => {
    writeSeedFiles({
      ...threeRegistered(),
      tables: tablesFile([
        ['1', '主桌'],
        ['0', '工作人員桌'],
        ['31', '第三十一桌'],
        ['第5桌', '文字桌號'],
        ['5.5', '小數桌號'],
        ['-1', '負數桌號'],
        ['', '沒有桌號'],
        ['30', '最後一桌'],
      ]),
    });
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({
      status: 'imported',
      tableNotes: 2,
      tableNotesSkipped: 6,
    });
    expect(await noteNames()).toEqual({ 1: '主桌', 30: '最後一桌' });
  });

  it('備註名稱空白或超過 20 字：那一列略過；剛好 20 字照常寫入（SEAT-Q13）', async () => {
    const twenty = '一二三四五六七八九十'.repeat(2);
    expect(twenty).toHaveLength(20);
    writeSeedFiles({
      ...threeRegistered(),
      tables: tablesFile([
        ['1', twenty],
        ['2', `${twenty}一`],
        ['3', ''],
        ['6', '   '],
        ['4', '主桌'],
      ]),
    });
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({
      status: 'imported',
      tableNotes: 2,
      tableNotesSkipped: 3,
    });
    expect(await noteNames()).toEqual({ 1: twenty, 4: '主桌' });
  });

  it('空白列略過，其他照常', async () => {
    writeSeedFiles({
      ...threeRegistered(),
      tables: tablesFile([['3', '部門桌'], [''], ['', ''], ['5', '財務桌']]),
    });
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({ status: 'imported', tableNotes: 2 });
    expect(await noteNames()).toEqual({ 3: '部門桌', 5: '財務桌' });
  });

  it('沒有 tables.csv：跳過這一步，沒有任何備註名稱，其他照常匯入', async () => {
    const { tables, ...rest } = mainFiles();
    expect(tables).toBeDefined();
    writeSeedFiles(rest);
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({
      status: 'imported',
      employees: 6,
      staff: 2,
      tableNotes: 0,
      tableNotesSkipped: 0,
    });
    expect(await noteNames()).toEqual({});
    expect(await staffTable()).toEqual(staffAt(['李美華', '業務部'], ['王小明', '研發一部']));
  });

  it('staff.csv 與 tables.csv 只有表頭：照常匯入，沒有工作人員與備註名稱', async () => {
    writeSeedFiles({ ...threeRegistered(), staff: staffFile([]), tables: tablesFile([]) });
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({
      status: 'imported',
      employees: 3,
      participants: 3,
      staff: 0,
      staffSkipped: 0,
      tableNotes: 0,
      tableNotesSkipped: 0,
    });
    expect(await staffTable()).toEqual([]);
    expect(await noteNames()).toEqual({});
  });
});

describe('員工表已有資料：整個 seed 跳過（D-007）', () => {
  it('不匯入員工與報名表，也不套用 staff.csv 與 tables.csv；既有資料不變', async () => {
    const { employee, participant } = await createRegisteredEmployee({ name: '王小明', department: '研發一部' });
    await prisma.seatTable.update({ where: { id: 1 }, data: { noteName: '原本的名稱' } });
    writeSeedFiles(mainFiles());

    await expect(runSeed(ENABLED, dir)).resolves.toEqual({ status: 'skipped', reason: 'has_data' });
    expect(await prisma.employee.count()).toBe(1);
    expect(await prisma.employee.findUnique({ where: { id: employee.id } })).toMatchObject({
      name: '王小明',
      department: '研發一部',
      extension: null,
      team: null,
    });
    expect(await prisma.participant.count()).toBe(1);
    expect(await prisma.participant.findUnique({ where: { id: participant.id } })).toMatchObject({
      tableId: null,
      seatOrder: null,
    });
    expect(await noteNames()).toEqual({ 1: '原本的名稱' });
  });
});

describe('列以外的錯誤：整批不寫入，seed 失敗（D-007、docs/architecture.md 第 7.3 節）', () => {
  async function expectNothingWritten() {
    expect(await prisma.employee.count()).toBe(0);
    expect(await prisma.participant.count()).toBe(0);
    expect(await noteNames()).toEqual({});
  }

  const oneRosterRow = [rosterPerson('王小明', '研發一部')];

  it.each<[string, SeedFiles]>([
    ['roster.csv 少了「部門」欄（EMP-R48、EMP-R62）', { roster: rosterCsv(oneRosterRow, headerWithout('部門')) }],
    ['roster.csv 的「姓名」欄名是「名字」（EMP-R48）', { roster: rosterCsv(oneRosterRow, headerRenamed('姓名', '名字')) }],
    [
      'registrations.csv 少了「是否攜帶眷屬 ？」欄（PPL-R68）',
      { registrations: registrationFile(MAIN_FORM, FORM_COLUMNS.filter((c) => c !== 'dependent')) },
    ],
    ['registrations.csv 放的是通訊錄（PPL-R68）', { registrations: ROSTER_CSV }],
    ['staff.csv 少了「部門」欄', { staff: staffFile([['王小明', '研發一部']], ['姓名', '單位']) }],
    ['staff.csv 少了「姓名」欄', { staff: staffFile([['研發一部']], ['部門']) }],
    ['tables.csv 少了「備註名稱」欄', { tables: tablesFile([['1', '主桌']], ['桌號', '名稱']) }],
    ['tables.csv 少了「桌號」欄', { tables: tablesFile([['主桌']], ['備註名稱']) }],
  ])('%s：runSeed 失敗；員工表維持 0 筆，參與人員、工作人員與備註名稱都沒有寫入', async (_name, override) => {
    writeSeedFiles({ ...mainFiles(), ...override });
    await expect(runSeed(ENABLED, dir)).rejects.toThrow();
    await expectNothingWritten();
  });

  it('失敗後修正資料檔再啟動：照常匯入（鎖有釋放、沒有留下部分資料）', async () => {
    writeSeedFiles({ ...mainFiles(), tables: tablesFile([['1', '主桌']], ['桌號', '名稱']) });
    await expect(runSeed(ENABLED, dir)).rejects.toThrow();

    writeSeedFiles(mainFiles());
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({ status: 'imported', ...MAIN_SUMMARY });
    expect(await prisma.employee.count()).toBe(6);
    expect(await prisma.participant.count()).toBe(4);
  });
});

describe('兩個執行個體同時啟動（D-007：交易內鎖住工作人員桌那一列，到 commit 才放開）', () => {
  it('同時執行兩次 seed：只匯入一次，另一次跳過（has_data），資料沒有重複', async () => {
    writeSeedFiles(mainFiles());
    // 時間差每次不同，多試幾輪
    for (let round = 0; round < 3; round++) {
      await resetData();
      const results = await Promise.all([runSeed(ENABLED, dir), runSeed(ENABLED, dir)]);

      expect(results.map((r) => r.status).sort()).toEqual(['imported', 'skipped']);
      expect(results).toContainEqual({ status: 'skipped', reason: 'has_data' });
      expect(await prisma.employee.count()).toBe(6);
      expect(await prisma.participant.count()).toBe(4);
      expect(await staffTable()).toEqual(staffAt(['李美華', '業務部'], ['王小明', '研發一部']));
      expect(await noteNames()).toEqual(MAIN_NOTES);
    }
  });
});

describe('Log（docs/standard/LOG_Design_Guideline.md；docs/architecture.md 第 7.3、15.2 節）', () => {
  it('匯入完成記一筆摘要（seed_imported，INFO）：人數，以及工作人員與備註名稱的筆數和略過的列數', async () => {
    const logs = captureLogs();
    writeSeedFiles(mainFiles());
    await runSeed(ENABLED, dir);

    const summaries = logs.events().filter((e) => e.eventType === 'seed_imported');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ severity: 'INFO', ...MAIN_SUMMARY });
  });

  it('Log 不含電子郵件、分機、手機號碼、代接群組與表單的備註', async () => {
    const logs = captureLogs();
    writeSeedFiles(mainFiles());
    await runSeed(ENABLED, dir);

    expect(logs.raw.length).toBeGreaterThan(0);
    const text = logs.raw.join('\n');
    for (const secret of ['@example.com', EXT_A, EXT_B, FAKE_MOBILE, FAKE_PICKUP_GROUP, FORM_NOTE]) {
      expect(text).not.toContain(secret);
    }
  });

  it('員工表已有資料時跳過並記一筆 Log（seed_skipped，reason has_data）', async () => {
    await createRegisteredEmployee();
    const logs = captureLogs();
    writeSeedFiles(mainFiles());
    await runSeed(ENABLED, dir);

    expect(logs.events().filter((e) => e.eventType === 'seed_skipped')).toEqual([
      expect.objectContaining({ reason: 'has_data' }),
    ]);
    expect(logs.events().filter((e) => e.eventType === 'seed_imported')).toEqual([]);
  });
});

describe('伺服器啟動流程登記這個匯入程式（src/server/seed-startup.ts、src/instrumentation.ts）', () => {
  let savedSeedImport: string | undefined;

  beforeEach(() => {
    savedSeedImport = process.env.SEED_IMPORT;
    process.env.SEED_IMPORT = '1';
  });

  afterEach(() => {
    if (savedSeedImport === undefined) delete process.env.SEED_IMPORT;
    else process.env.SEED_IMPORT = savedSeedImport;
    vi.doUnmock('@/server/seed');
    vi.resetModules();
  });

  /**
   * 重新載入啟動流程，拿到還沒登記任何匯入程式的狀態。runSeed 的資料夾一律換成這個測試的暫存資料夾：
   * 不論啟動流程傳什麼路徑，都不會讀到 prisma/seed-data/。
   */
  async function loadStartup() {
    const tmp = dir;
    vi.resetModules();
    vi.doMock('@/server/seed', async (importOriginal) => {
      const original = await importOriginal<typeof SeedModule>();
      return { ...original, runSeed: (env?: NodeJS.ProcessEnv) => original.runSeed(env, tmp) };
    });
    return import('@/server/seed-startup');
  }

  function spyExit() {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    cleanups.push(() => exit.mockRestore());
    return exit;
  }

  it('SEED_IMPORT=1 啟動時用真正的匯入程式匯入（不是 not_implemented）', async () => {
    const exit = spyExit();
    writeSeedFiles(mainFiles());
    const { runSeedOnStartup } = await loadStartup();

    await runSeedOnStartup();

    expect(exit).not.toHaveBeenCalled();
    expect(await prisma.employee.count()).toBe(6);
    expect(await prisma.participant.count()).toBe(4);
    expect(await staffTable()).toEqual(staffAt(['李美華', '業務部'], ['王小明', '研發一部']));
    expect(await noteNames()).toEqual(MAIN_NOTES);
  });

  it('匯入失敗時結束程序（exit 1），整批不寫入', async () => {
    const exit = spyExit();
    writeSeedFiles({ ...mainFiles(), roster: rosterCsv([rosterPerson('王小明', '研發一部')], headerWithout('部門')) });
    const { runSeedOnStartup } = await loadStartup();

    await runSeedOnStartup();

    expect(exit).toHaveBeenCalledWith(1);
    expect(await prisma.employee.count()).toBe(0);
    expect(await prisma.participant.count()).toBe(0);
  });
});
