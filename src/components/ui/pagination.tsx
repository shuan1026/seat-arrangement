// Pagination（03-components.md Pagination：Desktop、Hover Rules、Mobile、Position Variants；
// 文案依 docs/spec/README.md 第 14 節）。摘要「第 {起}-{迄} 列，共 {n} 列」在左，導覽在右。
// 桌面：「上一頁」、頁碼（32x36、目前頁 --card 底 + 邊框 + shadow-sm）、「下一頁」，超過 7 頁時中間用省略號。
// 手機（< 768px）：摘要在上，改成四個 36px outline 圖示鈕（第一頁、上一頁、下一頁、最後一頁）。
// 在第一頁或最後一頁時，對應的按鈕停用（仍顯示、變淡、沒有 hover）。只有一頁時不顯示導覽（同原型 UI.pagination）。
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './icon-button';

export interface PaginationProps {
  /** 目前頁（從 1 開始） */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** 要顯示的頁碼；null 代表省略號 */
export function pageItems(page: number, pages: number): (number | null)[] {
  const show = (p: number) =>
    pages <= 7 || p === 1 || p === pages || Math.abs(p - page) <= 1 || (page <= 4 && p <= 4) || (page >= pages - 3 && p >= pages - 3);
  const items: (number | null)[] = [];
  for (let p = 1; p <= pages; p++) {
    if (show(p)) items.push(p);
    else if (items[items.length - 1] !== null) items.push(null);
  }
  return items;
}

const navText =
  'inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2 type-sm-regular outline-none transition-[background-color,box-shadow] duration-150 focus-visible:focus-ring [&_svg]:size-4';

export function Pagination({ page, pageSize, total, onPageChange, className }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const from = total ? (current - 1) * pageSize + 1 : 0;
  const to = Math.min(total, current * pageSize);
  const atStart = current <= 1;
  const atEnd = current >= pages;
  const go = (p: number) => {
    if (p >= 1 && p <= pages && p !== current) onPageChange(p);
  };

  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 max-md:flex-col max-md:items-stretch',
        className,
      )}
    >
      <span className="type-sm-regular text-muted-foreground">
        第 {from}-{to} 列，共 {total} 列
      </span>
      {pages > 1 ? (
        <>
          <nav aria-label="分頁" className="inline-flex min-w-0 flex-wrap items-center gap-1 max-md:hidden">
            <button
              type="button"
              disabled={atStart}
              onClick={() => go(current - 1)}
              className={cn(navText, atStart ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer text-foreground hover:bg-hover')}
            >
              <ChevronLeft aria-hidden />
              上一頁
            </button>
            {pageItems(current, pages).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} aria-hidden className="inline-grid h-9 min-w-8 place-items-center px-1 type-sm-regular text-foreground">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  aria-label={`第 ${p} 頁`}
                  aria-current={p === current ? 'page' : undefined}
                  onClick={() => go(p)}
                  className={cn(
                    'inline-grid h-9 min-w-8 shrink-0 place-items-center rounded-md border px-1 type-sm-regular text-foreground tabular-nums outline-none',
                    'transition-[background-color,box-shadow] duration-150 focus-visible:focus-ring',
                    p === current
                      ? 'cursor-default border-border bg-card edge-raised focus-visible:focus-ring'
                      : 'cursor-pointer border-transparent hover:bg-hover',
                  )}
                >
                  {p}
                </button>
              ),
            )}
            <button
              type="button"
              disabled={atEnd}
              onClick={() => go(current + 1)}
              className={cn(navText, atEnd ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer text-foreground hover:bg-hover')}
            >
              下一頁
              <ChevronRight aria-hidden />
            </button>
          </nav>
          <nav aria-label="分頁" className="hidden gap-2 max-md:inline-flex">
            <IconButton variant="outline" label="第一頁" disabled={atStart} onClick={() => go(1)}>
              <ChevronsLeft />
            </IconButton>
            <IconButton variant="outline" label="上一頁" disabled={atStart} onClick={() => go(current - 1)}>
              <ChevronLeft />
            </IconButton>
            <IconButton variant="outline" label="下一頁" disabled={atEnd} onClick={() => go(current + 1)}>
              <ChevronRight />
            </IconButton>
            <IconButton variant="outline" label="最後一頁" disabled={atEnd} onClick={() => go(pages)}>
              <ChevronsRight />
            </IconButton>
          </nav>
        </>
      ) : null}
    </div>
  );
}
