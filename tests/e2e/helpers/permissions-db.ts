// 權限與座位發布（D-021）E2E 的資料：直接寫進 E2E 伺服器用的測試資料庫（和 seating-data.ts 同一種連線方式），只用虛構的 email。
// 表與欄位依 docs/architecture.md 第 7.1 節：
//   Editor（id、email unique、createdAt 預設現在、createdBy 可以是 null）；email 一律去前後空白、轉小寫後存（PRM-R03）。
//   Setting（id = 1 的單列表、seatsPublished、updatedAt），由新增它的 migration 用 INSERT 建好。
// 用 mariadb 直接下 SQL，不經過 src/server/db.ts（那個模組 import 'server-only'，在 Playwright 的 Node 行程裡載入會丟錯）。
import { createConnection, type Connection } from 'mariadb';
import { databaseConfigFromEnv } from '../../../src/server/database-config';
import { loadTestEnv } from '../../helpers/test-database';

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

/** 把這個 email 設為編輯者（已經是就不變）；權限從對方的下一次請求起生效（AUTH-R11） */
export async function makeEditor(email: string): Promise<void> {
  await withConnection((conn) => conn.query('INSERT IGNORE INTO `Editor` (`email`) VALUES (?)', [normalizeEmail(email)]));
}

/** 把這個 email 從編輯者名單移除（模擬別人在權限頁移除他）；不在名單上就不變 */
export async function removeEditor(email: string): Promise<void> {
  await withConnection((conn) => conn.query('DELETE FROM `Editor` WHERE `email` = ?', [normalizeEmail(email)]));
}

/**
 * 編輯者名單改成正好這幾位，依陣列順序加入（加入時間一位比一位晚，權限頁依加入先後排列，PRM-R07）。
 * 加入時間用固定的過去時間（2000 年），之後在畫面上新增的一定排在後面，不受資料庫與程式的時區差影響。
 * 會移除不在陣列裡的人，包括預設的測試帳號；下一個測試的 signIn 會再把預設帳號加回來。
 */
export async function setEditors(emails: readonly string[]): Promise<void> {
  await withConnection(async (conn) => {
    await conn.query('DELETE FROM `Editor`');
    for (let i = 0; i < emails.length; i++) {
      await conn.query(
        "INSERT INTO `Editor` (`email`, `createdAt`) VALUES (?, TIMESTAMPADD(SECOND, ?, '2000-01-01 00:00:00.000'))",
        [normalizeEmail(emails[i] ?? ''), i],
      );
    }
  });
}

/** 資料庫裡的編輯者 email，依加入先後 */
export async function editorEmails(): Promise<string[]> {
  return withConnection(async (conn) => {
    const rows = await conn.query<{ email: string }[]>('SELECT `email` FROM `Editor` ORDER BY `createdAt`, `id`');
    return rows.map((r) => r.email);
  });
}

/** 這位編輯者在 Editor 的 id（呼叫 DELETE /api/editors/{id} 用）；不在名單上時丟錯 */
export async function editorIdOf(email: string): Promise<number> {
  return withConnection(async (conn) => {
    const rows = await conn.query<{ id: number }[]>('SELECT `id` FROM `Editor` WHERE `email` = ?', [normalizeEmail(email)]);
    const row = rows[0];
    if (!row) throw new Error(`${email} 不在編輯者名單上`);
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
