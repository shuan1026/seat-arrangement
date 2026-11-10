// 「匯出座位表」按鈕：docs/spec/export.md 第 2 節、第 4 節文案、EXP-R01（直接下載、不開對話框）、EXP-R03（檔名）、
// EXP-R06（成功提示）、EXP-R07（產生或下載失敗時不下載、顯示失敗提示）；EXP-AC01、EXP-AC19 的按鈕部分；
// D-016、EXP-AC21（登入已過期不算失敗：不下載、不顯示匯出失敗，依 docs/spec/README.md AUTH-R07 回到登入頁並顯示「登入已過期。」）。
// 兩個頁首（參與人員頁、座位安排頁）放這個按鈕的 E2E 在 tests/e2e/export-seating-button.spec.ts，這裡只測元件本身。
// 用假的 fetch 取代 GET /api/export/seating；攔下 <a download> 的點擊，記下下載的檔名。Sonner 用真的 Toaster 顯示。
//
// 假設的介面（src/components/features/export/export-seating-button.tsx）：
//   export function ExportSeatingButton(): JSX.Element
//   - 不需要 props；放在 AppProvider 裡外都可以。
//   - 按下 → fetch GET /api/export/seating → 成功：用回應的 Blob 建立下載（<a download>），檔名用 Content-Disposition 的
//     「座位表_{YYYYMMDD}.xlsx」，Sonner「已匯出座位表。」；非 2xx 或網路中斷：不下載，Sonner「匯出座位表失敗，請確認網路連線後再試一次。」
//   - 回 401（登入已過期，API 回 { error: { code: 'UNAUTHENTICATED' } }）：不下載、不顯示失敗提示，做法和儲存佇列的
//     onUnauthenticated（src/client/app-provider.tsx）相同：整頁導到「/login?expired=1&callbackUrl={目前的路徑與網址參數}」。
//     用 window.location.assign、location.replace 或設定 location.href 都可以；這裡把 window.location 換成假的，記下導向的網址。
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

/** 登入已過期：proxy 與每個 Route Handler 都回 401 UNAUTHENTICATED（src/proxy.ts、docs/spec/README.md AUTH-R08） */
const unauthenticatedResponse = () =>
  new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'sign-in required' } }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

const ORIGIN = 'http://localhost:3105';

/**
 * 把 window.location 換成假的（vitest 的 jsdom 環境裡 window 就是 globalThis，location 可以用 stubGlobal 換掉），
 * 記下每一次導向的網址：location.assign()、location.replace() 或設定 location.href 都算。
 * path 是目前開著的頁面（含網址參數，參數要先編碼，和瀏覽器的 location.search 一樣）。
 */
function stubLocation(path: string): string[] {
  const url = new URL(path, ORIGIN);
  const visits: string[] = [];
  const record = (to: string | URL) => {
    visits.push(String(to));
  };
  vi.stubGlobal('location', {
    origin: url.origin,
    protocol: url.protocol,
    host: url.host,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    get href() {
      return url.href;
    },
    set href(to: string) {
      record(to);
    },
    assign: vi.fn(record),
    replace: vi.fn(record),
    reload: vi.fn(),
    toString: () => url.href,
  });
  return visits;
}

/** 導向的網址是登入頁、帶著「登入已過期」與要回去的頁面 */
function expectExpiredLogin(visits: readonly string[], back: { pathname: string; params?: Record<string, string> }) {
  expect(visits, '只導向一次').toHaveLength(1);
  const to = new URL(visits[0] ?? '', ORIGIN);
  expect(to.origin).toBe(ORIGIN);
  expect(to.pathname).toBe('/login');
  expect(to.searchParams.get('expired')).toBe('1');
  const callback = to.searchParams.get('callbackUrl');
  expect(callback, '網址帶著登入後要回去的頁面').toBeTruthy();
  const target = new URL(callback ?? '', ORIGIN);
  expect(target.origin, '回去的頁面是本站').toBe(ORIGIN);
  expect(target.pathname).toBe(back.pathname);
  for (const [key, value] of Object.entries(back.params ?? {})) expect(target.searchParams.get(key)).toBe(value);
}

/** 給畫面一點時間：Sonner 的提示在下一輪才出現 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

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

  it('成功下載時不會導向其他頁面', async () => {
    const visits = stubLocation('/people');
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => xlsxResponse()));
    await userEvent.click(renderButton());
    expect(await screen.findByText(SUCCESS)).toBeTruthy();
    expect(visits).toEqual([]);
  });

  it('伺服器錯誤（500）是匯出失敗，不是登入過期：不導向登入頁（EXP-R07、D-016）', async () => {
    const visits = stubLocation('/people');
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => errorResponse(500)));
    await userEvent.click(renderButton());
    expect(await screen.findByText(FAILURE)).toBeTruthy();
    expect(visits).toEqual([]);
  });
});

describe('ExportSeatingButton：登入已過期（D-016、EXP-AC21、docs/spec/README.md AUTH-R07）', () => {
  it.each<[string, string, { pathname: string; params?: Record<string, string> }]>([
    ['參與人員頁', '/people', { pathname: '/people' }],
    ['參與人員頁（帶網址參數）', `/people?employee=12`, { pathname: '/people', params: { employee: '12' } }],
    ['座位安排頁', '/', { pathname: '/' }],
    // 網址參數用桌號（D-019、PPL-R33）
    ['座位安排頁（帶網址參數）', '/?table=B10', { pathname: '/', params: { table: 'B10' } }],
  ])(
    '在%s按「匯出座位表」、API 回 401：不下載檔案，不顯示匯出失敗的 Sonner；整頁回到登入頁並顯示「登入已過期。」，登入後回到原本的頁面（含網址參數）',
    async (_page, path, back) => {
      const visits = stubLocation(path);
      const fetchMock = vi.fn<typeof fetch>(async () => unauthenticatedResponse());
      vi.stubGlobal('fetch', fetchMock);
      const button = renderButton();

      await userEvent.click(button);

      await waitFor(() => expect(visits.length).toBeGreaterThan(0));
      // 登入頁的「登入已過期。」由 /login?expired=1 顯示（src/app/login，tests/e2e/login-page.spec.ts）
      expectExpiredLogin(visits, back);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await settle();
      expect(downloads).toEqual([]);
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(screen.queryByText(FAILURE)).toBeNull();
      expect(screen.queryByText(SUCCESS)).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    },
  );

  it('網址參數有中文時，登入後回去的網址參數不變', async () => {
    const visits = stubLocation(`/people?q=${encodeURIComponent('王')}`);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => unauthenticatedResponse()));
    await userEvent.click(renderButton());
    await waitFor(() => expect(visits.length).toBeGreaterThan(0));
    expectExpiredLogin(visits, { pathname: '/people', params: { q: '王' } });
  });
});
