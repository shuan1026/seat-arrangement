// 只能檢視的人呼叫會修改資料的 API：docs/spec/README.md AUTH-R11（每一次操作依當下的名單判斷；權限變更從下一次操作起生效，不必重新登入）、
// AUTH-R12（只能檢視的人呼叫任何會修改資料的 API 都被拒絕，資料不變；讀取資料的 API 與匯出座位表只要登入）、AUTH-AC16；
// docs/spec/permissions.md PRM-R03（email 去空白、轉小寫後比對）、PRM-R05、PRM-R06（編輯者名單的 API 只接受編輯者）、PRM-AC14、PRM-AC20；
// docs/architecture.md 第 8 節（POST、PUT、PATCH、DELETE 要是編輯者，不是時回 403 NOT_EDITOR）、第 9.3 節（檢查集中在 route()，
// 依 HTTP 方法自動檢查，之後新增的寫入 API 不會漏掉；匯入的 multipart 請求在讀檔前就擋下；GET /api/editors 以 editorOnly 限定編輯者）。
//
// 兩種檢查：
// 1. 掃描 src/app/api 底下所有的 route.ts（同 access.test.ts），每個寫入方法用只能檢視的身分呼叫都回 403 NOT_EDITOR、回應只有錯誤。
// 2. 每一個寫入 API 用「編輯者送出就會成功」的正確本體呼叫，只能檢視時回 403，五張表（員工、參與人員、桌次、編輯者、發布設定）都沒有改變。
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma, resetData } from '../../helpers/db';
import { addEditor, EDITOR, editorEmails, editorIdOf, isPublished, removeEditor, VIEWER, type TestUser } from '../../helpers/editors';
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

async function expectNotEditor(res: Response, label: string) {
  expect(res.status, label).toBe(403);
  const body = (await res.json()) as Record<string, unknown>;
  expect(Object.keys(body), label).toEqual(['error']);
  expect(body.error, label).toMatchObject({ code: 'NOT_EDITOR' });
}

/** 五張表的全部內容（D-021 之後：員工、參與人員、桌次、編輯者名單、發布設定） */
async function snapshotAll() {
  const [employees, participants, tables, editors, settings] = await Promise.all([
    prisma.employee.findMany({ orderBy: { id: 'asc' } }),
    prisma.participant.findMany({ orderBy: { id: 'asc' } }),
    prisma.seatTable.findMany({ orderBy: { id: 'asc' } }),
    prisma.editor.findMany({ orderBy: { id: 'asc' } }),
    prisma.setting.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return { employees, participants, tables, editors, settings };
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

beforeEach(async () => {
  await resetData();
  currentUser.mockReset();
  currentUser.mockResolvedValue(VIEWER);
});

describe('掃描：每個寫入方法在只能檢視時都回 403 NOT_EDITOR（docs/architecture.md 第 9.3 節）', () => {
  it('掃描得到權限與發布的 API（D-021）', () => {
    expect(protectedRoutes).toEqual(
      expect.arrayContaining([routeFile('editors'), routeFile('editors', '[id]'), routeFile('publish'), routeFile('seats')]),
    );
  });

  it.each(protectedRoutes)('%s：每個寫入方法都回 403 NOT_EDITOR，回應只有錯誤，資料不變', async (file) => {
    const mod = (await import(path.join(API_DIR, file))) as Record<string, unknown>;
    const methods = WRITE_METHODS.filter((m) => typeof mod[m] === 'function');
    const before = await snapshotAll();
    for (const method of methods) {
      const res = await call({ file, method, json: method === 'DELETE' ? undefined : {} });
      await expectNotEditor(res, `${method} ${urlOf(file)}`);
    }
    expect(await snapshotAll()).toEqual(before);
  });

  it('匯入的 multipart 請求在讀檔前就擋下：沒有檔案也是 403，不是 400（docs/architecture.md 第 9.3 節）', async () => {
    for (const file of [routeFile('employees', 'import'), routeFile('participants', 'import')]) {
      const res = await call({ file, method: 'POST', form: () => new FormData() });
      await expectNotEditor(res, file);
    }
  });
});

describe('只能檢視時，編輯者會成功的寫入都被拒絕、資料不變（AUTH-R12、AUTH-AC16）', () => {
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
    { name: '座位異動：對調', build: () => ({ file: routeFile('seating', 'operations'), method: 'POST', json: { type: 'swap', tableA: 3, tableB: 7 } }) },
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
    { name: '新增編輯者', build: () => ({ file: routeFile('editors'), method: 'POST', json: { email: 'viewer@program.com.tw' } }) },
    {
      name: '移除編輯者',
      build: async () => ({ file: routeFile('editors', '[id]'), method: 'DELETE', params: { id: String(await editorIdOf(EDITOR.email)) } }),
    },
  ];

  it.each(CASES.map((c) => [c.name, c] as const))('%s：403 NOT_EDITOR，五張表都沒有改變', async (_name, c) => {
    const sample = await seedSample();
    const request = await c.build(sample);
    const before = await snapshotAll();
    await expectNotEditor(await call(request), c.name);
    expect(await snapshotAll()).toEqual(before);
  });

  it('對照：同一個請求由編輯者送出就會儲存（確認上面被拒是因為權限）', async () => {
    await seedSample();
    currentUser.mockResolvedValue(EDITOR);
    const res = await call({ file: routeFile('tables', '[id]'), method: 'PATCH', params: { id: '3' }, json: { noteName: '供應商' } });
    expect(res.status).toBe(200);
    expect((await prisma.seatTable.findUnique({ where: { id: 3 } }))?.noteName).toBe('供應商');
  });
});

describe('讀取的 API 只要登入（AUTH-R12、AUTH-AC16、PRM-R21）', () => {
  it('GET /api/state：只能檢視也回 200，資料和編輯者相同（含分機、素食、兒童椅、備註，COM-R19）', async () => {
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

  it('GET /api/export/seating：只能檢視也能下載座位表', async () => {
    await seedSample();
    const res = await call({ file: routeFile('export', 'seating'), method: 'GET' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml');
  });

  it('GET /api/seats：只能檢視也回 200（PRM-R21）', async () => {
    const res = await call({ file: routeFile('seats'), method: 'GET' });
    expect(res.status).toBe(200);
  });

  it('GET /api/editors：只接受編輯者，只能檢視時回 403 NOT_EDITOR，回應不含任何 email（PRM-R06、PRM-AC14）', async () => {
    const res = await call({ file: routeFile('editors'), method: 'GET' });
    const text = await res.clone().text();
    await expectNotEditor(res, 'GET /api/editors');
    expect(text).not.toContain('@program.com.tw');
  });
});

describe('權限變更從下一次請求起生效，不必重新登入（AUTH-R11、PRM-R05）', () => {
  const patchNote = (noteName: string) =>
    call({ file: routeFile('tables', '[id]'), method: 'PATCH', params: { id: '3' }, json: { noteName } });

  it('只能檢視 → 被設為編輯者 → 下一個請求就能儲存；再被移除 → 下一個請求就被拒', async () => {
    await expectNotEditor(await patchNote('主桌'), '還不是編輯者');

    await addEditor(VIEWER.email);
    expect((await patchNote('供應商')).status).toBe(200);
    expect((await prisma.seatTable.findUnique({ where: { id: 3 } }))?.noteName).toBe('供應商');

    await removeEditor(VIEWER.email);
    await expectNotEditor(await patchNote('董事貴賓'), '已被移除');
    expect((await prisma.seatTable.findUnique({ where: { id: 3 } }))?.noteName).toBe('供應商');
  });

  it('登入者的 email 大小寫與名單不同仍是編輯者（PRM-R03）', async () => {
    currentUser.mockResolvedValue({ ...EDITOR, email: 'Tester@Program.COM.tw' });
    expect((await patchNote('主桌')).status).toBe(200);
  });

  it('只是網域相同、帳號不在名單上 → 只能檢視', async () => {
    currentUser.mockResolvedValue({ id: 'other', name: '其他同仁', email: 'other@program.com.tw' });
    await expectNotEditor(await patchNote('主桌'), 'other');
    expect(await editorEmails()).not.toContain('other@program.com.tw');
    expect(await isPublished()).toBe(false);
  });

  it('沒登入時仍是 401，不是 403（先確認登入）', async () => {
    currentUser.mockResolvedValue(null);
    const res = await patchNote('主桌');
    expect(res.status).toBe(401);
  });
});
