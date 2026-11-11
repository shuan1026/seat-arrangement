// 整合測試的權限名單與發布資料（D-021、D-026；docs/architecture.md 第 7.1 節的 Member、Setting）。只用虛構的 email。
// 檔名沿用 D-021 時的 editors.ts；內容已改成操作權限名單 Member（email、role：EDITOR 或 VIEWER）。
//
// 約定：各整合測試檔用 vi.mock('@/server/auth') 決定登入者。
// - 既有的測試用 t@program.com.tw 或 tester@program.com.tw，resetData()（tests/helpers/db.ts）每個測試前把名單恢復成：
//   這兩位是編輯者、VIEWER（viewer@program.com.tw）是檢視者。所以既有會修改資料的測試不必改，VIEWER 一律是檢視者。
// - 沒有權限的情境用丁（DING，ding@program.com.tw）：一律不在名單上（docs/spec/permissions.md 第 5 節）。
// - 座位表每個測試前恢復成未發布（PRM-R17）。
import { prisma } from '@/server/db';

export type Role = 'EDITOR' | 'VIEWER';
export type MemberSeed = { email: string; role: Role };

/** 既有整合測試的登入身分，預設都是編輯者 */
export const DEFAULT_TEST_EDITORS = ['t@program.com.tw', 'tester@program.com.tw'] as const;

export type TestUser = { id: string; name: string; email: string };

/** 預設的編輯者身分 */
export const EDITOR: TestUser = { id: 'test-user-1', name: '測試承辦人', email: 'tester@program.com.tw' };
/** 檢視者：resetData() 時以 VIEWER 寫進名單 */
export const VIEWER: TestUser = { id: 'viewer-1', name: '檢視同仁', email: 'viewer@program.com.tw' };
/** docs/spec/permissions.md 第 5 節的甲、乙、丙、丁；丁一律不在名單上（沒有權限） */
export const JIA: TestUser = { id: 'jia-1', name: '甲同仁', email: 'jia@program.com.tw' };
export const YI: TestUser = { id: 'yi-1', name: '乙同仁', email: 'yi@program.com.tw' };
export const BING: TestUser = { id: 'bing-1', name: '丙同仁', email: 'bing@program.com.tw' };
export const DING: TestUser = { id: 'ding-1', name: '丁同仁', email: 'ding@program.com.tw' };

/** 每個測試前的名單：預設的兩位編輯者，加上檢視者 VIEWER */
export const DEFAULT_MEMBERS: readonly MemberSeed[] = [
  ...DEFAULT_TEST_EDITORS.map((email) => ({ email, role: 'EDITOR' as const })),
  { email: VIEWER.email, role: 'VIEWER' },
];

const normalize = (email: string) => email.trim().toLowerCase();

/**
 * 加入時間：第 i 位比第 i-1 位晚一秒（權限頁依加入先後排列，PRM-R07）。用固定的過去時間（2000 年），
 * 測試中經由 API 新增的帳號（加入時間是現在）一定排在後面。
 */
const joinedAt = (i: number) => new Date(Date.UTC(2000, 0, 1, 0, 0, i));

/** 名單改成正好這幾位，依陣列順序加入；createdBy 都是 null（同啟動時由 INITIAL_EDITOR_EMAILS 寫入的） */
export async function setMembers(members: readonly MemberSeed[]): Promise<void> {
  await prisma.member.deleteMany({});
  for (const [i, m] of members.entries()) {
    await prisma.member.create({ data: { email: normalize(m.email), role: m.role, createdAt: joinedAt(i) } });
  }
}

/** 名單改成正好這幾位編輯者（依陣列順序加入），沒有檢視者 */
export async function setEditors(emails: readonly string[]): Promise<void> {
  await setMembers(emails.map((email) => ({ email, role: 'EDITOR' })));
}

/** 每個測試前：名單恢復成預設（兩位編輯者與檢視者 VIEWER），座位表未發布 */
export async function resetPermissions(): Promise<void> {
  await setMembers(DEFAULT_MEMBERS);
  await prisma.setting.upsert({ where: { id: 1 }, update: { seatsPublished: false }, create: { id: 1, seatsPublished: false } });
}

/** 把這個 email 設成這個權限：已在名單上就只改權限（位置不變），不在就加到最後（模擬別人在權限頁新增或改權限） */
export async function setRole(email: string, role: Role): Promise<void> {
  const normalized = normalize(email);
  const count = await prisma.member.count();
  await prisma.member.upsert({
    where: { email: normalized },
    update: { role },
    create: { email: normalized, role, createdAt: joinedAt(100 + count) },
  });
}

/** 設為編輯者（已在名單上就改成編輯者） */
export const makeEditor = (email: string) => setRole(email, 'EDITOR');
/** 設為檢視者（已在名單上就改成檢視者，例如編輯者被降級） */
export const makeViewer = (email: string) => setRole(email, 'VIEWER');

/** 從名單移除（模擬別人在權限頁移除他）；之後他沒有權限 */
export async function removeMember(email: string): Promise<void> {
  await prisma.member.deleteMany({ where: { email: normalize(email) } });
}

/** 資料庫裡的名單（email 與權限），依加入先後 */
export async function memberList(): Promise<MemberSeed[]> {
  const rows = await prisma.member.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { email: true, role: true } });
  return rows.map((r) => ({ email: r.email, role: r.role }));
}

/** 資料庫裡的 email，依加入先後 */
export async function memberEmails(): Promise<string[]> {
  return (await memberList()).map((m) => m.email);
}

/** 這個 email 在名單上的權限；不在名單上是 null */
export async function roleOf(email: string): Promise<Role | null> {
  return (await prisma.member.findUnique({ where: { email: normalize(email) }, select: { role: true } }))?.role ?? null;
}

/** 這個帳號在 Member 的 id；不在名單上時丟錯 */
export async function memberIdOf(email: string): Promise<number> {
  const row = await prisma.member.findUnique({ where: { email: normalize(email) } });
  if (!row) throw new Error(`${email} 不在權限名單上`);
  return row.id;
}

export async function setPublished(published: boolean): Promise<void> {
  await prisma.setting.upsert({ where: { id: 1 }, update: { seatsPublished: published }, create: { id: 1, seatsPublished: published } });
}

export async function isPublished(): Promise<boolean> {
  return (await prisma.setting.findUnique({ where: { id: 1 } }))?.seatsPublished ?? false;
}
