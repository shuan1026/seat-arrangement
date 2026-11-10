import { publishUpdateSchema } from '@/contracts/permissions';
import { parseJson, route } from '@/server/http';
import { setSeatsPublished } from '@/server/services/publish';

// PUT /api/publish（{ published: boolean }）→ { published }：開啟或停止發布（PRM-R19）。讀取包含在 GET /api/state
export const dynamic = 'force-dynamic';

export const PUT = route(async ({ req, user }) => {
  const { published } = await parseJson(req, publishUpdateSchema);
  return Response.json({ published: await setSeatsPublished(published, user) });
});
