import { TABLE_COUNT } from '@/contracts/entities';
import { tableUpdateSchema } from '@/contracts/seating';
import { AppError, parseId, parseJson, route } from '@/server/http';
import { updateTableNoteName } from '@/server/services/seating';

// PATCH /api/tables/{id}：修改桌次的備註名稱（docs/spec/seating.md SEAT-R12；不能復原，回應沒有 undo）
export const dynamic = 'force-dynamic';

export const PATCH = route<{ id: string }>(async ({ req, params }) => {
  const id = parseId(params.id);
  // 只有第 1–30 桌有備註名稱；工作人員桌（0）與不存在的內部編號都當作找不到（SEAT-R01、SEAT-R48）
  if (id < 1 || id > TABLE_COUNT) throw new AppError('NOT_FOUND', 'table not found');
  const { noteName } = await parseJson(req, tableUpdateSchema);
  return Response.json({ table: await updateTableNoteName(id, noteName) });
});
