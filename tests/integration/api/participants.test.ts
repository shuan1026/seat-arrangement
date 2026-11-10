// 參與人員 API：POST /api/participants、PATCH 與 DELETE /api/participants/{id}（src/contracts/participants.ts）。
// 依據：docs/spec/participants.md 第 3.1～3.5 節（PPL-R01～R18、PPL-R41～R62）與第 5.4～5.6 節的驗收條件；
// 待確認 PPL-Q07（編輯時變更類別）、PPL-Q08（編輯時改桌次、取消工作人員）依目前假設（D-008）；
// docs/architecture.md 第 7.1 節（外鍵連動：取消報名時眷屬一併移除，座位存在人身上）、第 7.2 節（交易內檢查桌次人數、
// 工作人員桌只放員工、桌內順序重排為 0..n-1）、第 8.2 節（錯誤碼）；docs/spec/README.md COM-R07（別人剛改過資料時這次不儲存）。
// 新增人員時選了桌次或勾「工作人員」：座位由這條線的服務層寫入，這裡驗證已滿與工作人員桌上限。
// 人物是規格驗收條件裡的虛構示範資料。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, PATCH } from '@/app/api/participants/[id]/route';
import { POST } from '@/app/api/participants/route';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import { participantDeleteResultSchema, participantsResultSchema } from '@/contracts/participants';
import { prisma, resetData } from '../../helpers/db';
import { createDependent, createEmployee, createGuest, createRegisteredEmployee } from '../../helpers/factory';
import {
  contiguous,
  countAt,
  demoRoster,
  errorOf,
  fillStaff,
  fillTable,
  okJson,
  seatAt,
  seatedIds,
  seatOrdersAt,
  snapshot,
} from '../../helpers/participants-fixtures';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

const BASE = 'http://localhost:3000/api/participants';
const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const create = (body: unknown) => POST(new Request(BASE, jsonInit('POST', body)), { params: Promise.resolve({}) });
const edit = (id: number | string, body: unknown) =>
  PATCH(new Request(`${BASE}/${id}`, jsonInit('PATCH', body)), { params: Promise.resolve({ id: String(id) }) });
const remove = (id: number | string) =>
  DELETE(new Request(`${BASE}/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id: String(id) }) });

const findP = (id: number) => prisma.participant.findUnique({ where: { id } });

/** 這位員工的報名（參與人員）；沒報名時讓測試失敗 */
async function registrationOf(employeeId: number) {
  const p = await prisma.participant.findUnique({ where: { employeeId } });
  if (!p) throw new Error(`員工 ${employeeId} 沒有報名`);
  return p;
}
const dependentOfHost = (hostId: number) => prisma.participant.findUnique({ where: { hostId } });

/** 陣列裡剛好一個項目 */
function single<T>(items: T[]): T {
  expect(items).toHaveLength(1);
  const [item] = items;
  if (item === undefined) throw new Error('沒有任何項目');
  return item;
}

const byNumber = (a: number, b: number) => a - b;

beforeEach(async () => {
  await resetData();
});

describe('POST /api/participants：員工（新增人員、從員工名單加入尾牙）', () => {
  it('新增還沒報名的員工：未入座、不是工作人員；參與人員只另外記兒童椅、素食、備註（PPL-R02、PPL-R56、PPL-R62、PPL-AC36、PPL-AC58）', async () => {
    const { chen } = await demoRoster();
    const before = await prisma.participant.count();

    const { participants } = await okJson(
      await create({ kind: 'EMPLOYEE', employeeId: chen.id, childSeat: true, vegetarian: true, note: '需要靠走道' }),
      participantsResultSchema,
    );

    expect(single(participants)).toMatchObject({
      kind: 'EMPLOYEE',
      employeeId: chen.id,
      hostId: null,
      guestName: null,
      tableId: null,
      seatOrder: null,
      childSeat: true,
      vegetarian: true,
      note: '需要靠走道',
    });
    expect(await prisma.participant.count()).toBe(before + 1);
    expect(await registrationOf(chen.id)).toMatchObject({
      kind: 'EMPLOYEE',
      tableId: null,
      childSeat: true,
      vegetarian: true,
      note: '需要靠走道',
    });
    // 姓名、部門、分機仍在員工名單，沒有被改動
    expect(await prisma.employee.findUnique({ where: { id: chen.id } })).toMatchObject({
      name: '陳大文',
      department: '研發一部',
      extension: null,
    });
  });

  it('沒勾的項目預設不需要兒童椅、不素食、沒有備註', async () => {
    const { chen } = await demoRoster();
    await okJson(await create({ kind: 'EMPLOYEE', employeeId: chen.id }), participantsResultSchema);
    expect(await registrationOf(chen.id)).toMatchObject({ childSeat: false, vegetarian: false, note: null, tableId: null });
  });

  it('已報名的員工不能再新增：409 DUPLICATE_PARTICIPANT，參與人員沒有改變（PPL-R03、PPL-R45、PPL-AC38）', async () => {
    const { wang } = await demoRoster();
    const before = await snapshot();
    expect(await errorOf(await create({ kind: 'EMPLOYEE', employeeId: wang.employee.id }))).toMatchObject({
      status: 409,
      code: 'DUPLICATE_PARTICIPANT',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('兩個請求同時加入同一位員工：只新增一次，另一個 409 DUPLICATE_PARTICIPANT（PPL-R03、COM-R07）', async () => {
    const { chen } = await demoRoster();
    const body = { kind: 'EMPLOYEE', employeeId: chen.id };
    const results = await Promise.all([create(body), create(body)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await errorOf(single(results.filter((r) => !r.ok)))).toMatchObject({
      status: 409,
      code: 'DUPLICATE_PARTICIPANT',
    });
    expect(await prisma.participant.count({ where: { employeeId: chen.id } })).toBe(1);
  });

  it('員工已從員工名單刪除：404 NOT_FOUND，沒有新增（COM-R07）', async () => {
    await demoRoster();
    const before = await snapshot();
    expect(await errorOf(await create({ kind: 'EMPLOYEE', employeeId: 999_999 }))).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('沒選員工：400 VALIDATION_FAILED，「請選擇員工。」（PPL-R59、PPL-AC54）', async () => {
    expect(await errorOf(await create({ kind: 'EMPLOYEE' }))).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      fields: { employeeId: '請選擇員工。' },
    });
    expect(await prisma.participant.count()).toBe(0);
  });

  it('同時加一位眷屬：眷屬的所屬員工是這位員工，稱謂、兒童椅、素食照填，兩人都未入座（PPL-R46、PPL-R52、PPL-AC40）', async () => {
    const { chen } = await demoRoster();
    const { participants } = await okJson(
      await create({ kind: 'EMPLOYEE', employeeId: chen.id, dependent: { relation: '子女', childSeat: true } }),
      participantsResultSchema,
    );

    const host = await registrationOf(chen.id);
    expect(host).toMatchObject({ kind: 'EMPLOYEE', tableId: null, childSeat: false });
    const dependent = await dependentOfHost(host.id);
    expect(dependent).toMatchObject({
      kind: 'DEPENDENT',
      employeeId: null,
      relation: '子女',
      childSeat: true,
      vegetarian: false,
      tableId: null,
      seatOrder: null,
    });
    expect(participants.map((p) => p.id).sort(byNumber)).toEqual([host.id, dependent?.id ?? -1].sort(byNumber));
  });

  it('同時加的眷屬沒填稱謂：稱謂空白（PPL-R05）', async () => {
    const { chen } = await demoRoster();
    await okJson(await create({ kind: 'EMPLOYEE', employeeId: chen.id, dependent: {} }), participantsResultSchema);
    const host = await registrationOf(chen.id);
    expect(await dependentOfHost(host.id)).toMatchObject({ kind: 'DEPENDENT', relation: null });
  });

  it('選了桌次：入座那一桌，排在名單最後（PPL-R56）', async () => {
    const { chen } = await demoRoster();
    const seated = await fillTable(3, 2);
    await okJson(await create({ kind: 'EMPLOYEE', employeeId: chen.id, tableId: 3 }), participantsResultSchema);
    const host = await registrationOf(chen.id);
    expect(await seatedIds(3)).toEqual([...seated, host.id]);
    expect(await seatOrdersAt(3)).toEqual(contiguous(3));
  });

  it('同時加眷屬並選了桌次：兩人入座同一桌，員工在前、眷屬緊接在後（PPL-R57、PPL-AC41）', async () => {
    const { chen } = await demoRoster();
    const seated = await fillTable(3, 5);
    await okJson(
      await create({ kind: 'EMPLOYEE', employeeId: chen.id, tableId: 3, dependent: { relation: '配偶' } }),
      participantsResultSchema,
    );
    const host = await registrationOf(chen.id);
    const dependent = await dependentOfHost(host.id);
    expect(await seatedIds(3)).toEqual([...seated, host.id, dependent?.id]);
    expect(await seatOrdersAt(3)).toEqual(contiguous(7));
  });

  it('桌次只剩 1 位：員工入座、眷屬留在未入座，仍然成功（PPL-R57、PPL-AC42）', async () => {
    const { chen } = await demoRoster();
    await fillTable(3, 9);
    await okJson(
      await create({ kind: 'EMPLOYEE', employeeId: chen.id, tableId: 3, dependent: {} }),
      participantsResultSchema,
    );
    const host = await registrationOf(chen.id);
    expect(host).toMatchObject({ tableId: 3, seatOrder: 9 });
    expect(await dependentOfHost(host.id)).toMatchObject({ tableId: null, seatOrder: null });
    expect(await countAt(3)).toBe(10);
  });

  it('桌次已滿：409 TABLE_FULL，員工與眷屬都沒有新增（PPL-R56、COM-R07、PPL-AC43）', async () => {
    const { chen } = await demoRoster();
    await fillTable(4, 10);
    const before = await snapshot();
    expect(
      await errorOf(await create({ kind: 'EMPLOYEE', employeeId: chen.id, tableId: 4, dependent: {} })),
    ).toMatchObject({ status: 409, code: 'TABLE_FULL' });
    expect(await snapshot()).toEqual(before);
  });

  it('兩人同時搶同一桌的最後一個位子：只有一人入座，另一個 409 TABLE_FULL，桌上剛好 10 位（docs/architecture.md 第 7.2 節）', async () => {
    const a = await createEmployee({ name: '測試員工甲', department: '研發一部' });
    const b = await createEmployee({ name: '測試員工乙', department: '研發一部' });
    await fillTable(5, 9);

    const results = await Promise.all([
      create({ kind: 'EMPLOYEE', employeeId: a.id, tableId: 5 }),
      create({ kind: 'EMPLOYEE', employeeId: b.id, tableId: 5 }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await errorOf(single(results.filter((r) => !r.ok)))).toMatchObject({ status: 409, code: 'TABLE_FULL' });
    expect(await countAt(5)).toBe(10);
    expect(await seatOrdersAt(5)).toEqual(contiguous(10));
    expect(await prisma.participant.count({ where: { employeeId: { in: [a.id, b.id] } } })).toBe(1);
  });

  it('勾工作人員：放進工作人員桌、排在最後；同時加的眷屬留在未入座（PPL-R10、PPL-R53、PPL-AC44）', async () => {
    const { chen } = await demoRoster();
    const staff = await fillStaff(3);
    await okJson(
      await create({ kind: 'EMPLOYEE', employeeId: chen.id, isStaff: true, dependent: {} }),
      participantsResultSchema,
    );
    const host = await registrationOf(chen.id);
    expect(host).toMatchObject({ tableId: STAFF_TABLE_ID, seatOrder: 3 });
    expect(await seatedIds(STAFF_TABLE_ID)).toEqual([...staff, host.id]);
    expect(await dependentOfHost(host.id)).toMatchObject({ tableId: null, seatOrder: null });
  });

  it('工作人員桌有 9 位：還可以放第 10 位（PPL-R10）', async () => {
    const { chen } = await demoRoster();
    await fillStaff(9);
    await okJson(await create({ kind: 'EMPLOYEE', employeeId: chen.id, isStaff: true }), participantsResultSchema);
    expect(await countAt(STAFF_TABLE_ID)).toBe(10);
  });

  it('工作人員桌已有 10 位：409 STAFF_TABLE_FULL，沒有新增（PPL-R54、PPL-AC45）', async () => {
    const { chen } = await demoRoster();
    await fillStaff(10);
    const before = await snapshot();
    expect(await errorOf(await create({ kind: 'EMPLOYEE', employeeId: chen.id, isStaff: true }))).toMatchObject({
      status: 409,
      code: 'STAFF_TABLE_FULL',
    });
    expect(await snapshot()).toEqual(before);
  });
});

describe('POST /api/participants：眷屬', () => {
  it('所屬員工是已報名的員工：新增眷屬，稱謂、兒童椅、素食、備註照存，沒有本名（PPL-R04、PPL-R05、PPL-R09、PPL-AC49）', async () => {
    const { wang } = await demoRoster();
    const { participants } = await okJson(
      await create({
        kind: 'DEPENDENT',
        hostId: wang.participant.id,
        relation: '配偶',
        childSeat: true,
        vegetarian: true,
        note: '靠走道',
      }),
      participantsResultSchema,
    );
    expect(single(participants)).toMatchObject({
      kind: 'DEPENDENT',
      hostId: wang.participant.id,
      employeeId: null,
      guestName: null,
      relation: '配偶',
      childSeat: true,
      vegetarian: true,
      note: '靠走道',
      tableId: null,
    });
    expect(await dependentOfHost(wang.participant.id)).toMatchObject({ kind: 'DEPENDENT', relation: '配偶' });
  });

  it('選了桌次：入座那一桌，排在最後（PPL-R56）', async () => {
    const { wang } = await demoRoster();
    const seated = await fillTable(6, 3);
    await okJson(await create({ kind: 'DEPENDENT', hostId: wang.participant.id, tableId: 6 }), participantsResultSchema);
    const dependent = await dependentOfHost(wang.participant.id);
    expect(await seatedIds(6)).toEqual([...seated, dependent?.id]);
  });

  it('桌次已滿：409 TABLE_FULL，沒有新增（PPL-R56）', async () => {
    const { wang } = await demoRoster();
    await fillTable(6, 10);
    const before = await snapshot();
    expect(await errorOf(await create({ kind: 'DEPENDENT', hostId: wang.participant.id, tableId: 6 }))).toMatchObject({
      status: 409,
      code: 'TABLE_FULL',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('所屬員工已經有一位眷屬：409 DEPENDENT_EXISTS，沒有新增（PPL-R04、PPL-R49、PPL-AC50）', async () => {
    const { wang } = await demoRoster();
    await createDependent(wang.participant.id, { relation: '配偶' });
    const before = await snapshot();
    expect(await errorOf(await create({ kind: 'DEPENDENT', hostId: wang.participant.id }))).toMatchObject({
      status: 409,
      code: 'DEPENDENT_EXISTS',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('兩個請求同時替同一位員工新增眷屬：只新增一位，另一個 409 DEPENDENT_EXISTS（PPL-R04）', async () => {
    const { wang } = await demoRoster();
    const body = { kind: 'DEPENDENT', hostId: wang.participant.id };
    const results = await Promise.all([create(body), create(body)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await errorOf(single(results.filter((r) => !r.ok)))).toMatchObject({
      status: 409,
      code: 'DEPENDENT_EXISTS',
    });
    expect(await prisma.participant.count({ where: { hostId: wang.participant.id } })).toBe(1);
  });

  it.each(['外部貴賓', '眷屬'] as const)('所屬員工選到%s（不是報名的員工）：不新增（PPL-R04）', async (kind) => {
    const { wang } = await demoRoster();
    const notEmployee =
      kind === '外部貴賓'
        ? await createGuest({ guestName: '林董' })
        : await createDependent(wang.participant.id, { relation: '配偶' });
    const before = await snapshot();
    const res = await create({ kind: 'DEPENDENT', hostId: notEmployee.id });
    expect(res.ok).toBe(false);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await snapshot()).toEqual(before);
  });

  it('所屬員工已被別人取消報名（不存在）：404 NOT_FOUND（COM-R07）', async () => {
    await demoRoster();
    expect(await errorOf(await create({ kind: 'DEPENDENT', hostId: 999_999 }))).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(await prisma.participant.count({ where: { kind: 'DEPENDENT' } })).toBe(0);
  });

  it('沒選所屬員工：400 VALIDATION_FAILED，「請選擇所屬員工。」（PPL-R59、PPL-AC54）', async () => {
    expect(await errorOf(await create({ kind: 'DEPENDENT' }))).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      fields: { hostId: '請選擇所屬員工。' },
    });
  });
});

describe('POST /api/participants：外部貴賓', () => {
  it('姓名填「貴賓席」、單位／頭銜空白也可以新增（PPL-R06、PPL-R51、PPL-AC55）', async () => {
    const { participants } = await okJson(await create({ kind: 'GUEST', guestName: '貴賓席' }), participantsResultSchema);
    expect(single(participants)).toMatchObject({
      kind: 'GUEST',
      guestName: '貴賓席',
      organization: null,
      employeeId: null,
      hostId: null,
      tableId: null,
    });
    expect(await prisma.participant.count({ where: { kind: 'GUEST', guestName: '貴賓席' } })).toBe(1);
  });

  it('單位／頭銜、兒童椅、素食、備註照存（PPL-R06、PPL-R09、PPL-R11、PPL-AC02）', async () => {
    await okJson(
      await create({
        kind: 'GUEST',
        guestName: '林董',
        organization: '○○科技 董事長',
        childSeat: true,
        vegetarian: true,
        note: '需要靠走道',
      }),
      participantsResultSchema,
    );
    expect(await prisma.participant.findFirst({ where: { guestName: '林董' } })).toMatchObject({
      kind: 'GUEST',
      organization: '○○科技 董事長',
      childSeat: true,
      vegetarian: true,
      note: '需要靠走道',
      employeeId: null,
    });
  });

  it('姓名空白：400 VALIDATION_FAILED，「請輸入姓名。」，沒有新增（PPL-R51、PPL-R59、PPL-AC54）', async () => {
    expect(await errorOf(await create({ kind: 'GUEST', guestName: '  ' }))).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      fields: { guestName: '請輸入姓名。' },
    });
    expect(await prisma.participant.count()).toBe(0);
  });

  it('選了桌次就入座，排在最後；桌次已滿時 409 TABLE_FULL（PPL-R56）', async () => {
    const seated = await fillTable(8, 9);
    const { participants } = await okJson(
      await create({ kind: 'GUEST', guestName: '林董', tableId: 8 }),
      participantsResultSchema,
    );
    expect(await seatedIds(8)).toEqual([...seated, single(participants).id]);

    expect(await errorOf(await create({ kind: 'GUEST', guestName: '貴賓席', tableId: 8 }))).toMatchObject({
      status: 409,
      code: 'TABLE_FULL',
    });
    expect(await prisma.participant.count({ where: { guestName: '貴賓席' } })).toBe(0);
  });

  it('帶了「工作人員」也不會放進工作人員桌（PPL-R10：只有員工可以標為工作人員）', async () => {
    await create({ kind: 'GUEST', guestName: '林董', isStaff: true });
    expect(await countAt(STAFF_TABLE_ID)).toBe(0);
  });
});

describe('POST /api/participants：輸入格式', () => {
  it('類別不是員工、眷屬、外部貴賓：400 VALIDATION_FAILED（PPL-R01）', async () => {
    expect(await errorOf(await create({ kind: 'VIP', guestName: '林董' }))).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
    });
  });

  it('桌次不在 1–30：400 VALIDATION_FAILED', async () => {
    expect(await errorOf(await create({ kind: 'GUEST', guestName: '林董', tableId: 31 }))).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
    });
  });

  it('本體不是 JSON：400 VALIDATION_FAILED', async () => {
    const res = await POST(new Request(BASE, { method: 'POST', body: 'not json' }), { params: Promise.resolve({}) });
    expect(await errorOf(res)).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });
});

describe('PATCH /api/participants/{id}：兒童椅、素食、備註', () => {
  it('外部貴賓勾素食：儲存，其他欄位與座位不變（PPL-R52、PPL-R60、PPL-AC57）', async () => {
    const lin = await createGuest({ guestName: '林董', organization: '○○科技 董事長', childSeat: true });
    await seatAt(5, lin.id);
    const { participants } = await okJson(await edit(lin.id, { vegetarian: true }), participantsResultSchema);
    expect(participants.find((p) => p.id === lin.id)).toMatchObject({ vegetarian: true });
    expect(await findP(lin.id)).toMatchObject({
      kind: 'GUEST',
      guestName: '林董',
      organization: '○○科技 董事長',
      childSeat: true,
      vegetarian: true,
      tableId: 5,
      seatOrder: 0,
    });
  });

  it('員工改兒童椅、素食與備註（PPL-R02、PPL-R09、PPL-R11）', async () => {
    const { wang } = await demoRoster();
    await okJson(
      await edit(wang.participant.id, { childSeat: true, vegetarian: true, note: '需要靠走道' }),
      participantsResultSchema,
    );
    expect(await findP(wang.participant.id)).toMatchObject({ childSeat: true, vegetarian: true, note: '需要靠走道' });
  });

  it('備註清空：存成沒有備註', async () => {
    const lin = await createGuest({ guestName: '林董', note: '舊備註' });
    await okJson(await edit(lin.id, { note: '' }), participantsResultSchema);
    expect(await findP(lin.id)).toMatchObject({ note: null });
  });

  it('不能從參與人員修改員工的姓名、部門、分機（PPL-R02）', async () => {
    const { wang } = await demoRoster();
    await edit(wang.participant.id, { name: '王曉明', department: '業務部', extension: '9999' });
    expect(await prisma.employee.findUnique({ where: { id: wang.employee.id } })).toMatchObject({
      name: '王小明',
      department: '研發一部',
      extension: '1234',
    });
  });

  it('眷屬只改備註，所屬員工不變也可以儲存：自己不算「已經有一位」（PPL-R11、PPL-R49、PPL-AC51）', async () => {
    const { wang } = await demoRoster();
    const dependent = await createDependent(wang.participant.id, { relation: '配偶' });
    await okJson(
      await edit(dependent.id, { hostId: wang.participant.id, relation: '配偶', note: '新的備註' }),
      participantsResultSchema,
    );
    expect(await findP(dependent.id)).toMatchObject({ hostId: wang.participant.id, relation: '配偶', note: '新的備註' });
  });
});

describe('PATCH /api/participants/{id}：眷屬的所屬員工', () => {
  it('改成另一位已報名、沒有眷屬的員工：所屬員工跟著變，原本的員工不再有眷屬（PPL-R13、PPL-AC52）', async () => {
    const { wang, lee } = await demoRoster();
    const dependent = await createDependent(wang.participant.id);
    await okJson(await edit(dependent.id, { hostId: lee.participant.id }), participantsResultSchema);
    expect(await findP(dependent.id)).toMatchObject({ kind: 'DEPENDENT', hostId: lee.participant.id });
    expect(await dependentOfHost(wang.participant.id)).toBeNull();
    // 王小明不再有眷屬，可以再替他新增一位
    await okJson(await create({ kind: 'DEPENDENT', hostId: wang.participant.id }), participantsResultSchema);
  });

  it('改到已經有眷屬的員工：409 DEPENDENT_EXISTS，不變（PPL-R49）', async () => {
    const { wang, lee } = await demoRoster();
    const mine = await createDependent(wang.participant.id);
    await createDependent(lee.participant.id);
    const before = await snapshot();
    expect(await errorOf(await edit(mine.id, { hostId: lee.participant.id }))).toMatchObject({
      status: 409,
      code: 'DEPENDENT_EXISTS',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('改到不是報名員工的參與人員（外部貴賓）：不儲存（PPL-R04）', async () => {
    const { wang } = await demoRoster();
    const dependent = await createDependent(wang.participant.id);
    const lin = await createGuest({ guestName: '林董' });
    const before = await snapshot();
    const res = await edit(dependent.id, { hostId: lin.id });
    expect(res.ok).toBe(false);
    expect(await snapshot()).toEqual(before);
  });
});

describe('PATCH /api/participants/{id}：工作人員（PPL-R10、PPL-R53～R55、PPL-Q08）', () => {
  it('已入座的員工改成工作人員：移到工作人員桌最後，原桌空出、其他人順序不變，眷屬留在原桌（PPL-R55、PPL-AC46）', async () => {
    const { wang } = await demoRoster();
    const dependent = await createDependent(wang.participant.id);
    const [first] = await fillTable(3, 1);
    await seatAt(3, wang.participant.id, dependent.id);
    const [last] = await fillTable(3, 1);
    const staff = await fillStaff(2);
    // B4 桌（內部編號 3）：佔位甲、王小明、王小明_眷屬、佔位乙

    const { participants } = await okJson(await edit(wang.participant.id, { isStaff: true }), participantsResultSchema);

    expect(participants.find((p) => p.id === wang.participant.id)).toMatchObject({ tableId: STAFF_TABLE_ID });
    expect(await seatedIds(STAFF_TABLE_ID)).toEqual([...staff, wang.participant.id]);
    expect(await seatedIds(3)).toEqual([first, dependent.id, last]);
    expect(await seatOrdersAt(3)).toEqual(contiguous(3));
    expect(await findP(dependent.id)).toMatchObject({ tableId: 3 });
  });

  it('工作人員桌已有 10 位：409 STAFF_TABLE_FULL，不變（PPL-R54、PPL-AC45）', async () => {
    const { wang } = await demoRoster();
    await seatAt(3, wang.participant.id);
    await fillStaff(10);
    const before = await snapshot();
    expect(await errorOf(await edit(wang.participant.id, { isStaff: true }))).toMatchObject({
      status: 409,
      code: 'STAFF_TABLE_FULL',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('已經是工作人員：工作人員桌已滿時仍可以編輯其他欄位（PPL-R54、PPL-AC45）', async () => {
    const staff = await fillStaff(10);
    const [someone] = staff;
    if (someone === undefined) throw new Error('沒有工作人員');
    await okJson(await edit(someone, { isStaff: true, note: '負責報到' }), participantsResultSchema);
    expect(await findP(someone)).toMatchObject({ tableId: STAFF_TABLE_ID, seatOrder: 0, note: '負責報到' });
    expect(await countAt(STAFF_TABLE_ID)).toBe(10);
  });

  it('勾「工作人員」又帶了桌次：忽略桌次，放進工作人員桌（src/contracts/participants.ts）', async () => {
    const { wang } = await demoRoster();
    await okJson(await edit(wang.participant.id, { isStaff: true, tableId: 5 }), participantsResultSchema);
    expect(await findP(wang.participant.id)).toMatchObject({ tableId: STAFF_TABLE_ID });
    expect(await countAt(5)).toBe(0);
  });

  it('取消勾選工作人員、沒有選桌次：變成未入座，工作人員桌其他人的順序不變（PPL-Q08）', async () => {
    const [s1] = await fillStaff(1);
    const { participant } = await createRegisteredEmployee({ name: '測試工作人員', department: '總務部' });
    await seatAt(STAFF_TABLE_ID, participant.id);
    const [s2] = await fillStaff(1);

    await okJson(await edit(participant.id, { isStaff: false }), participantsResultSchema);

    expect(await findP(participant.id)).toMatchObject({ tableId: null, seatOrder: null });
    expect(await seatedIds(STAFF_TABLE_ID)).toEqual([s1, s2]);
    expect(await seatOrdersAt(STAFF_TABLE_ID)).toEqual(contiguous(2));
  });

  it('取消勾選工作人員並選了桌次：入座那一桌，排在最後（PPL-Q08）', async () => {
    const [staffer] = await fillStaff(1);
    if (staffer === undefined) throw new Error('沒有工作人員');
    const seated = await fillTable(7, 2);
    await okJson(await edit(staffer, { isStaff: false, tableId: 7 }), participantsResultSchema);
    expect(await seatedIds(7)).toEqual([...seated, staffer]);
    expect(await countAt(STAFF_TABLE_ID)).toBe(0);
  });

  it('取消勾選工作人員、選的桌次已滿：409 TABLE_FULL，仍是工作人員', async () => {
    const [staffer] = await fillStaff(1);
    if (staffer === undefined) throw new Error('沒有工作人員');
    await fillTable(7, 10);
    const before = await snapshot();
    expect(await errorOf(await edit(staffer, { isStaff: false, tableId: 7 }))).toMatchObject({
      status: 409,
      code: 'TABLE_FULL',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('眷屬與外部貴賓不能標為工作人員：409 STAFF_EMPLOYEE_ONLY，不變（PPL-R10）', async () => {
    const { wang } = await demoRoster();
    const dependent = await createDependent(wang.participant.id);
    const lin = await createGuest({ guestName: '林董' });
    const before = await snapshot();
    for (const id of [dependent.id, lin.id]) {
      expect(await errorOf(await edit(id, { isStaff: true }))).toMatchObject({
        status: 409,
        code: 'STAFF_EMPLOYEE_ONLY',
      });
    }
    expect(await snapshot()).toEqual(before);
    expect(await countAt(STAFF_TABLE_ID)).toBe(0);
  });
});

describe('PATCH /api/participants/{id}：桌次（PPL-Q08）', () => {
  it('改到另一桌：排在新桌最後；原桌其他人的順序不變', async () => {
    const { wang } = await demoRoster();
    const [a] = await fillTable(3, 1);
    await seatAt(3, wang.participant.id);
    const [b] = await fillTable(3, 1);
    const [c] = await fillTable(5, 1);

    await okJson(await edit(wang.participant.id, { tableId: 5 }), participantsResultSchema);

    expect(await seatedIds(5)).toEqual([c, wang.participant.id]);
    expect(await seatedIds(3)).toEqual([a, b]);
    expect(await seatOrdersAt(3)).toEqual(contiguous(2));
  });

  it('改回未入座：原桌其他人的順序不變', async () => {
    const lin = await createGuest({ guestName: '林董' });
    await seatAt(5, lin.id);
    const [after] = await fillTable(5, 1);
    await okJson(await edit(lin.id, { tableId: null }), participantsResultSchema);
    expect(await findP(lin.id)).toMatchObject({ tableId: null, seatOrder: null });
    expect(await seatedIds(5)).toEqual([after]);
    expect(await seatOrdersAt(5)).toEqual(contiguous(1));
  });

  it('改到已滿的桌次：409 TABLE_FULL，不變', async () => {
    const lin = await createGuest({ guestName: '林董' });
    await fillTable(4, 10);
    const before = await snapshot();
    expect(await errorOf(await edit(lin.id, { tableId: 4 }))).toMatchObject({ status: 409, code: 'TABLE_FULL' });
    expect(await snapshot()).toEqual(before);
  });

  it('自己目前所在的桌次不算已滿：坐在已滿的 B7 桌（內部編號 4），桌次仍是 B7 桌並改備註，可以儲存，位置不變', async () => {
    await fillTable(4, 3);
    const lin = await createGuest({ guestName: '林董' });
    await seatAt(4, lin.id);
    await fillTable(4, 6);
    expect(await countAt(4)).toBe(10);

    await okJson(await edit(lin.id, { tableId: 4, note: '靠走道' }), participantsResultSchema);

    expect(await findP(lin.id)).toMatchObject({ tableId: 4, seatOrder: 3, note: '靠走道' });
    expect(await countAt(4)).toBe(10);
  });
});

describe('PATCH /api/participants/{id}：變更類別（PPL-Q07 的目前假設）', () => {
  it('員工（沒有眷屬）改成外部貴賓：變成未報名；兒童椅、素食、備註與座位保留（PPL-Q07）', async () => {
    const { lee } = await demoRoster();
    await prisma.participant.update({
      where: { id: lee.participant.id },
      data: { childSeat: true, vegetarian: true, note: '靠走道' },
    });
    await fillTable(3, 1);
    await seatAt(3, lee.participant.id);

    await okJson(
      await edit(lee.participant.id, { kind: 'GUEST', guestName: '林董', organization: '○○科技 董事長' }),
      participantsResultSchema,
    );

    expect(await findP(lee.participant.id)).toMatchObject({
      kind: 'GUEST',
      employeeId: null,
      guestName: '林董',
      organization: '○○科技 董事長',
      childSeat: true,
      vegetarian: true,
      note: '靠走道',
      tableId: 3,
      seatOrder: 1,
    });
    // 李美華變成未報名，之後可以再加入尾牙
    expect(await prisma.participant.findUnique({ where: { employeeId: lee.employee.id } })).toBeNull();
    await okJson(await create({ kind: 'EMPLOYEE', employeeId: lee.employee.id }), participantsResultSchema);
  });

  it('員工（沒有眷屬）改成眷屬：變成未報名，所屬員工是選的員工，座位保留（PPL-Q07）', async () => {
    const { wang, lee } = await demoRoster();
    await seatAt(5, lee.participant.id);
    await okJson(
      await edit(lee.participant.id, { kind: 'DEPENDENT', hostId: wang.participant.id, relation: '配偶' }),
      participantsResultSchema,
    );
    expect(await findP(lee.participant.id)).toMatchObject({
      kind: 'DEPENDENT',
      employeeId: null,
      hostId: wang.participant.id,
      relation: '配偶',
      tableId: 5,
      seatOrder: 0,
    });
  });

  it('外部貴賓改成員工：選一位還沒報名的員工；只保留新類別的欄位，素食與座位保留（PPL-Q07）', async () => {
    const { chen } = await demoRoster();
    const lin = await createGuest({ guestName: '林董', organization: '○○科技 董事長', vegetarian: true });
    await seatAt(5, lin.id);
    await okJson(await edit(lin.id, { kind: 'EMPLOYEE', employeeId: chen.id }), participantsResultSchema);
    expect(await findP(lin.id)).toMatchObject({
      kind: 'EMPLOYEE',
      employeeId: chen.id,
      guestName: null,
      organization: null,
      vegetarian: true,
      tableId: 5,
      seatOrder: 0,
    });
  });

  it('外部貴賓改成眷屬：選已報名的員工；姓名與單位不再保留（PPL-Q07）', async () => {
    const { wang } = await demoRoster();
    const lin = await createGuest({ guestName: '林董', organization: '○○科技 董事長' });
    await okJson(await edit(lin.id, { kind: 'DEPENDENT', hostId: wang.participant.id }), participantsResultSchema);
    expect(await findP(lin.id)).toMatchObject({
      kind: 'DEPENDENT',
      hostId: wang.participant.id,
      guestName: null,
      organization: null,
    });
  });

  it('眷屬改成外部貴賓：不再是所屬員工的眷屬，稱謂不再保留（PPL-Q07）', async () => {
    const { wang } = await demoRoster();
    const dependent = await createDependent(wang.participant.id, { relation: '配偶', childSeat: true });
    await okJson(await edit(dependent.id, { kind: 'GUEST', guestName: '貴賓席' }), participantsResultSchema);
    expect(await findP(dependent.id)).toMatchObject({
      kind: 'GUEST',
      hostId: null,
      relation: null,
      guestName: '貴賓席',
      childSeat: true,
    });
    expect(await dependentOfHost(wang.participant.id)).toBeNull();
  });

  it('改成員工、選的員工已報名：409 DUPLICATE_PARTICIPANT，不變（PPL-R03、PPL-Q07）', async () => {
    const { wang } = await demoRoster();
    const lin = await createGuest({ guestName: '林董' });
    const before = await snapshot();
    expect(await errorOf(await edit(lin.id, { kind: 'EMPLOYEE', employeeId: wang.employee.id }))).toMatchObject({
      status: 409,
      code: 'DUPLICATE_PARTICIPANT',
    });
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ['員工', { kind: 'EMPLOYEE' }, { employeeId: '請選擇員工。' }],
    ['眷屬', { kind: 'DEPENDENT' }, { hostId: '請選擇所屬員工。' }],
  ] as const)('改成%s卻沒選必填的人：400 VALIDATION_FAILED，欄位錯誤（PPL-R59）', async (_name, body, fields) => {
    const lin = await createGuest({ guestName: '林董' });
    const before = await snapshot();
    expect(await errorOf(await edit(lin.id, body))).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', fields });
    expect(await snapshot()).toEqual(before);
  });

  it('改成外部貴賓卻沒填姓名：400 VALIDATION_FAILED，「請輸入姓名。」（PPL-R51、PPL-R59）', async () => {
    const { lee } = await demoRoster();
    const before = await snapshot();
    expect(await errorOf(await edit(lee.participant.id, { kind: 'GUEST' }))).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      fields: { guestName: '請輸入姓名。' },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('有眷屬的員工不能變更類別：409，不變（PPL-R58、PPL-Q07）', async () => {
    const { wang } = await demoRoster();
    await createDependent(wang.participant.id);
    const before = await snapshot();
    const error = await errorOf(await edit(wang.participant.id, { kind: 'GUEST', guestName: '林董' }));
    expect(error.status).toBe(409);
    expect(['DEPENDENT_EXISTS', 'CONFLICT']).toContain(error.code);
    expect(await snapshot()).toEqual(before);
  });
});

// D-018：拖移與「加入人員」可以讓一桌、工作人員桌有 11、12 位；人員對話框的桌次欄位與「工作人員」勾選仍到 10 位為止
// （seating.md SEAT-R42、SEAT-R88、SEAT-AC94、SEAT-AC95；participants.md PPL-R54、PPL-R56）。
describe('D-018 人員對話框的桌次與工作人員仍到 10 位為止', () => {
  it.each([11, 12])('POST 員工選了有 %i 位的桌次：409 TABLE_FULL，員工與眷屬都沒有新增（SEAT-AC94）', async (n) => {
    const { chen } = await demoRoster();
    await fillTable(4, n);
    const before = await snapshot();
    expect(
      await errorOf(await create({ kind: 'EMPLOYEE', employeeId: chen.id, tableId: 4, dependent: {} })),
    ).toMatchObject({ status: 409, code: 'TABLE_FULL' });
    expect(await snapshot()).toEqual(before);
  });

  it('POST 眷屬、外部貴賓選了有 11 位的桌次：409 TABLE_FULL，沒有新增', async () => {
    const { wang } = await demoRoster();
    await fillTable(6, 11);
    const before = await snapshot();
    expect(await errorOf(await create({ kind: 'DEPENDENT', hostId: wang.participant.id, tableId: 6 }))).toMatchObject({
      status: 409,
      code: 'TABLE_FULL',
    });
    expect(await errorOf(await create({ kind: 'GUEST', guestName: '林董', tableId: 6 }))).toMatchObject({
      status: 409,
      code: 'TABLE_FULL',
    });
    expect(await snapshot()).toEqual(before);
  });

  it.each([10, 11, 12])('POST 勾「工作人員」、工作人員桌已有 %i 位：409 STAFF_TABLE_FULL，沒有新增（PPL-R54、SEAT-AC95）', async (n) => {
    const { chen } = await demoRoster();
    await fillStaff(n);
    const before = await snapshot();
    expect(await errorOf(await create({ kind: 'EMPLOYEE', employeeId: chen.id, isStaff: true }))).toMatchObject({
      status: 409,
      code: 'STAFF_TABLE_FULL',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('PATCH 改到有 11 位的桌次：409 TABLE_FULL，不變', async () => {
    const lin = await createGuest({ guestName: '林董' });
    await fillTable(4, 11);
    const before = await snapshot();
    expect(await errorOf(await edit(lin.id, { tableId: 4 }))).toMatchObject({ status: 409, code: 'TABLE_FULL' });
    expect(await snapshot()).toEqual(before);
  });

  it('PATCH 已入座的員工改成工作人員、工作人員桌已有 11 位：409 STAFF_TABLE_FULL，不變（PPL-R54）', async () => {
    const { wang } = await demoRoster();
    await seatAt(3, wang.participant.id);
    await fillStaff(11);
    const before = await snapshot();
    expect(await errorOf(await edit(wang.participant.id, { isStaff: true }))).toMatchObject({
      status: 409,
      code: 'STAFF_TABLE_FULL',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('自己所在的 12 位桌次不算已滿：桌次仍是那一桌並改備註，可以儲存，位置不變', async () => {
    await fillTable(4, 5);
    const lin = await createGuest({ guestName: '林董' });
    await seatAt(4, lin.id);
    await fillTable(4, 6);
    expect(await countAt(4)).toBe(12);

    await okJson(await edit(lin.id, { tableId: 4, note: '靠走道' }), participantsResultSchema);

    expect(await findP(lin.id)).toMatchObject({ tableId: 4, seatOrder: 5, note: '靠走道' });
    expect(await countAt(4)).toBe(12);
  });

  it('已經是工作人員：工作人員桌有 12 位時仍可以編輯其他欄位，仍在工作人員桌', async () => {
    const staff = await fillStaff(12);
    const [someone] = staff;
    if (someone === undefined) throw new Error('沒有工作人員');
    await okJson(await edit(someone, { isStaff: true, note: '負責報到' }), participantsResultSchema);
    expect(await findP(someone)).toMatchObject({ tableId: STAFF_TABLE_ID, note: '負責報到' });
    expect(await countAt(STAFF_TABLE_ID)).toBe(12);
  });
});

describe('PATCH /api/participants/{id}：找不到或格式不對', () => {
  it('這個人已被別人刪除：404 NOT_FOUND（COM-R07、COM-AC05）', async () => {
    const lin = await createGuest({ guestName: '林董' });
    await prisma.participant.delete({ where: { id: lin.id } });
    expect(await errorOf(await edit(lin.id, { vegetarian: true }))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('桌次不在 1–30：400 VALIDATION_FAILED，不變', async () => {
    const lin = await createGuest({ guestName: '林董' });
    expect(await errorOf(await edit(lin.id, { tableId: 31 }))).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(await findP(lin.id)).toMatchObject({ tableId: null });
  });
});

describe('DELETE /api/participants/{id}', () => {
  it('取消報名：員工與眷屬一併移除，座位空出來、同桌其他人順序不變；員工名單不變（PPL-R14、PPL-R18、PPL-AC30）', async () => {
    const { wang } = await demoRoster();
    const dependent = await createDependent(wang.participant.id);
    const [a] = await fillTable(3, 1);
    await seatAt(3, wang.participant.id);
    const [b] = await fillTable(3, 1);
    await seatAt(3, dependent.id);
    const [c] = await fillTable(3, 1);
    // B4 桌（3）：甲、王小明、乙、王小明_眷屬、丙

    const result = await okJson(await remove(wang.participant.id), participantDeleteResultSchema);

    expect([...result.removedIds].sort(byNumber)).toEqual([wang.participant.id, dependent.id].sort(byNumber));
    expect(await findP(wang.participant.id)).toBeNull();
    expect(await findP(dependent.id)).toBeNull();
    expect(await seatedIds(3)).toEqual([a, b, c]);
    expect(await seatOrdersAt(3)).toEqual(contiguous(3));
    // 回應帶回因此改變桌內順序的人
    expect(result.participants.map((p) => p.id)).toEqual(expect.arrayContaining([b, c]));
    // 員工名單不受影響
    expect(await prisma.employee.findUnique({ where: { id: wang.employee.id } })).toMatchObject({
      name: '王小明',
      department: '研發一部',
      extension: '1234',
    });
  });

  it('取消報名後，這位員工可以再加入尾牙（PPL-R14、PPL-AC33）', async () => {
    const { wang } = await demoRoster();
    await okJson(await remove(wang.participant.id), participantDeleteResultSchema);
    await okJson(await create({ kind: 'EMPLOYEE', employeeId: wang.employee.id }), participantsResultSchema);
    expect(await registrationOf(wang.employee.id)).toMatchObject({ kind: 'EMPLOYEE', tableId: null });
  });

  it('取消工作人員的報名：工作人員桌空出一位，其他人順序不變（PPL-R14、PPL-AC32）', async () => {
    const [s1] = await fillStaff(1);
    const { participant } = await createRegisteredEmployee({ name: '測試工作人員', department: '總務部' });
    await seatAt(STAFF_TABLE_ID, participant.id);
    const [s2] = await fillStaff(1);
    expect(await countAt(STAFF_TABLE_ID)).toBe(3);

    await okJson(await remove(participant.id), participantDeleteResultSchema);

    expect(await seatedIds(STAFF_TABLE_ID)).toEqual([s1, s2]);
    expect(await seatOrdersAt(STAFF_TABLE_ID)).toEqual(contiguous(2));
  });

  it('工作人員的眷屬坐在一般桌：取消報名時一併移除，那一桌空出來（PPL-R10、PPL-R14）', async () => {
    const { participant: staffer } = await createRegisteredEmployee({ name: '測試工作人員', department: '總務部' });
    await seatAt(STAFF_TABLE_ID, staffer.id);
    const dependent = await createDependent(staffer.id);
    const [a] = await fillTable(7, 1);
    await seatAt(7, dependent.id);
    const [b] = await fillTable(7, 1);

    const result = await okJson(await remove(staffer.id), participantDeleteResultSchema);

    expect([...result.removedIds].sort(byNumber)).toEqual([staffer.id, dependent.id].sort(byNumber));
    expect(await seatedIds(7)).toEqual([a, b]);
    expect(await seatOrdersAt(7)).toEqual(contiguous(2));
    expect(await countAt(STAFF_TABLE_ID)).toBe(0);
  });

  it('刪除外部貴賓：從參與人員移除，同桌其他人的順序不變（PPL-R15、PPL-R18、PPL-AC34）', async () => {
    const [a] = await fillTable(5, 1);
    const lin = await createGuest({ guestName: '林董' });
    await seatAt(5, lin.id);
    const [b, c] = await fillTable(5, 2);
    // B10 桌（5）：甲、林董、乙、丙

    const result = await okJson(await remove(lin.id), participantDeleteResultSchema);

    expect(result.removedIds).toEqual([lin.id]);
    expect(await findP(lin.id)).toBeNull();
    expect(await seatedIds(5)).toEqual([a, b, c]);
    expect(await seatOrdersAt(5)).toEqual(contiguous(3));
  });

  it('刪除眷屬：所屬員工還在；之後可以再替這位員工新增眷屬（PPL-R04、PPL-R15、PPL-AC35）', async () => {
    const { wang } = await demoRoster();
    const dependent = await createDependent(wang.participant.id, { relation: '配偶' });

    const result = await okJson(await remove(dependent.id), participantDeleteResultSchema);

    expect(result.removedIds).toEqual([dependent.id]);
    expect(await findP(wang.participant.id)).not.toBeNull();
    await okJson(await create({ kind: 'DEPENDENT', hostId: wang.participant.id }), participantsResultSchema);
  });

  it('未入座的外部貴賓也可以刪除', async () => {
    const lin = await createGuest({ guestName: '林董' });
    await okJson(await remove(lin.id), participantDeleteResultSchema);
    expect(await prisma.participant.count()).toBe(0);
  });

  it('這個人已被別人刪除：404 NOT_FOUND（COM-R07）', async () => {
    const lin = await createGuest({ guestName: '林董' });
    await prisma.participant.delete({ where: { id: lin.id } });
    expect(await errorOf(await remove(lin.id))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('id 不是數字：404 NOT_FOUND', async () => {
    expect(await errorOf(await remove('abc'))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});
