import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PermissionsView } from '@/components/features/permissions/permissions-view';
import { allowedEmailDomain, currentUser } from '@/server/auth';
import { getRole, listMembers } from '@/server/services/members';

// 權限頁（docs/spec/permissions.md 第 2.1 節）：只有編輯者能開；檢視者直接開網址時導向座位安排，不顯示提示（PRM-R06）。
// 沒有權限的人由 (main)/layout.tsx 在同一個網址畫「沒有權限」頁（AUTH-R16），這裡不讀名單也不導向。
// 每次開啟都依當下的名單判斷（AUTH-R11），名單也每次都讀最新的。
export const metadata: Metadata = { title: '權限' };
export const dynamic = 'force-dynamic';

export default async function PermissionsPage() {
  const user = await currentUser();
  if (!user) redirect('/login?callbackUrl=%2Fpermissions');
  const role = await getRole(user.email);
  if (role === null) return null;
  if (role !== 'EDITOR') redirect('/');
  const members = await listMembers();
  return <PermissionsView initialMembers={members} domain={allowedEmailDomain() || undefined} />;
}
