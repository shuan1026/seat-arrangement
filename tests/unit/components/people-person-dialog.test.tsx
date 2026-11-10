// 從員工名單「加入尾牙」開啟的人員對話框（PersonDialog mode="join"）。
// 依據：docs/spec/participants.md 第 2.4 節、第 4.3 節、PPL-R61、PPL-R62，以及 PPL-R61 引用的 PPL-R46、PPL-R52～R54、PPL-R56；
// PPL-AC58、PPL-AC59 的對話框部分；待確認 PPL-Q12（加入尾牙並同時加眷屬時的成功訊息）依原型用「已把 {姓名} 加入尾牙。」（D-008）。
// 員工名單頁上的流程在階段 3 測（docs/plan/implementation-plan.md 第 5.2 節）；這裡直接渲染對話框，fetch 用假的，不連資料庫。
//
// 假設的介面（src/components/features/people/person-dialog.tsx）：
//   export function PersonDialog(props: {
//     open: boolean;
//     onOpenChange: (open: boolean) => void;
//     mode: 'create' | 'edit' | 'join';
//     participantId?: number;   // edit：要編輯的參與人員
//     employeeId?: number;      // join：從員工名單帶入的員工
//   }): JSX.Element
//   - 放在 AppProvider 裡，從 useAppStore 讀員工、參與人員與桌次。
//   - 送出用 POST /api/participants（src/contracts/participants.ts）；成功後呼叫 onOpenChange(false)，以 Sonner 顯示結果。
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/client/app-provider';
import { PersonDialog } from '@/components/features/people/person-dialog';
import {
  STAFF_TABLE_ID,
  TABLE_COUNT,
  type AppState,
  type Employee,
  type Participant,
  type SeatTable,
} from '@/contracts/entities';

// Sonner 的提示：記下每一則文字（不論用 toast()、toast.success() 或 components/ui/toaster 的 notify()）
const { toastTexts } = vi.hoisted(() => ({ toastTexts: [] as string[] }));
vi.mock('sonner', () => {
  const record = (text: unknown) => {
    toastTexts.push(typeof text === 'string' ? text : String(text));
    return toastTexts.length;
  };
  const toast = Object.assign(vi.fn(record), {
    success: vi.fn(record),
    info: vi.fn(record),
    warning: vi.fn(record),
    error: vi.fn(record),
    message: vi.fn(record),
    loading: vi.fn(record),
    dismiss: vi.fn(),
  });
  return { toast, Toaster: () => null };
});

// 對話框若用到 Next.js 的路由，給一個不做事的版本
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/employees',
  useSearchParams: () => new URLSearchParams(),
}));

const employee = (id: number, name: string, department: string, extension: string | null): Employee => ({
  id,
  name,
  englishName: null,
  department,
  team: null,
  extension,
  region: null,
  office: null,
  note: null,
  sortOrder: id,
});

const participant = (data: Partial<Participant> & Pick<Participant, 'id' | 'kind'>): Participant => ({
  employeeId: null,
  hostId: null,
  relation: null,
  guestName: null,
  organization: null,
  title: null,
  childSeat: false,
  vegetarian: false,
  note: null,
  tableId: null,
  seatOrder: null,
  createdAt: '2026-11-10T00:00:00.000Z',
  ...data,
});

// 示範資料：王小明、李美華已報名，陳大文（研發一部，沒有分機）未報名
const WANG = employee(1, '王小明', '研發一部', '1234');
const LEE = employee(2, '李美華', '業務部', '5678');
const CHEN = employee(3, '陳大文', '研發一部', null);

const TABLES: SeatTable[] = [
  { id: STAFF_TABLE_ID, kind: 'STAFF', noteName: null },
  ...Array.from({ length: TABLE_COUNT }, (_, i): SeatTable => ({ id: i + 1, kind: 'NORMAL', noteName: null })),
];

const baseState = (): AppState => ({
  employees: [WANG, LEE, CHEN],
  participants: [
    participant({ id: 11, kind: 'EMPLOYEE', employeeId: WANG.id }),
    participant({ id: 12, kind: 'EMPLOYEE', employeeId: LEE.id }),
  ],
  tables: TABLES,
});

const USER = { name: '測試承辦人', email: 'tester@program.com.tw' };

type Call = { url: string; method: string; body: Record<string, unknown> | null };

/** 假的 API：POST /api/participants 回新增的人；GET /api/state 回目前資料 */
function stubApi(state: AppState) {
  const calls: Call[] = [];
  let nextId = 100;
  const respond = (status: number, body: unknown) =>
    ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      calls.push({ url, method, body });
      if (url.endsWith('/api/participants') && method === 'POST' && body) {
        const host = participant({
          id: ++nextId,
          kind: 'EMPLOYEE',
          employeeId: Number(body.employeeId),
          tableId: typeof body.tableId === 'number' ? body.tableId : null,
        });
        const created = [host];
        if (body.dependent) created.push(participant({ id: ++nextId, kind: 'DEPENDENT', hostId: host.id }));
        return respond(200, { participants: created });
      }
      if (url.endsWith('/api/state')) return respond(200, state);
      return respond(404, { error: { code: 'NOT_FOUND', message: 'not stubbed' } });
    }),
  );
  return calls;
}

function renderJoin(state: AppState = baseState()) {
  const calls = stubApi(state);
  const onOpenChange = vi.fn<(open: boolean) => void>();
  render(
    <AppProvider initialData={state} user={USER}>
      <PersonDialog open onOpenChange={onOpenChange} mode="join" employeeId={CHEN.id} />
    </AppProvider>,
  );
  const dialog = screen.getByRole('dialog', { name: '新增人員' });
  return { calls, onOpenChange, dialog };
}

const posts = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/participants'));

/** 欄位不能修改：停用或唯讀 */
const isLocked = (el: HTMLElement) =>
  el.hasAttribute('disabled') ||
  el.hasAttribute('readonly') ||
  el.getAttribute('aria-disabled') === 'true' ||
  el.getAttribute('aria-readonly') === 'true';

/** 欄位顯示的值：輸入框看 value，其他元件看文字 */
const shownValue = (el: HTMLElement) =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : (el.textContent ?? '');

function first<T>(items: T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error('找不到元素');
  return item;
}

beforeAll(() => {
  // jsdom 沒有的瀏覽器 API（Radix 的勾選框與浮層會用到）
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  toastTexts.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PersonDialog：從員工名單加入尾牙（mode="join"）', () => {
  it('標題仍是「新增人員」；類別固定為「員工」且停用；員工欄位帶入陳大文且停用（第 2.4 節、PPL-R61、PPL-AC58）', () => {
    const { dialog } = renderJoin();
    const kind = within(dialog).getByRole('combobox', { name: /^類別/ });
    expect(isLocked(kind)).toBe(true);
    expect(kind.textContent).toContain('員工');

    const employeeField = first(within(dialog).getAllByLabelText(/^員工\*?$/));
    expect(isLocked(employeeField)).toBe(true);
    expect(shownValue(employeeField)).toContain('陳大文（研發一部）');
  });

  it('主要按鈕是「加入尾牙」、次要按鈕是「取消」，沒有「新增人員」按鈕（第 2.4 節、第 4.3 節）', () => {
    const { dialog } = renderJoin();
    expect(within(dialog).getByRole('button', { name: '加入尾牙' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '取消' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: '新增人員' })).toBeNull();
  });

  it('其餘欄位和新增員工相同：需要兒童椅、素食、工作人員、同時加一位眷屬、備註、桌次（預設未入座）（PPL-R61、PPL-R52～R54、PPL-R56）', () => {
    const { dialog } = renderJoin();
    for (const name of ['需要兒童椅', '素食', '工作人員', '同時加一位眷屬']) {
      expect(within(dialog).getByRole('checkbox', { name })).toBeTruthy();
    }
    expect(within(dialog).getByRole('textbox', { name: /^備註/ })).toBeTruthy();
    const table = within(dialog).getByRole('combobox', { name: /^桌次/ });
    expect(table.textContent).toContain('未入座');
  });

  it('按「加入尾牙」：送出陳大文的加入，Sonner「已把 陳大文 加入尾牙。」，關閉對話框（PPL-R62、PPL-AC58）', async () => {
    const user = userEvent.setup();
    const { calls, onOpenChange, dialog } = renderJoin();

    await user.click(within(dialog).getByRole('button', { name: '加入尾牙' }));

    await waitFor(() => expect(toastTexts).toContain('已把 陳大文 加入尾牙。'));
    const post = first(posts(calls));
    expect(post.body).toMatchObject({ kind: 'EMPLOYEE', employeeId: CHEN.id });
    expect(post.body?.dependent ?? null).toBeNull();
    expect(post.body?.isStaff ?? false).toBe(false);
    expect(post.body?.tableId ?? null).toBeNull();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('勾「同時加一位眷屬」才展開眷屬欄位；送出時一併新增眷屬，成功訊息仍是「已把 陳大文 加入尾牙。」（PPL-R46、PPL-AC59、PPL-Q12）', async () => {
    const user = userEvent.setup();
    const { calls, dialog } = renderJoin();

    expect(within(dialog).queryByRole('checkbox', { name: '眷屬需要兒童椅' })).toBeNull();
    await user.click(within(dialog).getByRole('checkbox', { name: '同時加一位眷屬' }));
    expect(within(dialog).getByRole('combobox', { name: /^眷屬稱謂/ })).toBeTruthy();
    expect(within(dialog).getByRole('checkbox', { name: '眷屬素食' })).toBeTruthy();
    await user.click(within(dialog).getByRole('checkbox', { name: '眷屬需要兒童椅' }));

    await user.click(within(dialog).getByRole('button', { name: '加入尾牙' }));

    await waitFor(() => expect(toastTexts).toContain('已把 陳大文 加入尾牙。'));
    expect(toastTexts).not.toContain('已新增 陳大文 與 1 位眷屬。');
    expect(first(posts(calls)).body).toMatchObject({
      kind: 'EMPLOYEE',
      employeeId: CHEN.id,
      dependent: { childSeat: true },
    });
  });

  it('按「取消」：關閉對話框，不送出任何新增（PPL-R60）', async () => {
    const user = userEvent.setup();
    const { calls, onOpenChange, dialog } = renderJoin();
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(posts(calls)).toHaveLength(0);
    expect(toastTexts).toEqual([]);
  });
});
