import { editorCreateSchema } from '@/contracts/permissions';
import { parseJson, route } from '@/server/http';
import { addEditor, listEditors } from '@/server/services/editors';

// 編輯者名單（docs/spec/permissions.md PRM-R06～R10；docs/architecture.md 第 8 節）。
// GET 也只給編輯者（權限頁只有編輯者能開）；POST 是寫入方法，route() 一律檢查編輯者。
export const dynamic = 'force-dynamic';

/** GET /api/editors → { editors: [{ id, email }] }，依加入先後 */
export const GET = route(async () => Response.json({ editors: await listEditors() }), { editorOnly: true });

/** POST /api/editors（{ email }）→ { editor }；空白、格式或網域不對 400，已在名單 409 EDITOR_EXISTS */
export const POST = route(async ({ req, user }) => {
  const { email } = await parseJson(req, editorCreateSchema);
  return Response.json({ editor: await addEditor(email, user) }, { status: 201 });
});
