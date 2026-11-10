import { seatingOperationSchema } from '@/contracts/seating';
import { parseJson, route } from '@/server/http';
import { runSeatingOperation } from '@/server/services/seating';

// POST /api/seating/operations：座位異動指令（docs/architecture.md 第 8.1 節）。
// 回應的 participants 只放位置有改變的人（含往前補或往後移的人），tables 放備註名稱有改變的桌，undo 送回 restore 就能復原。
export const dynamic = 'force-dynamic';

export const POST = route(async ({ req, requestId, user }) => {
  const op = await parseJson(req, seatingOperationSchema);
  return Response.json(await runSeatingOperation(op, { requestId, userId: user.id }));
});
