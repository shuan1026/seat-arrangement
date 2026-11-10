import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { currentUser } from '@/server/auth';
import { isEditor } from '@/server/services/editors';
import { getSeatsPublished } from '@/server/services/publish';
import { loadState } from '@/server/services/state';

// 登入後的頁面共用：伺服器端直接讀全部資料，連同目前登入者是否為編輯者與發布狀態交給前端 store
// （docs/architecture.md 第 9.3、10.2 節）。編輯者每次開啟頁面都依當下的名單判斷（AUTH-R11、AUTH-R14）。
export const dynamic = 'force-dynamic';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const [data, editor, seatsPublished] = await Promise.all([loadState(), isEditor(user.email), getSeatsPublished()]);
  return (
    <AppShell user={{ name: user.name, email: user.email }} initialData={data} isEditor={editor} seatsPublished={seatsPublished}>
      {children}
    </AppShell>
  );
}
