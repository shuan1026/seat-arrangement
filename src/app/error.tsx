'use client';

// 系統錯誤（docs/spec/README.md 第 9、12、14 節）：「系統發生問題，請稍後再試。」與「再試一次」，不顯示錯誤代碼或內部訊息。
// 三個頁面的資料都在共用的 (main)/layout.tsx 讀取；layout 丟出的錯誤只有上一層、也就是這個根層級的 error.tsx 接得到。
// 這時還沒有 store 與 App Shell，所以不用 AppProvider；版面照找不到頁面（not-found.tsx）置中顯示。
import { TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  // 重新向伺服器讀取資料，再重新繪製這一段
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
  return (
    <main className="mx-auto flex min-h-dvh max-w-[760px] items-center px-4">
      <EmptyState
        className="w-full"
        icon={<TriangleAlert />}
        title={<h1>系統發生問題，請稍後再試。</h1>}
        action={
          <Button variant="outline" onClick={retry}>
            再試一次
          </Button>
        }
      />
    </main>
  );
}
