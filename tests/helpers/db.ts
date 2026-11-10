// 整合測試用：每個測試前清空資料，桌次恢復成 migration 的初始狀態（31 張、沒有備註名稱）。
import { prisma } from '@/server/db';

export async function resetData(): Promise<void> {
  // 先刪眷屬再刪其他參與人員，避免自我參照的外鍵擋住
  await prisma.participant.deleteMany({ where: { hostId: { not: null } } });
  await prisma.participant.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.seatTable.updateMany({ data: { noteName: null } });
}

export { prisma };
