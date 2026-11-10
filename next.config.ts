import type { NextConfig } from 'next';

// 安全標頭（docs/architecture.md 第 9.3 節）
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
];

// 專案根目錄固定為執行 next 的目錄：git worktree 放在 .worktrees/ 底下時，
// Next.js 不會往上找到主目錄的 lockfile、把主目錄誤當成專案根
const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  // aiborn 平台以 Docker 部署，standalone 只帶執行需要的檔案（docs/architecture.md 第 14 節）
  output: 'standalone',
  outputFileTracingRoot: projectRoot,
  turbopack: { root: projectRoot },
  poweredByHeader: false,
  // 不讓 next dev 自動改寫 AGENTS.md：專案規則由人維護，E2E 每次啟動 dev server 也不能改動它
  agentRules: false,
  // 開發模式左下角的標誌會蓋住 Sidebar 的使用者區塊，E2E 點擊時會被擋
  devIndicators: false,
  // Excel 與 MariaDB driver 在伺服器端執行，不打包進 bundle
  serverExternalPackages: ['exceljs', 'mariadb', 'iconv-lite'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
