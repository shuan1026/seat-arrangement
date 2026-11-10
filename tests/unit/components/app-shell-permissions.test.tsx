// App Shell 依權限顯示：docs/spec/README.md 第 4 節（編輯者四項導覽，第 4 項「權限」只有編輯者看得到）、第 5 節（導覽項目的圖示、
// Header 右側依序是介面配色鈕與儲存狀態；只能檢視時儲存狀態的位置改為中性徽章「只能檢視」，桌面與 Mobile Header 都有）、
// COM-R20、第 14 節共用文案；COM-AC21、COM-AC22；D-021。畫面上實際看得到哪一個 Header 由 E2E（tests/e2e/viewer-shell.spec.ts）檢查。
//
// 假設的介面：AppShell 多可省略的 isEditor?: boolean（傳給 AppProvider；省略時是編輯者，只有測試會省略）。
// 導覽項目沿用 src/components/shell/nav.ts 的連結；「權限」連到 /permissions。
import { render, screen, within } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/shell/app-shell';
import type { AppState } from '@/contracts/entities';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock('next-auth/react', () => ({ signOut: vi.fn(), signIn: vi.fn() }));
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
const VIEW_ONLY = '只能檢視';
/** lucide key-round 圖示的 path（第 5 節：「權限」用 key-round） */
const KEY_ROUND_PATH = 'M2.586 17.414';

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
  localStorage.clear();
});

function renderShell(isEditor: boolean) {
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  render(
    <AppShell user={USER} initialData={EMPTY} isEditor={isEditor}>
      <p>頁面內容</p>
    </AppShell>,
  );
  return { user };
}

function headerWith(buttonName: string): HTMLElement {
  const header = screen.getByRole('button', { name: buttonName }).closest('header');
  if (!header) throw new Error(`「${buttonName}」不在 <header> 裡`);
  return header;
}
const desktopHeader = () => headerWith('收合或展開側選單');
const mobileHeader = () => headerWith('開啟選單');
/** 桌面 Sidebar 裡的主要導覽 */
const sidebarNav = () => within(screen.getByRole('complementary')).getByRole('navigation', { name: '主要導覽' });
const linkNames = (nav: HTMLElement) => within(nav).getAllByRole('link').map((a) => a.textContent?.trim() ?? a.getAttribute('aria-label'));

describe('導覽（第 4、5 節、COM-AC21）', () => {
  it('編輯者：四項，依序是座位安排、參與人員、員工名單、權限；「權限」連到 /permissions、用 key-round 圖示', () => {
    renderShell(true);
    const nav = sidebarNav();
    expect(linkNames(nav)).toEqual(['座位安排', '參與人員', '員工名單', '權限']);
    const permissions = within(nav).getByRole('link', { name: '權限' });
    expect(permissions.getAttribute('href')).toBe('/permissions');
    const paths = Array.from(permissions.querySelectorAll('svg path')).map((p) => p.getAttribute('d') ?? '');
    expect(paths.some((d) => d.startsWith(KEY_ROUND_PATH))).toBe(true);
  });

  it('只能檢視：只有座位安排、參與人員、員工名單三項，沒有「權限」', () => {
    renderShell(false);
    expect(linkNames(sidebarNav())).toEqual(['座位安排', '參與人員', '員工名單']);
    expect(screen.queryByRole('link', { name: '權限' })).toBeNull();
  });

  it('只能檢視：手機 Drawer 的導覽也只有三項（COM-AC10）', async () => {
    const { user } = renderShell(false);
    await user.click(screen.getByRole('button', { name: '開啟選單' }));
    const drawer = await screen.findByRole('dialog', { name: '主要導覽' });
    const nav = within(drawer).getByRole('navigation', { name: '主要導覽' });
    expect(linkNames(nav)).toEqual(['座位安排', '參與人員', '員工名單']);
  });

  it('編輯者：手機 Drawer 的導覽有四項', async () => {
    const { user } = renderShell(true);
    await user.click(screen.getByRole('button', { name: '開啟選單' }));
    const drawer = await screen.findByRole('dialog', { name: '主要導覽' });
    expect(linkNames(within(drawer).getByRole('navigation', { name: '主要導覽' }))).toEqual(['座位安排', '參與人員', '員工名單', '權限']);
  });
});

describe('Header 右側（第 5 節、COM-R20、COM-AC22）', () => {
  it.each([
    ['桌面 Header', desktopHeader],
    ['Mobile Header', mobileHeader],
  ] as const)('只能檢視，%s：依序是「介面配色」與中性徽章「只能檢視」，沒有儲存狀態', (_name, headerOf) => {
    renderShell(false);
    const header = headerOf();
    const palette = within(header).getByRole('button', { name: '介面配色' });
    const badge = within(header).getByText(VIEW_ONLY, { exact: true });
    expect(palette.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(header).queryByText(/^已儲存/)).toBeNull();
    expect(within(header).queryByText('儲存中…')).toBeNull();
    expect(within(header).queryByRole('button', { name: '重試' })).toBeNull();
  });

  it.each([
    ['桌面 Header', desktopHeader],
    ['Mobile Header', mobileHeader],
  ] as const)('編輯者，%s：仍是儲存狀態，沒有「只能檢視」', (_name, headerOf) => {
    renderShell(true);
    const header = headerOf();
    expect(within(header).getByText(/^已儲存/)).toBeTruthy();
    expect(within(header).queryByText(VIEW_ONLY, { exact: true })).toBeNull();
  });
});
