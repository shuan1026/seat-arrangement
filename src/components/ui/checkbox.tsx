'use client';
// Checkbox（03-components.md Checkbox：Values、Sizes & Shape、States、Accessibility）。
// 16px、radius-sm、--foreground 邊框；選取與部分選取（indeterminate）填 --foreground 並放 12px 勾號／減號。
// 部分選取時 Radix 會設 aria-checked="mixed"。focus ring 往外擴，不改變版面。
import type { ComponentProps, ReactNode } from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { Check, Minus } from 'lucide-react';
import { cn } from './cn';
import { useFieldIds } from './input';

export type CheckedState = boolean | 'indeterminate';

export interface CheckboxProps extends Omit<ComponentProps<typeof CheckboxPrimitive.Root>, 'children'> {
  /** 顯示在右側的文字；沒有時要另給 aria-label（例如表格列的勾選框） */
  label?: ReactNode;
  /** 文字下方的說明 */
  description?: ReactNode;
  /** 套在外層（含文字）上 */
  className?: string;
}

export function Checkbox({ label, description, className, id, disabled, checked, ...props }: CheckboxProps) {
  const ids = useFieldIds(id);
  const box = (
    <CheckboxPrimitive.Root
      id={ids.id}
      disabled={disabled}
      checked={checked}
      aria-describedby={description ? ids.descriptionId : undefined}
      className={cn(
        'peer group/checkbox grid size-4 shrink-0 place-items-center rounded-sm border border-foreground bg-transparent text-background outline-none',
        'transition-[background-color,border-color,box-shadow] duration-150 focus-visible:focus-ring',
        'data-[state=checked]:bg-foreground data-[state=indeterminate]:bg-foreground',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer hover:bg-hover data-[state=checked]:hover:bg-foreground-hover data-[state=indeterminate]:hover:bg-foreground-hover',
        !label && className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-items-center [&_svg]:size-3 [&_svg]:[stroke-width:1.5px]">
        <Check aria-hidden className="group-data-[state=indeterminate]/checkbox:hidden" strokeLinecap="round" />
        <Minus aria-hidden className="hidden group-data-[state=indeterminate]/checkbox:block" strokeLinecap="round" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
  if (!label) return box;
  return (
    <div className={cn('inline-flex min-w-0 max-w-full items-start gap-2', className)}>
      <span className="flex h-5 shrink-0 items-center">{box}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <label
          htmlFor={ids.id}
          className={cn('type-sm-regular text-foreground', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}
        >
          {label}
        </label>
        {description ? (
          <span id={ids.descriptionId} className={cn('type-xs-regular text-muted-foreground', disabled && 'opacity-60')}>
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}
