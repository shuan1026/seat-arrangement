import { participantCreateSchema } from '@/contracts/participants';
import { parseJson, route } from '@/server/http';
import { createParticipant } from '@/server/services/participants';

// POST /api/participants：新增參與人員（員工加入尾牙，可同時加一位眷屬；眷屬；外部貴賓）
export const POST = route(async ({ req }) => Response.json(await createParticipant(await parseJson(req, participantCreateSchema))));
