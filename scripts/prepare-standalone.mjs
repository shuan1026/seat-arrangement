// E2E 用和 Docker 映像相同的方式啟動伺服器：node .next/standalone/server.js（Dockerfile 的 runner stage、docker-entrypoint.sh）。
// next build 產生的 .next/standalone 不含靜態檔，照 Dockerfile 把 .next/static 與 public 複製進去。
// 另外刪掉 next build 複製進去的 .env：容器裡沒有 .env（.dockerignore），伺服器只用啟動時傳入的環境變數；
// E2E 的環境變數由 playwright.config.ts 的 webServer 傳入。
// 每次 next build 會先清空 .next/standalone，所以建置後要重新執行一次；分組同時跑時各組共用這一份。
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STANDALONE_DIR = '.next/standalone';
const STANDALONE_SERVER = `${STANDALONE_DIR}/server.js`;

export function prepareStandalone() {
  if (!existsSync(STANDALONE_SERVER)) {
    throw new Error(`找不到 ${STANDALONE_SERVER}：先執行 next build（next.config.ts 要設定 output: 'standalone'）`);
  }
  for (const [from, to] of [
    ['.next/static', `${STANDALONE_DIR}/.next/static`],
    ['public', `${STANDALONE_DIR}/public`],
  ]) {
    rmSync(to, { recursive: true, force: true });
    if (existsSync(from)) cpSync(from, to, { recursive: true });
  }
  for (const envFile of ['.env', '.env.production']) rmSync(`${STANDALONE_DIR}/${envFile}`, { force: true });
}

// 直接執行（playwright.config.ts 的 webServer 自己建置時）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    prepareStandalone();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
