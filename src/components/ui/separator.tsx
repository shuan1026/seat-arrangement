// Separator（03-components.md Separator）：1px、--border；水平寬度隨父層、垂直高度隨父層。
// 本身不帶間距與陰影，間距由外層排版決定。
import type { ComponentProps } from 'react';
import { cn } from './cn';

export interface SeparatorProps extends ComponentProps<'div'> {
  orientation?: 'horizontal' | 'vertical';
  /** 只是視覺分隔（預設），不讀給螢幕閱讀器；要表示內容分組時設 false */
  decorative?: boolean;
}

export function Separator({ orientation = 'horizontal', decorative = true, className, ...props }: SeparatorProps) {
  return (
    <div
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative || orientation === 'horizontal' ? undefined : 'vertical'}
      className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch', className)}
      {...props}
    />
  );
}
