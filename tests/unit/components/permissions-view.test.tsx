// 權限頁（/permissions）的元件：docs/spec/permissions.md v1.2 第 2.1 節（版面、元件、狀態）、PRM-R07～R15、PRM-R35、PRM-R36、第 4.1 節文案；
// PRM-AC04～AC13、AC15、AC37～AC43 的畫面部分；docs/spec/README.md AUTH-R13（被改為檢視者的人下一次操作被拒、回到座位安排）、
// AUTH-R17（被移除權限的人下一次操作被拒，畫面換成「沒有權限」頁，不顯示 Sonner）、共用文案「資料已被其他人更新，已重新載入。」
// 「你沒有編輯權限，已重新載入。」；docs/architecture.md 第 8 節、第 8.2 節（MEMBER_EXISTS 時欄位顯示回應 fields.email 的
// 「{email} 已經是{權限}。」並重新載入名單；LAST_EDITOR 與 404 時重新載入並顯示共用文案；NOT_EDITOR 時回到座位安排；
// NO_ACCESS 時 router.refresh() 讓同一個網址改畫「沒有權限」頁）。走真的伺服器的完整情境在 tests/e2e/permissions-page.spec.ts。
// 用假的 fetch，不連資料庫。
//
// 假設的介面（src/components/features/permissions/permissions-view.tsx）：
//   export function PermissionsView(props: { initialMembers: { id: number; email: string; role: 'EDITOR' | 'VIEWER' }[]; domain?: string }): JSX.Element
//   - 放在 AppProvider 裡；「自己」用 store 的 user.email 判斷（依 PRM-R03 比對）。
//   - API：GET /api/members → { members }；POST /api/members，本體 { email, role } → 201 { member }；
//     PATCH /api/members/{id}，本體 { role } → { member }；DELETE /api/members/{id} → { removedId }。重新載入名單用 GET /api/members。
//   - 「權限」選單用 src/components/ui/select.tsx（combobox + listbox + option）：新增區塊的標籤「權限」，每列的無障礙名稱「{email} 的權限」。
//   - 回到座位安排用 next/navigation 的 router.push('/') 或 router.replace('/')；權限被移除時用 router.refresh()。
//   - 提示用 Sonner（@/components/ui/toaster 的 notify，或 AppProvider 的 notify），這裡兩個都接到同一個 <Toaster />。
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/client/app-provider';
import { PermissionsView } from '@/components/features/permissions/permissions-view';
import { Toaster, notify } from '@/components/ui/toaster';
import type { AppState } from '@/contracts/entities';
import { installDomPolyfills } from '../../helpers/seating-dom';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/permissions',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

beforeAll(() => {
  installDomPolyfills();
});

afterEach(() => {
  toast.dismiss();
  vi.unstubAllGlobals();
  for (const fn of Object.values(router)) fn.mockReset();
});

type Role = 'EDITOR' | 'VIEWER';
type Member = { id: number; email: string; role: Role };
type Call = { method: string; path: string; body: Record<string, unknown> | null };
type Reply = { status: number; body: unknown };

const JIA = 'jia@program.com.tw';
const YI = 'yi@program.com.tw';
const BING = 'bing@program.com.tw';
const EMPTY: AppState = { employees: [], participants: [], tables: [] };
const CONFLICT = '資料已被其他人更新，已重新載入。';
const NOT_EDITOR = '你沒有編輯權限，已重新載入。';
const LABEL: Record<Role, string> = { EDITOR: '編輯者', VIEWER: '檢視者' };

const DESCRIPTION =
  '編輯者可以修改所有資料，也能管理權限；檢視者可以看座位安排、參與人員、員工名單，也能匯出座位表。其他同仁只能看發布的座位表。';
const LAST_EDITOR_NOTE = '至少要有一位編輯者，最後一位不能移除，也不能改為檢視者。';
const SELF_REMOVE_BODY = '這是你自己的帳號。移除後你看不到排座資料，只能看發布的座位表，也不能再開啟這一頁。';
const SELF_DEMOTE_BODY = '這是你自己的帳號。改了之後你只能檢視，不能再修改資料，也不能再開啟這一頁。';

const normalize = (s: unknown) => String(s ?? '').trim().toLowerCase();
const apiError = (status: number, code: string, fields?: Record<string, string>): Reply => ({
  status,
  body: { error: { code, message: code, ...(fields ? { fields } : {}) } },
});

/**
 * 假的 API：server.members 是伺服器上的名單，依請求改變；override 可以先攔下某些請求（例如模擬別人剛改過名單）。
 * GET /api/state 依登入者目前的權限回 me.isEditor；不在名單上回 403 NO_ACCESS。
 */
function mockApi(server: { members: Member[]; me: string }, override: (call: Call) => Reply | undefined = () => undefined) {
  const calls: Call[] = [];
  let nextId = 100;
  const editors = () => server.members.filter((m) => m.role === 'EDITOR');
  const reply = (call: Call): Reply => {
    if (call.method === 'GET' && call.path === '/api/members') return { status: 200, body: { members: server.members } };
    if (call.method === 'GET' && call.path === '/api/state') {
      const me = server.members.find((m) => m.email === normalize(server.me));
      if (!me) return apiError(403, 'NO_ACCESS');
      return { status: 200, body: { ...EMPTY, me: { isEditor: me.role === 'EDITOR' }, seatsPublished: false } };
    }
    if (call.method === 'POST' && call.path === '/api/members') {
      const email = normalize(call.body?.email);
      const role = call.body?.role as Role;
      const existing = server.members.find((m) => m.email === email);
      if (existing) return apiError(409, 'MEMBER_EXISTS', { email: `${email} 已經是${LABEL[existing.role]}。` });
      const member = { id: ++nextId, email, role };
      server.members = [...server.members, member];
      return { status: 201, body: { member } };
    }
    const one = /^\/api\/members\/(\d+)$/.exec(call.path);
    if (one && (call.method === 'PATCH' || call.method === 'DELETE')) {
      const id = Number(one[1]);
      const target = server.members.find((m) => m.id === id);
      if (!target) return apiError(404, 'NOT_FOUND');
      const losesEditor = target.role === 'EDITOR' && (call.method === 'DELETE' || call.body?.role === 'VIEWER');
      if (losesEditor && editors().length <= 1) return apiError(409, 'LAST_EDITOR');
      if (call.method === 'DELETE') {
        server.members = server.members.filter((m) => m.id !== id);
        return { status: 200, body: { removedId: id } };
      }
      const updated = { ...target, role: call.body?.role as Role };
      server.members = server.members.map((m) => (m.id === id ? updated : m));
      return { status: 200, body: { member: updated } };
    }
    return apiError(500, 'INTERNAL');
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
      const call: Call = {
        method: (init?.method ?? 'GET').toUpperCase(),
        path: url.pathname,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
      };
      calls.push(call);
      const res = override(call) ?? reply(call);
      return { ok: res.status >= 200 && res.status < 300, status: res.status, json: async () => res.body } as unknown as Response;
    }),
  );
  return calls;
}

function renderView(initial: Member[], opts: { me?: string; override?: (call: Call) => Reply | undefined } = {}) {
  const me = opts.me ?? JIA;
  const server = { members: initial.map((m) => ({ ...m })), me };
  const calls = mockApi(server, opts.override);
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  render(
    <>
      <AppProvider initialData={EMPTY} user={{ name: '甲同仁', email: me }} isEditor notify={(text) => notify(text)}>
        <PermissionsView initialMembers={initial} />
      </AppProvider>
      <Toaster />
    </>,
  );
  return { user, calls, server };
}

const E = (id: number, email: string): Member => ({ id, email, role: 'EDITOR' });
const V = (id: number, email: string): Member => ({ id, email, role: 'VIEWER' });

const emailField = () => screen.getByRole('textbox', { name: 'email' });
const addRoleSelect = () => screen.getByRole('combobox', { name: '權限' });
const addButton = () => screen.getByRole('button', { name: '新增' });
const roleSelect = (email: string) => screen.getByRole('combobox', { name: `${email} 的權限` });
const rowRoleSelects = () => screen.queryAllByRole('combobox', { name: /^\S+@\S+ 的權限$/ });
const removeButtons = () => screen.queryAllByRole('button', { name: /^移除 \S+@\S+$/ });
const removeButton = (email: string) => screen.getByRole('button', { name: `移除 ${email}` });
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true';
const shown = (el: HTMLElement) => (el.textContent ?? '').trim();
const posts = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && c.path === '/api/members');
const patches = (calls: Call[]) => calls.filter((c) => c.method === 'PATCH');
const deletes = (calls: Call[]) => calls.filter((c) => c.method === 'DELETE');
const navigatedHome = () => [...router.push.mock.calls, ...router.replace.mock.calls].some((args) => args[0] === '/');
const leftPage = () => router.refresh.mock.calls.length > 0 || router.push.mock.calls.length > 0 || router.replace.mock.calls.length > 0;
const toastRegion = () => screen.queryByRole('region', { name: /^通知/ });
const toastTexts = () => (toastRegion()?.textContent ?? '').trim();
/** 這個頁面會出現的 Sonner 文字（新增、改權限、移除的成功提示，與衝突、權限、系統錯誤的提示） */
const ANY_PAGE_TOAST = /已把|已移除|資料已被其他人更新|你沒有編輯權限|系統發生問題|儲存失敗/;
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

/** 在選單選一個選項（選單用 portal，選項在 document.body） */
async function choose(user: ReturnType<typeof userEvent.setup>, select: HTMLElement, option: string) {
  await user.click(select);
  await user.click(await screen.findByRole('option', { name: option }));
}

/** 清單依序是這幾位：每位一列，有 email、權限選單（顯示目前的權限）與「移除 {email}」 */
function expectListed(members: { email: string; role: Role }[]) {
  expect(removeButtons()).toHaveLength(members.length);
  expect(rowRoleSelects()).toHaveLength(members.length);
  const cells = members.map((m) => screen.getByText(m.email, { exact: true }));
  for (let i = 1; i < cells.length; i++) {
    expect(cells[i - 1]!.compareDocumentPosition(cells[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${members[i - 1]?.email} 在 ${members[i]?.email} 前面`).toBeTruthy();
  }
  for (const m of members) {
    expect(shown(roleSelect(m.email)), `${m.email} 的權限`).toBe(LABEL[m.role]);
    expect(removeButton(m.email)).toBeTruthy();
  }
}

const expectNoUndo = () => expect(screen.queryByRole('button', { name: '復原', hidden: true })).toBeNull();

describe('版面與文案（第 2.1 節、第 4.1 節、PRM-AC04）', () => {
  it('H1「權限」、頁面說明、「新增帳號」區塊（email 欄位與提示文字、「權限」選單預設「檢視者」、「新增」）、「帳號」清單；欄位下方沒有說明', () => {
    renderView([E(1, JIA), V(2, YI)]);
    expect(screen.getByRole('heading', { level: 1, name: '權限' })).toBeTruthy();
    expect(screen.getByText(DESCRIPTION, { exact: true })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '新增帳號' })).toBeTruthy();
    expect(emailField().getAttribute('placeholder')).toBe('name@program.com.tw');
    expect(shown(addRoleSelect())).toBe('檢視者');
    expect(addButton()).toBeTruthy();
    expect(screen.getByRole('heading', { name: '帳號' })).toBeTruthy();
    // D-021 的舊文案都不在了
    expect(screen.queryByText('編輯者可以修改所有資料，也能管理權限。', { exact: true })).toBeNull();
    expect(screen.queryByRole('heading', { name: '新增編輯者' })).toBeNull();
    expect(screen.queryByRole('button', { name: '新增編輯者' })).toBeNull();
  });

  it('區塊的順序：H1 → 新增帳號（email、權限、新增）→ 帳號清單', () => {
    renderView([E(1, JIA), V(2, YI)]);
    const order = [
      screen.getByRole('heading', { level: 1, name: '權限' }),
      screen.getByRole('heading', { name: '新增帳號' }),
      emailField(),
      addRoleSelect(),
      addButton(),
      screen.getByRole('heading', { name: '帳號' }),
      screen.getByText(JIA, { exact: true }),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `第 ${i} 個在第 ${i + 1} 個前面`).toBeTruthy();
    }
  });

  it('「權限」選單的選項依序是「檢視者」「編輯者」', async () => {
    const { user } = renderView([E(1, JIA)]);
    await user.click(addRoleSelect());
    const options = await screen.findAllByRole('option');
    expect(options.map(shown)).toEqual(['檢視者', '編輯者']);
  });

  it('PRM-AC04：清單依加入先後是甲「編輯者」、乙「檢視者」；每列有權限選單與「移除」；甲是唯一的編輯者 → 甲那一列停用、乙那一列可以操作，清單下方有說明', () => {
    renderView([E(1, JIA), V(2, YI)]);
    expectListed([E(1, JIA), V(2, YI)]);
    expect(shown(removeButton(JIA))).toBe('移除');
    expect(isDisabled(roleSelect(JIA))).toBe(true);
    expect(isDisabled(removeButton(JIA))).toBe(true);
    expect(isDisabled(roleSelect(YI))).toBe(false);
    expect(isDisabled(removeButton(YI))).toBe(false);
    expect(screen.getByText(LAST_EDITOR_NOTE, { exact: true })).toBeTruthy();
  });

  it('有兩位編輯者：每一列都可以操作，沒有最後一位的說明', () => {
    renderView([E(1, JIA), E(2, YI), V(3, BING)]);
    for (const email of [JIA, YI, BING]) {
      expect(isDisabled(roleSelect(email)), email).toBe(false);
      expect(isDisabled(removeButton(email)), email).toBe(false);
    }
    expect(screen.queryByText(LAST_EDITOR_NOTE)).toBeNull();
  });
});

describe('新增（PRM-R08、PRM-R09、PRM-AC05～AC08、PRM-AC37）', () => {
  it('PRM-AC05：輸入丙、權限維持「檢視者」按「新增」→ 送出 { email, role: VIEWER }；丙以「檢視者」加到清單最後，欄位清空；Sonner「已把 bing@program.com.tw 設為檢視者。」，沒有「復原」', async () => {
    const { user, calls } = renderView([E(1, JIA), E(2, YI)]);
    await user.type(emailField(), BING);
    await user.click(addButton());

    await waitFor(() => expect(removeButtons()).toHaveLength(3));
    expect(posts(calls)).toHaveLength(1);
    expect(normalize(posts(calls)[0]?.body?.email)).toBe(BING);
    expect(posts(calls)[0]?.body?.role).toBe('VIEWER');
    expectListed([E(1, JIA), E(2, YI), V(101, BING)]);
    expect((emailField() as HTMLInputElement).value).toBe('');
    expect(await screen.findByText(`已把 ${BING} 設為檢視者。`)).toBeTruthy();
    expectNoUndo();
  });

  it('PRM-AC37：權限選「編輯者」、在 email 欄位按 Enter → 送出 { role: EDITOR }；丙以「編輯者」加到最後；Sonner「已把 bing@program.com.tw 設為編輯者。」；欄位清空，權限選單回到「檢視者」', async () => {
    const { user, calls } = renderView([E(1, JIA), V(2, YI)]);
    await choose(user, addRoleSelect(), '編輯者');
    expect(shown(addRoleSelect())).toBe('編輯者');
    await user.type(emailField(), `${BING}{Enter}`);

    expect(await screen.findByText(`已把 ${BING} 設為編輯者。`)).toBeTruthy();
    expect(posts(calls).map((c) => c.body?.role)).toEqual(['EDITOR']);
    expectListed([E(1, JIA), V(2, YI), E(101, BING)]);
    expect((emailField() as HTMLInputElement).value).toBe('');
    expect(shown(addRoleSelect())).toBe('檢視者');
    expectNoUndo();
  });

  it('大寫與前後空白依 PRM-R03 轉成小寫顯示', async () => {
    const { user } = renderView([E(1, JIA), E(2, YI)]);
    await user.type(emailField(), ' Bing@Program.com.tw {Enter}');
    expect(await screen.findByText(`已把 ${BING} 設為檢視者。`)).toBeTruthy();
    expectListed([E(1, JIA), E(2, YI), V(101, BING)]);
  });

  it.each([
    ['空白', '', '請輸入 email。'],
    ['只有空白', '   ', '請輸入 email。'],
    ['不是 email 格式', 'abc', '請輸入正確的 email。'],
    ['不是公司網域', 'c@gmail.com', '只能新增公司帳號（@program.com.tw）。'],
  ])('PRM-AC06 %s「%s」：錯誤顯示在欄位「%s」，不送出、名單不變；錯誤不用 Sonner', async (_label, value, message) => {
    const { user, calls } = renderView([E(1, JIA), E(2, YI)]);
    if (value) await user.type(emailField(), value);
    await user.click(addButton());

    expect(await screen.findByText(message, { exact: true })).toBeTruthy();
    expect(posts(calls)).toHaveLength(0);
    expectListed([E(1, JIA), E(2, YI)]);
    expect(toastTexts()).not.toContain(message);
  });

  it('PRM-AC07：乙是檢視者，輸入「 Yi@Program.com.tw 」、權限選「編輯者」按 Enter →「yi@program.com.tw 已經是檢視者。」；名單不變，乙仍是檢視者', async () => {
    const { user } = renderView([E(1, JIA), V(2, YI)]);
    await choose(user, addRoleSelect(), '編輯者');
    await user.type(emailField(), ' Yi@Program.com.tw {Enter}');

    expect(await screen.findByText(`${YI} 已經是檢視者。`, { exact: true })).toBeTruthy();
    expectListed([E(1, JIA), V(2, YI)]);
    expect(screen.queryByText(/設為(編輯者|檢視者)。$/)).toBeNull();
  });

  it('甲是編輯者：輸入甲的 email →「jia@program.com.tw 已經是編輯者。」', async () => {
    const { user } = renderView([E(1, JIA), V(2, YI)]);
    await user.type(emailField(), `${JIA}{Enter}`);
    expect(await screen.findByText(`${JIA} 已經是編輯者。`, { exact: true })).toBeTruthy();
    expectListed([E(1, JIA), V(2, YI)]);
  });

  it('PRM-AC08：按下時丙剛被乙以檢視者加入（409 MEMBER_EXISTS）→ 甲以「編輯者」新增丙：不新增，欄位顯示「bing@program.com.tw 已經是檢視者。」；清單重新載入後有丙，只有一筆、是檢視者', async () => {
    const { user, server } = renderView([E(1, JIA), E(2, YI)]);
    // 乙在這之前已經以檢視者加入丙，甲的畫面還是舊的
    server.members = [...server.members, V(50, BING)];

    await choose(user, addRoleSelect(), '編輯者');
    await user.type(emailField(), BING);
    await user.click(addButton());

    expect(await screen.findByText(`${BING} 已經是檢視者。`, { exact: true })).toBeTruthy();
    await waitFor(() => expect(removeButtons()).toHaveLength(3));
    expectListed([E(1, JIA), E(2, YI), V(50, BING)]);
    expect(screen.getAllByText(BING, { exact: true })).toHaveLength(1);
    expect(screen.queryByText(`已把 ${BING} 設為編輯者。`)).toBeNull();
    expect(toastTexts()).not.toContain('已經是檢視者');
  });
});

describe('移除（PRM-R11、PRM-AC09、PRM-AC38）', () => {
  it('PRM-AC09：按乙（編輯者）的「移除」→ Alert Dialog 的標題、內文與按鈕；按「取消」不送出、名單不變', async () => {
    const { user, calls } = renderView([E(1, JIA), E(2, YI)]);
    await user.click(removeButton(YI));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: `要移除 ${YI} 的權限嗎？` })).toBeTruthy();
    expect(within(dialog).getByText(`移除後 ${YI} 看不到排座資料，只能看發布的座位表。`, { exact: true })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '移除權限' })).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: '取消' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deletes(calls)).toHaveLength(0);
    expectListed([E(1, JIA), E(2, YI)]);
  });

  it('PRM-AC09：再按一次「移除」並按「移除權限」→ 送出 DELETE /api/members/2；乙從清單移除；Sonner「已移除 yi@program.com.tw 的權限。」，沒有「復原」', async () => {
    const { user, calls } = renderView([E(1, JIA), E(2, YI)]);
    await user.click(removeButton(YI));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移除權限' }));

    await waitFor(() => expect(removeButtons()).toHaveLength(1));
    expect(deletes(calls).map((c) => c.path)).toEqual(['/api/members/2']);
    expectListed([E(1, JIA)]);
    expect(await screen.findByText(`已移除 ${YI} 的權限。`)).toBeTruthy();
    expectNoUndo();
    expect(leftPage()).toBe(false);
  });

  it('PRM-AC38：甲是唯一的編輯者、丙是檢視者 → 按丙的「移除」也要確認（標題「要移除 bing@program.com.tw 的權限嗎？」）；按「移除權限」→ 丙移除，Sonner「已移除 bing@program.com.tw 的權限。」', async () => {
    const { user, calls } = renderView([E(1, JIA), V(3, BING)]);
    await user.click(removeButton(BING));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: `要移除 ${BING} 的權限嗎？` })).toBeTruthy();
    expect(deletes(calls)).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: '移除權限' }));

    await waitFor(() => expect(removeButtons()).toHaveLength(1));
    expect(deletes(calls).map((c) => c.path)).toEqual(['/api/members/3']);
    expect(await screen.findByText(`已移除 ${BING} 的權限。`)).toBeTruthy();
    expectNoUndo();
  });
});

describe('最後一位編輯者（PRM-R04、PRM-R12、PRM-AC10、PRM-AC12、PRM-AC42）', () => {
  it('PRM-AC10：名單只有甲：甲的權限選單與「移除」停用，清單下方顯示說明', () => {
    renderView([E(1, JIA)]);
    expect(isDisabled(roleSelect(JIA))).toBe(true);
    expect(isDisabled(removeButton(JIA))).toBe(true);
    expect(screen.getByText(LAST_EDITOR_NOTE, { exact: true })).toBeTruthy();
  });

  it('PRM-AC12：乙剛移除了自己（甲的畫面仍有兩位）→ 甲移除自己被拒（409 LAST_EDITOR）：不移除，重新載入，Sonner「資料已被其他人更新，已重新載入。」；清單只有甲，停用', async () => {
    const { user, server } = renderView([E(1, JIA), E(2, YI)]);
    server.members = server.members.filter((m) => m.email !== YI);

    await user.click(removeButton(JIA));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移除權限' }));

    expect(await screen.findByText(CONFLICT)).toBeTruthy();
    await waitFor(() => expect(removeButtons()).toHaveLength(1));
    expectListed([E(1, JIA)]);
    expect(isDisabled(roleSelect(JIA))).toBe(true);
    expect(isDisabled(removeButton(JIA))).toBe(true);
    expect(screen.getByText(LAST_EDITOR_NOTE, { exact: true })).toBeTruthy();
    expect(leftPage()).toBe(false);
  });

  it('PRM-AC42：乙剛把自己改為檢視者（甲的畫面仍是兩位編輯者）→ 甲把自己改為檢視者並確認被拒（409 LAST_EDITOR）：重新載入，Sonner；甲「編輯者」停用、乙「檢視者」', async () => {
    const { user, server } = renderView([E(1, JIA), E(2, YI)]);
    server.members = [E(1, JIA), V(2, YI)];

    await choose(user, roleSelect(JIA), '檢視者');
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '改為檢視者' }));

    expect(await screen.findByText(CONFLICT)).toBeTruthy();
    await waitFor(() => expect(shown(roleSelect(YI))).toBe('檢視者'));
    expectListed([E(1, JIA), V(2, YI)]);
    expect(isDisabled(roleSelect(JIA))).toBe(true);
    expect(isDisabled(removeButton(JIA))).toBe(true);
    expect(navigatedHome()).toBe(false);
    expect(screen.queryByText(`已把 ${JIA} 改為檢視者。`)).toBeNull();
  });
});

describe('改權限（PRM-R35、PRM-R36、PRM-AC39～AC41）', () => {
  it('PRM-AC39：甲是唯一的編輯者、乙是檢視者 → 在乙的權限選單選「編輯者」：不需確認，立即送出 PATCH { role: EDITOR }；Sonner「已把 yi@program.com.tw 改為編輯者。」，沒有「復原」；乙在原來的位置；甲那一列變成可以操作', async () => {
    const { user, calls } = renderView([E(1, JIA), V(2, YI), V(3, BING)]);
    await choose(user, roleSelect(YI), '編輯者');

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText(`已把 ${YI} 改為編輯者。`)).toBeTruthy();
    expect(patches(calls).map((c) => [c.path, c.body?.role])).toEqual([['/api/members/2', 'EDITOR']]);
    expectListed([E(1, JIA), E(2, YI), V(3, BING)]);
    expectNoUndo();
    await waitFor(() => expect(isDisabled(roleSelect(JIA))).toBe(false));
    expect(isDisabled(removeButton(JIA))).toBe(false);
    expect(screen.queryByText(LAST_EDITOR_NOTE)).toBeNull();
    expect(leftPage()).toBe(false);
  });

  it('PRM-AC40：甲、乙都是編輯者 → 在乙的權限選單選「檢視者」：Alert Dialog 的標題、內文與按鈕，還沒送出；按「取消」→ 不送出，選單仍顯示「編輯者」', async () => {
    const { user, calls } = renderView([E(1, JIA), E(2, YI)]);
    await choose(user, roleSelect(YI), '檢視者');

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: `要把 ${YI} 改為檢視者嗎？` })).toBeTruthy();
    expect(within(dialog).getByText(`改了之後 ${YI} 只能檢視，不能再修改資料。`, { exact: true })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '改為檢視者' })).toBeTruthy();
    expect(patches(calls)).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(patches(calls)).toHaveLength(0);
    expect(shown(roleSelect(YI))).toBe('編輯者');
    expectListed([E(1, JIA), E(2, YI)]);
  });

  it('PRM-AC40：再選一次「檢視者」並按「改為檢視者」→ 送出 PATCH { role: VIEWER }；Sonner「已把 yi@program.com.tw 改為檢視者。」，沒有「復原」；乙顯示「檢視者」，甲變成唯一的編輯者', async () => {
    const { user, calls } = renderView([E(1, JIA), E(2, YI)]);
    await choose(user, roleSelect(YI), '檢視者');
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '改為檢視者' }));

    expect(await screen.findByText(`已把 ${YI} 改為檢視者。`)).toBeTruthy();
    expect(patches(calls).map((c) => [c.path, c.body?.role])).toEqual([['/api/members/2', 'VIEWER']]);
    expectListed([E(1, JIA), V(2, YI)]);
    expectNoUndo();
    await waitFor(() => expect(isDisabled(roleSelect(JIA))).toBe(true));
    expect(screen.getByText(LAST_EDITOR_NOTE, { exact: true })).toBeTruthy();
    expect(leftPage()).toBe(false);
  });

  it('選單選目前的權限：不送出、不開確認', async () => {
    const { user, calls } = renderView([E(1, JIA), E(2, YI), V(3, BING)]);
    await choose(user, roleSelect(YI), '編輯者');
    await choose(user, roleSelect(BING), '檢視者');
    await settle();
    expect(patches(calls)).toHaveLength(0);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('PRM-AC41：甲把自己改為檢視者 → 內文是提醒（標題同一般的改為檢視者）', async () => {
    const { user } = renderView([E(1, JIA), E(2, YI)]);
    await choose(user, roleSelect(JIA), '檢視者');

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: `要把 ${JIA} 改為檢視者嗎？` })).toBeTruthy();
    expect(within(dialog).getByText(SELF_DEMOTE_BODY, { exact: true })).toBeTruthy();
    expect(within(dialog).queryByText(`改了之後 ${JIA} 只能檢視，不能再修改資料。`)).toBeNull();
  });

  it('PRM-AC41：按「改為檢視者」→ 送出 PATCH；回到座位安排；Sonner「已把 jia@program.com.tw 改為檢視者。」', async () => {
    const { user, calls } = renderView([E(1, JIA), E(2, YI)]);
    await choose(user, roleSelect(JIA), '檢視者');
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '改為檢視者' }));

    await waitFor(() => expect(navigatedHome()).toBe(true));
    expect(patches(calls).map((c) => [c.path, c.body?.role])).toEqual([['/api/members/1', 'VIEWER']]);
    expect(await screen.findByText(`已把 ${JIA} 改為檢視者。`)).toBeTruthy();
  });

  it('登入者的 email 大小寫不同也算自己（PRM-R03）', async () => {
    const { user } = renderView([E(1, JIA), E(2, YI)], { me: 'Jia@Program.com.tw' });
    await choose(user, roleSelect(JIA), '檢視者');
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(SELF_DEMOTE_BODY, { exact: true })).toBeTruthy();
  });
});

describe('移除自己（PRM-R13、PRM-AC11）', () => {
  it('甲按自己那一列的「移除」→ 內文改為提醒；標題同一般的移除', async () => {
    const { user } = renderView([E(1, JIA), E(2, YI)]);
    await user.click(removeButton(JIA));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: `要移除 ${JIA} 的權限嗎？` })).toBeTruthy();
    expect(within(dialog).getByText(SELF_REMOVE_BODY, { exact: true })).toBeTruthy();
    expect(within(dialog).queryByText(`移除後 ${JIA} 看不到排座資料，只能看發布的座位表。`)).toBeNull();
  });

  it('登入者的 email 大小寫不同也算自己（PRM-R03）', async () => {
    const { user } = renderView([E(1, JIA), E(2, YI)], { me: 'Jia@Program.com.tw' });
    await user.click(removeButton(JIA));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/^這是你自己的帳號。/)).toBeTruthy();
  });

  it('按「移除權限」→ 送出 DELETE /api/members/1；畫面換成「沒有權限」頁（重新整理或換頁），不顯示 Sonner', async () => {
    const { user, calls } = renderView([E(1, JIA), E(2, YI)]);
    await user.click(removeButton(JIA));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移除權限' }));

    await waitFor(() => expect(leftPage()).toBe(true));
    expect(deletes(calls).map((c) => c.path)).toEqual(['/api/members/1']);
    await settle();
    expect(screen.queryByText(`已移除 ${JIA} 的權限。`)).toBeNull();
    expect(toastTexts()).not.toMatch(ANY_PAGE_TOAST);
  });
});

describe('別人剛改過名單（PRM-R14、PRM-AC13）', () => {
  it('丙剛被乙移除（404）→ 甲移除丙：不儲存，重新載入，Sonner「資料已被其他人更新，已重新載入。」；清單沒有丙', async () => {
    const { user, server } = renderView([E(1, JIA), E(2, YI), V(3, BING)]);
    server.members = server.members.filter((m) => m.email !== BING);

    await user.click(removeButton(BING));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移除權限' }));

    expect(await screen.findByText(CONFLICT)).toBeTruthy();
    await waitFor(() => expect(removeButtons()).toHaveLength(2));
    expectListed([E(1, JIA), E(2, YI)]);
  });

  it('丙剛被乙移除（404）→ 甲把丙改為編輯者：不儲存，重新載入，同樣的提示；清單沒有丙', async () => {
    const { user, server } = renderView([E(1, JIA), E(2, YI), V(3, BING)]);
    server.members = server.members.filter((m) => m.email !== BING);

    await choose(user, roleSelect(BING), '編輯者');

    expect(await screen.findByText(CONFLICT)).toBeTruthy();
    await waitFor(() => expect(removeButtons()).toHaveLength(2));
    expectListed([E(1, JIA), E(2, YI)]);
    expect(screen.queryByText(`已把 ${BING} 改為編輯者。`)).toBeNull();
  });
});

describe('自己的權限剛被改為檢視者（AUTH-R13、PRM-AC15、AUTH-AC18）', () => {
  it('乙把甲改為檢視者 → 甲新增丙被拒（403 NOT_EDITOR）：不新增，回到座位安排，Sonner「你沒有編輯權限，已重新載入。」', async () => {
    const { user, server } = renderView([E(1, JIA), E(2, YI)], {
      override: (call) => (call.method === 'POST' ? apiError(403, 'NOT_EDITOR') : undefined),
    });
    server.members = [V(1, JIA), E(2, YI)];

    await user.type(emailField(), BING);
    await user.click(addButton());

    await waitFor(() => expect(navigatedHome()).toBe(true));
    expect(await screen.findByText(NOT_EDITOR)).toBeTruthy();
    expect(screen.queryByText(`已把 ${BING} 設為檢視者。`)).toBeNull();
  });

  it('乙把甲改為檢視者 → 甲改乙的權限也被拒（403 NOT_EDITOR）：回到座位安排，同樣的提示', async () => {
    const { user, server } = renderView([E(1, JIA), E(2, YI)], {
      override: (call) => (call.method === 'PATCH' ? apiError(403, 'NOT_EDITOR') : undefined),
    });
    server.members = [V(1, JIA), E(2, YI)];

    await choose(user, roleSelect(YI), '檢視者');
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '改為檢視者' }));

    await waitFor(() => expect(navigatedHome()).toBe(true));
    expect(await screen.findByText(NOT_EDITOR)).toBeTruthy();
    expect(screen.queryByText(`已把 ${YI} 改為檢視者。`)).toBeNull();
  });

  it('乙把甲改為檢視者 → 甲移除乙也被拒（403 NOT_EDITOR）：回到座位安排，同樣的提示', async () => {
    const { user } = renderView([E(1, JIA), E(2, YI)], {
      override: (call) => (call.method === 'DELETE' ? apiError(403, 'NOT_EDITOR') : undefined),
    });
    await user.click(removeButton(YI));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移除權限' }));

    await waitFor(() => expect(navigatedHome()).toBe(true));
    expect(await screen.findByText(NOT_EDITOR)).toBeTruthy();
    expect(screen.queryByText(`已移除 ${YI} 的權限。`)).toBeNull();
  });
});

describe('自己的權限剛被移除（AUTH-R17、PRM-AC43）', () => {
  it('乙移除了甲 → 甲新增丙被拒（403 NO_ACCESS）：不新增；router.refresh() 讓同一個網址換成「沒有權限」頁；沒有 Sonner', async () => {
    const { user, server } = renderView([E(1, JIA), E(2, YI)], {
      override: (call) => (call.method === 'POST' ? apiError(403, 'NO_ACCESS') : undefined),
    });
    server.members = [E(2, YI)];

    await user.type(emailField(), BING);
    await user.click(addButton());

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    await settle();
    expect(toastTexts()).not.toMatch(ANY_PAGE_TOAST);
    expect(screen.queryByText(`已把 ${BING} 設為檢視者。`)).toBeNull();
  });

  it('乙移除了甲 → 甲移除乙也被拒（403 NO_ACCESS）：router.refresh()，沒有 Sonner', async () => {
    const { user } = renderView([E(1, JIA), E(2, YI)], {
      override: (call) => (call.method === 'DELETE' ? apiError(403, 'NO_ACCESS') : undefined),
    });
    await user.click(removeButton(YI));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移除權限' }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    await settle();
    expect(toastTexts()).not.toMatch(ANY_PAGE_TOAST);
  });
});
