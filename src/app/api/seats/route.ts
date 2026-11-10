import { route } from '@/server/http';
import { getPublishedSeating } from '@/server/services/publish';

// GET /api/seats：發布頁的資料（PRM-R21、PRM-R22、PRM-R27）。要登入，編輯者與只能檢視的人拿到的內容相同；
// 未發布時只有 { published: false }
export const dynamic = 'force-dynamic';

export const GET = route(async () => Response.json(await getPublishedSeating()));
