import { SeatingSkeleton } from '@/components/features/seating/seating-skeleton';

// 座位安排載入中：座位圖 30 個圓形、人員面板列形狀的 Skeleton，不顯示文字（docs/spec/seating.md SEAT-R87）
export default function Loading() {
  return <SeatingSkeleton />;
}
