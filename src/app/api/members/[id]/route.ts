import { memberRoleUpdateSchema } from '@/contracts/permissions';
import { parseId, parseJson, route } from '@/server/http';
import { changeMemberRole, removeMember } from '@/server/services/members';

// 權限名單的一列（docs/spec/permissions.md PRM-R11～R14、PRM-R35；D-026）：
// 最後一位編輯者不能移除也不能改為檢視者（409 LAST_EDITOR），已被移除 404。
export const dynamic = 'force-dynamic';

/** PATCH /api/members/{id}（{ role }）→ { member }：改權限 */
export const PATCH = route<{ id: string }>(async ({ req, params, user }) => {
  const id = parseId(params.id);
  const { role } = await parseJson(req, memberRoleUpdateSchema);
  return Response.json({ member: await changeMemberRole(id, role, user) });
});

/** DELETE /api/members/{id} → { removedId }：移除帳號 */
export const DELETE = route<{ id: string }>(async ({ params, user }) => {
  const id = parseId(params.id);
  await removeMember(id, user);
  return Response.json({ removedId: id });
});
