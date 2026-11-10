// 資料庫連線設定：由平台提供的 DATABASE_* 環境變數組成（docs/architecture.md 第 2、14 節）。
// prisma.config.ts（migration）與 src/server/db.ts（執行期）共用這一份，避免兩邊不一致。
// 這個檔案不能引用 Next.js 或 Prisma Client，prisma.config.ts 會在 Node 直接載入它。

export type DatabaseConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** 平台要求 SSL、不驗證憑證；本機 MySQL 8.4 也有自簽憑證，所以預設開啟 */
  ssl: boolean;
  connectionLimit: number;
};

const required = (env: NodeJS.ProcessEnv, key: string): string => {
  const v = env[key];
  if (v === undefined || v === '') throw new Error(`缺少環境變數 ${key}`);
  return v;
};

const flag = (v: string | undefined, fallback: boolean) =>
  v === undefined || v === '' ? fallback : !['false', '0', 'no', 'off'].includes(v.toLowerCase());

/** 讀取資料庫設定。`databaseOverride` 用來讓測試改連自己的測試資料庫。 */
export function databaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env, databaseOverride?: string): DatabaseConfig {
  const port = Number(env.DATABASE_PORT || 3306);
  const limit = Number(env.DATABASE_CONNECTION_LIMIT || 3);
  if (!Number.isInteger(port) || port <= 0) throw new Error('DATABASE_PORT 必須是正整數');
  if (!Number.isInteger(limit) || limit <= 0) throw new Error('DATABASE_CONNECTION_LIMIT 必須是正整數');
  return {
    host: required(env, 'DATABASE_HOST'),
    port,
    user: required(env, 'DATABASE_USER'),
    password: env.DATABASE_PASSWORD ?? '',
    database: databaseOverride || required(env, 'DATABASE_NAME'),
    ssl: flag(env.DATABASE_SSL, true),
    connectionLimit: limit,
  };
}

/** migration 用的連線字串；密碼做 URL 編碼。 */
export function databaseUrl(cfg: DatabaseConfig): string {
  const auth = `${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password)}`;
  const query = cfg.ssl ? '?sslaccept=accept_invalid_certs' : '';
  return `mysql://${auth}@${cfg.host}:${cfg.port}/${encodeURIComponent(cfg.database)}${query}`;
}
