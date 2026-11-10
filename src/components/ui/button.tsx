// Button（03-components.md Button：Variants、Sizes、Structure、States、Hover Rules）。
// 載入中：spinner 取代前置圖示（沒有前置圖示時取代後置圖示，兩個都沒有才加在文字前），文字保留、aria-busy、不能點。
import type { ComponentProps, ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { cn } from './cn';
import { Spinner } from './spinner';

export type ButtonVariant =
  | 'primary'
  | 'outline'
  | 'ghost'
  | 'link'
  | 'destructive-primary'
  | 'destructive-outline'
  | 'destructive-ghost';
export type ButtonSize = 'md' | 'sm';

interface VariantStyle {
  base: string;
  hover: string;
  focus: string;
  disabled: string;
}

// hover 只在可用時加上（Shared State Semantics：disabled／loading 不顯示 hover）
const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: {
    base: 'border-transparent bg-primary text-primary-foreground glow-button',
    hover: 'hover:bg-primary-hover',
    focus: 'focus-visible:focus-ring-glow',
    disabled: 'border-border bg-muted text-muted-foreground',
  },
  outline: {
    base: 'border-border bg-transparent text-foreground',
    hover: 'hover:border-border-strong hover:bg-hover',
    focus: 'focus-visible:focus-ring',
    disabled: 'border-border bg-muted text-muted-foreground',
  },
  ghost: {
    base: 'border-transparent bg-transparent text-foreground',
    hover: 'hover:bg-hover',
    focus: 'focus-visible:focus-ring',
    disabled: 'border-transparent bg-transparent text-muted-foreground',
  },
  link: {
    base: 'border-transparent bg-transparent text-foreground underline-offset-4',
    hover: 'hover:underline',
    focus: 'focus-visible:focus-ring',
    disabled: 'border-transparent bg-transparent text-muted-foreground',
  },
  // 危險按鈕停用時仍看得出是危險操作，只降低強度（States `disabled`）
  'destructive-primary': {
    base: 'border-transparent bg-destructive text-primary-foreground',
    hover: 'hover:bg-destructive-hover',
    focus: 'focus-visible:focus-ring',
    disabled: 'border-transparent bg-destructive text-primary-foreground opacity-50',
  },
  'destructive-outline': {
    base: 'border-border bg-transparent text-destructive-text',
    hover: 'hover:border-border-destructive hover:bg-hover-destructive',
    focus: 'focus-visible:focus-ring',
    disabled: 'border-border bg-transparent text-destructive-text opacity-50',
  },
  'destructive-ghost': {
    base: 'border-transparent bg-transparent text-destructive-text',
    hover: 'hover:bg-hover-destructive',
    focus: 'focus-visible:focus-ring',
    disabled: 'border-transparent bg-transparent text-destructive-text opacity-50',
  },
};

const SIZES: Record<ButtonSize, string> = {
  md: 'h-9 px-3',
  sm: 'h-8 px-2',
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
}

/** 按鈕外觀的 className，給無法用 <Button> 的地方（例如 Sonner 的動作按鈕） */
export function buttonVariants({ variant = 'outline', size = 'md', disabled, loading }: ButtonStyleOptions = {}) {
  const v = VARIANTS[variant];
  return cn(
    'relative inline-flex max-w-full shrink-0 items-center justify-center gap-2 rounded-md border',
    'type-sm-medium whitespace-nowrap no-underline select-none outline-none',
    'transition-[background-color,border-color,color,box-shadow,opacity] duration-150',
    '[&_svg]:size-4 [&_svg]:shrink-0',
    variant === 'link' ? 'h-auto rounded-sm p-0' : SIZES[size],
    disabled ? [v.disabled, 'cursor-not-allowed'] : [v.base, v.focus, loading ? 'cursor-progress' : [v.hover, 'cursor-pointer']],
  );
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 載入中：顯示 spinner、aria-busy、不能點，保留文字 */
  loading?: boolean;
  /** 文字前的 16px 圖示（Lucide） */
  leadingIcon?: ReactNode;
  /** 文字後的 16px 圖示（Lucide） */
  trailingIcon?: ReactNode;
  /** 把樣式套到唯一的子元素上，例如 <Button asChild><Link href="/">回到座位安排</Link></Button> */
  asChild?: boolean;
}

export function Button({
  variant = 'outline',
  size = 'md',
  loading = false,
  disabled = false,
  leadingIcon,
  trailingIcon,
  asChild = false,
  className,
  children,
  type,
  ...props
}: ButtonProps) {
  const spinner = <Spinner />;
  const lead = loading && (leadingIcon || !trailingIcon) ? spinner : leadingIcon;
  const trail = loading && !leadingIcon && trailingIcon ? spinner : trailingIcon;
  const icon = (node: ReactNode) =>
    node ? (
      <span aria-hidden className="inline-flex shrink-0">
        {node}
      </span>
    ) : null;
  const classes = cn(buttonVariants({ variant, size, disabled, loading }), className);

  if (asChild) {
    // 連結不能 disabled：改用 aria-disabled，移出 tab 順序並擋掉指標事件
    const inert = disabled || loading;
    return (
      <Slot.Root
        className={cn(classes, inert && 'pointer-events-none')}
        aria-disabled={inert || undefined}
        aria-busy={loading || undefined}
        tabIndex={inert ? -1 : undefined}
        {...props}
      >
        {icon(lead)}
        <Slot.Slottable>{children}</Slot.Slottable>
        {icon(trail)}
      </Slot.Root>
    );
  }

  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {icon(lead)}
      <span className="min-w-0 truncate">{children}</span>
      {icon(trail)}
    </button>
  );
}
