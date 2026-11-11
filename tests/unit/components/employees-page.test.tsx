// 員工名單頁送出跨線 API 之後的畫面與資料：用假的 fetch 取代 B 線還沒接上的 API（docs/plan/implementation-plan.md 第 5.2 節），
// 階段 3 接上後由完整情境的 E2E 再驗一次。
// - 一次加入多位：POST /api/participants/bulk-join（docs/spec/employees.md EMP-R22～R24，EMP-AC30～AC32）
// - 單筆加入完成後（B 線的新增人員對話框）store 多了這位員工：勾選與 {n} 跟著變（EMP-R23，EMP-AC33）
// - 取消報名：DELETE /api/participants/{id}（EMP-R30、R31，EMP-AC36、AC37）
// - A 線自己的 API 成功後 store 跟著更新，參與人員與座位圖立即看到新資料（EMP-R02、R39、R43，EMP-AC49、AC53 的前端部分）
// - 「不參加」（D-014）：PUT /api/employees/{id}/declined 的送出內容、畫面與衝突處理（EMP-R03、R08、R17～R19、R25、R27、R31、
//   R63、R65，EMP-AC80～AC83、AC85、AC86 的前端部分）；走真的伺服器的完整情境在 tests/e2e/employees-declined.spec.ts。
//
// 假設：
// - PUT /api/employees/{id}/declined 的本體是 { declined: boolean }，成功回 { employee }（src/contracts/employees.ts 的 employeeResultSchema）；
//   這位員工已報名時回 409、已被刪除時回 404，前端依 COM-R07、COM-R08 重新載入（docs/architecture.md 第 8 節）。
// - src/app/(main)/employees/page.tsx 的預設匯出是同步元件，資料從 useAppStore 讀，放在 AppProvider 裡就能渲染。
// - 呼叫 API 經過 src/client/api.ts（全域 fetch），存檔經過 useMutation（衝突時由 AppProvider 重新載入並用 notify 顯示提示）。
// - 成功訊息用 Sonner（@/components/ui/toaster），這裡一起渲染 <Toaster />，用畫面上的文字確認。
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import EmployeesPage from '@/app/(main)/employees/page';
import { AppProvider, useAppStore } from '@/client/app-provider';
import { Toaster, notify } from '@/components/ui/toaster';
import { STAFF_TABLE_ID, type AppState, type Employee, type Participant } from '@/contracts/entities';
import { displayName, employeeSecondLine } from '@/domain/display';

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
  usePathname: () => '/employees',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// jsdom 沒有的瀏覽器 API（Radix 的 Popper、Checkbox 與 Sonner 會用到）
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
  // Sonner 的提示存在模組層級：不清掉的話，下一個測試掛上 Toaster 時會重放，畫面上出現兩則同樣的文字
  toast.dismiss();
  vi.unstubAllGlobals();
  router.push.mockReset();
});

const USER = { name: '測試承辦人', email: 'tester@program.com.tw' };

const emp = (id: number, name: string, department: string, data: Partial<Employee> = {}): Employee => ({
  id,
  name,
  englishName: null,
  department,
  team: null,
  extension: null,
  region: null,
  office: null,
  note: null,
  declined: false,
  sortOrder: id,
  ...data,
});

const participant = (id: number, data: Partial<Participant> & Pick<Participant, 'kind'>): Participant => ({
  id,
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

const WANG = emp(1, '王小明', '業務部', { extension: '1234' });
const LI = emp(2, '李小華', '研發部', { extension: '2001' });
const ZHANG = emp(3, '張三', '研發部');
const CHEN = emp(4, '陳四', '研發部');
const LIN = emp(5, '林五', '業務部');
/** 李小華已報名，帶一位眷屬，兩人坐 B10 桌（內部編號 5） */
const LI_JOINED = participant(101, { kind: 'EMPLOYEE', employeeId: LI.id, tableId: 5, seatOrder: 0 });
const LI_DEPENDENT = participant(102, { kind: 'DEPENDENT', hostId: LI_JOINED.id, relation: '配偶', tableId: 5, seatOrder: 1 });

// D-027：桌子帶 position（1–30 桌在同號的位置）與 stagedAt
const TABLES: AppState['tables'] = [
  { id: STAFF_TABLE_ID, kind: 'STAFF', position: null, stagedAt: null, noteName: null },
  ...Array.from({ length: 30 }, (_, i) => ({ id: i + 1, kind: 'NORMAL' as const, position: i + 1, stagedAt: null, noteName: null })),
];

const INITIAL: AppState = {
  employees: [WANG, LI, ZHANG, CHEN, LIN],
  participants: [LI_JOINED, LI_DEPENDENT],
  tables: TABLES,
};

type Call = { method: string; url: string; body: unknown };
type Reply = { status: number; body: unknown };

/** 假的 API：依方法與網址回應；沒有對應的請求回 500 */
function mockApi(reply: (call: Call) => Reply | undefined): Call[] {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      method: (init?.method ?? 'GET').toUpperCase(),
      url: String(input),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    };
    calls.push(call);
    const res = reply(call) ?? { status: 500, body: { error: { code: 'INTERNAL', message: `unexpected ${call.method} ${call.url}` } } };
    return { ok: res.status >= 200 && res.status < 300, status: res.status, json: async () => res.body } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

/** 參與人員與座位圖從 store 推導的顯示（參與人員頁、桌次詳情用同一份 domain 函式） */
function ParticipantsProbe() {
  const names = useAppStore((s) => s.data.participants.map((p) => displayName(p, s.dir)).join('、'));
  const secondLines = useAppStore((s) =>
    s.data.participants
      .filter((p) => p.kind === 'EMPLOYEE')
      .map((p) => {
        const e = p.employeeId == null ? undefined : s.dir.employees.get(p.employeeId);
        return e ? employeeSecondLine(e) : '';
      })
      .join('、'),
  );
  return (
    <>
      <output aria-label="參與人員顯示名稱（測試）">{names || '（沒有參與人員）'}</output>
      <output aria-label="員工第二行（測試）">{secondLines}</output>
    </>
  );
}

/** 模擬 B 線的新增人員對話框完成「加入尾牙」：store 多了這位員工的參與人員 */
function JoinedElsewhere() {
  const update = useAppStore((s) => s.update);
  const join = (id: number, employeeId: number) =>
    update((d) => ({ ...d, participants: [...d.participants, participant(id, { kind: 'EMPLOYEE', employeeId })] }));
  return (
    <>
      <button type="button" onClick={() => join(201, WANG.id)}>
        （測試）王小明單筆加入尾牙
      </button>
      <button type="button" onClick={() => join(203, ZHANG.id)}>
        （測試）張三單筆加入尾牙
      </button>
    </>
  );
}

function renderPage(data: AppState = INITIAL) {
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  render(
    <>
      <AppProvider initialData={data} user={USER} notify={(text) => notify(text)}>
        <EmployeesPage />
        <ParticipantsProbe />
        <JoinedElsewhere />
      </AppProvider>
      <Toaster />
    </>,
  );
  return { user };
}

const table = () => screen.getByRole('table');
const rowOf = (name: string) => within(table()).getByRole('row', { name: new RegExp(name) });
const pickBox = (name: string) => within(table()).getByRole('checkbox', { name: `勾選 ${name}` });
const takenBox = (name: string) => within(table()).getByRole('checkbox', { name: `${name} 已報名` });
const declinedBox = (name: string) => within(table()).getByRole('checkbox', { name: `${name} 不參加` });
const bulkButton = () => screen.queryByRole('button', { name: /^加入尾牙（\d+ 位）$/ });
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true';
const probeNames = () => screen.getByLabelText('參與人員顯示名稱（測試）').textContent;
const probeSecondLines = () => screen.getByLabelText('員工第二行（測試）').textContent;

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  const trigger = within(rowOf(name)).getByRole('button', { name: '更多操作' });
  trigger.focus();
  await user.keyboard('{Enter}');
  return screen.findByRole('menu');
}

async function chooseMenuItem(user: ReturnType<typeof userEvent.setup>, name: string, item: string) {
  const menu = await openRowMenu(user, name);
  await user.click(within(menu).getByRole('menuitem', { name: item }));
}

const expectNoUndo = () => expect(screen.queryByRole('button', { name: '復原', hidden: true })).toBeNull();

describe('一次加入多位（EMP-R22～R24）', () => {
  it('EMP-AC30：勾 3 位、確認 → 送出這 3 位且只加員工本人；變成已報名、勾選框停用、Tabs 人數更新；Sonner「已把 3 位員工加入尾牙。」沒有「復原」；批次按鈕消失', async () => {
    const calls = mockApi((c) =>
      c.method === 'POST' && c.url === '/api/participants/bulk-join'
        ? {
            status: 200,
            body: {
              participants: (c.body as { employeeIds: number[] }).employeeIds.map((employeeId, i) =>
                participant(300 + i, { kind: 'EMPLOYEE', employeeId }),
              ),
            },
          }
        : undefined,
    );
    const { user } = renderPage();

    for (const name of ['王小明', '張三', '陳四']) await user.click(pickBox(name));
    await user.click(screen.getByRole('button', { name: '加入尾牙（3 位）' }));
    const dialog = await screen.findByRole('alertdialog', { name: '要把 3 位員工加入尾牙嗎？' });
    expect(within(dialog).getByText('只加入員工本人，眷屬請之後在參與人員補上。')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: '加入尾牙' }));

    await waitFor(() => expect(calls.filter((c) => c.url === '/api/participants/bulk-join')).toHaveLength(1));
    const sent = calls.find((c) => c.url === '/api/participants/bulk-join')!;
    expect(sent.method).toBe('POST');
    expect(Object.keys(sent.body as object)).toEqual(['employeeIds']);
    expect([...(sent.body as { employeeIds: number[] }).employeeIds].sort((a, b) => a - b)).toEqual([1, 3, 4]);

    await screen.findByText('已把 3 位員工加入尾牙。');
    expectNoUndo();
    for (const name of ['王小明', '張三', '陳四']) {
      await waitFor(() => expect(isDisabled(takenBox(name))).toBe(true));
      expect(within(rowOf(name)).getByText('已報名')).toBeTruthy();
    }
    expect(screen.getByRole('tab', { name: /^已報名\s*4$/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^未報名\s*1$/ })).toBeTruthy();
    expect(bulkButton()).toBeNull();
    // 只加員工本人，沒有眷屬
    expect(probeNames()?.split('、').sort()).toEqual(['李小華', '李小華_眷屬', '王小明', '張三', '陳四'].sort());
  });

  it('EMP-AC31：確認對話框按「取消」→ 不送出，沒有任何員工加入尾牙', async () => {
    const calls = mockApi(() => undefined);
    const { user } = renderPage();

    for (const name of ['王小明', '張三', '陳四']) await user.click(pickBox(name));
    await user.click(screen.getByRole('button', { name: '加入尾牙（3 位）' }));
    const dialog = await screen.findByRole('alertdialog', { name: '要把 3 位員工加入尾牙嗎？' });
    await user.click(within(dialog).getByRole('button', { name: '取消' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls).toEqual([]);
    expect(isDisabled(pickBox('王小明'))).toBe(false);
    expect(probeNames()).toBe('李小華、李小華_眷屬');
  });

  it('EMP-AC32：勾選的員工中有人已被別人加入尾牙 → 整批不儲存，重新載入並提示「資料已被其他人更新，已重新載入。」；王小明仍是未報名', async () => {
    const latest: AppState = {
      ...INITIAL,
      participants: [...INITIAL.participants, participant(250, { kind: 'EMPLOYEE', employeeId: ZHANG.id })],
    };
    const calls = mockApi((c) => {
      if (c.url === '/api/participants/bulk-join') {
        return { status: 409, body: { error: { code: 'DUPLICATE_PARTICIPANT', message: 'already joined' } } };
      }
      if (c.method === 'GET' && c.url === '/api/state') return { status: 200, body: latest };
      return undefined;
    });
    const { user } = renderPage();

    await user.click(pickBox('王小明'));
    await user.click(pickBox('張三'));
    await user.click(screen.getByRole('button', { name: '加入尾牙（2 位）' }));
    const dialog = await screen.findByRole('alertdialog', { name: '要把 2 位員工加入尾牙嗎？' });
    await user.click(within(dialog).getByRole('button', { name: '加入尾牙' }));

    await screen.findByText('資料已被其他人更新，已重新載入。');
    expect(calls.some((c) => c.method === 'GET' && c.url === '/api/state')).toBe(true);
    await waitFor(() => expect(isDisabled(takenBox('張三'))).toBe(true));
    expect(isDisabled(pickBox('王小明'))).toBe(false);
    expect(within(rowOf('王小明')).getByText('未報名')).toBeTruthy();
    expect(screen.queryByText('已把 2 位員工加入尾牙。')).toBeNull();
  });

  it('EMP-AC33：已勾選王小明與張三 → 王小明經單筆「加入尾牙」完成 → 他的勾選框停用、批次按鈕變成「加入尾牙（1 位）」；勾選的人都報名後批次按鈕消失（EMP-R23）', async () => {
    mockApi(() => undefined);
    const { user } = renderPage();

    await user.click(pickBox('王小明'));
    await user.click(pickBox('張三'));
    expect(screen.getByRole('button', { name: '加入尾牙（2 位）' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '（測試）王小明單筆加入尾牙' }));
    await waitFor(() => expect(isDisabled(takenBox('王小明'))).toBe(true));
    expect(screen.getByRole('button', { name: '加入尾牙（1 位）' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '（測試）張三單筆加入尾牙' }));
    await waitFor(() => expect(bulkButton()).toBeNull());
  });
});

describe('取消報名（EMP-R30、EMP-R31）', () => {
  it('EMP-AC36：李小華已報名、帶眷屬坐 B10 桌 → 確認取消報名 → 送出 DELETE /api/participants/101；李小華與眷屬從參與人員移除，仍在員工名單、變回未報名；Sonner「已取消 李小華 的報名。」沒有「復原」', async () => {
    const calls = mockApi((c) =>
      c.method === 'DELETE' && c.url === `/api/participants/${LI_JOINED.id}`
        ? { status: 200, body: { removedIds: [LI_JOINED.id, LI_DEPENDENT.id], participants: [] } }
        : undefined,
    );
    const { user } = renderPage();

    await chooseMenuItem(user, '李小華', '取消報名');
    const dialog = await screen.findByRole('alertdialog', { name: '要取消 李小華 的報名嗎？' });
    expect(
      within(dialog).getByText('李小華 會從參與人員移除，眷屬一併移除，已安排的座位會空出來；員工名單不受影響，之後可以再加入。'),
    ).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '返回' })).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: '確認取消報名' }));

    await waitFor(() => expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1));
    await screen.findByText('已取消 李小華 的報名。');
    expectNoUndo();
    await waitFor(() => expect(probeNames()).toBe('（沒有參與人員）'));
    expect(isDisabled(pickBox('李小華'))).toBe(false);
    expect(within(rowOf('李小華')).getByText('未報名')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^已報名\s*0$/ })).toBeTruthy();
  });

  it('EMP-AC37：確認對話框按「返回」→ 不送出，李小華仍是已報名，參與人員不變', async () => {
    const calls = mockApi(() => undefined);
    const { user } = renderPage();

    await chooseMenuItem(user, '李小華', '取消報名');
    const dialog = await screen.findByRole('alertdialog', { name: '要取消 李小華 的報名嗎？' });
    await user.click(within(dialog).getByRole('button', { name: '返回' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls).toEqual([]);
    expect(isDisabled(takenBox('李小華'))).toBe(true);
    expect(probeNames()).toBe('李小華、李小華_眷屬');
  });
});

describe('員工名單的改動立即反映到參與人員與座位圖（EMP-R02、R39、R43）', () => {
  it('編輯已報名的李小華（姓名、分機）→ 送出 PATCH，參與人員顯示新姓名、眷屬「李大華_眷屬」、第二行「研發部・分機 1300」；Sonner「已儲存」', async () => {
    const calls = mockApi((c) =>
      c.method === 'PATCH' && c.url === `/api/employees/${LI.id}`
        ? { status: 200, body: { employee: { ...LI, ...(c.body as Partial<Employee>), id: LI.id, sortOrder: LI.sortOrder } } }
        : undefined,
    );
    const { user } = renderPage();

    await chooseMenuItem(user, '李小華', '編輯');
    const dialog = await screen.findByRole('dialog', { name: '編輯員工' });
    const name = within(dialog).getByRole('textbox', { name: '姓名' });
    const extension = within(dialog).getByRole('textbox', { name: '分機' });
    expect((name as HTMLInputElement).value).toBe('李小華');
    await user.clear(name);
    await user.type(name, '李大華');
    await user.clear(extension);
    await user.type(extension, '1300');
    await user.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ name: '李大華', department: '研發部', extension: '1300' });
    await waitFor(() => expect(probeNames()).toBe('李大華、李大華_眷屬'));
    expect(probeSecondLines()).toBe('研發部・分機 1300');
    await screen.findByText('已儲存');
    expectNoUndo();
    await waitFor(() => expect(within(rowOf('李大華')).getByText('已報名')).toBeTruthy());
  });

  it('刪除已報名的李小華 → 送出 DELETE /api/employees/2，員工與眷屬一併從參與人員移除；Sonner「已刪除 李小華。」沒有「復原」', async () => {
    const calls = mockApi((c) =>
      c.method === 'DELETE' && c.url === `/api/employees/${LI.id}`
        ? {
            status: 200,
            body: { deletedEmployeeId: LI.id, removedParticipantIds: [LI_JOINED.id, LI_DEPENDENT.id], participants: [] },
          }
        : undefined,
    );
    const { user } = renderPage();

    await chooseMenuItem(user, '李小華', '刪除');
    const dialog = await screen.findByRole('alertdialog', { name: '要刪除 李小華 嗎？' });
    expect(within(dialog).getByText('李小華 已報名尾牙，刪除後會一併取消報名、移除眷屬並空出座位。刪除後無法復原。')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: '刪除員工' }));

    await waitFor(() => expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1));
    await waitFor(() => expect(within(table()).queryByRole('row', { name: /李小華/ })).toBeNull());
    await waitFor(() => expect(probeNames()).toBe('（沒有參與人員）'));
    await screen.findByText('已刪除 李小華。');
    expectNoUndo();
    expect(screen.getByRole('tab', { name: /^全部\s*4$/ })).toBeTruthy();
  });
});

describe('不參加（D-014）', () => {
  /** 林五已被標記為不參加；其餘同 INITIAL（李小華已報名，王小明、張三、陳四未報名） */
  const WITH_DECLINED: AppState = {
    ...INITIAL,
    employees: INITIAL.employees.map((e) => (e.id === LIN.id ? { ...e, declined: true } : e)),
  };
  const declinedUrl = (id: number) => `/api/employees/${id}/declined`;
  const declinedCalls = (calls: Call[]) => calls.filter((c) => c.url.endsWith('/declined'));
  /** 假的 PUT /api/employees/{id}/declined：照送出的值回傳這位員工 */
  const acceptDeclined = (state: AppState) => (c: Call) => {
    const m = /^\/api\/employees\/(\d+)\/declined$/.exec(c.url);
    if (c.method !== 'PUT' || !m) return undefined;
    const e = state.employees.find((x) => x.id === Number(m[1]))!;
    return { status: 200, body: { employee: { ...e, declined: (c.body as { declined: boolean }).declined } } };
  };

  it('EMP-AC80：按王小明的「標記為不參加」→ 不開確認對話框，送出 PUT /api/employees/1/declined { declined: true }；狀態「不參加」、勾選框停用；Tabs 更新；Sonner「已把 王小明 標記為不參加。」沒有「復原」（EMP-R63、EMP-R31）', async () => {
    const calls = mockApi(acceptDeclined(INITIAL));
    const { user } = renderPage();

    await chooseMenuItem(user, '王小明', '標記為不參加');
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await waitFor(() => expect(declinedCalls(calls)).toHaveLength(1));
    expect(declinedCalls(calls)[0]).toMatchObject({ method: 'PUT', url: declinedUrl(WANG.id), body: { declined: true } });
    expect(Object.keys(declinedCalls(calls)[0]!.body as object)).toEqual(['declined']);

    await screen.findByText('已把 王小明 標記為不參加。');
    expectNoUndo();
    await waitFor(() => expect(within(rowOf('王小明')).getByText('不參加')).toBeTruthy());
    expect(isDisabled(declinedBox('王小明'))).toBe(true);
    expect(screen.getByRole('tab', { name: /^全部\s*5$/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^未報名\s*3$/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^已報名\s*1$/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^不參加\s*1$/ })).toBeTruthy();
    // 不參加不影響參與人員
    expect(probeNames()).toBe('李小華、李小華_眷屬');
  });

  it('EMP-AC81：林五不參加 → 選單是「加入尾牙」「改回未報名」「編輯」「刪除」；按「改回未報名」→ 送出 { declined: false }，變回未報名、可以勾；Sonner「已把 林五 改回未報名。」沒有「復原」（EMP-R27、EMP-R63）', async () => {
    const calls = mockApi(acceptDeclined(WITH_DECLINED));
    const { user } = renderPage(WITH_DECLINED);

    const menu = await openRowMenu(user, '林五');
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual([
      '加入尾牙',
      '改回未報名',
      '編輯',
      '刪除',
    ]);
    await user.click(within(menu).getByRole('menuitem', { name: '改回未報名' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await waitFor(() => expect(declinedCalls(calls)).toHaveLength(1));
    expect(declinedCalls(calls)[0]).toMatchObject({ method: 'PUT', url: declinedUrl(LIN.id), body: { declined: false } });
    await screen.findByText('已把 林五 改回未報名。');
    expectNoUndo();
    await waitFor(() => expect(isDisabled(pickBox('林五'))).toBe(false));
    expect(within(rowOf('林五')).getByText('未報名')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^不參加\s*0$/ })).toBeTruthy();
  });

  it('未報名與已報名的選單：未報名有「標記為不參加」、沒有「改回未報名」；已報名兩者都沒有（EMP-R27、EMP-AC34、EMP-AC82）', async () => {
    mockApi(() => undefined);
    const { user } = renderPage();

    let menu = await openRowMenu(user, '王小明');
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual([
      '加入尾牙',
      '標記為不參加',
      '編輯',
      '刪除',
    ]);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    menu = await openRowMenu(user, '李小華');
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual([
      '查看參與資料',
      '取消報名',
      '編輯',
      '刪除',
    ]);
  });

  it('EMP-AC83：林五不參加 → 勾選框停用、無障礙名稱「林五 不參加」；按表頭全選只勾未報名的 3 位，批次按鈕「加入尾牙（3 位）」（EMP-R18、R19、R25）', async () => {
    mockApi(() => undefined);
    const { user } = renderPage(WITH_DECLINED);

    expect(isDisabled(declinedBox('林五'))).toBe(true);
    expect(declinedBox('林五').getAttribute('aria-checked')).not.toBe('true');
    expect(within(table()).queryByRole('checkbox', { name: '勾選 林五' })).toBeNull();
    expect(within(rowOf('林五')).getByText('不參加')).toBeTruthy();

    await user.click(within(table()).getByRole('checkbox', { name: '全選這一頁未報名的員工' }));
    expect(screen.getByRole('button', { name: '加入尾牙（3 位）' })).toBeTruthy();
    for (const name of ['王小明', '張三', '陳四']) expect(pickBox(name).getAttribute('aria-checked')).toBe('true');
    expect(declinedBox('林五').getAttribute('aria-checked')).not.toBe('true');
  });

  it('勾選王小明與張三後把王小明標記為不參加 → 他的勾選框停用，批次按鈕變成「加入尾牙（1 位）」，送出時不含王小明（EMP-R18、D-014）', async () => {
    const calls = mockApi((c) => {
      const declined = acceptDeclined(INITIAL)(c);
      if (declined) return declined;
      if (c.method === 'POST' && c.url === '/api/participants/bulk-join') {
        const ids = (c.body as { employeeIds: number[] }).employeeIds;
        return { status: 200, body: { participants: ids.map((employeeId, i) => participant(400 + i, { kind: 'EMPLOYEE', employeeId })) } };
      }
      return undefined;
    });
    const { user } = renderPage();

    await user.click(pickBox('王小明'));
    await user.click(pickBox('張三'));
    expect(screen.getByRole('button', { name: '加入尾牙（2 位）' })).toBeTruthy();
    // 標記為不參加只能單筆操作，勾選後的工具列沒有批次標記（EMP-R63）
    expect(screen.queryByRole('button', { name: /不參加/ })).toBeNull();

    await chooseMenuItem(user, '王小明', '標記為不參加');
    await screen.findByText('已把 王小明 標記為不參加。');
    await waitFor(() => expect(isDisabled(declinedBox('王小明'))).toBe(true));
    expect(screen.getByRole('button', { name: '加入尾牙（1 位）' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '加入尾牙（1 位）' }));
    const dialog = await screen.findByRole('alertdialog', { name: '要把 1 位員工加入尾牙嗎？' });
    await user.click(within(dialog).getByRole('button', { name: '加入尾牙' }));
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/participants/bulk-join')).toHaveLength(1));
    expect(calls.find((c) => c.url === '/api/participants/bulk-join')!.body).toEqual({ employeeIds: [ZHANG.id] });
  });

  it('EMP-AC86：標記為不參加時伺服器回 409（王小明剛被別人加入尾牙）→ 不儲存，重新載入並提示「資料已被其他人更新，已重新載入。」；王小明是已報名（EMP-R65、COM-R07、COM-R08）', async () => {
    const latest: AppState = {
      ...INITIAL,
      participants: [...INITIAL.participants, participant(260, { kind: 'EMPLOYEE', employeeId: WANG.id })],
    };
    const calls = mockApi((c) => {
      if (c.url === declinedUrl(WANG.id)) return { status: 409, body: { error: { code: 'CONFLICT', message: 'registered' } } };
      if (c.method === 'GET' && c.url === '/api/state') return { status: 200, body: latest };
      return undefined;
    });
    const { user } = renderPage();

    await chooseMenuItem(user, '王小明', '標記為不參加');

    await screen.findByText('資料已被其他人更新，已重新載入。');
    expect(calls.some((c) => c.method === 'GET' && c.url === '/api/state')).toBe(true);
    await waitFor(() => expect(isDisabled(takenBox('王小明'))).toBe(true));
    expect(within(rowOf('王小明')).getByText('已報名')).toBeTruthy();
    expect(screen.queryByText('已把 王小明 標記為不參加。')).toBeNull();
    expect(screen.getByRole('tab', { name: /^不參加\s*0$/ })).toBeTruthy();
  });

  it('按「改回未報名」時林五剛被別人刪除（404）→ 不儲存，重新載入並提示；名單上沒有林五（EMP-R65、COM-R07）', async () => {
    const latest: AppState = { ...WITH_DECLINED, employees: WITH_DECLINED.employees.filter((e) => e.id !== LIN.id) };
    mockApi((c) => {
      if (c.url === declinedUrl(LIN.id)) return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'gone' } } };
      if (c.method === 'GET' && c.url === '/api/state') return { status: 200, body: latest };
      return undefined;
    });
    const { user } = renderPage(WITH_DECLINED);

    await chooseMenuItem(user, '林五', '改回未報名');

    await screen.findByText('資料已被其他人更新，已重新載入。');
    await waitFor(() => expect(within(table()).queryByRole('row', { name: /林五/ })).toBeNull());
    expect(screen.queryByText('已把 林五 改回未報名。')).toBeNull();
  });

  it('刪除不參加的林五：確認內文是「刪除後無法復原。」（第 4.1 節「刪除確認：未報名或不參加」、EMP-R41）', async () => {
    const calls = mockApi((c) =>
      c.method === 'DELETE' && c.url === `/api/employees/${LIN.id}`
        ? { status: 200, body: { deletedEmployeeId: LIN.id, removedParticipantIds: [], participants: [] } }
        : undefined,
    );
    const { user } = renderPage(WITH_DECLINED);

    await chooseMenuItem(user, '林五', '刪除');
    const dialog = await screen.findByRole('alertdialog', { name: '要刪除 林五 嗎？' });
    expect(within(dialog).getByText('刪除後無法復原。')).toBeTruthy();
    expect(within(dialog).queryByText(/已報名尾牙/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: '刪除員工' }));

    await waitFor(() => expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1));
    await screen.findByText('已刪除 林五。');
    expect(screen.getByRole('tab', { name: /^不參加\s*0$/ })).toBeTruthy();
  });

  it('Tabs 依序是「全部」「未報名」「已報名」「不參加」，「全部」是三者相加（EMP-R08、第 4.1 節）', () => {
    mockApi(() => undefined);
    renderPage(WITH_DECLINED);
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\s+/g, ' ').trim());
    expect(tabs).toEqual([
      expect.stringMatching(/^全部\s*5$/),
      expect.stringMatching(/^未報名\s*3$/),
      expect.stringMatching(/^已報名\s*1$/),
      expect.stringMatching(/^不參加\s*1$/),
    ]);
  });

  it('EMP-AC85：沒有人不參加、沒有搜尋與篩選 → 按「不參加」顯示「沒有標記為不參加的員工。」，Tabs「不參加 0」（EMP-R17）', async () => {
    mockApi(() => undefined);
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: /^不參加/ }));
    expect(await screen.findByText('沒有標記為不參加的員工。')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^不參加\s*0$/ })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('EMP-AC85：所有人都是已報名或不參加 → 按「未報名」顯示「沒有未報名的員工。」，Tabs「未報名 0」（EMP-R17、EMP-AC24）', async () => {
    mockApi(() => undefined);
    const state: AppState = {
      ...INITIAL,
      employees: INITIAL.employees.map((e) => (e.id === LI.id ? e : { ...e, declined: true })),
    };
    const { user } = renderPage(state);
    await user.click(screen.getByRole('tab', { name: /^未報名/ }));
    expect(await screen.findByText('沒有未報名的員工。')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^未報名\s*0$/ })).toBeTruthy();
    expect(screen.queryByText('所有員工都已報名。')).toBeNull();
  });
});
