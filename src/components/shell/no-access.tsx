'use client';

// 「沒有權限」頁（docs/spec/README.md 第 8.1 節、AUTH-R16、第 14 節文案；D-026）：
// 不在權限名單上的公司帳號開座位安排、參與人員、員工名單或權限頁時，在原本的網址顯示這一頁，不載入任何排座資料。
// 外觀和登入頁相同（置中卡片、光暈、沒有介面配色鈕）；「查看座位表」連到發布頁，「登出」和使用者選單的登出相同（AUTH-R09）。
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { Logo } from '@/components/shell/logo';
import { Button } from '@/components/ui/button';

export function NoAccess({ email }: { email: string }) {
  return (
    <main className="relative grid min-h-dvh min-w-0 place-items-center p-4">
      {/* 光暈是裝飾層：不承接文字、不擋點擊，自己裁切避免撐出水平捲動 */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-clip [background:var(--glow-primary),var(--glow-accent)]" />
      <section
        aria-labelledby="no-access-title"
        className="relative flex w-full max-w-[400px] min-w-0 flex-col gap-6 rounded-xl border border-border bg-card px-6 py-8 text-card-foreground edge-card"
      >
        <Logo variant="full" className="mx-auto h-[72px] w-[208px] max-w-full" />
        <div className="flex flex-col gap-2 text-center [text-wrap:balance]">
          <h1 id="no-access-title" className="type-2xl-bold text-foreground">
            你沒有檢視權限
          </h1>
          <p className="text-muted-foreground">需要查看排座資料的話，請聯絡承辦人把你的帳號加入權限頁。加入後重新整理這一頁就能看到。</p>
          {/* 長 email 可以在任何字元處換行，不截斷 */}
          <p className="type-sm-regular text-muted-foreground [overflow-wrap:anywhere]">目前登入：{email}</p>
        </div>
        <div className="flex flex-col gap-3">
          <Button asChild variant="primary" className="w-full">
            <Link href="/seats">查看座位表</Link>
          </Button>
          <Button variant="outline" className="w-full" onClick={() => void signOut({ callbackUrl: '/login?loggedOut=1' })}>
            登出
          </Button>
        </div>
      </section>
    </main>
  );
}
