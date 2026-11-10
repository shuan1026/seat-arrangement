import { participantUpdateSchema } from '@/contracts/participants';
import { parseId, parseJson, route } from '@/server/http';
import { deleteParticipant, updateParticipant } from '@/server/services/participants';

// PATCH /api/participants/{id}：編輯（含兒童椅、素食、工作人員、桌次、變更類別）
export const PATCH = route<{ id: string }>(async ({ req, params }) => {
  const id = parseId(params.id);
  return Response.json(await updateParticipant(id, await parseJson(req, participantUpdateSchema)));
});

// DELETE /api/participants/{id}：取消報名（員工，眷屬一併移除）或刪除（眷屬、外部貴賓）
export const DELETE = route<{ id: string }>(async ({ params }) => Response.json(await deleteParticipant(parseId(params.id))));
