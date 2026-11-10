// 座位安排載入中（docs/spec/seating.md 2.1.10、SEAT-R87、SEAT-AC90；原型 prototype.css 的 .skeleton-map）：
// 座位圖顯示 30 個圓形的 Skeleton，人員面板依人員列的形狀顯示 Skeleton，不顯示文字。
import { Skeleton } from '@/components/ui/skeleton';

const ROW_WIDTHS = ['72%', '58%', '80%', '64%', '70%', '52%'];

export function SeatingSkeleton() {
  return (
    <div role="status" aria-label="載入中" aria-busy className="min-w-0">
      <div className="mb-4 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-60 max-w-full" />
      </div>
      <div className="flex min-w-0 gap-4">
        <div className="hidden w-[280px] shrink-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 edge-card md:flex">
          <Skeleton className="h-8" />
          <Skeleton className="h-9 w-40 rounded-full" />
          {ROW_WIDTHS.map((w, i) => (
            <div key={i} className="flex flex-col gap-1.5 py-1">
              <Skeleton style={{ width: w }} />
              <Skeleton className="h-3" style={{ width: `calc(${w} - 16%)` }} />
            </div>
          ))}
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fill,88px)] justify-center gap-4 rounded-xl border border-border bg-background p-6">
          {Array.from({ length: 30 }, (_, i) => (
            <Skeleton key={i} shape="circle" style={{ width: 88, height: 88 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
