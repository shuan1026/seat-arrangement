import { Skeleton } from '@/components/ui/skeleton';

// 權限頁載入中（docs/spec/permissions.md 第 2.1 節「狀態」；README 第 9 節）：依標題、新增區塊與清單列的形狀顯示 Skeleton，不顯示文字
export default function PermissionsLoading() {
  return (
    <section role="status" aria-label="載入中" aria-busy className="mx-auto flex w-full max-w-[760px] min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <Skeleton className="h-8 max-w-24" />
        <Skeleton className="max-w-96" />
      </div>
      <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-6 edge-card max-md:p-4">
        <Skeleton className="h-6 max-w-32" />
        <Skeleton className="h-9" />
        <div className="h-px bg-border" />
        <Skeleton className="h-6 max-w-24" />
        {['72%', '58%', '64%'].map((w) => (
          <div key={w} className="flex min-w-0 items-center gap-3 py-1">
            <Skeleton style={{ width: w }} />
            <Skeleton className="ml-auto h-8 w-16 shrink-0 rounded-md" />
          </div>
        ))}
      </div>
    </section>
  );
}
