import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PermissionsView } from '@/components/features/permissions/permissions-view';
import { allowedEmailDomain, currentUser } from '@/server/auth';
import { isEditor, listEditors } from '@/server/services/editors';

// 權限頁（docs/spec/permissions.md 第 2.1 節）：只有編輯者能開；只能檢視的人直接開網址時導向座位安排，不顯示提示（PRM-R06）。
// 每次開啟都依當下的名單判斷（AUTH-R11），名單也每次都讀最新的。
export const metadata: Metadata = { title: '權限' };
export const dynamic = 'force-dynamic';

export default async function PermissionsPage() {
  const user = await currentUser();
  if (!user) redirect('/login?callbackUrl=%2Fpermissions');
  if (!(await isEditor(user.email))) redirect('/');
  const editors = await listEditors();
  return <PermissionsView initialEditors={editors} domain={allowedEmailDomain() || undefined} />;
}
