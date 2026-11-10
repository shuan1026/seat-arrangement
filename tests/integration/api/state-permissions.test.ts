// GET /api/state 的權限與發布狀態：docs/architecture.md 第 8 節（全部員工、參與人員與桌次，以及目前登入者是否為編輯者 me.isEditor
// 與發布狀態 seatsPublished）、第 9.3 節（isEditor 每個請求查一次資料庫，不放進 JWT）；docs/spec/README.md 第 2 節（COM-R19：
// 只能檢視的人看到的資料和編輯者相同）、AUTH-R11（每一次開啟頁面依當下的名單判斷，比對方式見 PRM-R03）、AUTH-R14；D-021。
// 資料本身的內容見 state.test.ts。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/state/route';
import { resetData } from '../../helpers/db';
import { addEditor, EDITOR, removeEditor, setPublished, VIEWER, type TestUser } from '../../helpers/editors';
import { createRegisteredEmployee } from '../../helpers/factory';

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn<() => Promise<TestUser | null>>() }));
vi.mock('@/server/auth', () => ({ currentUser }));

type StateJson = {
  employees: { extension: string | null }[];
  participants: { vegetarian: boolean; childSeat: boolean; note: string | null }[];
  me: { isEditor: boolean };
  seatsPublished: boolean;
};

async function loadAs(user: TestUser): Promise<StateJson> {
  currentUser.mockResolvedValue(user);
  const res = await GET(new Request('http://localhost:3000/api/state'), { params: Promise.resolve({}) });
  expect(res.status).toBe(200);
  return (await res.json()) as StateJson;
}

beforeEach(async () => {
  await resetData();
  currentUser.mockReset();
});

describe('me.isEditor（AUTH-R11）', () => {
  it('編輯者名單上的帳號：true', async () => {
    expect((await loadAs(EDITOR)).me).toEqual({ isEditor: true });
  });

  it('不在名單上的公司帳號：false（只能檢視）', async () => {
    expect((await loadAs(VIEWER)).me).toEqual({ isEditor: false });
  });

  it('登入者的 email 大小寫不同仍是編輯者（PRM-R03）', async () => {
    expect((await loadAs({ ...EDITOR, email: 'TESTER@program.com.tw' })).me.isEditor).toBe(true);
  });

  it('被設為編輯者後，下一次開啟就是 true；被移除後下一次開啟就是 false，不必重新登入（AUTH-R11、AUTH-R14）', async () => {
    expect((await loadAs(VIEWER)).me.isEditor).toBe(false);
    await addEditor(VIEWER.email);
    expect((await loadAs(VIEWER)).me.isEditor).toBe(true);
    await removeEditor(VIEWER.email);
    expect((await loadAs(VIEWER)).me.isEditor).toBe(false);
  });
});

describe('只能檢視的人看到的資料和編輯者相同（COM-R19）', () => {
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
  it('預設 false；發布後是 true；兩種權限看到的相同', async () => {
    expect((await loadAs(EDITOR)).seatsPublished).toBe(false);
    await setPublished(true);
    expect((await loadAs(EDITOR)).seatsPublished).toBe(true);
    expect((await loadAs(VIEWER)).seatsPublished).toBe(true);
  });
});
