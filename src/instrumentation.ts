// Next.js 在伺服器啟動、接受請求之前呼叫 register()（每個執行個體一次），只在 Node.js runtime 執行：
// 1. 正式版的 seed 匯入（D-007），只在 SEED_IMPORT=1 時執行。
// 2. 初始編輯者（D-021、PRM-R02）：在 seed 之後，不看 SEED_IMPORT，本機開發也會執行；
//    INITIAL_EDITOR_EMAILS 沒有設定時直接跳過、不碰資料庫（docs/architecture.md 第 7.3 節）。
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.SEED_IMPORT === '1') {
    const { runSeedOnStartup } = await import('./server/seed-startup');
    await runSeedOnStartup();
  }
  const { bootstrapEditorsOnStartup } = await import('./server/editors-startup');
  await bootstrapEditorsOnStartup();
}
