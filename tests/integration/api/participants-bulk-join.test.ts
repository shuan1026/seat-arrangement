// POST /api/participants/bulk-join：員工名單勾選多位一次加入尾牙（src/contracts/participants.ts 的 bulkJoinSchema）。
// 依據：docs/spec/participants.md PPL-R63、PPL-AC60；employees.md EMP-R21（至少勾一位）、EMP-R22（只加員工本人、
// 不加眷屬、加入後未入座）、EMP-R24（有人已被別人加入時整批不儲存）；docs/spec/README.md COM-R07。
// 員工名單頁上的勾選與確認對話框在階段 3 測（docs/plan/implementation-plan.md 第 5.2 節）。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/participants/bulk-join/route';
import { participantsResultSchema } from '@/contracts/participants';
import { prisma, resetData } from '../../helpers/db';
import { createEmployee } from '../../helpers/factory';
import { demoRoster, errorOf, okJson, seatAt, snapshot } from '../../helpers/participants-fixtures';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

const join = (body: unknown) =>
  POST(
    new Request('http://localhost:3000/api/participants/bulk-join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );

async function threeUnregistered() {
  const a = await createEmployee({ name: '測試員工甲', department: '研發一部', extension: '2001' });
  const b = await createEmployee({ name: '測試員工乙', department: '業務部' });
  const c = await createEmployee({ name: '測試員工丙', department: '總務部', extension: '2003' });
  return [a.id, b.id, c.id];
}

beforeEach(async () => {
  await resetData();
});

describe('POST /api/participants/bulk-join', () => {
  it('勾選 3 位未報名的員工：各新增一位類別為員工的參與人員，都未入座、不是工作人員，沒有眷屬（PPL-R63、PPL-AC60、EMP-R22）', async () => {
    const { wang } = await demoRoster();
    await seatAt(3, wang.participant.id);
    const ids = await threeUnregistered();
    const before = await prisma.participant.findUnique({ where: { id: wang.participant.id } });

    const { participants } = await okJson(await join({ employeeIds: ids }), participantsResultSchema);

    expect(participants).toHaveLength(3);
    expect(participants.map((p) => p.employeeId).sort()).toEqual([...ids].sort());
    for (const p of participants) {
      expect(p).toMatchObject({ kind: 'EMPLOYEE', tableId: null, seatOrder: null, hostId: null });
    }
    const rows = await prisma.participant.findMany({ where: { employeeId: { in: ids } } });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatchObject({ kind: 'EMPLOYEE', tableId: null, seatOrder: null, childSeat: false, vegetarian: false });
    }
    expect(await prisma.participant.count({ where: { kind: 'DEPENDENT' } })).toBe(0);
    // 其他參與人員與座位不受影響
    expect(await prisma.participant.findUnique({ where: { id: wang.participant.id } })).toEqual(before);
  });

  it('其中一位已被別人加入尾牙：整批不儲存，409 DUPLICATE_PARTICIPANT（EMP-R24、COM-R07）', async () => {
    const { lee } = await demoRoster();
    const ids = await threeUnregistered();
    const before = await snapshot();
    expect(await errorOf(await join({ employeeIds: [...ids, lee.employee.id] }))).toMatchObject({
      status: 409,
      code: 'DUPLICATE_PARTICIPANT',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('其中一位員工已被別人刪除：整批不儲存，404 NOT_FOUND（COM-R07）', async () => {
    const ids = await threeUnregistered();
    const before = await snapshot();
    expect(await errorOf(await join({ employeeIds: [...ids, 999_999] }))).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('沒有勾選任何人：400 VALIDATION_FAILED（EMP-R21）', async () => {
    expect(await errorOf(await join({ employeeIds: [] }))).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(await prisma.participant.count()).toBe(0);
  });

  it('加入後就是已報名：同一位員工再加入一次會 409 DUPLICATE_PARTICIPANT（PPL-R03）', async () => {
    const ids = await threeUnregistered();
    await okJson(await join({ employeeIds: ids }), participantsResultSchema);
    expect(await errorOf(await join({ employeeIds: ids.slice(0, 1) }))).toMatchObject({
      status: 409,
      code: 'DUPLICATE_PARTICIPANT',
    });
    expect(await prisma.participant.count()).toBe(3);
  });
});
