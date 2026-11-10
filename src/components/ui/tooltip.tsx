'use client';
// Tooltip（03-components.md Tooltip）：--popover-foreground 底、--popover 字、Text-xs/Regular、Y 6px X 8px、
// radius-md、約 5px 箭頭、最寬 240px、離觸發元件 4px；碰到視窗邊緣自動翻面或位移。只放短標籤，不放可互動內容。
import { createContext, useContext, type ReactNode } from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from './cn';

const HasProvider = createContext(false);

export interface TooltipProviderProps {
  children: ReactNode;
  /** 滑過多久後顯示（ms），預設 300 */
  delayDuration?: number;
}

/** 放在版面最外層，讓相鄰的 Tooltip 共用延遲；沒放時每個 Tooltip 會自己建立一個 */
export function TooltipProvider({ children, delayDuration = 300 }: TooltipProviderProps) {
  // disableHoverableContent：Tooltip 只放文字，不需要讓指標移進去；
  // 離開觸發區就關閉，移到下一個觸發區就開，不會被前一個 Tooltip 的緩衝區擋住
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} disableHoverableContent>
      <HasProvider.Provider value>{children}</HasProvider.Provider>
    </TooltipPrimitive.Provider>
  );
}

export interface TooltipProps {
  /** 提示文字。圖示按鈕的名稱仍要用 aria-label，Tooltip 只是補充 */
  content: ReactNode;
  /** 唯一的子元素，必須能接收 ref 與事件（button、a、有 tabIndex 的 span） */
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function Tooltip({ content, children, side = 'top', align = 'center', open, defaultOpen, onOpenChange, className }: TooltipProps) {
  const hasProvider = useContext(HasProvider);
  const tooltip = (
    <TooltipPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={16}
          className={cn(
            // z-80：浮層的層級順序（Dialog 50、選單 60、Sonner 70、Tooltip 80），不是用來解決裁切
            'z-80 max-w-[min(240px,calc(100dvw-32px))] rounded-md bg-popover-foreground px-2 py-1.5',
            'type-xs-regular text-popover [overflow-wrap:anywhere] select-none',
            className,
          )}
        >
          {content}
          <TooltipPrimitive.Arrow width={10} height={5} className="fill-popover-foreground" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
  return hasProvider ? (
    tooltip
  ) : (
    <TooltipPrimitive.Provider delayDuration={300} disableHoverableContent>
      {tooltip}
    </TooltipPrimitive.Provider>
  );
}
