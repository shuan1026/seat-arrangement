// npm run test:e2e：E2E 分組同時跑，縮短全部測試的時間。
// 1. 先 next build 一次，再準備 standalone 伺服器一次（scripts/prepare-standalone.mjs，和 Docker 映像相同的檔案配置）。
// 2. 同時開幾組 Playwright，每組用自己的測試資料庫與伺服器埠號，共用同一份 standalone
//    （webServer 只執行 node .next/standalone/server.js，以 PORT 指定埠號），彼此不干擾。
//    預設三組：桌面寬度分兩半、手機寬度一組。手機寬度有很多只在桌面跑的測試會跳過，
//    照測試數平分（--shard）會讓手機那組很快跑完、其他組拖很久，所以先依寬度分。
//    設 E2E_SHARDS=n 改成不分寬度、用 --shard=1/n…n/n 平分；E2E_SHARDS=1 不分組。
// 直接執行 `npx playwright test` 時不分組（playwright.config.ts 自己建置、準備 standalone 再啟動），開發中跑單一檔案用那個。
// E2E_DEV=1 時不分組，改用 next dev（除錯用）。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { prepareStandalone } from './prepare-standalone.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');

const extraArgs = process.argv.slice(2);
const basePort = Number(process.env.E2E_PORT || 3100);
const baseDb = process.env.TEST_DATABASE_NAME || 'seat_test';

/** 每組的名稱與傳給 playwright test 的參數 */
function groupsToRun() {
  // 有指定測試檔或篩選條件時預設不分組，避免某一組分不到測試
  const requested = process.env.E2E_SHARDS ?? (extraArgs.length > 0 ? '1' : '');
  if (requested === '') {
    return [
      { name: '桌面 1/2', args: ['--project=desktop', '--shard=1/2'] },
      { name: '桌面 2/2', args: ['--project=desktop', '--shard=2/2'] },
      { name: '手機 320', args: ['--project=mobile-320'] },
    ];
  }
  const n = Math.max(1, Number(requested) || 1);
  if (n === 1) return [{ name: '全部', args: [] }];
  return Array.from({ length: n }, (_, i) => ({ name: `${i + 1}/${n}`, args: [`--shard=${i + 1}/${n}`] }));
}

function run(command, args, { env = {}, prefix = '' } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const pipe = (from, to) => {
      let rest = '';
      from.on('data', (chunk) => {
        const lines = (rest + chunk.toString()).split('\n');
        rest = lines.pop() ?? '';
        for (const line of lines) to.write(`${prefix}${line}\n`);
      });
      from.on('end', () => rest && to.write(`${prefix}${rest}\n`));
    };
    pipe(child.stdout, process.stdout);
    pipe(child.stderr, process.stderr);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

if (process.env.E2E_DEV === '1') {
  process.exit(await run('npx', ['playwright', 'test', ...extraArgs]));
}

const groups = groupsToRun();
const started = Date.now();
console.log(`E2E：先建置一次，再分 ${groups.length} 組同時跑`);
const buildCode = await run('npx', ['next', 'build'], { env: { APP_ENV: 'test' }, prefix: '[build] ' });
if (buildCode !== 0) {
  console.error(`next build 失敗（exit ${buildCode}），E2E 沒有執行`);
  process.exit(buildCode);
}
try {
  prepareStandalone();
} catch (error) {
  console.error(`準備 standalone 伺服器失敗，E2E 沒有執行：${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const single = groups.length === 1;
const results = await Promise.all(
  groups.map((group, i) => {
    const n = i + 1;
    const env = single
      ? { E2E_SKIP_BUILD: '1' }
      : {
          E2E_SKIP_BUILD: '1',
          E2E_PORT: String(basePort + 100 * n),
          TEST_DATABASE_NAME: `${baseDb}_e${n}`,
          E2E_OUTPUT_DIR: `test-results/shard-${n}`,
          E2E_REPORT_DIR: `playwright-report/shard-${n}`,
        };
    const args = ['playwright', 'test', ...group.args, ...(single ? [] : ['--pass-with-no-tests']), ...extraArgs];
    return run('npx', args, { env, prefix: single ? '' : `[e2e ${group.name}] ` }).then((code) => ({ group, code }));
  }),
);

const seconds = Math.round((Date.now() - started) / 1000);
for (const { group, code } of results) console.log(`${group.name}：${code === 0 ? '通過' : `失敗（exit ${code}）`}`);
console.log(`E2E 共 ${seconds} 秒`);
process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
