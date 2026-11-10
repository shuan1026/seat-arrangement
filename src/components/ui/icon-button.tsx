// Icon Button（03-components.md Icon Button：Sizes、Variant Rules、Accessibility）。
// 寬高相同；一定要有 aria-label（label），Tooltip 只是補充。手機上點擊範圍至少 44px。
// 開啟中（aria-expanded，例如列操作選單的觸發鈕）用 --primary 底（Dropdown Menu Action Menu Trigger）。
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';
import { Tooltip } from './tooltip';

export type IconButtonVariant = 'ghost' | 'outline';
export type IconButtonSize = 'md' | 'sm' | 'xs' | '2xs';

// 視覺尺寸與手機的 44px 點擊範圍（::after 往外擴）
const SIZES: Record<IconButtonSize, string> = {
  md: 'size-9 rounded-md [&_svg]:size-4 max-md:after:-inset-1',
  sm: 'size-8 rounded-sm [&_svg]:size-4 max-md:after:-inset-1.5',
  xs: 'size-7 rounded-sm [&_svg]:size-4 max-md:after:-inset-2',
  '2xs': 'size-5 rounded-sm [&_svg]:size-3 max-md:after:-inset-3',
};

const VARIANTS: Record<IconButtonVariant, { base: string; hover: string; disabled: string }> = {
  ghost: {
    base: 'border-transparent bg-transparent text-foreground',
    hover: 'hover:bg-hover',
    disabled: 'border-transparent bg-transparent text-muted-foreground',
  },
  outline: {
    base: 'border-border bg-card text-foreground',
    hover: 'hover:border-border-strong hover:bg-hover',
    disabled: 'border-border bg-muted text-muted-foreground',
  },
};

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'aria-label'> {
  /** 無障礙名稱（aria-label），必填 */
  label: string;
  /** 16px 的 Lucide 圖示 */
  children: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** true 時用 label 當提示文字，也可以給不同的文字（例如停用原因） */
  tooltip?: boolean | ReactNode;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

export function IconButton({
  label,
  children,
  variant = 'ghost',
  size = 'md',
  tooltip,
  tooltipSide = 'top',
  disabled = false,
  className,
  type,
  ...props
}: IconButtonProps) {
  const v = VARIANTS[variant];
  const button = (
    <button
      type={type ?? 'button'}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center border outline-none after:absolute after:content-['']",
        'transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:focus-ring [&_svg]:shrink-0',
        SIZES[size],
        disabled
          ? [v.disabled, 'cursor-not-allowed']
          : [
              v.base,
              v.hover,
              'cursor-pointer aria-expanded:border-primary aria-expanded:bg-primary aria-expanded:text-primary-foreground',
            ],
        className,
      )}
      {...props}
    >
      <span aria-hidden className="inline-flex">
        {children}
      </span>
    </button>
  );
  if (!tooltip) return button;
  const content = tooltip === true ? label : tooltip;
  // 停用的按鈕收不到滑鼠事件，改由外層可聚焦的 span 觸發提示（原型 UI.iconBtn 的作法）
  return (
    <Tooltip content={content} side={tooltipSide}>
      {disabled ? (
        <span tabIndex={0} className="inline-flex rounded-md">
          {button}
        </span>
      ) : (
        button
      )}
    </Tooltip>
  );
}
