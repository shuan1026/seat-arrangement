import type { Metadata } from 'next';
import { PageHead } from '@/components/shell/page-head';

// 座位安排（docs/spec/seating.md）。頁面內容由階段 2 的 C 線實作。
export const metadata: Metadata = { title: '座位安排' };

export default function SeatingPage() {
  return (
    <section className="min-w-0">
      <PageHead title="座位安排" />
    </section>
  );
}
