// GET /api/state 的權限與發布狀態：docs/architecture.md 第 8 節（全部員工、參與人員與桌次，以及目前登入者是否為編輯者 me.isEditor
// （檢視者是 false）與發布狀態 seatsPublished；沒有權限回 403 NO_ACCESS）、第 9.3 節（getRole 每個請求查一次資料庫，不放進 JWT）；
// docs/spec/README.md 第 2 節（三種身分；COM-R19：檢視者看到的資料和編輯者相同）、AUTH-R11（每一次開啟頁面依當下的名單判斷，
// 比對方式見 PRM-R03）、AUTH-R14、AUTH-R16、AUTH-R17；D-021、D-026。資料本身的內容見 state.test.ts。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/state/route';
import { resetData } from '../../helpers/db';
import { DING, EDITOR, makeEditor, makeViewer, removeMember, setPublished, VIEWER, type TestUser } from '../../helpers/editors';
import { createRegisteredEmployee } from '../../helpers/factory';

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn<() => Promise<TestUser | null>>() }));
vi.mock('@/server/auth', () => ({ currentUser }));

type StateJson = {
  employees: { extension: string | null }[];
  participants: { vegetarian: boolean; childSeat: boolean; note: string | null }[];
  me: { isEditor: boolean };
  seatsPublished: boolean;
};

const request = () => GET(new Request('http://localhost:3000/api/state'), { params: Promise.resolve({}) });

async function loadAs(user: TestUser): Promise<StateJson> {
  currentUser.mockResolvedValue(user);
  const res = await request();
  expect(res.status).toBe(200);
  return (await res.json()) as StateJson;
}

/** 沒有權限：403 NO_ACCESS，回應只有錯誤（AUTH-R16） */
async function expectNoAccess(user: TestUser) {
  currentUser.mockResolvedValue(user);
  const res = await request();
  expect(res.status).toBe(403);
  const text = await res.text();
  const body = JSON.parse(text) as Record<string, unknown>;
  expect(Object.keys(body)).toEqual(['error']);
  expect(body.error).toMatchObject({ code: 'NO_ACCESS' });
  return text;
}

beforeEach(async () => {
  await resetData();
  currentUser.mockReset();
});

describe('me.isEditor（AUTH-R11）', () => {
  it('名單上的編輯者：true', async () => {
    expect((await loadAs(EDITOR)).me).toEqual({ isEditor: true });
  });

  it('名單上的檢視者：false', async () => {
    expect((await loadAs(VIEWER)).me).toEqual({ isEditor: false });
  });

  it('不在名單上的公司帳號（丁）：403 NO_ACCESS，拿不到資料（AUTH-R16）', async () => {
    await createRegisteredEmployee({ name: '王小明', department: '研發一部', extension: '1234' }, { note: '需要靠走道' });
    const text = await expectNoAccess(DING);
    for (const secret of ['王小明', '1234', '需要靠走道', 'isEditor', 'seatsPublished']) expect(text).not.toContain(secret);
  });

  it('登入者的 email 大小寫不同仍依名單上的權限（PRM-R03）', async () => {
    expect((await loadAs({ ...EDITOR, email: 'TESTER@program.com.tw' })).me.isEditor).toBe(true);
    expect((await loadAs({ ...VIEWER, email: 'Viewer@Program.com.tw' })).me.isEditor).toBe(false);
  });

  it('沒有權限 → 加為檢視者 → 改為編輯者 → 改回檢視者 → 移除：每一次開啟都依當下的名單，不必重新登入（AUTH-R11、AUTH-R14、AUTH-R17）', async () => {
    await expectNoAccess(DING);
    await makeViewer(DING.email);
    expect((await loadAs(DING)).me.isEditor).toBe(false);
    await makeEditor(DING.email);
    expect((await loadAs(DING)).me.isEditor).toBe(true);
    await makeViewer(DING.email);
    expect((await loadAs(DING)).me.isEditor).toBe(false);
    await removeMember(DING.email);
    await expectNoAccess(DING);
  });
});

describe('檢視者看到的資料和編輯者相同（COM-R19）', () => {
  it('分機、素食、兒童椅、備註都在', async () => {
    await createRegisteredEmployee({ name: '王小明', department: '研發一部', extension: '1234' }, { vegetarian: true, childSeat: true, note: '需要靠走道' });
    const viewer = await loadAs(VIEWER);
    const editor = await loadAs(EDITOR);
    expect(viewer.employees).toEqual(editor.employees);
    expect(viewer.participants).toEqual(editor.participants);
    expect(viewer.employees[0]?.extension).toBe('1234');
    expect(viewer.participants[0]).toMatchObject({ vegetarian: true, childSeat: true, note: '需要靠走道' });
  });
});

describe('seatsPublished（PRM-R17）', () => {
  it('預設 false；發布後是 true；編輯者與檢視者看到的相同', async () => {
    expect((await loadAs(EDITOR)).seatsPublished).toBe(false);
    await setPublished(true);
    expect((await loadAs(EDITOR)).seatsPublished).toBe(true);
    expect((await loadAs(VIEWER)).seatsPublished).toBe(true);
  });
});
