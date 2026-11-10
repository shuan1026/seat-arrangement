import 'server-only';
import type { Employee, Participant, SeatTable } from '@/contracts/entities';
import type { AutoArrangeSummary, SeatingOperation, SeatingResult, SeatingSnapshot } from '@/contracts/seating';
import { autoArrange as arrangeSeats } from '@/domain/auto-arrange';
import { applySeatingOperation, normalizeTables } from '@/domain/seating-rules';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { AppError } from '../http';
import { logInfo } from '../log';
import { toEmployee, toParticipant, toSeatTable } from './state';

// 座位異動指令（docs/architecture.md 第 7.2、8.1 節）：一個指令一個交易。
// 交易一開始依桌號由小到大鎖住全部桌次列（SELECT ... FOR UPDATE），所有座位指令依同一個順序取得鎖，不會死結；
// 拿到鎖之後才讀資料，再用 src/domain/seating-rules.ts 的同一份規則驗證，只寫入有改變的列。
// 兩人同時搶最後一個位子時，後拿到鎖的一方看到已滿，回 409：從選單入座（上限 10 位）是 TABLE_FULL，
// 拖移或「加入人員」（allowOverflow，上限 12 位）是 TABLE_LIMIT；工作人員桌是 STAFF_TABLE_FULL／STAFF_TABLE_LIMIT（D-018）。

type Tx = Prisma.TransactionClient;

export type AutoArrangeInput = {
  employees: Employee[];
  participants: Participant[];
  tables: SeatTable[];
  mode: 'unseatedOnly' | 'rebuild';
};
export type AutoArrangeOutput = {
  changes: Array<{ participantId: number; tableId: number | null; seatOrder: number | null }>;
  summary: AutoArrangeSummary;
};
export type AutoArranger = (input: AutoArrangeInput) => AutoArrangeOutput;

// 排座演算法：預設是 src/domain/auto-arrange.ts（docs/spec/auto-arrange.md）。
// registerAutoArranger 換成別的函式，只給測試用（例如只驗證指令流程、不管排座規則的整合測試）。
let autoArranger: AutoArranger = arrangeSeats;

export function registerAutoArranger(fn: AutoArranger): void {
  autoArranger = fn;
}

const VIOLATION_MESSAGE: Record<string, string> = {
  TABLE_FULL: 'table is full',
  TABLE_LIMIT: 'table has reached 12 seats',
  STAFF_TABLE_FULL: 'staff table is full',
  STAFF_TABLE_LIMIT: 'staff table has reached 12 seats',
  STAFF_EMPLOYEE_ONLY: 'only employees can join the staff table',
  NOT_FOUND: 'participant not found',
  CONFLICT: 'roster changed',
};

export async function runSeatingOperation(op: SeatingOperation, ctx: { requestId?: string; userId?: string } = {}): Promise<SeatingResult> {
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe('SELECT `id` FROM `SeatTable` ORDER BY `id` FOR UPDATE');
      const [participantRows, tableRows] = await Promise.all([
        tx.participant.findMany({ orderBy: { id: 'asc' } }),
        tx.seatTable.findMany({ orderBy: { id: 'asc' } }),
      ]);
      const participants = participantRows.map(toParticipant);
      const tables = tableRows.map(toSeatTable);

      if (op.type === 'autoArrange') return autoArrange(tx, op.mode, participants, tables);

      const r = applySeatingOperation({ participants, tables }, op);
      if (!r.ok) throw new AppError(r.violation, VIOLATION_MESSAGE[r.violation]);
      return write(tx, participants, tables, r.data.participants, r.data.tables, r.undo);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 20_000 },
  );
  logInfo({
    eventType: 'seating_operation_completed',
    message: 'seating operation completed',
    requestId: ctx.requestId,
    userId: ctx.userId,
    operation: op.type,
    affectedParticipants: result.participants.length,
    affectedTables: result.tables.length,
  });
  return result;
}

async function autoArrange(
  tx: Tx,
  mode: 'unseatedOnly' | 'rebuild',
  participants: Participant[],
  tables: SeatTable[],
): Promise<SeatingResult> {
  const employees = (await tx.employee.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })).map(toEmployee);
  const { changes, summary } = autoArranger({
    employees,
    participants: participants.map((p) => ({ ...p })),
    tables: tables.map((t) => ({ ...t })),
    mode,
  });
  // 一位都沒排進去：座位都不變，清空後重排也不清空（ARR-Q02 的目前假設）
  if (summary.placed === 0) return { participants: [], tables: [], undo: { participants: [], tables: [] }, summary };

  const byId = new Map(participants.map((p) => [p.id, p]));
  const after = participants.map((p) => ({ ...p }));
  const afterById = new Map(after.map((p) => [p.id, p]));
  const touched = new Set<number>();
  const gained = new Set<number>();
  for (const c of changes) {
    const p = afterById.get(c.participantId);
    if (!p) throw new AppError('NOT_FOUND', VIOLATION_MESSAGE.NOT_FOUND);
    if (c.tableId !== null && !tables.some((t) => t.id === c.tableId)) throw new AppError('CONFLICT', 'unknown table');
    if (p.tableId !== null) touched.add(p.tableId);
    if (c.tableId !== null) touched.add(c.tableId);
    if (c.tableId !== null && c.tableId !== p.tableId) gained.add(c.tableId);
    p.tableId = c.tableId;
    p.seatOrder = c.tableId === null ? null : c.seatOrder;
  }
  // 寫入時仍檢查排進人的桌最多 10 位（ARR-R17；docs/architecture.md 第 7.2、8.1 節），座號重排成 0..n-1；
  // 原本就有 11、12 位、這次沒有排進人的桌不擋
  const { overfull } = normalizeTables(after, touched, gained);
  if (overfull !== null) throw new AppError('TABLE_FULL', VIOLATION_MESSAGE.TABLE_FULL);

  const undo: SeatingSnapshot = { participants: [], tables: [] };
  for (const p of after) {
    const b = byId.get(p.id)!;
    if (b.tableId !== p.tableId || b.seatOrder !== p.seatOrder) undo.participants.push({ id: b.id, tableId: b.tableId, seatOrder: b.seatOrder });
  }
  const result = await write(tx, participants, tables, after, tables, undo);
  return { ...result, summary };
}

/** 只寫入有改變的人與桌，回傳 SeatingResult（不含 summary） */
async function write(
  tx: Tx,
  before: Participant[],
  beforeTables: SeatTable[],
  after: Participant[],
  afterTables: SeatTable[],
  undo: SeatingSnapshot,
): Promise<SeatingResult> {
  const prevById = new Map(before.map((p) => [p.id, p]));
  const changed = after.filter((p) => {
    const b = prevById.get(p.id);
    return !b || b.tableId !== p.tableId || b.seatOrder !== p.seatOrder;
  });
  for (const p of changed) {
    const { count } = await tx.participant.updateMany({ where: { id: p.id }, data: { tableId: p.tableId, seatOrder: p.seatOrder } });
    // 這段期間被別人刪除（刪除人員不經過桌次鎖）
    if (count === 0) throw new AppError('NOT_FOUND', VIOLATION_MESSAGE.NOT_FOUND);
  }

  const prevTables = new Map(beforeTables.map((t) => [t.id, t]));
  const changedTables = afterTables.filter((t) => prevTables.get(t.id)?.noteName !== t.noteName);
  for (const t of changedTables) await tx.seatTable.update({ where: { id: t.id }, data: { noteName: t.noteName } });

  // 回傳寫入後的完整資料（含 createdAt 等欄位），讓前端用來校正畫面
  const fresh = changed.length
    ? (await tx.participant.findMany({ where: { id: { in: changed.map((p) => p.id) } }, orderBy: { id: 'asc' } })).map(toParticipant)
    : [];
  return { participants: fresh, tables: changedTables, undo };
}

/** 修改桌次的備註名稱（SEAT-R12）；不能復原，兩人先後修改時以後改的為準（COM-R09）。工作人員桌沒有備註名稱（SEAT-R48） */
export async function updateTableNoteName(tableId: number, noteName: string | null): Promise<SeatTable> {
  const table = await prisma.seatTable.findUnique({ where: { id: tableId } });
  if (!table || table.kind !== 'NORMAL') throw new AppError('NOT_FOUND', 'table not found');
  const updated = await prisma.seatTable.update({ where: { id: tableId }, data: { noteName } });
  return toSeatTable(updated);
}
