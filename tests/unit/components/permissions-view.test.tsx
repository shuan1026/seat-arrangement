// 權限頁（/permissions）的元件：docs/spec/permissions.md 第 2.1 節（版面、元件、狀態）、PRM-R07～R15、第 4.1 節文案；
// PRM-AC04～AC13、PRM-AC15 的畫面部分；docs/spec/README.md AUTH-R13（被移除權限的人下一次操作被拒、回到座位安排）、
// 共用文案「資料已被其他人更新，已重新載入。」「你沒有編輯權限，已重新載入。」；docs/architecture.md 第 8 節、第 8.2 節
// （EDITOR_EXISTS 時欄位顯示「{email} 已經是編輯者。」並重新載入名單；LAST_EDITOR 與 404 時重新載入並顯示共用文案；
// NOT_EDITOR 時回到座位安排）。走真的伺服器的完整情境在 tests/e2e/permissions-page.spec.ts。用假的 fetch，不連資料庫。
//
// 假設的介面（src/components/features/permissions/permissions-view.tsx）：
//   export function PermissionsView(props: { initialEditors: { id: number; email: string }[] }): JSX.Element
//   - 放在 AppProvider 裡；「移除自己」用 store 的 user.email 判斷（依 PRM-R03 比對）。
//   - API：GET /api/editors → { editors: { id, email }[] }（依加入先後）；POST /api/editors，本體 { email } → { editor: { id, email } }；
//     DELETE /api/editors/{id} → { removedId }。重新載入名單用 GET /api/editors（也可以同時重新載入 GET /api/state）。
//   - 回到座位安排用 next/navigation 的 router.push('/') 或 router.replace('/')。
//   - 提示用 Sonner（@/components/ui/toaster 的 notify，或 AppProvider 的 notify），這裡兩個都接到同一個 <Toaster />。
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/client/app-provider';
import { PermissionsView } from '@/components/features/permissions/permissions-view';
import { Toaster, notify } from '@/components/ui/toaster';
import type { AppState } from '@/contracts/entities';

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
  const g = globalThis as unknown as Record<string, unknown>;
  g.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const w = window as unknown as Record<string, unknown>;
  w.matchMedia ??= (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.scrollIntoView ??= () => {};
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
});

afterEach(() => {
  toast.dismiss();
  vi.unstubAllGlobals();
  router.push.mockReset();
  router.replace.mockReset();
});

type Editor = { id: number; email: string };
type Call = { method: string; path: string; body: Record<string, unknown> | null };
type Reply = { status: number; body: unknown };

const JIA = 'jia@program.com.tw';
const YI = 'yi@program.com.tw';
const BING = 'bing@program.com.tw';
const EMPTY: AppState = { employees: [], participants: [], tables: [] };
const CONFLICT = '資料已被其他人更新，已重新載入。';
const NOT_EDITOR = '你沒有編輯權限，已重新載入。';

const normalize = (s: unknown) => String(s ?? '').trim().toLowerCase();
const apiError = (status: number, code: string): Reply => ({ status, body: { error: { code, message: code } } });

/**
 * 假的 API：server.editors 是伺服器上的名單，依請求改變；override 可以先攔下某些請求（例如模擬別人剛改過名單）。
 * GET /api/state 回目前登入者是否仍在名單上。
 */
function mockApi(server: { editors: Editor[]; me: string }, override: (call: Call) => Reply | undefined = () => undefined) {
  const calls: Call[] = [];
  let nextId = 100;
  const reply = (call: Call): Reply => {
    if (call.method === 'GET' && call.path === '/api/editors') return { status: 200, body: { editors: server.editors } };
    if (call.method === 'GET' && call.path === '/api/state') {
      return { status: 200, body: { ...EMPTY, me: { isEditor: server.editors.some((e) => e.email === server.me) }, seatsPublished: false } };
    }
    if (call.method === 'POST' && call.path === '/api/editors') {
      const email = normalize(call.body?.email);
      if (server.editors.some((e) => e.email === email)) return apiError(409, 'EDITOR_EXISTS');
      const editor = { id: ++nextId, email };
      server.editors = [...server.editors, editor];
      return { status: 201, body: { editor } };
    }
    const del = /^\/api\/editors\/(\d+)$/.exec(call.path);
    if (call.method === 'DELETE' && del) {
      const id = Number(del[1]);
      if (!server.editors.some((e) => e.id === id)) return apiError(404, 'NOT_FOUND');
      if (server.editors.length === 1) return apiError(409, 'LAST_EDITOR');
      server.editors = server.editors.filter((e) => e.id !== id);
      return { status: 200, body: { removedId: id } };
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

function renderView(initial: Editor[], opts: { me?: string; override?: (call: Call) => Reply | undefined } = {}) {
  const me = opts.me ?? JIA;
  const server = { editors: [...initial], me };
  const calls = mockApi(server, opts.override);
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  render(
    <>
      <AppProvider initialData={EMPTY} user={{ name: '甲同仁', email: me }} isEditor notify={(text) => notify(text)}>
        <PermissionsView initialEditors={initial} />
      </AppProvider>
      <Toaster />
    </>,
  );
  return { user, calls, server };
}

const TWO: Editor[] = [
  { id: 1, email: JIA },
  { id: 2, email: YI },
];

const emailField = () => screen.getByRole('textbox', { name: 'email' });
const addButton = () => screen.getByRole('button', { name: '新增編輯者' });
const removeButtons = () => screen.queryAllByRole('button', { name: /^移除 .+@/ });
const removeButton = (email: string) => screen.getByRole('button', { name: `移除 ${email}` });
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true';
const posts = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && c.path === '/api/editors');
const deletes = (calls: Call[]) => calls.filter((c) => c.method === 'DELETE');
const navigatedHome = () => [...router.push.mock.calls, ...router.replace.mock.calls].some((args) => args[0] === '/');

/** 清單依序是這幾位：每位一列、各有「移除 {email}」 */
function expectListed(emails: string[]) {
  expect(removeButtons()).toHaveLength(emails.length);
  const cells = emails.map((email) => screen.getByText(email, { exact: true }));
  for (let i = 1; i < cells.length; i++) {
    expect(cells[i - 1]!.compareDocumentPosition(cells[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${emails[i - 1]} 在 ${emails[i]} 前面`).toBeTruthy();
  }
  for (const email of emails) expect(removeButton(email)).toBeTruthy();
}

const expectNoUndo = () => expect(screen.queryByRole('button', { name: '復原', hidden: true })).toBeNull();

describe('版面與文案（第 2.1 節、第 4.1 節、PRM-AC04）', () => {
  it('H1「權限」、頁面說明、「新增編輯者」區塊（email 欄位、提示文字、欄位說明、按鈕）、「編輯者」清單', () => {
    renderView(TWO);
    expect(screen.getByRole('heading', { level: 1, name: '權限' })).toBeTruthy();
    expect(screen.getByText('編輯者可以修改資料；其他同仁用公司帳號登入後只能檢視。', { exact: true })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '新增編輯者' })).toBeTruthy();
    expect(emailField().getAttribute('placeholder')).toBe('name@program.com.tw');
    expect(screen.getByText('編輯者可以修改所有資料，也能管理權限。', { exact: true })).toBeTruthy();
    expect(addButton()).toBeTruthy();
    expect(screen.getByRole('heading', { name: '編輯者' })).toBeTruthy();
  });

  it('清單依加入的先後列出全部編輯者，每列有「移除」（無障礙名稱「移除 {email}」）（PRM-R07）', () => {
    renderView(TWO);
    expectListed([JIA, YI]);
    for (const email of [JIA, YI]) {
      expect(removeButton(email).textContent?.trim()).toBe('移除');
      expect(isDisabled(removeButton(email))).toBe(false);
    }
    expect(screen.queryByText('至少要有一位編輯者，最後一位不能移除。')).toBeNull();
  });
});

describe('新增（PRM-R08、PRM-R09、PRM-AC05～AC07）', () => {
  it('輸入丙的 email 按「新增編輯者」→ 送出 POST /api/editors；丙加到清單最後，欄位清空；Sonner「已把 bing@program.com.tw 設為編輯者。」，沒有「復原」', async () => {
    const { user, calls } = renderView(TWO);
    await user.type(emailField(), BING);
    await user.click(addButton());

    await waitFor(() => expect(removeButtons()).toHaveLength(3));
    expect(posts(calls)).toHaveLength(1);
    expect(normalize(posts(calls)[0]?.body?.email)).toBe(BING);
    expectListed([JIA, YI, BING]);
    expect((emailField() as HTMLInputElement).value).toBe('');
    expect(await screen.findByText(`已把 ${BING} 設為編輯者。`)).toBeTruthy();
    expectNoUndo();
  });

  it('在欄位內按 Enter 也會新增；大寫與前後空白依 PRM-R03 轉成小寫顯示', async () => {
    const { user } = renderView(TWO);
    await user.type(emailField(), ' Bing@Program.com.tw {Enter}');

    expect(await screen.findByText(`已把 ${BING} 設為編輯者。`)).toBeTruthy();
    expectListed([JIA, YI, BING]);
  });

  it.each([
    ['空白', '', '請輸入 email。'],
    ['只有空白', '   ', '請輸入 email。'],
    ['不是 email 格式', 'abc', '請輸入正確的 email。'],
    ['不是公司網域', 'c@gmail.com', '只能新增公司帳號（@program.com.tw）。'],
  ])('%s「%s」：錯誤顯示在欄位下方「%s」，不送出、名單不變；錯誤不用 Sonner（PRM-AC06）', async (_label, value, message) => {
    const { user, calls } = renderView(TWO);
    if (value) await user.type(emailField(), value);
    await user.click(addButton());

    expect(await screen.findByText(message, { exact: true })).toBeTruthy();
    expect(posts(calls)).toHaveLength(0);
    expectListed([JIA, YI]);
    expect(within(screen.queryByRole('region', { name: /^通知/ }) ?? document.createElement('div')).queryByText(message)).toBeNull();
  });

  it('乙已經是編輯者：輸入「 Yi@Program.com.tw 」按 Enter → 顯示「yi@program.com.tw 已經是編輯者。」，名單不變（PRM-AC07）', async () => {
    const { user } = renderView(TWO);
    await user.type(emailField(), ' Yi@Program.com.tw {Enter}');

    expect(await screen.findByText(`${YI} 已經是編輯者。`, { exact: true })).toBeTruthy();
    expectListed([JIA, YI]);
    expect(screen.queryByText(/設為編輯者。$/)).toBeNull();
  });

  it('按下時丙剛被別人加入（409 EDITOR_EXISTS）：不新增，欄位顯示「bing@program.com.tw 已經是編輯者。」；清單重新載入後有丙，只有一筆（PRM-R10、PRM-AC08）', async () => {
    const { user, server } = renderView(TWO);
    // 乙在這之前已經加入丙，甲的畫面還是舊的
    server.editors = [...server.editors, { id: 50, email: BING }];

    await user.type(emailField(), BING);
    await user.click(addButton());

    expect(await screen.findByText(`${BING} 已經是編輯者。`, { exact: true })).toBeTruthy();
    await waitFor(() => expect(removeButtons()).toHaveLength(3));
    expectListed([JIA, YI, BING]);
    expect(screen.getAllByText(BING, { exact: true })).toHaveLength(1);
    expect(screen.queryByText(`已把 ${BING} 設為編輯者。`)).toBeNull();
  });
});

describe('移除（PRM-R11、PRM-AC09）', () => {
  it('按乙的「移除」→ Alert Dialog 的標題、內文與按鈕；按「取消」不送出、名單不變', async () => {
    const { user, calls } = renderView(TWO);
    await user.click(removeButton(YI));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: `要移除 ${YI} 的編輯權限嗎？` })).toBeTruthy();
    expect(within(dialog).getByText(`移除後 ${YI} 只能檢視，不能再修改資料。`, { exact: true })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '移除編輯權限' })).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: '取消' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deletes(calls)).toHaveLength(0);
    expectListed([JIA, YI]);
  });

  it('再按一次「移除」並按「移除編輯權限」→ 送出 DELETE /api/editors/2；乙從清單移除；Sonner「已移除 yi@program.com.tw 的編輯權限。」，沒有「復原」', async () => {
    const { user, calls } = renderView(TWO);
    await user.click(removeButton(YI));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移除編輯權限' }));

    await waitFor(() => expect(removeButtons()).toHaveLength(1));
    expect(deletes(calls).map((c) => c.path)).toEqual(['/api/editors/2']);
    expectListed([JIA]);
    expect(await screen.findByText(`已移除 ${YI} 的編輯權限。`)).toBeTruthy();
    expectNoUndo();
    expect(navigatedHome()).toBe(false);
  });
});

describe('最後一位（PRM-R04、PRM-R12、PRM-AC10、PRM-AC12）', () => {
  it('名單只有甲：甲的「移除」停用，清單下方顯示「至少要有一位編輯者，最後一位不能移除。」', () => {
    renderView([{ id: 1, email: JIA }]);
    expect(isDisabled(removeButton(JIA))).toBe(true);
    expect(screen.getByText('至少要有一位編輯者，最後一位不能移除。', { exact: true })).toBeTruthy();
  });

  it('乙剛移除了自己（甲的畫面仍有兩位）→ 甲移除自己被拒（409 LAST_EDITOR）：不移除，重新載入，Sonner「資料已被其他人更新，已重新載入。」；清單只有甲，甲的「移除」停用', async () => {
    const { user, server } = renderView(TWO);
    server.editors = server.editors.filter((e) => e.email !== YI);

    await user.click(removeButton(JIA));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移除編輯權限' }));

    expect(await screen.findByText(CONFLICT)).toBeTruthy();
    await waitFor(() => expect(removeButtons()).toHaveLength(1));
    expectListed([JIA]);
    expect(isDisabled(removeButton(JIA))).toBe(true);
    expect(screen.getByText('至少要有一位編輯者，最後一位不能移除。', { exact: true })).toBeTruthy();
    expect(navigatedHome()).toBe(false);
  });
});

describe('移除自己（PRM-R13、PRM-AC11）', () => {
  it('甲按自己那一列的「移除」→ 內文改為「這是你自己的帳號。…」；標題同一般的移除', async () => {
    const { user } = renderView(TWO);
    await user.click(removeButton(JIA));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: `要移除 ${JIA} 的編輯權限嗎？` })).toBeTruthy();
    expect(
      within(dialog).getByText('這是你自己的帳號。移除後你只能檢視，不能再修改資料，也不能再開啟這一頁。', { exact: true }),
    ).toBeTruthy();
    expect(within(dialog).queryByText(`移除後 ${JIA} 只能檢視，不能再修改資料。`)).toBeNull();
  });

  it('登入者的 email 大小寫不同也算自己（PRM-R03）', async () => {
    const { user } = renderView(TWO, { me: 'Jia@Program.com.tw' });
    await user.click(removeButton(JIA));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/^這是你自己的帳號。/)).toBeTruthy();
  });

  it('按「移除編輯權限」→ 送出 DELETE /api/editors/1；回到座位安排；Sonner「已移除 jia@program.com.tw 的編輯權限。」', async () => {
    const { user, calls } = renderView(TWO);
    await user.click(removeButton(JIA));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移除編輯權限' }));

    await waitFor(() => expect(navigatedHome()).toBe(true));
    expect(deletes(calls).map((c) => c.path)).toEqual(['/api/editors/1']);
    expect(await screen.findByText(`已移除 ${JIA} 的編輯權限。`)).toBeTruthy();
  });
});

describe('別人剛改過名單（PRM-R14、PRM-AC13）', () => {
  it('丙剛被乙移除（404）→ 甲移除丙：不儲存，重新載入，Sonner「資料已被其他人更新，已重新載入。」；清單沒有丙', async () => {
    const { user, server } = renderView([...TWO, { id: 3, email: BING }]);
    server.editors = server.editors.filter((e) => e.email !== BING);

    await user.click(removeButton(BING));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移除編輯權限' }));

    expect(await screen.findByText(CONFLICT)).toBeTruthy();
    await waitFor(() => expect(removeButtons()).toHaveLength(2));
    expectListed([JIA, YI]);
  });
});

describe('自己的編輯權限剛被移除（AUTH-R13、PRM-AC15）', () => {
  it('乙移除了甲 → 甲新增丙被拒（403 NOT_EDITOR）：不新增，回到座位安排，Sonner「你沒有編輯權限，已重新載入。」', async () => {
    const { user, server } = renderView(TWO, {
      override: (call) => (call.method === 'POST' ? apiError(403, 'NOT_EDITOR') : undefined),
    });
    server.editors = server.editors.filter((e) => e.email !== JIA);

    await user.type(emailField(), BING);
    await user.click(addButton());

    await waitFor(() => expect(navigatedHome()).toBe(true));
    expect(await screen.findByText(NOT_EDITOR)).toBeTruthy();
    expect(screen.queryByText(`已把 ${BING} 設為編輯者。`)).toBeNull();
  });

  it('乙移除了甲 → 甲移除乙也被拒（403 NOT_EDITOR）：回到座位安排，Sonner「你沒有編輯權限，已重新載入。」', async () => {
    const { user } = renderView(TWO, {
      override: (call) => (call.method === 'DELETE' ? apiError(403, 'NOT_EDITOR') : undefined),
    });
    await user.click(removeButton(YI));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移除編輯權限' }));

    await waitFor(() => expect(navigatedHome()).toBe(true));
    expect(await screen.findByText(NOT_EDITOR)).toBeTruthy();
    expect(screen.queryByText(`已移除 ${YI} 的編輯權限。`)).toBeNull();
  });
});
