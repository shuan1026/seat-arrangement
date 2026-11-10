// @vitest-environment node
// Auth.js 設定：docs/spec/README.md AUTH-R02～R04（只允許公司網域且 email 已驗證；被拒或失敗留在登入頁）、
// AUTH-R06（登入狀態保留 30 天，持續使用自動延長）、AUTH-R10（顯示 Google 帳號的姓名與 email）；
// docs/architecture.md 第 9.1 節。不連 Google，直接呼叫 callback。
import { beforeAll, describe, expect, it } from 'vitest';
import { authOptions } from '@/server/auth';

type SignInParams = Parameters<NonNullable<NonNullable<typeof authOptions.callbacks>['signIn']>>[0];
type JwtParams = Parameters<NonNullable<NonNullable<typeof authOptions.callbacks>['jwt']>>[0];
type SessionParams = Parameters<NonNullable<NonNullable<typeof authOptions.callbacks>['session']>>[0];

const DAY = 24 * 60 * 60;

beforeAll(() => {
  process.env.ALLOWED_EMAIL_DOMAIN = 'program.com.tw';
});

async function signIn(profile: Record<string, unknown>, provider = 'google') {
  const cb = authOptions.callbacks?.signIn;
  if (!cb) throw new Error('沒有 signIn callback');
  return cb({
    user: { id: 'google-sub-1' },
    account: { provider, providerAccountId: 'google-sub-1', type: 'oauth' },
    profile,
  } as unknown as SignInParams);
}

describe('登入資格（AUTH-R02、AUTH-AC03～AC05）', () => {
  it('公司網域、email 已驗證的帳號可以登入', async () => {
    await expect(
      signIn({ email: 'tester@program.com.tw', email_verified: true, hd: 'program.com.tw', name: '測試承辦人' }),
    ).resolves.toBe(true);
  });

  it('非公司網域的帳號不能登入', async () => {
    await expect(signIn({ email: 'someone@gmail.com', email_verified: true, name: '測試' })).resolves.toBe(false);
  });

  it('公司網域但 email 未驗證不能登入', async () => {
    await expect(
      signIn({ email: 'tester@program.com.tw', email_verified: false, hd: 'program.com.tw', name: '測試' }),
    ).resolves.toBe(false);
  });

  it('不是 Google 登入一律拒絕', async () => {
    await expect(
      signIn({ email: 'tester@program.com.tw', email_verified: true, hd: 'program.com.tw' }, 'credentials'),
    ).resolves.toBe(false);
  });
});

describe('登入頁（AUTH-R03、AUTH-R04）', () => {
  it('登入與錯誤都回到 /login', () => {
    expect(authOptions.pages?.signIn).toBe('/login');
    expect(authOptions.pages?.error).toBe('/login');
  });
});

describe('登入狀態（AUTH-R06）', () => {
  it('保留 30 天，用 JWT cookie，不建 session 資料表', () => {
    expect(authOptions.session?.strategy).toBe('jwt');
    expect(authOptions.session?.maxAge).toBe(30 * DAY);
  });

  it('持續使用會自動延長（延長間隔比有效期短）', () => {
    const updateAge = authOptions.session?.updateAge;
    expect(updateAge).toBeGreaterThan(0);
    expect(updateAge).toBeLessThan(30 * DAY);
  });
});

describe('使用者區塊的姓名與 email（AUTH-R10）', () => {
  it('登入時記下 Google 帳號的姓名與 email，session 帶給畫面', async () => {
    const jwt = authOptions.callbacks?.jwt;
    const session = authOptions.callbacks?.session;
    if (!jwt || !session) throw new Error('沒有 jwt 或 session callback');

    const token = await jwt({
      token: { sub: 'google-sub-1' },
      profile: { name: '測試承辦人', email: 'tester@program.com.tw' },
    } as unknown as JwtParams);
    expect(token).toMatchObject({ name: '測試承辦人', email: 'tester@program.com.tw' });

    const result = (await session({
      session: { user: { name: null, email: null }, expires: '2026-12-10T00:00:00.000Z' },
      token,
    } as unknown as SessionParams)) as { user?: { name?: string | null; email?: string | null } };
    expect(result.user).toMatchObject({ name: '測試承辦人', email: 'tester@program.com.tw' });
  });
});
