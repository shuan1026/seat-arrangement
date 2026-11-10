import 'server-only';
import { logError } from './log';
import { registerSeedImporter, runSeed } from './seed';
import { importSeedFiles } from './seed-import';

// 伺服器啟動時執行 seed（D-007）：失敗就結束程序，平台會把這次部署標成失敗。
// 只由 src/instrumentation.ts 在 Node.js runtime 動態載入，Edge 版本不會包含 process.exit。
export async function runSeedOnStartup(): Promise<void> {
  try {
    registerSeedImporter(importSeedFiles);
    await runSeed();
  } catch (err) {
    logError({ eventType: 'seed_failed', message: err instanceof Error ? err.message : 'seed 匯入失敗' });
    process.exit(1);
  }
}
