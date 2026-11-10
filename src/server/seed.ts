import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from './db';
import { logInfo, logWarning } from './log';

// 正式版用 seed 匯入真實名單（D-007、docs/architecture.md 第 7.3 節）。
// 伺服器啟動時由 src/instrumentation.ts 呼叫，在接受請求之前完成；失敗就結束程序，不啟動服務。
// 只在 SEED_IMPORT=1（Dockerfile 設定）時執行，本機開發與測試不會匯入真實資料。

// turbopackIgnore：資料檔在執行期才讀，不要讓建置把整個專案目錄追蹤進 standalone 產物
export const SEED_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), 'prisma', 'seed-data');
export const SEED_FILES = { roster: 'roster.csv', registrations: 'registrations.csv' } as const;
const LOCK_NAME = 'seed-import';

export type SeedSummary = { employees: number; participants: number; dependents: number; unmatched: number };

export type SeedResult =
  | { status: 'disabled' }
  | { status: 'skipped'; reason: 'no_files' | 'has_data' | 'not_implemented' }
  | ({ status: 'imported' } & SeedSummary);

/**
 * 匯入兩份資料檔；實作在階段 3（roster-import.ts、registration-import.ts）。
 * 寫入要用 seedDb()，才會和取得鎖、檢查筆數在同一個交易內：任何錯誤就整批不寫入。
 */
export type SeedImporter = (files: { roster: string; registrations: string }) => Promise<SeedSummary>;

let importer: SeedImporter | null = null;
/** 階段 3 接上真正的匯入程式 */
export const registerSeedImporter = (fn: SeedImporter) => {
  importer = fn;
};

const seedTx = new AsyncLocalStorage<Prisma.TransactionClient>();

/** 匯入程式寫資料用的連線：在 runSeed 裡是那個交易，其他時候是一般連線 */
export const seedDb = (): Prisma.TransactionClient => seedTx.getStore() ?? prisma;

export async function runSeed(env: NodeJS.ProcessEnv = process.env, dir: string = SEED_DIR): Promise<SeedResult> {
  if (env.SEED_IMPORT !== '1') return { status: 'disabled' };
  const roster = path.join(/* turbopackIgnore: true */ dir, SEED_FILES.roster);
  const registrations = path.join(/* turbopackIgnore: true */ dir, SEED_FILES.registrations);
  if (!existsSync(/* turbopackIgnore: true */ roster) || !existsSync(/* turbopackIgnore: true */ registrations)) {
    logInfo({ eventType: 'seed_skipped', message: 'seed 資料檔不存在，跳過匯入', reason: 'no_files' });
    return { status: 'skipped', reason: 'no_files' };
  }

  // 同一條連線取得鎖、檢查、匯入、釋放鎖：多個執行個體同時啟動也只會匯入一次
  return prisma.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<{ got: bigint | number | null }[]>`SELECT GET_LOCK(${LOCK_NAME}, 60) AS got`;
      if (Number(lock?.got) !== 1) throw new Error('無法取得 seed 匯入鎖');
      try {
        const count = await tx.employee.count();
        if (count > 0) {
          logInfo({ eventType: 'seed_skipped', message: '員工名單已有資料，跳過匯入', reason: 'has_data' });
          return { status: 'skipped', reason: 'has_data' } as const;
        }
        if (!importer) {
          logWarning({ eventType: 'seed_skipped', message: 'seed 匯入程式尚未實作，跳過匯入', reason: 'not_implemented' });
          return { status: 'skipped', reason: 'not_implemented' } as const;
        }
        const run = importer;
        const summary = await seedTx.run(tx, () => run({ roster, registrations }));
        logInfo({ eventType: 'seed_imported', message: 'seed 匯入完成', ...summary });
        return { status: 'imported', ...summary } as const;
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK(${LOCK_NAME})`;
      }
    },
    { timeout: 120_000, maxWait: 60_000 },
  );
}
