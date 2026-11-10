import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PublishedSeats } from '@/components/features/publish/published-seats';
import { currentUser } from '@/server/auth';
import { getPublishedSeating } from '@/server/services/publish';

// 發布頁 /seats（docs/spec/permissions.md 第 2.3 節、PRM-R21～R29）：不套 App Shell；要用公司帳號登入（AUTH-R15），
// 編輯者與只能檢視的人看到的內容相同。伺服器端直接呼叫 getPublishedSeating()，只把發布頁要的欄位交給前端；
// 動態渲染、不快取，每次開啟或重新整理都是最新的座位與發布狀態（PRM-R29；docs/architecture.md 第 10.2 節）。
export const metadata: Metadata = { title: '尾牙座位表' };
export const dynamic = 'force-dynamic';

export default async function SeatsPage() {
  const user = await currentUser();
  if (!user) redirect('/login?callbackUrl=%2Fseats');
  return <PublishedSeats seating={await getPublishedSeating()} />;
}
