import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { currentUser } from '@/server/auth';
import { loadState } from '@/server/services/state';

// 登入後的三個頁面共用：伺服器端直接讀全部資料交給前端 store（docs/architecture.md 第 10.2 節）
export const dynamic = 'force-dynamic';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const data = await loadState();
  return (
    <AppShell user={{ name: user.name, email: user.email }} initialData={data}>
      {children}
    </AppShell>
  );
}
