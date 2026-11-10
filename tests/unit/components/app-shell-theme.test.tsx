// App Shell 裡的介面配色：docs/spec/README.md 第 5 節（Header 右側依序是介面配色鈕與儲存狀態；Mobile Header 右側同；
// 深色主題時 Sidebar 與 Drawer 的 Logo 用白色版，dark／light 指 Logo 本身的顏色）、COM-R17、COM-AC16、COM-AC19（Mobile Header 也有介面配色鈕）；
// 決策 D-020。
// jsdom 沒有 CSS：若實作用兩張圖、以 CSS 依 data-theme 隱藏其中一張，兩張都會在 DOM 裡。所以這裡只確認「這個配色該用的那一版有放在
// Sidebar／Drawer 裡」，畫面上實際看得到哪一張由 tests/e2e/theme-switch.spec.ts 檢查。
//
// 假設：
// - src/components/shell/app-shell.tsx 的桌面 Header 與 Mobile Header 各放一個 ThemeSwitch（src/components/shell/theme-switch.tsx），
//   在 SaveStatus 前面；兩個按鈕的無障礙名稱都是「介面配色」，選單反映同一個目前配色。
// - Logo 仍是 <img>（同目前的 sidebar-content.tsx）：淺色用 /logo-dark.svg、/symbol-dark.svg，深色用 /logo-light.svg、/symbol-light.svg。
// - 先前選過的配色由根版面的 inline script 套用（tests/unit/client/theme.test.ts）；這裡用 localStorage 加 <html data-theme> 模擬。
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '@/client/theme';
import { AppShell } from '@/components/shell/app-shell';
import type { AppState } from '@/contracts/entities';

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
// 使用者選單的「登出」用到；這裡不測登出
vi.mock('next-auth/react', () => ({ signOut: vi.fn(), signIn: vi.fn() }));
// 導覽連結：換成一般的 <a>，不需要 Next.js 的路由
vi.mock('next/link', async () => {
  const { createElement } = await vi.importActual<typeof import('react')>('react');
  return {
    default: (props: { href: unknown; children?: ReactNode } & Record<string, unknown>) => {
      const { href, children, ...rest } = props;
      delete rest.prefetch;
      delete rest.replace;
      delete rest.scroll;
      return createElement('a', { ...rest, href: String(href) }, children);
    },
  };
});

const USER = { name: '測試承辦人', email: 'tester@program.com.tw' };
const EMPTY: AppState = { employees: [], participants: [], tables: [] };

// jsdom 沒有的瀏覽器 API（Radix 的 Popper、Dialog 與 Sonner 會用到）
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

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  toast.dismiss();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

function renderShell() {
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  render(
    <AppShell user={USER} initialData={EMPTY}>
      <p>頁面內容</p>
    </AppShell>,
  );
  return { user };
}

type User = ReturnType<typeof userEvent.setup>;

function headerWith(buttonName: string): HTMLElement {
  const header = screen.getByRole('button', { name: buttonName }).closest('header');
  if (!header) throw new Error(`「${buttonName}」不在 <header> 裡`);
  return header;
}
/** 桌面 Header：左側是 Sidebar 切換鈕 */
const desktopHeader = () => headerWith('收合或展開側選單');
/** Mobile Header：左側是選單鈕 */
const mobileHeader = () => headerWith('開啟選單');
/** 桌面 Sidebar（<aside>） */
const sidebar = () => screen.getByRole('complementary');

const imageSources = (scope: HTMLElement) => Array.from(scope.querySelectorAll('img')).map((img) => img.getAttribute('src') ?? '');
const hasImage = (scope: HTMLElement, file: string) => imageSources(scope).some((src) => src.includes(file));

async function chooseTheme(user: User, header: HTMLElement, name: '淺色' | '深色') {
  const trigger = within(header).getByRole('button', { name: '介面配色' });
  trigger.focus();
  await user.keyboard('{Enter}');
  const menu = await screen.findByRole('menu');
  await user.click(within(menu).getByRole('menuitemradio', { name }));
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

describe('Header 的位置（第 5 節）', () => {
  it.each([
    ['桌面 Header', '收合或展開側選單', desktopHeader],
    ['Mobile Header', '開啟選單', mobileHeader],
  ] as const)('%s：左側是「%s」，右側依序是「介面配色」與儲存狀態', (_name, left, headerOf) => {
    renderShell();
    const header = headerOf();
    const leftButton = within(header).getByRole('button', { name: left });
    const palettes = within(header).getAllByRole('button', { name: '介面配色' });
    expect(palettes).toHaveLength(1);
    const palette = palettes[0] as HTMLElement;
    const saveStatus = within(header).getByText(/^已儲存/);

    expect(leftButton.compareDocumentPosition(palette) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(palette.compareDocumentPosition(saveStatus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('桌面 Header 與 Mobile Header 的選單反映同一個配色：在桌面 Header 選「深色」→ Mobile Header 的選單也是「深色」打勾', async () => {
    const { user } = renderShell();
    await chooseTheme(user, desktopHeader(), '深色');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    const trigger = within(mobileHeader()).getByRole('button', { name: '介面配色' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitemradio', { name: '深色' }).getAttribute('aria-checked')).toBe('true');
    expect(within(menu).getByRole('menuitemradio', { name: '淺色' }).getAttribute('aria-checked')).toBe('false');
  });
});

describe('Logo 依配色換版本（第 5 節、COM-AC16）', () => {
  it('淺色：Sidebar 用深色字的 Logo（logo-dark.svg）', () => {
    renderShell();
    expect(hasImage(sidebar(), 'logo-dark.svg')).toBe(true);
  });

  it('在 Header 選「深色」→ Sidebar 換成白色版 Logo（logo-light.svg）；選回「淺色」→ 回到 logo-dark.svg', async () => {
    const { user } = renderShell();
    await chooseTheme(user, desktopHeader(), '深色');
    await waitFor(() => expect(hasImage(sidebar(), 'logo-light.svg')).toBe(true));

    await chooseTheme(user, desktopHeader(), '淺色');
    await waitFor(() => expect(hasImage(sidebar(), 'logo-dark.svg')).toBe(true));
  });

  it('深色時把 Sidebar 收合 → 只剩符號，用白色版（symbol-light.svg）', async () => {
    const { user } = renderShell();
    await chooseTheme(user, desktopHeader(), '深色');
    await user.click(screen.getByRole('button', { name: '收合或展開側選單' }));
    await waitFor(() => expect(sidebar().getAttribute('data-state')).toBe('collapsed'));
    await waitFor(() => expect(hasImage(sidebar(), 'symbol-light.svg')).toBe(true));
  });

  it('深色時開啟手機的 Drawer → Drawer 的 Logo 是白色版（logo-light.svg）', async () => {
    const { user } = renderShell();
    await chooseTheme(user, mobileHeader(), '深色');
    await user.click(screen.getByRole('button', { name: '開啟選單' }));
    const drawer = await screen.findByRole('dialog', { name: '主要導覽' });
    await waitFor(() => expect(hasImage(drawer, 'logo-light.svg')).toBe(true));
  });

  it('這個瀏覽器先前選過深色 → 一開啟 Sidebar 就用白色版 Logo，不必再選', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    renderShell();
    await waitFor(() => expect(hasImage(sidebar(), 'logo-light.svg')).toBe(true));
  });
});
