import type { Metadata } from 'next';
import { loginErrorFromQuery, safeCallbackPath } from '@/domain/auth-policy';
import { LoginCard } from './login-card';

// 登入頁（docs/spec/README.md 第 8 節）：不套 App Shell
export const metadata: Metadata = { title: '登入' };
export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  return (
    <LoginCard
      error={loginErrorFromQuery(first(sp.error), first(sp.expired))}
      callbackUrl={safeCallbackPath(first(sp.callbackUrl))}
      loggedOut={first(sp.loggedOut) === '1'}
    />
  );
}
