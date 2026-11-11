import { route } from '@/server/http';
import { getPublishedSeating } from '@/server/services/publish';

// GET /api/seats：發布頁的資料（PRM-R21、PRM-R22、PRM-R27）。只要登入就能呼叫，不看權限名單：
// 編輯者、檢視者與沒有權限的公司帳號拿到的內容相同（D-026）。未發布時只有 { published: false }
export const dynamic = 'force-dynamic';

export const GET = route(async () => Response.json(await getPublishedSeating()), { anyLogin: true });
