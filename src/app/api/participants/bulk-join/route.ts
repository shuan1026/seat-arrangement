import { bulkJoinSchema } from '@/contracts/participants';
import { parseJson, route } from '@/server/http';
import { bulkJoin } from '@/server/services/participants';

// POST /api/participants/bulk-join：員工名單勾選多位一次加入尾牙（只加員工本人，未入座）
export const POST = route(async ({ req }) => Response.json(await bulkJoin(await parseJson(req, bulkJoinSchema))));
