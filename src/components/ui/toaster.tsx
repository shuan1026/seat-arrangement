'use client';
// Sonner / Toast（03-components.md Sonner / Toast：Container、Variants、Action；docs/spec/README.md 第 9 節）。
// --card 卡片、--border、radius-lg、edge-highlight + shadow-md、padding 16px、最小高 52px；桌面寬 360px、右下角，
// 手機兩側各留 16px。success 圖示 --color-green、warning --color-amber、destructive --color-red 且文字 --destructive-text、
// info 跟文字同色。最多一個動作按鈕（primary、約 32px 高），例如「復原」。不要用來顯示欄位錯誤。
import type { CSSProperties, ReactNode } from 'react';
import { Toaster as Sonner, toast } from 'sonner';
import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { buttonVariants } from './button';
import { Spinner } from './spinner';

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      offset={16}
      mobileOffset={16}
      gap={8}
      visibleToasts={3}
      containerAriaLabel="通知"
      style={{ '--width': '360px' } as CSSProperties}
      icons={{
        success: <CircleCheck aria-hidden />,
        warning: <TriangleAlert aria-hidden />,
        error: <TriangleAlert aria-hidden />,
        info: <Info aria-hidden />,
        loading: <Spinner />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-(--width) min-h-[52px] items-center gap-3 rounded-lg border border-border bg-card p-4 text-foreground edge-toast type-sm-medium',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5',
          title: 'type-sm-medium text-foreground [overflow-wrap:anywhere]',
          description: 'type-xs-regular text-muted-foreground',
          icon: 'inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-4',
          actionButton: buttonVariants({ variant: 'primary', size: 'sm' }),
          success: '[&_[data-icon]]:text-icon-success',
          warning: '[&_[data-icon]]:text-icon-warning',
          error: '[&_[data-icon]]:text-icon-danger [&_[data-title]]:text-destructive-text',
          info: '[&_[data-icon]]:text-foreground',
        },
      }}
    />
  );
}

export type NotifyType = 'success' | 'warning' | 'destructive' | 'info';

export interface NotifyOptions {
  /** 預設 success */
  type?: NotifyType;
  /** 最多一個動作，例如 { label: '復原', onClick: undo } */
  action?: { label: string; onClick: () => void };
  /** 第二行補充說明（Text-xs/Regular、--muted-foreground） */
  description?: ReactNode;
  /** 顯示多久（ms），預設 4 秒、有動作時 6 秒 */
  duration?: number;
  /** 指定 id 可更新或取代同一則通知 */
  id?: string | number;
}

/** 顯示一則 Sonner 通知，回傳通知 id（可用 dismissNotify 關閉） */
export function notify(text: ReactNode, { type = 'success', action, description, duration, id }: NotifyOptions = {}) {
  const data = {
    id,
    description,
    duration: duration ?? (action ? 6000 : 4000),
    action: action ? { label: action.label, onClick: () => action.onClick() } : undefined,
  };
  switch (type) {
    case 'warning':
      return toast.warning(text, data);
    case 'destructive':
      return toast.error(text, data);
    case 'info':
      return toast.info(text, data);
    default:
      return toast.success(text, data);
  }
}

/** 關閉通知；不給 id 時關閉全部 */
export function dismissNotify(id?: string | number) {
  toast.dismiss(id);
}
