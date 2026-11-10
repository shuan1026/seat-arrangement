'use client';

import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

// 發布頁發生錯誤（README 第 9、14 節）：「系統發生問題，請稍後再試。」與「再試一次」；不套 App Shell，不顯示錯誤代碼
export default function SeatsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-dvh min-w-0 bg-background px-6 pt-6 pb-6 text-foreground max-md:px-4 max-md:pt-4 max-md:pb-4">
      <h1 className="type-2xl-bold text-foreground">尾牙座位表</h1>
      <EmptyState
        className="mt-4"
        icon={<TriangleAlert />}
        title="系統發生問題，請稍後再試。"
        action={
          <Button variant="outline" onClick={() => reset()}>
            再試一次
          </Button>
        }
      />
    </main>
  );
}
