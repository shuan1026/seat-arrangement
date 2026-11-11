// 復原與重做的前端流程（D-028）：docs/spec/seating.md SEAT-R76、R77（最近 20 步；一步要等儲存完成才記進紀錄；Sonner 的「復原」
// 等於復原最近一步；用工具列復原時那一步的 Sonner 一起關掉）、R78、R79（「已復原。」「已重做。」都不帶按鈕）、R80（備註名稱不能復原，
// 也不清掉紀錄）、R86、R89（超過 10 位的後綴也是那一步的提示）、R99（重做）、R100（衝突重新載入時清掉）；auto-arrange.md ARR-R13；
// docs/architecture.md 第 8.1 節（restore 也回傳 undo，前端把它放進重做紀錄；重做時再送 restore，回應的 undo 放回復原紀錄）。
// 驗收條件 SEAT-AC129～AC132、AC134～AC137 的前端部分；走真的伺服器的完整情境在 tests/e2e/seating-undo-redo.spec.ts。
//
// 介面（實作請照做）：
// - src/components/features/seating/use-seating-ops.ts 的 useSeatingOps() 回傳 run(op, message)、undo()、redo()、autoArrange(mode)、
//   setNoteName(tableId, raw)。undo()、redo() 送 POST /api/seating/operations { type: 'restore', snapshot }。
// - store 的 history: { undo, redo }（tests/unit/client/store-history.test.ts）；這裡用一個小元件把兩邊的 label 列出來看。
// - 座位安排頁：工具列的「復原」「重做」（SeatMap 的 onUndo、onRedo、undoLabel、redoLabel）；Sonner 也有「復原」，
//   所以工具列的按鈕用「不在通知區裡、名稱正好是「復原」的 button」來找。
// 假的伺服器用 src/domain/seating-rules.ts 的 applySeatingOperation 算回應（和真的伺服器同一份規則），回傳 SeatingResult。
// 送出的 restore 用 toMatchObject 比對 { type, snapshot }：SEAT-AC136 的衝突偵測若要在指令裡多帶欄位，不會讓這裡失敗。
// 桌號（D-019）：內部編號 3 = B4、5 = B10、7 = B2，1–30 桌在同號的位置。
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppProvider, useAppStore } from '@/client/app-provider';
import { SeatingPage } from '@/components/features/seating/seating-page';
import { useSeatingOps } from '@/components/features/seating/use-seating-ops';
import { Toaster } from '@/components/ui/toaster';
import type { AppState, Participant } from '@/contracts/entities';
import type { SeatingOperation, SeatingResult } from '@/contracts/seating';
import { applySeatingOperation, type RuleOperation } from '@/domain/seating-rules';
import { allTables, asEmployee, employee } from '../../helpers/seating-fixtures';
import { installDomPolyfills } from '../../helpers/seating-dom';

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
const WANG = 1;
const LEE = 2;
const CHEN = 3;
const B4 = 3;
const B10 = 5;
const B2 = 7;

const CONFLICT = '資料已被其他人更新，已重新載入。';
const UNDONE = '已復原。';
const REDONE = '已重做。';

/** 王小明、李大華、陳大文（研發一部）未入座；B10 桌已有 10 位（業務部，51–60）；其他桌是空桌 */
function buildState(): AppState {
  const ten = Array.from({ length: 10 }, (_, i) => 51 + i);
  return {
    employees: [
      employee(WANG, { name: '王小明', department: '研發一部' }),
      employee(LEE, { name: '李大華', department: '研發一部' }),
      employee(CHEN, { name: '陳大文', department: '研發一部' }),
      ...ten.map((id) => employee(id, { department: '業務部' })),
    ],
    participants: [asEmployee(WANG), asEmployee(LEE), asEmployee(CHEN), ...ten.map((id, i) => asEmployee(id, { tableId: B10, seatOrder: i }))],
    tables: allTables(),
  };
}

type Json = Record<string, unknown>;

/**
 * 假的伺服器：
 * - POST /api/seating/operations：用 applySeatingOperation 算；回傳有變動的人與桌、刪除的桌與 undo（restore 也回傳 undo）。
 *   autoArrange 把所有未入座的人依序排進 B4 桌（summary 照實填）。
 * - PATCH /api/tables/{id}：改備註名稱。GET /api/state：回目前資料。
 * - failNext(code)：下一個座位指令回 409（別人剛改過），資料不變。hold()：擋住下一個座位指令，呼叫回傳的函式才回應。
 */
function fakeServer(initial: AppState) {
  let state = structuredClone(initial);
  const operations: SeatingOperation[] = [];
  const replies: (SeatingResult | null)[] = [];
  let stateLoads = 0;
  let nextError: string | null = null;
  let gate: Promise<void> | null = null;
  const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

  function reply(result: Extract<ReturnType<typeof applySeatingOperation>, { ok: true }>, extra: Json = {}): SeatingResult {
    const before = state;
    state = { ...state, participants: result.data.participants, tables: result.data.tables };
    const participants = result.data.participants.filter((p) => {
      const b = before.participants.find((x) => x.id === p.id);
      return !b || b.tableId !== p.tableId || b.seatOrder !== p.seatOrder;
    });
    const tables = result.data.tables.filter((t) => {
      const b = before.tables.find((x) => x.id === t.id);
      return !b || b.position !== t.position || b.stagedAt !== t.stagedAt || b.noteName !== t.noteName;
    });
    const deletedTableIds = before.tables.filter((t) => !result.data.tables.some((x) => x.id === t.id)).map((t) => t.id);
    return { participants, tables, deletedTableIds, undo: result.undo, ...extra } as SeatingResult;
  }

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/state')) {
        stateLoads += 1;
        return json(200, { ...state, me: { isEditor: true }, seatsPublished: false });
      }
      if (url.startsWith('/api/tables/')) {
        const id = Number(url.split('/').pop());
        const { noteName } = JSON.parse(String(init?.body)) as { noteName: string | null };
        state = { ...state, tables: state.tables.map((t) => (t.id === id ? { ...t, noteName: noteName || null } : t)) };
        return json(200, { table: state.tables.find((t) => t.id === id) });
      }
      if (!url.endsWith('/api/seating/operations')) return json(200, {});
      const op = JSON.parse(String(init?.body)) as SeatingOperation;
      operations.push(op);
      if (gate) await gate;
      if (nextError) {
        const code = nextError;
        nextError = null;
        replies.push(null);
        return json(409, { error: { code, message: 'changed by someone else' } });
      }
      if (op.type === 'autoArrange') {
        const ids = state.participants.filter((p) => p.tableId === null).map((p) => p.id);
        if (!ids.length) {
          const empty = { participants: [], tables: [], deletedTableIds: [], undo: { participants: [], tables: [] }, summary: { placed: 0, tableIds: [], left: 0 } };
          replies.push(empty);
          return json(200, empty);
        }
        const result = applySeatingOperation(state, { type: 'seatMany', tableId: B4, participantIds: ids });
        if (!result.ok) throw new Error('假的伺服器排不進 B4 桌');
        const body = reply(result, { summary: { placed: ids.length, tableIds: [B4], left: 0 } });
        replies.push(body);
        return json(200, body);
      }
      const result = applySeatingOperation(state, op);
      if (!result.ok) {
        replies.push(null);
        return json(409, { error: { code: result.violation, message: 'rejected' } });
      }
      const body = reply(result);
      replies.push(body);
      return json(200, body);
    }),
  );

  return {
    operations,
    replies,
    state: () => state,
    stateLoads: () => stateLoads,
    failNext: (code = 'CONFLICT') => {
      nextError = code;
    },
    hold: () => {
      let release = () => {};
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        gate = null;
        release();
      };
    },
  };
}

const placeOf = (server: ReturnType<typeof fakeServer>, id: number) => {
  const p = server.state().participants.find((x) => x.id === id) as Participant;
  return { tableId: p.tableId, seatOrder: p.seatOrder };
};
const UNSEATED = { tableId: null, seatOrder: null };

// ---- Sonner

/** Sonner 的通知區（src/components/ui/toaster.tsx 的 containerAriaLabel「通知」） */
const toastRegion = () => screen.queryByRole('region', { name: /^通知/ });
const toastItems = () => {
  const region = toastRegion();
  return region ? within(region).queryAllByRole('listitem') : [];
};
const toastWith = (text: string) => toastItems().find((li) => li.textContent?.includes(text));
async function findToast(text: string): Promise<HTMLElement> {
  await waitFor(() => expect(toastWith(text), `Sonner「${text}」`).toBeTruthy());
  return toastWith(text)!;
}

// ============================================================================
// useSeatingOps：run、undo、redo
// ============================================================================

type Step = { name: string; op: RuleOperation; message: string };

const SEAT_WANG: Step = { name: '王小明入座', op: { type: 'seat', participantId: WANG, tableId: B4 }, message: '已把 王小明 安排到 B4 桌。' };
const SEAT_LEE: Step = { name: '李大華入座', op: { type: 'seat', participantId: LEE, tableId: B4 }, message: '已把 李大華 安排到 B4 桌。' };
const SEAT_CHEN: Step = { name: '陳大文入座', op: { type: 'seat', participantId: CHEN, tableId: B2 }, message: '已把 陳大文 安排到 B2 桌。' };
const UNSEAT_WANG: Step = { name: '移出王小明', op: { type: 'unseat', participantId: WANG }, message: '已把 王小明 移出 B4 桌。' };
const WANG_TO_B10: Step = {
  name: '王小明拖到 B10',
  op: { type: 'seat', participantId: WANG, tableId: B10, allowOverflow: true },
  message: '已把 王小明 安排到 B10 桌。',
};

/** 用 useSeatingOps 做事的小元件：每個步驟一個按鈕；另外列出復原、重做紀錄的 label（最新的一步在最後） */
function Harness({ steps }: { steps: Step[] }) {
  const ops = useSeatingOps();
  const history = useAppStore((s) => s.history);
  return (
    <div>
      {steps.map((s) => (
        <button key={s.name} type="button" onClick={() => ops.run(s.op, s.message)}>
          {`做：${s.name}`}
        </button>
      ))}
      <button type="button" onClick={() => ops.undo()}>
        呼叫 undo()
      </button>
      <button type="button" onClick={() => ops.redo()}>
        呼叫 redo()
      </button>
      <button type="button" onClick={() => ops.autoArrange('unseatedOnly')}>
        呼叫 autoArrange()
      </button>
      <button type="button" onClick={() => ops.setNoteName(B2, '供應商')}>
        改 B2 桌的備註名稱
      </button>
      <ul aria-label="復原紀錄">
        {history.undo.map((h, i) => (
          <li key={i}>{h.label}</li>
        ))}
      </ul>
      <ul aria-label="重做紀錄">
        {history.redo.map((h, i) => (
          <li key={i}>{h.label}</li>
        ))}
      </ul>
    </div>
  );
}

function renderOps(steps: Step[] = [SEAT_WANG, SEAT_LEE, SEAT_CHEN, UNSEAT_WANG, WANG_TO_B10], data: AppState = buildState()) {
  const server = fakeServer(data);
  const notify = vi.fn<(text: string) => void>();
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  render(
    <>
      <AppProvider initialData={data} user={USER} isEditor notify={notify}>
        <Harness steps={steps} />
      </AppProvider>
      <Toaster />
    </>,
  );
  return { user, notify, server };
}

const labelsOf = (listName: string) =>
  within(screen.getByRole('list', { name: listName }))
    .queryAllByRole('listitem')
    .map((li) => li.textContent);
const undoLabels = () => labelsOf('復原紀錄');
const redoLabels = () => labelsOf('重做紀錄');

type Ctx = ReturnType<typeof renderOps>;

/** 做一步，等儲存完成、記進紀錄（復原紀錄的最後一步是它） */
async function doStep({ user }: Ctx, step: Step, label = step.message) {
  await user.click(screen.getByRole('button', { name: `做：${step.name}` }));
  await waitFor(() => expect(undoLabels().at(-1)).toBe(label));
}

async function callUndo({ user, server }: Ctx) {
  const sent = server.operations.length;
  await user.click(screen.getByRole('button', { name: '呼叫 undo()' }));
  await waitFor(() => expect(server.operations.length).toBe(sent + 1));
}

async function callRedo({ user, server }: Ctx) {
  const sent = server.operations.length;
  await user.click(screen.getByRole('button', { name: '呼叫 redo()' }));
  await waitFor(() => expect(server.operations.length).toBe(sent + 1));
}

describe('run：可以復原的操作記進紀錄（SEAT-R76、SEAT-R77）', () => {
  it('一步要等儲存完成才記進紀錄；label 是那一步的 Sonner 文字；Sonner 帶「復原」；重做紀錄是空的（SEAT-AC129）', async () => {
    const ctx = renderOps();
    const release = ctx.server.hold();
    await ctx.user.click(screen.getByRole('button', { name: '做：王小明入座' }));
    await waitFor(() => expect(ctx.server.operations).toHaveLength(1));
    expect(undoLabels(), '儲存中的那一步還不在紀錄裡').toEqual([]);

    await act(async () => release());
    await waitFor(() => expect(undoLabels()).toEqual(['已把 王小明 安排到 B4 桌。']));
    expect(redoLabels()).toEqual([]);
    const t = await findToast('已把 王小明 安排到 B4 桌。');
    expect(within(t).getByRole('button', { name: '復原' })).toBeTruthy();
  });

  it('依序記下每一步，最新的在最後', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    await doStep(ctx, SEAT_LEE);
    await doStep(ctx, UNSEAT_WANG);
    expect(undoLabels()).toEqual(['已把 王小明 安排到 B4 桌。', '已把 李大華 安排到 B4 桌。', '已把 王小明 移出 B4 桌。']);
  });

  it('這一桌超過 10 位：紀錄的 label 和 Sonner 一樣是「…，這一桌已超過 10 位。」（SEAT-R89）', async () => {
    const ctx = renderOps();
    await doStep(ctx, WANG_TO_B10, '已把 王小明 安排到 B10 桌，這一桌已超過 10 位。');
    expect(await findToast('已把 王小明 安排到 B10 桌，這一桌已超過 10 位。')).toBeTruthy();
  });

  it('被拒（別人剛改過，409）：這一步不記進紀錄；重新載入，原本的紀錄也清掉（SEAT-R86、SEAT-R100）', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    ctx.server.failNext('CONFLICT');
    await ctx.user.click(screen.getByRole('button', { name: '做：李大華入座' }));
    await waitFor(() => expect(ctx.server.stateLoads()).toBeGreaterThan(0));
    await waitFor(() => expect(ctx.notify).toHaveBeenCalledWith(CONFLICT));
    expect(undoLabels()).toEqual([]);
    expect(redoLabels()).toEqual([]);
  });
});

describe('undo()（SEAT-R77、SEAT-R78、SEAT-R79）', () => {
  it('送出 restore，快照是最近一步回應的 undo；成功後從復原紀錄拿掉，同一個 label 放進重做紀錄；Sonner「已復原。」不帶按鈕', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    await doStep(ctx, SEAT_LEE);

    await callUndo(ctx);
    expect(ctx.server.operations[2]).toMatchObject({ type: 'restore', snapshot: ctx.server.replies[1]!.undo });
    await waitFor(() => expect(redoLabels()).toEqual(['已把 李大華 安排到 B4 桌。']));
    expect(undoLabels()).toEqual(['已把 王小明 安排到 B4 桌。']);
    expect(placeOf(ctx.server, LEE)).toEqual(UNSEATED);
    expect(placeOf(ctx.server, WANG)).toEqual({ tableId: B4, seatOrder: 0 });
    const t = await findToast(UNDONE);
    expect(within(t).queryByRole('button', { name: '復原' })).toBeNull();
  });

  it('連續復原：一次退一步；重做紀錄的最後一步是最近一次復原的（SEAT-AC130）', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    await doStep(ctx, SEAT_LEE);
    await doStep(ctx, UNSEAT_WANG);

    await callUndo(ctx);
    await waitFor(() => expect(undoLabels()).toHaveLength(2));
    expect(placeOf(ctx.server, WANG)).toEqual({ tableId: B4, seatOrder: 0 });
    await callUndo(ctx);
    await waitFor(() => expect(undoLabels()).toHaveLength(1));
    expect(placeOf(ctx.server, LEE)).toEqual(UNSEATED);
    await callUndo(ctx);
    await waitFor(() => expect(undoLabels()).toEqual([]));
    expect(placeOf(ctx.server, WANG)).toEqual(UNSEATED);
    expect(redoLabels()).toEqual(['已把 王小明 移出 B4 桌。', '已把 李大華 安排到 B4 桌。', '已把 王小明 安排到 B4 桌。']);
  });

  it('沒有可以復原的步驟：不送出任何請求', async () => {
    const ctx = renderOps();
    await ctx.user.click(screen.getByRole('button', { name: '呼叫 undo()' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(ctx.server.operations).toHaveLength(0);
  });

  it('用 undo() 復原時，那一步的 Sonner 如果還在就一起關掉（SEAT-R77、SEAT-AC135）', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    await findToast('已把 王小明 安排到 B4 桌。');
    await callUndo(ctx);
    await waitFor(() => expect(toastWith('已把 王小明 安排到 B4 桌。'), '那一步的 Sonner 關掉').toBeUndefined());
  });

  it('復原時別人剛改過（409）：不儲存，重新載入，復原、重做紀錄都清掉；不顯示「已復原。」（SEAT-R86、SEAT-R100、SEAT-AC136）', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    await doStep(ctx, SEAT_LEE);
    await callUndo(ctx);
    await waitFor(() => expect(redoLabels()).toHaveLength(1));

    ctx.server.failNext('CONFLICT');
    await callUndo(ctx);
    await waitFor(() => expect(ctx.server.stateLoads()).toBeGreaterThan(0));
    await waitFor(() => expect(ctx.notify).toHaveBeenCalledWith(CONFLICT));
    await waitFor(() => expect(undoLabels()).toEqual([]));
    expect(redoLabels()).toEqual([]);
    expect(placeOf(ctx.server, WANG), '伺服器的資料不變').toEqual({ tableId: B4, seatOrder: 0 });
    // 「已復原。」只有前一次成功的那一則
    expect(toastItems().filter((li) => li.textContent?.includes(UNDONE)).length).toBeLessThanOrEqual(1);
  });
});

describe('redo()（SEAT-R99、SEAT-R79）', () => {
  it('送出 restore，快照是復原時回應的 undo；成功後從重做紀錄拿掉、放回復原紀錄（label 相同），重做紀錄的其他步驟保留；Sonner「已重做。」不帶按鈕', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    await doStep(ctx, SEAT_LEE);
    await callUndo(ctx); // operations[2]
    await waitFor(() => expect(redoLabels()).toHaveLength(1));
    await callUndo(ctx); // operations[3]
    await waitFor(() => expect(redoLabels()).toHaveLength(2));
    expect(placeOf(ctx.server, WANG)).toEqual(UNSEATED);

    await callRedo(ctx); // operations[4]
    expect(ctx.server.operations[4]).toMatchObject({ type: 'restore', snapshot: ctx.server.replies[3]!.undo });
    await waitFor(() => expect(undoLabels()).toEqual(['已把 王小明 安排到 B4 桌。']));
    expect(redoLabels()).toEqual(['已把 李大華 安排到 B4 桌。']);
    expect(placeOf(ctx.server, WANG)).toEqual({ tableId: B4, seatOrder: 0 });
    const t = await findToast(REDONE);
    expect(within(t).queryByRole('button', { name: '復原' })).toBeNull();
  });

  it('一步一步重做到復原之前：資料和做完時相同；重做紀錄變空（SEAT-AC130）', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    await doStep(ctx, SEAT_LEE);
    await doStep(ctx, UNSEAT_WANG);
    const done = structuredClone(ctx.server.state().participants);
    for (let i = 0; i < 3; i++) {
      await callUndo(ctx);
      await waitFor(() => expect(redoLabels()).toHaveLength(i + 1));
    }
    for (let i = 0; i < 3; i++) {
      await callRedo(ctx);
      await waitFor(() => expect(redoLabels()).toHaveLength(2 - i));
    }
    expect(ctx.server.state().participants).toEqual(done);
    expect(undoLabels()).toEqual(['已把 王小明 安排到 B4 桌。', '已把 李大華 安排到 B4 桌。', '已把 王小明 移出 B4 桌。']);
  });

  it('重做之後還能再復原：復原紀錄裡的是重做時回應的 undo', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    await callUndo(ctx); // [1]
    await waitFor(() => expect(redoLabels()).toHaveLength(1));
    await callRedo(ctx); // [2]
    await waitFor(() => expect(undoLabels()).toHaveLength(1));
    await callUndo(ctx); // [3]
    expect(ctx.server.operations[3]).toMatchObject({ type: 'restore', snapshot: ctx.server.replies[2]!.undo });
    await waitFor(() => expect(placeOf(ctx.server, WANG)).toEqual(UNSEATED));
  });

  it('沒有可以重做的步驟：不送出任何請求', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    await ctx.user.click(screen.getByRole('button', { name: '呼叫 redo()' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(ctx.server.operations).toHaveLength(1);
  });

  it('復原之後做新的可以復原的操作：重做紀錄清掉，redo() 不送出（SEAT-AC131）', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    await doStep(ctx, SEAT_LEE);
    await callUndo(ctx);
    await waitFor(() => expect(redoLabels()).toHaveLength(1));

    await doStep(ctx, SEAT_CHEN);
    expect(redoLabels()).toEqual([]);
    expect(undoLabels()).toEqual(['已把 王小明 安排到 B4 桌。', '已把 陳大文 安排到 B2 桌。']);
    const sent = ctx.server.operations.length;
    await ctx.user.click(screen.getByRole('button', { name: '呼叫 redo()' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(ctx.server.operations).toHaveLength(sent);
  });

  it('重做時別人剛改過（409）：不儲存，重新載入，紀錄都清掉（SEAT-R100）', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    await callUndo(ctx);
    await waitFor(() => expect(redoLabels()).toHaveLength(1));

    ctx.server.failNext('CONFLICT');
    await callRedo(ctx);
    await waitFor(() => expect(ctx.notify).toHaveBeenCalledWith(CONFLICT));
    await waitFor(() => expect(redoLabels()).toEqual([]));
    expect(undoLabels()).toEqual([]);
    expect(placeOf(ctx.server, WANG)).toEqual(UNSEATED);
  });
});

describe('最多 20 步（SEAT-R77、SEAT-AC132）', () => {
  it('連續做 21 步：只記最近 20 步；undo() 20 次後沒有可以復原的步驟，第 1 步沒有被復原', async () => {
    // 第 i 步把王小明放到第 i 張空桌（跳過已滿的 B10 桌；第 1 步入座，之後每一步都是搬移）
    const tableIds = Array.from({ length: 30 }, (_, i) => i + 1)
      .filter((id) => id !== B10)
      .slice(0, 21);
    const steps: Step[] = tableIds.map((tableId, i) => ({
      name: `第 ${i + 1} 步`,
      op: { type: 'seat', participantId: WANG, tableId },
      message: `第 ${i + 1} 步`,
    }));
    const ctx = renderOps(steps);
    for (const s of steps) await doStep(ctx, s);
    expect(undoLabels()).toEqual(steps.slice(1).map((s) => s.message));
    expect(placeOf(ctx.server, WANG).tableId).toBe(tableIds[20]);

    for (let k = 1; k <= 20; k++) {
      await callUndo(ctx);
      await waitFor(() => expect(undoLabels()).toHaveLength(20 - k));
    }
    expect(placeOf(ctx.server, WANG), '第 1 步（入座內部編號 1 的桌）沒有被復原').toEqual({ tableId: 1, seatOrder: 0 });
    expect(redoLabels()).toHaveLength(20);
    expect(redoLabels().at(-1)).toBe('第 2 步');

    const sent = ctx.server.operations.length;
    await ctx.user.click(screen.getByRole('button', { name: '呼叫 undo()' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(ctx.server.operations).toHaveLength(sent);
  });
});

describe('Sonner 的「復原」（SEAT-R77、SEAT-AC135）', () => {
  it('最近一步的 Sonner「復原」等於復原最近一步：送 restore、那一步進重做紀錄、Sonner「已復原。」', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    const t = await findToast('已把 王小明 安排到 B4 桌。');
    await ctx.user.click(within(t).getByRole('button', { name: '復原' }));
    await waitFor(() => expect(ctx.server.operations).toHaveLength(2));
    expect(ctx.server.operations[1]).toMatchObject({ type: 'restore', snapshot: ctx.server.replies[0]!.undo });
    await waitFor(() => expect(redoLabels()).toEqual(['已把 王小明 安排到 B4 桌。']));
    expect(undoLabels()).toEqual([]);
    await findToast(UNDONE);
  });

  it('做了下一步之後，前一則 Sonner 的「復原」沒有作用（還在畫面上的話，按了也不送出）', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    const first = await findToast('已把 王小明 安排到 B4 桌。');
    const firstUndo = within(first).queryByRole('button', { name: '復原' });
    await doStep(ctx, SEAT_LEE);
    await findToast('已把 李大華 安排到 B4 桌。');

    if (firstUndo && document.body.contains(firstUndo)) {
      await ctx.user.click(firstUndo);
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(ctx.server.operations).toHaveLength(2);
    expect(undoLabels()).toHaveLength(2);
    expect(placeOf(ctx.server, WANG)).toEqual({ tableId: B4, seatOrder: 0 });
  });
});

describe('不能復原的操作不會清掉紀錄（SEAT-R77、SEAT-R80、SEAT-AC134）', () => {
  it('改備註名稱：Sonner「已儲存」；不記進紀錄，原本的紀錄（含重做紀錄）也還在', async () => {
    const ctx = renderOps();
    await doStep(ctx, SEAT_WANG);
    await doStep(ctx, SEAT_LEE);
    await callUndo(ctx);
    await waitFor(() => expect(redoLabels()).toHaveLength(1));

    await ctx.user.click(screen.getByRole('button', { name: '改 B2 桌的備註名稱' }));
    await findToast('已儲存');
    await waitFor(() => expect(ctx.server.state().tables.find((t) => t.id === B2)?.noteName).toBe('供應商'));
    expect(undoLabels()).toEqual(['已把 王小明 安排到 B4 桌。']);
    expect(redoLabels()).toEqual(['已把 李大華 安排到 B4 桌。']);
  });
});

describe('自動排座（ARR-R13、SEAT-AC137）', () => {
  it('排了人：記成一步，label 是那一次的 Sonner；undo() 一次回到排座之前，redo() 回到排好的結果', async () => {
    const ctx = renderOps();
    await ctx.user.click(screen.getByRole('button', { name: '呼叫 autoArrange()' }));
    await waitFor(() => expect(undoLabels()).toEqual(['已把 3 位安排到 1 桌。']));
    const arranged = structuredClone(ctx.server.state().participants);

    await callUndo(ctx);
    await waitFor(() => expect(redoLabels()).toEqual(['已把 3 位安排到 1 桌。']));
    for (const id of [WANG, LEE, CHEN]) expect(placeOf(ctx.server, id)).toEqual(UNSEATED);

    await callRedo(ctx);
    await waitFor(() => expect(undoLabels()).toEqual(['已把 3 位安排到 1 桌。']));
    expect(ctx.server.state().participants).toEqual(arranged);
    await findToast(REDONE);
  });

  it('沒有可以排的人（排了 0 位）：不記進紀錄', async () => {
    const ctx = renderOps();
    await ctx.user.click(screen.getByRole('button', { name: '呼叫 autoArrange()' }));
    await waitFor(() => expect(undoLabels()).toHaveLength(1));
    await ctx.user.click(screen.getByRole('button', { name: '呼叫 autoArrange()' }));
    await findToast('沒有可以排的員工與眷屬。');
    expect(undoLabels()).toEqual(['已把 3 位安排到 1 桌。']);
  });
});

// ============================================================================
// 座位安排頁：工具列的「復原」「重做」接上紀錄
// ============================================================================

describe('座位安排頁的工具列（2.1.3、SEAT-R77、SEAT-R79、SEAT-R90、SEAT-R99、SEAT-R100）', () => {
  /** B4 桌（內部編號 3）坐甲、乙；王小明未入座 */
  function pageState(): AppState {
    return {
      employees: [employee(WANG, { name: '王小明', department: '研發一部' }), employee(102, { name: '甲' }), employee(103, { name: '乙' })],
      participants: [asEmployee(WANG), asEmployee(102, { tableId: B4, seatOrder: 0 }), asEmployee(103, { tableId: B4, seatOrder: 1 })],
      tables: allTables(),
    };
  }

  function renderPage(isEditor = true) {
    const data = pageState();
    const server = fakeServer(data);
    const notify = vi.fn<(text: string) => void>();
    const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
    render(
      <>
        <AppProvider initialData={data} user={USER} isEditor={isEditor} notify={notify}>
          <SeatingPage initialTable={null} />
        </AppProvider>
        <Toaster />
      </>,
    );
    return { user, server, notify };
  }

  /** 工具列的按鈕：名稱正好是 name、不在 Sonner 通知區裡的 button（只能有一個） */
  function toolbar(name: '復原' | '重做'): HTMLButtonElement {
    const found = screen.getAllByRole('button', { name }).filter((b) => !toastRegion()?.contains(b));
    expect(found, `工具列的「${name}」`).toHaveLength(1);
    return found[0] as HTMLButtonElement;
  }

  async function expectTooltipOf(name: '復原' | '重做', text: string) {
    act(() => toolbar(name).focus());
    await waitFor(() => expect(screen.getByRole('tooltip').textContent?.trim()).toBe(text));
    act(() => toolbar(name).blur());
  }

  const MOVED = '已把 B4 桌移到暫存區。';

  /** 從 B4 桌詳情按「移到暫存區」 */
  async function moveB4ToStaging(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /^B4 桌/ }));
    const detail = await waitFor(() => screen.queryByRole('region', { name: 'B4 桌' }) ?? screen.getByRole('dialog', { name: 'B4 桌' }));
    await user.click(within(detail).getByRole('button', { name: '移到暫存區' }));
  }

  it('檢視者：工具列沒有「復原」「重做」（SEAT-R90、SEAT-AC138）', () => {
    renderPage(false);
    expect(screen.queryAllByRole('button', { name: '復原', hidden: true })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: '重做', hidden: true })).toHaveLength(0);
  });

  it('編輯者剛開啟：「復原」「重做」都停用（SEAT-AC129）', () => {
    renderPage();
    expect(toolbar('復原').disabled).toBe(true);
    expect(toolbar('重做').disabled).toBe(true);
  });

  it('儲存中「復原」仍停用；儲存完成後可以按，Tooltip「復原：{那一步的 Sonner 文字}」（SEAT-R77、SEAT-AC129）', async () => {
    const { user, server } = renderPage();
    const release = server.hold();
    await moveB4ToStaging(user);
    await waitFor(() => expect(server.operations).toHaveLength(1));
    expect(toolbar('復原').disabled).toBe(true);

    await act(async () => release());
    await waitFor(() => expect(toolbar('復原').disabled).toBe(false));
    expect(toolbar('重做').disabled).toBe(true);
    await expectTooltipOf('復原', `復原：${MOVED}`);
  });

  it('按工具列的「復原」：送 restore，Sonner「已復原。」、那一步的 Sonner 關掉，B4 桌回到原位；「復原」停用、「重做」可以按（Tooltip「重做：…」）→ 按「重做」：送 restore（快照是復原回應的 undo），Sonner「已重做。」，B4 又是「未放桌」，「重做」停用（SEAT-AC130、SEAT-AC135）', async () => {
    const { user, server } = renderPage();
    await moveB4ToStaging(user);
    await waitFor(() => expect(toolbar('復原').disabled).toBe(false));
    await findToast(MOVED);
    expect(await screen.findByRole('button', { name: 'B4 未放桌' })).toBeTruthy();

    await user.click(toolbar('復原'));
    await waitFor(() => expect(server.operations).toHaveLength(2));
    expect(server.operations[1]).toMatchObject({ type: 'restore', snapshot: server.replies[0]!.undo });
    await findToast(UNDONE);
    await waitFor(() => expect(toastWith(MOVED), '那一步的 Sonner 關掉').toBeUndefined());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'B4 未放桌' })).toBeNull());
    expect(screen.getByRole('button', { name: /^B4 桌/ })).toBeTruthy();
    await waitFor(() => expect(toolbar('重做').disabled).toBe(false));
    expect(toolbar('復原').disabled).toBe(true);
    await expectTooltipOf('重做', `重做：${MOVED}`);

    await user.click(toolbar('重做'));
    await waitFor(() => expect(server.operations).toHaveLength(3));
    expect(server.operations[2]).toMatchObject({ type: 'restore', snapshot: server.replies[1]!.undo });
    const redone = await findToast(REDONE);
    expect(within(redone).queryByRole('button', { name: '復原' })).toBeNull();
    expect(await screen.findByRole('button', { name: 'B4 未放桌' })).toBeTruthy();
    await waitFor(() => expect(toolbar('重做').disabled).toBe(true));
    expect(toolbar('復原').disabled).toBe(false);
    await expectTooltipOf('復原', `復原：${MOVED}`);
  });

  it('復原時別人剛改過（409）：重新載入，「復原」「重做」都停用（SEAT-R100、SEAT-AC136）', async () => {
    const { user, server, notify } = renderPage();
    await moveB4ToStaging(user);
    await waitFor(() => expect(toolbar('復原').disabled).toBe(false));

    server.failNext('CONFLICT');
    await user.click(toolbar('復原'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(CONFLICT));
    expect(server.stateLoads()).toBeGreaterThan(0);
    await waitFor(() => expect(toolbar('復原').disabled).toBe(true));
    expect(toolbar('重做').disabled).toBe(true);
    // 重新載入的是伺服器的資料：B4 桌仍在暫存區
    expect(await screen.findByRole('button', { name: 'B4 未放桌' })).toBeTruthy();
  });
});
