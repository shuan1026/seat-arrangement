// @vitest-environment node
// 根版面的配色 inline script：docs/spec/README.md COM-R18（開啟任何頁面時在畫面第一次繪製前就套用，不會先閃淺色；登入頁也沿用）、
// docs/architecture.md 第 11.3 節（根版面 <head> 裡一段 inline script 在第一次繪製前把 data-theme 設在 <html>；選擇存在 localStorage，
// 伺服器不知道）；決策 D-020。
// 用 React 的伺服器端輸出檢查根版面產生的 HTML；script 本身的行為在 tests/unit/client/theme.test.ts，
// 實際瀏覽器裡第一次繪製時已是深色在 tests/e2e/theme-persistence.spec.ts。
//
// 假設：src/app/layout.tsx 的預設匯出是同步元件，在 <head> 裡放
//   <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
// （一般的 inline script；next/script 的 beforeInteractive 要等 Next.js 的前端程式載入才執行，可能在第一次繪製之後）。
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RootLayout from '@/app/layout';
import { themeInitScript } from '@/client/theme';

const render = () =>
  renderToStaticMarkup(
    <RootLayout>
      <p>頁面內容</p>
    </RootLayout>,
  );

/** inline script 的位置與開始標籤 */
function findScript(html: string) {
  const script = themeInitScript();
  const at = html.indexOf(script);
  if (at < 0) return null;
  const open = html.lastIndexOf('<script', at);
  const tagEnd = html.indexOf('>', open) + 1;
  return { at, open, tag: html.slice(open, tagEnd), contentStart: tagEnd };
}

describe('根版面的配色 inline script（COM-R18、architecture 11.3）', () => {
  it('<head> 裡有一段 <script>，內容正好是 themeInitScript()（沒有被跳脫），在 <body> 之前', () => {
    const html = render();
    const found = findScript(html);
    expect(found, '根版面的 HTML 裡找不到 themeInitScript() 的內容').not.toBeNull();
    const head = html.indexOf('<head');
    const headEnd = html.indexOf('</head>');
    const body = html.indexOf('<body');
    expect(head).toBeGreaterThanOrEqual(0);
    expect(found?.open).toBeGreaterThan(head);
    expect(found?.at).toBeLessThan(headEnd);
    expect(found?.at).toBeLessThan(body);
    // script 標籤一結束就是內容（不是包在別的元素或屬性裡）
    expect(found?.at).toBe(found?.contentStart);
  });

  it('是一般的同步 inline script：沒有 src、async、defer，也不是 module', () => {
    const tag = findScript(render())?.tag ?? '';
    expect(tag).toMatch(/^<script\b/);
    expect(tag).not.toMatch(/\ssrc=/);
    expect(tag).not.toMatch(/\sasync\b/);
    expect(tag).not.toMatch(/\sdefer\b/);
    expect(tag).not.toMatch(/type="module"/);
  });

  it('<html> 本身不帶 data-theme：伺服器不知道這個瀏覽器的選擇（不存資料庫），由 inline script 在瀏覽器套用', () => {
    const html = render();
    const htmlTag = /<html\b[^>]*>/.exec(html)?.[0] ?? '';
    expect(htmlTag).not.toBe('');
    expect(htmlTag).not.toMatch(/data-theme/);
  });
});
