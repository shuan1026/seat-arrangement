// E2E 登入：不經過 Google，用測試專用的 NEXTAUTH_SECRET 直接產生 session cookie（docs/architecture.md 第 15.1 節）。
// 只在測試使用；正式程式不提供任何測試用的登入方式。
import type { BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';

export const E2E_SECRET = process.env.E2E_NEXTAUTH_SECRET || 'e2e-only-secret-not-for-production';

export const TEST_USER = { name: '測試承辦人', email: 'tester@program.com.tw', sub: 'e2e-user-1' };

export async function signIn(context: BrowserContext, baseURL: string, user = TEST_USER) {
  const token = await encode({ token: { name: user.name, email: user.email, sub: user.sub }, secret: E2E_SECRET });
  const url = new URL(baseURL);
  await context.addCookies([
    { name: 'next-auth.session-token', value: token, domain: url.hostname, path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
}
