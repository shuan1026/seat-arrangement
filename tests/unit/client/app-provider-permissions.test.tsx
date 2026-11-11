// 前端的權限狀態與「編輯權限被移除」的處理：docs/spec/README.md 第 2 節（COM-R19、COM-R20）、AUTH-R11、AUTH-R13
// （下一次修改資料的操作被拒：這次不儲存、後續操作一併取消、重新載入最新資料並切換成只能檢視、Sonner「你沒有編輯權限，已重新載入。」）；
// docs/architecture.md 第 8 節（GET /api/state 多 me.isEditor 與 seatsPublished）、第 9.3 節（layout 把 isEditor 放進 store 的 me.isEditor）、
// 第 10.3 節第 7 點；D-021。用假的 fetch 取代 GET /api/state，不發網路請求。
//
// 假設的介面：
// - AppProvider 多兩個可省略的 props：isEditor?: boolean（省略時是 true；只有測試會省略，(main)/layout.tsx 一律傳伺服器判斷的值）、
//   seatsPublished?: boolean（省略時是 false）。
// - store（useAppStore）多 isEditor: boolean 與 seatsPublished: boolean；重新載入（GET /api/state）時依回應的 me.isEditor、seatsPublished 更新。
// - 儲存佇列收到 403 NOT_EDITOR 時（tests/unit/client/save-queue-not-editor.test.ts），AppProvider 重新載入 GET /api/state，
//   用 notify 顯示「你沒有編輯權限，已重新載入。」。
// - 儲存佇列收到 403 NO_ACCESS 時（權限被移除，AUTH-R17、D-026；tests/unit/client/save-queue-no-access.test.ts），AppProvider 關閉開著的對話框、
//   呼叫 next/navigation 的 router.refresh()，讓 (main)/layout.tsx 在同一個網址改畫「沒有權限」頁；不顯示 Sonner
//   （docs/architecture.md 第 8.2 節、第 10.3 節第 8 點）。
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState, Employee } from '@/contracts/entities';
import { ApiFailure } from '@/client/api';
import { AppProvider, useAppStore, useMutation } from '@/client/app-provider';
import { saveStatusText } from '@/client/save-time';

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

const employee = (id: number, name: string): Employee => ({
  id,
  name,
  englishName: null,
  department: '研發一部',
  team: null,
  extension: null,
  region: null,
  office: null,
  note: null,
  declined: false,
  sortOrder: id,
});

const INITIAL: AppState = { employees: [employee(1, '王小明')], participants: [], tables: [] };
const USER = { name: '甲同仁', email: 'jia@program.com.tw' };
const NOT_EDITOR_TEXT = '你沒有編輯權限，已重新載入。';

/** 伺服器上的最新資料（GET /api/state 的回應，含 me 與 seatsPublished） */
const latest = (isEditor: boolean, seatsPublished = false) => ({
  employees: [employee(1, '王小明'), employee(2, '李美華')],
  participants: [],
  tables: [],
  me: { isEditor },
  seatsPublished,
});

function Probe({ sends }: { sends: (() => Promise<unknown>)[] }) {
  const mutate = useMutation();
  const isEditor = useAppStore((s) => s.isEditor);
  const published = useAppStore((s) => s.seatsPublished);
  const names = useAppStore((s) => s.data.employees.map((e) => e.name).join('、'));
  const save = useAppStore((s) => s.save);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          for (const send of sends) mutate({ optimistic: (d) => ({ ...d, employees: [] }), send });
        }}
      >
        做操作
      </button>
      <p data-testid="editor">{isEditor ? '編輯者' : '只能檢視'}</p>
      <p data-testid="published">{published ? '已發布' : '未發布'}</p>
      <p data-testid="names">{names || '（沒有員工）'}</p>
      <p data-testid="save">{saveStatusText(save)}</p>
    </div>
  );
}

function setup(props: { isEditor?: boolean; seatsPublished?: boolean }, sends: (() => Promise<unknown>)[], state = latest(false)) {
  const notify = vi.fn<(text: string) => void>();
  const fetchMock = vi.fn<typeof fetch>(async () => ({ ok: true, status: 200, json: async () => state }) as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
  render(
    <AppProvider initialData={INITIAL} user={USER} notify={notify} {...props}>
      <Probe sends={sends} />
    </AppProvider>,
  );
  return { notify, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const fn of Object.values(router)) fn.mockReset();
});

describe('一開始的權限（COM-R19、docs/architecture.md 第 9.3 節）', () => {
  it('isEditor 是 true：store 是編輯者', () => {
    setup({ isEditor: true }, []);
    expect(screen.getByTestId('editor').textContent).toBe('編輯者');
  });

  it('isEditor 是 false：store 是只能檢視', () => {
    setup({ isEditor: false }, []);
    expect(screen.getByTestId('editor').textContent).toBe('只能檢視');
  });

  it('seatsPublished 放進 store（發布對話框讀它，PRM-R17）', () => {
    setup({ isEditor: true, seatsPublished: true }, []);
    expect(screen.getByTestId('published').textContent).toBe('已發布');
  });

  it('seatsPublished 省略時是未發布（預設未發布，PRM-R17）', () => {
    setup({ isEditor: true }, []);
    expect(screen.getByTestId('published').textContent).toBe('未發布');
  });
});

describe('被改為檢視者後的下一次操作（AUTH-R13、AUTH-AC17）', () => {
  it('403 NOT_EDITOR：重新載入 GET /api/state，畫面換成最新資料並切換成只能檢視；Sonner「你沒有編輯權限，已重新載入。」', async () => {
    const { notify, fetchMock } = setup({ isEditor: true }, [() => Promise.reject(new ApiFailure('NOT_EDITOR', 403, 'not editor'))]);

    await userEvent.click(screen.getByRole('button', { name: '做操作' }));

    await waitFor(() => expect(screen.getByTestId('names').textContent).toBe('王小明、李美華'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/state');
    await waitFor(() => expect(screen.getByTestId('editor').textContent).toBe('只能檢視'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(NOT_EDITOR_TEXT));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalledWith('資料已被其他人更新，已重新載入。');
    expect(screen.getByTestId('save').textContent).not.toBe('儲存失敗，請檢查網路後再試一次。');
    expect(screen.getByTestId('save').textContent).not.toBe('儲存中…');
  });

  it('接著馬上做的第二個操作也不送出（還沒存的後續操作一併取消）', async () => {
    const first = vi.fn(() => Promise.reject(new ApiFailure('NOT_EDITOR', 403, 'not editor')));
    const second = vi.fn(() => Promise.resolve({}));
    const { notify } = setup({ isEditor: true }, [first, second]);

    await userEvent.click(screen.getByRole('button', { name: '做操作' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith(NOT_EDITOR_TEXT));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('重新載入時以 /api/state 的 me.isEditor 為準：別人剛改過資料（404）而自己仍是編輯者 → 仍是編輯者', async () => {
    const { notify } = setup({ isEditor: true }, [() => Promise.reject(new ApiFailure('NOT_FOUND', 404, 'gone'))], latest(true));

    await userEvent.click(screen.getByRole('button', { name: '做操作' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('資料已被其他人更新，已重新載入。'));
    expect(screen.getByTestId('editor').textContent).toBe('編輯者');
  });

  it('重新載入時也更新發布狀態（別人剛發布）', async () => {
    setup({ isEditor: true, seatsPublished: false }, [() => Promise.reject(new ApiFailure('NOT_FOUND', 404, 'gone'))], latest(true, true));

    await userEvent.click(screen.getByRole('button', { name: '做操作' }));

    await waitFor(() => expect(screen.getByTestId('published').textContent).toBe('已發布'));
  });
});

describe('權限被移除後的下一次操作（AUTH-R17、AUTH-AC26、PRM-AC43）', () => {
  /** 給畫面一點時間：確認之後沒有遲到的 Sonner */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  it('403 NO_ACCESS：呼叫 router.refresh()（同一個網址改畫「沒有權限」頁）；不顯示任何 Sonner，Header 不是「儲存失敗」', async () => {
    const { notify } = setup({ isEditor: true }, [() => Promise.reject(new ApiFailure('NO_ACCESS', 403, 'no access'))]);

    await userEvent.click(screen.getByRole('button', { name: '做操作' }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    await settle();
    expect(notify).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('save').textContent).not.toBe('儲存失敗，請檢查網路後再試一次。');
  });

  it('接著馬上做的第二個操作也不送出（還沒存的後續操作一併取消）', async () => {
    const first = vi.fn(() => Promise.reject(new ApiFailure('NO_ACCESS', 403, 'no access')));
    const second = vi.fn(() => Promise.resolve({}));
    const { notify } = setup({ isEditor: true }, [first, second]);

    await userEvent.click(screen.getByRole('button', { name: '做操作' }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    await settle();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('不會顯示「資料已被其他人更新，已重新載入。」或「你沒有編輯權限，已重新載入。」', async () => {
    const { notify } = setup({ isEditor: true }, [() => Promise.reject(new ApiFailure('NO_ACCESS', 403, 'no access'))]);
    await userEvent.click(screen.getByRole('button', { name: '做操作' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    await settle();
    expect(notify).not.toHaveBeenCalledWith('資料已被其他人更新，已重新載入。');
    expect(notify).not.toHaveBeenCalledWith(NOT_EDITOR_TEXT);
  });
});
