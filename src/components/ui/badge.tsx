// Badge（03-components.md Badge：Variants、Shape、Anatomy and Size、States、Accessibility；
// 狀態與圖示依 docs/spec/README.md 第 11.1 節）。高 20px、X 10px、Text-xs/Medium、預設 pill；
// 圖示 12px 放在文字前，間距 --space-1。正向帶 check、待處理帶 clock、中性不帶圖示，一律有文字。
// 可按的徽章（asChild 包 button 或 a）有 hover 與 focus ring；靜態徽章沒有 hover。
// MarkBadge 是 `third` 的 16px 小徽章，只放圖示，用 aria-label 與 Tooltip 說明（兒童椅、素食）。
import type { ComponentProps, ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { Check, Clock } from 'lucide-react';
import { cn } from './cn';
import { Tooltip } from './tooltip';

export type BadgeVariant = 'default' | 'positive' | 'pending' | 'neutral' | 'third' | 'destructive' | 'outline';

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-primary text-primary-foreground',
  positive: 'border-transparent bg-status-positive-bg text-status-positive-fg',
  pending: 'border-transparent bg-status-pending-bg text-status-pending-fg',
  neutral: 'border-transparent bg-muted text-muted-foreground',
  third: 'border-transparent bg-muted text-card-foreground',
  destructive: 'border-transparent bg-destructive text-primary-foreground',
  outline: 'border-semantic-border bg-transparent text-foreground',
};

const DEFAULT_ICON: Partial<Record<BadgeVariant, ReactNode>> = {
  positive: <Check />,
  pending: <Clock />,
};

export interface BadgeProps extends ComponentProps<'span'> {
  variant?: BadgeVariant;
  /** true：pill（狀態預設）；false：radius-sm，給密集表格對齊用 */
  rounded?: boolean;
  /** 文字前的 12px 圖示；positive／pending 預設 check／clock，傳 null 可拿掉 */
  icon?: ReactNode;
  /** 包住 button 或 a，成為可按的徽章（例如「第 3 桌」、已套用的篩選） */
  asChild?: boolean;
}

export function badgeClasses({ variant = 'neutral', rounded = true, interactive = false }: { variant?: BadgeVariant; rounded?: boolean; interactive?: boolean } = {}) {
  return cn(
    'inline-flex h-5 max-w-full min-w-0 shrink-0 items-center justify-center gap-1 border px-2.5 py-0.5',
    'type-xs-medium whitespace-nowrap no-underline [&_svg]:size-3 [&_svg]:shrink-0',
    rounded ? 'rounded-full' : 'rounded-sm',
    VARIANTS[variant],
    interactive &&
      'cursor-pointer outline-none transition-[background-color,box-shadow] duration-150 hover:bg-hover focus-visible:focus-ring aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60 disabled:cursor-not-allowed disabled:opacity-60',
  );
}

export function Badge({ variant = 'neutral', rounded = true, icon, asChild = false, className, children, ...props }: BadgeProps) {
  const lead = icon === undefined ? DEFAULT_ICON[variant] : icon;
  const classes = cn(badgeClasses({ variant, rounded, interactive: asChild }), className);
  const iconNode = lead ? (
    <span aria-hidden className="inline-flex shrink-0">
      {lead}
    </span>
  ) : null;
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {iconNode}
        <Slot.Slottable>{children}</Slot.Slottable>
      </Slot.Root>
    );
  }
  return (
    <span className={classes} {...props}>
      {iconNode}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export interface MarkBadgeProps {
  /** 12px 的 Lucide 圖示，例如 <Baby />、<Leaf /> */
  icon: ReactNode;
  /** 無障礙名稱與 Tooltip 文字，例如「兒童椅」 */
  label: string;
  /** 不顯示 Tooltip（例如同一列旁邊已有文字說明） */
  hideTooltip?: boolean;
  className?: string;
}

/** `third` 的 16px 小徽章，只放圖示（docs/spec/README.md 第 11.1 節；原型 .seat-mark） */
export function MarkBadge({ icon, label, hideTooltip = false, className }: MarkBadgeProps) {
  const mark = (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'inline-flex h-4 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1 text-card-foreground [&_svg]:size-3',
        className,
      )}
    >
      {icon}
    </span>
  );
  return hideTooltip ? mark : <Tooltip content={label}>{mark}</Tooltip>;
}
