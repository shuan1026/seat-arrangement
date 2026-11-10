'use client';
// Dialog（03-components.md Dialog：Container、Content、Mobile；04-patterns-and-ux.md Dialog UX）。
// --card 面板、radius-xl、edge-highlight + shadow-lg、padding 24px、桌面寬 460px（wide 560px），
// 最寬 calc(100dvw - 32px)；標題 Text-lg/Semi Bold、說明 Text-sm/Regular 在標題下 12px；
// 右上 28px ghost 關閉鈕；內容超出視窗時只有內容區捲動，footer 一直看得到。
// footer 桌面靠右橫排、間距 12px；手機（< 768px）按鈕滿版堆疊，主要按鈕在上（DOM 順序為次要在前、主要在後）。
// Esc、關閉鈕、點遮罩都會關閉；不加頁面光暈。
import type { ComponentProps, ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from './cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** 遮罩：全螢幕、--background-color，置中並留 16px 邊距 */
export const overlayClasses = 'fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4';

/** 對話框面板 */
export const panelClasses =
  'relative flex max-h-[calc(100dvh-32px)] w-full min-w-0 flex-col rounded-xl border border-border bg-card text-card-foreground edge-popover outline-none';

export interface DialogContentProps extends Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** default 460px；wide 560px（內容較多的表單或清單） */
  size?: 'default' | 'wide';
  /** 關閉鈕的 aria-label，預設「關閉」 */
  closeLabel?: string;
  hideClose?: boolean;
}

/**
 * 對話框本體（含 portal、遮罩、標題、說明與關閉鈕）。內容用 DialogBody 與 DialogFooter 組合；
 * 表單可以用 <form className="contents"> 包住兩者，讓送出鈕放在 footer。
 */
export function DialogContent({
  title,
  description,
  size = 'default',
  closeLabel = '關閉',
  hideClose = false,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClasses}>
        <DialogPrimitive.Content
          // 沒有說明時明確設為 undefined，Radix 才不會指向不存在的說明
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(panelClasses, size === 'wide' ? 'max-w-[560px]' : 'max-w-[460px]', className)}
          {...props}
        >
          <div className={cn('shrink-0 px-6 pt-6', hideClose ? 'pr-6' : 'pr-12')}>
            <DialogPrimitive.Title className="type-lg-semi-bold text-foreground [overflow-wrap:anywhere]">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-3 type-sm-regular text-muted-foreground">{description}</DialogPrimitive.Description>
            ) : null}
          </div>
          {children}
          {/* 關閉鈕放在最後，開啟時焦點先落在第一個欄位 */}
          {hideClose ? null : (
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className="absolute top-3 right-3 inline-flex size-7 cursor-pointer items-center justify-center rounded-sm text-foreground outline-none transition-[background-color,box-shadow] duration-150 hover:bg-hover focus-visible:focus-ring [&_svg]:size-4"
            >
              <X aria-hidden />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  );
}

/** 對話框內容區：可垂直捲動，欄位間距 16px */
export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4 scrollbar-inset', className)}
      {...props}
    />
  );
}

/** 對話框按鈕列：次要按鈕在前、主要按鈕在後 */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap justify-end gap-3 px-6 pt-4 pb-6',
        'max-md:flex-col-reverse max-md:flex-nowrap max-md:*:w-full',
        className,
      )}
      {...props}
    />
  );
}
