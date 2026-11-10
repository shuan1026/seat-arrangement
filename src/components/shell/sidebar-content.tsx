'use client';

// Sidebar 的內容（Logo、導覽、使用者區塊），桌面 Sidebar 與手機 Drawer 共用。
// 規格：docs/spec/README.md 第 5 節；設計系統 03-components.md「Sidebar」（含 User Footer、User Footer Menu）。
import { ChevronsUpDown, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useIsEditor } from '@/client/app-provider';
import type { SessionUser } from '@/contracts/entities';
import { cn } from '@/components/ui/cn';
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger, UserMenuContent } from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { Logo } from './logo';
import { isCurrent, navItemsFor } from './nav';

type Mode = 'expanded' | 'collapsed' | 'drawer';

/** 展開與 Drawer 放完整 Logo，收合只放符號；深色主題時用白色版（第 5 節，logo.tsx） */
function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  return collapsed ? (
    <Logo variant="symbol" className="mb-3 size-6 shrink-0" />
  ) : (
    <Logo variant="full" className="mb-4 h-[72px] w-[208px] max-w-full shrink-0" />
  );
}

function NavItems({ mode, onNavigate }: { mode: Mode; onNavigate?: () => void }) {
  const pathname = usePathname();
  // 「權限」只有編輯者看得到（README 第 4 節）；權限在畫面開著時被移除，下一次操作後就拿掉（AUTH-R13）
  const isEditor = useIsEditor();
  const collapsed = mode === 'collapsed';
  return (
    <nav aria-label="主要導覽" className={cn('flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto', collapsed && 'items-center')}>
      {navItemsFor(isEditor).map(({ href, label, icon: Icon }) => {
        const current = isCurrent(pathname, href);
        const link = (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={current ? 'page' : undefined}
            aria-label={collapsed ? label : undefined}
            className={cn(
              'flex min-h-8 items-center gap-2 rounded-md text-sidebar-foreground no-underline hover:bg-[color-mix(in_srgb,var(--sidebar-foreground)_8%,transparent)]',
              collapsed ? 'w-8 justify-center py-2' : 'px-2 py-1.5 type-sm-regular',
              current && 'bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]',
              current && !collapsed && 'type-sm-medium',
            )}
          >
            <Icon aria-hidden className={cn('size-4 shrink-0', current ? 'text-primary' : 'text-muted-foreground')} />
            {collapsed ? null : <span>{label}</span>}
          </Link>
        );
        return collapsed ? (
          <Tooltip key={href} content={label} side="right">
            {link}
          </Tooltip>
        ) : (
          link
        );
      })}
    </nav>
  );
}

function UserFooter({ user, mode }: { user: SessionUser; mode: Mode }) {
  const collapsed = mode === 'collapsed';
  const avatar = (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--sidebar-avatar-bg)] type-sm-medium text-[var(--sidebar-avatar-fg)]"
    >
      {user.name.slice(0, 1)}
    </span>
  );
  const trigger = (
    <DropdownMenuTrigger
      aria-label={collapsed ? user.name : undefined}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-md text-left text-sidebar-foreground hover:bg-[color-mix(in_srgb,var(--sidebar-foreground)_8%,transparent)] data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground',
        collapsed ? 'size-8 justify-center p-0' : 'h-[52px] w-full p-2',
      )}
    >
      {avatar}
      {collapsed ? null : (
        <>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate type-sm-semi-bold">{user.name}</span>
            <span className="truncate type-xs-regular text-muted-foreground">{user.email}</span>
          </span>
          <ChevronsUpDown aria-hidden className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </>
      )}
    </DropdownMenuTrigger>
  );
  return (
    <div className={cn('mt-2 shrink-0', collapsed ? 'flex justify-center' : 'w-full')}>
      {/* 非 modal：選單開著時觸發區仍在無障礙樹上（不被 aria-hidden），點外面、Esc 照樣關閉 */}
      <DropdownMenu modal={false}>
        {collapsed ? (
          <Tooltip content={user.name} side="right">
            {trigger}
          </Tooltip>
        ) : (
          trigger
        )}
        <UserMenuContent
          name={user.name}
          meta={user.email}
          {...(mode === 'drawer'
            ? {
                side: 'top' as const,
                align: 'start' as const,
                // 手機：選單往上開、和觸發區同寬（docs/spec/README.md 第 5 節）
                style: { width: 'var(--radix-dropdown-menu-trigger-width)', maxWidth: 'none', minWidth: 0 },
              }
            : {})}
        >
          <DropdownMenuItem
            icon={<LogOut />}
            onSelect={() => void signOut({ callbackUrl: '/login?loggedOut=1' })}
          >
            登出
          </DropdownMenuItem>
        </UserMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function SidebarContent({ user, mode, onNavigate }: { user: SessionUser; mode: Mode; onNavigate?: () => void }) {
  return (
    <>
      <SidebarLogo collapsed={mode === 'collapsed'} />
      <NavItems mode={mode} onNavigate={onNavigate} />
      <UserFooter user={user} mode={mode} />
    </>
  );
}
