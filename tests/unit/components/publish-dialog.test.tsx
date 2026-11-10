// 發布座位表的對話框：docs/spec/permissions.md 第 2.2 節（版面、元件、狀態）、PRM-R17（預設未發布，勾選框與徽章反映目前狀態）、
// PRM-R18（連結是目前網站的網址加 /seats，未發布時也顯示；唯讀；複製到剪貼簿與 Sonner）、PRM-R19（切換立即儲存、不需確認、
// Sonner 不帶「復原」）、第 4.2 節文案；PRM-AC17～AC19；待確認 PRM-Q02（複製失敗：Sonner「無法複製，請手動選取連結。」）；
// docs/architecture.md 第 8 節（PUT /api/publish，本體 { published: boolean }，回傳目前狀態）、第 11.5 節（連結用 window.location.origin
// 加 /seats，複製用 navigator.clipboard.writeText）。座位安排頁頁首的「發布」按鈕與完整情境在 tests/e2e/publish-dialog.spec.ts。
//
// 假設的介面（src/components/features/publish/publish-dialog.tsx）：
//   export function PublishDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element
//   - 放在 AppProvider 裡，目前狀態讀 store 的 seatsPublished（AppProvider 的 seatsPublished prop）；切換成功後更新 store。
//   - 提示用 Sonner（@/components/ui/toaster 的 notify），這裡渲染 <Toaster /> 確認畫面上的文字。
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/client/app-provider';
import { PublishDialog } from '@/components/features/publish/publish-dialog';
import { Toaster, notify } from '@/components/ui/toaster';
import type { AppState } from '@/contracts/entities';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
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
  vi.restoreAllMocks();
});

const EMPTY: AppState = { employees: [], participants: [], tables: [] };
const USER = { name: '甲同仁', email: 'jia@program.com.tw' };
const DESCRIPTION = '同仁用公司帳號登入後，可以在這個連結查自己的座位。';

type Call = { method: string; path: string; body: Record<string, unknown> | null };

/** 假的 API：PUT /api/publish 回 { published }；GET /api/state 回目前狀態 */
function mockApi() {
  const calls: Call[] = [];
  let published = false;
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
      let status = 200;
      let body: unknown;
      if (call.method === 'PUT' && call.path === '/api/publish') {
        published = Boolean(call.body?.published);
        body = { published };
      } else if (call.path === '/api/state') {
        body = { ...EMPTY, me: { isEditor: true }, seatsPublished: published };
      } else {
        status = 500;
        body = { error: { code: 'INTERNAL', message: 'not stubbed' } };
      }
      return { ok: status < 300, status, json: async () => body } as unknown as Response;
    }),
  );
  return calls;
}

function renderDialog(seatsPublished: boolean) {
  const calls = mockApi();
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  render(
    <>
      <AppProvider initialData={EMPTY} user={USER} isEditor seatsPublished={seatsPublished} notify={(text) => notify(text)}>
        <PublishDialog open onOpenChange={onOpenChange} />
      </AppProvider>
      <Toaster />
    </>,
  );
  const dialog = screen.getByRole('dialog', { name: '發布座位表' });
  return { user, calls, onOpenChange, dialog };
}

const checkbox = (dialog: HTMLElement) => within(dialog).getByRole('checkbox', { name: '發布座位表' });
const isChecked = (el: HTMLElement) => el.getAttribute('aria-checked') === 'true' || (el as HTMLInputElement).checked === true;
const linkField = (dialog: HTMLElement) => within(dialog).getByRole('textbox', { name: '連結' }) as HTMLInputElement;
const puts = (calls: Call[]) => calls.filter((c) => c.method === 'PUT' && c.path === '/api/publish');
const expectNoUndo = () => expect(screen.queryByRole('button', { name: '復原', hidden: true })).toBeNull();

/** 換掉 navigator.clipboard（在 userEvent.setup 之後呼叫，蓋過 user-event 的假剪貼簿） */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  const fn = vi.fn(writeText);
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: fn } });
  return fn;
}

describe('版面與文案（第 2.2 節、第 4.2 節、PRM-AC17）', () => {
  it('標題「發布座位表」、說明、「發布座位表」勾選框、「連結」欄位、「複製連結」與「關閉」', () => {
    const { dialog } = renderDialog(false);
    expect(within(dialog).getByRole('heading', { name: '發布座位表' })).toBeTruthy();
    expect(within(dialog).getByText(DESCRIPTION, { exact: true })).toBeTruthy();
    expect(checkbox(dialog)).toBeTruthy();
    expect(linkField(dialog)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '複製連結' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '關閉' })).toBeTruthy();
  });

  it('未發布（預設）：勾選框沒打勾，徽章「未發布」', () => {
    const { dialog } = renderDialog(false);
    expect(isChecked(checkbox(dialog))).toBe(false);
    expect(within(dialog).getByText('未發布', { exact: true })).toBeTruthy();
    expect(within(dialog).queryByText('已發布', { exact: true })).toBeNull();
  });

  it('已發布：勾選框打勾，徽章「已發布」', () => {
    const { dialog } = renderDialog(true);
    expect(isChecked(checkbox(dialog))).toBe(true);
    expect(within(dialog).getByText('已發布', { exact: true })).toBeTruthy();
    expect(within(dialog).queryByText('未發布', { exact: true })).toBeNull();
  });

  it.each([false, true])('連結欄位是目前網站的網址加 /seats，未發布時也顯示；唯讀（PRM-R18）（published = %s）', (published) => {
    const { dialog } = renderDialog(published);
    const field = linkField(dialog);
    expect(field.value).toBe(`${window.location.origin}/seats`);
    expect(field.readOnly || field.getAttribute('aria-readonly') === 'true').toBe(true);
  });

  it('按「關閉」關閉對話框，不送出任何請求', async () => {
    const { user, dialog, onOpenChange, calls } = renderDialog(false);
    await user.click(within(dialog).getByRole('button', { name: '關閉' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(puts(calls)).toHaveLength(0);
  });
});

describe('切換發布（PRM-R19、PRM-AC18）', () => {
  it('打勾 → 不需確認，送出 PUT /api/publish { published: true }；徽章變成「已發布」；Sonner「已發布座位表。」，沒有「復原」', async () => {
    const { user, dialog, calls } = renderDialog(false);
    await user.click(checkbox(dialog));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0]?.body).toEqual({ published: true });
    await waitFor(() => expect(within(dialog).getByText('已發布', { exact: true })).toBeTruthy());
    expect(isChecked(checkbox(dialog))).toBe(true);
    expect(await screen.findByText('已發布座位表。')).toBeTruthy();
    expectNoUndo();
  });

  it('已發布時取消打勾 → 送出 { published: false }；徽章「未發布」；Sonner「已停止發布座位表。」，沒有「復原」', async () => {
    const { user, dialog, calls } = renderDialog(true);
    await user.click(checkbox(dialog));

    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0]?.body).toEqual({ published: false });
    await waitFor(() => expect(within(dialog).getByText('未發布', { exact: true })).toBeTruthy());
    expect(isChecked(checkbox(dialog))).toBe(false);
    expect(await screen.findByText('已停止發布座位表。')).toBeTruthy();
    expectNoUndo();
  });

  it('要改回就再切換一次：打勾再取消，依序送出 true、false', async () => {
    const { user, dialog, calls } = renderDialog(false);
    await user.click(checkbox(dialog));
    await waitFor(() => expect(within(dialog).getByText('已發布', { exact: true })).toBeTruthy());
    await user.click(checkbox(dialog));
    await waitFor(() => expect(within(dialog).getByText('未發布', { exact: true })).toBeTruthy());
    expect(puts(calls).map((c) => c.body)).toEqual([{ published: true }, { published: false }]);
  });
});

describe('複製連結（PRM-R18、PRM-AC19、PRM-Q02）', () => {
  it('按「複製連結」→ 把完整的發布頁網址寫進剪貼簿；Sonner「已複製連結。」', async () => {
    const { dialog } = renderDialog(false);
    const writeText = stubClipboard(async () => {});
    fireEvent.click(within(dialog).getByRole('button', { name: '複製連結' }));

    expect(await screen.findByText('已複製連結。')).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/seats`);
  });

  it('PRM-Q02 目前假設：瀏覽器不允許存取剪貼簿 → Sonner「無法複製，請手動選取連結。」；連結欄位仍可以手動選取', async () => {
    const { dialog } = renderDialog(false);
    stubClipboard(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '複製連結' }));

    expect(await screen.findByText('無法複製，請手動選取連結。')).toBeTruthy();
    expect(screen.queryByText('已複製連結。')).toBeNull();
    expect(linkField(dialog).disabled).toBe(false);
  });
});
