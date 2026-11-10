'use client';

import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

// 資料載入失敗：系統錯誤文案與「再試一次」（docs/spec/participants.md 第 2.1 節、docs/spec/README.md 第 9 節）
export default function PeopleError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="min-w-0">
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
