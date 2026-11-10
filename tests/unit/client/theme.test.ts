// 介面配色的讀寫與套用：docs/spec/README.md COM-R17（淺色、深色兩種，預設淺色）、COM-R18（記在這個瀏覽器、不跟著作業系統、
// 第一次繪製前就套用）；docs/architecture.md 第 11.3 節（淺色是 :root 預設，深色是 :root[data-theme="dark"]；選擇存在 localStorage，
// 根版面 <head> 的 inline script 在第一次繪製前把 data-theme 設在 <html>；不存資料庫）；決策 D-020。
// 實際瀏覽器裡的「重新整理、換頁、開新分頁都保持深色、不先閃淺色」在 tests/e2e/theme-persistence.spec.ts。
//
// 假設的介面（src/client/theme.ts；不要加 'use client'，根版面是伺服器元件，也要能 import themeInitScript）：
//   export type Theme = 'light' | 'dark';
//   export const THEME_STORAGE_KEY: string;
//     localStorage 的鍵，沿用 src/components/shell/app-shell.tsx 'seat-arrangement:sidebar' 的命名，例如 'seat-arrangement:theme'。
//   export function readTheme(): Theme;
//     只有存的值正好是 'dark' 時回 'dark'；沒存、其他任何值、讀取丟例外都回 'light'。不看作業系統的深色模式。
//   export function applyTheme(theme: Theme): void;
//     只改畫面：'dark' 時 <html data-theme="dark">；'light' 時移除 <html> 的 data-theme（淺色就是 :root 的預設）。
//   export function setTheme(theme: Theme): void;
//     使用者選了配色：寫進 localStorage（深色存 'dark'），再 applyTheme；寫入失敗（私密模式、空間不足）不丟例外，畫面照樣換。
//   export function themeInitScript(): string;
//     根版面 <head> inline script 的內容。自成一體（不引用模組裡的任何變數），讀 localStorage 的 THEME_STORAGE_KEY，
//     值正好是 'dark' 才在 <html> 設 data-theme="dark"；任何例外都吞掉，不讓頁面壞掉。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, readTheme, setTheme, THEME_STORAGE_KEY, themeInitScript } from '@/client/theme';

const root = () => document.documentElement;

/** 照瀏覽器載入 <head> inline script 的方式，在全域範圍執行一次（拿不到模組裡的變數） */
const runInitScript = () => {
  new Function(themeInitScript())();
};

/** 作業系統是深色模式（prefers-color-scheme: dark） */
function stubSystemDark() {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: /prefers-color-scheme:\s*dark/.test(query),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

/** 存的值不是「dark」的各種情況：都當淺色 */
const INVALID_VALUES = [
  'light',
  'Dark',
  'DARK',
  ' dark',
  'dark ',
  'harbor-sun',
  'vivid',
  '',
  'true',
  '1',
  'null',
  'undefined',
  '{"theme":"dark"}',
];

beforeEach(() => {
  localStorage.clear();
  root().removeAttribute('data-theme');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  root().removeAttribute('data-theme');
});

describe('THEME_STORAGE_KEY', () => {
  it('是非空的字串（選擇存在 localStorage 的這個鍵）', () => {
    expect(typeof THEME_STORAGE_KEY).toBe('string');
    expect(THEME_STORAGE_KEY.trim()).not.toBe('');
  });
});

describe('readTheme：目前選的配色（COM-R17、COM-R18）', () => {
  it('沒選過 → 淺色（預設）', () => {
    expect(readTheme()).toBe('light');
  });

  it('localStorage 存的是「dark」→ 深色', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readTheme()).toBe('dark');
  });

  it.each(INVALID_VALUES)('存的值是 %j（不是正好「dark」）→ 淺色', (value) => {
    localStorage.setItem(THEME_STORAGE_KEY, value);
    expect(readTheme()).toBe('light');
  });

  it('讀取 localStorage 丟例外（瀏覽器封鎖儲存空間）→ 淺色，不丟例外', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    expect(() => readTheme()).not.toThrow();
    expect(readTheme()).toBe('light');
  });

  it('作業系統是深色模式、這個瀏覽器沒選過 → 仍是淺色，不跟著作業系統（COM-R18、COM-AC18）', () => {
    stubSystemDark();
    expect(window.matchMedia('(prefers-color-scheme: dark)').matches).toBe(true);
    expect(readTheme()).toBe('light');
  });
});

describe('applyTheme：套用到 <html>（architecture 11.3）', () => {
  it('深色 → <html data-theme="dark">', () => {
    applyTheme('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');
  });

  it('淺色 → 移除 <html> 的 data-theme（淺色是 :root 的預設）', () => {
    root().setAttribute('data-theme', 'dark');
    applyTheme('light');
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('本來就是淺色時再套用淺色 → 仍然沒有 data-theme；深色套用兩次仍是 dark', () => {
    applyTheme('light');
    expect(root().hasAttribute('data-theme')).toBe(false);
    applyTheme('dark');
    applyTheme('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');
  });

  it('只設在 <html>，不設在 <body>（語意 token 在 :root 算好，設在子元素會換不到）', () => {
    applyTheme('dark');
    expect(document.body.hasAttribute('data-theme')).toBe(false);
  });
});

describe('setTheme：使用者選了配色（COM-R17、COM-R18）', () => {
  it('選深色 → 寫進 localStorage（值「dark」），<html data-theme="dark">；之後 readTheme 是深色', () => {
    setTheme('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(readTheme()).toBe('dark');
  });

  it('從深色選回淺色 → 移除 data-theme；localStorage 不再是「dark」，之後 readTheme 是淺色', () => {
    setTheme('dark');
    setTheme('light');
    expect(root().hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).not.toBe('dark');
    expect(readTheme()).toBe('light');
  });

  it('寫入 localStorage 失敗 → 不丟例外，畫面照樣換成深色（這次有效）', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => setTheme('dark')).not.toThrow();
    expect(root().getAttribute('data-theme')).toBe('dark');
  });

  it('切換配色不會呼叫任何 API（選擇只記在這個瀏覽器，不存資料庫）', () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    setTheme('dark');
    setTheme('light');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('themeInitScript：根版面 <head> 的 inline script，第一次繪製前套用（COM-R18、architecture 11.3）', () => {
  it('是非空的 JavaScript 字串，可以單獨執行（不引用模組裡的變數）', () => {
    const script = themeInitScript();
    expect(typeof script).toBe('string');
    expect(script.trim()).not.toBe('');
    expect(() => runInitScript()).not.toThrow();
  });

  it('這個瀏覽器選過深色（localStorage 是「dark」）→ 執行後 <html data-theme="dark">', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runInitScript();
    expect(root().getAttribute('data-theme')).toBe('dark');
  });

  it('沒選過 → 不設 data-theme（淺色）', () => {
    runInitScript();
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it.each(INVALID_VALUES)('存的值是 %j → 不設 data-theme（當淺色）', (value) => {
    localStorage.setItem(THEME_STORAGE_KEY, value);
    runInitScript();
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('讀取 localStorage 丟例外 → 不丟例外、不設 data-theme', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    expect(() => runInitScript()).not.toThrow();
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('作業系統是深色模式、沒選過 → 不設 data-theme（COM-AC18）', () => {
    stubSystemDark();
    runInitScript();
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('和 setTheme 用同一個鍵：選深色後重新開頁（只剩 localStorage）→ 執行後是深色；選回淺色後重新開頁 → 淺色', () => {
    setTheme('dark');
    root().removeAttribute('data-theme'); // 模擬重新開頁：新的 <html> 沒有屬性
    runInitScript();
    expect(root().getAttribute('data-theme')).toBe('dark');

    setTheme('light');
    root().removeAttribute('data-theme');
    runInitScript();
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('執行時不呼叫任何 API', () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runInitScript();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
