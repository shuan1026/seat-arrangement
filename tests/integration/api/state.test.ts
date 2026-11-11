// GET /api/state：docs/architecture.md 第 8 節（全部員工、參與人員與桌次）、第 9.2 節（未登入回 401）；
// docs/spec/README.md AUTH-R08、AUTH-AC08（沒登入時被拒絕、不回傳任何資料）、COM-R05、COM-R06、COM-AC07（重新整理看到最後儲存的結果）；
// SEAT-R05（工作人員桌）；COM-R15（多個分機）；員工的 declined（docs/architecture.md 第 7.1 節、D-014）。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/state/route';
import { appStateSchema, STAFF_TABLE_ID, type AppState } from '@/contracts/entities';
import { prisma, resetData } from '../../helpers/db';
import { createDependent, createEmployee, createGuest, createRegisteredEmployee } from '../../helpers/factory';

type User = { id: string; name: string; email: string };
const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn<() => Promise<User | null>>() }));
vi.mock('@/server/auth', () => ({ currentUser }));

const SIGNED_IN: User = { id: 'test-user-1', name: '測試承辦人', email: 'tester@program.com.tw' };

const callState = () => GET(new Request('http://localhost:3000/api/state'), { params: Promise.resolve({}) });

async function loadState(): Promise<AppState> {
  const res = await callState();
  expect(res.status).toBe(200);
  return appStateSchema.parse(await res.json());
}

beforeEach(async () => {
  await resetData();
  currentUser.mockReset();
});

describe('沒登入（AUTH-R08、AUTH-AC08）', () => {
  beforeEach(() => {
    currentUser.mockResolvedValue(null);
  });

  it('回 401 與 UNAUTHENTICATED', async () => {
    const res = await callState();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: expect.objectContaining({ code: 'UNAUTHENTICATED' }) });
  });

  it('回應不含任何資料', async () => {
    const { participant } = await createRegisteredEmployee(
      { name: '王小明', department: '研發一部', extension: '1234' },
      { tableId: 3, seatOrder: 0 },
    );
    await createDependent(participant.id);
    await createGuest({ guestName: '林董', organization: '測試科技 董事長' });
    await prisma.seatTable.update({ where: { id: 3 }, data: { noteName: '主桌' } });

    const res = await callState();
    const text = await res.text();
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['error']);
    for (const secret of ['王小明', '研發一部', '1234', '林董', '測試科技', '主桌']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('已登入', () => {
  beforeEach(() => {
    currentUser.mockResolvedValue(SIGNED_IN);
  });

  it('沒有任何資料時回傳空的員工與參與人員，仍有 31 張桌次', async () => {
    const state = await loadState();
    expect(state.employees).toEqual([]);
    expect(state.participants).toEqual([]);
    expect(state.tables).toHaveLength(31);
  });

  it('桌次是 id 1–30 的 30 桌（畫面上的 A1～B15，D-019）與工作人員桌（id 0），初始沒有備註名稱（SEAT-R01、SEAT-R05）', async () => {
    const { tables } = await loadState();
    expect(tables.map((t) => t.id).sort((a, b) => a - b)).toEqual(Array.from({ length: 31 }, (_, i) => i));
    expect(tables.find((t) => t.id === STAFF_TABLE_ID)?.kind).toBe('STAFF');
    expect(tables.filter((t) => t.kind === 'STAFF')).toHaveLength(1);
    expect(tables.filter((t) => t.kind === 'NORMAL').map((t) => t.id).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    expect(tables.every((t) => t.noteName === null)).toBe(true);
  });

  it('D-027：每一桌帶 position 與 stagedAt；部署時 1–30 桌各在自己的位置（position = id），工作人員桌 position null，都不在暫存區', async () => {
    const { tables } = await loadState();
    for (const t of tables) {
      if (t.kind === 'STAFF') expect(t).toEqual({ id: STAFF_TABLE_ID, kind: 'STAFF', position: null, stagedAt: null, noteName: null });
      else expect(t, `id ${t.id}`).toEqual({ id: t.id, kind: 'NORMAL', position: t.id, stagedAt: null, noteName: null });
    }
  });

  it('D-027：搬到別的位置、暫存區的桌（stagedAt 是 ISO 字串）、新增的桌（id 31 起）與「未放桌」的位置（沒有那一列）都照資料庫回傳', async () => {
    const stagedAt = new Date('2026-11-01T08:30:00.000Z');
    await prisma.seatTable.update({ where: { id: 9 }, data: { position: null, stagedAt, noteName: '暫放' } });
    await prisma.seatTable.update({ where: { id: 3 }, data: { position: 9 } });
    await prisma.seatTable.create({ data: { id: 31, kind: 'NORMAL', position: 3 } });
    await prisma.seatTable.delete({ where: { id: 17 } });
    const { participant } = await createRegisteredEmployee({ name: '王小明', department: '研發一部' }, { tableId: 9, seatOrder: 0 });

    const state = await loadState();

    expect(state.tables).toHaveLength(31);
    expect(state.tables.find((t) => t.id === 9)).toEqual({ id: 9, kind: 'NORMAL', position: null, stagedAt: stagedAt.toISOString(), noteName: '暫放' });
    expect(state.tables.find((t) => t.id === 3)).toMatchObject({ position: 9, stagedAt: null });
    expect(state.tables.find((t) => t.id === 31)).toEqual({ id: 31, kind: 'NORMAL', position: 3, stagedAt: null, noteName: null });
    expect(state.tables.find((t) => t.id === 17)).toBeUndefined();
    expect(state.tables.some((t) => t.position === 17)).toBe(false);
    // 暫存的桌上的人：tableId 仍是那一桌
    expect(state.participants.find((p) => p.id === participant.id)).toMatchObject({ tableId: 9, seatOrder: 0 });
  });

  it('回傳全部員工（含還沒報名的）、參與人員（員工、眷屬、外部貴賓）與桌次', async () => {
    const wang = await createRegisteredEmployee(
      { name: '王小明', department: '研發一部', team: '前端組', extension: '1234' },
      { tableId: 3, seatOrder: 0, vegetarian: true },
    );
    const dependent = await createDependent(wang.participant.id, { relation: '配偶', childSeat: true, tableId: 3, seatOrder: 1 });
    const chen = await createEmployee({ name: '陳大文', department: '研發一部' });
    const guest = await createGuest({ guestName: '林董', organization: '測試科技 董事長' });
    const staff = await createRegisteredEmployee({ name: '李美華', department: '業務部', extension: '5678' }, { tableId: 0, seatOrder: 0 });
    await prisma.seatTable.update({ where: { id: 3 }, data: { noteName: '主桌' } });

    const state = await loadState();

    expect(state.employees.map((e) => e.id).sort()).toEqual([wang.employee.id, chen.id, staff.employee.id].sort());
    expect(state.employees.find((e) => e.id === wang.employee.id)).toMatchObject({
      name: '王小明',
      department: '研發一部',
      team: '前端組',
      extension: '1234',
    });
    expect(state.employees.find((e) => e.id === chen.id)).toMatchObject({ team: null, extension: null });

    expect(state.participants).toHaveLength(4);
    expect(state.participants.find((p) => p.id === wang.participant.id)).toMatchObject({
      kind: 'EMPLOYEE',
      employeeId: wang.employee.id,
      tableId: 3,
      seatOrder: 0,
      vegetarian: true,
      childSeat: false,
    });
    expect(state.participants.find((p) => p.id === dependent.id)).toMatchObject({
      kind: 'DEPENDENT',
      hostId: wang.participant.id,
      relation: '配偶',
      childSeat: true,
      tableId: 3,
      seatOrder: 1,
    });
    expect(state.participants.find((p) => p.id === guest.id)).toMatchObject({
      kind: 'GUEST',
      guestName: '林董',
      organization: '測試科技 董事長',
      tableId: null,
      seatOrder: null,
    });
    expect(state.participants.find((p) => p.id === staff.participant.id)).toMatchObject({ tableId: STAFF_TABLE_ID });
    expect(state.tables.find((t) => t.id === 3)?.noteName).toBe('主桌');
  });

  it('每位員工帶 declined：標記為不參加的是 true，其他是 false（docs/architecture.md 第 7.1 節、D-014、EMP-R03）', async () => {
    const declined = await createEmployee({ name: '不參加同事', department: '研發一部', declined: true });
    const plain = await createEmployee({ name: '未報名同事', department: '研發一部' });
    const joined = await createRegisteredEmployee({ name: '已報名同事', department: '業務部' });

    const { employees } = await loadState();

    expect(employees.find((e) => e.id === declined.id)?.declined).toBe(true);
    expect(employees.find((e) => e.id === plain.id)?.declined).toBe(false);
    expect(employees.find((e) => e.id === joined.employee.id)?.declined).toBe(false);
    for (const e of employees) expect(typeof e.declined).toBe('boolean');
  });

  it('有兩個分機的員工原樣回傳「1234／1235」（COM-R15）', async () => {
    const e = await createEmployee({ name: '多分機測試', department: '研發一部', extension: '1234／1235' });
    const { employees } = await loadState();
    expect(employees.find((x) => x.id === e.id)?.extension).toBe('1234／1235');
  });

  it('重新載入時看到最後儲存的結果，包括別人剛做的改動（COM-R05、COM-R06、COM-AC07）', async () => {
    const { participant } = await createRegisteredEmployee({ name: '王小明', department: '研發一部' });
    const before = await loadState();
    expect(before.participants.find((p) => p.id === participant.id)?.tableId).toBeNull();
    expect(before.tables.find((t) => t.id === 3)?.noteName).toBeNull();

    // 另一個人儲存了改動
    await prisma.participant.update({ where: { id: participant.id }, data: { tableId: 5, seatOrder: 0 } });
    await prisma.seatTable.update({ where: { id: 3 }, data: { noteName: '董事貴賓' } });
    await createGuest({ guestName: '林董' });

    const after = await loadState();
    expect(after.participants.find((p) => p.id === participant.id)).toMatchObject({ tableId: 5, seatOrder: 0 });
    expect(after.tables.find((t) => t.id === 3)?.noteName).toBe('董事貴賓');
    expect(after.participants).toHaveLength(2);
  });
});
