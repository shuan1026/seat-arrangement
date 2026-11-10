// 測試資料工廠：只產生虛構資料（docs/architecture.md 第 6 節）。
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/server/db';

let seq = 0;
const next = () => ++seq;

export async function createEmployee(data: Partial<Prisma.EmployeeUncheckedCreateInput> = {}) {
  const n = next();
  return prisma.employee.create({
    data: {
      name: `測試員工${n}`,
      department: '測試部',
      sortOrder: n,
      ...data,
    },
  });
}

/** 建立員工並加入尾牙 */
export async function createRegisteredEmployee(
  employee: Partial<Prisma.EmployeeUncheckedCreateInput> = {},
  participant: Partial<Prisma.ParticipantUncheckedCreateInput> = {},
) {
  const e = await createEmployee(employee);
  const p = await prisma.participant.create({ data: { kind: 'EMPLOYEE', employeeId: e.id, ...participant } });
  return { employee: e, participant: p };
}

export async function createDependent(hostId: number, data: Partial<Prisma.ParticipantUncheckedCreateInput> = {}) {
  return prisma.participant.create({ data: { kind: 'DEPENDENT', hostId, ...data } });
}

export async function createGuest(data: Partial<Prisma.ParticipantUncheckedCreateInput> = {}) {
  const n = next();
  return prisma.participant.create({ data: { kind: 'GUEST', guestName: `測試貴賓${n}`, ...data } });
}
