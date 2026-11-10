// 登入資格（docs/spec/README.md AUTH-R02）：只有公司網域、而且 Google 已驗證 email 的帳號能登入。
// 導向 Google 時帶的 hd 參數只是讓 Google 預選公司帳號，不能當作檢查，所以這裡另外比對。

export type GoogleProfileClaims = {
  email?: string | null;
  email_verified?: boolean | string | null;
  hd?: string | null;
};

export type SignInDecision = { allowed: true } | { allowed: false; reason: 'no_email' | 'unverified' | 'domain' };

export function decideSignIn(profile: GoogleProfileClaims | undefined, allowedDomain: string): SignInDecision {
  const domain = allowedDomain.trim().toLowerCase();
  const email = profile?.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) return { allowed: false, reason: 'no_email' };
  const verified = profile?.email_verified === true || profile?.email_verified === 'true';
  if (!verified) return { allowed: false, reason: 'unverified' };
  const emailDomain = email.slice(email.lastIndexOf('@') + 1);
  const hd = profile?.hd?.trim().toLowerCase();
  if (!domain || emailDomain !== domain || hd !== domain) return { allowed: false, reason: 'domain' };
  return { allowed: true };
}

/** 登入頁的錯誤種類：Auth.js 把 signIn 回傳 false 轉成 AccessDenied，其他都是登入沒有完成 */
export type LoginError = 'denied' | 'failed' | 'expired' | null;

export function loginErrorFromQuery(error: string | null | undefined, expired: string | null | undefined): LoginError {
  if (error === 'AccessDenied') return 'denied';
  if (error) return 'failed';
  if (expired === '1') return 'expired';
  return null;
}

/** 登入後要回去的頁面：只接受站內相對路徑，避免被導到外部網站 */
export function safeCallbackPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (raw.startsWith('/login') || raw.startsWith('/api/')) return '/';
  return raw;
}
