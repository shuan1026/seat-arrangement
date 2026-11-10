import type { Metadata } from 'next';
import { EmployeesView } from '@/components/features/employees/employees-view';

// 員工名單（docs/spec/employees.md）：資料由 (main)/layout.tsx 在伺服器端讀進 store，頁面內容在前端元件。
export const metadata: Metadata = { title: '員工名單' };

export default function EmployeesPage() {
  return <EmployeesView />;
}
