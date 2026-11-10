import 'server-only';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@/generated/prisma/client';
import { databaseConfigFromEnv } from './database-config';

export function createPrisma(databaseOverride?: string): PrismaClient {
  const cfg = databaseConfigFromEnv(process.env, databaseOverride);
  const adapter = new PrismaMariaDb({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    connectionLimit: cfg.connectionLimit,
    // 平台規格：開 SSL、不驗證憑證（私有網段內）
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
    // MySQL 8.4 預設 caching_sha2_password；沒有 SSL 時要允許取得公鑰
    allowPublicKeyRetrieval: !cfg.ssl,
  });
  return new PrismaClient({ adapter });
}

// 第一次使用時才建立連線：next build 會載入這個模組，但建置階段沒有資料庫環境變數。
// 開發模式熱重載時重用同一個 client，避免連線越開越多（平台限制同時 10 條連線）。
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createPrisma();
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === 'function' ? value.bind(c) : value;
  },
});
