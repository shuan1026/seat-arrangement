import 'server-only';
import type { Editor } from '@/contracts/permissions';
import { alreadyEditorMessage, editorEmailError, normalizeEmail, parseInitialEditorEmails } from '@/domain/editors';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { AppError } from '../http';
import { logInfo, logWarning } from '../log';

// 編輯者名單（D-021；docs/spec/permissions.md 第 3.1、3.2 節；docs/architecture.md 第 7.3、9.3、11.5 節）。
// email 一律去前後空白、轉小寫後比對與儲存（PRM-R03）。是否為編輯者每次都查資料庫，不放進 JWT、不在記憶體快取。

const allowedDomain = (env: NodeJS.ProcessEnv = process.env) => (env.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();

const toEditor = (row: { id: number; email: string }): Editor => ({ id: row.id, email: row.email });

/** 登入者是否為編輯者（AUTH-R11）；email 大小寫與前後空白不影響 */
export async function isEditor(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const row = await prisma.editor.findUnique({ where: { email: normalized }, select: { id: true } });
  return row !== null;
}

/** 名單，依加入的先後排列，最早加入的在最上面（PRM-R07） */
export async function listEditors(): Promise<Editor[]> {
  const rows = await prisma.editor.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, email: true } });
  return rows.map(toEditor);
}

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/**
 * 新增編輯者（PRM-R08～R10）：空白、格式或網域不對是 VALIDATION_FAILED（錯誤標在 email 欄位）；
 * 已在名單上是 EDITOR_EXISTS。靠 email 的 unique 判斷，兩人同時新增同一個 email 也只有一筆。
 */
export async function addEditor(rawEmail: string, by: { id: string; email: string }): Promise<Editor> {
  const error = editorEmailError(rawEmail, allowedDomain());
  if (error) throw new AppError('VALIDATION_FAILED', 'invalid editor email', { email: error });
  const email = normalizeEmail(rawEmail);
  for (let attempt = 1; ; attempt++) {
    try {
      const row = await prisma.editor.create({ data: { email, createdBy: normalizeEmail(by.email) }, select: { id: true, email: true } });
      // 不記 email（docs/architecture.md 第 15.2 節）
      logInfo({ eventType: 'editor_added', message: 'Editor added', userId: by.id, editorId: row.id });
      return toEditor(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('EDITOR_EXISTS', 'already an editor', { email: alreadyEditorMessage(email) });
      // 同時新增同一個 email 時，唯一索引的鎖偶爾被判定為死結：重試，下一次就會是 EDITOR_EXISTS
      if (attempt < 3 && isLockConflict(err)) continue;
      throw err;
    }
  }
}

function isLockConflict(err: unknown): boolean {
  return (
    (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') ||
    (err instanceof Error && /deadlock|lock wait timeout|write conflict/i.test(err.message))
  );
}

/**
 * 移除編輯者（PRM-R11～R14）：在 READ COMMITTED 交易內先鎖住名單的全部列再數人數，
 * 只剩一位時是 LAST_EDITOR，兩人同時移除也不會讓名單變空（docs/architecture.md 第 9.3 節）；已被移除是 NOT_FOUND。
 */
export async function removeEditor(id: number, by: { id: string }): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRawUnsafe<{ id: number }[]>('SELECT `id` FROM `Editor` ORDER BY `id` FOR UPDATE');
          if (!rows.some((r) => Number(r.id) === id)) throw new AppError('NOT_FOUND', 'editor not found');
          if (rows.length <= 1) throw new AppError('LAST_EDITOR', 'cannot remove the last editor');
          await tx.editor.delete({ where: { id } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 20_000 },
      );
      break;
    } catch (err) {
      if (attempt < 3 && isLockConflict(err)) continue;
      throw err;
    }
  }
  logInfo({ eventType: 'editor_removed', message: 'Editor removed', userId: by.id, editorId: id });
}

export type BootstrapResult =
  | { status: 'skipped'; reason: 'not_configured' | 'list_not_empty' | 'no_valid_email' }
  | { status: 'bootstrapped'; count: number };

/**
 * 伺服器啟動時寫入第一位編輯者（PRM-R02；docs/architecture.md 第 7.3 節）。
 * - INITIAL_EDITOR_EMAILS 沒有設定：直接跳過，不讀寫資料庫（E2E 的伺服器比重建測試資料庫更早啟動）。
 * - 名單不是空的：跳過，改變數不會增減編輯者。
 * - 名單是空的：只收格式正確、網域等於 ALLOWED_EMAIL_DOMAIN 的 email；沒有有效的 email 時記 WARNING（這時沒有人能編輯）。
 * createMany 加 skipDuplicates，多個執行個體同時啟動也不會重複或失敗。寫入失敗時丟錯，由啟動流程結束程序。
 */
export async function bootstrapEditors(env: NodeJS.ProcessEnv = process.env): Promise<BootstrapResult> {
  const raw = env.INITIAL_EDITOR_EMAILS;
  if (raw === undefined || raw.trim() === '') {
    logInfo({ eventType: 'editors_bootstrap_skipped', message: 'INITIAL_EDITOR_EMAILS is not set', reason: 'not_configured' });
    return { status: 'skipped', reason: 'not_configured' };
  }
  if ((await prisma.editor.count()) > 0) {
    logInfo({ eventType: 'editors_bootstrap_skipped', message: 'Editor list is not empty', reason: 'list_not_empty' });
    return { status: 'skipped', reason: 'list_not_empty' };
  }
  const emails = parseInitialEditorEmails(raw, allowedDomain(env));
  if (!emails.length) {
    logWarning({
      eventType: 'editors_bootstrap_skipped',
      message: 'Editor list is empty and INITIAL_EDITOR_EMAILS has no valid company email; nobody can edit',
      reason: 'no_valid_email',
    });
    return { status: 'skipped', reason: 'no_valid_email' };
  }
  // 幾個執行個體同時寫同一批 email 時，MySQL 可能因唯一索引的鎖判定死結：重試，已有的 email 由 skipDuplicates 略過
  for (let attempt = 1; ; attempt++) {
    try {
      const { count } = await prisma.editor.createMany({ data: emails.map((email) => ({ email })), skipDuplicates: true });
      logInfo({ eventType: 'editors_bootstrapped', message: 'Initial editors written', count });
      return { status: 'bootstrapped', count };
    } catch (err) {
      if (attempt >= 5 || !isLockConflict(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
    }
  }
}
