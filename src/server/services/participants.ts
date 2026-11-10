import 'server-only';
import { STAFF_TABLE_CAPACITY, STAFF_TABLE_ID, TABLE_CAPACITY, type Participant } from '@/contracts/entities';
import type { ImportResult } from '@/contracts/imports';
import type {
  BulkJoinInput,
  ParticipantDeleteResult,
  ParticipantsResult,
  participantCreateSchema,
  participantUpdateSchema,
} from '@/contracts/participants';
import { parseRegistrations } from '@/domain/registration-import';
import { Prisma } from '@/generated/prisma/client';
import type { z } from 'zod';
import { prisma } from '../db';
import { AppError } from '../http';
import { toEmployee, toParticipant } from './state';

// 參與人員的寫入（docs/spec/participants.md；docs/architecture.md 第 7、8、11.2 節）。
// 每個寫入在一個交易內完成：
// - 先依桌號由小到大鎖住涉及的桌次列，再鎖員工或參與人員列（和座位異動同一個順序，避免死結），鎖住後才計算人數（第 7.2 節）。
// - 交易用 READ COMMITTED：拿到鎖之後的讀取都看得到別人剛提交的資料（REPEATABLE READ 會停在第一次讀取的快照）。
// - 每次異動後把涉及的桌次重排為 0..n-1，回傳這次新增或改變的人讓前端校正。

type Db = Prisma.TransactionClient;
type CreateInput = z.output<typeof participantCreateSchema>;
type UpdateInput = z.output<typeof participantUpdateSchema>;
type Row = Prisma.ParticipantGetPayload<object>;
type Seat = { tableId: number | null; seatOrder: number | null };

const UNSEATED: Seat = { tableId: null, seatOrder: null };

/** 交易內發現鎖錯了桌次（鎖之前有人搬動了這個人）：重來一次 */
class RetryTransaction extends Error {}

const isLockConflict = (err: unknown) =>
  (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') ||
  (err instanceof Error && /deadlock|lock wait timeout/i.test(err.message));

/** 唯一索引擋下的重複（兩個請求同時加入同一位員工、同時替同一位員工新增眷屬）轉成業務錯誤 */
function uniqueViolation(err: unknown): AppError | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return null;
  const text = `${err.message} ${JSON.stringify(err.meta ?? {})}`;
  if (text.includes('hostId')) return new AppError('DEPENDENT_EXISTS', 'dependent already exists');
  if (text.includes('employeeId')) return new AppError('DUPLICATE_PARTICIPANT', 'employee already registered');
  return new AppError('CONFLICT', 'unique constraint');
}

async function inTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (err) {
      if (attempt < 3 && (err instanceof RetryTransaction || isLockConflict(err))) continue;
      if (err instanceof RetryTransaction) throw new AppError('CONFLICT', 'seat changed while saving');
      throw uniqueViolation(err) ?? err;
    }
  }
}

const sortedUnique = (ids: readonly (number | null | undefined)[]) =>
  [...new Set(ids.filter((id): id is number => id != null))].sort((a, b) => a - b);

/** 依桌號由小到大鎖住桌次列（docs/architecture.md 第 7.2 節） */
async function lockTables(tx: Db, tableIds: readonly (number | null | undefined)[]): Promise<number[]> {
  const ids = sortedUnique(tableIds);
  if (ids.length) await tx.$queryRaw`SELECT id FROM SeatTable WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
  return ids;
}

/** 鎖住參與人員列，回傳鎖到的（不存在的不會出現） */
async function lockParticipants(tx: Db, ids: readonly number[]): Promise<{ id: number; kind: string }[]> {
  const sorted = sortedUnique(ids);
  if (!sorted.length) return [];
  return tx.$queryRaw<{ id: number; kind: string }[]>`
    SELECT id, kind FROM Participant WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`;
}

/** 鎖住員工列；員工已被刪除時 NOT_FOUND */
async function lockEmployees(tx: Db, ids: readonly number[]): Promise<void> {
  const sorted = sortedUnique(ids);
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM Employee WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`;
  if (rows.length !== sorted.length) throw new AppError('NOT_FOUND', 'employee not found');
}

/** 這一桌目前的人數（不算 except 這個人） */
const countAt = (tx: Db, tableId: number, except?: number) =>
  tx.participant.count({ where: { tableId, ...(except === undefined ? {} : { NOT: { id: except } }) } });

/** 排到這一桌名單的最後；已滿時 TABLE_FULL／STAFF_TABLE_FULL（呼叫前要先鎖住這一桌） */
async function seatAtEnd(tx: Db, tableId: number, except?: number): Promise<Seat> {
  const n = await countAt(tx, tableId, except);
  if (tableId === STAFF_TABLE_ID) {
    if (n >= STAFF_TABLE_CAPACITY) throw new AppError('STAFF_TABLE_FULL', 'staff table is full');
  } else if (n >= TABLE_CAPACITY) {
    throw new AppError('TABLE_FULL', `table ${tableId} is full`);
  }
  return { tableId, seatOrder: n };
}

/** 桌內順序重排成 0..n-1（依原本的順序），回傳順序有變的人 */
async function resequence(tx: Db, tableIds: readonly (number | null | undefined)[]): Promise<Participant[]> {
  const changed: Participant[] = [];
  for (const tableId of sortedUnique(tableIds)) {
    const seated = await tx.participant.findMany({ where: { tableId }, orderBy: [{ seatOrder: 'asc' }, { id: 'asc' }] });
    for (const [i, p] of seated.entries()) {
      if (p.seatOrder === i) continue;
      changed.push(toParticipant(await tx.participant.update({ where: { id: p.id }, data: { seatOrder: i } })));
    }
  }
  return changed;
}

// ---- 新增（POST /api/participants）

/** 員工加入尾牙（PPL-R42～R46、R53、R56、R57、R61）：可同時加一位眷屬、指定桌次或工作人員 */
async function createEmployee(input: Extract<CreateInput, { kind: 'EMPLOYEE' }>): Promise<ParticipantsResult> {
  // 勾「工作人員」時忽略桌次（PPL-R53）
  const tableId = input.isStaff ? STAFF_TABLE_ID : input.tableId;
  return inTransaction(async (tx) => {
    await lockTables(tx, [tableId]);
    await lockEmployees(tx, [input.employeeId]);
    if (await tx.participant.findUnique({ where: { employeeId: input.employeeId } })) {
      throw new AppError('DUPLICATE_PARTICIPANT', 'employee already registered');
    }
    const seat = tableId == null ? UNSEATED : await seatAtEnd(tx, tableId);
    const host = await tx.participant.create({
      data: {
        kind: 'EMPLOYEE',
        employeeId: input.employeeId,
        childSeat: input.childSeat,
        vegetarian: input.vegetarian,
        note: input.note,
        ...seat,
      },
    });
    const created = [host];
    if (input.dependent) {
      // 眷屬和員工同桌、緊接在後；那一桌只剩 1 位時眷屬留在未入座；員工是工作人員時眷屬也先未入座（PPL-R53、PPL-R57）
      const sameTable =
        !input.isStaff && seat.tableId != null && seat.seatOrder != null && seat.seatOrder + 1 < TABLE_CAPACITY;
      created.push(
        await tx.participant.create({
          data: {
            kind: 'DEPENDENT',
            hostId: host.id,
            relation: input.dependent.relation,
            childSeat: input.dependent.childSeat,
            vegetarian: input.dependent.vegetarian,
            ...(sameTable ? { tableId: seat.tableId, seatOrder: seat.seatOrder! + 1 } : UNSEATED),
          },
        }),
      );
    }
    return { participants: created.map(toParticipant) };
  });
}

/** 確認所屬員工可以再加一位眷屬（呼叫前要先鎖住所屬員工）：要是已報名的員工、還沒有其他眷屬（PPL-R04、PPL-R49） */
async function checkHost(tx: Db, locked: { id: number; kind: string }[], hostId: number, self?: number) {
  const host = locked.find((p) => p.id === hostId);
  if (!host) throw new AppError('NOT_FOUND', 'host not found');
  if (host.kind !== 'EMPLOYEE') throw new AppError('CONFLICT', 'host is not a registered employee');
  const other = await tx.participant.findUnique({ where: { hostId } });
  if (other && other.id !== self) throw new AppError('DEPENDENT_EXISTS', 'host already has a dependent');
}

async function createDependent(input: Extract<CreateInput, { kind: 'DEPENDENT' }>): Promise<ParticipantsResult> {
  return inTransaction(async (tx) => {
    await lockTables(tx, [input.tableId]);
    await checkHost(tx, await lockParticipants(tx, [input.hostId]), input.hostId);
    const seat = input.tableId == null ? UNSEATED : await seatAtEnd(tx, input.tableId);
    const row = await tx.participant.create({
      data: {
        kind: 'DEPENDENT',
        hostId: input.hostId,
        relation: input.relation,
        childSeat: input.childSeat,
        vegetarian: input.vegetarian,
        note: input.note,
        ...seat,
      },
    });
    return { participants: [toParticipant(row)] };
  });
}

async function createGuest(input: Extract<CreateInput, { kind: 'GUEST' }>): Promise<ParticipantsResult> {
  return inTransaction(async (tx) => {
    await lockTables(tx, [input.tableId]);
    const seat = input.tableId == null ? UNSEATED : await seatAtEnd(tx, input.tableId);
    const row = await tx.participant.create({
      data: {
        kind: 'GUEST',
        guestName: input.guestName,
        organization: input.organization,
        childSeat: input.childSeat,
        vegetarian: input.vegetarian,
        note: input.note,
        ...seat,
      },
    });
    return { participants: [toParticipant(row)] };
  });
}

export function createParticipant(input: CreateInput): Promise<ParticipantsResult> {
  switch (input.kind) {
    case 'EMPLOYEE':
      return createEmployee(input);
    case 'DEPENDENT':
      return createDependent(input);
    default:
      return createGuest(input);
  }
}

// ---- 員工名單勾選多位一次加入（POST /api/participants/bulk-join，PPL-R63、EMP-R22、EMP-R24）

export function bulkJoin({ employeeIds }: BulkJoinInput): Promise<ParticipantsResult> {
  const ids = [...new Set(employeeIds)];
  return inTransaction(async (tx) => {
    await lockEmployees(tx, ids);
    // 有人已被別人加入尾牙：整批不儲存
    if (await tx.participant.count({ where: { employeeId: { in: ids } } })) {
      throw new AppError('DUPLICATE_PARTICIPANT', 'employee already registered');
    }
    const created: Participant[] = [];
    for (const employeeId of ids) {
      created.push(toParticipant(await tx.participant.create({ data: { kind: 'EMPLOYEE', employeeId } })));
    }
    return { participants: created };
  });
}

// ---- 編輯（PATCH /api/participants/{id}）

const required = (field: string, message: string) =>
  new AppError('VALIDATION_FAILED', `${field} required`, { [field]: message });

/**
 * 座位怎麼變（PPL-R53～R55、PPL-Q08）：
 * - 勾工作人員：放進工作人員桌（忽略 tableId）；本來就是工作人員則不動。
 * - 取消工作人員（含工作人員改成眷屬或外部貴賓）：去 tableId 指定的桌次，沒指定時是未入座。
 * - 其他：有給 tableId 就改到那一桌（null 是未入座），和目前相同時不動。
 */
function targetSeat(cur: Row, wantStaff: boolean, tableId: number | null | undefined): 'keep' | number | null {
  const isStaffNow = cur.tableId === STAFF_TABLE_ID;
  if (wantStaff) return isStaffNow ? 'keep' : STAFF_TABLE_ID;
  const target = isStaffNow ? (tableId ?? null) : tableId;
  if (target === undefined || target === cur.tableId) return 'keep';
  return target;
}

export function updateParticipant(id: number, input: UpdateInput): Promise<ParticipantsResult> {
  return inTransaction(async (tx) => {
    const before = await tx.participant.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'participant not found');

    const kind = input.kind ?? before.kind;
    const kindChanged = kind !== before.kind;
    // 只有員工可以標為工作人員（PPL-R10）
    if (kind !== 'EMPLOYEE' && input.isStaff === true) {
      throw new AppError('STAFF_EMPLOYEE_ONLY', 'only employees can be staff');
    }
    const wantStaff = kind === 'EMPLOYEE' && (input.isStaff ?? before.tableId === STAFF_TABLE_ID);
    const target = targetSeat(before, wantStaff, input.tableId);

    // 先鎖桌次，再鎖人；鎖住後確認這個人沒有被別人搬走
    await lockTables(tx, [before.tableId, target === 'keep' ? null : target]);
    const hostId = kind === 'DEPENDENT' ? (input.hostId ?? (kindChanged ? undefined : before.hostId)) : undefined;
    const locked = await lockParticipants(tx, [id, ...(hostId == null ? [] : [hostId])]);
    const cur = await tx.participant.findUnique({ where: { id } });
    if (!cur || !locked.some((p) => p.id === id)) throw new AppError('NOT_FOUND', 'participant not found');
    if (cur.tableId !== before.tableId || cur.kind !== before.kind) throw new RetryTransaction();

    const data: Prisma.ParticipantUncheckedUpdateInput = {};
    if (input.childSeat !== undefined) data.childSeat = input.childSeat;
    if (input.vegetarian !== undefined) data.vegetarian = input.vegetarian;
    if (input.note !== undefined) data.note = input.note;

    // 變更類別（PPL-Q07 的目前假設）：只保留新類別的欄位，兒童椅、素食、備註與座位保留；有眷屬的員工不能變更（PPL-R58）
    if (kindChanged) {
      if (cur.kind === 'EMPLOYEE' && (await tx.participant.findUnique({ where: { hostId: id } }))) {
        throw new AppError('DEPENDENT_EXISTS', 'employee with a dependent cannot change kind');
      }
      Object.assign(data, { kind, employeeId: null, hostId: null, relation: null, guestName: null, organization: null, title: null });
    }

    if (kind === 'EMPLOYEE' && kindChanged) {
      // 改成員工：要選一位還沒報名的員工；姓名、部門與分機改讀員工名單
      if (input.employeeId == null) throw required('employeeId', '請選擇員工。');
      await lockEmployees(tx, [input.employeeId]);
      const taken = await tx.participant.findUnique({ where: { employeeId: input.employeeId } });
      if (taken && taken.id !== id) throw new AppError('DUPLICATE_PARTICIPANT', 'employee already registered');
      data.employeeId = input.employeeId;
    }
    if (kind === 'DEPENDENT') {
      if (hostId == null) throw required('hostId', '請選擇所屬員工。');
      if (hostId === id) throw required('hostId', '請選擇所屬員工。');
      if (kindChanged || hostId !== cur.hostId) await checkHost(tx, locked, hostId, id);
      data.hostId = hostId;
      if (input.relation !== undefined) data.relation = input.relation;
    }
    if (kind === 'GUEST') {
      const guestName = input.guestName ?? (kindChanged ? undefined : cur.guestName);
      if (!guestName) throw required('guestName', '請輸入姓名。');
      data.guestName = guestName;
      if (input.organization !== undefined) data.organization = input.organization;
    }

    if (target !== 'keep') Object.assign(data, target == null ? UNSEATED : await seatAtEnd(tx, target, id));

    const row = await tx.participant.update({ where: { id }, data });
    const reordered = target === 'keep' ? [] : await resequence(tx, [cur.tableId]);
    return { participants: [toParticipant(row), ...reordered] };
  });
}

// ---- 取消報名與刪除（DELETE /api/participants/{id}，PPL-R14、PPL-R15）

export function deleteParticipant(id: number): Promise<ParticipantDeleteResult> {
  return inTransaction(async (tx) => {
    const read = () => tx.participant.findUnique({ where: { id }, include: { dependent: true } });
    const before = await read();
    if (!before) throw new AppError('NOT_FOUND', 'participant not found');
    const tables = await lockTables(tx, [before.tableId, before.dependent?.tableId]);
    await lockParticipants(tx, [id, ...(before.dependent ? [before.dependent.id] : [])]);
    const cur = await read();
    if (!cur) throw new AppError('NOT_FOUND', 'participant not found');
    // 鎖之前有人搬動了他或他的眷屬、或剛替他加了眷屬：重來一次，鎖住正確的桌次
    if (sortedUnique([cur.tableId, cur.dependent?.tableId]).some((t) => !tables.includes(t))) throw new RetryTransaction();

    // 眷屬由外鍵一併刪除（docs/architecture.md 第 7.1 節）；座位存在人身上，人刪了座位就空出來
    await tx.participant.delete({ where: { id } });
    const removedIds = [id, ...(cur.dependent ? [cur.dependent.id] : [])];
    return { removedIds, participants: await resequence(tx, tables) };
  });
}

// ---- 匯入 Google 表單報名表（POST /api/participants/import，PPL-R64～R85）

/**
 * 依 registration-import.ts 的計畫新增與更新，不動任何人的座位與工作人員（PPL-R79）。
 * 需要處理的人不匯入，其餘照常匯入（PPL-R85）。db 給 seed 在它自己的交易裡呼叫。
 */
export async function importRegistrations(rows: string[][], db?: Db): Promise<ImportResult> {
  const run = async (tx: Db): Promise<ImportResult> => {
    const employees = (await tx.employee.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })).map(toEmployee);
    const participants = (await tx.participant.findMany()).map(toParticipant);
    const plan = parseRegistrations(rows, employees, participants);
    if (!plan.ok) throw new AppError('IMPORT_FORMAT_INVALID', 'registration header does not match the form');

    for (const c of plan.create) {
      const host = await tx.participant.create({
        data: { kind: 'EMPLOYEE', employeeId: c.employeeId, vegetarian: c.vegetarian, note: c.note },
      });
      if (c.dependent) {
        await tx.participant.create({ data: { kind: 'DEPENDENT', hostId: host.id, ...c.dependent } });
      }
    }
    for (const u of plan.update) {
      await tx.participant.update({ where: { id: u.participantId }, data: { vegetarian: u.vegetarian, note: u.note } });
      const d = u.dependent;
      if (!d) continue;
      const fields = { childSeat: d.childSeat, vegetarian: d.vegetarian };
      if (d.participantId == null) await tx.participant.create({ data: { kind: 'DEPENDENT', hostId: u.participantId, ...fields } });
      else await tx.participant.update({ where: { id: d.participantId }, data: fields });
    }

    const used = new Set([...plan.create, ...plan.update, ...plan.issues].map((x) => x.row));
    return {
      imported: plan.create.length + plan.update.length,
      created: plan.create.length,
      updated: plan.update.length,
      // 同一人前面的列、還沒報名而填不參加的列：略過，不算需要處理
      skipped: Math.max(0, rows.length - 1 - used.size),
      // 錯誤清單只寫名字與部門，不含電子郵件與時間戳記（PPL-Q06）
      header: ['名字', '部門'],
      errors: plan.issues.map((i) => ({ row: i.row, reason: i.reason, values: [i.name, i.department] })),
    };
  };
  return db ? run(db) : inTransaction(run);
}
