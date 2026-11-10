import 'server-only';
import { employeeInputSchema, type EmployeeDeleteResult } from '@/contracts/employees';
import type { Employee, Participant } from '@/contracts/entities';
import type { ImportResult, ImportRowError } from '@/contracts/imports';
import { parseRoster, rosterKey, ROSTER_ERROR_REASON, type RosterEmployee } from '@/domain/roster-import';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { AppError } from '../http';
import { toEmployee, toParticipant } from './state';

// 員工名單的寫入（docs/spec/employees.md；docs/architecture.md 第 7、8、11.1 節）。
// 每個寫入在一個交易內完成，回傳變更後的資料讓前端校正。
// 交易用 READ COMMITTED（docs/architecture.md 第 7.2 節）：MySQL 預設的 REPEATABLE READ 會停在第一次讀取的快照，
// 鎖住桌次之後的讀取看不到別人在這之間提交的異動，鎖住後的檢查與重排就會用到舊資料。

type Db = Prisma.TransactionClient;
type EmployeeData = ReturnType<typeof employeeInputSchema.parse>;

const WRITE_TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;

/** 新增的員工排在員工名單最後（docs/architecture.md 第 11.1 節） */
async function nextSortOrder(db: Db): Promise<number> {
  const { _max } = await db.employee.aggregate({ _max: { sortOrder: true } });
  return (_max.sortOrder ?? 0) + 1;
}

/** POST /api/employees */
export async function createEmployee(input: EmployeeData): Promise<Employee> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.employee.create({ data: { ...input, sortOrder: await nextSortOrder(tx) } });
    return toEmployee(row);
  }, WRITE_TX);
}

/**
 * PATCH /api/employees/{id}：整筆取代（辦公室等畫面沒有的欄位由前端帶回原值）；已被別人刪除時 NOT_FOUND（EMP-R40）。
 * 不參加的標記不在對話框裡，編輯不改變（EMP-R63 只由列操作切換）。
 */
export async function updateEmployee(id: number, input: EmployeeData): Promise<Employee> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.employee.updateMany({ where: { id }, data: input });
    if (count === 0) throw new AppError('NOT_FOUND', 'employee not found');
    return toEmployee(await tx.employee.findUniqueOrThrow({ where: { id } }));
  }, WRITE_TX);
}

/**
 * PUT /api/employees/{id}/declined：標記為不參加或改回未報名（EMP-R63、D-014）。
 * 鎖住這位員工那一列再檢查是否已報名：加入尾牙（services/participants.ts）也鎖同一列，兩邊互斥；
 * 加入先完成時這裡讀得到他的參與人員（READ COMMITTED），回 CONFLICT；這裡先完成時，加入尾牙會清掉標記（EMP-R64）。
 * 已報名（含工作人員）時 CONFLICT，已被別人刪除時 NOT_FOUND，前端依 COM-R07 重新載入（EMP-R65）。送出和目前相同的值照常成功。
 */
export async function setEmployeeDeclined(id: number, declined: boolean): Promise<Employee> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM Employee WHERE id = ${id} FOR UPDATE`;
    if (locked.length === 0) throw new AppError('NOT_FOUND', 'employee not found');
    if (await tx.participant.findUnique({ where: { employeeId: id }, select: { id: true } })) {
      throw new AppError('CONFLICT', 'employee already registered');
    }
    const row = await tx.employee.findUniqueOrThrow({ where: { id } });
    if (row.declined === declined) return toEmployee(row);
    return toEmployee(await tx.employee.update({ where: { id }, data: { declined } }));
  }, WRITE_TX);
}

/** 依內部編號由小到大鎖住桌次列，和座位異動用同一個順序，避免死結（docs/architecture.md 第 7.2 節） */
async function lockTables(tx: Db, tableIds: readonly number[]): Promise<void> {
  if (tableIds.length === 0) return;
  const ids = [...new Set(tableIds)].sort((a, b) => a - b);
  await tx.$queryRaw`SELECT id FROM SeatTable WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}

/** 桌內順序重排成 0..n-1（依原本的順序），回傳順序有變的人 */
async function resequenceTables(tx: Db, tableIds: readonly number[]): Promise<Participant[]> {
  const changed: Participant[] = [];
  for (const tableId of [...new Set(tableIds)].sort((a, b) => a - b)) {
    const seated = await tx.participant.findMany({
      where: { tableId },
      orderBy: [{ seatOrder: 'asc' }, { id: 'asc' }],
    });
    for (const [i, p] of seated.entries()) {
      if (p.seatOrder === i) continue;
      changed.push(toParticipant(await tx.participant.update({ where: { id: p.id }, data: { seatOrder: i } })));
    }
  }
  return changed;
}

/** 這位員工的參與人員與眷屬（座位所在的桌次） */
const registrationOf = (tx: Db, employeeId: number) =>
  tx.participant.findMany({
    where: { OR: [{ employeeId }, { host: { employeeId } }] },
    select: { id: true, tableId: true },
    orderBy: { id: 'asc' },
  });

const tablesOf = (rows: readonly { tableId: number | null }[]) =>
  [...new Set(rows.map((r) => r.tableId).filter((t): t is number => t != null))].sort((a, b) => a - b);

/**
 * DELETE /api/employees/{id}：已報名的員工一併取消報名、移除眷屬（外鍵 cascade），座位空出來，
 * 同桌的人重排順序（EMP-R43）。先鎖住兩人所在的桌次，避免和同時進行的座位異動互相覆蓋；
 * 鎖住後重新讀取（READ COMMITTED 才讀得到鎖之前別人提交的異動）。
 */
export async function deleteEmployee(id: number): Promise<EmployeeDeleteResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await prisma.$transaction(async (tx) => {
      const guess = tablesOf(await registrationOf(tx, id));
      await lockTables(tx, guess);
      const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM Employee WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) throw new AppError('NOT_FOUND', 'employee not found');
      const removed = await registrationOf(tx, id);
      const tables = tablesOf(removed);
      // 鎖之前有人把他移到別桌：重來一次，鎖住正確的桌次
      if (tables.some((t) => !guess.includes(t))) return null;
      await tx.employee.delete({ where: { id } });
      const participants = await resequenceTables(tx, tables);
      return { deletedEmployeeId: id, removedParticipantIds: removed.map((p) => p.id), participants };
    }, WRITE_TX);
    if (result) return result;
  }
  throw new AppError('CONFLICT', 'seat changed while deleting');
}

/** 姓名與部門以外，匯入會寫入的欄位（EMP-R56）；沒有「組別」欄時不改組別（EMP-R62） */
function importedFields(e: RosterEmployee, hasTeamColumn: boolean) {
  return {
    englishName: e.englishName,
    extension: e.extension,
    region: e.region,
    office: e.office,
    ...(hasTeamColumn ? { team: e.team } : {}),
  };
}

/**
 * 匯入通訊錄（EMP-R44～R62）：欄位和範本不一致時整份不匯入（IMPORT_FORMAT_INVALID）；
 * 更新既有員工時不參加的標記維持不變，新增的員工是未報名（EMP-R66）；
 * 以姓名加部門對應既有員工，對得到就更新、對不到就新增（排在最後，依檔案的列順序）；
 * 系統已有兩位以上同名同部門的員工時，這組的每一列都列為需要處理（D-012）。
 * 檔案裡沒有的員工保留不變（EMP-R61、D-011）。db 給 seed 在它自己的交易裡呼叫。
 */
export async function importRoster(rows: string[][], db?: Db): Promise<ImportResult> {
  const parsed = parseRoster(rows);
  if (!parsed.ok) throw new AppError('IMPORT_FORMAT_INVALID', 'roster header does not match template');

  const run = async (tx: Db): Promise<ImportResult> => {
    const existing = await tx.employee.findMany({ select: { id: true, name: true, department: true } });
    const byKey = new Map<string, number[]>();
    for (const e of existing) {
      const key = rosterKey(e.name, e.department);
      byKey.set(key, [...(byKey.get(key) ?? []), e.id]);
    }

    const errors: ImportRowError[] = [...parsed.errors];
    let sortOrder = await nextSortOrder(tx);
    let created = 0;
    let updated = 0;
    for (const [i, e] of parsed.employees.entries()) {
      const matches = byKey.get(rosterKey(e.name, e.department)) ?? [];
      if (matches.length > 1) {
        for (const s of parsed.sources[i] ?? []) {
          errors.push({ row: s.row, reason: ROSTER_ERROR_REASON.ambiguousExisting, values: s.values });
        }
        continue;
      }
      const [match] = matches;
      if (match !== undefined) {
        await tx.employee.update({ where: { id: match }, data: importedFields(e, parsed.hasTeamColumn) });
        updated++;
      } else {
        await tx.employee.create({
          data: { name: e.name, department: e.department, ...importedFields(e, true), sortOrder: sortOrder++ },
        });
        created++;
      }
    }
    errors.sort((a, b) => a.row - b.row);
    return { imported: created + updated, created, updated, skipped: parsed.skipped, errors, header: parsed.header };
  };

  // 外部傳入的 db（seed）沿用呼叫端的交易
  return db ? run(db) : prisma.$transaction(run, { ...WRITE_TX, timeout: 60_000, maxWait: 10_000 });
}
