// npm run test:e2e：E2E 分組同時跑，縮短全部測試的時間。
// 1. 先 next build 一次。
// 2. 同時開 E2E_SHARDS 組（預設 3）Playwright，各跑 --shard=i/n；每組用自己的測試資料庫與伺服器埠號，
//    三組共用同一份 build（webServer 只 next start），彼此不干擾。
// 直接執行 `npx playwright test` 時不分組（playwright.config.ts 自己 build 再 start），開發中跑單一檔案用那個。
// E2E_DEV=1 時不分組，改用 next dev（除錯用）。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const extraArgs = process.argv.slice(2);
const basePort = Number(process.env.E2E_PORT || 3100);
const baseDb = process.env.TEST_DATABASE_NAME || 'seat_test';
// 有指定測試檔或篩選條件時預設不分組，避免某一組分不到測試
const shards = Math.max(1, Number(process.env.E2E_SHARDS || (extraArgs.length > 0 ? 1 : 3)));

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

const started = Date.now();
console.log(`E2E：先建置一次，再分 ${shards} 組同時跑`);
const buildCode = await run('npx', ['next', 'build'], { env: { APP_ENV: 'test' }, prefix: '[build] ' });
if (buildCode !== 0) {
  console.error(`next build 失敗（exit ${buildCode}），E2E 沒有執行`);
  process.exit(buildCode);
}

const results = await Promise.all(
  Array.from({ length: shards }, (_, i) => {
    const n = i + 1;
    const env =
      shards === 1
        ? { E2E_SKIP_BUILD: '1' }
        : {
            E2E_SKIP_BUILD: '1',
            E2E_PORT: String(basePort + 100 * n),
            TEST_DATABASE_NAME: `${baseDb}_e${n}`,
            E2E_OUTPUT_DIR: `test-results/shard-${n}`,
            E2E_REPORT_DIR: `playwright-report/shard-${n}`,
          };
    const args = [
      'playwright',
      'test',
      ...(shards > 1 ? [`--shard=${n}/${shards}`, '--pass-with-no-tests'] : []),
      ...extraArgs,
    ];
    return run('npx', args, { env, prefix: shards > 1 ? `[e2e ${n}/${shards}] ` : '' }).then((code) => ({ n, code }));
  }),
);

const seconds = Math.round((Date.now() - started) / 1000);
for (const { n, code } of results) console.log(`第 ${n} 組：${code === 0 ? '通過' : `失敗（exit ${code}）`}`);
console.log(`E2E 共 ${seconds} 秒`);
process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
