// 「不參加」報名狀態（D-014）的伺服器端：
// - PUT /api/employees/{id}/declined（本體 { declined: boolean }）標記為不參加或改回未報名；這位員工已報名時回 409（docs/architecture.md 第 8 節）
// - 加入尾牙時清掉標記：POST /api/participants（員工）、POST /api/participants/bulk-join；取消報名後是未報名，不是不參加
// - 新增、編輯、刪除員工和標記的關係
// 規格：docs/spec/employees.md EMP-R03、R27、R30、R31、R38、R41、R42、R63～R65，驗收條件 EMP-AC80～AC84、AC86 的資料部分；
// docs/spec/participants.md PPL-R42、PPL-AC84；docs/architecture.md 第 7.1 節（Employee.declined，有參與人員時一律視為已報名）。
// 匯入報名表與匯入員工名單的部分分別在 participants-import.test.ts、employees-import.test.ts；GET /api/state 帶 declined 在 state.test.ts；
// 未登入回 401 由 access.test.ts 掃描所有 route.ts 檢查。
//
// 假設的介面：
//   src/app/api/employees/[id]/declined/route.ts 匯出 PUT；本體用 src/contracts/employees.ts 的 employeeDeclinedInputSchema
//   成功回 200 與 { employee }（employeeResultSchema，employee.declined 是更新後的值）
//   這位員工已報名：409，code 是 DUPLICATE_PARTICIPANT 或 CONFLICT（docs/architecture.md 第 8.2 節沒有指定，兩者前端都當作衝突重新載入）
//   員工不存在或 id 不是數字：404 NOT_FOUND；本體格式不對：400 VALIDATION_FAILED
// 都是虛構資料。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUT } from '@/app/api/employees/[id]/declined/route';
import { DELETE as deleteEmployeeRoute, PATCH as patchEmployee } from '@/app/api/employees/[id]/route';
import { POST as postEmployee } from '@/app/api/employees/route';
import { DELETE as deleteParticipant, PATCH as patchParticipant } from '@/app/api/participants/[id]/route';
import { POST as postBulkJoin } from '@/app/api/participants/bulk-join/route';
import { POST as postParticipant } from '@/app/api/participants/route';
import { employeeDeleteResultSchema, employeeResultSchema } from '@/contracts/employees';
import { participantDeleteResultSchema, participantsResultSchema } from '@/contracts/participants';
import { registeredEmployeeIds, registrationStatusOf, tabCounts } from '@/domain/employees';
import { loadState } from '@/server/services/state';
import { prisma, resetData } from '../../helpers/db';
import { createEmployee, createGuest, createRegisteredEmployee } from '../../helpers/factory';
import { errorOf, fillTable, okJson, snapshot } from '../../helpers/participants-fixtures';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

const json = (method: string, url: string, body: unknown) =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

const putDeclined = (id: number | string, body: unknown) =>
  PUT(json('PUT', `http://localhost:3000/api/employees/${id}/declined`, body), params(id));
const markDeclined = (id: number) => putDeclined(id, { declined: true });
const unmarkDeclined = (id: number) => putDeclined(id, { declined: false });

const joinEmployee = (employeeId: number, extra: Record<string, unknown> = {}) =>
  postParticipant(json('POST', 'http://localhost:3000/api/participants', { kind: 'EMPLOYEE', employeeId, ...extra }), {
    params: Promise.resolve({}),
  });
const bulkJoin = (employeeIds: number[]) =>
  postBulkJoin(json('POST', 'http://localhost:3000/api/participants/bulk-join', { employeeIds }), {
    params: Promise.resolve({}),
  });
const cancelRegistration = (participantId: number) =>
  deleteParticipant(new Request(`http://localhost:3000/api/participants/${participantId}`, { method: 'DELETE' }), params(participantId));

const declinedOf = async (id: number) => (await prisma.employee.findUniqueOrThrow({ where: { id } })).declined;

/** 伺服器資料推導出的報名狀態（和員工名單頁用同一個 domain 函式） */
async function statusOf(id: number) {
  const state = await loadState();
  const e = state.employees.find((x) => x.id === id);
  if (!e) throw new Error(`員工 ${id} 不在員工名單`);
  return registrationStatusOf(e, registeredEmployeeIds(state.participants));
}

/** 409：這位員工已報名（DUPLICATE_PARTICIPANT 或 CONFLICT，見檔頭） */
async function expectRegisteredConflict(res: Response) {
  const error = await errorOf(res);
  expect(error.status).toBe(409);
  expect(['DUPLICATE_PARTICIPANT', 'CONFLICT']).toContain(error.code);
}

beforeEach(async () => {
  await resetData();
});

describe('PUT /api/employees/{id}/declined：標記為不參加（EMP-R63）', () => {
  it('EMP-AC80：未報名的甲標記為不參加 → 200，回傳 { employee } 且 declined 為 true；資料庫寫入，其他欄位不變', async () => {
    const jia = await createEmployee({ name: '甲', department: '研發部', extension: '1234', note: '備註' });
    const { employee } = await okJson(await markDeclined(jia.id), employeeResultSchema);
    expect(employee).toMatchObject({ id: jia.id, name: '甲', department: '研發部', extension: '1234', note: '備註', declined: true });

    const row = await prisma.employee.findUniqueOrThrow({ where: { id: jia.id } });
    expect(row).toMatchObject({ declined: true, name: '甲', department: '研發部', extension: '1234', note: '備註', sortOrder: jia.sortOrder });
    expect(await statusOf(jia.id)).toBe('declined');
  });

  it('EMP-AC80：甲、乙未報名，丙已報名 → 標記甲之後 Tabs 是全部 3、未報名 1、已報名 1、不參加 1；重新載入後甲仍是不參加（EMP-R08、COM-R05）', async () => {
    const jia = await createEmployee({ name: '甲', department: '研發部' });
    await createEmployee({ name: '乙', department: '研發部' });
    await createRegisteredEmployee({ name: '丙', department: '業務部' });

    await okJson(await markDeclined(jia.id), employeeResultSchema);

    const state = await loadState();
    expect(tabCounts(state.employees, registeredEmployeeIds(state.participants))).toEqual({
      all: 3,
      unregistered: 1,
      registered: 1,
      declined: 1,
    });
    expect(state.employees.find((e) => e.id === jia.id)?.declined).toBe(true);
  });

  it('只改這位員工：參與人員與其他員工不變；不新增參與人員', async () => {
    const jia = await createEmployee({ name: '甲', department: '研發部' });
    await createEmployee({ name: '乙', department: '研發部' });
    await createRegisteredEmployee({ name: '丙', department: '業務部' }, { tableId: 5, seatOrder: 0 });
    const before = await snapshot();

    await okJson(await markDeclined(jia.id), employeeResultSchema);

    const after = await snapshot();
    expect(after.participants).toEqual(before.participants);
    const others = (s: typeof before) => s.employees.filter((e) => e.id !== jia.id);
    expect(others(after)).toEqual(others(before));
  });

  it('已報名的員工不能標記為不參加：409，不儲存（EMP-R63「已報名的員工要先取消報名」、EMP-R65、EMP-AC86）', async () => {
    const { employee, participant } = await createRegisteredEmployee({ name: '甲', department: '研發部' }, { tableId: 5, seatOrder: 0 });
    const before = await snapshot();

    await expectRegisteredConflict(await markDeclined(employee.id));

    expect(await snapshot()).toEqual(before);
    expect(await declinedOf(employee.id)).toBe(false);
    expect(await prisma.participant.findUniqueOrThrow({ where: { id: participant.id } })).toMatchObject({ tableId: 5 });
    expect(await statusOf(employee.id)).toBe('registered');
  });

  it('已報名而且是工作人員：一樣 409，不儲存（EMP-R03 含工作人員）', async () => {
    const { employee } = await createRegisteredEmployee({ name: '值勤同事', department: '總務部' }, { tableId: 0, seatOrder: 0 });
    await expectRegisteredConflict(await markDeclined(employee.id));
    expect(await declinedOf(employee.id)).toBe(false);
  });

  it('已報名的員工先取消報名，就可以標記為不參加（EMP-R63）', async () => {
    const { employee, participant } = await createRegisteredEmployee({ name: '甲', department: '研發部' });
    await okJson(await cancelRegistration(participant.id), participantDeleteResultSchema);
    const { employee: after } = await okJson(await markDeclined(employee.id), employeeResultSchema);
    expect(after.declined).toBe(true);
    expect(await statusOf(employee.id)).toBe('declined');
  });

  it('員工已被別人刪除：404 NOT_FOUND（EMP-R65）', async () => {
    const jia = await createEmployee({ name: '甲', department: '研發部' });
    await prisma.employee.delete({ where: { id: jia.id } });
    expect(await errorOf(await markDeclined(jia.id))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(await prisma.employee.count()).toBe(0);
  });

  it('員工不存在或 id 不是數字：404 NOT_FOUND', async () => {
    expect(await errorOf(await markDeclined(999_999))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(await errorOf(await putDeclined('abc', { declined: true }))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it.each([
    ['沒有 declined', {}],
    ['declined 不是布林值', { declined: 'true' }],
    ['declined 是 null', { declined: null }],
  ])('本體%s：400 VALIDATION_FAILED，不儲存', async (_label, body) => {
    const jia = await createEmployee({ name: '甲', department: '研發部' });
    expect(await errorOf(await putDeclined(jia.id, body))).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(await declinedOf(jia.id)).toBe(false);
  });

  it('本體不是 JSON：400 VALIDATION_FAILED', async () => {
    const jia = await createEmployee({ name: '甲', department: '研發部' });
    const res = await PUT(
      new Request(`http://localhost:3000/api/employees/${jia.id}/declined`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      }),
      params(jia.id),
    );
    expect(await errorOf(res)).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(await declinedOf(jia.id)).toBe(false);
  });
});

describe('PUT /api/employees/{id}/declined：改回未報名（EMP-R63）', () => {
  it('EMP-AC81：不參加的甲改回未報名 → 200，declined 為 false，報名狀態是未報名', async () => {
    const jia = await createEmployee({ name: '甲', department: '研發部', declined: true });
    expect(await statusOf(jia.id)).toBe('declined');

    const { employee } = await okJson(await unmarkDeclined(jia.id), employeeResultSchema);

    expect(employee).toMatchObject({ id: jia.id, declined: false });
    expect(await declinedOf(jia.id)).toBe(false);
    expect(await statusOf(jia.id)).toBe('unregistered');
  });

  it('標記與改回可以來回切換', async () => {
    const jia = await createEmployee({ name: '甲', department: '研發部' });
    await okJson(await markDeclined(jia.id), employeeResultSchema);
    await okJson(await unmarkDeclined(jia.id), employeeResultSchema);
    await okJson(await markDeclined(jia.id), employeeResultSchema);
    expect(await declinedOf(jia.id)).toBe(true);
  });

  it('改回未報名時這位員工剛被別人加入尾牙：409，不儲存，仍是已報名（EMP-R65）', async () => {
    const { employee } = await createRegisteredEmployee({ name: '甲', department: '研發部' });
    const before = await snapshot();
    await expectRegisteredConflict(await unmarkDeclined(employee.id));
    expect(await snapshot()).toEqual(before);
    expect(await statusOf(employee.id)).toBe('registered');
  });

  it('改回未報名時這位員工剛被別人刪除：404 NOT_FOUND（EMP-R65）', async () => {
    const jia = await createEmployee({ name: '甲', department: '研發部', declined: true });
    await prisma.employee.delete({ where: { id: jia.id } });
    expect(await errorOf(await unmarkDeclined(jia.id))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('新增、編輯、刪除員工與不參加的標記', () => {
  it('新增的員工是未報名，declined 是 false（EMP-R38）', async () => {
    const res = await postEmployee(json('POST', 'http://localhost:3000/api/employees', { name: '張三', department: '研發部' }), {
      params: Promise.resolve({}),
    });
    const { employee } = await okJson(res, employeeResultSchema);
    expect(employee.declined).toBe(false);
    expect(await declinedOf(employee.id)).toBe(false);
    expect(await statusOf(employee.id)).toBe('unregistered');
  });

  it('編輯不參加的員工：只改對話框的欄位，仍是不參加（EMP-R27 不參加的列有「編輯」；狀態只由 EMP-R63 切換）', async () => {
    const jia = await createEmployee({ name: '甲', department: '研發部', extension: '1234', declined: true });
    const res = await patchEmployee(
      json('PATCH', `http://localhost:3000/api/employees/${jia.id}`, {
        name: '甲',
        englishName: null,
        department: '研發部',
        team: null,
        extension: '1300',
        region: null,
        office: null,
        note: null,
      }),
      params(jia.id),
    );
    const { employee } = await okJson(res, employeeResultSchema);
    expect(employee).toMatchObject({ extension: '1300', declined: true });
    expect(await declinedOf(jia.id)).toBe(true);
  });

  it('編輯未報名的員工：不會變成不參加', async () => {
    const jia = await createEmployee({ name: '甲', department: '研發部' });
    const res = await patchEmployee(
      json('PATCH', `http://localhost:3000/api/employees/${jia.id}`, { name: '甲乙', department: '研發部' }),
      params(jia.id),
    );
    expect((await okJson(res, employeeResultSchema)).employee).toMatchObject({ name: '甲乙', declined: false });
    expect(await declinedOf(jia.id)).toBe(false);
  });

  it('刪除不參加的員工：從員工名單移除，沒有連動的參與人員（EMP-R41、EMP-R42）', async () => {
    const jia = await createEmployee({ name: '甲', department: '研發部', declined: true });
    const other = await createEmployee({ name: '乙', department: '研發部', declined: true });
    const res = await deleteEmployeeRoute(new Request(`http://localhost:3000/api/employees/${jia.id}`, { method: 'DELETE' }), params(jia.id));
    expect(await okJson(res, employeeDeleteResultSchema)).toEqual({
      deletedEmployeeId: jia.id,
      removedParticipantIds: [],
      participants: [],
    });
    expect((await prisma.employee.findMany()).map((e) => e.id)).toEqual([other.id]);
    expect(await declinedOf(other.id)).toBe(true);
  });
});

describe('加入尾牙時清掉不參加的標記（EMP-R64、PPL-R42）', () => {
  it('POST /api/participants：不參加的陳大文加入尾牙 → 變成已報名，標記清掉（PPL-AC84、EMP-AC84）', async () => {
    const chen = await createEmployee({ name: '陳大文', department: '研發一部', declined: true });

    const { participants } = await okJson(await joinEmployee(chen.id), participantsResultSchema);

    expect(participants).toEqual([expect.objectContaining({ kind: 'EMPLOYEE', employeeId: chen.id })]);
    expect(await declinedOf(chen.id)).toBe(false);
    expect(await statusOf(chen.id)).toBe('registered');
    const state = await loadState();
    expect(tabCounts(state.employees, registeredEmployeeIds(state.participants)).declined).toBe(0);
  });

  it('同時加一位眷屬並選了桌次：一樣清掉標記，兩人入座（EMP-R28、EMP-R64）', async () => {
    const chen = await createEmployee({ name: '陳大文', department: '研發一部', declined: true });
    const { participants } = await okJson(
      await joinEmployee(chen.id, { tableId: 3, dependent: { relation: '配偶' } }),
      participantsResultSchema,
    );
    expect(participants).toHaveLength(2);
    expect(await declinedOf(chen.id)).toBe(false);
    expect(await prisma.participant.count({ where: { tableId: 3 } })).toBe(2);
  });

  it('勾「工作人員」加入：一樣清掉標記', async () => {
    const chen = await createEmployee({ name: '陳大文', department: '研發一部', declined: true });
    await okJson(await joinEmployee(chen.id, { isStaff: true }), participantsResultSchema);
    expect(await declinedOf(chen.id)).toBe(false);
    expect(await prisma.participant.findUniqueOrThrow({ where: { employeeId: chen.id } })).toMatchObject({ tableId: 0 });
  });

  it('加入失敗（桌次已滿 409 TABLE_FULL）：沒有新增，仍是不參加', async () => {
    const chen = await createEmployee({ name: '陳大文', department: '研發一部', declined: true });
    await fillTable(4, 10);
    const before = await snapshot();
    expect(await errorOf(await joinEmployee(chen.id, { tableId: 4 }))).toMatchObject({ status: 409, code: 'TABLE_FULL' });
    expect(await snapshot()).toEqual(before);
    expect(await declinedOf(chen.id)).toBe(true);
  });

  it('只清掉加入的這一位；其他不參加的員工不受影響', async () => {
    const chen = await createEmployee({ name: '陳大文', department: '研發一部', declined: true });
    const other = await createEmployee({ name: '林四', department: '研發一部', declined: true });
    await okJson(await joinEmployee(chen.id), participantsResultSchema);
    expect(await declinedOf(other.id)).toBe(true);
    expect(await statusOf(other.id)).toBe('declined');
  });

  it('POST /api/participants/bulk-join：勾選的員工中有人在送出前被標記為不參加 → 照樣加入，標記清掉（docs/architecture.md 第 7.1 節「加入尾牙時清掉」）', async () => {
    const a = await createEmployee({ name: '測試員工甲', department: '研發一部' });
    const b = await createEmployee({ name: '測試員工乙', department: '業務部', declined: true });

    const { participants } = await okJson(await bulkJoin([a.id, b.id]), participantsResultSchema);

    expect(participants.map((p) => p.employeeId).sort((x, y) => (x ?? 0) - (y ?? 0))).toEqual([a.id, b.id]);
    expect(await declinedOf(a.id)).toBe(false);
    expect(await declinedOf(b.id)).toBe(false);
    expect(await statusOf(b.id)).toBe('registered');
  });

  it('bulk-join 整批不儲存（其中一位已報名，409）：不參加的標記也不變（EMP-R24）', async () => {
    const b = await createEmployee({ name: '測試員工乙', department: '業務部', declined: true });
    const { employee: taken } = await createRegisteredEmployee({ name: '測試員工丙', department: '業務部' });
    const before = await snapshot();
    expect(await errorOf(await bulkJoin([b.id, taken.id]))).toMatchObject({ status: 409, code: 'DUPLICATE_PARTICIPANT' });
    expect(await snapshot()).toEqual(before);
    expect(await declinedOf(b.id)).toBe(true);
  });
});

describe('取消報名後是未報名，不是不參加（EMP-R30、EMP-R64）', () => {
  it('EMP-AC84：甲不參加 → 加入尾牙 → 取消報名 → 甲是未報名', async () => {
    const jia = await createEmployee({ name: '甲', department: '研發部', declined: true });
    const { participants } = await okJson(await joinEmployee(jia.id), participantsResultSchema);
    expect(await statusOf(jia.id)).toBe('registered');

    await okJson(await cancelRegistration(participants[0]!.id), participantDeleteResultSchema);

    expect(await declinedOf(jia.id)).toBe(false);
    expect(await statusOf(jia.id)).toBe('unregistered');
  });

  it('EMP-AC82：已報名的丙取消報名 → 丙是未報名，不是不參加', async () => {
    const { employee, participant } = await createRegisteredEmployee({ name: '丙', department: '業務部' });
    await okJson(await cancelRegistration(participant.id), participantDeleteResultSchema);
    expect(await declinedOf(employee.id)).toBe(false);
    expect(await statusOf(employee.id)).toBe('unregistered');
  });

  it('外部貴賓改成不參加的員工（PPL-Q07 變更類別）之後取消報名：是未報名，不是不參加（EMP-R64）', async () => {
    const chen = await createEmployee({ name: '陳大文', department: '研發一部', declined: true });
    const lin = await createGuest({ guestName: '林董' });
    await okJson(
      await patchParticipant(
        json('PATCH', `http://localhost:3000/api/participants/${lin.id}`, { kind: 'EMPLOYEE', employeeId: chen.id }),
        params(lin.id),
      ),
      participantsResultSchema,
    );
    expect(await statusOf(chen.id)).toBe('registered');

    await okJson(await cancelRegistration(lin.id), participantDeleteResultSchema);

    expect(await statusOf(chen.id)).toBe('unregistered');
  });
});

describe('同時送出：標記為不參加與加入尾牙（EMP-R65、docs/architecture.md 第 7.1 節）', () => {
  it('同一位員工同時被標記為不參加與加入尾牙：最後一定是已報名、沒有不參加的標記（取消報名後才不會變成不參加）', async () => {
    const people = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createEmployee({ name: `並行員工${i + 1}`, department: '研發部' })),
    );

    const results = await Promise.all(people.flatMap((e) => [markDeclined(e.id), joinEmployee(e.id)]));

    for (const [i, e] of people.entries()) {
      const [mark, join] = [results[i * 2]!, results[i * 2 + 1]!];
      expect(join.ok, `${e.name} 的加入尾牙要成功`).toBe(true);
      // 標記先完成就是 200（之後加入時清掉），加入先完成就是 409
      if (!mark.ok) await expectRegisteredConflict(mark);
      expect(await prisma.participant.count({ where: { employeeId: e.id } })).toBe(1);
      expect(await declinedOf(e.id), `${e.name} 不能同時是已報名又帶著不參加的標記`).toBe(false);
      expect(await statusOf(e.id)).toBe('registered');
    }
  });
});
