import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { NoAccess } from '@/components/shell/no-access';
import { currentUser } from '@/server/auth';
import { getRole } from '@/server/services/members';
import { getSeatsPublished } from '@/server/services/publish';
import { loadState } from '@/server/services/state';

// 登入後的頁面共用：伺服器端直接讀全部資料，連同目前登入者是否為編輯者與發布狀態交給前端 store
// （docs/architecture.md 第 9.3、10.2 節）。身分每次開啟頁面都依當下的名單判斷（AUTH-R11、AUTH-R14）。
// 不在權限名單上的人不讀任何排座資料，在同一個網址畫「沒有權限」頁，子頁面也不渲染（AUTH-R16，D-026）。
export const dynamic = 'force-dynamic';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const role = await getRole(user.email);
  if (role === null) return <NoAccess email={user.email} />;
  const [data, seatsPublished] = await Promise.all([loadState(), getSeatsPublished()]);
  return (
    <AppShell user={{ name: user.name, email: user.email }} initialData={data} isEditor={role === 'EDITOR'} seatsPublished={seatsPublished}>
      {children}
    </AppShell>
  );
}
