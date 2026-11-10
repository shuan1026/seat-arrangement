// 空狀態（docs/spec/README.md 第 9 節；04-patterns-and-ux.md Feedback States；原型 prototype.css 的 .empty）。
// 放在內容面板內：24px 圖示，圖示後方用 --glow-empty（只在圖示後方，不當文字底色）；
// 標題 Text-base/Medium、說明 --muted-foreground、下一步動作置中。不用對話框顯示一般的空狀態。
import type { ComponentProps, ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from './cn';

export interface EmptyStateProps extends Omit<ComponentProps<'div'>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** 24px 圖示，預設 inbox */
  icon?: ReactNode;
  /** 下一步：按鈕或連結（例如「新增人員」「清除篩選」） */
  action?: ReactNode;
  /**
   * panel：自帶卡片外框（取代整個表格或清單時用）；
   * plain：沒有外框，放進已有的面板或表格外框裡；
   * inline：沒有外框也沒有圖示，給對話框或窄面板裡的短提示
   */
  variant?: 'panel' | 'plain' | 'inline';
}

export function EmptyState({ title, description, icon, action, variant = 'panel', className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col items-center gap-2 text-center',
        variant === 'panel' && 'rounded-xl border border-border bg-card px-4 py-12 edge-top',
        variant === 'plain' && 'px-4 py-12',
        variant === 'inline' && 'px-2 py-6',
        className,
      )}
      {...props}
    >
      {variant === 'inline' ? null : (
        <span aria-hidden className="grid h-16 w-24 place-items-center overflow-clip text-muted-foreground glow-empty [&_svg]:size-6">
          {icon ?? <Inbox />}
        </span>
      )}
      <div className="type-base-medium text-foreground [overflow-wrap:anywhere]">{title}</div>
      {description ? <div className="max-w-[420px] type-sm-regular text-muted-foreground">{description}</div> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
