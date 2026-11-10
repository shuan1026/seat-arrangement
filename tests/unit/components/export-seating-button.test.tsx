// 「匯出座位表」按鈕：docs/spec/export.md 第 2 節、第 4 節文案、EXP-R01（直接下載、不開對話框）、EXP-R03（檔名）、
// EXP-R06（成功提示）、EXP-R07（產生或下載失敗時不下載、顯示失敗提示）；EXP-AC01、EXP-AC19 的按鈕部分。
// 頁首放按鈕（參與人員頁、座位安排頁）是階段 3 的事，這裡只測元件本身。
// 用假的 fetch 取代 GET /api/export/seating；攔下 <a download> 的點擊，記下下載的檔名。Sonner 用真的 Toaster 顯示。
//
// 假設的介面（src/components/features/export/export-seating-button.tsx）：
//   export function ExportSeatingButton(): JSX.Element
//   - 不需要 props；放在 AppProvider 裡外都可以。
//   - 按下 → fetch GET /api/export/seating → 成功：用回應的 Blob 建立下載（<a download>），檔名用 Content-Disposition 的
//     「座位表_{YYYYMMDD}.xlsx」，Sonner「已匯出座位表。」；非 2xx 或網路中斷：不下載，Sonner「匯出座位表失敗，請確認網路連線後再試一次。」
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/client/app-provider';
import { ExportSeatingButton } from '@/components/features/export/export-seating-button';
import { Toaster } from '@/components/ui/toaster';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FILE_NAME = '座位表_20261110.xlsx';
const SUCCESS = '已匯出座位表。';
const FAILURE = '匯出座位表失敗，請確認網路連線後再試一次。';

const xlsxResponse = () =>
  new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]), {
    status: 200,
    headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': `attachment; filename="seating.xlsx"; filename*=UTF-8''${encodeURIComponent(FILE_NAME)}`,
    },
  });

const errorResponse = (status: number) =>
  new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'internal error' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const urlOf = (input: RequestInfo | URL | undefined): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : (input?.url ?? '');

let downloads: { name: string; href: string }[] = [];
const createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:export-test');
const revokeObjectURL = vi.fn<(url: string) => void>();

function renderButton() {
  render(
    <AppProvider
      initialData={{ employees: [], participants: [], tables: [] }}
      user={{ name: '測試承辦人', email: 'tester@program.com.tw' }}
    >
      <ExportSeatingButton />
      <Toaster />
    </AppProvider>,
  );
  return screen.getByRole('button', { name: '匯出座位表' });
}

beforeEach(() => {
  downloads = [];
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  // jsdom 沒有 URL.createObjectURL；點擊 <a download> 也不會真的下載
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, href: this.getAttribute('href') ?? '' });
  });
  // 匯出當天：台灣時間 2026-11-10 中午
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T04:00:00Z'));
});

afterEach(() => {
  toast.dismiss();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ExportSeatingButton', () => {
  it('顯示「匯出座位表」按鈕（第 4 節文案）', () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => xlsxResponse()));
    const button = renderButton();
    expect(button.textContent).toContain('匯出座位表');
  });

  it('按下直接下載「座位表_20261110.xlsx」，不開對話框；Sonner 顯示「已匯出座位表。」（EXP-R01、EXP-R03、EXP-R06、EXP-AC01）', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => xlsxResponse());
    vi.stubGlobal('fetch', fetchMock);
    const button = renderButton();

    await userEvent.click(button);

    expect(await screen.findByText(SUCCESS)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(urlOf(input)).toMatch(/\/api\/export\/seating$/);
    expect((init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()).toBe('GET');
    expect(downloads).toEqual([{ name: FILE_NAME, href: 'blob:export-test' }]);
    // 下載的是回應的內容（Node 的 Blob 與 jsdom 的 Blob 不是同一個類別，只看大小）
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect((createObjectURL.mock.calls[0]?.[0] as Blob | undefined)?.size).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByText(FAILURE)).toBeNull();
  });

  it.each<[string, () => Promise<Response>]>([
    ['伺服器回傳錯誤（500）', async () => errorResponse(500)],
    ['伺服器無法使用（503）', async () => errorResponse(503)],
    [
      '網路中斷',
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('%s：不下載檔案，Sonner 顯示「匯出座位表失敗，請確認網路連線後再試一次。」（EXP-R07、EXP-AC19）', async (_label, respond) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(respond));
    const button = renderButton();

    await userEvent.click(button);

    expect(await screen.findByText(FAILURE)).toBeTruthy();
    expect(downloads).toEqual([]);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByText(SUCCESS)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('失敗之後可以再按一次，成功就下載', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => {
        throw new TypeError('Failed to fetch');
      })
      .mockImplementation(async () => xlsxResponse());
    vi.stubGlobal('fetch', fetchMock);
    const button = renderButton();

    await userEvent.click(button);
    expect(await screen.findByText(FAILURE)).toBeTruthy();
    expect(downloads).toEqual([]);

    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    await userEvent.click(button);
    expect(await screen.findByText(SUCCESS)).toBeTruthy();
    expect(downloads).toEqual([{ name: FILE_NAME, href: 'blob:export-test' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
