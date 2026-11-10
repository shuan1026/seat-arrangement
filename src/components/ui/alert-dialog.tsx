'use client';
// Alert Dialog（03-components.md Alert Dialog：Desktop Layout、Mobile Layout；04-patterns-and-ux.md Alert Dialog UX；
// docs/spec/README.md 第 9 節）。確認危險或不可復原的操作，標題與內文寫明後果，不寫「確定嗎」。
// 桌面寬約 512px、標題與內文靠左、按鈕靠右：取消（outline）在左、確認在右；
// 手機（< 768px）標題與內文置中、按鈕滿版堆疊、確認在上。確認鈕可用 destructive-primary。
// 點遮罩不會關閉；Esc 等同取消。開啟時焦點落在取消鈕。
import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { cn } from './cn';
import { Button } from './button';
import { overlayClasses, panelClasses } from './dialog';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export interface AlertDialogContentProps extends Omit<ComponentProps<typeof AlertDialogPrimitive.Content>, 'title' | 'children'> {
  /** 寫明後果的標題，例如「要刪除 王小明 嗎？」 */
  title: ReactNode;
  /** 內文：說明會發生什麼 */
  description?: ReactNode;
  /** 內文下方的補充內容（清單、Alert） */
  children?: ReactNode;
  /** 確認鈕文字，動詞開頭，例如「刪除人員」 */
  confirmLabel: string;
  /** 取消鈕文字，預設「取消」 */
  cancelLabel?: string;
  /** 確認鈕用 destructive-primary */
  destructive?: boolean;
  /** 按下確認；要等非同步完成再關閉時呼叫 event.preventDefault()，並用 confirmLoading 顯示載入中 */
  onConfirm?: (event: MouseEvent<HTMLButtonElement>) => void;
  onCancel?: () => void;
  confirmLoading?: boolean;
  confirmDisabled?: boolean;
}

export function AlertDialogContent({
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = '取消',
  destructive = false,
  onConfirm,
  onCancel,
  confirmLoading = false,
  confirmDisabled = false,
  className,
  ...props
}: AlertDialogContentProps) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className={overlayClasses}>
        <AlertDialogPrimitive.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(panelClasses, 'max-w-[512px]', className)}
          {...props}
        >
          <div className="shrink-0 px-6 pt-6 max-md:text-center">
            <AlertDialogPrimitive.Title className="type-lg-semi-bold text-foreground [overflow-wrap:anywhere]">
              {title}
            </AlertDialogPrimitive.Title>
            {description ? (
              <AlertDialogPrimitive.Description className="mt-3 type-sm-regular text-muted-foreground">
                {description}
              </AlertDialogPrimitive.Description>
            ) : null}
          </div>
          {children ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pt-4 type-sm-regular text-muted-foreground scrollbar-inset max-md:text-center">
              {children}
            </div>
          ) : null}
          <div className="flex shrink-0 flex-wrap justify-end gap-3 px-6 pt-6 pb-6 max-md:flex-col-reverse max-md:flex-nowrap max-md:*:w-full">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="outline" onClick={onCancel} disabled={confirmLoading}>
                {cancelLabel}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                variant={destructive ? 'destructive-primary' : 'primary'}
                loading={confirmLoading}
                disabled={confirmDisabled}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Overlay>
    </AlertDialogPrimitive.Portal>
  );
}
