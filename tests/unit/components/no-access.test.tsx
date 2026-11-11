// 「沒有權限」頁的元件：docs/spec/README.md 第 8.1 節（和登入頁相同：不套 App Shell、沒有介面配色鈕；卡片由上到下置中排列完整 Logo、
// 標題（H1）「你沒有檢視權限」、說明、目前登入的帳號；下面是「查看座位表」（Button primary，滿版）與「登出」（Button outline，滿版），上下排列）、
// AUTH-R16（按「查看座位表」前往 /seats；按「登出」依 AUTH-R09 登出，不需確認）、第 14 節共用文案「沒有權限頁」；AUTH-AC21、AUTH-AC23 的畫面部分；D-026。
// 真的伺服器、真的網址與版面（320 px、1280 px、深色、長 email）在 tests/e2e/no-access.spec.ts。
//
// 假設的介面（src/components/shell/no-access.tsx）：
//   export function NoAccess(props: { email: string }): JSX.Element
//   - 「查看座位表」是連到 /seats 的連結（role link，用 next/link 或 <a>），外觀是 Button primary；「登出」是 button。
//   - 登出用 next-auth/react 的 signOut，和使用者選單的「登出」相同（回到登入頁並顯示「已登出。」）。
//   - Logo 沿用 src/components/shell/logo.tsx（<img alt="Seat Arrangement">）。
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NoAccess } from '@/components/shell/no-access';

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('next-auth/react', () => ({ signOut, signIn: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
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

const TITLE = '你沒有檢視權限';
const DESCRIPTION = '需要查看排座資料的話，請聯絡承辦人把你的帳號加入權限頁。加入後重新整理這一頁就能看到。';
const EMAIL = 'bing@program.com.tw';

const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('NoAccess（第 8.1 節、第 14 節、AUTH-R16）', () => {
  it('標題「你沒有檢視權限」、說明、「目前登入：{email}」，文案逐字相同', () => {
    render(<NoAccess email={EMAIL} />);
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy();
    expect(screen.getByText(DESCRIPTION, { exact: true })).toBeTruthy();
    expect(screen.getByText(`目前登入：${EMAIL}`, { exact: true })).toBeTruthy();
  });

  it('「查看座位表」是連到 /seats 的連結；「登出」是按鈕；沒有其他連結與按鈕', () => {
    render(<NoAccess email={EMAIL} />);
    const seats = screen.getByRole('link', { name: '查看座位表' });
    expect(seats.getAttribute('href')).toBe('/seats');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '登出' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('由上到下：Logo、標題、說明、目前登入的帳號、「查看座位表」、「登出」', () => {
    render(<NoAccess email={EMAIL} />);
    const logo = screen.getAllByRole('img', { name: 'Seat Arrangement' })[0];
    if (!logo) throw new Error('沒有 Logo（<img alt="Seat Arrangement">）');
    const order = [
      logo,
      screen.getByRole('heading', { level: 1, name: TITLE }),
      screen.getByText(DESCRIPTION, { exact: true }),
      screen.getByText(`目前登入：${EMAIL}`, { exact: true }),
      screen.getByRole('link', { name: '查看座位表' }),
      screen.getByRole('button', { name: '登出' }),
    ];
    for (let i = 1; i < order.length; i++) expect(follows(order[i - 1]!, order[i]!), `第 ${i} 個在第 ${i + 1} 個前面`).toBe(true);
  });

  it('不套 App Shell：沒有導覽、Header、側選單、使用者選單與介面配色鈕（第 8.1 節）', () => {
    render(<NoAccess email={EMAIL} />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByRole('button', { name: '介面配色' })).toBeNull();
    expect(screen.queryByRole('button', { name: '開啟選單' })).toBeNull();
    for (const name of ['座位安排', '參與人員', '員工名單', '權限']) expect(screen.queryByRole('link', { name })).toBeNull();
    expect(screen.queryByText('只能檢視')).toBeNull();
  });

  it('長 email 完整顯示，不截斷（文字裡有完整的 email）', () => {
    const long = 'a-very-long-account-name-for-wrapping-0123456789abcdefghijklmnopqrstuvwxyz@program.com.tw';
    render(<NoAccess email={long} />);
    expect(screen.getByText(`目前登入：${long}`, { exact: true })).toBeTruthy();
  });

  it('按「登出」不需確認：直接呼叫 signOut 一次，登出後回到登入頁（AUTH-R09、AUTH-AC23）', async () => {
    signOut.mockReset();
    render(<NoAccess email={EMAIL} />);
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    const options = signOut.mock.calls[0]?.[0] as { callbackUrl?: string } | undefined;
    if (options?.callbackUrl) expect(new URL(options.callbackUrl, 'http://localhost').pathname).toBe('/login');
  });

  it('畫面上不含任何排座資料的區塊（沒有表格、座位圖、清單）', () => {
    render(<NoAccess email={EMAIL} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('region', { name: '座位圖' })).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(within(document.body).queryByText(/分機|素食|兒童椅/)).toBeNull();
  });
});
