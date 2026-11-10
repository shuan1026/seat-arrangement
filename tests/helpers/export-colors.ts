// 座位表底色與框線的預期色碼，直接由設計系統的 token 算出（docs/spec/export.md EXP-R21、EXP-R22、EXP-Q04）：
// 讀 src/styles/tokens.css 第一個 :root 區塊（預設的「多彩活力」配色），解開 var() 與 color-mix(in srgb, …)。
// token 改了，這裡算出的色碼跟著變，Excel 的常數沒同步更新時測試會失敗。
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type Rgb = { r: number; g: number; b: number };

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

let cache: Map<string, string> | undefined;

function rootTokens(): Map<string, string> {
  if (cache) return cache;
  const css = readFileSync(path.join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8');
  const start = css.indexOf(':root {');
  const end = css.indexOf('\n}', start);
  if (start < 0 || end < 0) throw new Error('tokens.css 找不到 :root 區塊');
  const map = new Map<string, string>();
  for (const m of css.slice(start, end).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (m[1] && m[2]) map.set(m[1], m[2].trim());
  }
  cache = map;
  return map;
}

function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`不是 6 位色碼：${hex}`);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/** a 佔 weight（0–1），其餘是 b */
const mix = (a: Rgb, b: Rgb, weight: number): Rgb => ({
  r: a.r * weight + b.r * (1 - weight),
  g: a.g * weight + b.g * (1 - weight),
  b: a.b * weight + b.b * (1 - weight),
});

function resolve(value: string, tokens: Map<string, string>, depth = 0): Rgb {
  if (depth > 20) throw new Error(`token 參照太深：${value}`);
  const v = value.trim();
  if (v.startsWith('#')) return parseHex(v);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref?.[1]) {
    const next = tokens.get(ref[1]);
    if (next === undefined) throw new Error(`tokens.css 沒有 ${ref[1]}`);
    return resolve(next, tokens, depth + 1);
  }
  const cm = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/.exec(v);
  if (cm?.[1] && cm[2] && cm[3]) {
    return mix(resolve(cm[1], tokens, depth + 1), resolve(cm[3], tokens, depth + 1), Number(cm[2]) / 100);
  }
  throw new Error(`無法解析的顏色：${v}`);
}

/** token 的顏色，例如 tokenColor('--chart-cat-2') */
export const tokenColor = (name: string): Rgb => resolve(`var(${name})`, rootTokens());

/** 與白色混合：percent% 的 color，其餘是白色 */
export const tintWithWhite = (color: Rgb, percent: number): Rgb => mix(color, WHITE, percent / 100);

export const toHex = (c: Rgb): string =>
  [c.r, c.g, c.b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase();

/** 兩個色碼每個色版相差不超過 tolerance（四捨五入的差異） */
export function colorClose(actualHex: string | null, expected: Rgb, tolerance = 1): boolean {
  if (!actualHex || !/^[0-9A-Fa-f]{6}$/.test(actualHex)) return false;
  const a = parseHex(actualHex);
  return Math.abs(a.r - expected.r) <= tolerance && Math.abs(a.g - expected.g) <= tolerance && Math.abs(a.b - expected.b) <= tolerance;
}

/** EXP-Q04 的目前假設：貴賓 24% --chart-cat-2、兒童椅 34% --chart-cat-4、素食 26% --chart-cat-5；標題格 --muted；框線 --semantic-border */
export function expectedSheetColors(): { guest: Rgb; childSeat: Rgb; vegetarian: Rgb; header: Rgb; border: Rgb } {
  return {
    guest: tintWithWhite(tokenColor('--chart-cat-2'), 24),
    childSeat: tintWithWhite(tokenColor('--chart-cat-4'), 34),
    vegetarian: tintWithWhite(tokenColor('--chart-cat-5'), 26),
    header: tokenColor('--muted'),
    border: tokenColor('--semantic-border'),
  };
}
