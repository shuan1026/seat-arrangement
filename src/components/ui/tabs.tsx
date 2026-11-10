'use client';
// Tabs `default`（pill）（03-components.md Tabs：Default / Pill Variant、Stretch Behavior、Responsive / Overflow）。
// 容器高 36px、padding 4px、--muted 底、--border、radius-full；項目高 26px、X 12px、Text-sm/Medium；
// 選中 --card 底、--foreground 字、shadow-sm；未選 --muted-foreground，hover 填 6% 並轉為 --foreground。
// 可帶數字（例如「未入座 11」）。項目過多時在清單內橫向捲動，不撐開頁面。
import type { ComponentProps, ReactNode } from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from './cn';

export const Tabs = TabsPrimitive.Root;

export interface TabsListProps extends ComponentProps<typeof TabsPrimitive.List> {
  /** true：每個項目平分寬度（stretchLabels: true），容器寬度由父層決定 */
  stretch?: boolean;
}

export function TabsList({ stretch = false, className, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn(
        'h-9 max-w-full min-w-0 items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-muted p-1 scrollbar-inset',
        stretch ? 'flex w-full *:flex-1' : 'inline-flex',
        className,
      )}
      {...props}
    />
  );
}

export interface TabsTriggerProps extends ComponentProps<typeof TabsPrimitive.Trigger> {
  /** 標籤後的數字，例如未入座人數 */
  count?: ReactNode;
}

export function TabsTrigger({ count, className, children, ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-[26px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 whitespace-nowrap',
        'type-sm-medium text-muted-foreground outline-none transition-[background-color,color,box-shadow] duration-150',
        'hover:bg-hover hover:text-foreground focus-visible:focus-ring',
        'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:edge-raised',
        'data-[state=active]:focus-visible:focus-ring',
        'disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-60 disabled:hover:bg-transparent',
        className,
      )}
      {...props}
    >
      {children}
      {count != null ? <span className="tabular-nums">{count}</span> : null}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('min-w-0 outline-none', className)} {...props} />;
}
