// 座位安排頁的桌子操作（D-027，元件層級，編輯者）：docs/spec/seating.md 2.1.9（「未放桌」、暫存的桌）、2.1.12（暫存區）、
// 2.2.2、2.2.3（「暫存」徽章與列操作）、2.3.1（底部按鈕「移到暫存區」「刪除桌」）、2.3.3（調換桌次列出「未放桌」的位置）、
// 2.3.7（暫存的桌的詳情）、2.3.8（「未放桌」的面板）、2.3.9（放到…對話框）、2.3.10（刪除確認）、第 4 節文案；
// SEAT-R35、R39、R57、R75、R91～R97；SEAT-AC108、AC110、AC114、AC115～AC117、AC121～AC123。
// 走真的伺服器、拖移、手機與多人衝突的完整情境在 tests/e2e/seating-tables.spec.ts。
//
// 假設（實作請照做）：
// - SeatingPage({ initialTable: null }) 放在 AppProvider 裡（同 tests/unit/components/viewer-pages.test.tsx）。
// - 暫存區：region「暫存區」；沒有桌時裡面有「把桌子拖到這裡暫放」。暫存的桌：暫存區裡的 group，裡面開啟詳情的 button 名稱照既有桌次的格式，
//   只是把「{桌號} 桌」換成「暫存」，例如「暫存，貴賓桌，研發一部，2/10」；依移入暫存區的先後由上往下（DOM 順序）。
// - 「未放桌」的位置：button「{代碼} 未放桌」（例如「B8 未放桌」），裡面有「B8」「未放桌」文字；點了開啟面板（桌面 region、手機 dialog，名稱「B8」）。
// - 暫存的桌的詳情：region（或 dialog）「暫存區的桌」或「暫存區的桌（{備註名稱}）」。
// - 刪除確認：alertdialog，名稱是標題。放到…：dialog「把暫存區的桌放到哪裡？」，combobox「位置」。
// - 送出的指令照 docs/architecture.md 第 8.1 節：moveTable { tableId, to, expectedTableId }、createTable { position }、deleteTable { tableId }。
// 假的伺服器用 src/domain/seating-rules.ts 的 applySeatingOperation 算回應（和真的伺服器同一份規則），回傳 SeatingResult。
// 桌號（D-019、D-027）：1–30 桌在同號的位置（3 = B4、7 = B2、8 = B5、9 = B8、17 = A3）。
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/client/app-provider';
import { SeatingPage } from '@/components/features/seating/seating-page';
import { Toaster } from '@/components/ui/toaster';
import type { AppState, SeatTable } from '@/contracts/entities';
import type { SeatingOperation } from '@/contracts/seating';
import { applySeatingOperation } from '@/domain/seating-rules';
import { allTables, asEmployee, employee, stagedTable, withoutPositions } from '../../helpers/seating-fixtures';
import { installDomPolyfills } from '../../helpers/seating-dom';
import { CODES_IN_LIST_ORDER } from '../../helpers/table-codes';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
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
  localStorage.clear();
  vi.unstubAllGlobals();
});

const USER = { name: '測試承辦人', email: 'tester@program.com.tw' };
const B4 = 3;
const B8 = 9;
const STAGED = 31;

/**
 * B4 桌（id 3）備註名稱「主桌」，坐甲、乙（研發一部）；B8（位置 9）是「未放桌」；
 * 暫存區有一桌（id 31，備註名稱「貴賓桌」，坐丙、丁）；王小明未入座。
 */
function buildState(opts: { staged?: SeatTable[]; empty?: number[] } = {}): AppState {
  const staged = opts.staged ?? [stagedTable(STAGED, '2026-11-01T08:00:00.000Z', { noteName: '貴賓桌' })];
  const tables = [...withoutPositions(allTables({ [B4]: '主桌' }), opts.empty ?? [B8]), ...staged];
  const stagedIds = new Set(staged.map((t) => t.id));
  return {
    employees: [
      employee(101, { name: '王小明', department: '研發一部', team: '前端組' }),
      employee(102, { name: '甲', department: '研發一部' }),
      employee(103, { name: '乙', department: '研發一部' }),
      employee(104, { name: '丙', department: '研發一部' }),
      employee(105, { name: '丁', department: '研發一部' }),
    ],
    participants: [
      asEmployee(101),
      asEmployee(102, { tableId: B4, seatOrder: 0 }),
      asEmployee(103, { tableId: B4, seatOrder: 1 }),
      ...(stagedIds.has(STAGED)
        ? [asEmployee(104, { tableId: STAGED, seatOrder: 0 }), asEmployee(105, { tableId: STAGED, seatOrder: 1 })]
        : [asEmployee(104), asEmployee(105)]),
    ],
    tables,
  };
}

/** 假的伺服器：座位指令用 applySeatingOperation 算，回傳有變動的人與桌、刪除的桌與 undo；GET /api/state 回目前資料 */
function fakeServer(initial: AppState) {
  let state = structuredClone(initial);
  const operations: SeatingOperation[] = [];
  const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/state')) return json(200, { ...state, me: { isEditor: true }, seatsPublished: false });
      if (!url.endsWith('/api/seating/operations')) return json(200, {});
      const op = JSON.parse(String(init?.body)) as SeatingOperation;
      operations.push(op);
      if (op.type === 'autoArrange') return json(500, { error: { code: 'INTERNAL', message: 'unexpected' } });
      const result = applySeatingOperation(state, op);
      if (!result.ok) return json(409, { error: { code: result.violation, message: 'rejected' } });
      const before = state;
      state = { ...state, participants: result.data.participants, tables: result.data.tables };
      const changedPeople = result.data.participants.filter((p) => {
        const b = before.participants.find((x) => x.id === p.id);
        return !b || b.tableId !== p.tableId || b.seatOrder !== p.seatOrder;
      });
      const changedTables = result.data.tables.filter((t) => {
        const b = before.tables.find((x) => x.id === t.id);
        return !b || b.position !== t.position || b.stagedAt !== t.stagedAt || b.noteName !== t.noteName;
      });
      const deletedTableIds = before.tables.filter((t) => !result.data.tables.some((x) => x.id === t.id)).map((t) => t.id);
      return json(200, { participants: changedPeople, tables: changedTables, deletedTableIds, undo: result.undo });
    }),
  );
  return { operations, state: () => state };
}

function renderPage(data: AppState = buildState()) {
  const server = fakeServer(data);
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  render(
    <>
      <AppProvider initialData={data} user={USER} isEditor>
        <SeatingPage initialTable={null} />
      </AppProvider>
      <Toaster />
    </>,
  );
  return { user, ...server };
}

/** 桌次詳情、暫存的桌的詳情與「未放桌」的面板：桌面是 region、手機是 dialog */
const panel = (name: string) => screen.queryByRole('region', { name }) ?? screen.getByRole('dialog', { name });
const findPanel = async (name: string) => {
  await waitFor(() => expect(screen.queryByRole('region', { name }) ?? screen.queryByRole('dialog', { name })).not.toBeNull());
  return panel(name);
};
const noPanel = (name: string) => expect(screen.queryByRole('region', { name }) ?? screen.queryByRole('dialog', { name })).toBeNull();

const stagingRegion = () => screen.getByRole('region', { name: '暫存區' });
const stagedButtons = () => within(stagingRegion()).queryAllByRole('button', { name: /^暫存，/ });
const labelOf = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const before = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/** 統計列（SEAT-R75）：文字含「已入座…已滿…桌」的最小元素，去掉空白後的文字 */
const STATS = /已入座[\s\S]*已滿[\s\S]*桌/;
function statsText(): string {
  const all = screen.getAllByText((_, el) => !!el && STATS.test(el.textContent ?? ''));
  const line = all.find((el) => ![...el.children].some((c) => STATS.test(c.textContent ?? '')));
  return labelOf(line ?? all[0]!).replace(/\s/g, '');
}

describe('暫存區（2.1.12、SEAT-AC21、SEAT-AC114）', () => {
  it('沒有桌時：標題「暫存區」，中間是「把桌子拖到這裡暫放」', () => {
    renderPage(buildState({ staged: [], empty: [] }));
    expect(within(stagingRegion()).getByText('暫存區', { exact: true })).toBeTruthy();
    expect(within(stagingRegion()).getByText('把桌子拖到這裡暫放')).toBeTruthy();
    expect(stagedButtons()).toHaveLength(0);
  });

  it('暫存的桌：放桌號的地方寫「暫存」，無障礙名稱「暫存，{備註名稱}，{部門}，{人數}/10」；有桌時不顯示「把桌子拖到這裡暫放」', () => {
    renderPage();
    const [button] = stagedButtons();
    expect(button?.getAttribute('aria-label')).toBe('暫存，貴賓桌，研發一部，2/10');
    expect(within(stagingRegion()).getAllByText('暫存', { exact: true }).length).toBeGreaterThan(0);
    expect(within(stagingRegion()).queryByText('把桌子拖到這裡暫放')).toBeNull();
  });

  it('依移入暫存區的先後由上往下：最早移入的在最上面（SEAT-AC114）', () => {
    const staged = [stagedTable(32, '2026-11-02T08:00:00.000Z', { noteName: '後放' }), stagedTable(33, '2026-11-01T08:00:00.000Z', { noteName: '先放' })];
    renderPage(buildState({ staged }));
    const names = stagedButtons().map((b) => b.getAttribute('aria-label') ?? '');
    expect(names).toEqual(['暫存，先放，空桌，0/10', '暫存，後放，空桌，0/10']);
  });

  it('暫存的桌有拖移把手「拖移調換桌次」（桌面）', () => {
    renderPage();
    const group = stagedButtons()[0]!.closest('[role="group"]') as HTMLElement;
    expect(within(group).getByRole('button', { name: '拖移調換桌次' })).toBeTruthy();
  });
});

describe('「未放桌」的位置（2.1.9、2.3.8、SEAT-R95、SEAT-R96、SEAT-AC107、AC121）', () => {
  it('B8 是 button「B8 未放桌」，裡面有「B8」與「未放桌」；沒有拖移把手；B8 沒有桌次', () => {
    renderPage();
    const slot = screen.getByRole('button', { name: 'B8 未放桌' });
    expect(within(slot).getByText('B8', { exact: true })).toBeTruthy();
    expect(within(slot).getByText('未放桌', { exact: true })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'B8 桌' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^B8 桌/ })).toBeNull();
    const group = slot.closest('[role="group"]');
    if (group) expect(within(group as HTMLElement).queryByRole('button', { name: '拖移調換桌次' })).toBeNull();
  });

  it('點 B8 → 面板標題「B8」、內文「這個位置沒有擺桌。」、按鈕「新增桌」與「關閉」', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'B8 未放桌' }));
    const p = await findPanel('B8');
    expect(within(p).getByRole('heading', { name: 'B8' })).toBeTruthy();
    expect(within(p).getByText('這個位置沒有擺桌。')).toBeTruthy();
    expect(within(p).getByRole('button', { name: '新增桌' })).toBeTruthy();
    expect(within(p).getByRole('button', { name: '關閉' })).toBeTruthy();
  });

  it('按「新增桌」→ 送出 createTable { position: 9 }；面板換成「B8 桌」的桌次詳情；Sonner「已在 B8 新增一桌。」與「復原」（SEAT-AC121）', async () => {
    const { user, operations } = renderPage();
    await user.click(screen.getByRole('button', { name: 'B8 未放桌' }));
    await user.click(within(await findPanel('B8')).getByRole('button', { name: '新增桌' }));

    await waitFor(() => expect(operations).toHaveLength(1));
    expect(operations[0]).toEqual({ type: 'createTable', position: B8 });
    expect(await screen.findByText('已在 B8 新增一桌。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '復原' })).toBeTruthy();
    const detail = await findPanel('B8 桌');
    expect(within(detail).getByText('0/10 人')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'B8 未放桌' })).toBeNull());
  });

  it('新增後按「復原」：送出 restore（新增的桌 exists 是 false），B8 回到「未放桌」', async () => {
    const { user, operations } = renderPage();
    await user.click(screen.getByRole('button', { name: 'B8 未放桌' }));
    await user.click(within(await findPanel('B8')).getByRole('button', { name: '新增桌' }));
    await user.click(await screen.findByRole('button', { name: '復原' }));

    await waitFor(() => expect(operations).toHaveLength(2));
    const restore = operations[1] as Extract<SeatingOperation, { type: 'restore' }>;
    expect(restore.type).toBe('restore');
    expect(restore.snapshot.tables).toEqual([expect.objectContaining({ exists: false })]);
    expect(await screen.findByRole('button', { name: 'B8 未放桌' })).toBeTruthy();
  });

  it('30 個位置都有桌時沒有「未放桌」的位置，也就不能新增（SEAT-R96）', () => {
    renderPage(buildState({ empty: [] }));
    expect(screen.queryAllByRole('button', { name: /未放桌$/ })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: '新增桌', hidden: true })).toHaveLength(0);
  });
});

describe('桌次詳情的「移到暫存區」「刪除桌」（2.3.1、2.3.10、SEAT-R91、SEAT-R97、SEAT-AC115、AC122、AC123）', () => {
  it('底部按鈕依序：加入人員、調換桌次…、移到暫存區、清空桌次、刪除桌（SEAT-AC115）', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: /^B4 桌/ }));
    const detail = await findPanel('B4 桌');
    const names = ['加入人員', '調換桌次…', '移到暫存區', '清空桌次', '刪除桌'];
    const buttons = names.map((name) => within(detail).getByRole('button', { name }));
    for (let i = 1; i < buttons.length; i++) expect(before(buttons[i - 1]!, buttons[i]!), `${names[i - 1]} 在 ${names[i]} 前面`).toBe(true);
  });

  it('按「移到暫存區」：不需確認，送出 moveTable { tableId: 3, to: \'staging\', expectedTableId: null }；詳情關閉；Sonner「已把 B4 桌移到暫存區。」與「復原」', async () => {
    const { user, operations } = renderPage();
    await user.click(screen.getByRole('button', { name: /^B4 桌/ }));
    await user.click(within(await findPanel('B4 桌')).getByRole('button', { name: '移到暫存區' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(operations).toHaveLength(1));
    expect(operations[0]).toEqual({ type: 'moveTable', tableId: B4, to: 'staging', expectedTableId: null });
    expect(await screen.findByText('已把 B4 桌移到暫存區。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '復原' })).toBeTruthy();
    await waitFor(() => noPanel('B4 桌'));
    expect(await screen.findByRole('button', { name: 'B4 未放桌' })).toBeTruthy();
    expect(stagedButtons().map((b) => b.getAttribute('aria-label'))).toContain('暫存，主桌，研發一部，2/10');
  });

  it('按「刪除桌」：Alert Dialog「要刪除 B4 桌嗎？」，內文「桌上的 2 位會回到未入座，備註名稱也會一併刪除。」，按鈕「刪除桌」「取消」；按「取消」不送出', async () => {
    const { user, operations } = renderPage();
    await user.click(screen.getByRole('button', { name: /^B4 桌/ }));
    await user.click(within(await findPanel('B4 桌')).getByRole('button', { name: '刪除桌' }));

    const alert = await screen.findByRole('alertdialog', { name: '要刪除 B4 桌嗎？' });
    expect(within(alert).getByText('桌上的 2 位會回到未入座，備註名稱也會一併刪除。')).toBeTruthy();
    expect(within(alert).getByRole('button', { name: '刪除桌' })).toBeTruthy();
    await user.click(within(alert).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(operations).toHaveLength(0);
    expect(panel('B4 桌')).toBeTruthy();
  });

  it('確認「刪除桌」：送出 deleteTable { tableId: 3 }；詳情關閉，B4 變成「未放桌」；Sonner「已刪除 B4 桌。」與「復原」（SEAT-AC122）', async () => {
    const { user, operations } = renderPage();
    await user.click(screen.getByRole('button', { name: /^B4 桌/ }));
    await user.click(within(await findPanel('B4 桌')).getByRole('button', { name: '刪除桌' }));
    const alert = await screen.findByRole('alertdialog', { name: '要刪除 B4 桌嗎？' });
    await user.click(within(alert).getByRole('button', { name: '刪除桌' }));

    await waitFor(() => expect(operations).toHaveLength(1));
    expect(operations[0]).toEqual({ type: 'deleteTable', tableId: B4 });
    expect(await screen.findByText('已刪除 B4 桌。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '復原' })).toBeTruthy();
    await waitFor(() => noPanel('B4 桌'));
    expect(await screen.findByRole('button', { name: 'B4 未放桌' })).toBeTruthy();
  });

  it('空桌的刪除確認：內文「這一桌沒有人。」（SEAT-AC123）', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: /^B5 桌/ }));
    await user.click(within(await findPanel('B5 桌')).getByRole('button', { name: '刪除桌' }));
    const alert = await screen.findByRole('alertdialog', { name: '要刪除 B5 桌嗎？' });
    expect(within(alert).getByText('這一桌沒有人。')).toBeTruthy();
  });
});

describe('調換桌次對話框列出「未放桌」的位置（2.3.3、SEAT-R39、SEAT-AC116）', () => {
  async function openSwap(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /^B4 桌/ }));
    await user.click(within(await findPanel('B4 桌')).getByRole('button', { name: '調換桌次…' }));
    const dialog = await screen.findByRole('dialog', { name: '把 B4 桌和哪一桌對調？' });
    await user.click(within(dialog).getByRole('combobox', { name: /^桌次/ }));
    return { dialog, options: await screen.findAllByRole('option') };
  }

  it('列出自己以外的 29 個位置，依 A1～A15、B1～B15；「未放桌」的位置是「B8（未放桌）」；不列暫存的桌', async () => {
    const { user } = renderPage();
    const { options } = await openSwap(user);
    expect(options).toHaveLength(29);
    expect(options.map((o) => /^([AB]\d{1,2})/.exec(labelOf(o))?.[1])).toEqual(CODES_IN_LIST_ORDER.filter((c) => c !== 'B4'));
    expect(options.map(labelOf)).toContain('B8（未放桌）');
    expect(options.some((o) => labelOf(o).includes('貴賓桌'))).toBe(false);
  });

  it('選「B8（未放桌）」按「確認對調」：送出 moveTable { tableId: 3, to: 9, expectedTableId: null }；Sonner「已把 B4 桌搬到 B8。」', async () => {
    const { user, operations } = renderPage();
    const { dialog } = await openSwap(user);
    await user.click(screen.getByRole('option', { name: 'B8（未放桌）' }));
    await user.click(within(dialog).getByRole('button', { name: '確認對調' }));

    await waitFor(() => expect(operations).toHaveLength(1));
    expect(operations[0]).toEqual({ type: 'moveTable', tableId: B4, to: B8, expectedTableId: null });
    expect(await screen.findByText('已把 B4 桌搬到 B8。')).toBeTruthy();
  });

  it('選有桌的 B2 桌：expectedTableId 是畫面上 B2 那一桌的 id（7）；Sonner「已把 B4 桌和 B2 桌對調。」', async () => {
    const { user, operations } = renderPage();
    const { dialog } = await openSwap(user);
    await user.click(screen.getByRole('option', { name: /^B2 桌/ }));
    await user.click(within(dialog).getByRole('button', { name: '確認對調' }));

    await waitFor(() => expect(operations).toHaveLength(1));
    expect(operations[0]).toEqual({ type: 'moveTable', tableId: B4, to: 7, expectedTableId: 7 });
    expect(await screen.findByText('已把 B4 桌和 B2 桌對調。')).toBeTruthy();
  });
});

describe('暫存的桌的詳情與「放到…」（2.3.7、2.3.9、2.3.10、SEAT-R92、SEAT-R93、SEAT-R97、SEAT-AC117、AC123）', () => {
  async function openStaged(user: ReturnType<typeof userEvent.setup>) {
    await user.click(stagedButtons()[0]!);
    return findPanel('暫存區的桌（貴賓桌）');
  }

  it('標題「暫存區的桌（貴賓桌）」；可以改備註名稱；名單列出丙、丁；底部只有「放到…」「刪除桌」；沒有名單說明', async () => {
    const { user } = renderPage();
    const detail = await openStaged(user);
    expect(within(detail).getByRole('heading', { name: '暫存區的桌（貴賓桌）' })).toBeTruthy();
    expect(within(detail).getByRole('textbox', { name: '備註名稱' })).toBeTruthy();
    expect(within(detail).getByText('丙')).toBeTruthy();
    expect(within(detail).getByText('丁')).toBeTruthy();
    expect(within(detail).getByRole('button', { name: '放到…' })).toBeTruthy();
    expect(within(detail).getByRole('button', { name: '刪除桌' })).toBeTruthy();
    for (const name of ['加入人員', '調換桌次…', '移到暫存區', '清空桌次']) expect(within(detail).queryByRole('button', { name }), name).toBeNull();
    expect(within(detail).queryByText('拖移可以調整順序，也可以從人員面板直接拖進來。')).toBeNull();
  });

  it('沒有備註名稱的暫存的桌：標題「暫存區的桌」', async () => {
    const { user } = renderPage(buildState({ staged: [stagedTable(STAGED, '2026-11-01T08:00:00.000Z')] }));
    await user.click(stagedButtons()[0]!);
    const detail = await findPanel('暫存區的桌');
    expect(within(detail).getByRole('heading', { name: '暫存區的桌' })).toBeTruthy();
  });

  it('名單列的列操作：入座…／移出桌次／編輯', async () => {
    const { user } = renderPage();
    const detail = await openStaged(user);
    const row = within(within(detail).getByRole('list', { name: '名單' })).getAllByRole('listitem').find((li) => within(li).queryByText('丙'));
    await user.click(within(row!).getByRole('button', { name: '更多操作' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map(labelOf)).toEqual(['入座…', '移出桌次', '編輯']);
  });

  it('「放到…」對話框：標題「把暫存區的桌放到哪裡？」、欄位「位置」；選項依 A1～B15 列出 30 個位置，B8 是「B8（未放桌）」，B4 是「B4 桌（2/10）・主桌」', async () => {
    const { user } = renderPage();
    const detail = await openStaged(user);
    await user.click(within(detail).getByRole('button', { name: '放到…' }));
    const dialog = await screen.findByRole('dialog', { name: '把暫存區的桌放到哪裡？' });
    await user.click(within(dialog).getByRole('combobox', { name: /^位置/ }));
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(30);
    expect(options.map((o) => /^([AB]\d{1,2})/.exec(labelOf(o))?.[1])).toEqual(CODES_IN_LIST_ORDER);
    expect(options.map(labelOf)).toContain('B8（未放桌）');
    expect(options.map(labelOf)).toContain('B4 桌（2/10）・主桌');
    expect(within(dialog).getByRole('button', { name: '確認放置' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '取消' })).toBeTruthy();
  });

  it('沒選就按「確認放置」：欄位下方「請選擇位置。」，對話框不關閉，不送出', async () => {
    const { user, operations } = renderPage();
    await user.click(within(await openStaged(user)).getByRole('button', { name: '放到…' }));
    const dialog = await screen.findByRole('dialog', { name: '把暫存區的桌放到哪裡？' });
    await user.click(within(dialog).getByRole('button', { name: '確認放置' }));
    expect(await within(dialog).findByText('請選擇位置。')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: '把暫存區的桌放到哪裡？' })).toBeTruthy();
    expect(operations).toHaveLength(0);
  });

  it('選 B8 按「確認放置」：送出 moveTable { tableId: 31, to: 9, expectedTableId: null }；對話框與詳情關閉；Sonner「已把「貴賓桌」放到 B8。」', async () => {
    const { user, operations } = renderPage();
    await user.click(within(await openStaged(user)).getByRole('button', { name: '放到…' }));
    const dialog = await screen.findByRole('dialog', { name: '把暫存區的桌放到哪裡？' });
    await user.click(within(dialog).getByRole('combobox', { name: /^位置/ }));
    await user.click(screen.getByRole('option', { name: 'B8（未放桌）' }));
    await user.click(within(dialog).getByRole('button', { name: '確認放置' }));

    await waitFor(() => expect(operations).toHaveLength(1));
    expect(operations[0]).toEqual({ type: 'moveTable', tableId: STAGED, to: B8, expectedTableId: null });
    expect(await screen.findByText('已把「貴賓桌」放到 B8。')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '把暫存區的桌放到哪裡？' })).toBeNull());
    await waitFor(() => noPanel('暫存區的桌（貴賓桌）'));
  });

  it('選有桌的 B4：交換；expectedTableId 是 3；Sonner「已把「貴賓桌」放到 B4，原本的 B4 桌移到暫存區。」', async () => {
    const { user, operations } = renderPage();
    await user.click(within(await openStaged(user)).getByRole('button', { name: '放到…' }));
    const dialog = await screen.findByRole('dialog', { name: '把暫存區的桌放到哪裡？' });
    await user.click(within(dialog).getByRole('combobox', { name: /^位置/ }));
    await user.click(screen.getByRole('option', { name: /^B4 桌/ }));
    await user.click(within(dialog).getByRole('button', { name: '確認放置' }));

    await waitFor(() => expect(operations).toHaveLength(1));
    expect(operations[0]).toEqual({ type: 'moveTable', tableId: STAGED, to: B4, expectedTableId: B4 });
    expect(await screen.findByText('已把「貴賓桌」放到 B4，原本的 B4 桌移到暫存區。')).toBeTruthy();
  });

  it('沒有備註名稱的暫存的桌放到 B8：Sonner「已把暫存區的桌放到 B8。」', async () => {
    const { user } = renderPage(buildState({ staged: [stagedTable(STAGED, '2026-11-01T08:00:00.000Z')] }));
    await user.click(stagedButtons()[0]!);
    await user.click(within(await findPanel('暫存區的桌')).getByRole('button', { name: '放到…' }));
    const dialog = await screen.findByRole('dialog', { name: '把暫存區的桌放到哪裡？' });
    await user.click(within(dialog).getByRole('combobox', { name: /^位置/ }));
    await user.click(screen.getByRole('option', { name: 'B8（未放桌）' }));
    await user.click(within(dialog).getByRole('button', { name: '確認放置' }));
    expect(await screen.findByText('已把暫存區的桌放到 B8。')).toBeTruthy();
  });

  it('刪除暫存的桌：確認標題「要刪除暫存區的這一桌嗎？」；確認後送出 deleteTable { tableId: 31 }，Sonner「已刪除暫存區的一桌。」（SEAT-AC123）', async () => {
    const { user, operations } = renderPage();
    await user.click(within(await openStaged(user)).getByRole('button', { name: '刪除桌' }));
    const alert = await screen.findByRole('alertdialog', { name: '要刪除暫存區的這一桌嗎？' });
    expect(within(alert).getByText('桌上的 2 位會回到未入座，備註名稱也會一併刪除。')).toBeTruthy();
    await user.click(within(alert).getByRole('button', { name: '刪除桌' }));

    await waitFor(() => expect(operations).toHaveLength(1));
    expect(operations[0]).toEqual({ type: 'deleteTable', tableId: STAGED });
    expect(await screen.findByText('已刪除暫存區的一桌。')).toBeTruthy();
  });
});

describe('人員面板與統計列（2.2.2、2.2.3、SEAT-R57、SEAT-R75、SEAT-R94、SEAT-AC108、AC110）', () => {
  it('暫存的桌上的人（丙、丁）有「暫存」徽章，是按鈕（名稱正好是「暫存」）', () => {
    renderPage();
    expect(screen.getAllByRole('button', { name: '暫存', hidden: true }).length).toBeGreaterThanOrEqual(2);
  });

  it('統計列：B8 是「未放桌」、暫存區的丙丁算未入座 →「已入座 2／5・未入座 3・空位 288・已滿 0 桌」', () => {
    renderPage();
    expect(statsText()).toBe('已入座2／5・未入座3・空位288・已滿0桌');
  });

  it('SEAT-AC108：B4、B8 是「未放桌」、28 桌都是空桌、5 位都未入座 →「已入座 0／5・未入座 5・空位 280・已滿 0 桌」', () => {
    const data = buildState({ staged: [], empty: [B4, B8] });
    data.participants = data.participants.map((p) => ({ ...p, tableId: null, seatOrder: null }));
    renderPage(data);
    expect(statsText()).toBe('已入座0／5・未入座5・空位280・已滿0桌');
  });
});
