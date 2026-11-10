import type { StateResponse } from '@/contracts/permissions';
import { route } from '@/server/http';
import { isEditor } from '@/server/services/editors';
import { getSeatsPublished } from '@/server/services/publish';
import { loadState } from '@/server/services/state';

// 全部員工、參與人員與桌次，以及目前登入者是否為編輯者與發布狀態；重新整理或發生衝突後重新載入用
// （docs/architecture.md 第 8 節）。只能檢視的人拿到的資料和編輯者相同（COM-R19）。
export const dynamic = 'force-dynamic';

export const GET = route(async ({ user }) => {
  const [data, editor, seatsPublished] = await Promise.all([loadState(), isEditor(user.email), getSeatsPublished()]);
  const body: StateResponse = { ...data, me: { isEditor: editor }, seatsPublished };
  return Response.json(body);
});
