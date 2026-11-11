// @vitest-environment node
// 頁面的身分判斷（伺服器端元件）：docs/architecture.md 第 9.3 節「頁面」（(main)/layout.tsx 先讀 getRole：null 時不讀任何排座資料、不畫 App Shell，
// 在同一個網址畫「沒有權限」頁（components/shell/no-access.tsx），子頁面也不渲染；是編輯者或檢視者時讀全部資料，isEditor 交給 App Shell；
// /permissions 的伺服器端元件在檢視者時 redirect("/")）、第 10.2 節；docs/spec/README.md AUTH-R11、AUTH-R16（不載入任何排座資料）、
// docs/spec/permissions.md PRM-R06（檢視者開 /permissions 導向座位安排；沒有權限的人開 /permissions 看到「沒有權限」頁）；D-026。
// 真的伺服器與網址在 tests/e2e/no-access.spec.ts、tests/e2e/permissions-page.spec.ts。
//
// 假設（目前 src/app/(main)/layout.tsx 與 permissions/page.tsx 的做法）：
// - 登入者由 @/server/auth 的 currentUser() 取得；身分由 @/server/services/members 的 getRole(email) 判斷。
// - 排座資料由 @/server/services/state 的 loadState() 與 @/server/services/publish 的 getSeatsPublished() 讀取。
// - 權限頁的名單由 @/server/services/members 的 listMembers() 讀取；導向用 next/navigation 的 redirect（這裡換成會丟錯的假函式，同 Next.js）。
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  getRole: vi.fn(),
  listMembers: vi.fn(),
  loadState: vi.fn(),
  getSeatsPublished: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

vi.mock('@/server/auth', () => ({ currentUser: mocks.currentUser, allowedEmailDomain: () => 'program.com.tw' }));
vi.mock('@/server/services/members', () => ({ getRole: mocks.getRole, listMembers: mocks.listMembers }));
vi.mock('@/server/services/state', () => ({ loadState: mocks.loadState }));
vi.mock('@/server/services/publish', () => ({ getSeatsPublished: mocks.getSeatsPublished }));
vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
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

const USER = { id: 'google-sub-bing', name: '丙同仁', email: 'bing@program.com.tw' };
const STATE = { employees: [], participants: [], tables: [] };
const CHILD_TEXT = '子頁面的內容';

async function layout(): Promise<ReactElement<Record<string, unknown>>> {
  const { default: MainLayout } = await import('@/app/(main)/layout');
  return (await MainLayout({ children: <p>{CHILD_TEXT}</p> })) as ReactElement<Record<string, unknown>>;
}

async function permissionsPage(): Promise<unknown> {
  const { default: PermissionsPage } = await import('@/app/(main)/permissions/page');
  return PermissionsPage();
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockClear();
  mocks.currentUser.mockResolvedValue(USER);
  mocks.loadState.mockResolvedValue(STATE);
  mocks.getSeatsPublished.mockResolvedValue(false);
  mocks.listMembers.mockResolvedValue([{ id: 1, email: 'jia@program.com.tw', role: 'EDITOR' }]);
});

describe('(main)/layout.tsx：沒有權限（AUTH-R16）', () => {
  beforeEach(() => {
    mocks.getRole.mockResolvedValue(null);
  });

  it('依登入者的 email 判斷身分', async () => {
    await layout();
    expect(mocks.getRole).toHaveBeenCalledWith(USER.email);
  });

  it('不讀任何排座資料（loadState、getSeatsPublished 都沒有呼叫），也不導向其他網址', async () => {
    await layout();
    expect(mocks.loadState).not.toHaveBeenCalled();
    expect(mocks.getSeatsPublished).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('畫「沒有權限」頁：標題「你沒有檢視權限」、目前登入的 email；子頁面不渲染', async () => {
    const html = renderToStaticMarkup(await layout());
    expect(html).toContain('你沒有檢視權限');
    expect(html).toContain(`目前登入：${USER.email}`);
    expect(html).toContain('查看座位表');
    expect(html).not.toContain(CHILD_TEXT);
  });
});

describe('(main)/layout.tsx：編輯者與檢視者（AUTH-R11）', () => {
  it.each([
    ['EDITOR', true],
    ['VIEWER', false],
  ] as const)('%s：讀全部資料，交給 App Shell 的 isEditor 是 %s；子頁面照常渲染', async (role, isEditor) => {
    mocks.getRole.mockResolvedValue(role);
    const element = await layout();
    expect(mocks.loadState).toHaveBeenCalledTimes(1);
    expect(element.props.isEditor).toBe(isEditor);
    expect(element.props.initialData).toEqual(STATE);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe('(main)/permissions/page.tsx（PRM-R06）', () => {
  it('檢視者：redirect("/")，不讀名單', async () => {
    mocks.getRole.mockResolvedValue('VIEWER');
    await expect(permissionsPage()).rejects.toThrow('NEXT_REDIRECT:/');
    expect(mocks.redirect).toHaveBeenCalledWith('/');
    expect(mocks.listMembers).not.toHaveBeenCalled();
  });

  it('沒有權限：不導向（由 layout 在同一個網址畫「沒有權限」頁），也不讀名單', async () => {
    mocks.getRole.mockResolvedValue(null);
    await permissionsPage();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.listMembers).not.toHaveBeenCalled();
  });

  it('編輯者：讀名單交給權限頁，不導向', async () => {
    mocks.getRole.mockResolvedValue('EDITOR');
    const members = [{ id: 1, email: 'jia@program.com.tw', role: 'EDITOR' }];
    mocks.listMembers.mockResolvedValue(members);
    const element = (await permissionsPage()) as ReactElement<Record<string, unknown>>;
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.listMembers).toHaveBeenCalledTimes(1);
    expect(Object.values(element.props)).toContain(members);
  });
});
