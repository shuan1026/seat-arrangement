// 兩種介面配色的語意 token 色碼，直接由 src/styles/tokens.css 算出（docs/spec/README.md COM-R17、COM-R18，D-020；
// docs/architecture.md 第 11.3 節：淺色是 :root 的預設 token，深色是 :root[data-theme="dark"]）。
// 深色區塊只覆寫一部分 token，其餘沿用 :root 的定義，但 var() 要用深色覆寫後的值解開（和瀏覽器在 <html> 上算 CSS 變數的方式相同）。
// 只解得開 #RRGGBB、var() 與 color-mix(in srgb, A p%, B)；含透明度的 token（例如 --status-pending-bg）不在這裡算。
// 單元測試與 E2E 共用，不引用 src/。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { toHex, type Rgb } from './export-colors';

export type ThemeName = 'light' | 'dark';

const LIGHT_SELECTOR = ':root';
const DARK_SELECTOR = ':root[data-theme="dark"]';

function declarations(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`tokens.css 找不到 ${selector} 區塊`);
  const end = css.indexOf('\n}', start);
  if (end < 0) throw new Error(`tokens.css 的 ${selector} 區塊沒有結尾`);
  const body = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const map = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (m[1] && m[2]) map.set(m[1], m[2].trim());
  }
  return map;
}

let cache: Record<ThemeName, Map<string, string>> | undefined;

function tokens(theme: ThemeName): Map<string, string> {
  if (!cache) {
    const css = readFileSync(path.join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8');
    const light = declarations(css, LIGHT_SELECTOR);
    const dark = new Map([...light, ...declarations(css, DARK_SELECTOR)]);
    cache = { light, dark };
  }
  return cache[theme];
}

function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`不是 6 位色碼：${hex}`);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

const mix = (a: Rgb, b: Rgb, weight: number): Rgb => ({
  r: a.r * weight + b.r * (1 - weight),
  g: a.g * weight + b.g * (1 - weight),
  b: a.b * weight + b.b * (1 - weight),
});

function resolve(value: string, map: Map<string, string>, depth = 0): Rgb {
  if (depth > 20) throw new Error(`token 參照太深：${value}`);
  const v = value.trim();
  if (v.startsWith('#')) return parseHex(v);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref?.[1]) {
    const next = map.get(ref[1]);
    if (next === undefined) throw new Error(`tokens.css 沒有 ${ref[1]}`);
    return resolve(next, map, depth + 1);
  }
  const cm = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/.exec(v);
  if (cm?.[1] && cm[2] && cm[3]) {
    return mix(resolve(cm[1], map, depth + 1), resolve(cm[3], map, depth + 1), Number(cm[2]) / 100);
  }
  throw new Error(`無法解析的顏色：${v}`);
}

/** 某個配色下語意 token 的顏色，例如 themeTokenRgb('dark', '--background') */
export const themeTokenRgb = (theme: ThemeName, name: string): Rgb => resolve(`var(${name})`, tokens(theme));

/** 某個配色下語意 token 的色碼，'#RRGGBB'（大寫），和 E2E 從瀏覽器讀回的格式相同 */
export const themeTokenHex = (theme: ThemeName, name: string): string => `#${toHex(themeTokenRgb(theme, name))}`;
