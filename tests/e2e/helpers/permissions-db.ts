// 權限與座位發布（D-021、D-026）E2E 的資料：直接寫進 E2E 伺服器用的測試資料庫（和 seating-data.ts 同一種連線方式），只用虛構的 email。
// 表與欄位依 docs/architecture.md 第 7.1 節：
//   Member（id、email unique、role：EDITOR 或 VIEWER（沒有預設值，一定要指定）、createdAt 預設現在、createdBy 可以是 null）；
//   email 一律去前後空白、轉小寫後存（PRM-R03）。不在 Member 上的公司帳號沒有權限（D-026）。
//   Setting（id = 1 的單列表、seatsPublished、updatedAt），由新增它的 migration 用 INSERT 建好。
// 用 mariadb 直接下 SQL，不經過 src/server/db.ts（那個模組 import 'server-only'，在 Playwright 的 Node 行程裡載入會丟錯）。
// 「別人在權限頁改了名單」都用這裡的函式模擬：權限從對方的下一次開啟頁面或操作起生效（AUTH-R11）。
import { createConnection, type Connection } from 'mariadb';
import { databaseConfigFromEnv } from '../../../src/server/database-config';
import { loadTestEnv } from '../../helpers/test-database';

export type Role = 'EDITOR' | 'VIEWER';
export type MemberSeed = { email: string; role: Role };

async function connect(): Promise<Connection> {
  const cfg = databaseConfigFromEnv(process.env, loadTestEnv());
  return createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
    allowPublicKeyRetrieval: !cfg.ssl,
    insertIdAsNumber: true,
    bigIntAsNumber: true,
  });
}

async function withConnection<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  const conn = await connect();
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

/** PRM-R03：去掉前後空白、英文字母轉小寫 */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** 把這個 email 設成這個權限：已在名單上就只改權限（加入時間不變，清單位置不變），不在就加到最後 */
export async function setRole(email: string, role: Role): Promise<void> {
  await withConnection((conn) =>
    conn.query('INSERT INTO `Member` (`email`, `role`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `role` = VALUES(`role`)', [normalizeEmail(email), role]),
  );
}

/** 設為編輯者（已在名單上就改成編輯者，例如檢視者被升級） */
export const makeEditor = (email: string) => setRole(email, 'EDITOR');
/** 設為檢視者（已在名單上就改成檢視者，例如編輯者被降級；模擬別人在權限頁把他改為檢視者） */
export const makeViewer = (email: string) => setRole(email, 'VIEWER');

/** 從名單移除（模擬別人在權限頁移除他）；之後他沒有權限。不在名單上就不變 */
export async function removeMember(email: string): Promise<void> {
  await withConnection((conn) => conn.query('DELETE FROM `Member` WHERE `email` = ?', [normalizeEmail(email)]));
}

/**
 * 名單改成正好這幾位與各自的權限，依陣列順序加入（加入時間一位比一位晚，權限頁依加入先後排列，PRM-R07）。
 * 加入時間用固定的過去時間（2000 年），之後在畫面上新增的一定排在後面，不受資料庫與程式的時區差影響。
 * 會移除不在陣列裡的人，包括預設的測試帳號；下一個測試的 signIn 會再把預設帳號加回來。
 */
export async function setMembers(members: readonly MemberSeed[]): Promise<void> {
  await withConnection(async (conn) => {
    await conn.query('DELETE FROM `Member`');
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (!m) continue;
      await conn.query(
        "INSERT INTO `Member` (`email`, `role`, `createdAt`) VALUES (?, ?, TIMESTAMPADD(SECOND, ?, '2000-01-01 00:00:00.000'))",
        [normalizeEmail(m.email), m.role, i],
      );
    }
  });
}

/** 名單改成正好這幾位編輯者（依陣列順序加入），沒有檢視者 */
export async function setEditors(emails: readonly string[]): Promise<void> {
  await setMembers(emails.map((email) => ({ email, role: 'EDITOR' })));
}

/** 資料庫裡的名單（email 與權限），依加入先後 */
export async function memberList(): Promise<MemberSeed[]> {
  return withConnection(async (conn) => {
    const rows = await conn.query<{ email: string; role: Role }[]>('SELECT `email`, `role` FROM `Member` ORDER BY `createdAt`, `id`');
    return rows.map((r) => ({ email: r.email, role: r.role }));
  });
}

/** 資料庫裡的 email，依加入先後 */
export async function memberEmails(): Promise<string[]> {
  return (await memberList()).map((m) => m.email);
}

/** 這個 email 在名單上的權限；不在名單上是 null */
export async function roleOf(email: string): Promise<Role | null> {
  return withConnection(async (conn) => {
    const rows = await conn.query<{ role: Role }[]>('SELECT `role` FROM `Member` WHERE `email` = ?', [normalizeEmail(email)]);
    return rows[0]?.role ?? null;
  });
}

/** 這個帳號在 Member 的 id（呼叫 PATCH、DELETE /api/members/{id} 用）；不在名單上時丟錯 */
export async function memberIdOf(email: string): Promise<number> {
  return withConnection(async (conn) => {
    const rows = await conn.query<{ id: number }[]>('SELECT `id` FROM `Member` WHERE `email` = ?', [normalizeEmail(email)]);
    const row = rows[0];
    if (!row) throw new Error(`${email} 不在權限名單上`);
    return Number(row.id);
  });
}

/** 發布設定（PRM-R17，預設未發布）；模擬另一位編輯者在對話框切換 */
export async function setPublished(published: boolean): Promise<void> {
  await withConnection((conn) =>
    conn.query(
      'INSERT INTO `Setting` (`id`, `seatsPublished`, `updatedAt`) VALUES (1, ?, NOW(3)) ' +
        'ON DUPLICATE KEY UPDATE `seatsPublished` = VALUES(`seatsPublished`), `updatedAt` = NOW(3)',
      [published],
    ),
  );
}

/** 資料庫裡的發布狀態 */
export async function isPublished(): Promise<boolean> {
  return withConnection(async (conn) => {
    const rows = await conn.query<{ seatsPublished: number | boolean }[]>('SELECT `seatsPublished` FROM `Setting` WHERE `id` = 1');
    return Boolean(Number(rows[0]?.seatsPublished ?? 0));
  });
}

/** 設定桌次的備註名稱（內部編號 1–30，D-019） */
export async function setNoteName(tableId: number, noteName: string | null): Promise<void> {
  await withConnection((conn) =>
    conn.query('UPDATE `SeatTable` SET `noteName` = ? WHERE `id` = ?', [noteName, tableId]),
  );
}
