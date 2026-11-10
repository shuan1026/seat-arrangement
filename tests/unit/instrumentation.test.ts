// @vitest-environment node
// 伺服器啟動時寫入初始編輯者：docs/architecture.md 第 7.3 節（src/instrumentation.ts 在 seed 之後呼叫 server/services/editors.ts 的 bootstrap；
// 這一步不看 SEED_IMPORT，本機開發也會執行；寫入失敗就結束程序，和 seed 相同）；docs/spec/permissions.md PRM-R02；D-021。
// bootstrap 本身（名單是空的才寫入、略過非公司網域）在 tests/integration/server/editors-bootstrap.test.ts。
//
// 假設：register() 在 Node.js runtime 動態載入 src/server/services/editors.ts 並呼叫 bootstrapEditors()（可以經過一個像 seed-startup.ts 的
// 小模組，失敗時記 Log 並 process.exit(1)）；SEED_IMPORT=1 時先執行 src/server/seed-startup.ts 的 runSeedOnStartup()。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { bootstrapEditors, runSeedOnStartup } = vi.hoisted(() => ({
  bootstrapEditors: vi.fn<() => Promise<unknown>>(async () => ({})),
  runSeedOnStartup: vi.fn<() => Promise<void>>(async () => {}),
}));
vi.mock('@/server/services/editors', () => ({ bootstrapEditors, isEditor: vi.fn(async () => false) }));
vi.mock('@/server/seed-startup', () => ({ runSeedOnStartup }));

const ORIGINAL = { runtime: process.env.NEXT_RUNTIME, seed: process.env.SEED_IMPORT };

async function register(env: { runtime?: string; seed?: string }) {
  if (env.runtime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = env.runtime;
  if (env.seed === undefined) delete process.env.SEED_IMPORT;
  else process.env.SEED_IMPORT = env.seed;
  const mod = await import('@/instrumentation');
  await mod.register();
}

beforeEach(() => {
  bootstrapEditors.mockReset();
  bootstrapEditors.mockResolvedValue({});
  runSeedOnStartup.mockReset();
  runSeedOnStartup.mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL.runtime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = ORIGINAL.runtime;
  if (ORIGINAL.seed === undefined) delete process.env.SEED_IMPORT;
  else process.env.SEED_IMPORT = ORIGINAL.seed;
});

describe('register()：初始編輯者（PRM-R02）', () => {
  it('Node.js runtime、沒有設定 SEED_IMPORT（本機開發）→ 仍寫入初始編輯者，不執行 seed', async () => {
    await register({ runtime: 'nodejs' });
    expect(bootstrapEditors).toHaveBeenCalledTimes(1);
    expect(runSeedOnStartup).not.toHaveBeenCalled();
  });

  it('SEED_IMPORT=1 → 先執行 seed，再寫入初始編輯者', async () => {
    await register({ runtime: 'nodejs', seed: '1' });
    expect(runSeedOnStartup).toHaveBeenCalledTimes(1);
    expect(bootstrapEditors).toHaveBeenCalledTimes(1);
    expect(runSeedOnStartup.mock.invocationCallOrder[0]).toBeLessThan(bootstrapEditors.mock.invocationCallOrder[0] ?? 0);
  });

  it('Edge runtime → 不執行', async () => {
    await register({ runtime: 'edge', seed: '1' });
    expect(bootstrapEditors).not.toHaveBeenCalled();
    expect(runSeedOnStartup).not.toHaveBeenCalled();
  });

  it('寫入失敗 → 結束程序（process.exit(1)），不接受請求', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    bootstrapEditors.mockRejectedValue(new Error('資料庫無法連線'));
    await register({ runtime: 'nodejs' }).catch(() => {});
    expect(exit).toHaveBeenCalledWith(1);
  });
});
