// 整合測試用：每個測試前清空資料，桌次恢復成 migration 的初始狀態（工作人員桌與內部編號 1–30 的 30 桌，各在自己的位置、
// 沒有備註名稱、暫存區沒有桌；這次測試新增的桌刪掉，D-027，見 tests/helpers/table-reset.ts）。
// 權限與發布（D-021、D-026）：權限名單恢復成既有測試的登入身分（都是編輯者）加上一位檢視者，座位表未發布（tests/helpers/editors.ts）。
import { prisma } from '@/server/db';
import { resetPermissions } from './editors';
import { RESET_TABLES_SQL } from './table-reset';

export async function resetData(): Promise<void> {
  // 先刪眷屬再刪其他參與人員，避免自我參照的外鍵擋住
  await prisma.participant.deleteMany({ where: { hostId: { not: null } } });
  await prisma.participant.deleteMany({});
  await prisma.employee.deleteMany({});
  await resetTables();
  await resetPermissions();
}

/** 桌子恢復成 1–30 桌在原位置、沒有備註名稱、暫存區沒有桌，刪掉 id > 30 的桌（要先刪掉參與人員） */
export async function resetTables(): Promise<void> {
  for (const sql of RESET_TABLES_SQL) await prisma.$executeRawUnsafe(sql);
}

export { prisma };
