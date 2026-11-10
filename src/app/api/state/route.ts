import { route } from '@/server/http';
import { loadState } from '@/server/services/state';

// 全部員工、參與人員與桌次；重新整理或發生衝突後重新載入用（docs/architecture.md 第 8 節）
export const dynamic = 'force-dynamic';

export const GET = route(async () => Response.json(await loadState()));
