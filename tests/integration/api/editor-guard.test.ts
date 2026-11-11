// 三種身分的 API 權限檢查（D-021、D-026；檔名沿用 D-021 時的 editor-guard.test.ts）：
// docs/spec/README.md AUTH-R11（每一次操作依當下的名單判斷，變更從下一次操作起生效，不必重新登入）、
// AUTH-R12（檢視者呼叫任何會修改資料的 API 都被拒絕、資料不變；讀取資料的 API 與匯出只接受編輯者與檢視者；發布頁的 API 只要登入）、
// AUTH-R16（沒有權限的人讀取資料的 API 與匯出都被拒絕，不回傳資料）、AUTH-AC16、AUTH-AC22；
// docs/spec/permissions.md PRM-R03、PRM-R05、PRM-R06、PRM-R21、PRM-AC14、PRM-AC20、PRM-AC44；
// docs/architecture.md 第 8 節、第 9.3 節（檢查集中在 route()：登入但不在名單上，除了 anyLogin 的路由一律 403 NO_ACCESS；
// 檢視者呼叫寫入方法或 editorOnly 的路由 403 NOT_EDITOR；GET /api/seats 用 anyLogin；匯入的 multipart 請求在讀檔前就擋下）。
//
// 身分（tests/helpers/editors.ts）：EDITOR 是編輯者、VIEWER 是檢視者（resetData 寫進名單），丁（DING）不在名單上（沒有權限）。
// 檢查方式：
// 1. 掃描 src/app/api 底下所有的 route.ts（同 access.test.ts）：每個寫入方法，檢視者回 403 NOT_EDITOR、沒有權限回 403 NO_ACCESS；
//    每個 GET，沒有權限回 403 NO_ACCESS（GET /api/seats 除外）。回應只有錯誤，五張表都不變。
// 2. 每一個寫入 API 用「編輯者送出就會成功」的正確本體呼叫：檢視者與沒有權限都被拒，五張表（員工、參與人員、桌次、權限名單、發布設定）都不變。
// 3. 讀取 API 的三種身分。
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma, resetData } from '../../helpers/db';
import {
  DING,
  EDITOR,
  isPublished,
  makeEditor,
  makeViewer,
  memberIdOf,
  memberList,
  removeMember,
  setPublished,
  VIEWER,
  type TestUser,
} from '../../helpers/editors';
import { rosterCsv, rosterPerson } from '../../helpers/employees-roster';
import { createDependent, createEmployee, createGuest, createRegisteredEmployee } from '../../helpers/factory';
import { answer, registrationCsv } from '../../helpers/participants-registration-csv';

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn<() => Promise<TestUser | null>>() }));
vi.mock('@/server/auth', () => ({ currentUser }));

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const API_DIR = path.join(process.cwd(), 'src', 'app', 'api');
const PUBLIC_DIRS = new Set(['health', 'auth']);
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

const protectedRoutes = readdirSync(API_DIR, { recursive: true, encoding: 'utf8' })
  .filter((file) => path.basename(file) === 'route.ts')
  .filter((file) => !PUBLIC_DIRS.has(file.split(path.sep)[0] ?? ''))
  .sort();

const routeFile = (...segments: string[]) => path.join(...segments, 'route.ts');
/** 只要登入就能讀的路由（docs/architecture.md 第 9.3 節：GET /api/seats 以 anyLogin 給沒有權限的人看發布頁） */
const ANY_LOGIN_GET = new Set([routeFile('seats')]);

const urlOf = (file: string, params: Record<string, string> = {}) =>
  `http://localhost:3000/api/${path
    .dirname(file)
    .split(path.sep)
    .map((seg) => (seg.startsWith('[') ? (params[seg.slice(1, -1)] ?? '1') : seg))
    .join('/')}`;

async function handlerOf(file: string, method: string): Promise<Handler> {
  const mod = (await import(path.join(API_DIR, file))) as Record<string, unknown>;
  const handler = mod[method];
  if (typeof handler !== 'function') throw new Error(`${file} 沒有 ${method}`);
  return handler as Handler;
}

type Call = { file: string; method: string; params?: Record<string, string>; json?: unknown; form?: () => FormData };

async function call(c: Call): Promise<Response> {
  const handler = await handlerOf(c.file, c.method);
  const init: RequestInit = { method: c.method };
  if (c.form) init.body = c.form();
  else if (c.json !== undefined) {
    init.body = JSON.stringify(c.json);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return handler(new Request(urlOf(c.file, c.params), init), { params: Promise.resolve(c.params ?? { id: '1' }) });
}

/** 403 而且回應只有錯誤（不含任何資料） */
async function expectRejected(res: Response, code: 'NOT_EDITOR' | 'NO_ACCESS', label: string) {
  expect(res.status, label).toBe(403);
  const text = await res.text();
  const body = JSON.parse(text) as Record<string, unknown>;
  expect(Object.keys(body), label).toEqual(['error']);
  expect(body.error, label).toMatchObject({ code });
  for (const secret of ['王小明', '1234', '需要靠走道', '測試科技', '@program.com.tw']) expect(text, `${label}：回應不含 ${secret}`).not.toContain(secret);
}

/** 五張表的全部內容（D-021、D-026：員工、參與人員、桌次、權限名單、發布設定） */
async function snapshotAll() {
  const [employees, participants, tables, members, settings] = await Promise.all([
    prisma.employee.findMany({ orderBy: { id: 'asc' } }),
    prisma.participant.findMany({ orderBy: { id: 'asc' } }),
    prisma.seatTable.findMany({ orderBy: { id: 'asc' } }),
    prisma.member.findMany({ orderBy: { id: 'asc' } }),
    prisma.setting.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return { employees, participants, tables, members, settings };
}

/** 示範資料：王小明（研發一部，分機 1234）與眷屬坐 B4 桌（內部編號 3）；陳大文未報名；林董未入座；B2 桌（內部編號 7）備註名稱「主桌」 */
async function seedSample() {
  const wang = await createRegisteredEmployee(
    { name: '王小明', department: '研發一部', extension: '1234' },
    { tableId: 3, seatOrder: 0, vegetarian: true },
  );
  const dependent = await createDependent(wang.participant.id, { relation: '配偶', childSeat: true, tableId: 3, seatOrder: 1 });
  const chen = await createEmployee({ name: '陳大文', department: '研發一部' });
  const guest = await createGuest({ guestName: '林董', organization: '測試科技 董事長', note: '需要靠走道' });
  await prisma.seatTable.update({ where: { id: 7 }, data: { noteName: '主桌' } });
  return { wang, dependent, chen, guest };
}

const ROLES = [
  ['檢視者', VIEWER, 'NOT_EDITOR'],
  ['沒有權限', DING, 'NO_ACCESS'],
] as const;

beforeEach(async () => {
  await resetData();
  currentUser.mockReset();
  currentUser.mockResolvedValue(VIEWER);
});

describe('掃描：每個寫入方法都檢查身分（docs/architecture.md 第 9.3 節）', () => {
  it('掃描得到權限名單、發布與發布頁的 API（D-021、D-026），舊的 /api/editors 已經不存在', () => {
    expect(protectedRoutes).toEqual(
      expect.arrayContaining([routeFile('members'), routeFile('members', '[id]'), routeFile('publish'), routeFile('seats')]),
    );
    expect(protectedRoutes.filter((f) => f.split(path.sep)[0] === 'editors')).toEqual([]);
  });

  it.each(ROLES.flatMap(([label, user, code]) => protectedRoutes.map((file) => [label, file, user, code] as const)))(
    '%s，%s：每個寫入方法都回 403（檢視者 NOT_EDITOR、沒有權限 NO_ACCESS），回應只有錯誤，資料不變',
    async (_label, file, user, code) => {
      currentUser.mockResolvedValue(user);
      await seedSample();
      const mod = (await import(path.join(API_DIR, file))) as Record<string, unknown>;
      const methods = WRITE_METHODS.filter((m) => typeof mod[m] === 'function');
      const before = await snapshotAll();
      for (const method of methods) {
        const res = await call({ file, method, json: method === 'DELETE' ? undefined : {} });
        await expectRejected(res, code, `${method} ${urlOf(file)}`);
      }
      expect(await snapshotAll()).toEqual(before);
    },
  );

  it.each(protectedRoutes)('沒有權限，%s：每個 GET 都回 403 NO_ACCESS（GET /api/seats 除外，只要登入），回應不含資料', async (file) => {
    currentUser.mockResolvedValue(DING);
    await seedSample();
    const mod = (await import(path.join(API_DIR, file))) as Record<string, unknown>;
    if (typeof mod.GET !== 'function') return;
    const res = await call({ file, method: 'GET' });
    if (ANY_LOGIN_GET.has(file)) expect(res.status, `GET ${urlOf(file)}`).toBe(200);
    else await expectRejected(res, 'NO_ACCESS', `GET ${urlOf(file)}`);
  });

  it.each(ROLES)('匯入的 multipart 請求在讀檔前就擋下（%s）：沒有檔案也是 403，不是 400', async (_label, user, code) => {
    currentUser.mockResolvedValue(user);
    for (const file of [routeFile('employees', 'import'), routeFile('participants', 'import')]) {
      const res = await call({ file, method: 'POST', form: () => new FormData() });
      await expectRejected(res, code, file);
    }
  });
});

describe('編輯者會成功的寫入，檢視者與沒有權限的人都被拒絕、資料不變（AUTH-R12、AUTH-AC16、PRM-AC14、PRM-AC20）', () => {
  type Case = { name: string; build: (s: Awaited<ReturnType<typeof seedSample>>) => Promise<Call> | Call };
  const CASES: Case[] = [
    { name: '新增員工', build: () => ({ file: routeFile('employees'), method: 'POST', json: { name: '新同事', department: '研發一部' } }) },
    {
      name: '編輯員工',
      build: (s) => ({
        file: routeFile('employees', '[id]'),
        method: 'PATCH',
        params: { id: String(s.chen.id) },
        json: { name: '陳大文', department: '業務部' },
      }),
    },
    { name: '刪除員工', build: (s) => ({ file: routeFile('employees', '[id]'), method: 'DELETE', params: { id: String(s.wang.employee.id) } }) },
    {
      name: '標記為不參加',
      build: (s) => ({ file: routeFile('employees', '[id]', 'declined'), method: 'PUT', params: { id: String(s.chen.id) }, json: { declined: true } }),
    },
    {
      name: '匯入員工名單',
      build: () => ({
        file: routeFile('employees', 'import'),
        method: 'POST',
        form: () => {
          const form = new FormData();
          form.append('file', new File([rosterCsv([rosterPerson('新同事', '研發一部')])], 'roster.csv', { type: 'text/csv' }));
          return form;
        },
      }),
    },
    { name: '新增外部貴賓', build: () => ({ file: routeFile('participants'), method: 'POST', json: { kind: 'GUEST', guestName: '新貴賓' } }) },
    { name: '員工加入尾牙', build: (s) => ({ file: routeFile('participants'), method: 'POST', json: { kind: 'EMPLOYEE', employeeId: s.chen.id } }) },
    { name: '一次加入多位', build: (s) => ({ file: routeFile('participants', 'bulk-join'), method: 'POST', json: { employeeIds: [s.chen.id] } }) },
    {
      name: '編輯參與人員',
      build: (s) => ({ file: routeFile('participants', '[id]'), method: 'PATCH', params: { id: String(s.guest.id) }, json: { vegetarian: true } }),
    },
    {
      name: '取消報名',
      build: (s) => ({ file: routeFile('participants', '[id]'), method: 'DELETE', params: { id: String(s.wang.participant.id) } }),
    },
    {
      name: '匯入參與人員',
      build: () => ({
        file: routeFile('participants', 'import'),
        method: 'POST',
        form: () => {
          const form = new FormData();
          form.append('file', new File([registrationCsv([answer('陳大文／研發一部／是／否／否／葷食')])], 'registrations.csv', { type: 'text/csv' }));
          return form;
        },
      }),
    },
    {
      name: '座位異動：入座',
      build: (s) => ({ file: routeFile('seating', 'operations'), method: 'POST', json: { type: 'seat', participantId: s.guest.id, tableId: 5 } }),
    },
    {
      name: '座位異動：移出',
      build: (s) => ({ file: routeFile('seating', 'operations'), method: 'POST', json: { type: 'unseat', participantId: s.wang.participant.id } }),
    },
    { name: '座位異動：清空', build: () => ({ file: routeFile('seating', 'operations'), method: 'POST', json: { type: 'clear', tableId: 3 } }) },
    // D-027：對調改用 moveTable；另有搬到「未放桌」、移到暫存區、從暫存區放回、新增桌、刪除桌（SEAT-R90、AUTH-R12）
    {
      name: '座位異動：對調（moveTable 到有桌的位置）',
      build: () => ({ file: routeFile('seating', 'operations'), method: 'POST', json: { type: 'moveTable', tableId: 3, to: 7, expectedTableId: 7 } }),
    },
    {
      name: '座位異動：移到暫存區',
      build: () => ({ file: routeFile('seating', 'operations'), method: 'POST', json: { type: 'moveTable', tableId: 3, to: 'staging', expectedTableId: null } }),
    },
    {
      name: '座位異動：搬到「未放桌」的位置',
      build: async () => {
        await prisma.seatTable.delete({ where: { id: 9 } });
        return { file: routeFile('seating', 'operations'), method: 'POST', json: { type: 'moveTable', tableId: 3, to: 9, expectedTableId: null } };
      },
    },
    {
      name: '座位異動：從暫存區放回',
      build: async () => {
        await prisma.seatTable.delete({ where: { id: 9 } });
        await prisma.seatTable.create({ data: { id: 31, kind: 'NORMAL', position: null, stagedAt: new Date('2026-11-01T08:00:00.000Z') } });
        return { file: routeFile('seating', 'operations'), method: 'POST', json: { type: 'moveTable', tableId: 31, to: 9, expectedTableId: null } };
      },
    },
    {
      name: '座位異動：新增桌',
      build: async () => {
        await prisma.seatTable.delete({ where: { id: 9 } });
        return { file: routeFile('seating', 'operations'), method: 'POST', json: { type: 'createTable', position: 9 } };
      },
    },
    { name: '座位異動：刪除桌', build: () => ({ file: routeFile('seating', 'operations'), method: 'POST', json: { type: 'deleteTable', tableId: 3 } }) },
    {
      name: '復原（桌子）',
      build: () => ({
        file: routeFile('seating', 'operations'),
        method: 'POST',
        json: {
          type: 'restore',
          snapshot: { participants: [], tables: [{ id: 3, kind: 'NORMAL', position: null, stagedAt: '2026-11-01T08:00:00.000Z', noteName: null, exists: true }] },
        },
      }),
    },
    {
      name: '自動排座',
      build: () => ({ file: routeFile('seating', 'operations'), method: 'POST', json: { type: 'autoArrange', mode: 'rebuild' } }),
    },
    {
      name: '復原',
      build: (s) => ({
        file: routeFile('seating', 'operations'),
        method: 'POST',
        json: { type: 'restore', snapshot: { participants: [{ id: s.wang.participant.id, tableId: null, seatOrder: null }], tables: [] } },
      }),
    },
    { name: '修改備註名稱', build: () => ({ file: routeFile('tables', '[id]'), method: 'PATCH', params: { id: '3' }, json: { noteName: '供應商' } }) },
    { name: '切換發布', build: () => ({ file: routeFile('publish'), method: 'PUT', json: { published: true } }) },
    {
      name: '新增帳號（檢視者）',
      build: () => ({ file: routeFile('members'), method: 'POST', json: { email: 'new.viewer@program.com.tw', role: 'VIEWER' } }),
    },
    {
      name: '新增帳號（編輯者，想把自己加進名單）',
      build: () => ({ file: routeFile('members'), method: 'POST', json: { email: DING.email, role: 'EDITOR' } }),
    },
    {
      name: '改權限（把編輯者改為檢視者）',
      build: async () => ({ file: routeFile('members', '[id]'), method: 'PATCH', params: { id: String(await memberIdOf(EDITOR.email)) }, json: { role: 'VIEWER' } }),
    },
    {
      name: '改權限（把檢視者升為編輯者）',
      build: async () => ({ file: routeFile('members', '[id]'), method: 'PATCH', params: { id: String(await memberIdOf(VIEWER.email)) }, json: { role: 'EDITOR' } }),
    },
    {
      name: '移除帳號',
      build: async () => ({ file: routeFile('members', '[id]'), method: 'DELETE', params: { id: String(await memberIdOf(EDITOR.email)) } }),
    },
  ];

  it.each(ROLES.flatMap(([label, user, code]) => CASES.map((c) => [label, c.name, user, code, c] as const)))(
    '%s，%s：403，五張表都沒有改變',
    async (_label, name, user, code, c) => {
      currentUser.mockResolvedValue(user);
      const sample = await seedSample();
      const request = await c.build(sample);
      const before = await snapshotAll();
      await expectRejected(await call(request), code, name);
      expect(await snapshotAll()).toEqual(before);
    },
  );

  it('對照：同一個請求由編輯者送出就會儲存（確認上面被拒是因為權限）', async () => {
    await seedSample();
    currentUser.mockResolvedValue(EDITOR);
    const res = await call({ file: routeFile('tables', '[id]'), method: 'PATCH', params: { id: '3' }, json: { noteName: '供應商' } });
    expect(res.status).toBe(200);
    expect((await prisma.seatTable.findUnique({ where: { id: 3 } }))?.noteName).toBe('供應商');
  });

  it.each(CASES.filter((c) => c.name.startsWith('座位異動') || c.name.startsWith('復原')).map((c) => [c.name, c] as const))(
    '對照：%s 由編輯者送出會成功（確認上面用的是正確的本體）',
    async (_name, c) => {
      currentUser.mockResolvedValue(EDITOR);
      const sample = await seedSample();
      const res = await call(await c.build(sample));
      expect(res.status, await res.clone().text()).toBe(200);
    },
  );

  it('對照：編輯者新增帳號、改權限都會儲存', async () => {
    currentUser.mockResolvedValue(EDITOR);
    expect((await call({ file: routeFile('members'), method: 'POST', json: { email: 'new.viewer@program.com.tw', role: 'VIEWER' } })).status).toBe(201);
    const id = String(await memberIdOf(VIEWER.email));
    expect((await call({ file: routeFile('members', '[id]'), method: 'PATCH', params: { id }, json: { role: 'EDITOR' } })).status).toBe(200);
  });
});

describe('讀取的 API：三種身分（AUTH-R12、AUTH-R15、AUTH-R16、AUTH-AC16、AUTH-AC22、PRM-R21、PRM-AC44）', () => {
  it('GET /api/state：檢視者回 200，資料和編輯者相同（含分機、素食、兒童椅、備註，COM-R19）', async () => {
    await seedSample();
    const res = await call({ file: routeFile('state'), method: 'GET' });
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const shown of ['王小明', '1234', '需要靠走道', '測試科技 董事長', '主桌']) expect(text).toContain(shown);

    currentUser.mockResolvedValue(EDITOR);
    const editorBody = (await (await call({ file: routeFile('state'), method: 'GET' })).json()) as Record<string, unknown>;
    const viewerBody = JSON.parse(text) as Record<string, unknown>;
    for (const key of ['employees', 'participants', 'tables', 'seatsPublished']) expect(viewerBody[key], key).toEqual(editorBody[key]);
  });

  it('GET /api/state：沒有權限回 403 NO_ACCESS，回應不含任何資料（AUTH-AC22）', async () => {
    await seedSample();
    currentUser.mockResolvedValue(DING);
    await expectRejected(await call({ file: routeFile('state'), method: 'GET' }), 'NO_ACCESS', 'GET /api/state');
  });

  it('GET /api/export/seating：編輯者、檢視者都能下載座位表', async () => {
    await seedSample();
    for (const user of [EDITOR, VIEWER]) {
      currentUser.mockResolvedValue(user);
      const res = await call({ file: routeFile('export', 'seating'), method: 'GET' });
      expect(res.status, user.email).toBe(200);
      expect(res.headers.get('Content-Type'), user.email).toContain('spreadsheetml');
    }
  });

  it('GET /api/export/seating：沒有權限回 403 NO_ACCESS（JSON 錯誤，不是座位表）', async () => {
    await seedSample();
    currentUser.mockResolvedValue(DING);
    const res = await call({ file: routeFile('export', 'seating'), method: 'GET' });
    expect(res.headers.get('Content-Type') ?? '').not.toContain('spreadsheetml');
    await expectRejected(res, 'NO_ACCESS', 'GET /api/export/seating');
  });

  it.each([
    ['編輯者', EDITOR],
    ['檢視者', VIEWER],
    ['沒有權限', DING],
  ] as const)('GET /api/seats：%s都回 200（未發布與已發布；PRM-R21、AUTH-AC22）', async (_label, user) => {
    await seedSample();
    currentUser.mockResolvedValue(user);
    const unpublished = await call({ file: routeFile('seats'), method: 'GET' });
    expect(unpublished.status).toBe(200);
    expect(await unpublished.json()).toEqual({ published: false });
    await setPublished(true);
    const published = await call({ file: routeFile('seats'), method: 'GET' });
    expect(published.status).toBe(200);
    expect(((await published.json()) as { published: boolean }).published).toBe(true);
  });

  it('GET /api/members：編輯者 200；檢視者 403 NOT_EDITOR；沒有權限 403 NO_ACCESS，回應不含任何 email（PRM-R06、PRM-AC14、PRM-AC44）', async () => {
    currentUser.mockResolvedValue(EDITOR);
    expect((await call({ file: routeFile('members'), method: 'GET' })).status).toBe(200);
    currentUser.mockResolvedValue(VIEWER);
    await expectRejected(await call({ file: routeFile('members'), method: 'GET' }), 'NOT_EDITOR', 'GET /api/members（檢視者）');
    currentUser.mockResolvedValue(DING);
    await expectRejected(await call({ file: routeFile('members'), method: 'GET' }), 'NO_ACCESS', 'GET /api/members（沒有權限）');
  });
});

describe('權限變更從下一次請求起生效，不必重新登入（AUTH-R11、AUTH-R14、AUTH-R17、PRM-R05）', () => {
  const patchNote = (noteName: string) =>
    call({ file: routeFile('tables', '[id]'), method: 'PATCH', params: { id: '3' }, json: { noteName } });
  const readState = () => call({ file: routeFile('state'), method: 'GET' });
  const noteOf3 = async () => (await prisma.seatTable.findUnique({ where: { id: 3 } }))?.noteName ?? null;

  it('沒有權限 → 加為檢視者 → 改為編輯者 → 改回檢視者 → 移除：每一步的下一個請求都依新的身分判斷', async () => {
    currentUser.mockResolvedValue(DING);
    await expectRejected(await readState(), 'NO_ACCESS', '還沒有權限：讀取');
    await expectRejected(await patchNote('主桌'), 'NO_ACCESS', '還沒有權限：寫入');

    await makeViewer(DING.email);
    expect((await readState()).status).toBe(200);
    await expectRejected(await patchNote('主桌'), 'NOT_EDITOR', '檢視者：寫入');

    await makeEditor(DING.email);
    expect((await patchNote('供應商')).status).toBe(200);
    expect(await noteOf3()).toBe('供應商');

    await makeViewer(DING.email);
    await expectRejected(await patchNote('董事貴賓'), 'NOT_EDITOR', '降為檢視者：寫入');
    expect((await readState()).status).toBe(200);

    await removeMember(DING.email);
    await expectRejected(await readState(), 'NO_ACCESS', '被移除：讀取');
    await expectRejected(await patchNote('董事貴賓'), 'NO_ACCESS', '被移除：寫入');
    expect(await noteOf3()).toBe('供應商');
  });

  it('登入者的 email 大小寫與名單不同，仍依名單上的權限（PRM-R03）', async () => {
    currentUser.mockResolvedValue({ ...EDITOR, email: 'Tester@Program.COM.tw' });
    expect((await patchNote('主桌')).status).toBe(200);
    currentUser.mockResolvedValue({ ...VIEWER, email: ' VIEWER@program.com.tw ' });
    expect((await readState()).status).toBe(200);
    await expectRejected(await patchNote('供應商'), 'NOT_EDITOR', '檢視者（大寫）');
  });

  it('只是網域相同、帳號不在名單上 → 沒有權限：讀取與寫入都是 NO_ACCESS，名單與發布狀態不變', async () => {
    const before = await memberList();
    currentUser.mockResolvedValue({ id: 'other', name: '其他同仁', email: 'other@program.com.tw' });
    await expectRejected(await readState(), 'NO_ACCESS', 'other：讀取');
    await expectRejected(await patchNote('主桌'), 'NO_ACCESS', 'other：寫入');
    expect(await memberList()).toEqual(before);
    expect(await isPublished()).toBe(false);
  });

  it('沒登入時仍是 401，不是 403（先確認登入）', async () => {
    currentUser.mockResolvedValue(null);
    expect((await patchNote('主桌')).status).toBe(401);
    expect((await readState()).status).toBe(401);
    expect((await call({ file: routeFile('seats'), method: 'GET' })).status).toBe(401);
  });
});
