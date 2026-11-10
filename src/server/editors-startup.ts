import 'server-only';
import { logError } from './log';
import { bootstrapEditors } from './services/editors';

// 伺服器啟動時寫入第一位編輯者（PRM-R02；docs/architecture.md 第 7.3 節）：失敗就結束程序，和 seed 相同，
// 平台會把這次部署標成失敗。INITIAL_EDITOR_EMAILS 沒有設定時 bootstrapEditors 直接跳過，不碰資料庫。
// 只由 src/instrumentation.ts 在 Node.js runtime 動態載入，Edge 版本不會包含 process.exit。
export async function bootstrapEditorsOnStartup(): Promise<void> {
  try {
    await bootstrapEditors();
  } catch (err) {
    logError({ eventType: 'editors_bootstrap_failed', message: err instanceof Error ? err.message : '初始編輯者寫入失敗' });
    process.exit(1);
  }
}
