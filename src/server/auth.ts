import 'server-only';
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { decideSignIn, type GoogleProfileClaims } from '@/domain/auth-policy';
import type { SessionUser } from '@/contracts/entities';
import { logInfo, logWarning } from './log';

// 登入（docs/spec/README.md 第 8 節、D-003）：公司 Google 帳號，JWT session 存在 cookie，不建帳號資料表。
const THIRTY_DAYS = 30 * 24 * 60 * 60;

export const allowedEmailDomain = () => (process.env.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      // hd 只讓 Google 預選公司帳號；真正的檢查在 signIn callback
      authorization: { params: { hd: allowedEmailDomain() || undefined, prompt: 'select_account' } },
    }),
  ],
  // 30 天有效，使用中每天延長一次（AUTH-R06）
  session: { strategy: 'jwt', maxAge: THIRTY_DAYS, updateAge: 24 * 60 * 60 },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return false;
      const decision = decideSignIn(profile as GoogleProfileClaims | undefined, allowedEmailDomain());
      if (!decision.allowed) {
        const email = (profile as GoogleProfileClaims | undefined)?.email ?? '';
        logWarning({
          eventType: 'auth_sign_in_denied',
          message: '登入被拒',
          reason: decision.reason,
          emailDomain: email.includes('@') ? email.slice(email.lastIndexOf('@') + 1) : null,
        });
        return false;
      }
      logInfo({ eventType: 'auth_sign_in_succeeded', message: '登入成功', userId: account.providerAccountId });
      return true;
    },
    async jwt({ token, profile }) {
      if (profile) {
        token.name = profile.name ?? token.name;
        token.email = profile.email ?? token.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name ?? '';
        session.user.email = token.email ?? '';
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
};

/** 目前登入者；沒登入時為 null */
export async function currentUser(): Promise<(SessionUser & { id: string }) | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const id = (session.user as { id?: string }).id;
  return { id: id ?? 'unknown', name: session.user.name ?? '', email: session.user.email };
}
