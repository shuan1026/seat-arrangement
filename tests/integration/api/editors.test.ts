// 編輯者名單 API：GET /api/editors（只有編輯者，依加入先後）、POST /api/editors（{ email }；空白、格式或網域不對 400 VALIDATION_FAILED，
// 已在名單 409 EDITOR_EXISTS）、DELETE /api/editors/{id}（只剩這一位 409 LAST_EDITOR，已被移除 404）——docs/architecture.md 第 8 節、
// 第 8.2 節、第 9.3 節（移除在 READ COMMITTED 交易內鎖住 Editor 全部列再數人數，兩人同時移除也不會讓名單變空）、第 7.1 節
// （email 一律去空白、轉小寫後存；createdBy 是新增者的 email）、第 11.5 節（新增靠 unique 判斷，兩人同時新增同一個 email 也只有一筆）。
// 規格：docs/spec/permissions.md PRM-R01、PRM-R03～R14；PRM-AC05～AC15。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE } from '@/app/api/editors/[id]/route';
import { GET, POST } from '@/app/api/editors/route';
import { prisma, resetData } from '../../helpers/db';
import { BING, editorEmails, editorIdOf, JIA, setEditors, VIEWER, YI, type TestUser } from '../../helpers/editors';

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn<() => Promise<TestUser | null>>() }));
vi.mock('@/server/auth', () => ({ currentUser }));

const BASE = 'http://localhost:3000/api/editors';

const list = () => GET(new Request(BASE), { params: Promise.resolve({}) });
const add = (body: unknown) =>
  POST(
    new Request(BASE, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    { params: Promise.resolve({}) },
  );
const remove = (id: number | string) => DELETE(new Request(`${BASE}/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id: String(id) }) });

async function errorOf(res: Response) {
  const text = await res.text();
  expect(res.ok, `應該失敗，卻是 HTTP ${res.status}：${text}`).toBe(false);
  const body = JSON.parse(text) as { error: { code: string; fields?: Record<string, string> } };
  return { status: res.status, ...body.error };
}

type EditorJson = { id: number; email: string };

async function listedEmails(): Promise<string[]> {
  const res = await list();
  expect(res.status).toBe(200);
  const body = (await res.json()) as { editors: EditorJson[] };
  for (const e of body.editors) {
    expect(typeof e.id).toBe('number');
    expect(typeof e.email).toBe('string');
  }
  return body.editors.map((e) => e.email);
}

const as = (user: TestUser) => currentUser.mockResolvedValue(user);

beforeEach(async () => {
  await resetData();
  currentUser.mockReset();
  await setEditors([JIA.email, YI.email]);
  as(JIA);
});

describe('GET /api/editors（PRM-R07、PRM-AC04）', () => {
  it('編輯者：回傳全部編輯者，依加入的先後排列（最早的在最上面）', async () => {
    expect(await listedEmails()).toEqual([JIA.email, YI.email]);
  });

  it('新增的排在最後', async () => {
    expect((await add({ email: BING.email })).ok).toBe(true);
    expect(await listedEmails()).toEqual([JIA.email, YI.email, BING.email]);
  });

  it('只能檢視：403 NOT_EDITOR，回應不含名單（PRM-R06、PRM-AC14）', async () => {
    as(VIEWER);
    const res = await list();
    const text = await res.clone().text();
    expect((await errorOf(res)).code).toBe('NOT_EDITOR');
    expect(res.status).toBe(403);
    expect(text).not.toContain(JIA.email);
  });
});

describe('POST /api/editors：新增（PRM-R08、PRM-R09、PRM-AC05）', () => {
  it('新增丙：成功，回傳新的編輯者；資料庫多了丙，排在最後；createdBy 是新增者的 email', async () => {
    const res = await add({ email: BING.email });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { editor: EditorJson };
    expect(body.editor).toMatchObject({ email: BING.email });
    expect(await editorEmails()).toEqual([JIA.email, YI.email, BING.email]);
    expect((await prisma.editor.findUnique({ where: { email: BING.email } }))?.createdBy).toBe(JIA.email);
  });

  it('email 去掉前後空白、轉小寫後儲存（PRM-R03）', async () => {
    expect((await add({ email: ' Bing@Program.com.tw ' })).ok).toBe(true);
    expect(await editorEmails()).toEqual([JIA.email, YI.email, BING.email]);
  });

  it('不必是員工名單上的人，也不必登入過（PRM-R01）', async () => {
    expect(await prisma.employee.count()).toBe(0);
    expect((await add({ email: 'never-signed-in@program.com.tw' })).ok).toBe(true);
    expect(await editorEmails()).toContain('never-signed-in@program.com.tw');
  });

  it.each<[string, unknown]>([
    ['空白', { email: '' }],
    ['只有空白', { email: '   ' }],
    ['沒有 email 欄位', {}],
    ['email 不是字串', { email: 123 }],
    ['不是 email 格式', { email: 'abc' }],
    ['不是公司網域', { email: 'c@gmail.com' }],
    ['公司網域的子網域', { email: 'x@sub.program.com.tw' }],
    ['本體不是 JSON', 'not json'],
  ])('%s：400 VALIDATION_FAILED，名單不變（PRM-R08、PRM-AC06）', async (_label, body) => {
    const error = await errorOf(await add(body));
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(await editorEmails()).toEqual([JIA.email, YI.email]);
  });

  it('欄位錯誤標在 email 欄位上', async () => {
    const error = await errorOf(await add({ email: 'c@gmail.com' }));
    expect(Object.keys(error.fields ?? {})).toContain('email');
  });

  it('乙已經是編輯者：「 Yi@Program.com.tw 」→ 409 EDITOR_EXISTS，名單不變（PRM-R08、PRM-AC07）', async () => {
    const error = await errorOf(await add({ email: ' Yi@Program.com.tw ' }));
    expect(error.status).toBe(409);
    expect(error.code).toBe('EDITOR_EXISTS');
    expect(await editorEmails()).toEqual([JIA.email, YI.email]);
  });

  it('乙先新增丙，甲再新增丙 → 409 EDITOR_EXISTS，丙只有一筆（PRM-R10、PRM-AC08）', async () => {
    as(YI);
    expect((await add({ email: BING.email })).ok).toBe(true);
    as(JIA);
    expect((await errorOf(await add({ email: BING.email }))).code).toBe('EDITOR_EXISTS');
    expect(await prisma.editor.count({ where: { email: BING.email } })).toBe(1);
  });

  it('兩人同時新增丙：一個成功、一個 409 EDITOR_EXISTS，丙只有一筆（docs/architecture.md 第 11.5 節）', async () => {
    currentUser.mockResolvedValueOnce(JIA).mockResolvedValueOnce(YI);
    const responses = await Promise.all([add({ email: BING.email }), add({ email: 'Bing@program.com.tw' })]);
    expect(responses.filter((r) => r.ok)).toHaveLength(1);
    const failed = responses.find((r) => !r.ok);
    if (!failed) throw new Error('兩個都成功了');
    expect((await errorOf(failed)).code).toBe('EDITOR_EXISTS');
    expect(await prisma.editor.count({ where: { email: BING.email } })).toBe(1);
  });

  it('只能檢視：403 NOT_EDITOR，名單不變（PRM-AC14）', async () => {
    as(VIEWER);
    expect((await errorOf(await add({ email: BING.email }))).code).toBe('NOT_EDITOR');
    expect(await editorEmails()).toEqual([JIA.email, YI.email]);
  });

  it('被移除編輯權限之後再新增 → 403 NOT_EDITOR，不新增（AUTH-R13、PRM-AC15）', async () => {
    as(YI);
    expect((await remove(await editorIdOf(JIA.email))).ok).toBe(true);
    as(JIA);
    expect((await errorOf(await add({ email: BING.email }))).code).toBe('NOT_EDITOR');
    expect(await editorEmails()).toEqual([YI.email]);
  });
});

describe('DELETE /api/editors/{id}：移除（PRM-R11～R14）', () => {
  it('甲移除乙：成功，乙從名單移除（PRM-AC09）', async () => {
    const res = await remove(await editorIdOf(YI.email));
    expect(res.ok).toBe(true);
    expect(await editorEmails()).toEqual([JIA.email]);
  });

  it('乙被移除後，乙的下一個請求就被拒（PRM-R05）', async () => {
    await remove(await editorIdOf(YI.email));
    as(YI);
    expect((await errorOf(await list())).code).toBe('NOT_EDITOR');
  });

  it('甲移除自己（還有乙）：成功；之後甲只能檢視，不能再讀名單（PRM-R13、PRM-AC11）', async () => {
    expect((await remove(await editorIdOf(JIA.email))).ok).toBe(true);
    expect(await editorEmails()).toEqual([YI.email]);
    expect((await errorOf(await list())).code).toBe('NOT_EDITOR');
  });

  it('名單只有甲：甲移除自己 → 409 LAST_EDITOR，名單仍有甲（PRM-R04、PRM-R12、PRM-AC10）', async () => {
    await setEditors([JIA.email]);
    const error = await errorOf(await remove(await editorIdOf(JIA.email)));
    expect(error.status).toBe(409);
    expect(error.code).toBe('LAST_EDITOR');
    expect(await editorEmails()).toEqual([JIA.email]);
  });

  it('乙先移除自己，甲（畫面仍是兩位）再移除自己 → 409 LAST_EDITOR，名單只有甲（PRM-R12、PRM-AC12）', async () => {
    as(YI);
    expect((await remove(await editorIdOf(YI.email))).ok).toBe(true);
    as(JIA);
    expect((await errorOf(await remove(await editorIdOf(JIA.email)))).code).toBe('LAST_EDITOR');
    expect(await editorEmails()).toEqual([JIA.email]);
  });

  it('名單有甲、乙、丙；乙移除了丙，甲也移除丙 → 404 NOT_FOUND，不儲存（PRM-R14、PRM-AC13）', async () => {
    await setEditors([JIA.email, YI.email, BING.email]);
    const bingId = await editorIdOf(BING.email);
    as(YI);
    expect((await remove(bingId)).ok).toBe(true);
    as(JIA);
    const error = await errorOf(await remove(bingId));
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(await editorEmails()).toEqual([JIA.email, YI.email]);
  });

  it.each(['abc', '-1', '999999'])('id「%s」不是名單上的人 → 404 NOT_FOUND', async (id) => {
    expect((await errorOf(await remove(id))).code).toBe('NOT_FOUND');
    expect(await editorEmails()).toEqual([JIA.email, YI.email]);
  });

  it('只能檢視：403 NOT_EDITOR，名單不變（PRM-AC14）', async () => {
    as(VIEWER);
    expect((await errorOf(await remove(await editorIdOf(JIA.email)))).code).toBe('NOT_EDITOR');
    expect(await editorEmails()).toEqual([JIA.email, YI.email]);
  });
});

describe('兩人同時移除最後兩位（docs/architecture.md 第 9.3 節）', () => {
  it('甲、乙同時移除自己：只有一個成功，名單剩一位，不會變空', async () => {
    const [jiaId, yiId] = [await editorIdOf(JIA.email), await editorIdOf(YI.email)];
    currentUser.mockResolvedValueOnce(JIA).mockResolvedValueOnce(YI);
    const responses = await Promise.all([remove(jiaId), remove(yiId)]);

    expect(responses.filter((r) => r.ok)).toHaveLength(1);
    const failed = responses.find((r) => !r.ok);
    if (!failed) throw new Error('兩個都成功了');
    // 後到的那一個：交易內發現只剩一位（409 LAST_EDITOR），或在檢查權限時已不是編輯者（403 NOT_EDITOR）
    expect(['LAST_EDITOR', 'NOT_EDITOR']).toContain((await errorOf(failed)).code);
    expect(await prisma.editor.count()).toBe(1);
  });

  it('甲移除乙、同時乙移除甲：只有一個成功，名單剩一位', async () => {
    const [jiaId, yiId] = [await editorIdOf(JIA.email), await editorIdOf(YI.email)];
    currentUser.mockResolvedValueOnce(JIA).mockResolvedValueOnce(YI);
    const responses = await Promise.all([remove(yiId), remove(jiaId)]);

    expect(responses.filter((r) => r.ok)).toHaveLength(1);
    const failed = responses.find((r) => !r.ok);
    if (!failed) throw new Error('兩個都成功了');
    expect(['LAST_EDITOR', 'NOT_EDITOR', 'NOT_FOUND']).toContain((await errorOf(failed)).code);
    expect(await prisma.editor.count()).toBe(1);
  });

  it('連續五輪：每一輪兩人同時移除自己，名單都不會變空', async () => {
    for (let round = 0; round < 5; round++) {
      await setEditors([JIA.email, YI.email]);
      const [jiaId, yiId] = [await editorIdOf(JIA.email), await editorIdOf(YI.email)];
      currentUser.mockResolvedValueOnce(JIA).mockResolvedValueOnce(YI);
      await Promise.all([remove(jiaId), remove(yiId)]);
      expect(await prisma.editor.count(), `第 ${round + 1} 輪`).toBe(1);
    }
  });
});
