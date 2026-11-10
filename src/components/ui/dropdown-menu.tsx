'use client';
// Dropdown Menu（03-components.md Dropdown Menu：Shared Overlay Surface、Action Menu、User Menu、Accessibility；
// Sidebar User Footer Menu 的列高與定位；04-patterns-and-ux.md Dropdown Menu / Picker）。
// 一律透過 portal 畫在 body 底下，貼著觸發元件並在碰到視窗邊緣時翻面或位移；捲動與縮放時 Radix 會重新定位。
// action-menu 是指令清單：沒有勾選、沒有選取狀態，執行後關閉。危險項目用 --destructive-text。
import type { ComponentProps, ReactNode } from 'react';
import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import { Ellipsis } from 'lucide-react';
import { cn } from './cn';
import { IconButton, type IconButtonSize, type IconButtonVariant } from './icon-button';

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;

/** 浮層表面：--popover、--border、radius-lg、edge-highlight + shadow-lg、8px padding */
export const overlaySurface =
  'rounded-lg border border-border bg-popover text-popover-foreground edge-popover outline-none';

export interface DropdownMenuContentProps extends ComponentProps<typeof MenuPrimitive.Content> {
  /** action：列操作（列高 32px，最小寬約 150px）；user：Sidebar 使用者選單（列高約 36px，寬約 180-220px） */
  variant?: 'action' | 'user';
}

export function DropdownMenuContent({
  variant = 'action',
  className,
  sideOffset = 4,
  collisionPadding = 16,
  align = 'end',
  children,
  ...props
}: DropdownMenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-variant={variant}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        align={align}
        className={cn(
          // z-60：浮層的層級順序（在卡片與表格之上、Dialog 之內也看得到），裁切靠 portal 解決
          'group/menu z-60 flex max-h-[min(320px,var(--radix-dropdown-menu-content-available-height))] flex-col overflow-y-auto p-2 scrollbar-inset',
          variant === 'user'
            ? 'w-max min-w-[min(180px,calc(100dvw-32px))] max-w-[min(220px,calc(100dvw-32px))]'
            : 'min-w-[min(150px,calc(100dvw-32px))] max-w-[min(360px,calc(100dvw-32px))]',
          overlaySurface,
          className,
        )}
        {...props}
      >
        {children}
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}

export interface DropdownMenuItemProps extends ComponentProps<typeof MenuPrimitive.Item> {
  /** 16px 的前置圖示，固定佔 16px 寬 */
  icon?: ReactNode;
  /** 危險樣式（刪除、取消報名、清空桌次） */
  destructive?: boolean;
}

export function DropdownMenuItem({ icon, destructive = false, className, children, ...props }: DropdownMenuItemProps) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left type-sm-regular no-underline outline-none select-none',
        'group-data-[variant=user]/menu:min-h-9 focus-visible:shadow-none',
        destructive
          ? 'text-destructive-text data-highlighted:bg-hover-destructive'
          : 'text-popover-foreground data-highlighted:bg-hover',
        'data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:text-muted-foreground',
        className,
      )}
      {...props}
    >
      {icon ? (
        <span aria-hidden className="inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</span>
    </MenuPrimitive.Item>
  );
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn('-mx-2 my-1 h-px shrink-0 bg-border', className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn('px-2 py-1.5 type-xs-regular text-muted-foreground', className)} {...props} />;
}

export interface ActionMenuProps {
  /** 觸發鈕的 aria-label，預設「更多操作」（docs/spec/README.md 第 14 節） */
  label?: string;
  /** DropdownMenuItem／DropdownMenuSeparator */
  children: ReactNode;
  triggerSize?: IconButtonSize;
  triggerVariant?: IconButtonVariant;
  /** 觸發圖示，預設三點 */
  triggerIcon?: ReactNode;
  disabled?: boolean;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 套在選單內容上 */
  contentClassName?: string;
}

/** 列操作選單：Icon Button 三點觸發 + action-menu（04-patterns-and-ux.md Data Management Table Rules） */
export function ActionMenu({
  label = '更多操作',
  children,
  triggerSize = 'sm',
  triggerVariant = 'ghost',
  triggerIcon = <Ellipsis />,
  disabled,
  align = 'end',
  side = 'bottom',
  open,
  onOpenChange,
  contentClassName,
}: ActionMenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <IconButton label={label} size={triggerSize} variant={triggerVariant} disabled={disabled}>
          {triggerIcon}
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent variant="action" align={align} side={side} className={contentClassName}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface UserMenuContentProps extends Omit<DropdownMenuContentProps, 'variant'> {
  /** 第一列：姓名 */
  name: ReactNode;
  /** 第一列第二行：email */
  meta?: ReactNode;
}

/**
 * Sidebar 使用者選單的內容：profile 列 + 項目（列高約 36px）。
 * 桌面預設開在觸發元件右側、底邊對齊；手機 Drawer 請傳 side="top" align="start"。
 */
export function UserMenuContent({ name, meta, side = 'right', align = 'end', children, ...props }: UserMenuContentProps) {
  return (
    <DropdownMenuContent variant="user" side={side} align={align} {...props}>
      <div className="flex min-w-0 flex-col px-2 py-1.5">
        <span className="type-sm-medium text-popover-foreground [overflow-wrap:anywhere]">{name}</span>
        {meta ? <span className="type-xs-regular text-muted-foreground [overflow-wrap:anywhere]">{meta}</span> : null}
      </div>
      <DropdownMenuSeparator />
      {children}
    </DropdownMenuContent>
  );
}
