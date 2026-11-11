// 選擇桌次對話框：docs/spec/seating.md 2.4、4.4、SEAT-R22～R25（入座…、移至其他桌次…）、SEAT-R18、R19（成功的 Sonner 與「復原」）、
// SEAT-R76、R79（復原）、SEAT-R84（只用鍵盤完成）、SEAT-R86（桌次被別人坐滿時的既有提示）、SEAT-Q05（空桌沒有備註名稱時省略「・」，原型的做法）、
// SEAT-R88、SEAT-AC94、SEAT-AC97（D-018：選單類入口仍到 10 位為止，10 位以上的桌停用並標示「已滿」）；
// docs/spec/README.md COM-R07、COM-R08、第 14 節「已復原。」。
// 這個對話框也給參與人員頁（B 線）的列操作使用（SEAT-AC12），所以單獨測元件。
// 桌號（D-019）：選項與 Sonner 用桌號 A1～A15、B1～B15，選項依 A1～A15、B1～B15 排列（SEAT-R04、SEAT-R23）；
// 送出的指令仍用內部編號 tableId（docs/architecture.md）。測試資料用內部編號，對應見 tests/helpers/table-codes.ts
// （3 = B4、5 = B10、6 = B13、7 = B2、8 = B5、9 = B8、12 = B3）。
//
// 假設的元件介面（src/components/features/seating/table-select-dialog.tsx）：
//   export function TableSelectDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; participantId: number }): JSX.Element;
// 放在 AppProvider 裡，資料從 useAppStore 讀，用 useMutation 送出 POST /api/seating/operations。
// 「桌次」欄位用共用的 Select（combobox + listbox + option），標籤「桌次」。
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/client/app-provider';
import { TableSelectDialog } from '@/components/features/seating/table-select-dialog';
import { Toaster } from '@/components/ui/toaster';
import { STAFF_TABLE_ID, type AppState, type Participant } from '@/contracts/entities';
import type { SeatingSnapshot } from '@/contracts/seating';
import { allTables, asEmployee, asGuest, employee } from '../../helpers/seating-fixtures';
import { installDomPolyfills } from '../../helpers/seating-dom';
import { CODES_IN_LIST_ORDER, codeOf } from '../../helpers/table-codes';

// AppProvider 在權限被移除時呼叫 next/navigation 的 router.refresh()（D-026；tests/unit/client/app-provider-permissions.test.tsx），
// 測試環境沒有 Next.js 的 App Router，給一個假的 router
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

beforeAll(() => {
  installDomPolyfills();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const USER = { name: '測試承辦人', email: 'tester@program.com.tw' };
const WANG = 1;

/**
 * 王小明（研發一部、前端組）未入座或坐 B4 桌（內部編號 3）；
 * B2 桌（7）備註名稱「主桌」4 位；B5 桌（8）2 位研發一部；B10 桌（5）10 位業務部（已滿）；B3 桌（12）2 位外部貴賓；
 * 工作人員桌 1 位；其他桌是空桌。
 */
function buildState(wangTable: number | null): AppState {
  const employees = [
    employee(WANG, { name: '王小明', department: '研發一部', team: '前端組', extension: '1234' }),
    ...[71, 72, 73, 74].map((id) => employee(id, { department: '研發一部' })),
    ...[81, 82].map((id) => employee(id, { department: '研發一部' })),
    ...Array.from({ length: 10 }, (_, i) => employee(51 + i, { department: '業務部' })),
    employee(201, { department: '行政部' }),
  ];
  const participants: Participant[] = [
    asEmployee(WANG, wangTable === null ? {} : { tableId: wangTable, seatOrder: 0 }),
    ...[71, 72, 73, 74].map((id, i) => asEmployee(id, { tableId: 7, seatOrder: i })),
    ...[81, 82].map((id, i) => asEmployee(id, { tableId: 8, seatOrder: i })),
    ...Array.from({ length: 10 }, (_, i) => asEmployee(51 + i, { tableId: 5, seatOrder: i })),
    asGuest(121, { tableId: 12, seatOrder: 0 }),
    asGuest(122, { tableId: 12, seatOrder: 1 }),
    asEmployee(201, { tableId: STAFF_TABLE_ID, seatOrder: 0 }),
  ];
  return { employees, participants, tables: allTables({ 7: '主桌' }) };
}

type Sent = { url: string; method: string; body: unknown };

/** 假的 fetch：記錄送出的請求；座位指令依 respond 回應，GET /api/state 回傳 latest */
function stubFetch(state: AppState, respond?: (op: Record<string, unknown>) => { status: number; body: unknown }) {
  const sent: Sent[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    sent.push({ url, method, body });
    if (url === '/api/state') return { ok: true, status: 200, json: async () => state } as unknown as Response;
    const r = (respond ?? defaultRespond(state))(body as Record<string, unknown>);
    return { ok: r.status < 400, status: r.status, json: async () => r.body } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { sent, operations: () => sent.filter((s) => s.url === '/api/seating/operations') };
}

/** 照指令回應：入座回傳王小明的新位置與操作前的狀態；復原回傳快照裡的位置 */
function defaultRespond(state: AppState) {
  const wang = state.participants.find((p) => p.id === WANG)!;
  return (op: Record<string, unknown>) => {
    if (op.type === 'seat') {
      const tableId = op.tableId as number;
      const seatOrder = state.participants.filter((p) => p.tableId === tableId).length;
      const undo: SeatingSnapshot = { participants: [{ id: WANG, tableId: wang.tableId, seatOrder: wang.seatOrder }], tables: [] };
      return { status: 200, body: { participants: [{ ...wang, tableId, seatOrder }], tables: [], undo } };
    }
    if (op.type === 'restore') {
      const snapshot = op.snapshot as SeatingSnapshot;
      const back = snapshot.participants.map((s) => ({ ...wang, tableId: s.tableId, seatOrder: s.seatOrder }));
      return { status: 200, body: { participants: back, tables: [], undo: { participants: [], tables: [] } } };
    }
    return { status: 500, body: { error: { code: 'INTERNAL', message: 'unexpected' } } };
  };
}

function Harness({ participantId, onOpenChange }: { participantId: number; onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <TableSelectDialog
      open={open}
      participantId={participantId}
      onOpenChange={(next) => {
        onOpenChange(next);
        setOpen(next);
      }}
    />
  );
}

function renderDialog(state: AppState, respond?: (op: Record<string, unknown>) => { status: number; body: unknown }) {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const notify = vi.fn<(text: string) => void>();
  const net = stubFetch(state, respond);
  const user = userEvent.setup();
  render(
    <AppProvider initialData={state} user={USER} notify={notify}>
      <Harness participantId={WANG} onOpenChange={onOpenChange} />
      <Toaster />
    </AppProvider>,
  );
  return { user, onOpenChange, notify, ...net };
}

const tableField = () => screen.getByRole('combobox', { name: /^桌次/ });

async function openOptions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(tableField());
  return screen.findAllByRole('option');
}

const labelOf = (el: HTMLElement) => (el.textContent ?? '').trim();

/** 選項開頭的桌號，例如「B2 桌（剩 6 位）・主桌」→ 'B2' */
const codeInLabel = (el: HTMLElement) => /^([AB]\d{1,2}) 桌/.exec(labelOf(el))?.[1];

describe('未入座的人：入座…（SEAT-R22、SEAT-R25、SEAT-AC08）', () => {
  it('標題「安排 {顯示名稱} 入座」，欄位「桌次」，按鈕「確認入座」與「取消」', () => {
    renderDialog(buildState(null));
    expect(screen.getByRole('dialog', { name: '安排 王小明 入座' })).toBeTruthy();
    expect(tableField()).toBeTruthy();
    expect(screen.getByRole('button', { name: '確認入座' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy();
  });

  it('列出 30 桌，不列工作人員桌（SEAT-R23、SEAT-AC10）', async () => {
    const { user } = renderDialog(buildState(null));
    const options = await openOptions(user);
    expect(options).toHaveLength(30);
    for (let n = 1; n <= 30; n++) {
      expect(options.filter((o) => labelOf(o).startsWith(`${codeOf(n)} 桌`)), `${codeOf(n)} 桌`).toHaveLength(1);
    }
    expect(options.some((o) => labelOf(o).includes('工作人員'))).toBe(false);
  });

  it('選項依 A1～A15、B1～B15 的順序排列（SEAT-R04、SEAT-R23、D-019）', async () => {
    const { user } = renderDialog(buildState(null));
    const options = await openOptions(user);
    expect(options.map(codeInLabel)).toEqual(CODES_IN_LIST_ORDER);
  });

  it('選項不用「第 n 桌」，也不寫成「A-1」（README 第 13 節用語表）', async () => {
    const { user } = renderDialog(buildState(null));
    const options = await openOptions(user);
    for (const o of options) {
      expect(labelOf(o), labelOf(o)).not.toMatch(/第\s*\d+\s*桌/);
      expect(labelOf(o), labelOf(o)).not.toMatch(/[AB]-\d/);
    }
  });

  it('選項格式「{桌號} 桌（剩 {k} 位）・{備註名稱或部門}」：有備註名稱用備註名稱，沒有時用部門（SEAT-R23、SEAT-AC10）', async () => {
    const { user } = renderDialog(buildState(null));
    const options = await openOptions(user);
    const byTable = (n: number) => options.find((o) => labelOf(o).startsWith(`${codeOf(n)} 桌（`))!;
    expect(labelOf(byTable(7))).toBe('B2 桌（剩 6 位）・主桌');
    expect(labelOf(byTable(8))).toBe('B5 桌（剩 8 位）・研發一部');
    expect(labelOf(byTable(12))).toBe('B3 桌（剩 8 位）・貴賓');
  });

  it('空桌又沒有備註名稱：省略「・{部門}」（SEAT-Q05 的目前假設）', async () => {
    const { user } = renderDialog(buildState(null));
    const options = await openOptions(user);
    expect(labelOf(options.find((o) => labelOf(o).startsWith('B8 桌（'))!)).toBe('B8 桌（剩 10 位）');
  });

  it('已滿的桌次停用並標示「已滿」，選不到（SEAT-R23、SEAT-AC17）', async () => {
    const { user, operations } = renderDialog(buildState(null));
    const options = await openOptions(user);
    const full = options.find((o) => labelOf(o).startsWith('B10 桌'))!;
    expect(full.getAttribute('aria-disabled')).toBe('true');
    expect(labelOf(full)).toContain('已滿');
    for (const o of options.filter((x) => !labelOf(x).startsWith('B10 桌'))) {
      expect(o.getAttribute('aria-disabled'), labelOf(o)).not.toBe('true');
    }

    await user.click(full);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: '確認入座' }));
    expect(await screen.findByText('請選擇桌次。')).toBeTruthy();
    expect(operations()).toHaveLength(0);
  });

  it('沒選桌次就按「確認入座」：欄位下方顯示「請選擇桌次。」，對話框不關閉，不入座（SEAT-R24、SEAT-AC11）', async () => {
    const { user, onOpenChange, operations } = renderDialog(buildState(null));
    await user.click(screen.getByRole('button', { name: '確認入座' }));
    expect(await screen.findByText('請選擇桌次。')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: '安排 王小明 入座' })).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(operations()).toHaveLength(0);
  });

  it('選 B2 桌確認：送出入座指令（內部編號 7，排到名單最後），對話框關閉，顯示 Sonner 與「復原」（SEAT-R18、SEAT-R25、SEAT-AC08）', async () => {
    const { user, onOpenChange, operations } = renderDialog(buildState(null));
    await openOptions(user);
    await user.click(screen.getByRole('option', { name: /^B2 桌/ }));
    await user.click(screen.getByRole('button', { name: '確認入座' }));

    await waitFor(() => expect(operations()).toHaveLength(1));
    const op = operations()[0]!;
    expect(op.method).toBe('POST');
    expect(op.body).toMatchObject({ type: 'seat', participantId: WANG, tableId: 7 });
    const index = (op.body as { index?: number }).index;
    expect(index === undefined || index === 4, '排到名單最後').toBe(true);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '安排 王小明 入座' })).toBeNull());
    expect(await screen.findByText('已把 王小明 安排到 B2 桌。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '復原' })).toBeTruthy();
  });

  it('按 Sonner 的「復原」：把這次的 undo 送回 restore，顯示「已復原。」（SEAT-R76、SEAT-R78、SEAT-R79）', async () => {
    const { user, operations } = renderDialog(buildState(null));
    await openOptions(user);
    await user.click(screen.getByRole('option', { name: /^B2 桌/ }));
    await user.click(screen.getByRole('button', { name: '確認入座' }));
    await user.click(await screen.findByRole('button', { name: '復原' }));

    await waitFor(() => expect(operations()).toHaveLength(2));
    expect(operations()[1]!.body).toEqual({
      type: 'restore',
      snapshot: { participants: [{ id: WANG, tableId: null, seatOrder: null }], tables: [] },
    });
    expect(await screen.findByText('已復原。')).toBeTruthy();
  });

  it('按「取消」：關閉，不送出任何指令', async () => {
    const { user, onOpenChange, operations } = renderDialog(buildState(null));
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(operations()).toHaveLength(0);
  });

  it('桌次已被別人坐滿：重新載入最新資料，顯示「B2 桌已滿，請先移出一位。」（SEAT-R86、COM-R07、COM-R08、SEAT-AC97）', async () => {
    const { user, notify, sent } = renderDialog(buildState(null), () => ({
      status: 409,
      body: { error: { code: 'TABLE_FULL', message: 'table full' } },
    }));
    await openOptions(user);
    await user.click(screen.getByRole('option', { name: /^B2 桌/ }));
    await user.click(screen.getByRole('button', { name: '確認入座' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('B2 桌已滿，請先移出一位。'));
    expect(sent.some((s) => s.url === '/api/state')).toBe(true);
    expect(screen.queryByText('已把 王小明 安排到 B2 桌。')).toBeNull();
  });

  it('只用鍵盤就能選桌次並確認（SEAT-R84）', async () => {
    const { user, operations } = renderDialog(buildState(null));
    tableField().focus();
    await user.keyboard('{ArrowDown}');
    await screen.findAllByRole('option');

    const activeLabel = () => {
      const id = document.activeElement?.getAttribute('aria-activedescendant');
      return id ? (document.getElementById(id)?.textContent ?? '') : '';
    };
    for (let i = 0; i < 40 && !activeLabel().startsWith('B2 桌'); i++) await user.keyboard('{ArrowDown}');
    expect(activeLabel().startsWith('B2 桌')).toBe(true);
    await user.keyboard('{Enter}');

    const confirm = screen.getByRole('button', { name: '確認入座' });
    for (let i = 0; i < 10 && document.activeElement !== confirm; i++) await user.tab();
    expect(document.activeElement).toBe(confirm);
    await user.keyboard('{Enter}');

    await waitFor(() => expect(operations()).toHaveLength(1));
    expect(operations()[0]!.body).toMatchObject({ type: 'seat', participantId: WANG, tableId: 7 });
  });
});

/**
 * D-018：拖移或「加入人員」可以讓一桌有 11、12 位；選擇桌次對話框仍到 10 位為止（SEAT-R23、SEAT-R88）。
 * 王小明未入座或坐 B4 桌（3）；B10 桌（5）10 位、B13 桌（6）11 位、B8 桌（9）12 位（都是業務部）、B2 桌（7）9 位。
 */
function buildOverflowState(wangTable: number | null): AppState {
  const people: [table: number, count: number, firstId: number][] = [
    [5, 10, 500],
    [6, 11, 600],
    [9, 12, 900],
    [7, 9, 700],
  ];
  const employees = [employee(WANG, { name: '王小明', department: '研發一部' })];
  const participants: Participant[] = [asEmployee(WANG, wangTable === null ? {} : { tableId: wangTable, seatOrder: 0 })];
  for (const [table, count, first] of people) {
    for (let i = 0; i < count; i++) {
      employees.push(employee(first + i, { department: '業務部' }));
      participants.push(asEmployee(first + i, { tableId: table, seatOrder: i }));
    }
  }
  return { employees, participants, tables: allTables() };
}

describe('D-018 選單類入口仍到 10 位為止（SEAT-R23、SEAT-R88、SEAT-AC94）', () => {
  it.each([5, 6, 9])('內部編號 %i 的桌（10 位以上）停用並標示「已滿」，選不到', async (n) => {
    const { user, operations } = renderDialog(buildOverflowState(null));
    const options = await openOptions(user);
    const full = options.find((o) => labelOf(o).startsWith(`${codeOf(n)} 桌`))!;
    expect(full.getAttribute('aria-disabled')).toBe('true');
    expect(labelOf(full)).toContain('已滿');

    await user.click(full);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: '確認入座' }));
    expect(await screen.findByText('請選擇桌次。')).toBeTruthy();
    expect(operations()).toHaveLength(0);
  });

  it('只有 10 位以上的桌停用：9 位的 B2 桌「剩 1 位」可以選', async () => {
    const { user } = renderDialog(buildOverflowState(null));
    const options = await openOptions(user);
    const disabled = options
      .filter((o) => o.getAttribute('aria-disabled') === 'true')
      .map((o) => /^[AB]\d{1,2} 桌/.exec(labelOf(o))?.[0]);
    expect(disabled.sort()).toEqual(['B10 桌', 'B13 桌', 'B8 桌'].sort());
    const seven = options.find((o) => labelOf(o).startsWith('B2 桌（'))!;
    expect(labelOf(seven)).toBe('B2 桌（剩 1 位）・業務部');
  });

  it('11、12 位的桌的選項不會出現負的剩餘位數（「剩 -1 位」）', async () => {
    const { user } = renderDialog(buildOverflowState(null));
    const options = await openOptions(user);
    for (const o of options) expect(labelOf(o), labelOf(o)).not.toMatch(/剩\s*-/);
  });

  it('從選單入座送出的指令不帶 allowOverflow（上限 10 位，docs/architecture.md 第 8.1 節）', async () => {
    const { user, operations } = renderDialog(buildOverflowState(null));
    await openOptions(user);
    await user.click(screen.getByRole('option', { name: /^B2 桌/ }));
    await user.click(screen.getByRole('button', { name: '確認入座' }));

    await waitFor(() => expect(operations()).toHaveLength(1));
    const body = operations()[0]!.body as { type: string; tableId: number; allowOverflow?: boolean };
    expect(body).toMatchObject({ type: 'seat', participantId: WANG, tableId: 7 });
    expect(body.allowOverflow === undefined || body.allowOverflow === false).toBe(true);
  });

  it('已入座的人「移至其他桌次…」：11、12 位的桌也停用並標示「已滿」', async () => {
    const { user } = renderDialog(buildOverflowState(3));
    const options = await openOptions(user);
    for (const n of [6, 9]) {
      const o = options.find((x) => labelOf(x).startsWith(`${codeOf(n)} 桌`))!;
      expect(o.getAttribute('aria-disabled')).toBe('true');
      expect(labelOf(o)).toContain('已滿');
    }
  });

  it('確認時 B2 桌已被別人坐到 10 位：回 409 TABLE_FULL，重新載入並顯示「B2 桌已滿，請先移出一位。」（SEAT-R86、SEAT-AC97）', async () => {
    const { user, notify, sent } = renderDialog(buildOverflowState(null), () => ({
      status: 409,
      body: { error: { code: 'TABLE_FULL', message: 'table full' } },
    }));
    await openOptions(user);
    await user.click(screen.getByRole('option', { name: /^B2 桌/ }));
    await user.click(screen.getByRole('button', { name: '確認入座' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('B2 桌已滿，請先移出一位。'));
    expect(sent.some((s) => s.url === '/api/state')).toBe(true);
    expect(notify).not.toHaveBeenCalledWith('B2 桌已達 12 位，請先移出一位。');
  });
});

describe('已入座的人：移至其他桌次…（SEAT-R22、SEAT-R23、SEAT-R25、SEAT-AC09）', () => {
  it('標題「把 {顯示名稱} 移到其他桌次」，按鈕「確認移動」；目前所在的 B4 桌不列出', async () => {
    const { user } = renderDialog(buildState(3));
    expect(screen.getByRole('dialog', { name: '把 王小明 移到其他桌次' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '確認移動' })).toBeTruthy();
    const options = await openOptions(user);
    expect(options).toHaveLength(29);
    expect(options.some((o) => labelOf(o).startsWith('B4 桌'))).toBe(false);
  });

  it('其餘 29 桌仍依 A1～A15、B1～B15 的順序排列（SEAT-R23、D-019）', async () => {
    const { user } = renderDialog(buildState(3));
    const options = await openOptions(user);
    expect(options.map(codeInLabel)).toEqual(CODES_IN_LIST_ORDER.filter((c) => c !== 'B4'));
  });

  it('沒選桌次就按「確認移動」：顯示「請選擇桌次。」，不移動（SEAT-R24）', async () => {
    const { user, operations } = renderDialog(buildState(3));
    await user.click(screen.getByRole('button', { name: '確認移動' }));
    expect(await screen.findByText('請選擇桌次。')).toBeTruthy();
    expect(operations()).toHaveLength(0);
  });

  it('選 B2 桌確認：送出搬移（內部編號 7），顯示「已把 王小明 從 B4 桌移到 B2 桌。」與「復原」（SEAT-R19、SEAT-R25）', async () => {
    const { user, operations } = renderDialog(buildState(3));
    await openOptions(user);
    await user.click(screen.getByRole('option', { name: /^B2 桌/ }));
    await user.click(screen.getByRole('button', { name: '確認移動' }));

    await waitFor(() => expect(operations()).toHaveLength(1));
    expect(operations()[0]!.body).toMatchObject({ type: 'seat', participantId: WANG, tableId: 7 });
    expect(await screen.findByText('已把 王小明 從 B4 桌移到 B2 桌。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '復原' })).toBeTruthy();
  });
});
