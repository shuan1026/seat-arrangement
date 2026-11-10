import { CircleHelp } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

// 找不到頁面（docs/spec/README.md 第 9、14 節）
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[760px] items-center px-4">
      <EmptyState
        className="w-full"
        icon={<CircleHelp />}
        title={<h1>找不到這個頁面。</h1>}
        description="連結可能已失效，或內容已被移除。"
        action={
          <Button asChild variant="primary">
            <Link href="/">回到座位安排</Link>
          </Button>
        }
      />
    </main>
  );
}
