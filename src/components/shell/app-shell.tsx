'use client';

// App Shell：桌面 Sidebar（展開 240 px／收合 48 px）、Header、手機 Mobile Header 與 Drawer（docs/spec/README.md 第 5 節）。
// 兩個 Header 右側都有介面配色鈕（COM-R17，theme-switch.tsx），在儲存狀態左邊；
// 只能檢視時儲存狀態的位置改為中性徽章「只能檢視」（COM-R20、D-021，save-status.tsx 的 HeaderStatus）。
// 設計系統：03-components.md「Sidebar」「Header / App Shell Block」、04-patterns-and-ux.md「App Shell」。
import { Menu, PanelLeft } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppProvider } from '@/client/app-provider';
import type { AppState, SessionUser } from '@/contracts/entities';
import { cn } from '@/components/ui/cn';
import { IconButton } from '@/components/ui/icon-button';
import { notify } from '@/components/ui/toaster';
import { HeaderStatus } from './save-status';
import { SidebarContent } from './sidebar-content';
import { ThemeSwitch } from './theme-switch';

const PREF_KEY = 'seat-arrangement:sidebar';
type SidebarState = 'expanded' | 'collapsed';

const readPref = (): SidebarState | null => {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === 'expanded' || v === 'collapsed' ? v : null;
  } catch {
    return null;
  }
};

/** 視窗低於 1024 px 時預設收合；使用者切換過就記住（docs/spec/README.md 第 5 節） */
function useNarrowDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(max-width: 1023px)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia('(max-width: 1023px)').matches,
    () => false,
  );
}

export interface AppShellProps {
  user: SessionUser;
  initialData: AppState;
  /** 目前登入者是否為編輯者；省略時是編輯者（只有測試會省略，(main)/layout.tsx 一律傳伺服器判斷的值） */
  isEditor?: boolean;
  /** 座位表是否已發布（發布對話框讀它，PRM-R17） */
  seatsPublished?: boolean;
  children: React.ReactNode;
}

export function AppShell({ user, initialData, isEditor, seatsPublished, children }: AppShellProps) {
  const narrow = useNarrowDesktop();
  const [pref, setPref] = useState<SidebarState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 偏好存在瀏覽器，只能在掛載後讀
  useEffect(() => setPref(readPref()), []);
  // 換頁時關閉 Drawer
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 跟著路由變化關閉浮層
  useEffect(() => setDrawerOpen(false), [pathname]);
  // 登出後按上一頁：瀏覽器從快取還原的頁面要重新載入，交給登入檢查（AUTH-R09）
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const state: SidebarState = pref ?? (narrow ? 'collapsed' : 'expanded');
  const collapsed = state === 'collapsed';
  const toggle = () => {
    const next = collapsed ? 'expanded' : 'collapsed';
    setPref(next);
    try {
      localStorage.setItem(PREF_KEY, next);
    } catch {
      /* 私密模式等情況：只在這次有效 */
    }
  };

  return (
    <AppProvider
      initialData={initialData}
      user={user}
      isEditor={isEditor}
      seatsPublished={seatsPublished}
      notify={(text) => notify(text)}
    >
      <div className="min-h-dvh bg-background" style={{ ['--sidebar-width' as string]: collapsed ? '48px' : '240px' }}>
        {/* 桌面 Sidebar：固定在視窗內距 24 px */}
        <aside
          data-sidebar-scope="desktop"
          data-state={state}
          className={cn(
            'fixed inset-y-6 left-6 z-20 hidden w-[var(--sidebar-width)] flex-col rounded-xl border border-sidebar-border bg-sidebar text-sidebar-foreground md:flex',
            collapsed ? 'items-center px-[7px] pt-3.5 pb-2' : 'px-4 pt-7 pb-4',
          )}
        >
          <SidebarContent user={user} mode={collapsed ? 'collapsed' : 'expanded'} />
        </aside>

        {/* 手機 Mobile Header */}
        <header className="fixed inset-x-0 top-0 z-20 flex h-12 items-center gap-2 border-b border-border bg-background px-2 md:hidden">
          <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DialogPrimitive.Trigger asChild>
              <IconButton label="開啟選單" size="md" className="size-11 [&_svg]:size-5">
                <Menu />
              </IconButton>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay md:hidden" />
              <DialogPrimitive.Content
                aria-describedby={undefined}
                className="fixed top-0 left-0 z-41 flex h-dvh w-[min(240px,100dvw)] flex-col rounded-r-xl border border-l-0 border-sidebar-border bg-sidebar px-4 pt-7 pb-4 text-sidebar-foreground outline-none md:hidden"
              >
                <DialogPrimitive.Title className="sr-only">主要導覽</DialogPrimitive.Title>
                <SidebarContent user={user} mode="drawer" onNavigate={() => setDrawerOpen(false)} />
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
          {/* 右側依序是介面配色鈕與儲存狀態（只能檢視時是「只能檢視」徽章）（第 5 節、COM-R17、COM-R20） */}
          <div className="ml-auto flex min-w-0 items-center gap-1">
            <ThemeSwitch />
            <HeaderStatus />
          </div>
        </header>

        <div className="min-w-0 pt-12 pb-8 md:pt-6 md:pr-6 md:pl-[calc(var(--sidebar-width)+48px)]">
          {/* 桌面 Header：跟著頁面捲動，沒有底色 */}
          <header className="hidden min-h-12 min-w-0 items-center gap-3 md:flex">
            <IconButton label="收合或展開側選單" variant="ghost" size="sm" onClick={toggle} className="[&_svg]:size-5">
              <PanelLeft />
            </IconButton>
            {/* 右側依序是介面配色鈕與儲存狀態（只能檢視時是「只能檢視」徽章）（第 5 節、COM-R17、COM-R20） */}
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <ThemeSwitch />
              <HeaderStatus />
            </div>
          </header>
          <main className="min-w-0 px-4 pt-4 md:px-0">{children}</main>
        </div>
      </div>
    </AppProvider>
  );
}
