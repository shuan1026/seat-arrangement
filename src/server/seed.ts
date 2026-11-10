import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from './db';
import { logInfo, logWarning } from './log';

// 正式版用 seed 匯入真實名單（D-007、D-015、docs/architecture.md 第 7.3 節）。
// 伺服器啟動時由 src/instrumentation.ts 呼叫，在接受請求之前完成；失敗就結束程序，不啟動服務。
// 只在 SEED_IMPORT=1（Dockerfile 設定）時執行，本機開發與測試不會匯入真實資料。

// turbopackIgnore：資料檔在執行期才讀，不要讓建置把整個專案目錄追蹤進 standalone 產物
export const SEED_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), 'prisma', 'seed-data');
/** roster、registrations 必要；staff、tables 可選（D-015） */
export const SEED_FILES = {
  roster: 'roster.csv',
  registrations: 'registrations.csv',
  staff: 'staff.csv',
  tables: 'tables.csv',
} as const;

export type SeedSummary = {
  /** 新增的員工人數 */
  employees: number;
  /** 報名的員工人數（不含眷屬） */
  participants: number;
  /** 眷屬人數 */
  dependents: number;
  /** 報名表中對不到員工名單的人數 */
  unmatched: number;
  /** 放進工作人員桌的人數 */
  staff: number;
  /** staff.csv 略過的列數（完全空白的列不算） */
  staffSkipped: number;
  /** 寫入備註名稱的桌數 */
  tableNotes: number;
  /** tables.csv 略過的列數（完全空白的列不算） */
  tableNotesSkipped: number;
};

export type SeedResult =
  | { status: 'disabled' }
  | { status: 'skipped'; reason: 'no_files' | 'has_data' | 'not_implemented' }
  | ({ status: 'imported' } & SeedSummary);

/** 資料檔的完整路徑；staff、tables 只在檔案存在時才有 */
export type SeedFilePaths = { roster: string; registrations: string; staff?: string; tables?: string };

/**
 * 匯入資料檔；實作在 seed-import.ts，由 seed-startup.ts 登記。
 * 寫入要用 seedDb()，才會和鎖、檢查筆數在同一個交易內：任何錯誤就整批不寫入。
 */
export type SeedImporter = (files: SeedFilePaths) => Promise<SeedSummary>;

let importer: SeedImporter | null = null;
/** 伺服器啟動流程接上真正的匯入程式（seed-startup.ts） */
export const registerSeedImporter = (fn: SeedImporter) => {
  importer = fn;
};

const seedTx = new AsyncLocalStorage<Prisma.TransactionClient>();

/** 匯入程式寫資料用的連線：在 runSeed 裡是那個交易，其他時候是一般連線 */
export const seedDb = (): Prisma.TransactionClient => seedTx.getStore() ?? prisma;

export async function runSeed(env: NodeJS.ProcessEnv = process.env, dir: string = SEED_DIR): Promise<SeedResult> {
  if (env.SEED_IMPORT !== '1') return { status: 'disabled' };
  const pathOf = (key: keyof typeof SEED_FILES) => path.join(/* turbopackIgnore: true */ dir, SEED_FILES[key]);
  const exists = (file: string) => existsSync(/* turbopackIgnore: true */ file);

  const files: SeedFilePaths = { roster: pathOf('roster'), registrations: pathOf('registrations') };
  if (!exists(files.roster) || !exists(files.registrations)) {
    logInfo({ eventType: 'seed_skipped', message: 'seed 資料檔不存在，跳過匯入', reason: 'no_files' });
    return { status: 'skipped', reason: 'no_files' };
  }
  // 可選的資料檔：存在才交給匯入程式（D-015）
  for (const key of ['staff', 'tables'] as const) {
    if (exists(pathOf(key))) files[key] = pathOf(key);
  }

  const started = Date.now();
  // 鎖、檢查、匯入在同一個 READ COMMITTED 交易內（D-007、docs/architecture.md 第 7.2、7.3 節）：
  // 一開始鎖住工作人員桌那一列，鎖到 commit 或 rollback 才放開。多個執行個體同時啟動時，後面的會在這裡等前面的
  // commit，之後才檢查員工表；READ COMMITTED 讓它讀得到前面剛提交的員工，看到已有資料就跳過，不會重複匯入。
  // 等鎖的上限是 MySQL 的 innodb_lock_wait_timeout（預設 50 秒），超過就丟錯、seed 失敗。
  return prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM SeatTable WHERE id = ${STAFF_TABLE_ID} FOR UPDATE`;
      if (locked.length === 0) throw new Error('找不到工作人員桌，無法鎖住 seed 匯入');

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
      const summary = await seedTx.run(tx, () => run(files));
      // 摘要只有筆數，不記姓名、分機、email 與 CSV 內容（docs/architecture.md 第 15.2 節）
      logInfo({ eventType: 'seed_imported', message: 'seed 匯入完成', ...summary, durationMs: Date.now() - started });
      return { status: 'imported', ...summary } as const;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 120_000, maxWait: 60_000 },
  );
}
