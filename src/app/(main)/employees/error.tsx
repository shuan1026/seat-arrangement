'use client';

import { TriangleAlert } from 'lucide-react';
import { PageHead } from '@/components/shell/page-head';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

// 員工名單發生錯誤（docs/spec/employees.md EMP-AC07；README 第 9、12、14 節）：
// 「系統發生問題，請稍後再試。」與「再試一次」；不顯示錯誤代碼或內部訊息。
export default function EmployeesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="min-w-0">
      <PageHead title="員工名單" />
      <EmptyState
        icon={<TriangleAlert />}
        title="系統發生問題，請稍後再試。"
        action={
          <Button variant="outline" onClick={() => reset()}>
            再試一次
          </Button>
        }
      />
    </section>
  );
}
