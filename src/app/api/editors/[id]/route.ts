import { parseId, route } from '@/server/http';
import { removeEditor } from '@/server/services/editors';

// DELETE /api/editors/{id}：移除編輯者（PRM-R11～R14）；只剩這一位 409 LAST_EDITOR，已被移除 404
export const dynamic = 'force-dynamic';

export const DELETE = route<{ id: string }>(async ({ params, user }) => {
  const id = parseId(params.id);
  await removeEditor(id, user);
  return Response.json({ removedId: id });
});
