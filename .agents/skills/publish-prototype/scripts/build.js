// 產生線上原型的發佈版本，只用 Node 內建模組。
// 用法：
//   node build.js                         產生 .build/site，列出和上次發佈的差異
//   node build.js --record <版本>          發佈成功後記錄版本與內容，並清掉 .build
//   node build.js --baseline <目錄> <版本>  以下載的線上檔案作為比對基準
//   node build.js --clean                 清掉 .build
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const skillDir = path.resolve(__dirname, '..');
const root = path.resolve(skillDir, '..', '..', '..');
const htmlDir = path.join(root, 'ui-design-system', 'source-reference', 'html');
const tokensFile = path.join(root, 'ui-design-system', 'token-gallery', 'data', 'tokens.css');
const specFile = path.join(root, 'docs', 'product-spec.md');
const buildDir = path.join(skillDir, '.build');
const siteDir = path.join(buildDir, 'site');
const manifestFile = path.join(buildDir, 'manifest.json');
const publishedFile = path.join(skillDir, 'published.json');

// 平台會替 index.html 包上文件外框，所以這裡只有內容片段。開啟連結後直接導向主頁。
const INDEX = `<title>Seat Arrangement 原型</title>
<style>
  /* 單一淺色外觀，色值對應設計系統的多彩活力 */
  :root { --bg: #FFFFFF; --fg: #1F2430; color-scheme: light; }
  body { background: var(--bg); color: var(--fg); padding-block: 32px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  a { color: inherit; }
</style>
<p><a href="seating.html">開啟 Seat Arrangement 原型</a></p>
<script>location.replace('seating.html');</script>
`;

const fail = (message, details = []) => {
  console.error(JSON.stringify({ ok: false, error: message, details }, null, 2));
  process.exit(1);
};
const clean = () => fs.rmSync(buildDir, { recursive: true, force: true });
const describe = data => ({
  sha256: crypto.createHash('sha256').update(data).digest('hex'),
  bytes: Buffer.byteLength(data),
});
const sorted = obj => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
const readPublished = () => (fs.existsSync(publishedFile) ? JSON.parse(fs.readFileSync(publishedFile, 'utf8')) : null);
const writePublished = (version, files) => {
  const body = { version, recordedAt: new Date().toLocaleDateString('sv'), files: sorted(files) };
  fs.writeFileSync(publishedFile, `${JSON.stringify(body, null, 2)}\n`);
};
const toUrlPath = p => p.split(path.sep).join('/');

const rewriteHtml = text =>
  text
    .replaceAll('../../token-gallery/data/tokens.css', 'shared/tokens.css')
    .replace(/\b(src|href)="prototype\//g, '$1="shared/');

// 檢查每個引用都找得到，路徑轉換出錯時才不會發佈壞掉的頁面。
const checkReferences = files => {
  const errors = [];
  for (const [name, data] of Object.entries(files)) {
    const text = data.toString('utf8');
    if (name.endsWith('.html')) {
      if (/\b(?:src|href)="prototype\//.test(text) || text.includes('token-gallery/')) {
        errors.push(`${name}: 還有未轉換的路徑`);
      }
      for (const [, raw] of text.matchAll(/\b(?:src|href)="([^"]*)"/g)) {
        const target = raw.split(/[?#]/)[0];
        if (!target || target.includes('${') || /^[a-z]+:/i.test(target) || target.startsWith('//')) continue;
        if (target.startsWith('/') || target.startsWith('../')) errors.push(`${name}: 引用了發佈範圍外的路徑 ${raw}`);
        else if (!(target in files)) errors.push(`${name}: 找不到 ${raw}`);
      }
    }
    if (name.endsWith('.html') || name.endsWith('.js')) {
      for (const [, target] of text.matchAll(/['"`]([a-z][a-z0-9-]*\.html)/g)) {
        if (!(target in files)) errors.push(`${name}: 找不到頁面 ${target}`);
      }
    }
  }
  return [...new Set(errors)];
};

const collect = () => {
  if (!fs.existsSync(htmlDir)) fail(`找不到原型目錄 ${htmlDir}`);
  if (!fs.existsSync(tokensFile)) fail(`找不到 ${tokensFile}`);
  const files = { 'index.html': Buffer.from(INDEX) };
  const skipped = [];
  for (const entry of fs.readdirSync(htmlDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== 'prototype') skipped.push(`${entry.name}/`);
    } else if (entry.name.endsWith('.html')) {
      if (entry.name === 'index.html') fail('原型目錄不能有 index.html，發佈版本會產生自己的入口');
      files[entry.name] = Buffer.from(rewriteHtml(fs.readFileSync(path.join(htmlDir, entry.name), 'utf8')));
    } else {
      skipped.push(entry.name);
    }
  }
  const sharedDir = path.join(htmlDir, 'prototype');
  for (const entry of fs.readdirSync(sharedDir, { withFileTypes: true })) {
    if (entry.isFile() && /\.(js|css)$/.test(entry.name)) {
      files[`shared/${entry.name}`] = fs.readFileSync(path.join(sharedDir, entry.name));
    } else {
      skipped.push(`prototype/${entry.name}`);
    }
  }
  files['shared/tokens.css'] = fs.readFileSync(tokensFile);
  return { files, skipped };
};

const build = () => {
  clean();
  const { files, skipped } = collect();
  const errors = checkReferences(files);
  if (errors.length) fail('發佈版本有錯誤，沒有產生檔案', errors);

  const manifest = {};
  for (const [name, data] of Object.entries(files)) {
    const target = path.join(siteDir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    manifest[name] = describe(data);
  }
  fs.writeFileSync(manifestFile, `${JSON.stringify({ files: sorted(manifest) }, null, 2)}\n`);

  // 本機檢查用，不在 manifest 裡，所以不會進 publishFiles。
  const pages = Object.keys(files).filter(n => n.endsWith('.html') && n !== 'index.html').sort();
  const checker = fs.readFileSync(path.join(__dirname, 'check-pages.js'), 'utf8');
  fs.writeFileSync(path.join(siteDir, '__check.js'), `const PAGES = ${JSON.stringify(pages)};\n${checker}`);

  const published = readPublished();
  const before = published ? published.files : {};
  const names = Object.keys(manifest).sort();
  const changed = names.filter(n => before[n] && before[n].sha256 !== manifest[n].sha256);
  const added = names.filter(n => !before[n]);
  const removed = Object.keys(before).filter(n => !manifest[n]).sort();
  // index.html 是發佈時的 file_path，不放進 files。
  const publishFiles = {};
  for (const n of [...changed, ...added]) if (n !== 'index.html') publishFiles[n] = n;
  for (const n of removed) publishFiles[n] = null;

  let specVersion = null;
  if (fs.existsSync(specFile)) {
    const match = fs.readFileSync(specFile, 'utf8').match(/^\|\s*版本\s*\|\s*(v[\d.]+)\s*\|/m);
    if (match) specVersion = match[1];
  }

  console.log(JSON.stringify({
    ok: true,
    site: toUrlPath(path.relative(root, siteDir)),
    fileCount: names.length,
    specVersion,
    lastVersion: published ? published.version : null,
    changed,
    added,
    removed,
    unchanged: names.length - changed.length - added.length,
    skipped,
    publishFiles,
  }, null, 2));
};

const record = version => {
  if (!version) fail('請提供發佈後的版本');
  if (!fs.existsSync(manifestFile)) fail('找不到這次的發佈版本，請先執行 build.js');
  writePublished(version, JSON.parse(fs.readFileSync(manifestFile, 'utf8')).files);
  clean();
  console.log(JSON.stringify({ ok: true, recorded: version }));
};

const baseline = (dir, version) => {
  if (!dir || !version) fail('用法：--baseline <目錄> <版本>');
  const base = path.resolve(dir);
  if (!fs.existsSync(path.join(base, 'seating.html'))) fail(`${base} 裡沒有線上版的 seating.html`);
  // 平台存的 index.html 帶有外框，無法直接比對，所以用這裡產生的內容當基準。
  const files = { 'index.html': describe(Buffer.from(INDEX)) };
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const name = toUrlPath(path.relative(base, full));
        if (name !== 'index.html') files[name] = describe(fs.readFileSync(full));
      }
    }
  };
  walk(base);
  writePublished(version, files);
  console.log(JSON.stringify({ ok: true, baseline: version, fileCount: Object.keys(files).length }));
};

const [command, ...args] = process.argv.slice(2);
if (!command) build();
else if (command === '--record') record(args[0]);
else if (command === '--baseline') baseline(args[0], args[1]);
else if (command === '--clean') {
  clean();
  console.log(JSON.stringify({ ok: true, cleaned: true }));
} else fail(`不認識的參數 ${command}`);
