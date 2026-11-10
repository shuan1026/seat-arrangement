import type { Metadata } from 'next';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@/styles/globals.css';
import { themeInitScript } from '@/client/theme';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

export const metadata: Metadata = {
  title: { default: 'Seat Arrangement', template: '%s｜Seat Arrangement' },
  icons: { icon: '/symbol-dark.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // 介面配色（D-020）：伺服器不知道這個瀏覽器的選擇，<html> 不帶 data-theme；<head> 的 inline script 在第一次繪製前
    // 依 localStorage 設上 data-theme，所以 <html> 的屬性和伺服器輸出不同是預期的（COM-R18、architecture 11.3）。
    // 用一般的同步 inline script，不用 next/script 的 beforeInteractive（要等前端程式載入，可能在第一次繪製之後）。
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
