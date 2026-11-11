// 只能檢視時三頁隱藏的操作（元件層級）：docs/spec/README.md COM-R19（資料和編輯者相同；會修改資料的入口隱藏，不是停用；
// 列操作選單一個項目都沒有時不顯示列操作按鈕）；docs/spec/seating.md SEAT-R90、2.1.1（編輯者的頁首依序是「新增人員」「匯出座位表」「發布」）；
// docs/spec/participants.md PPL-R86；docs/spec/employees.md EMP-R67；驗收條件 SEAT-AC99、SEAT-AC101、SEAT-AC106、SEAT-AC138（D-028）、PPL-AC85、PPL-AC87、
// EMP-AC89～AC91 的畫面部分；D-021。走真的伺服器的完整情境（拖不動、資料不變、手機）在 tests/e2e/viewer-*.spec.ts。
//
// 假設：AppProvider 的 isEditor prop（tests/unit/client/app-provider-permissions.test.tsx）決定這三頁顯示哪些操作；
// 頁面元件沿用 src/app/(main) 目前的元件：EmployeesView、PeoplePage({ initialEmployeeId })、SeatingPage({ initialTable })。
// 桌號（D-019）：內部編號 3 = B4、7 = B2、8 = B5。
import { render, screen, within } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/client/app-provider';
import { EmployeesView } from '@/components/features/employees/employees-view';
import { PeoplePage } from '@/components/features/people/people-page';
import { SeatingPage } from '@/components/features/seating/seating-page';
import { Toaster } from '@/components/ui/toaster';
import { STAFF_TABLE_ID, type AppState, type Employee, type Participant, type SeatTable } from '@/contracts/entities';

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
  usePathname: () => '/',
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
  localStorage.clear();
  router.push.mockReset();
});

const USER = { name: '檢視同仁', email: 'viewer@program.com.tw' };

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

const B4 = 3;
const B2 = 7;

// D-027：桌子帶 position（1–30 桌在同號的位置）與 stagedAt
const TABLES: SeatTable[] = [
  { id: STAFF_TABLE_ID, kind: 'STAFF', position: null, stagedAt: null, noteName: null },
  ...Array.from({ length: 30 }, (_, i): SeatTable => ({
    id: i + 1,
    kind: 'NORMAL',
    position: i + 1,
    stagedAt: null,
    noteName: i + 1 === B2 ? '主桌' : null,
  })),
];

/** 王小明（研發一部，分機 1234，備註「素食」）已報名、坐 B2 桌、素食；眷屬坐 B2 桌、兒童椅；李小華未報名；陳大文不參加；
 *  林董（外部貴賓，備註「需要靠走道」）坐 B4 桌；周同仁未入座 */
const WANG = emp(1, '王小明', '研發一部', { extension: '1234', note: '素食' });
const LI = emp(2, '李小華', '研發一部');
const CHEN = emp(3, '陳大文', '業務部', { declined: true });
const ZHOU = emp(4, '周同仁', '業務部');
const STATE: AppState = {
  employees: [WANG, LI, CHEN, ZHOU],
  participants: [
    participant(101, { kind: 'EMPLOYEE', employeeId: WANG.id, tableId: B2, seatOrder: 0, vegetarian: true }),
    participant(102, { kind: 'DEPENDENT', hostId: 101, relation: '子女', tableId: B2, seatOrder: 1, childSeat: true }),
    participant(103, { kind: 'GUEST', guestName: '林董', organization: '測試科技 董事長', tableId: B4, seatOrder: 0, note: '需要靠走道' }),
    participant(104, { kind: 'EMPLOYEE', employeeId: ZHOU.id }),
  ],
  tables: TABLES,
};
const NO_PEOPLE: AppState = { employees: [WANG, LI], participants: [], tables: TABLES };
const NO_EMPLOYEES: AppState = { employees: [], participants: [], tables: TABLES };

function renderIn(isEditor: boolean, ui: ReactNode, data: AppState = STATE) {
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response));
  render(
    <>
      <AppProvider initialData={data} user={USER} isEditor={isEditor}>
        {ui}
      </AppProvider>
      <Toaster />
    </>,
  );
  return { user };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 名稱正好是 name 的按鈕（ByRole 的字串名稱是完全相符） */
const button = (name: string) => screen.queryAllByRole('button', { name });

async function openMenu(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement) {
  trigger.focus();
  await user.keyboard('{Enter}');
  return screen.findByRole('menu');
}

describe('員工名單（EMP-R67、EMP-AC89～AC91）', () => {
  const rowOf = (name: string) => within(screen.getByRole('table')).getByRole('row', { name: new RegExp(name) });

  it('只能檢視：資料相同（分機、備註）；頁首沒有「新增員工」「匯入員工名單」；沒有任何勾選框與批次按鈕', () => {
    renderIn(false, <EmployeesView />);
    expect(within(rowOf('王小明')).getByText('1234')).toBeTruthy();
    expect(within(rowOf('王小明')).getByText('素食')).toBeTruthy();
    expect(button('新增員工')).toHaveLength(0);
    expect(button('匯入員工名單')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^加入尾牙（\d+ 位）$/ })).toBeNull();
    // Tabs 照常
    expect(screen.getByRole('tab', { name: /^全部/ })).toBeTruthy();
  });

  it('只能檢視：已報名的王小明只剩「查看參與資料」；未報名的李小華與不參加的陳大文沒有列操作按鈕', async () => {
    const { user } = renderIn(false, <EmployeesView />);
    const menu = await openMenu(user, within(rowOf('王小明')).getByRole('button', { name: '更多操作' }));
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual(['查看參與資料']);
    await user.keyboard('{Escape}');
    expect(within(rowOf('李小華')).queryByRole('button', { name: '更多操作' })).toBeNull();
    expect(within(rowOf('陳大文')).queryByRole('button', { name: '更多操作' })).toBeNull();
  });

  it('只能檢視：沒有任何員工時只有「還沒有員工名單。」，沒有「匯入員工名單」「新增員工」', () => {
    renderIn(false, <EmployeesView />, NO_EMPLOYEES);
    expect(screen.getByText('還沒有員工名單。')).toBeTruthy();
    expect(button('匯入員工名單')).toHaveLength(0);
    expect(button('新增員工')).toHaveLength(0);
  });

  it('編輯者：頁首有「新增員工」「匯入員工名單」，表格有勾選框（對照組）', () => {
    renderIn(true, <EmployeesView />);
    expect(button('新增員工').length).toBeGreaterThan(0);
    expect(button('匯入員工名單').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('checkbox').length).toBeGreaterThan(0);
  });
});

describe('參與人員（PPL-R86、PPL-AC85、PPL-AC87）', () => {
  it('只能檢視：資料相同（分機、備註）；頁首只有「匯出座位表」；沒有列操作按鈕，也沒有列操作欄', () => {
    renderIn(false, <PeoplePage initialEmployeeId={null} />);
    expect(screen.getByRole('heading', { level: 1, name: '參與人員' })).toBeTruthy();
    expect(screen.getAllByText('1234').length).toBeGreaterThan(0);
    expect(screen.getAllByText('需要靠走道').length).toBeGreaterThan(0);
    expect(button('匯出座位表')).toHaveLength(1);
    expect(button('新增人員')).toHaveLength(0);
    expect(button('匯入參與人員')).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: '更多操作' })).toHaveLength(0);
    expect(screen.queryByRole('columnheader', { name: '操作' })).toBeNull();
  });

  it('只能檢視：還沒有參與人員時只有「前往員工名單」，沒有「新增人員」', () => {
    renderIn(false, <PeoplePage initialEmployeeId={null} />, NO_PEOPLE);
    expect(screen.getByText('還沒有參與人員。')).toBeTruthy();
    const goToEmployees = [...screen.queryAllByRole('button', { name: '前往員工名單' }), ...screen.queryAllByRole('link', { name: '前往員工名單' })];
    expect(goToEmployees.length).toBeGreaterThan(0);
    expect(button('新增人員')).toHaveLength(0);
  });

  it('編輯者：頁首有「新增人員」「匯入參與人員」，每列有「更多操作」（對照組）', () => {
    renderIn(true, <PeoplePage initialEmployeeId={null} />);
    expect(button('新增人員').length).toBeGreaterThan(0);
    expect(button('匯入參與人員')).toHaveLength(1);
    expect(screen.queryAllByRole('button', { name: '更多操作' }).length).toBeGreaterThan(0);
  });
});

describe('座位安排（SEAT-R90、SEAT-AC99、SEAT-AC101、SEAT-AC106）', () => {
  it('只能檢視：頁首只有「匯出座位表」，沒有「新增人員」「發布」；工具列沒有「自動排座」，縮放與全部展開照常；沒有拖移把手與列操作', () => {
    renderIn(false, <SeatingPage initialTable={null} />);
    expect(screen.getByRole('heading', { level: 1, name: '座位安排' })).toBeTruthy();
    expect(button('匯出座位表')).toHaveLength(1);
    expect(button('新增人員')).toHaveLength(0);
    expect(button('發布')).toHaveLength(0);
    expect(button('自動排座')).toHaveLength(0);
    for (const name of ['縮小', '放大', '適合視窗', '全部展開']) expect(button(name), name).toHaveLength(1);
    // 連收起來的人員面板裡也不能有（隱藏，不是停用；hidden: true 連看不到的元素一起找）
    expect(screen.queryAllByRole('button', { name: '拖移調換桌次', hidden: true })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: '更多操作', hidden: true })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: '自動排座', hidden: true })).toHaveLength(0);
    // 工具列的「復原」「重做」也隱藏，不是停用（SEAT-R90、SEAT-AC138、D-028）
    expect(screen.queryAllByRole('button', { name: '復原', hidden: true })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: '重做', hidden: true })).toHaveLength(0);
  });

  it('編輯者：頁首依序是「新增人員」「匯出座位表」「發布」；工具列有「自動排座」；桌次有拖移把手（對照組，SEAT-AC106）', () => {
    renderIn(true, <SeatingPage initialTable={null} />);
    const add = button('新增人員')[0];
    const exportButton = button('匯出座位表')[0];
    const publish = button('發布')[0];
    if (!add || !exportButton || !publish) throw new Error('頁首少了按鈕');
    expect(add.compareDocumentPosition(exportButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(exportButton.compareDocumentPosition(publish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button('自動排座')).toHaveLength(1);
    expect(screen.queryAllByRole('button', { name: '拖移調換桌次' }).length).toBeGreaterThan(0);
    // 工具列有「復原」「重做」，剛開啟時沒有步驟、都停用（2.1.3、SEAT-AC129、D-028）
    for (const name of ['復原', '重做']) {
      expect(button(name), name).toHaveLength(1);
      expect((button(name)[0] as HTMLButtonElement).disabled, `${name} 停用`).toBe(true);
    }
  });

  it('只能檢視：B2 桌詳情有「主桌」文字、部門、名單與第二行的分機；沒有備註名稱欄位、常用選項、名單說明、列操作、「加入人員」「調換桌次…」「清空桌次」', async () => {
    const { user } = renderIn(false, <SeatingPage initialTable={null} />);
    await user.click(screen.getByRole('button', { name: /^B2 桌/ }));
    const detail = screen.queryByRole('region', { name: 'B2 桌' }) ?? screen.getByRole('dialog', { name: 'B2 桌' });

    expect(within(detail).getByRole('heading', { name: 'B2 桌' })).toBeTruthy();
    expect(within(detail).getByText('主桌', { exact: true })).toBeTruthy();
    expect(within(detail).getByText('部門：研發一部')).toBeTruthy();
    expect(within(detail).getByText('研發一部・分機 1234')).toBeTruthy();
    expect(within(detail).queryByRole('textbox', { name: '備註名稱' })).toBeNull();
    for (const name of ['董事貴賓', '供應商', '客戶貴賓', '加入人員', '調換桌次…', '清空桌次']) {
      expect(within(detail).queryByRole('button', { name }), name).toBeNull();
    }
    expect(within(detail).queryByText('拖移可以調整順序，也可以從人員面板直接拖進來。')).toBeNull();
    expect(within(detail).queryAllByRole('button', { name: '更多操作' })).toHaveLength(0);
    expect(within(detail).getByRole('button', { name: '關閉' })).toBeTruthy();
  });

  it('只能檢視：B5 桌沒有備註名稱 → 詳情沒有備註名稱那一行（也沒有欄位）', async () => {
    const { user } = renderIn(false, <SeatingPage initialTable={null} />);
    await user.click(screen.getByRole('button', { name: /^B5 桌/ }));
    const detail = screen.queryByRole('region', { name: 'B5 桌' }) ?? screen.getByRole('dialog', { name: 'B5 桌' });
    expect(within(detail).queryByRole('textbox', { name: '備註名稱' })).toBeNull();
    expect(within(detail).queryByText('主桌', { exact: true })).toBeNull();
    expect(within(detail).queryByText(/備註名稱/)).toBeNull();
  });
});

// D-027（seating.md SEAT-R90、SEAT-AC127）：檢視者看得到暫存區、暫存的桌與「未放桌」的位置，但沒有拖移把手、「新增桌」「刪除桌」
// 「移到暫存區」「放到…」；「未放桌」的位置不是按鈕、不能聚焦；點暫存的桌開啟只有名單與「關閉」的詳情。
// 資料：B8（位置 9）是「未放桌」；暫存區有一桌（id 31，坐周同仁）。
describe('座位安排：暫存區與「未放桌」（D-027、SEAT-R90、SEAT-AC127）', () => {
  const B8 = 9;
  const tables: SeatTable[] = [
    ...TABLES.filter((t) => t.position !== B8),
    { id: 31, kind: 'NORMAL', position: null, stagedAt: '2026-11-01T08:00:00.000Z', noteName: null },
  ];
  const withStaging: AppState = {
    ...STATE,
    participants: STATE.participants.map((p) => (p.id === 104 ? { ...p, tableId: 31, seatOrder: 0 } : p)),
    tables,
  };
  const stagingRegion = () => screen.getByRole('region', { name: '暫存區' });
  const stagedButton = () => within(stagingRegion()).getByRole('button', { name: /^暫存，/ });

  it('檢視者：暫存區與暫存的桌照常顯示；B8 有「B8」「未放桌」文字，但不是按鈕；沒有拖移把手', () => {
    renderIn(false, <SeatingPage initialTable={null} />, withStaging);
    expect(stagedButton()).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: 'B8 未放桌', hidden: true })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /未放桌/, hidden: true })).toHaveLength(0);
    expect(screen.getAllByText('未放桌', { exact: true }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button', { name: '拖移調換桌次', hidden: true })).toHaveLength(0);
  });

  it('檢視者：「未放桌」的位置不能聚焦（沒有 tabindex），點了沒有反應', async () => {
    const { user } = renderIn(false, <SeatingPage initialTable={null} />, withStaging);
    const b4 = screen.getByRole('button', { name: /^B4 桌/ });
    for (const el of screen.getAllByText('未放桌', { exact: true })) {
      // 往上找到的第一個可以聚焦的元素若存在，只能是包含其他桌的容器（例如座位圖區），不能是這個位置本身
      const focusable = el.closest('[tabindex]:not([tabindex="-1"]),button,a[href]');
      expect(focusable === null || focusable.contains(b4), '「未放桌」的位置不能聚焦').toBe(true);
      await user.click(el);
    }
    expect(screen.queryByRole('region', { name: 'B8' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'B8' })).toBeNull();
    expect(screen.queryByText('這個位置沒有擺桌。')).toBeNull();
    expect(screen.queryAllByRole('button', { name: '新增桌', hidden: true })).toHaveLength(0);
  });

  it('檢視者：點暫存的桌 → 詳情只有名單與「關閉」，沒有「放到…」「刪除桌」與備註名稱欄位', async () => {
    const { user } = renderIn(false, <SeatingPage initialTable={null} />, withStaging);
    await user.click(stagedButton());
    const detail = screen.queryByRole('region', { name: '暫存區的桌' }) ?? screen.getByRole('dialog', { name: '暫存區的桌' });
    expect(within(detail).getByText('周同仁')).toBeTruthy();
    for (const name of ['放到…', '刪除桌', '加入人員', '調換桌次…', '移到暫存區', '清空桌次']) {
      expect(within(detail).queryByRole('button', { name }), name).toBeNull();
    }
    expect(within(detail).queryByRole('textbox', { name: '備註名稱' })).toBeNull();
    expect(within(detail).queryAllByRole('button', { name: '更多操作' })).toHaveLength(0);
    expect(within(detail).getByRole('button', { name: '關閉' })).toBeTruthy();
  });

  it('檢視者：B4 桌詳情沒有「移到暫存區」「刪除桌」', async () => {
    const { user } = renderIn(false, <SeatingPage initialTable={null} />, withStaging);
    await user.click(screen.getByRole('button', { name: /^B4 桌/ }));
    const detail = screen.queryByRole('region', { name: 'B4 桌' }) ?? screen.getByRole('dialog', { name: 'B4 桌' });
    for (const name of ['移到暫存區', '刪除桌']) expect(within(detail).queryByRole('button', { name }), name).toBeNull();
  });

  it('編輯者（對照組）：B8 是按鈕「B8 未放桌」；暫存的桌有拖移把手', () => {
    renderIn(true, <SeatingPage initialTable={null} />, withStaging);
    expect(screen.getByRole('button', { name: 'B8 未放桌' })).toBeTruthy();
    const stagedGroup = stagedButton().closest('[role="group"]');
    expect(stagedGroup, '暫存的桌是一個 group').not.toBeNull();
    expect(within(stagedGroup as HTMLElement).getByRole('button', { name: '拖移調換桌次' })).toBeTruthy();
  });
});
