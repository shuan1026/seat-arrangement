import { memberCreateSchema } from '@/contracts/permissions';
import { parseJson, route } from '@/server/http';
import { addMember, listMembers } from '@/server/services/members';

// 權限名單（docs/spec/permissions.md PRM-R06～R10；docs/architecture.md 第 8 節；D-026）。
// GET 也只給編輯者（權限頁只有編輯者能開）；POST 是寫入方法，route() 一律檢查編輯者。
export const dynamic = 'force-dynamic';

/** GET /api/members → { members: [{ id, email, role }] }，依加入先後 */
export const GET = route(async () => Response.json({ members: await listMembers() }), { editorOnly: true });

/** POST /api/members（{ email, role }）→ 201 { member }；空白、格式、網域或權限不對 400，已在名單 409 MEMBER_EXISTS */
export const POST = route(async ({ req, user }) => {
  const { email, role } = await parseJson(req, memberCreateSchema);
  return Response.json({ member: await addMember(email, role, user) }, { status: 201 });
});
