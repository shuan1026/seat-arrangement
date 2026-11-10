import { route } from '@/server/http';
import { logInfo } from '@/server/log';
import { exportSeating, XLSX_CONTENT_TYPE } from '@/server/services/export';

// 下載座位表 Excel（docs/spec/export.md；docs/architecture.md 第 8 節）。
// 網址參數一律忽略：檔案內容和頁面的搜尋、篩選、縮放無關（EXP-R02）。
export const dynamic = 'force-dynamic';

export const GET = route(async ({ requestId, user }) => {
  const file = await exportSeating(new Date());
  logInfo({
    eventType: 'export_completed',
    message: 'Seating sheet exported',
    requestId,
    userId: user.id,
    participantCount: file.participantCount,
    bytes: file.bytes.byteLength,
  });
  return new Response(file.bytes, {
    status: 200,
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': file.disposition,
      'Cache-Control': 'no-store',
    },
  });
});
