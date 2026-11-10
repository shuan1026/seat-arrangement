// 資料表格（04-patterns-and-ux.md Data Management Pattern：Table Rules、Mobile Table Strategy；
// 03-components.md Scrollbar；原型 prototype.css 的 .table-shell／.table-scroll／table.data／.table--stack）。
// 外框 --card、--border、radius-xl、edge-highlight + shadow-xs，overflow: hidden 只在外框；
// 橫向捲動在內層，捲軸兩端內縮 16px。表頭 Text-xs/Medium、--muted-foreground；儲存格 X 16px Y 12px，列間 --border。
// stackOnMobile：手機寬度把每列改成卡片，儲存格用 label 顯示欄名（原型的 table--stack）。
import type { ComponentProps, CSSProperties } from 'react';
import { cn } from './cn';

export interface TableProps extends ComponentProps<'table'> {
  /** 捲動區的無障礙名稱（例如「參與人員」），有填時捲動區可用鍵盤聚焦捲動 */
  label?: string;
  /** 表格最小寬度，超過容器時在表格內橫向捲動 */
  minWidth?: number | string;
  /** 手機寬度改成卡片列表 */
  stackOnMobile?: boolean;
  /** 套在外框上 */
  shellClassName?: string;
}

/** 外框 + 捲動區 + table */
export function Table({ label, minWidth, stackOnMobile = false, shellClassName, className, style, ...props }: TableProps) {
  const tableStyle: CSSProperties | undefined = minWidth !== undefined ? { minWidth, ...style } : style;
  return (
    <TableShell className={shellClassName}>
      <TableScroll label={label}>
        <table
          className={cn(
            'w-full border-collapse type-sm-regular text-card-foreground',
            stackOnMobile && 'table-stack max-md:min-w-0!',
            className,
          )}
          style={tableStyle}
          {...props}
        />
      </TableScroll>
    </TableShell>
  );
}

export function TableShell({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('relative max-w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card edge-card', className)}
      {...props}
    />
  );
}

export interface TableScrollProps extends ComponentProps<'div'> {
  label?: string;
}

/** 可橫向捲動的內層；捲軸用 Scrollbar 規格（8px、兩端內縮 16px） */
export function TableScroll({ label, className, ...props }: TableScrollProps) {
  return (
    <div
      role={label ? 'region' : undefined}
      aria-label={label}
      tabIndex={label ? 0 : undefined}
      className={cn('max-w-full overflow-x-auto outline-none scrollbar-inset focus-visible:focus-ring', className)}
      {...props}
    />
  );
}

export function TableHeader(props: ComponentProps<'thead'>) {
  return <thead {...props} />;
}

export function TableBody(props: ComponentProps<'tbody'>) {
  return <tbody {...props} />;
}

export interface TableRowProps extends ComponentProps<'tr'> {
  /** 整列可點時才加 hover（Table Rules） */
  interactive?: boolean;
}

export function TableRow({ interactive = false, className, ...props }: TableRowProps) {
  return (
    <tr
      className={cn(
        interactive && 'cursor-pointer transition-colors duration-150 hover:bg-hover',
        className,
      )}
      {...props}
    />
  );
}

type CellKind = 'primary' | 'actions' | 'check';

interface CellOptions {
  /** 數字靠右、等寬數字 */
  numeric?: boolean;
  /** primary：手機卡片的第一行；actions：列操作（44px 寬）；check：勾選框（40px 寬） */
  kind?: CellKind;
}

const kindClasses: Record<CellKind, string> = {
  primary: '',
  actions: 'w-11 pl-0 text-right',
  check: 'w-10 pr-0',
};

export interface TableHeadProps extends ComponentProps<'th'>, CellOptions {}

export function TableHead({ numeric, kind, className, scope = 'col', ...props }: TableHeadProps) {
  return (
    <th
      scope={scope}
      className={cn(
        'border-b border-border px-4 py-3 text-left align-middle type-xs-medium whitespace-nowrap text-muted-foreground',
        numeric && 'text-right whitespace-nowrap tabular-nums',
        kind && kindClasses[kind],
        className,
      )}
      {...props}
    />
  );
}

export interface TableCellProps extends ComponentProps<'td'>, CellOptions {
  /** 手機卡片顯示的欄名（stackOnMobile） */
  label?: string;
  /** 手機卡片不顯示這格 */
  hideOnMobile?: boolean;
}

export function TableCell({ numeric, kind, label, hideOnMobile, className, ...props }: TableCellProps) {
  return (
    <td
      data-label={label}
      data-cell={kind}
      data-hide-mobile={hideOnMobile || undefined}
      className={cn(
        'border-b border-border px-4 py-3 align-middle [tr:last-child>&]:border-b-0',
        numeric && 'text-right whitespace-nowrap tabular-nums',
        kind && kindClasses[kind],
        className,
      )}
      {...props}
    />
  );
}
