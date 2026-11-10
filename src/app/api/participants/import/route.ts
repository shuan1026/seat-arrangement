import { readUploadedCsv } from '@/server/csv';
import { route } from '@/server/http';
import { logInfo } from '@/server/log';
import { importRegistrations } from '@/server/services/participants';

// POST /api/participants/import：上傳 Google 表單尾牙報名表的原始 CSV（multipart，欄位 file；D-010）
export const POST = route(async ({ req, requestId, user }) => {
  const result = await importRegistrations(await readUploadedCsv(req));
  // 只記筆數，不記姓名與檔案內容（docs/architecture.md 第 15.2 節）
  logInfo({
    eventType: 'participants_import_completed',
    message: 'participants imported from registration form',
    requestId,
    userId: user.id,
    created: result.created,
    updated: result.updated,
    issues: result.errors.length,
  });
  return Response.json(result);
});
