import type { Metadata } from 'next';
import { PageHead } from '@/components/shell/page-head';

// 員工名單（docs/spec/employees.md）。頁面內容由階段 2 的 A 線實作。
export const metadata: Metadata = { title: '員工名單' };

export default function EmployeesPage() {
  return (
    <section className="min-w-0">
      <PageHead title="員工名單" description="公司全部員工。把報名尾牙的人加入，參與人員就會出現在座位安排。" />
    </section>
  );
}
