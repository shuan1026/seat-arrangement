import { tableUpdateSchema } from '@/contracts/seating';
import { AppError, parseId, parseJson, route } from '@/server/http';
import { updateTableNoteName } from '@/server/services/seating';

// PATCH /api/tables/{id}：修改桌次的備註名稱（docs/spec/seating.md SEAT-R12；不能復原，回應沒有 undo）
export const dynamic = 'force-dynamic';

export const PATCH = route<{ id: string }>(async ({ req, params }) => {
  const id = parseId(params.id);
  // 一般桌（場上或暫存，D-027）才有備註名稱；工作人員桌（0）與不存在的桌都當作找不到（SEAT-R48），由服務層判斷
  if (id < 1) throw new AppError('NOT_FOUND', 'table not found');
  const { noteName } = await parseJson(req, tableUpdateSchema);
  return Response.json({ table: await updateTableNoteName(id, noteName) });
});
