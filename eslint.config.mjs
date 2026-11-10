import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'src/generated/**',
      'ui-design-system/**',
      '.agents/**',
      'docs/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  {
    // 業務規則是純 TypeScript：不可引用 Next.js、React、Prisma 或伺服器程式（docs/architecture.md 第 5 節）
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['next', 'next/*'], message: 'domain 不可引用 Next.js' },
            { group: ['react', 'react-dom'], message: 'domain 不可引用 React' },
            { group: ['@prisma/*', '@/generated/*'], message: 'domain 不可引用 Prisma' },
            { group: ['@/server/*', '@/client/*', '@/components/*', '@/app/*'], message: 'domain 只能引用 domain 與 contracts' },
          ],
        },
      ],
    },
  },
];

export default config;
