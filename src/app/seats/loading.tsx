import { SeatsMapSkeleton } from '@/components/features/publish/published-seats';
import { Skeleton } from '@/components/ui/skeleton';

// 發布頁載入中（docs/spec/permissions.md 第 2.3 節「狀態」、D-025）：標題、工具列與 30 張展開卡片形狀的 Skeleton，不顯示文字
export default function SeatsLoading() {
  return (
    <main className="flex min-h-dvh min-w-0 flex-col bg-background px-6 pt-6 pb-6 max-md:px-4 max-md:pt-4 max-md:pb-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-4 h-8 w-[320px] max-w-full rounded-sm max-md:w-full" />
      <div className="mt-4 flex min-h-[480px] min-w-0 flex-1 flex-col">
        <SeatsMapSkeleton />
      </div>
    </main>
  );
}
