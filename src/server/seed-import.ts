import 'server-only';
import { readFileSync } from 'node:fs';
import { STAFF_TABLE_CAPACITY, STAFF_TABLE_ID, TABLE_COUNT } from '@/contracts/entities';
import { tableUpdateSchema } from '@/contracts/seating';
import { normalizeText } from '@/domain/registration-import';
import { decodeCsv, parseCsv } from './csv';
import { AppError } from './http';
import { logWarning } from './log';
import { SEED_FILES, seedDb, type SeedImporter } from './seed';
import { importRoster } from './services/employees';
import { importRegistrations } from './services/participants';

// seed 的匯入程式（D-007、D-015；docs/architecture.md 第 7.3 節）：由 seed-startup.ts 登記給 runSeed。
// 依序匯入員工名單 → 報名表 → 工作人員（staff.csv，可選）→ 備註名稱（tables.csv，可選）。
// 全部用 seedDb()，在 runSeed 的同一個交易內：任何一列以外的錯誤（缺欄位、檔案讀不到）就丟錯、整批不寫入；
// 個別的列對不到或不合規則就略過、計數，其他照常。
// Log 只記筆數，不記姓名、部門、分機、email 與 CSV 內容（docs/architecture.md 第 15.2 節；D-007）。

/** 讀檔並解析：UTF-8（含 BOM）或 Big5；完全空白的列一律丟掉（不論 parseCsv 是否保留空白列，結果都一樣） */
function readCsv(file: string): string[][] {
  const rows = parseCsv(decodeCsv(readFileSync(/* turbopackIgnore: true */ file)));
  return rows.filter((row) => row.some((cell) => (cell ?? '').trim() !== ''));
}

type Sheet<K extends string> = { body: string[][]; cell: (row: readonly string[], column: K) => string };

/**
 * staff.csv、tables.csv 的表頭：欄名去掉空白與 BOM 後要完全相同，順序不限、可以有其他欄。
 * 缺必要欄名時丟錯（IMPORT_FORMAT_INVALID），整批不寫入。錯誤訊息只寫檔名，不寫檔案內容。
 */
function sheetOf<K extends string>(fileName: string, rows: readonly string[][], columns: readonly K[]): Sheet<K> {
  const [header = [], ...body] = rows;
  const normalized = header.map((h) => normalizeText(h ?? ''));
  const index = new Map<K, number>();
  for (const column of columns) {
    const at = normalized.indexOf(normalizeText(column));
    if (at < 0) throw new AppError('IMPORT_FORMAT_INVALID', `${fileName} header must include ${columns.join(', ')}`);
    index.set(column, at);
  }
  return { body: body.map((r) => [...r]), cell: (row, column) => (row[index.get(column)!] ?? '').trim() };
}

const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

/** 略過的列：每個檔一筆彙總（原因類別的筆數），不逐列記人名 */
function logSkipped(fileName: string, reasons: Record<string, number>) {
  const skipped = sum(reasons);
  if (skipped === 0) return;
  logWarning({ eventType: 'seed_rows_skipped', message: `${fileName} 有 ${skipped} 列略過`, file: fileName, skipped, ...reasons });
}

const STAFF_COLUMNS = ['姓名', '部門'] as const;
type StaffReasons = { notFound: number; ambiguous: number; notRegistered: number; duplicate: number; staffTableFull: number };

/**
 * staff.csv：依檔案順序，把對得到而且已報名的員工放進工作人員桌（D-015、SEAT-R42）。
 * 姓名與部門用 normalizeText 比對（和報名表匯入一致）。工作人員的眷屬不動，維持未入座（SEAT-R44）。
 */
async function importStaff(sheet: Sheet<(typeof STAFF_COLUMNS)[number]>) {
  const db = seedDb();
  const employees = await db.employee.findMany({
    select: { id: true, name: true, department: true, participant: { select: { id: true } } },
  });
  const byKey = new Map<string, typeof employees>();
  for (const e of employees) {
    const key = `${normalizeText(e.name)}\u0000${normalizeText(e.department)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), e]);
  }

  const reasons: StaffReasons = { notFound: 0, ambiguous: 0, notRegistered: 0, duplicate: 0, staffTableFull: 0 };
  const placed = new Set<number>();
  // 員工表原本是空的，工作人員桌一定沒有人；仍從現有人數接著排，桌內順序保持連續
  let seatOrder = await db.participant.count({ where: { tableId: STAFF_TABLE_ID } });
  for (const row of sheet.body) {
    const name = normalizeText(sheet.cell(row, '姓名'));
    const department = normalizeText(sheet.cell(row, '部門'));
    const matches = name ? (byKey.get(`${name}\u0000${department}`) ?? []) : [];
    if (matches.length === 0) {
      reasons.notFound++;
      continue;
    }
    if (matches.length > 1) {
      reasons.ambiguous++;
      continue;
    }
    const participant = matches[0]!.participant;
    if (!participant) {
      reasons.notRegistered++; // 沒有報名：略過，不會因此加入尾牙（D-015）
      continue;
    }
    if (placed.has(participant.id)) {
      reasons.duplicate++;
      continue;
    }
    if (seatOrder >= STAFF_TABLE_CAPACITY) {
      reasons.staffTableFull++;
      continue;
    }
    await db.participant.update({ where: { id: participant.id }, data: { tableId: STAFF_TABLE_ID, seatOrder: seatOrder++ } });
    placed.add(participant.id);
  }
  return { staff: placed.size, reasons };
}

const TABLE_COLUMNS = ['桌號', '備註名稱'] as const;
type TableReasons = { invalidTableNumber: number; invalidNoteName: number; duplicate: number };

/**
 * tables.csv：寫入第 1～30 桌的備註名稱（D-015）。桌號只收整數（「05」視為 5）；
 * 備註名稱沿用畫面的規則（去掉前後空白、不能空白、最多 20 字，SEAT-Q13 的目前假設）；同一桌第二次起略過。
 */
async function importTableNotes(sheet: Sheet<(typeof TABLE_COLUMNS)[number]>) {
  const db = seedDb();
  const reasons: TableReasons = { invalidTableNumber: 0, invalidNoteName: 0, duplicate: 0 };
  const written = new Set<number>();
  for (const row of sheet.body) {
    const raw = sheet.cell(row, '桌號');
    const tableId = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(tableId) || tableId < 1 || tableId > TABLE_COUNT) {
      reasons.invalidTableNumber++;
      continue;
    }
    if (written.has(tableId)) {
      reasons.duplicate++;
      continue;
    }
    const parsed = tableUpdateSchema.safeParse({ noteName: sheet.cell(row, '備註名稱') });
    if (!parsed.success || parsed.data.noteName === null) {
      reasons.invalidNoteName++;
      continue;
    }
    await db.seatTable.update({ where: { id: tableId }, data: { noteName: parsed.data.noteName } });
    written.add(tableId);
  }
  return { tableNotes: written.size, reasons };
}

export const importSeedFiles: SeedImporter = async (files) => {
  // 先讀完所有檔、檢查可選檔的表頭，格式錯誤時在寫入任何資料之前就失敗
  const rosterRows = readCsv(files.roster);
  const registrationRows = readCsv(files.registrations);
  const staffSheet = files.staff ? sheetOf(SEED_FILES.staff, readCsv(files.staff), STAFF_COLUMNS) : null;
  const tablesSheet = files.tables ? sheetOf(SEED_FILES.tables, readCsv(files.tables), TABLE_COLUMNS) : null;

  const db = seedDb();
  // 員工名單、報名表沿用畫面匯入的規則；表頭不符時服務丟 IMPORT_FORMAT_INVALID
  const roster = await importRoster(rosterRows, db);
  const registrations = await importRegistrations(registrationRows, db);
  // 員工表原本是空的，所以眷屬都是這次報名表新增的
  const dependents = await db.participant.count({ where: { kind: 'DEPENDENT' } });

  const staff = staffSheet ? await importStaff(staffSheet) : null;
  const tables = tablesSheet ? await importTableNotes(tablesSheet) : null;

  // 員工名單有錯誤的列（例如部門空白）不匯入；對不到員工名單的報名者記在摘要的 unmatched
  logSkipped(SEED_FILES.roster, { invalidRow: roster.errors.length });
  if (staff) logSkipped(SEED_FILES.staff, staff.reasons);
  if (tables) logSkipped(SEED_FILES.tables, tables.reasons);

  return {
    employees: roster.created,
    participants: registrations.created,
    dependents,
    unmatched: registrations.errors.length,
    staff: staff?.staff ?? 0,
    staffSkipped: staff ? sum(staff.reasons) : 0,
    tableNotes: tables?.tableNotes ?? 0,
    tableNotesSkipped: tables ? sum(tables.reasons) : 0,
  };
};
