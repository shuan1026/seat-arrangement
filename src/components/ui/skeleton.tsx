// Skeleton（03-components.md Skeleton：Line Skeleton、Card Skeleton、Motion；docs/spec/README.md 第 9 節「載入」）。
// 填色只用 --muted，在 --muted 與淡化的 --muted 之間柔和循環；減少動態時停止。形狀要對應載入後的內容，不顯示文字。
import type { ComponentProps } from 'react';
import { cn } from './cn';

export interface SkeletonProps extends ComponentProps<'span'> {
  /** line：16px 高的文字條（預設）；circle：頭像；block：圖片或卡片區塊（radius-lg） */
  shape?: 'line' | 'circle' | 'block';
}

export function Skeleton({ shape = 'line', className, ...props }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'block shrink-0 skeleton-shimmer',
        shape === 'line' && 'h-4 w-full rounded-sm',
        shape === 'circle' && 'size-14 rounded-full',
        shape === 'block' && 'h-32 w-full rounded-lg',
        className,
      )}
      {...props}
    />
  );
}

const WIDTHS = ['92%', '78%', '86%', '64%', '72%'];

export interface SkeletonPanelProps extends ComponentProps<'div'> {
  /** 幾條文字條，預設 8（原型 UI.skeleton 的表格載入） */
  lines?: number;
  /** 讀給螢幕閱讀器的文字，預設「載入中」（畫面上不顯示） */
  label?: string;
}

/** 面板或表格載入中：卡片外框 + 長短不一的文字條 */
export function SkeletonPanel({ lines = 8, label = '載入中', className, ...props }: SkeletonPanelProps) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy
      className={cn('flex flex-col gap-3 rounded-xl border border-border bg-card p-5 edge-top', className)}
      {...props}
    >
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} style={{ width: WIDTHS[i % WIDTHS.length] }} />
      ))}
    </div>
  );
}

/** Line Skeleton：56px 頭像 + 兩條 20px 文字（240px、180px） */
export function SkeletonLine({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div aria-hidden className={cn('flex min-w-0 items-center gap-4', className)} {...props}>
      <Skeleton shape="circle" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Skeleton className="h-5 max-w-60" />
        <Skeleton className="h-5 max-w-45" />
      </div>
    </div>
  );
}

/** Card Skeleton：圖片區塊 + 100%／80% 兩條文字 */
export function SkeletonCard({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div aria-hidden className={cn('flex min-w-0 flex-col gap-3', className)} {...props}>
      <Skeleton shape="block" />
      <Skeleton className="h-5" />
      <Skeleton className="h-5 w-4/5" />
    </div>
  );
}
