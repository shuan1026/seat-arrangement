import type { StateResponse } from '@/contracts/permissions';
import { route } from '@/server/http';
import { getRole } from '@/server/services/members';
import { getSeatsPublished } from '@/server/services/publish';
import { loadState } from '@/server/services/state';

// 全部員工、參與人員與桌次，以及目前登入者是否為編輯者與發布狀態；重新整理或發生衝突後重新載入用
// （docs/architecture.md 第 8 節）。檢視者拿到的資料和編輯者相同（COM-R19）；沒有權限的人由 route() 擋下（403 NO_ACCESS，D-026）。
export const dynamic = 'force-dynamic';

export const GET = route(async ({ user }) => {
  const [data, role, seatsPublished] = await Promise.all([loadState(), getRole(user.email), getSeatsPublished()]);
  const body: StateResponse = { ...data, me: { isEditor: role === 'EDITOR' }, seatsPublished };
  return Response.json(body);
});
