import { SkeletonPanel } from '@/components/ui/skeleton';

// 載入中：依表格形狀顯示 Skeleton，不顯示文字（docs/spec/participants.md 第 2.1 節、docs/spec/README.md 第 9 節）
export default function Loading() {
  return (
    <section className="min-w-0">
      <SkeletonPanel lines={10} />
    </section>
  );
}
