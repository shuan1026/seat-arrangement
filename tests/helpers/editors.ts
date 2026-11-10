// 整合測試的權限與發布資料（D-021；docs/architecture.md 第 7.1 節的 Editor、Setting）。只用虛構的 email。
//
// 約定：各整合測試檔用 vi.mock('@/server/auth') 決定登入者。既有的測試用 t@program.com.tw 或 tester@program.com.tw，
// resetData()（tests/helpers/db.ts）每個測試前把編輯者名單恢復成這兩位，所以既有會修改資料的測試不必改；
// 只能檢視的情境用 VIEWER（不在名單上）。座位表每個測試前恢復成未發布（PRM-R17）。
import { prisma } from '@/server/db';

/** 既有整合測試的登入身分，預設都是編輯者 */
export const DEFAULT_TEST_EDITORS = ['t@program.com.tw', 'tester@program.com.tw'] as const;

export type TestUser = { id: string; name: string; email: string };

/** 預設的編輯者身分 */
export const EDITOR: TestUser = { id: 'test-user-1', name: '測試承辦人', email: 'tester@program.com.tw' };
/** 只能檢視的身分：不在編輯者名單上 */
export const VIEWER: TestUser = { id: 'viewer-1', name: '檢視同仁', email: 'viewer@program.com.tw' };
/** docs/spec/permissions.md 第 5 節的甲、乙、丙 */
export const JIA: TestUser = { id: 'jia-1', name: '甲同仁', email: 'jia@program.com.tw' };
export const YI: TestUser = { id: 'yi-1', name: '乙同仁', email: 'yi@program.com.tw' };
export const BING: TestUser = { id: 'bing-1', name: '丙同仁', email: 'bing@program.com.tw' };

/**
 * 加入時間：第 i 位比第 i-1 位晚一秒（權限頁依加入先後排列，PRM-R07）。用固定的過去時間（2000 年），
 * 測試中經由 API 新增的編輯者（加入時間是現在）一定排在後面。
 */
const joinedAt = (i: number) => new Date(Date.UTC(2000, 0, 1, 0, 0, i));

/** 編輯者名單改成正好這幾位，依陣列順序加入；createdBy 都是 null（同啟動時由 INITIAL_EDITOR_EMAILS 寫入的） */
export async function setEditors(emails: readonly string[]): Promise<void> {
  await prisma.editor.deleteMany({});
  for (const [i, email] of emails.entries()) {
    await prisma.editor.create({ data: { email: email.trim().toLowerCase(), createdAt: joinedAt(i) } });
  }
}

/** 每個測試前：編輯者名單恢復成預設的測試身分，座位表未發布 */
export async function resetPermissions(): Promise<void> {
  await setEditors(DEFAULT_TEST_EDITORS);
  await prisma.setting.upsert({ where: { id: 1 }, update: { seatsPublished: false }, create: { id: 1, seatsPublished: false } });
}

/** 把這個 email 設為編輯者（已經是就不變） */
export async function addEditor(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const count = await prisma.editor.count();
  await prisma.editor.upsert({ where: { email: normalized }, update: {}, create: { email: normalized, createdAt: joinedAt(100 + count) } });
}

/** 把這個 email 從編輯者名單移除（模擬別人在權限頁移除他） */
export async function removeEditor(email: string): Promise<void> {
  await prisma.editor.deleteMany({ where: { email: email.trim().toLowerCase() } });
}

/** 資料庫裡的編輯者 email，依加入先後 */
export async function editorEmails(): Promise<string[]> {
  const rows = await prisma.editor.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return rows.map((r) => r.email);
}

/** 這位編輯者的 id；不在名單上時丟錯 */
export async function editorIdOf(email: string): Promise<number> {
  const row = await prisma.editor.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!row) throw new Error(`${email} 不在編輯者名單上`);
  return row.id;
}

export async function setPublished(published: boolean): Promise<void> {
  await prisma.setting.upsert({ where: { id: 1 }, update: { seatsPublished: published }, create: { id: 1, seatsPublished: published } });
}

export async function isPublished(): Promise<boolean> {
  return (await prisma.setting.findUnique({ where: { id: 1 } }))?.seatsPublished ?? false;
}
