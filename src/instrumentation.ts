// Next.js 在伺服器啟動、接受請求之前呼叫 register()（每個執行個體一次）。
// 用來執行正式版的 seed 匯入（D-007）；只在 Node.js runtime 而且 SEED_IMPORT=1 時執行。
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.SEED_IMPORT !== '1') return;
  const { runSeedOnStartup } = await import('./server/seed-startup');
  await runSeedOnStartup();
}
