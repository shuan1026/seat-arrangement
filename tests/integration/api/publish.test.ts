// 發布設定與發布頁的資料：PUT /api/publish（{ published: boolean }，回傳目前狀態）、GET /api/seats（未發布時只有 { published: false }；
// 已發布時每桌的桌次、備註名稱、部門標示與名單的顯示名稱；只要登入就能呼叫，編輯者、檢視者與沒有權限的人拿到的相同，D-026）——
// docs/architecture.md 第 8 節、第 9.3 節（GET /api/seats 以 anyLogin 不看權限名單；PUT /api/publish 檢視者 NOT_EDITOR、沒有權限 NO_ACCESS）、第 11.5 節
// （PublishedSeating：tables[{ id, noteName, departmentLabel, people[{ displayName, group }] }]，group 是部門、外部貴賓是「貴賓」；
// 不含分機、素食、兒童椅、備註、稱謂、組別、單位／頭銜、參與人員與員工的 id，也不含未入座的人；未發布時不查座位）、
// 第 10.2 節（/seats 的伺服器端元件呼叫 getPublishedSeating()）。
// 規格：docs/spec/permissions.md PRM-R16～R22、PRM-R24、PRM-R26、PRM-R27、PRM-R29；PRM-AC18、AC20、AC21、AC23、AC26、AC27、AC32；
// docs/spec/README.md AUTH-R12、AUTH-R15。桌號（D-019）：內部編號 3 = B4、17 = A3、7 = B2、9 = B8；工作人員桌是 0。
//
// 假設的介面：src/server/services/publish.ts 匯出 getPublishedSeating(): Promise<PublishedSeating>，和 GET /api/seats 回傳的內容相同。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUT } from '@/app/api/publish/route';
import { GET as getSeats } from '@/app/api/seats/route';
import { GET as getState } from '@/app/api/state/route';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import { getPublishedSeating } from '@/server/services/publish';
import { prisma, resetData } from '../../helpers/db';
import { DING, EDITOR, isPublished, JIA, setPublished, VIEWER, YI, type TestUser } from '../../helpers/editors';
import { createDependent, createEmployee, createGuest, createRegisteredEmployee } from '../../helpers/factory';

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn<() => Promise<TestUser | null>>() }));
vi.mock('@/server/auth', () => ({ currentUser }));

const putPublish = (body: unknown) =>
  PUT(
    new Request('http://localhost:3000/api/publish', {
      method: 'PUT',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    { params: Promise.resolve({}) },
  );
const seatsResponse = () => getSeats(new Request('http://localhost:3000/api/seats'), { params: Promise.resolve({}) });
const stateResponse = () => getState(new Request('http://localhost:3000/api/state'), { params: Promise.resolve({}) });

type PublishedPerson = { displayName: string; group: string };
/** D-027：每一桌多一個 position（所在位置 1–30，工作人員桌 null）；只有場上的桌與工作人員桌（docs/architecture.md 第 11.5 節） */
type PublishedTable = { id: number; position: number | null; noteName: string | null; departmentLabel: string; people: PublishedPerson[] };
type Published = { published: true; tables: PublishedTable[] };

const B4 = 3;
const A3 = 17;
const B2 = 7;
const B8 = 9;

/**
 * 驗收條件 PRM-AC26 的資料：B4 桌依序是王小明（研發一部、前端組、分機 1234、素食、備註「需要靠走道」）、王小明_眷屬（配偶、兒童椅）、
 * 林董（外部貴賓，單位「測試科技」、頭銜「董事長」）；B2 桌備註名稱「主桌」；陳大華是工作人員；陳大文已報名但未入座；
 * 李未報名只在員工名單上。林董先建立，確認名單依桌內順序而不是建立順序。
 */
async function seedSample() {
  const lin = await createGuest({
    guestName: '林董',
    organization: '測試科技',
    title: '董事長',
    tableId: B4,
    seatOrder: 2,
    note: '貴賓備註甲',
  });
  const wang = await createRegisteredEmployee(
    { name: '王小明', department: '研發一部', team: '前端組', extension: '1234' },
    { tableId: B4, seatOrder: 0, vegetarian: true, note: '需要靠走道' },
  );
  const dependent = await createDependent(wang.participant.id, { relation: '配偶', childSeat: true, tableId: B4, seatOrder: 1 });
  const staff = await createRegisteredEmployee({ name: '陳大華', department: '總務部', extension: '5678' }, { tableId: STAFF_TABLE_ID, seatOrder: 0 });
  const unseated = await createRegisteredEmployee({ name: '陳大文', department: '研發一部', extension: '9999' });
  await createEmployee({ name: '李未報名', department: '業務部' });
  await createRegisteredEmployee({ name: '張主任', department: '研發一部' }, { tableId: B2, seatOrder: 0 });
  await prisma.seatTable.update({ where: { id: B2 }, data: { noteName: '主桌' } });
  return { lin, wang, dependent, staff, unseated };
}

/** 回傳給發布頁的資料不可出現的內容（PRM-R27） */
const SECRETS = ['1234', '5678', '9999', '需要靠走道', '貴賓備註甲', '配偶', '前端組', '測試科技', '董事長', '陳大文', '李未報名'];
/** 不可出現的欄位名稱 */
const FORBIDDEN_KEYS = ['extension', 'vegetarian', 'childSeat', 'note', 'relation', 'team', 'organization', 'title', 'kind', 'employeeId', 'hostId', 'participantId', 'seatOrder'];

function collectKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) collectKeys(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
  return out;
}

async function publishedSeating(): Promise<{ body: Published; text: string }> {
  const res = await seatsResponse();
  expect(res.status).toBe(200);
  const text = await res.text();
  const body = JSON.parse(text) as Published;
  expect(body.published).toBe(true);
  return { body, text };
}

const tableOf = (body: Published, id: number) => {
  const t = body.tables.find((x) => x.id === id);
  if (!t) throw new Error(`回應裡沒有內部編號 ${id} 的桌次`);
  return t;
};

beforeEach(async () => {
  await resetData();
  currentUser.mockReset();
  currentUser.mockResolvedValue(EDITOR);
});

describe('PUT /api/publish（PRM-R17、PRM-R19、PRM-AC18）', () => {
  it('預設未發布', async () => {
    expect(await isPublished()).toBe(false);
  });

  it('編輯者打勾：回傳 { published: true }，立即儲存；取消打勾：回傳 { published: false }', async () => {
    const on = await putPublish({ published: true });
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ published: true });
    expect(await isPublished()).toBe(true);

    const off = await putPublish({ published: false });
    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({ published: false });
    expect(await isPublished()).toBe(false);
  });

  it('同一個狀態再送一次也成功，狀態不變', async () => {
    await putPublish({ published: true });
    expect((await putPublish({ published: true })).status).toBe(200);
    expect(await isPublished()).toBe(true);
  });

  it('兩位編輯者先後切換：以後切換的為準（PRM-R19、COM-R09）', async () => {
    currentUser.mockResolvedValueOnce(JIA).mockResolvedValueOnce(YI);
    await putPublish({ published: true });
    await putPublish({ published: false });
    expect(await isPublished()).toBe(false);
  });

  it.each<[string, unknown]>([
    ['沒有 published', {}],
    ['published 不是布林', { published: 'yes' }],
    ['published 是 1', { published: 1 }],
    ['本體不是 JSON', 'not json'],
  ])('%s：400 VALIDATION_FAILED，狀態不變', async (_label, body) => {
    await setPublished(true);
    const res = await putPublish(body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
    expect(await isPublished()).toBe(true);
  });

  it('檢視者：403 NOT_EDITOR，發布狀態不變（PRM-R16、PRM-AC20、AUTH-R12）', async () => {
    currentUser.mockResolvedValue(VIEWER);
    const res = await putPublish({ published: true });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NOT_EDITOR');
    expect(await isPublished()).toBe(false);
  });

  it('沒有權限（丁）：403 NO_ACCESS，發布狀態不變（AUTH-R16、docs/architecture.md 第 9.3 節）', async () => {
    currentUser.mockResolvedValue(DING);
    const res = await putPublish({ published: true });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NO_ACCESS');
    expect(await isPublished()).toBe(false);
  });

  it('GET /api/state 的 seatsPublished 跟著改變（重新整理後再開對話框仍是已發布，PRM-AC18）', async () => {
    await putPublish({ published: true });
    const state = (await (await stateResponse()).json()) as { seatsPublished: boolean };
    expect(state.seatsPublished).toBe(true);
  });
});

describe('GET /api/seats：未發布（PRM-R22、PRM-AC23）', () => {
  it.each([
    ['編輯者', EDITOR],
    ['檢視者', VIEWER],
    ['沒有權限（丁）', DING],
  ] as const)('%s：200，回應只有 { published: false }，不含任何座位資料', async (_label, user) => {
    await seedSample();
    currentUser.mockResolvedValue(user);
    const res = await seatsResponse();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ published: false });
    for (const name of ['王小明', '林董', '陳大華', '主桌', '研發一部']) expect(text).not.toContain(name);
  });

  it('getPublishedSeating() 未發布時也是 { published: false }（/seats 的伺服器端元件用它，docs/architecture.md 第 10.2 節）', async () => {
    await seedSample();
    expect(await getPublishedSeating()).toEqual({ published: false });
  });
});

describe('GET /api/seats：已發布（PRM-R21、PRM-R24、PRM-R26、PRM-R27、PRM-AC24、PRM-AC26、PRM-AC27）', () => {
  beforeEach(async () => {
    await setPublished(true);
  });

  it('回應只有 published 與 tables；31 張桌（30 桌與工作人員桌），每桌只有 id、position、noteName、departmentLabel、people', async () => {
    await seedSample();
    const { body } = await publishedSeating();
    expect(Object.keys(body).sort()).toEqual(['published', 'tables']);
    expect(body.tables.map((t) => t.id).sort((a, b) => a - b)).toEqual(Array.from({ length: 31 }, (_, i) => i));
    for (const t of body.tables) {
      expect(Object.keys(t).sort(), `桌次 ${t.id}`).toEqual(['departmentLabel', 'id', 'noteName', 'people', 'position']);
      for (const p of t.people) expect(Object.keys(p).sort(), `桌次 ${t.id}`).toEqual(['displayName', 'group']);
      expect(t.position, `桌次 ${t.id}`).toBe(t.id === STAFF_TABLE_ID ? null : t.id);
    }
  });

  it('B4 桌：名單依桌內順序是「王小明」「王小明_眷屬」「林董」；部門標示「研發一部＋貴賓」；group 是部門，外部貴賓是「貴賓」（PRM-AC26）', async () => {
    await seedSample();
    const { body } = await publishedSeating();
    expect(tableOf(body, B4)).toEqual({
      id: B4,
      position: B4,
      noteName: null,
      departmentLabel: '研發一部＋貴賓',
      people: [
        { displayName: '王小明', group: '研發一部' },
        { displayName: '王小明_眷屬', group: '研發一部' },
        { displayName: '林董', group: '貴賓' },
      ],
    });
  });

  it('B2 桌有備註名稱「主桌」；工作人員桌有陳大華；沒有人的桌部門標示是「空桌」', async () => {
    await seedSample();
    const { body } = await publishedSeating();
    expect(tableOf(body, B2)).toMatchObject({ noteName: '主桌', departmentLabel: '研發一部', people: [{ displayName: '張主任', group: '研發一部' }] });
    expect(tableOf(body, STAFF_TABLE_ID).people).toEqual([{ displayName: '陳大華', group: '總務部' }]);
    expect(tableOf(body, B8)).toEqual({ id: B8, position: B8, noteName: null, departmentLabel: '空桌', people: [] });
  });

  it('PRM-AC45：B8 是「未放桌」、暫存區有一桌坐陳大文 → 回傳的資料不含 B8 與暫存的桌，也沒有陳大文（PRM-R24、PRM-R30、D-027）', async () => {
    const { unseated: chen } = await seedSample();
    // seedSample 的陳大文未入座；把他放到暫存區的一桌（id 31），B8（9）的桌刪掉
    await prisma.seatTable.delete({ where: { id: B8 } });
    await prisma.seatTable.create({ data: { id: 31, kind: 'NORMAL', position: null, stagedAt: new Date('2026-11-01T08:00:00.000Z'), noteName: '暫放' } });
    await prisma.participant.update({ where: { id: chen.participant.id }, data: { tableId: 31, seatOrder: 0 } });

    const { body, text } = await publishedSeating();
    expect(body.tables).toHaveLength(30);
    expect(body.tables.map((t) => t.id)).not.toContain(31);
    expect(body.tables.map((t) => t.id)).not.toContain(B8);
    expect(body.tables.map((t) => t.position)).not.toContain(B8);
    expect(text).not.toContain('陳大文');
    expect(text).not.toContain('暫放');
  });

  it('搬到別的位置的桌：position 是新的位置（B4 那一桌搬到 B8 → position 9，名單跟著）', async () => {
    await seedSample();
    await prisma.seatTable.update({ where: { id: B8 }, data: { position: null, stagedAt: new Date('2026-11-01T08:00:00.000Z') } });
    await prisma.seatTable.update({ where: { id: B4 }, data: { position: B8 } });
    const { body } = await publishedSeating();
    expect(tableOf(body, B4)).toMatchObject({ position: B8, people: [{ displayName: '王小明' }, { displayName: '王小明_眷屬' }, { displayName: '林董' }] });
    expect(body.tables.map((t) => t.id)).not.toContain(B8);
    expect(body.tables.some((t) => t.position === B4)).toBe(false);
  });

  it('不含分機、素食、兒童椅、備註、稱謂、組別、單位／頭銜、任何 id 與未入座的人（PRM-R27、PRM-AC26、PRM-AC27）', async () => {
    await seedSample();
    const { body, text } = await publishedSeating();
    for (const secret of SECRETS) expect(text, secret).not.toContain(secret);
    const keys = collectKeys(body);
    for (const key of FORBIDDEN_KEYS) expect(keys.has(key), key).toBe(false);
    const everyone = body.tables.flatMap((t) => t.people.map((p) => p.displayName));
    expect(everyone).not.toContain('陳大文');
    expect(everyone).not.toContain('李未報名');
  });

  it('編輯者、檢視者與沒有權限的人拿到的內容相同（PRM-R21、PRM-AC24）', async () => {
    await seedSample();
    const asEditor = (await publishedSeating()).body;
    currentUser.mockResolvedValue(VIEWER);
    const asViewer = (await publishedSeating()).body;
    currentUser.mockResolvedValue(DING);
    const asNoAccess = (await publishedSeating()).body;
    expect(asViewer).toEqual(asEditor);
    expect(asNoAccess).toEqual(asEditor);
  });

  it('getPublishedSeating() 和 GET /api/seats 的內容相同', async () => {
    await seedSample();
    expect(await getPublishedSeating()).toEqual((await publishedSeating()).body);
  });

  it('發布後編輯者照常修改，每次開啟都是最新的座位：王小明從 B4 移到 A3 → 下一次讀取在 A3（PRM-R20、PRM-R29、PRM-AC21）', async () => {
    const { wang } = await seedSample();
    await prisma.participant.update({ where: { id: wang.participant.id }, data: { tableId: A3, seatOrder: 0 } });
    const { body } = await publishedSeating();
    expect(tableOf(body, A3).people.map((p) => p.displayName)).toEqual(['王小明']);
    expect(tableOf(body, B4).people.map((p) => p.displayName)).toEqual(['王小明_眷屬', '林董']);
  });

  it('停止發布後，下一次讀取就只有 { published: false }（PRM-R29、PRM-AC32）', async () => {
    await seedSample();
    await publishedSeating();
    await setPublished(false);
    const res = await seatsResponse();
    expect(await res.json()).toEqual({ published: false });
  });

  it('同名的兩位都帶自己的部門（搜尋結果用 group 區分，PRM-R32）', async () => {
    await createRegisteredEmployee({ name: '王小明', department: '研發一部' }, { tableId: B4, seatOrder: 0 });
    await createRegisteredEmployee({ name: '王小明', department: '業務部' }, { tableId: A3, seatOrder: 0 });
    const { body } = await publishedSeating();
    expect(tableOf(body, B4).people).toEqual([{ displayName: '王小明', group: '研發一部' }]);
    expect(tableOf(body, A3).people).toEqual([{ displayName: '王小明', group: '業務部' }]);
  });
});
