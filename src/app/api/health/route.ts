// 健康檢查：平台用來確認服務已啟動。不需登入，不連資料庫，避免冷啟動時被判定失敗（docs/architecture.md 第 8 節）。
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok' });
}
