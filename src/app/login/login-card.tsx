'use client';

// 登入卡片（docs/spec/README.md 第 8.1 節、第 14 節文案；原型 login.html）
import { LogIn, TriangleAlert } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useEffect, useState } from 'react';
import type { LoginError } from '@/domain/auth-policy';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { notify } from '@/components/ui/toaster';

const ERRORS: Record<Exclude<LoginError, null>, [string, string]> = {
  denied: ['這個帳號不能登入。', '只能使用公司的 Google 帳號（@program.com.tw），請換一個帳號再試一次。'],
  failed: ['登入沒有完成。', '請檢查網路後再試一次。'],
  expired: ['登入已過期。', '請重新登入，登入後會載入最新資料。'],
};

export function LoginCard({ error, callbackUrl, loggedOut }: { error: LoginError; callbackUrl: string; loggedOut: boolean }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loggedOut) return;
    notify('已登出。');
    // 只顯示一次：把網址上的標記拿掉，重新整理不會再出現
    window.history.replaceState(null, '', '/login');
  }, [loggedOut]);

  const start = () => {
    if (busy) return;
    setBusy(true);
    void signIn('google', { callbackUrl });
  };

  return (
    <main className="relative grid min-h-dvh min-w-0 place-items-center p-4">
      {/* 光暈是裝飾層：不承接文字、不擋點擊，自己裁切避免撐出水平捲動 */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-clip [background:var(--glow-primary),var(--glow-accent)]" />
      <section
        aria-labelledby="login-title"
        className="relative flex w-full max-w-[400px] flex-col gap-6 rounded-xl border border-border bg-card px-6 py-8 text-card-foreground edge-card"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 單色 SVG 原檔，不需要最佳化 */}
        <img src="/logo-dark.svg" alt="Seat Arrangement" width={208} height={72} className="mx-auto h-[72px] w-[208px] max-w-full" />
        <div className="flex flex-col gap-2 text-center [text-wrap:balance]">
          <h1 id="login-title" className="type-2xl-bold text-foreground">
            用公司帳號登入
          </h1>
          <p className="text-muted-foreground">請使用公司的 Google 帳號（@program.com.tw）登入。</p>
        </div>
        <div className="flex flex-col gap-4">
          {error ? (
            <Alert role="alert" icon={<TriangleAlert />} title={ERRORS[error][0]}>
              {ERRORS[error][1]}
            </Alert>
          ) : null}
          <Button variant="primary" className="w-full" loading={busy} leadingIcon={<LogIn />} onClick={start}>
            使用公司 Google 帳號登入
          </Button>
        </div>
      </section>
    </main>
  );
}
