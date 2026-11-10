// 員工 API：POST /api/employees、PATCH /api/employees/{id}、DELETE /api/employees/{id}
// （docs/architecture.md 第 7.1、7.2、8 節；src/contracts/employees.ts）。
// 規格：docs/spec/employees.md EMP-R01～R04、R33～R43，驗收條件 EMP-AC39～AC56 中資料與連動的部分；
// 共用規則 docs/spec/README.md COM-R07～R10（衝突、後存的為準、員工第二行）；待確認 EMP-Q08 第 8 點、Q09。
// 畫面上的對話框、文案與 Sonner 在 tests/e2e/employees-dialogs.spec.ts。未登入回 401 由 tests/integration/api/access.test.ts 掃描所有 route.ts 檢查。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, PATCH } from '@/app/api/employees/[id]/route';
import { POST } from '@/app/api/employees/route';
import { employeeDeleteResultSchema, employeeResultSchema, type EmployeeInput } from '@/contracts/employees';
import { STAFF_TABLE_ID, type AppState } from '@/contracts/entities';
import {
  buildDirectory,
  departmentOf,
  displayName,
  employeeSecondLine,
  panelSecondLine,
  tableDepartmentLabel,
} from '@/domain/display';
import { departmentOptions, regionOptions, registeredEmployeeIds, teamOptions } from '@/domain/employees';
import { loadState } from '@/server/services/state';
import { prisma, resetData } from '../../helpers/db';
import { createDependent, createEmployee, createGuest, createRegisteredEmployee } from '../../helpers/factory';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

const BASE = 'http://localhost:3000/api/employees';

const jsonRequest = (method: string, url: string, body: unknown) =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const create = (body: unknown) => POST(jsonRequest('POST', BASE, body), { params: Promise.resolve({}) });
const update = (id: number | string, body: unknown) =>
  PATCH(jsonRequest('PATCH', `${BASE}/${id}`, body), { params: Promise.resolve({ id: String(id) }) });
const remove = (id: number | string) =>
  DELETE(new Request(`${BASE}/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id: String(id) }) });

async function created(body: EmployeeInput) {
  const res = await create(body);
  expect(res.ok, `POST ${res.status}`).toBe(true);
  return employeeResultSchema.parse(await res.json()).employee;
}

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = (await res.json()) as { error: { code: string; fields?: Record<string, string> } };
  expect(body.error.code).toBe(code);
  return body.error;
}

/** 一位員工完整的輸入（編輯時送出對話框的全部欄位） */
const fullInput = (data: Partial<EmployeeInput> & Pick<EmployeeInput, 'name' | 'department'>): EmployeeInput => ({
  englishName: null,
  team: null,
  extension: null,
  region: null,
  office: null,
  note: null,
  ...data,
});

const seatedAt = (state: AppState, tableId: number) =>
  state.participants.filter((p) => p.tableId === tableId).sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0));

beforeEach(async () => {
  await resetData();
});

describe('POST /api/employees：新增員工', () => {
  it('只填姓名與部門就能新增，其他欄位都是空的；新增後是未報名（EMP-R01、EMP-R38、EMP-AC39）', async () => {
    const e = await created({ name: '張三', department: '研發部' });
    expect(e).toMatchObject({
      name: '張三',
      department: '研發部',
      englishName: null,
      team: null,
      extension: null,
      region: null,
      office: null,
      note: null,
    });

    const state = await loadState();
    expect(state.employees.map((x) => x.id)).toEqual([e.id]);
    expect(state.participants).toEqual([]);
    expect(registeredEmployeeIds(state.participants).has(e.id)).toBe(false);
  });

  it('存下姓名、英文名、部門、組別、分機、地區與備註，去掉前後空白（EMP-R01、EMP-Q08 第 8 點）', async () => {
    const e = await created({
      name: ' 王小明 ',
      englishName: ' Xiaoming ',
      department: ' 業務部 ',
      team: '北區組',
      extension: ' 1234 ',
      region: '台北',
      note: '素食',
    });
    const row = await prisma.employee.findUniqueOrThrow({ where: { id: e.id } });
    expect(row).toMatchObject({
      name: '王小明',
      englishName: 'Xiaoming',
      department: '業務部',
      team: '北區組',
      extension: '1234',
      region: '台北',
      note: '素食',
    });
  });

  it('選填欄位留空視為沒有', async () => {
    const e = await created({ name: '張三', department: '研發部', englishName: '', team: '  ', extension: '', note: '' });
    expect(e).toMatchObject({ englishName: null, team: null, extension: null, note: null });
  });

  it('姓名與部門都沒填：400，姓名「請輸入姓名。」、部門「請選擇部門。」，不新增（EMP-R33、EMP-AC40）', async () => {
    const error = await expectError(await create({ name: '', department: '' }), 400, 'VALIDATION_FAILED');
    expect(error.fields).toMatchObject({ name: '請輸入姓名。', department: '請選擇部門。' });
    expect(await prisma.employee.count()).toBe(0);
  });

  it('只有部門沒選：400，部門「請選擇部門。」（EMP-AC41）', async () => {
    const error = await expectError(await create({ name: '張三', department: '' }), 400, 'VALIDATION_FAILED');
    expect(error.fields).toEqual({ department: '請選擇部門。' });
    expect(await prisma.employee.count()).toBe(0);
  });

  it('只有空白的姓名算沒填（EMP-Q08 第 8 點）', async () => {
    const error = await expectError(await create({ name: '   ', department: '研發部' }), 400, 'VALIDATION_FAILED');
    expect(error.fields).toEqual({ name: '請輸入姓名。' });
  });

  it('姓名超過 50 字：400，不新增', async () => {
    await expectError(await create({ name: '甲'.repeat(51), department: '研發部' }), 400, 'VALIDATION_FAILED');
    expect(await prisma.employee.count()).toBe(0);
  });

  it('本體不是 JSON：400', async () => {
    const res = await POST(
      new Request(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json' }),
      { params: Promise.resolve({}) },
    );
    await expectError(res, 400, 'VALIDATION_FAILED');
  });

  it('輸入新的部門、組別與地區名稱：存下後出現在部門、組別與地區清單（EMP-R34～R36、EMP-AC42、AC44、AC45）', async () => {
    await createEmployee({ name: '既有', department: '研發部', team: '韌體組', region: '台北' });
    await created({ name: '新人一', department: '品保部' });
    await created({ name: '新人二', department: '研發部', team: '測試組' });
    await created({ name: '新人三', department: '研發部', region: '高雄' });

    const { employees } = await loadState();
    expect(departmentOptions(employees)).toContain('品保部');
    expect(teamOptions(employees, '研發部')).toContain('測試組');
    expect(regionOptions(employees)).toContain('高雄');
  });

  it('和既有員工同名仍可新增，兩位都留在名單（EMP-R37、EMP-AC46）', async () => {
    const existing = await createEmployee({ name: '王小明', department: '業務部', extension: '1234' });
    const e = await created({ name: '王小明', department: '研發部' });
    expect(e.id).not.toBe(existing.id);
    const same = await prisma.employee.findMany({ where: { name: '王小明' }, orderBy: { id: 'asc' } });
    expect(same.map((x) => x.department)).toEqual(['業務部', '研發部']);
  });

  it('手動新增的員工排在員工名單最後（docs/architecture.md 第 11.1 節、EMP-Q09）', async () => {
    const a = await createEmployee({ name: '甲', department: '研發部', sortOrder: 10 });
    const b = await createEmployee({ name: '乙', department: '業務部', sortOrder: 50 });
    const e = await created({ name: '丙', department: '研發部' });
    expect(e.sortOrder).toBeGreaterThan(Math.max(a.sortOrder, b.sortOrder));
    const f = await created({ name: '丁', department: '研發部' });
    expect(f.sortOrder).toBeGreaterThan(e.sortOrder);
  });
});

describe('PATCH /api/employees/{id}：編輯員工', () => {
  it('改成新的內容，回傳更新後的員工；id 與員工名單順序不變（EMP-R32、EMP-AC48）', async () => {
    const e = await createEmployee({
      name: '王小明',
      englishName: 'Xiaoming',
      department: '業務部',
      team: '北區組',
      extension: '1234',
      region: '台北',
      note: '素食',
    });
    const res = await update(
      e.id,
      fullInput({
        name: '王小明',
        englishName: 'Xiaoming',
        department: '業務部',
        team: '北區組',
        extension: '1300',
        region: '台北',
        note: '素食',
      }),
    );
    expect(res.ok).toBe(true);
    const { employee } = employeeResultSchema.parse(await res.json());
    expect(employee).toMatchObject({ id: e.id, extension: '1300', sortOrder: e.sortOrder });

    const row = await prisma.employee.findUniqueOrThrow({ where: { id: e.id } });
    expect(row).toMatchObject({ extension: '1300', note: '素食', sortOrder: e.sortOrder });
  });

  it('送出時帶著辦公室就保留辦公室（EMP-Q06 第 4 點：辦公室有存但畫面不顯示）', async () => {
    const e = await createEmployee({ name: '王小明', department: '業務部', office: '台北辦公室' });
    const res = await update(e.id, fullInput({ name: '王小明', department: '業務部', office: '台北辦公室', extension: '1300' }));
    expect(res.ok).toBe(true);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: e.id } })).office).toBe('台北辦公室');
  });

  it('姓名沒填：400「請輸入姓名。」，不儲存（EMP-R33）', async () => {
    const e = await createEmployee({ name: '王小明', department: '業務部' });
    const error = await expectError(await update(e.id, fullInput({ name: '', department: '業務部' })), 400, 'VALIDATION_FAILED');
    expect(error.fields).toMatchObject({ name: '請輸入姓名。' });
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: e.id } })).name).toBe('王小明');
  });

  it('這位員工已被別人刪除：404 NOT_FOUND，不儲存（EMP-R40、EMP-AC51）', async () => {
    const e = await createEmployee({ name: '王小明', department: '業務部' });
    await prisma.employee.delete({ where: { id: e.id } });
    await expectError(await update(e.id, fullInput({ name: '王小明', department: '業務部', extension: '1300' })), 404, 'NOT_FOUND');
    expect(await prisma.employee.count()).toBe(0);
  });

  it('id 不是數字：404', async () => {
    await expectError(await update('abc', fullInput({ name: '王小明', department: '業務部' })), 404, 'NOT_FOUND');
  });

  it('兩人先後編輯同一位員工：兩次都儲存，以後存的為準（EMP-R40、COM-R09）', async () => {
    const e = await createEmployee({ name: '王小明', department: '業務部', extension: '1234' });
    expect((await update(e.id, fullInput({ name: '王小明', department: '業務部', extension: '1300' }))).ok).toBe(true);
    expect((await update(e.id, fullInput({ name: '王小明', department: '業務部', extension: '1400' }))).ok).toBe(true);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: e.id } })).extension).toBe('1400');
  });

  it('編輯不改變報名狀態與座位', async () => {
    const { employee, participant } = await createRegisteredEmployee(
      { name: '王小明', department: '業務部' },
      { tableId: 5, seatOrder: 0 },
    );
    expect((await update(employee.id, fullInput({ name: '王大明', department: '業務部' }))).ok).toBe(true);
    const p = await prisma.participant.findUniqueOrThrow({ where: { id: participant.id } });
    expect(p).toMatchObject({ employeeId: employee.id, tableId: 5, seatOrder: 0 });
  });

  it('EMP-AC49：已報名的王小明改名、改部門、改分機 → 參與人員、眷屬、桌次的部門標示與第二行都跟著變（EMP-R02、EMP-R39）', async () => {
    const { employee, participant } = await createRegisteredEmployee(
      { name: '王小明', department: '業務部', extension: '1234' },
      { tableId: 5, seatOrder: 0 },
    );
    const dependent = await createDependent(participant.id, { tableId: 5, seatOrder: 1 });
    // B10 桌（內部編號 5）另有一位業務部的同事：改部門前桌次標示是「業務部」，改後研發部 2 位、業務部 1 位
    await createRegisteredEmployee({ name: '業務同事', department: '業務部' }, { tableId: 5, seatOrder: 2 });

    const before = await loadState();
    expect(tableDepartmentLabel(seatedAt(before, 5), buildDirectory(before))).toBe('業務部');

    const res = await update(employee.id, fullInput({ name: '王大明', department: '研發部', extension: '1300' }));
    expect(res.ok).toBe(true);

    const state = await loadState();
    const dir = buildDirectory(state);
    const me = state.participants.find((p) => p.id === participant.id)!;
    const dep = state.participants.find((p) => p.id === dependent.id)!;
    expect(displayName(me, dir)).toBe('王大明');
    expect(displayName(dep, dir)).toBe('王大明_眷屬');
    expect(departmentOf(dep, dir)).toBe('研發部');
    expect(employeeSecondLine(state.employees.find((e) => e.id === employee.id)!)).toBe('研發部・分機 1300');
    expect(tableDepartmentLabel(seatedAt(state, 5), dir)).toBe('研發部＋業務部');
    expect(me).toMatchObject({ tableId: 5, seatOrder: 0 });
    expect(dep).toMatchObject({ tableId: 5, seatOrder: 1 });
  });

  it('EMP-AC50：已報名的王小明組別從韌體組改成軟體組 → 人員面板第二行是「{部門}・軟體組」（EMP-R39、COM-R11）', async () => {
    const { employee, participant } = await createRegisteredEmployee({ name: '王小明', department: '研發部', team: '韌體組' });
    expect((await update(employee.id, fullInput({ name: '王小明', department: '研發部', team: '軟體組' }))).ok).toBe(true);
    const state = await loadState();
    const dir = buildDirectory(state);
    const me = state.participants.find((p) => p.id === participant.id)!;
    const e = state.employees.find((x) => x.id === employee.id)!;
    expect(panelSecondLine(departmentOf(me, dir)!, e.team)).toBe('研發部・軟體組');
  });
});

describe('DELETE /api/employees/{id}：刪除員工', () => {
  it('刪除未報名的員工：從員工名單移除，其他員工不受影響（EMP-R42、EMP-AC52）', async () => {
    const wang = await createEmployee({ name: '王小明', department: '業務部' });
    const li = await createEmployee({ name: '李小華', department: '研發部' });
    const res = await remove(wang.id);
    expect(res.ok).toBe(true);
    const body = employeeDeleteResultSchema.parse(await res.json());
    expect(body).toEqual({ deletedEmployeeId: wang.id, removedParticipantIds: [], participants: [] });
    expect((await prisma.employee.findMany()).map((e) => e.id)).toEqual([li.id]);
  });

  it('EMP-AC53：刪除已報名、帶一位眷屬的李小華（B10 桌 8/10）→ 員工、參與人員與眷屬都移除，B10 桌變成 6/10（EMP-R43）', async () => {
    await createRegisteredEmployee({ name: '同桌一', department: '研發部' }, { tableId: 5, seatOrder: 0 });
    const li = await createRegisteredEmployee({ name: '李小華', department: '研發部' }, { tableId: 5, seatOrder: 1 });
    const dependent = await createDependent(li.participant.id, { tableId: 5, seatOrder: 2 });
    for (let i = 3; i < 7; i++) {
      await createRegisteredEmployee({ name: `同桌${i}`, department: '研發部' }, { tableId: 5, seatOrder: i });
    }
    await createGuest({ guestName: '測試貴賓', tableId: 5, seatOrder: 7 });
    expect(await prisma.participant.count({ where: { tableId: 5 } })).toBe(8);

    const res = await remove(li.employee.id);
    expect(res.ok).toBe(true);
    const body = employeeDeleteResultSchema.parse(await res.json());
    expect(body.deletedEmployeeId).toBe(li.employee.id);
    expect([...body.removedParticipantIds].sort((a, b) => a - b)).toEqual(
      [li.participant.id, dependent.id].sort((a, b) => a - b),
    );

    expect(await prisma.employee.findUnique({ where: { id: li.employee.id } })).toBeNull();
    expect(await prisma.participant.findUnique({ where: { id: li.participant.id } })).toBeNull();
    expect(await prisma.participant.findUnique({ where: { id: dependent.id } })).toBeNull();
    expect(await prisma.participant.count({ where: { tableId: 5 } })).toBe(6);
  });

  it('刪除後同桌的人依原本順序重排成 0..n-1，回應帶回順序有變的人（docs/architecture.md 第 7.2 節、contracts/employees.ts）', async () => {
    const before: { id: number; seatOrder: number | null }[] = [];
    before.push((await createRegisteredEmployee({ name: '同桌一', department: '研發部' }, { tableId: 5, seatOrder: 0 })).participant);
    const li = await createRegisteredEmployee({ name: '李小華', department: '研發部' }, { tableId: 5, seatOrder: 1 });
    await createDependent(li.participant.id, { tableId: 5, seatOrder: 2 });
    before.push((await createRegisteredEmployee({ name: '同桌二', department: '研發部' }, { tableId: 5, seatOrder: 3 })).participant);
    before.push(await createGuest({ guestName: '測試貴賓', tableId: 5, seatOrder: 4 }));

    const res = await remove(li.employee.id);
    const body = employeeDeleteResultSchema.parse(await res.json());

    const after = await prisma.participant.findMany({ where: { tableId: 5 }, orderBy: { seatOrder: 'asc' } });
    expect(after.map((p) => p.id)).toEqual(before.map((p) => p.id));
    expect(after.map((p) => p.seatOrder)).toEqual([0, 1, 2]);

    const changed = after.filter((p) => before.find((b) => b.id === p.id)?.seatOrder !== p.seatOrder).map((p) => p.id);
    expect(body.participants.map((p) => p.id)).toEqual(expect.arrayContaining(changed));
    for (const p of body.participants) {
      const row = after.find((a) => a.id === p.id);
      expect(row, `回應中的 ${p.id} 要和資料庫一致`).toBeDefined();
      expect(p).toMatchObject({ tableId: row!.tableId, seatOrder: row!.seatOrder });
    }
  });

  it('眷屬坐在別桌或未入座時也一併移除（EMP-R43）', async () => {
    const li = await createRegisteredEmployee({ name: '李小華', department: '研發部' }, { tableId: 5, seatOrder: 0 });
    const dependent = await createDependent(li.participant.id, { tableId: 6, seatOrder: 0 });
    await remove(li.employee.id);
    expect(await prisma.participant.findUnique({ where: { id: dependent.id } })).toBeNull();
    expect(await prisma.participant.count({ where: { tableId: 6 } })).toBe(0);
  });

  it('已報名但未入座、沒有眷屬：參與人員一併移除', async () => {
    const wang = await createRegisteredEmployee({ name: '王小明', department: '業務部' });
    const res = await remove(wang.employee.id);
    const body = employeeDeleteResultSchema.parse(await res.json());
    expect(body.removedParticipantIds).toEqual([wang.participant.id]);
    expect(await prisma.participant.count()).toBe(0);
  });

  it('EMP-AC54：刪除工作人員 → 工作人員桌少一位，參與人員沒有他（EMP-R43）', async () => {
    const wang = await createRegisteredEmployee({ name: '王小明', department: '業務部' }, { tableId: STAFF_TABLE_ID, seatOrder: 0 });
    const other = await createRegisteredEmployee({ name: '值勤同事', department: '研發部' }, { tableId: STAFF_TABLE_ID, seatOrder: 1 });
    expect(await prisma.participant.count({ where: { tableId: STAFF_TABLE_ID } })).toBe(2);

    expect((await remove(wang.employee.id)).ok).toBe(true);
    const staff = await prisma.participant.findMany({ where: { tableId: STAFF_TABLE_ID } });
    expect(staff.map((p) => p.id)).toEqual([other.participant.id]);
    expect(await prisma.participant.findFirst({ where: { employeeId: wang.employee.id } })).toBeNull();
  });

  it('其他人的報名、眷屬與外部貴賓不受影響', async () => {
    const wang = await createRegisteredEmployee({ name: '王小明', department: '業務部' }, { tableId: 5, seatOrder: 0 });
    const li = await createRegisteredEmployee({ name: '李小華', department: '研發部' }, { tableId: 6, seatOrder: 0 });
    const liDependent = await createDependent(li.participant.id, { tableId: 6, seatOrder: 1 });
    const guest = await createGuest({ guestName: '測試貴賓' });

    await remove(wang.employee.id);
    const remaining = (await prisma.participant.findMany()).map((p) => p.id).sort((a, b) => a - b);
    expect(remaining).toEqual([li.participant.id, liDependent.id, guest.id].sort((a, b) => a - b));
  });

  it('EMP-AC55：部門唯一的員工刪除後，部門清單不再有這個部門（EMP-R04）', async () => {
    await createEmployee({ name: '研發同事', department: '研發部' });
    const only = await createEmployee({ name: '品保同事', department: '品保部' });
    await remove(only.id);
    const { employees } = await loadState();
    expect(departmentOptions(employees)).toEqual(['研發部']);
  });

  it('這位員工已被別人刪除：404 NOT_FOUND（EMP-R40）；刪兩次第二次也是 404', async () => {
    const e = await createEmployee({ name: '王小明', department: '業務部' });
    expect((await remove(e.id)).ok).toBe(true);
    await expectError(await remove(e.id), 404, 'NOT_FOUND');
    await expectError(await remove(999_999), 404, 'NOT_FOUND');
  });
});
