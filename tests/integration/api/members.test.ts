// 權限名單 API（D-021、D-026）：
// - GET /api/members → { members: [{ id, email, role }] }，依加入先後；只有編輯者能呼叫，檢視者 403 NOT_EDITOR，沒有權限 403 NO_ACCESS。
// - POST /api/members（{ email, role }）→ 201 { member }；email 空白、格式或網域不對，或 role 缺少、不對 → 400 VALIDATION_FAILED
//   （email 的錯誤在 fields.email，文字照 permissions.md 第 4.1 節）；已在名單上（不論送來的 role）→ 409 MEMBER_EXISTS，
//   fields.email 是依名單上的權限組好的「{email} 已經是編輯者。」或「{email} 已經是檢視者。」。
// - PATCH /api/members/{id}（{ role }）→ 200 { member }；最後一位編輯者改成 VIEWER → 409 LAST_EDITOR；已被移除 → 404；
//   改成和目前相同的權限 → 200；改權限不改變清單順序（createdAt 不變）。
// - DELETE /api/members/{id} → 200 { removedId }；最後一位編輯者 → 409 LAST_EDITOR（移除檢視者不受限制）；已被移除 → 404。
// - 兩人同時把僅剩的兩位編輯者各自降級或移除：最後至少留一位編輯者（docs/architecture.md 第 9.3 節）。
// - Log：member_added（role）、member_role_changed（fromRole、toRole）、member_removed（role），都記操作者的 userId 與目標 Member id，
//   不記 email；被拒的請求由 api_request_completed 記 errorCode NOT_EDITOR 或 NO_ACCESS（第 15.2 節）。
// 規格：docs/spec/permissions.md PRM-R01、PRM-R03～R15、PRM-R35、PRM-R36；PRM-AC04～AC15、AC37～AC44 的伺服器部分；
// docs/spec/README.md AUTH-R11～R17；docs/architecture.md 第 7.1、8、8.2、9.3、11.5、15.2 節。
// 甲、乙、丙、丁是 permissions.md 第 5 節的虛構帳號；丁一律不在名單上。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, PATCH } from '@/app/api/members/[id]/route';
import { GET, POST } from '@/app/api/members/route';
import { GET as getState } from '@/app/api/state/route';
import { prisma, resetData } from '../../helpers/db';
import {
  BING,
  DING,
  JIA,
  makeViewer,
  memberEmails,
  memberIdOf,
  memberList,
  removeMember,
  roleOf,
  setMembers,
  VIEWER,
  YI,
  type MemberSeed,
  type Role,
  type TestUser,
} from '../../helpers/editors';

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn<() => Promise<TestUser | null>>() }));
vi.mock('@/server/auth', () => ({ currentUser }));

const BASE = 'http://localhost:3000/api/members';

const json = (body: unknown) => (typeof body === 'string' ? body : JSON.stringify(body));
const list = () => GET(new Request(BASE), { params: Promise.resolve({}) });
const add = (body: unknown) =>
  POST(new Request(BASE, { method: 'POST', body: json(body), headers: { 'Content-Type': 'application/json' } }), { params: Promise.resolve({}) });
const patch = (id: number | string, body: unknown) =>
  PATCH(new Request(`${BASE}/${id}`, { method: 'PATCH', body: json(body), headers: { 'Content-Type': 'application/json' } }), {
    params: Promise.resolve({ id: String(id) }),
  });
const remove = (id: number | string) => DELETE(new Request(`${BASE}/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id: String(id) }) });
const state = () => getState(new Request('http://localhost:3000/api/state'), { params: Promise.resolve({}) });

async function errorOf(res: Response) {
  const text = await res.text();
  expect(res.ok, `應該失敗，卻是 HTTP ${res.status}：${text}`).toBe(false);
  const body = JSON.parse(text) as { error: { code: string; fields?: Record<string, string> } };
  expect(Object.keys(body), '錯誤回應只有 error').toEqual(['error']);
  return { status: res.status, ...body.error };
}

type MemberJson = { id: number; email: string; role: Role };

async function listed(): Promise<MemberSeed[]> {
  const res = await list();
  expect(res.status).toBe(200);
  const body = (await res.json()) as { members: MemberJson[] };
  expect(Object.keys(body)).toEqual(['members']);
  for (const m of body.members) {
    expect(Object.keys(m).sort(), '每一列只有 id、email、role').toEqual(['email', 'id', 'role']);
    expect(typeof m.id).toBe('number');
  }
  return body.members.map((m) => ({ email: m.email, role: m.role }));
}

const as = (user: TestUser) => currentUser.mockResolvedValue(user);
const E = (user: TestUser): MemberSeed => ({ email: user.email, role: 'EDITOR' });
const V = (user: TestUser): MemberSeed => ({ email: user.email, role: 'VIEWER' });

/** 一位會被拒絕的請求之後，這個帳號下一次讀取資料的結果（AUTH-R11：下一次請求起依新的身分判斷） */
async function stateStatusAs(user: TestUser): Promise<{ status: number; code?: string }> {
  as(user);
  const res = await state();
  if (res.ok) return { status: res.status };
  return { status: res.status, code: (await errorOf(res)).code };
}

beforeEach(async () => {
  await resetData();
  currentUser.mockReset();
  // 預設：甲、乙都是編輯者（依序加入），甲登入
  await setMembers([E(JIA), E(YI)]);
  as(JIA);
});

describe('GET /api/members（PRM-R06、PRM-R07、PRM-AC04、PRM-AC14、PRM-AC44）', () => {
  it('編輯者：回傳全部帳號與各自的權限，依加入的先後排列（最早的在最上面）；每一列只有 id、email、role', async () => {
    await setMembers([E(JIA), V(YI)]);
    expect(await listed()).toEqual([E(JIA), V(YI)]);
  });

  it('新增的排在最後', async () => {
    expect((await add({ email: BING.email, role: 'VIEWER' })).status).toBe(201);
    expect(await listed()).toEqual([E(JIA), E(YI), V(BING)]);
  });

  it('檢視者：403 NOT_EDITOR，回應不含名單（PRM-AC14）', async () => {
    await setMembers([E(JIA), V(BING)]);
    as(BING);
    const res = await list();
    const text = await res.clone().text();
    const error = await errorOf(res);
    expect(error.status).toBe(403);
    expect(error.code).toBe('NOT_EDITOR');
    expect(text).not.toContain('@program.com.tw');
  });

  it('沒有權限（丁）：403 NO_ACCESS，回應不含名單（PRM-AC44）', async () => {
    as(DING);
    const res = await list();
    const text = await res.clone().text();
    const error = await errorOf(res);
    expect(error.status).toBe(403);
    expect(error.code).toBe('NO_ACCESS');
    expect(text).not.toContain('@program.com.tw');
  });
});

describe('POST /api/members：新增（PRM-R08、PRM-R09）', () => {
  it('PRM-AC05：以檢視者新增丙 → 201 { member }，權限是檢視者；加到名單最後；createdBy 是新增者的 email', async () => {
    const res = await add({ email: BING.email, role: 'VIEWER' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { member: MemberJson };
    expect(Object.keys(body)).toEqual(['member']);
    expect(body.member).toEqual({ id: await memberIdOf(BING.email), email: BING.email, role: 'VIEWER' });
    expect(await memberList()).toEqual([E(JIA), E(YI), V(BING)]);
    expect((await prisma.member.findUnique({ where: { email: BING.email } }))?.createdBy).toBe(JIA.email);
  });

  it('PRM-AC05：丙之後開啟頁面時是檢視者（讀得到資料、不能修改），不必重新登入（AUTH-R14）', async () => {
    await add({ email: BING.email, role: 'VIEWER' });
    as(BING);
    const res = await state();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { me: { isEditor: boolean } }).me).toEqual({ isEditor: false });
    expect((await errorOf(await add({ email: 'x@program.com.tw', role: 'VIEWER' }))).code).toBe('NOT_EDITOR');
  });

  it('PRM-AC37：以編輯者新增丙 → 201，權限是編輯者；丙之後開啟頁面時是編輯者，能讀權限名單', async () => {
    const res = await add({ email: BING.email, role: 'EDITOR' });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { member: MemberJson }).member).toMatchObject({ email: BING.email, role: 'EDITOR' });
    expect(await memberList()).toEqual([E(JIA), E(YI), E(BING)]);
    as(BING);
    expect(await listed()).toEqual([E(JIA), E(YI), E(BING)]);
  });

  it('email 去掉前後空白、轉小寫後儲存；回應的 email 也是轉換後的（PRM-R03、PRM-R09）', async () => {
    const res = await add({ email: ' Bing@Program.com.tw ', role: 'VIEWER' });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { member: MemberJson }).member.email).toBe(BING.email);
    expect(await memberEmails()).toEqual([JIA.email, YI.email, BING.email]);
  });

  it('不必是員工名單上的人，也不必登入過（PRM-R01）', async () => {
    expect(await prisma.employee.count()).toBe(0);
    expect((await add({ email: 'never-signed-in@program.com.tw', role: 'EDITOR' })).status).toBe(201);
    expect(await roleOf('never-signed-in@program.com.tw')).toBe('EDITOR');
  });

  it.each<[string, string, string]>([
    ['空白', '', '請輸入 email。'],
    ['只有空白', '   ', '請輸入 email。'],
    ['只有全形空白', '　', '請輸入 email。'],
    ['不是 email 格式', 'abc', '請輸入正確的 email。'],
    ['不是 email 格式（兩個 @）', 'jia@@program.com.tw', '請輸入正確的 email。'],
    ['不是公司網域', 'c@gmail.com', '只能新增公司帳號（@program.com.tw）。'],
    ['公司網域的子網域', 'x@sub.program.com.tw', '只能新增公司帳號（@program.com.tw）。'],
  ])('%s「%s」：400 VALIDATION_FAILED，fields.email 是「%s」，名單不變（PRM-R08、PRM-AC06）', async (_label, email, message) => {
    for (const role of ['VIEWER', 'EDITOR'] as const) {
      const error = await errorOf(await add({ email, role }));
      expect(error.status).toBe(400);
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.fields?.email, role).toBe(message);
    }
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
  });

  it.each<[string, unknown]>([
    ['沒有 role', { email: BING.email }],
    ['role 是 null', { email: BING.email, role: null }],
    ['role 不是兩種權限之一', { email: BING.email, role: 'ADMIN' }],
    ['role 是小寫', { email: BING.email, role: 'viewer' }],
    ['role 是畫面上的名稱', { email: BING.email, role: '檢視者' }],
    ['role 是數字', { email: BING.email, role: 1 }],
    ['沒有 email 欄位', { role: 'VIEWER' }],
    ['email 不是字串', { email: 123, role: 'VIEWER' }],
    ['本體不是 JSON', 'not json'],
  ])('%s：400 VALIDATION_FAILED，名單不變', async (_label, body) => {
    const error = await errorOf(await add(body));
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
  });
});

describe('POST /api/members：已經在名單上（PRM-R08、PRM-R10）', () => {
  it('PRM-AC07：乙是檢視者，以編輯者新增「 Yi@Program.com.tw 」→ 409 MEMBER_EXISTS，「yi@program.com.tw 已經是檢視者。」；乙仍是檢視者', async () => {
    await setMembers([E(JIA), V(YI)]);
    const error = await errorOf(await add({ email: ' Yi@Program.com.tw ', role: 'EDITOR' }));
    expect(error.status).toBe(409);
    expect(error.code).toBe('MEMBER_EXISTS');
    expect(error.fields?.email).toBe('yi@program.com.tw 已經是檢視者。');
    expect(await memberList()).toEqual([E(JIA), V(YI)]);
  });

  it('甲是編輯者，以檢視者新增甲 → 409 MEMBER_EXISTS，「jia@program.com.tw 已經是編輯者。」；甲仍是編輯者', async () => {
    const error = await errorOf(await add({ email: 'JIA@program.com.tw', role: 'VIEWER' }));
    expect(error.code).toBe('MEMBER_EXISTS');
    expect(error.fields?.email).toBe('jia@program.com.tw 已經是編輯者。');
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
  });

  it('同一種權限再新增一次也是 409，提示依名單上的權限', async () => {
    const error = await errorOf(await add({ email: YI.email, role: 'EDITOR' }));
    expect(error.code).toBe('MEMBER_EXISTS');
    expect(error.fields?.email).toBe('yi@program.com.tw 已經是編輯者。');
  });

  it('PRM-AC08：乙先以檢視者新增丙，甲再以編輯者新增丙 → 409，「bing@program.com.tw 已經是檢視者。」；丙只有一筆、仍是檢視者', async () => {
    as(YI);
    expect((await add({ email: BING.email, role: 'VIEWER' })).status).toBe(201);
    as(JIA);
    const error = await errorOf(await add({ email: BING.email, role: 'EDITOR' }));
    expect(error.code).toBe('MEMBER_EXISTS');
    expect(error.fields?.email).toBe('bing@program.com.tw 已經是檢視者。');
    expect(await prisma.member.count({ where: { email: BING.email } })).toBe(1);
    expect(await roleOf(BING.email)).toBe('VIEWER');
  });

  it('兩人同時新增丙：一個 201、一個 409 MEMBER_EXISTS，丙只有一筆（docs/architecture.md 第 11.5 節）', async () => {
    currentUser.mockResolvedValueOnce(JIA).mockResolvedValueOnce(YI);
    const responses = await Promise.all([add({ email: BING.email, role: 'VIEWER' }), add({ email: 'Bing@program.com.tw', role: 'EDITOR' })]);
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    const failed = responses.find((r) => !r.ok);
    if (!failed) throw new Error('兩個都成功了');
    const error = await errorOf(failed);
    expect(error.code).toBe('MEMBER_EXISTS');
    const role = await roleOf(BING.email);
    expect(error.fields?.email).toBe(`bing@program.com.tw 已經是${role === 'EDITOR' ? '編輯者' : '檢視者'}。`);
    expect(await prisma.member.count({ where: { email: BING.email } })).toBe(1);
  });
});

describe('POST /api/members：不是編輯者（PRM-R06、AUTH-R12、AUTH-R13、AUTH-R17）', () => {
  it('PRM-AC14：檢視者新增 → 403 NOT_EDITOR，名單不變', async () => {
    await setMembers([E(JIA), V(BING)]);
    as(BING);
    expect((await errorOf(await add({ email: 'x@program.com.tw', role: 'VIEWER' }))).code).toBe('NOT_EDITOR');
    expect(await memberList()).toEqual([E(JIA), V(BING)]);
  });

  it('沒有權限（丁）新增 → 403 NO_ACCESS，名單不變', async () => {
    as(DING);
    const error = await errorOf(await add({ email: DING.email, role: 'EDITOR' }));
    expect(error.status).toBe(403);
    expect(error.code).toBe('NO_ACCESS');
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
  });

  it('PRM-AC15、AUTH-AC18：乙把甲改為檢視者之後，甲新增丙 → 403 NOT_EDITOR，不新增', async () => {
    as(YI);
    expect((await patch(await memberIdOf(JIA.email), { role: 'VIEWER' })).status).toBe(200);
    as(JIA);
    expect((await errorOf(await add({ email: BING.email, role: 'VIEWER' }))).code).toBe('NOT_EDITOR');
    expect(await memberList()).toEqual([V(JIA), E(YI)]);
  });

  it('PRM-AC43：乙移除了甲之後，甲新增丙 → 403 NO_ACCESS，不新增', async () => {
    as(YI);
    expect((await remove(await memberIdOf(JIA.email))).status).toBe(200);
    as(JIA);
    expect((await errorOf(await add({ email: BING.email, role: 'VIEWER' }))).code).toBe('NO_ACCESS');
    expect(await memberList()).toEqual([E(YI)]);
  });
});

describe('PATCH /api/members/{id}：改權限（PRM-R35、PRM-R36、PRM-R07）', () => {
  it('PRM-AC39：甲是唯一的編輯者、乙是檢視者 → 把乙改為編輯者：200 { member }；乙仍在原來的位置；乙下一個請求就能讀名單', async () => {
    await setMembers([E(JIA), V(YI), V(BING)]);
    const yiId = await memberIdOf(YI.email);
    const res = await patch(yiId, { role: 'EDITOR' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { member: MemberJson };
    expect(Object.keys(body)).toEqual(['member']);
    expect(body.member).toEqual({ id: yiId, email: YI.email, role: 'EDITOR' });
    expect(await memberList()).toEqual([E(JIA), E(YI), V(BING)]);

    as(YI);
    expect(await listed()).toEqual([E(JIA), E(YI), V(BING)]);
  });

  it('改權限不改加入時間，清單位置不變（PRM-R07）', async () => {
    await setMembers([E(JIA), V(YI), V(BING)]);
    const before = await prisma.member.findUniqueOrThrow({ where: { email: YI.email } });
    await patch(before.id, { role: 'EDITOR' });
    await patch(before.id, { role: 'VIEWER' });
    const after = await prisma.member.findUniqueOrThrow({ where: { email: YI.email } });
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect(after.createdBy).toBe(before.createdBy);
    expect(await memberEmails()).toEqual([JIA.email, YI.email, BING.email]);
  });

  it('PRM-AC40：甲、乙都是編輯者 → 把乙改為檢視者：200；乙之後讀得到資料（me.isEditor 是 false），修改會被拒（NOT_EDITOR）', async () => {
    const res = await patch(await memberIdOf(YI.email), { role: 'VIEWER' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { member: MemberJson }).member).toMatchObject({ email: YI.email, role: 'VIEWER' });
    expect(await memberList()).toEqual([E(JIA), V(YI)]);

    expect(await stateStatusAs(YI)).toEqual({ status: 200 });
    expect((await errorOf(await add({ email: BING.email, role: 'VIEWER' }))).code).toBe('NOT_EDITOR');
  });

  it('PRM-AC41：甲、乙都是編輯者 → 甲把自己改為檢視者：200；甲之後不能再讀名單（NOT_EDITOR），但讀得到資料', async () => {
    expect((await patch(await memberIdOf(JIA.email), { role: 'VIEWER' })).status).toBe(200);
    expect(await memberList()).toEqual([V(JIA), E(YI)]);
    expect((await errorOf(await list())).code).toBe('NOT_EDITOR');
    expect(await stateStatusAs(JIA)).toEqual({ status: 200 });
  });

  it('改成和目前相同的權限：200，名單不變（乙是檢視者改成檢視者；甲是編輯者改成編輯者）', async () => {
    await setMembers([E(JIA), V(YI)]);
    const same = await patch(await memberIdOf(YI.email), { role: 'VIEWER' });
    expect(same.status).toBe(200);
    expect(((await same.json()) as { member: MemberJson }).member).toMatchObject({ email: YI.email, role: 'VIEWER' });
    expect((await patch(await memberIdOf(JIA.email), { role: 'EDITOR' })).status).toBe(200);
    expect(await memberList()).toEqual([E(JIA), V(YI)]);
  });

  it('PRM-AC10：甲是唯一的編輯者（乙是檢視者）→ 把甲改為檢視者：409 LAST_EDITOR，甲仍是編輯者', async () => {
    await setMembers([E(JIA), V(YI)]);
    const error = await errorOf(await patch(await memberIdOf(JIA.email), { role: 'VIEWER' }));
    expect(error.status).toBe(409);
    expect(error.code).toBe('LAST_EDITOR');
    expect(await memberList()).toEqual([E(JIA), V(YI)]);
  });

  it('PRM-AC42：乙先把自己改為檢視者，甲（畫面仍是兩位編輯者）再把自己改為檢視者 → 409 LAST_EDITOR；甲是唯一的編輯者', async () => {
    as(YI);
    expect((await patch(await memberIdOf(YI.email), { role: 'VIEWER' })).status).toBe(200);
    as(JIA);
    expect((await errorOf(await patch(await memberIdOf(JIA.email), { role: 'VIEWER' }))).code).toBe('LAST_EDITOR');
    expect(await memberList()).toEqual([E(JIA), V(YI)]);
  });

  it('兩位編輯者先後改同一個帳號的權限：以後改的為準（PRM-R35、COM-R09）', async () => {
    await setMembers([E(JIA), E(YI), V(BING)]);
    const bingId = await memberIdOf(BING.email);
    as(JIA);
    expect((await patch(bingId, { role: 'EDITOR' })).status).toBe(200);
    as(YI);
    expect((await patch(bingId, { role: 'VIEWER' })).status).toBe(200);
    expect(await roleOf(BING.email)).toBe('VIEWER');
  });

  it('PRM-AC13：甲、乙是編輯者，丙是檢視者；乙移除了丙，甲把丙改為編輯者 → 404 NOT_FOUND，不儲存', async () => {
    await setMembers([E(JIA), E(YI), V(BING)]);
    const bingId = await memberIdOf(BING.email);
    as(YI);
    expect((await remove(bingId)).status).toBe(200);
    as(JIA);
    const error = await errorOf(await patch(bingId, { role: 'EDITOR' }));
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
  });

  it.each(['abc', '-1', '999999'])('id「%s」不是名單上的人 → 404 NOT_FOUND，名單不變', async (id) => {
    expect((await errorOf(await patch(id, { role: 'VIEWER' }))).code).toBe('NOT_FOUND');
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
  });

  it.each<[string, unknown]>([
    ['沒有 role', {}],
    ['role 不是兩種權限之一', { role: 'ADMIN' }],
    ['role 是小寫', { role: 'editor' }],
    ['本體不是 JSON', 'not json'],
  ])('%s：400 VALIDATION_FAILED，名單不變', async (_label, body) => {
    const error = await errorOf(await patch(await memberIdOf(YI.email), body));
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
  });

  it('PRM-AC14：檢視者改權限 → 403 NOT_EDITOR（包括想把自己升為編輯者），名單不變', async () => {
    await setMembers([E(JIA), V(BING)]);
    as(BING);
    expect((await errorOf(await patch(await memberIdOf(BING.email), { role: 'EDITOR' }))).code).toBe('NOT_EDITOR');
    expect((await errorOf(await patch(await memberIdOf(JIA.email), { role: 'VIEWER' }))).code).toBe('NOT_EDITOR');
    expect(await memberList()).toEqual([E(JIA), V(BING)]);
  });

  it('沒有權限（丁）改權限 → 403 NO_ACCESS，名單不變', async () => {
    as(DING);
    expect((await errorOf(await patch(await memberIdOf(YI.email), { role: 'VIEWER' }))).code).toBe('NO_ACCESS');
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
  });
});

describe('DELETE /api/members/{id}：移除（PRM-R11～R14）', () => {
  it('PRM-AC09：甲移除乙（編輯者）→ 200 { removedId }；乙之後讀資料 → 403 NO_ACCESS（AUTH-R16）', async () => {
    const yiId = await memberIdOf(YI.email);
    const res = await remove(yiId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removedId: yiId });
    expect(await memberList()).toEqual([E(JIA)]);
    expect(await stateStatusAs(YI)).toEqual({ status: 403, code: 'NO_ACCESS' });
  });

  it('PRM-AC38：甲移除丙（檢視者）→ 200；丙之後讀資料 → 403 NO_ACCESS', async () => {
    await setMembers([E(JIA), V(BING)]);
    const res = await remove(await memberIdOf(BING.email));
    expect(res.status).toBe(200);
    expect(await memberList()).toEqual([E(JIA)]);
    expect(await stateStatusAs(BING)).toEqual({ status: 403, code: 'NO_ACCESS' });
  });

  it('只有一位編輯者時，移除檢視者照常成功（最後一位編輯者的限制只管編輯者）', async () => {
    await setMembers([E(JIA), V(YI), V(BING)]);
    expect((await remove(await memberIdOf(YI.email))).status).toBe(200);
    expect(await memberList()).toEqual([E(JIA), V(BING)]);
  });

  it('PRM-AC11：甲移除自己（還有乙）→ 200；甲之後讀名單與資料都是 403 NO_ACCESS', async () => {
    expect((await remove(await memberIdOf(JIA.email))).status).toBe(200);
    expect(await memberList()).toEqual([E(YI)]);
    expect((await errorOf(await list())).code).toBe('NO_ACCESS');
    expect(await stateStatusAs(JIA)).toEqual({ status: 403, code: 'NO_ACCESS' });
  });

  it('PRM-AC10：甲是唯一的編輯者（乙是檢視者）→ 移除甲：409 LAST_EDITOR，名單不變', async () => {
    await setMembers([E(JIA), V(YI)]);
    const error = await errorOf(await remove(await memberIdOf(JIA.email)));
    expect(error.status).toBe(409);
    expect(error.code).toBe('LAST_EDITOR');
    expect(await memberList()).toEqual([E(JIA), V(YI)]);
  });

  it('名單只有甲：甲移除自己 → 409 LAST_EDITOR（PRM-R04）', async () => {
    await setMembers([E(JIA)]);
    expect((await errorOf(await remove(await memberIdOf(JIA.email)))).code).toBe('LAST_EDITOR');
    expect(await memberList()).toEqual([E(JIA)]);
  });

  it('PRM-AC12：乙先移除自己，甲（畫面仍是兩位）再移除自己 → 409 LAST_EDITOR；名單只有甲', async () => {
    as(YI);
    expect((await remove(await memberIdOf(YI.email))).status).toBe(200);
    as(JIA);
    expect((await errorOf(await remove(await memberIdOf(JIA.email)))).code).toBe('LAST_EDITOR');
    expect(await memberList()).toEqual([E(JIA)]);
  });

  it('乙先把自己改為檢視者，甲再移除自己 → 409 LAST_EDITOR（PRM-R12）', async () => {
    as(YI);
    expect((await patch(await memberIdOf(YI.email), { role: 'VIEWER' })).status).toBe(200);
    as(JIA);
    expect((await errorOf(await remove(await memberIdOf(JIA.email)))).code).toBe('LAST_EDITOR');
    expect(await memberList()).toEqual([E(JIA), V(YI)]);
  });

  it('PRM-AC13：甲、乙是編輯者，丙是檢視者；乙移除了丙，甲也移除丙 → 404 NOT_FOUND，不儲存', async () => {
    await setMembers([E(JIA), E(YI), V(BING)]);
    const bingId = await memberIdOf(BING.email);
    as(YI);
    expect((await remove(bingId)).status).toBe(200);
    as(JIA);
    const error = await errorOf(await remove(bingId));
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
  });

  it.each(['abc', '-1', '999999'])('id「%s」不是名單上的人 → 404 NOT_FOUND', async (id) => {
    expect((await errorOf(await remove(id))).code).toBe('NOT_FOUND');
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
  });

  it('PRM-AC14：檢視者移除 → 403 NOT_EDITOR，名單不變', async () => {
    await setMembers([E(JIA), V(BING)]);
    as(BING);
    expect((await errorOf(await remove(await memberIdOf(JIA.email)))).code).toBe('NOT_EDITOR');
    expect(await memberList()).toEqual([E(JIA), V(BING)]);
  });

  it('沒有權限（丁）移除 → 403 NO_ACCESS，名單不變', async () => {
    as(DING);
    expect((await errorOf(await remove(await memberIdOf(YI.email)))).code).toBe('NO_ACCESS');
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
  });
});

describe('兩人同時操作僅剩的兩位編輯者：最後至少留一位編輯者（PRM-R12、docs/architecture.md 第 9.3 節）', () => {
  const editorCount = () => prisma.member.count({ where: { role: 'EDITOR' } });

  /** 兩個請求同時送出：一個成功、一個失敗，失敗的錯誤碼在 allowed 裡；名單剩一位編輯者 */
  async function expectOneWins(requests: [() => Promise<Response>, () => Promise<Response>], allowed: string[]) {
    const responses = await Promise.all(requests.map((r) => r()));
    expect(responses.filter((r) => r.ok), '只有一個成功').toHaveLength(1);
    const failed = responses.find((r) => !r.ok);
    if (!failed) throw new Error('兩個都成功了');
    expect(allowed).toContain((await errorOf(failed)).code);
    expect(await editorCount()).toBe(1);
  }

  it('甲、乙同時把自己改為檢視者：只有一個成功，名單剩一位編輯者；後到的是 409 LAST_EDITOR', async () => {
    const [jiaId, yiId] = [await memberIdOf(JIA.email), await memberIdOf(YI.email)];
    currentUser.mockResolvedValueOnce(JIA).mockResolvedValueOnce(YI);
    await expectOneWins([() => patch(jiaId, { role: 'VIEWER' }), () => patch(yiId, { role: 'VIEWER' })], ['LAST_EDITOR']);
  });

  it('甲把乙改為檢視者、同時乙把甲改為檢視者：只有一個成功；後到的是 LAST_EDITOR，或在檢查權限時已不是編輯者（NOT_EDITOR）', async () => {
    const [jiaId, yiId] = [await memberIdOf(JIA.email), await memberIdOf(YI.email)];
    currentUser.mockResolvedValueOnce(JIA).mockResolvedValueOnce(YI);
    await expectOneWins([() => patch(yiId, { role: 'VIEWER' }), () => patch(jiaId, { role: 'VIEWER' })], ['LAST_EDITOR', 'NOT_EDITOR']);
  });

  it('甲、乙同時移除自己：只有一個成功，名單剩一位編輯者', async () => {
    const [jiaId, yiId] = [await memberIdOf(JIA.email), await memberIdOf(YI.email)];
    currentUser.mockResolvedValueOnce(JIA).mockResolvedValueOnce(YI);
    await expectOneWins([() => remove(jiaId), () => remove(yiId)], ['LAST_EDITOR', 'NO_ACCESS']);
    expect(await prisma.member.count()).toBe(1);
  });

  it('甲移除乙、同時乙移除甲：只有一個成功，名單剩一位', async () => {
    const [jiaId, yiId] = [await memberIdOf(JIA.email), await memberIdOf(YI.email)];
    currentUser.mockResolvedValueOnce(JIA).mockResolvedValueOnce(YI);
    await expectOneWins([() => remove(yiId), () => remove(jiaId)], ['LAST_EDITOR', 'NO_ACCESS', 'NOT_FOUND']);
    expect(await prisma.member.count()).toBe(1);
  });

  it('甲移除自己、同時乙把自己改為檢視者：只有一個成功，名單剩一位編輯者', async () => {
    const [jiaId, yiId] = [await memberIdOf(JIA.email), await memberIdOf(YI.email)];
    currentUser.mockResolvedValueOnce(JIA).mockResolvedValueOnce(YI);
    await expectOneWins([() => remove(jiaId), () => patch(yiId, { role: 'VIEWER' })], ['LAST_EDITOR', 'NO_ACCESS', 'NOT_EDITOR']);
  });

  it('連續五輪：每一輪兩人同時把自己降級或移除，名單都不會沒有編輯者', async () => {
    for (let round = 0; round < 5; round++) {
      await setMembers([E(JIA), E(YI), V(BING)]);
      const [jiaId, yiId] = [await memberIdOf(JIA.email), await memberIdOf(YI.email)];
      currentUser.mockResolvedValueOnce(JIA).mockResolvedValueOnce(YI);
      await Promise.all(round % 2 === 0 ? [patch(jiaId, { role: 'VIEWER' }), patch(yiId, { role: 'VIEWER' })] : [remove(jiaId), patch(yiId, { role: 'VIEWER' })]);
      expect(await editorCount(), `第 ${round + 1} 輪`).toBe(1);
      expect(await roleOf(BING.email), `第 ${round + 1} 輪：檢視者不受影響`).toBe('VIEWER');
    }
  });
});

describe('Log（docs/architecture.md 第 15.2 節：記操作者的 userId 與目標的 Member id，不記 email）', () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
  });

  /** 打開 Log 輸出（整合測試預設 LOG_SILENT=1）並收集每一行 */
  function captureLogs() {
    const saved = process.env.LOG_SILENT;
    delete process.env.LOG_SILENT;
    const raw: string[] = [];
    const collect = (...args: unknown[]) => {
      raw.push(args.map(String).join(' '));
    };
    const spies = [
      vi.spyOn(console, 'info').mockImplementation(collect),
      vi.spyOn(console, 'error').mockImplementation(collect),
      vi.spyOn(console, 'warn').mockImplementation(collect),
      vi.spyOn(console, 'log').mockImplementation(collect),
    ];
    cleanups.push(() => {
      for (const s of spies) s.mockRestore();
      if (saved === undefined) delete process.env.LOG_SILENT;
      else process.env.LOG_SILENT = saved;
    });
    return {
      raw,
      events: () =>
        raw.flatMap((line) => {
          try {
            return [JSON.parse(line) as Record<string, unknown>];
          } catch {
            return [];
          }
        }),
    };
  }

  /** 事件裡有一個欄位（不是 status、durationMs）等於目標的 Member id */
  const mentionsTarget = (event: Record<string, unknown>, id: number) =>
    Object.entries(event).some(([key, value]) => !['status', 'durationMs'].includes(key) && value === id);

  /** 收集到的 Log 都不含任何 email */
  const expectNoEmail = (raw: string[]) => {
    for (const line of raw) expect(line, 'Log 不記 email').not.toMatch(/@program\.com\.tw|@gmail\.com/i);
  };

  it('新增：member_added，role 是新增的權限、userId 是操作者、記目標 id；不記 email', async () => {
    const logs = captureLogs();
    const res = await add({ email: BING.email, role: 'VIEWER' });
    const id = ((await res.json()) as { member: MemberJson }).member.id;
    const added = logs.events().filter((e) => e.eventType === 'member_added');
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ role: 'VIEWER', userId: JIA.id });
    expect(mentionsTarget(added[0] ?? {}, id)).toBe(true);
    expectNoEmail(logs.raw);
  });

  it('改權限：member_role_changed，fromRole、toRole；userId 是操作者、記目標 id；不記 email', async () => {
    const yiId = await memberIdOf(YI.email);
    const logs = captureLogs();
    await patch(yiId, { role: 'VIEWER' });
    const changed = logs.events().filter((e) => e.eventType === 'member_role_changed');
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ fromRole: 'EDITOR', toRole: 'VIEWER', userId: JIA.id });
    expect(mentionsTarget(changed[0] ?? {}, yiId)).toBe(true);
    expectNoEmail(logs.raw);
  });

  it('移除：member_removed，role 是被移除者的權限；userId 是操作者、記目標 id；不記 email', async () => {
    await setMembers([E(JIA), V(BING)]);
    const bingId = await memberIdOf(BING.email);
    const logs = captureLogs();
    await remove(bingId);
    const removed = logs.events().filter((e) => e.eventType === 'member_removed');
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ role: 'VIEWER', userId: JIA.id });
    expect(mentionsTarget(removed[0] ?? {}, bingId)).toBe(true);
    expectNoEmail(logs.raw);
  });

  it('被拒的請求：api_request_completed 記 403 與 errorCode（檢視者 NOT_EDITOR、沒有權限 NO_ACCESS）；不記 email，也沒有 member_ 事件', async () => {
    await setMembers([E(JIA), V(BING)]);
    const logs = captureLogs();
    as(BING);
    await add({ email: 'x@program.com.tw', role: 'VIEWER' });
    as(DING);
    await list();
    const completed = logs.events().filter((e) => e.eventType === 'api_request_completed');
    expect(completed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 403, errorCode: 'NOT_EDITOR', userId: BING.id, method: 'POST' }),
        expect.objectContaining({ status: 403, errorCode: 'NO_ACCESS', userId: DING.id, method: 'GET' }),
      ]),
    );
    expect(logs.events().filter((e) => String(e.eventType).startsWith('member_'))).toEqual([]);
    expectNoEmail(logs.raw);
  });

  it('被拒的改權限與移除（最後一位編輯者）：不記 member_ 事件', async () => {
    await setMembers([E(JIA), V(YI)]);
    const jiaId = await memberIdOf(JIA.email);
    const logs = captureLogs();
    await patch(jiaId, { role: 'VIEWER' });
    await remove(jiaId);
    expect(logs.events().filter((e) => String(e.eventType).startsWith('member_'))).toEqual([]);
    expect(logs.events().filter((e) => e.eventType === 'api_request_completed' && e.errorCode === 'LAST_EDITOR')).toHaveLength(2);
    expectNoEmail(logs.raw);
  });
});

describe('名單的帳號與 VIEWER 預設帳號（resetData 的約定）', () => {
  it('resetData 之後 VIEWER 是檢視者（其他整合測試依賴這一點）', async () => {
    await resetData();
    expect(await roleOf(VIEWER.email)).toBe('VIEWER');
    expect(await roleOf(DING.email)).toBeNull();
  });

  it('makeViewer、removeMember 改的是同一份名單（測試工具本身）', async () => {
    await makeViewer(YI.email);
    expect(await roleOf(YI.email)).toBe('VIEWER');
    await removeMember(YI.email);
    expect(await roleOf(YI.email)).toBeNull();
  });
});
