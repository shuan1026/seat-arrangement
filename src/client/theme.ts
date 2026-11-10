// 介面配色（docs/spec/README.md COM-R17、COM-R18；docs/architecture.md 第 11.3 節；決策 D-020）。
// 淺色是 :root 的預設 token，深色是 tokens.css 的 :root[data-theme="dark"]；data-theme 一定設在 <html>，
// 語意 token 在 :root 算好，設在子元素會有部分顏色換不到（02-foundations.md「海港晴光」「深色」）。
// 選擇只記在這個瀏覽器的 localStorage，不存資料庫，也不看作業系統的深色模式。
// 不加 'use client'：根版面（伺服器元件）要 import themeInitScript；這裡的函式只在呼叫時才碰 window。

export type Theme = 'light' | 'dark';

/** localStorage 的鍵，命名同 app-shell.tsx 的 'seat-arrangement:sidebar' */
export const THEME_STORAGE_KEY = 'seat-arrangement:theme';

const DARK: Theme = 'dark';
const ATTRIBUTE = 'data-theme';

/** 這個瀏覽器選的配色：存的值正好是「dark」才是深色，其餘（沒選過、其他值、讀不到）都是淺色 */
export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === DARK ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** 畫面目前套用的配色（看 <html data-theme>） */
export function currentTheme(): Theme {
  return document.documentElement.getAttribute(ATTRIBUTE) === DARK ? 'dark' : 'light';
}

/** 只換畫面：深色時 <html data-theme="dark">，淺色時移除屬性 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute(ATTRIBUTE, DARK);
  else root.removeAttribute(ATTRIBUTE);
}

/** 使用者選了配色：記在這個瀏覽器再套用；寫不進去（私密模式、空間不足）時只在這次有效 */
export function setTheme(theme: Theme): void {
  try {
    if (theme === 'dark') localStorage.setItem(THEME_STORAGE_KEY, DARK);
    else localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    /* 寫入失敗：畫面照樣換 */
  }
  applyTheme(theme);
}

/** 畫面配色改變時通知（桌面與手機 Header 的兩個介面配色鈕顯示同一個目前配色） */
export function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTRIBUTE] });
  return () => observer.disconnect();
}

/**
 * 根版面 <head> 裡 inline script 的內容：在第一次繪製前套用這個瀏覽器的選擇，避免先閃淺色（COM-R18）。
 * 瀏覽器單獨執行這段字串，拿不到這個模組的變數，所以鍵與值直接寫進字串；任何例外都吞掉，不讓頁面壞掉。
 */
export function themeInitScript(): string {
  const key = JSON.stringify(THEME_STORAGE_KEY);
  const dark = JSON.stringify(DARK);
  const attr = JSON.stringify(ATTRIBUTE);
  return `try{if(window.localStorage.getItem(${key})===${dark})document.documentElement.setAttribute(${attr},${dark})}catch(e){}`;
}
