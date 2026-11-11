// 整合測試用：每個測試前清空資料，桌次恢復成 migration 的初始狀態（31 張、沒有備註名稱）。
// 權限與發布（D-021、D-026）：權限名單恢復成既有測試的登入身分（都是編輯者）加上一位檢視者，座位表未發布（tests/helpers/editors.ts）。
import { prisma } from '@/server/db';
import { resetPermissions } from './editors';

export async function resetData(): Promise<void> {
  // 先刪眷屬再刪其他參與人員，避免自我參照的外鍵擋住
  await prisma.participant.deleteMany({ where: { hostId: { not: null } } });
  await prisma.participant.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.seatTable.updateMany({ data: { noteName: null } });
  await resetPermissions();
}

export { prisma };
