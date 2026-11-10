import type { Metadata } from 'next';
import { PageHead } from '@/components/shell/page-head';

// 參與人員（docs/spec/participants.md）。頁面內容由階段 2 的 B 線實作。
export const metadata: Metadata = { title: '參與人員' };

export default function PeoplePage() {
  return (
    <section className="min-w-0">
      <PageHead title="參與人員" description="管理報名尾牙的員工、他們的眷屬與外部貴賓。" />
    </section>
  );
}
