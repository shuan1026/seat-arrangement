// 比對 docs/product-spec.md 和 HTML 原型，只印出有問題的地方。只讀檔，不改任何檔案。
// 用法：node .agents/skills/sync-prototype/scripts/compare.js <範圍...>
// 範圍：Q8、7.2.1（章節）、7.2（功能區）、leads.html（頁面）、all（全站，不印規則）
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '../../../..');
const htmlDir = path.join(repo, 'ui-design-system/source-reference/html');
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const specLines = read(path.join(repo, 'docs/product-spec.md')).split('\n');
const pages = fs.readdirSync(htmlDir).filter(f => f.endsWith('.html'));
const sharedJs = ['shell.js', 'ui.js', 'core.js', 'data.js'].map(f => `prototype/${f}`);
const source = Object.fromEntries(
  [...pages, ...sharedJs].map(f => [f, read(path.join(htmlDir, f))]),
);

const squeeze = s => s.replace(/&nbsp;/g, ' ').replace(/\s+/g, '');
const dropTags = s => s.replace(/<[^>]+>/g, '');
const cjkCount = s => (s.match(/[㐀-鿿]/g) || []).length;
const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
const isTableRow = line => line.trimStart().startsWith('|');
const isTableRule = line => /^\s*\|[\s:|-]+\|\s*$/.test(line);

// ---- 規格結構
const headings = [];
specLines.forEach((line, i) => {
  const m = line.match(/^(#{2,4})\s+(.*)$/);
  if (!m) return;
  const id = m[2].match(/^(\d+(?:\.\d+)*)\s+(.*)$/);
  headings.push({ level: m[1].length, id: id ? id[1] : null, title: id ? id[2] : m[2], start: i });
});
headings.forEach((h, i) => {
  const next = headings.slice(i + 1).find(n => n.level <= h.level);
  h.end = next ? next.start : specLines.length;
});
const sections = headings.filter(h => h.id);
const leaves = list => list.filter(s => !sections.some(o => o.id.startsWith(`${s.id}.`)));

const pagesBySection = {};
specLines.forEach(line => {
  const file = line.match(/`([a-z-]+\.html)`/);
  if (!file || !isTableRow(line)) return;
  const id = cells(line).pop();
  if (/^\d+(\.\d+)+$/.test(id)) (pagesBySection[id] = pagesBySection[id] || []).push(file[1]);
});

// ---- 範圍
const args = process.argv.slice(2);
if (!args.length) {
  console.error('用法：node compare.js <Q8|7.2.1|7.2|leads.html|all> ...');
  process.exit(1);
}
const whole = args.includes('all');
const questionIds = args.filter(a => /^Q\d+$/i.test(a)).map(a => a.toUpperCase());
const sectionArgs = args.filter(a => /^\d+(\.\d+)*$/.test(a));
const fileArgs = args.filter(a => a.endsWith('.html'));
const known = a => a === 'all' || /^Q\d+$/i.test(a) || sections.some(s => s.id === a) || pages.includes(a);
const inScope = s =>
  sectionArgs.some(a => s.id === a || s.id.startsWith(`${a}.`)) ||
  fileArgs.some(f => (pagesBySection[s.id] || []).includes(f));
const scope = leaves(sections.filter(s => (whole ? s.id.startsWith('7.') : inScope(s))));

const out = [];
const heading = text => out.push('', `## ${text}`);

// ---- 確認事項
const specQ = {};
specLines.forEach((line, i) => {
  const m = line.match(/^\|\s*(Q\d+)\s*\|/);
  if (!m) return;
  const c = cells(line);
  specQ[m[1]] = { question: c[1], assumption: c[2], line: i + 1 };
});
const protoQ = {};
const protoQPattern = /^\s*(Q\d+):\s*\[\s*(['"`])((?:\\.|(?!\2).)*)\2\s*,\s*(['"`])((?:\\.|(?!\4).)*)\4/gm;
for (const m of source['prototype/data.js'].matchAll(protoQPattern)) {
  protoQ[m[1]] = { question: m[3].replace(/\\(.)/g, '$1'), assumption: m[5].replace(/\\(.)/g, '$1') };
}
const pins = {};
for (const [file, text] of Object.entries(source)) {
  if (file === 'prototype/data.js') continue;
  for (const m of text.matchAll(/['"`](Q\d+)['"`]/g)) (pins[m[1]] = pins[m[1]] || new Set()).add(file);
}
const issues = [];
for (const id of whole ? Object.keys({ ...specQ, ...protoQ }) : questionIds) {
  const s = specQ[id];
  const p = protoQ[id];
  const where = pins[id] ? [...pins[id]].join('、') : '沒有確認點';
  if (!s) {
    issues.push(`${id}：規格沒有這題，原型有（確認點：${where}）`);
  } else if (!p) {
    issues.push(`${id}：原型沒有這題（規格第 ${s.line} 行）\n  題目：${s.question}\n  目前假設：${s.assumption}`);
  } else {
    if (s.question !== p.question) issues.push(`${id}：題目不同（確認點：${where}）\n  規格：${s.question}\n  原型：${p.question}`);
    if (s.assumption !== p.assumption) {
      const note = /第\s*[\d.]+\s*節/.test(s.assumption) ? '，規格引用章節，原型應寫出內容，請判斷' : '';
      issues.push(`${id}：目前假設不同${note}（確認點：${where}）\n  規格：${s.assumption}\n  原型：${p.assumption}`);
    }
    if (!pins[id]) issues.push(`${id}：題目已有，畫面上沒有確認點`);
  }
}
if (issues.length) {
  heading('確認事項');
  out.push(...issues);
}

// ---- 章節：文案比對與規則全文
// 完整片段找不到時才往下拆。複合儲存格如「標題：請先改派。內文：…」，冒號前是欄位名稱，不是文案。
const missingPieces = (cell, hay) => {
  const clean = cell.replace(/`/g, '').replace(/\\\*/g, '').replace(/（[^（）]*）/g, '');
  const found = piece => hay.some(h => h.includes(squeeze(piece)));
  const result = new Set();
  for (const fragment of clean.split(/\{[^}]*\}|／/).map(f => f.trim())) {
    if (cjkCount(fragment) < 2 || found(fragment)) continue;
    for (const sentence of fragment.split(/(?<=[。；？！])/)) {
      const copy = sentence.slice(sentence.lastIndexOf('：') + 1);
      for (const piece of copy.split(/[、・]/).map(f => f.trim().replace(/[。；]$/, ''))) {
        if (cjkCount(piece) >= 2 && !found(piece)) result.add(piece);
      }
    }
  }
  return [...result];
};
let anyMissing = false;
for (const section of scope) {
  const files = pagesBySection[section.id];
  const text = (files ? [...files, ...sharedJs] : [...pages, ...sharedJs]).map(f => source[f]).join('\n');
  const hay = [squeeze(text), squeeze(dropTags(text))];
  const missing = [];
  const notes = [];
  let copyColumn = -1;
  for (let i = section.start + 1; i < section.end; i++) {
    const line = specLines[i];
    if (!isTableRow(line)) {
      copyColumn = -1;
      notes.push(line);
    } else if (isTableRule(line)) {
      if (copyColumn === -1) notes.push(line);
    } else if (isTableRule(specLines[i + 1] || '')) {
      copyColumn = cells(line).findIndex(c => c.includes('文案'));
      if (copyColumn === -1) notes.push(line);
    } else if (copyColumn === -1) {
      notes.push(line);
    } else {
      const row = cells(line);
      for (const piece of missingPieces(row[copyColumn] || '', hay)) missing.push(`第 ${i + 1} 行｜${row[0]}：${piece}`);
    }
  }
  const rules = whole ? '' : notes.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!missing.length && !rules) continue;
  heading(`${section.id} ${section.title}（規格第 ${section.start + 1}-${section.end} 行，頁面：${files ? files.join('、') : '未對應，已搜尋全部頁面'}）`);
  if (missing.length) {
    anyMissing = true;
    out.push('文案在原型找不到：', ...missing.map(m => `- ${m}`));
  }
  if (rules) out.push('規則與描述（腳本沒有比對）：', rules);
}
const notPresented = sections.find(s => s.id === '3.5');
if (anyMissing && notPresented) {
  heading(`${notPresented.id} ${notPresented.title}（這裡列的內容原型本來就不呈現，不用補）`);
  out.push(specLines.slice(notPresented.start + 1, notPresented.end).join('\n').trim());
}

// ---- 頁面上有、規格找不到的文字
const stripNoise = text => text
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/<title>[\s\S]*?<\/title>/g, '')
  .replace(/\baria(-label|Label)?(=|\s*:\s*)(["'`])(?:(?!\3).)*\3/g, '')
  .replace(/\b(aria-labelledby|alt)="[^"]*"/g, '')
  .replace(/demoEvents\s*:\s*\[[\s\S]*?\n\s*\],?/g, '');
const specText = squeeze(specLines.join('\n'));
const demoData = squeeze(source['prototype/data.js']);
const demoOnly = /示意|不會實際|原型|^確認點|\.csv/;
const scopePages = whole ? pages : [...new Set(scope.flatMap(s => pagesBySection[s.id] || []))];
const scanCore = whole || scope.some(s => ['7.1.2', '7.1.3'].includes(s.id));
const extra = [];
for (const file of scanCore ? [...scopePages, 'prototype/core.js'] : scopePages) {
  const seen = new Set();
  stripNoise(source[file]).split('\n').forEach(line => {
    for (const m of line.matchAll(/[㐀-鿿「][㐀-鿿　-〿＀-￯\w ・.%-]*/g)) {
      for (const piece of m[0].split(/[・／]/)) {
        const key = squeeze(piece);
        if (cjkCount(key) < 2 || seen.has(key) || demoOnly.test(key)) continue;
        if (specText.includes(key) || demoData.includes(key)) continue;
        seen.add(key);
        extra.push(`${file}：${piece.trim()}`);
      }
    }
  });
}
const hasNumber = e => /\d/.test(e.slice(e.indexOf('：') + 1));
if (extra.some(hasNumber)) {
  heading('頁面上寫死的數字（請和示範資料核對）');
  out.push(...extra.filter(hasNumber).map(e => `- ${e}`));
}
if (extra.some(e => !hasNumber(e))) {
  heading('頁面上有、規格找不到的文字（可能只是片段被程式切開，請判斷）');
  out.push(...extra.filter(e => !hasNumber(e)).map(e => `- ${e}`));
}

const unknown = args.filter(a => !known(a));
if (unknown.length) {
  heading('找不到的範圍');
  out.push(unknown.join('、'));
}
const version = (specLines.find(l => /^\|\s*版本\s*\|/.test(l)) || '').replace(/[|\s]|版本/g, '');
const title = `規格 ${version}｜範圍：${args.join(' ')}`;
console.log(out.length ? `${title}\n${out.join('\n')}` : `${title}\n腳本沒有發現差異。`);
