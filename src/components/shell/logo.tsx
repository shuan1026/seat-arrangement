// Logo（docs/spec/README.md 第 5 節：單色，淺色表面用深色字的版本，深色主題時 Sidebar、Drawer 與登入頁用白色版；D-020）。
// 設計系統 02-foundations.md「Logo slot」。檔名的 dark／light 指 Logo 本身的顏色：
// 淺色主題用 logo-dark.svg／symbol-dark.svg，深色主題用 logo-light.svg／symbol-light.svg。
// 兩版都放在 DOM 裡，由 <html data-theme> 決定顯示哪一張（看不到的那一張 display:none）：
// 配色在第一次繪製前由根版面的 inline script 套用，Logo 跟著 CSS 換，不必等前端程式掛上，也不會先閃另一版。
import { cn } from '@/components/ui/cn';

const SOURCES = {
  full: { light: '/logo-dark.svg', dark: '/logo-light.svg', width: 208, height: 72 },
  symbol: { light: '/symbol-dark.svg', dark: '/symbol-light.svg', width: 24, height: 24 },
} as const;

export function Logo({ variant, className }: { variant: 'full' | 'symbol'; className?: string }) {
  const { light, dark, width, height } = SOURCES[variant];
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- 單色 SVG 原檔，不需要最佳化 */}
      <img src={light} alt="Seat Arrangement" width={width} height={height} className={cn(className, 'in-data-[theme=dark]:hidden')} />
      {/* eslint-disable-next-line @next/next/no-img-element -- 單色 SVG 原檔，不需要最佳化 */}
      <img src={dark} alt="Seat Arrangement" width={width} height={height} className={cn(className, 'hidden in-data-[theme=dark]:block')} />
    </>
  );
}
