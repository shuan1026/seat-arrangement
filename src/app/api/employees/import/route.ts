import { readUploadedCsv } from '@/server/csv';
import { route } from '@/server/http';
import { importRoster } from '@/server/services/employees';

// POST /api/employees/import：上傳通訊錄 CSV（multipart，欄位 file），建立或更新員工（EMP-R44～R62）→ ImportResult
export const POST = route(async ({ req }) => Response.json(await importRoster(await readUploadedCsv(req))));
