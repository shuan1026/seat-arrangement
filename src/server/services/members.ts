import 'server-only';
import type { Member } from '@/contracts/permissions';
import { alreadyMemberMessage, memberEmailError, normalizeEmail, parseInitialEditorEmails, type MemberRole } from '@/domain/members';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { AppError } from '../http';
import { logInfo, logWarning } from '../log';

// 權限名單（D-021、D-026；docs/spec/permissions.md 第 3.1、3.2 節；docs/architecture.md 第 7.3、9.3、11.5 節）。
// email 一律去前後空白、轉小寫後比對與儲存（PRM-R03）。身分每次都查資料庫，不放進 JWT、不在記憶體快取。

const allowedDomain = (env: NodeJS.ProcessEnv = process.env) => (env.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();

const memberSelect = { id: true, email: true, role: true } as const;
const toMember = (row: { id: number; email: string; role: MemberRole }): Member => ({ id: row.id, email: row.email, role: row.role });

/** 登入者的身分（AUTH-R11）：名單上的權限，不在名單上是 null（沒有權限）；email 大小寫與前後空白不影響 */
export async function getRole(email: string): Promise<MemberRole | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const row = await prisma.member.findUnique({ where: { email: normalized }, select: { role: true } });
  return row?.role ?? null;
}

/** 名單，依加入的先後排列，最早加入的在最上面；改權限不改位置（PRM-R07） */
export async function listMembers(): Promise<Member[]> {
  const rows = await prisma.member.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: memberSelect });
  return rows.map(toMember);
}

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

function isLockConflict(err: unknown): boolean {
  return (
    (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') ||
    (err instanceof Error && /deadlock|lock wait timeout|write conflict/i.test(err.message))
  );
}

/** 鎖死或寫入衝突時重試幾次；其他錯誤直接丟出 */
async function withLockRetry<T>(work: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (err) {
      if (attempt < attempts && isLockConflict(err)) continue;
      throw err;
    }
  }
}

/**
 * 新增帳號（PRM-R08～R10）：空白、格式或網域不對是 VALIDATION_FAILED（錯誤標在 email 欄位）；
 * 已在名單上（不論送來的權限）是 MEMBER_EXISTS，fields.email 依名單上的權限組好提示。
 * 靠 email 的 unique 判斷，兩人同時新增同一個 email 也只有一筆。
 */
export async function addMember(rawEmail: string, role: MemberRole, by: { id: string; email: string }): Promise<Member> {
  const error = memberEmailError(rawEmail, allowedDomain());
  if (error) throw new AppError('VALIDATION_FAILED', 'invalid member email', { email: error });
  const email = normalizeEmail(rawEmail);
  // 同時新增同一個 email 時，唯一索引的鎖偶爾被判定為死結：重試，下一次就會是 MEMBER_EXISTS
  return withLockRetry(async () => {
    try {
      const row = await prisma.member.create({ data: { email, role, createdBy: normalizeEmail(by.email) }, select: memberSelect });
      // 不記 email（docs/architecture.md 第 15.2 節）
      logInfo({ eventType: 'member_added', message: 'Member added', userId: by.id, memberId: row.id, role: row.role });
      return toMember(row);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await prisma.member.findUnique({ where: { email }, select: { role: true } });
      throw new AppError('MEMBER_EXISTS', 'already a member', { email: alreadyMemberMessage(email, existing?.role ?? role) });
    }
  });
}

type LockedRow = { id: number; role: MemberRole };

/**
 * 在 READ COMMITTED 交易內先鎖住名單的全部列，再檢查目標與最後一位編輯者（docs/architecture.md 第 9.3 節）。
 * 目標已被移除是 NOT_FOUND；目標是編輯者、而且只剩這一位、這次會讓他不再是編輯者時是 LAST_EDITOR。
 * 兩人同時移除或降級也不會讓名單沒有編輯者（PRM-R12、PRM-R14）。
 */
async function withLockedMembers<T>(id: number, work: (tx: Prisma.TransactionClient, target: LockedRow, editors: number) => Promise<T>): Promise<T> {
  return withLockRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<{ id: number; role: string }[]>('SELECT `id`, `role` FROM `Member` ORDER BY `id` FOR UPDATE');
        const locked = rows.map((r) => ({ id: Number(r.id), role: r.role as MemberRole }));
        const target = locked.find((r) => r.id === id);
        if (!target) throw new AppError('NOT_FOUND', 'member not found');
        return work(tx, target, locked.filter((r) => r.role === 'EDITOR').length);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 20_000 },
    ),
  );
}

/** 改權限（PRM-R35、PRM-R12、PRM-R14）：改成和目前相同的權限照常成功，不寫入也不記 Log；改權限不改清單位置 */
export async function changeMemberRole(id: number, role: MemberRole, by: { id: string }): Promise<Member> {
  const { member, fromRole } = await withLockedMembers(id, async (tx, target, editors) => {
    if (target.role === role) {
      const row = await tx.member.findUniqueOrThrow({ where: { id }, select: memberSelect });
      return { member: toMember(row), fromRole: null };
    }
    if (target.role === 'EDITOR' && editors <= 1) throw new AppError('LAST_EDITOR', 'cannot demote the last editor');
    const row = await tx.member.update({ where: { id }, data: { role }, select: memberSelect });
    return { member: toMember(row), fromRole: target.role };
  });
  if (fromRole) logInfo({ eventType: 'member_role_changed', message: 'Member role changed', userId: by.id, memberId: id, fromRole, toRole: role });
  return member;
}

/** 移除帳號（PRM-R11～R14）：檢視者隨時可以移除；最後一位編輯者是 LAST_EDITOR，已被移除是 NOT_FOUND */
export async function removeMember(id: number, by: { id: string }): Promise<void> {
  const role = await withLockedMembers(id, async (tx, target, editors) => {
    if (target.role === 'EDITOR' && editors <= 1) throw new AppError('LAST_EDITOR', 'cannot remove the last editor');
    await tx.member.delete({ where: { id } });
    return target.role;
  });
  logInfo({ eventType: 'member_removed', message: 'Member removed', userId: by.id, memberId: id, role });
}

export type BootstrapResult =
  | { status: 'skipped'; reason: 'not_configured' | 'list_not_empty' | 'no_valid_email' }
  | { status: 'bootstrapped'; count: number };

/**
 * 伺服器啟動時寫入第一位編輯者（PRM-R02；docs/architecture.md 第 7.3 節）。
 * - INITIAL_EDITOR_EMAILS 沒有設定：直接跳過，不讀寫資料庫（E2E 的伺服器比重建測試資料庫更早啟動）。
 * - 名單不是空的（只有檢視者也算）：跳過，改變數不會增減名單上的帳號。
 * - 名單是空的：只收格式正確、網域等於 ALLOWED_EMAIL_DOMAIN 的 email，以編輯者寫入；沒有有效的 email 時記 WARNING（這時沒有人能編輯）。
 * createMany 加 skipDuplicates，多個執行個體同時啟動也不會重複或失敗。寫入失敗時丟錯，由啟動流程結束程序。
 */
export async function bootstrapEditors(env: NodeJS.ProcessEnv = process.env): Promise<BootstrapResult> {
  const raw = env.INITIAL_EDITOR_EMAILS;
  if (raw === undefined || raw.trim() === '') {
    logInfo({ eventType: 'editors_bootstrap_skipped', message: 'INITIAL_EDITOR_EMAILS is not set', reason: 'not_configured' });
    return { status: 'skipped', reason: 'not_configured' };
  }
  if ((await prisma.member.count()) > 0) {
    logInfo({ eventType: 'editors_bootstrap_skipped', message: 'Member list is not empty', reason: 'list_not_empty' });
    return { status: 'skipped', reason: 'list_not_empty' };
  }
  const emails = parseInitialEditorEmails(raw, allowedDomain(env));
  if (!emails.length) {
    logWarning({
      eventType: 'editors_bootstrap_skipped',
      message: 'Member list is empty and INITIAL_EDITOR_EMAILS has no valid company email; nobody can edit',
      reason: 'no_valid_email',
    });
    return { status: 'skipped', reason: 'no_valid_email' };
  }
  // 幾個執行個體同時寫同一批 email 時，MySQL 可能因唯一索引的鎖判定死結：重試，已有的 email 由 skipDuplicates 略過
  for (let attempt = 1; ; attempt++) {
    try {
      const { count } = await prisma.member.createMany({ data: emails.map((email) => ({ email, role: 'EDITOR' as const })), skipDuplicates: true });
      logInfo({ eventType: 'editors_bootstrapped', message: 'Initial editors written', count });
      return { status: 'bootstrapped', count };
    } catch (err) {
      if (attempt >= 5 || !isLockConflict(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
    }
  }
}
