import { Skeleton, SkeletonPanel } from '@/components/ui/skeleton';

// 員工名單載入中（docs/spec/employees.md 2.1、EMP-AC07；README 第 9 節）：
// 依頁面標題、Tabs、工具列與表格的形狀顯示 Skeleton，不顯示文字；表格區以 role="status" 告訴輔助技術正在載入。
export default function EmployeesLoading() {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div aria-hidden className="flex min-w-0 flex-col gap-2">
        <Skeleton className="h-8 max-w-40" />
        <Skeleton className="max-w-96" />
      </div>
      <Skeleton className="h-9 max-w-64 rounded-full" />
      <Skeleton className="h-8" />
      <SkeletonPanel lines={8} />
    </section>
  );
}
