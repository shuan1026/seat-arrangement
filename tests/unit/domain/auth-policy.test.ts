// 登入資格與登入頁：docs/spec/README.md 第 8 節（AUTH-R01～R04、AUTH-R07、AUTH-AC01～AC06）；
// docs/architecture.md 第 9.1 節第 3 點（email_verified、email 網域與 hd 都要等於公司網域；hd 參數不能當作檢查）。
import { describe, expect, it } from 'vitest';
import { decideSignIn, loginErrorFromQuery, safeCallbackPath } from '@/domain/auth-policy';

const DOMAIN = 'program.com.tw';
const companyAccount = { email: 'tester@program.com.tw', email_verified: true, hd: 'program.com.tw' };

describe('decideSignIn（AUTH-R02）', () => {
  it('公司網域、email 已驗證、hd 是公司網域：可以登入（AUTH-AC03）', () => {
    expect(decideSignIn(companyAccount, DOMAIN).allowed).toBe(true);
  });

  it('非公司網域（例如 gmail.com）不能登入（AUTH-AC04）', () => {
    expect(decideSignIn({ email: 'someone@gmail.com', email_verified: true, hd: null }, DOMAIN).allowed).toBe(false);
    expect(decideSignIn({ email: 'someone@gmail.com', email_verified: true }, DOMAIN).allowed).toBe(false);
  });

  it('公司網域但 Google 回報 email 未驗證：不能登入（AUTH-AC05）', () => {
    expect(decideSignIn({ ...companyAccount, email_verified: false }, DOMAIN).allowed).toBe(false);
    expect(decideSignIn({ ...companyAccount, email_verified: null }, DOMAIN).allowed).toBe(false);
    expect(decideSignIn({ email: companyAccount.email, hd: companyAccount.hd }, DOMAIN).allowed).toBe(false);
  });

  it('email 是公司網域但沒有 hd（不是公司 Google Workspace 帳號）：不能登入', () => {
    expect(decideSignIn({ ...companyAccount, hd: undefined }, DOMAIN).allowed).toBe(false);
    expect(decideSignIn({ ...companyAccount, hd: null }, DOMAIN).allowed).toBe(false);
  });

  it('hd 是其他網域：不能登入', () => {
    expect(decideSignIn({ ...companyAccount, hd: 'other.example.com' }, DOMAIN).allowed).toBe(false);
  });

  it('email 網域必須完全相同：子網域、前後多字都不行', () => {
    for (const email of [
      'tester@sub.program.com.tw',
      'tester@program.com.tw.example.com',
      'tester@xprogram.com.tw',
      'program.com.tw@example.com',
    ]) {
      expect(decideSignIn({ ...companyAccount, email }, DOMAIN).allowed, email).toBe(false);
    }
  });

  it('網域不分大小寫', () => {
    const mixedCase = { email: 'Tester@PROGRAM.com.tw', email_verified: true, hd: 'Program.Com.Tw' };
    expect(decideSignIn(mixedCase, DOMAIN).allowed).toBe(true);
    expect(decideSignIn(companyAccount, 'PROGRAM.COM.TW').allowed).toBe(true);
  });

  it('沒有 email 或沒有 Google 資料：不能登入', () => {
    expect(decideSignIn(undefined, DOMAIN).allowed).toBe(false);
    expect(decideSignIn({ email_verified: true, hd: DOMAIN }, DOMAIN).allowed).toBe(false);
    expect(decideSignIn({ ...companyAccount, email: '' }, DOMAIN).allowed).toBe(false);
    expect(decideSignIn({ ...companyAccount, email: 'not-an-email' }, DOMAIN).allowed).toBe(false);
  });

  it('沒有設定公司網域時誰都不能登入', () => {
    expect(decideSignIn(companyAccount, '').allowed).toBe(false);
    expect(decideSignIn({ email: 'tester@', email_verified: true, hd: '' }, '').allowed).toBe(false);
  });
});

describe('loginErrorFromQuery：登入頁要顯示哪一種提示', () => {
  it('帳號被拒（AccessDenied）顯示「這個帳號不能登入。」（AUTH-R03）', () => {
    expect(loginErrorFromQuery('AccessDenied', null)).toBe('denied');
  });

  it.each(['OAuthCallback', 'OAuthSignin', 'Callback', 'Configuration', 'Default'])(
    'Google 登入沒有完成（%s）顯示「登入沒有完成。」（AUTH-R04）',
    (error) => {
      expect(loginErrorFromQuery(error, null)).toBe('failed');
    },
  );

  it('登入過期（expired=1）顯示「登入已過期。」（AUTH-R07）', () => {
    expect(loginErrorFromQuery(null, '1')).toBe('expired');
    expect(loginErrorFromQuery(undefined, '1')).toBe('expired');
  });

  it('直接開登入頁時沒有提示', () => {
    expect(loginErrorFromQuery(null, null)).toBeNull();
    expect(loginErrorFromQuery(undefined, undefined)).toBeNull();
  });
});

describe('safeCallbackPath：登入後回到原本要開的頁面（AUTH-R01）', () => {
  it('回到原本的頁面，含網址參數（AUTH-AC01）', () => {
    expect(safeCallbackPath('/people?q=王')).toBe('/people?q=王');
    expect(safeCallbackPath('/people?q=%E7%8E%8B')).toBe('/people?q=%E7%8E%8B');
    expect(safeCallbackPath('/employees')).toBe('/employees');
    expect(safeCallbackPath('/')).toBe('/');
  });

  it('直接開登入頁（沒有原本的頁面）時進入座位安排（AUTH-AC02）', () => {
    expect(safeCallbackPath(null)).toBe('/');
    expect(safeCallbackPath(undefined)).toBe('/');
    expect(safeCallbackPath('')).toBe('/');
  });

  it.each([
    'https://evil.example.com/',
    'http://evil.example.com/people',
    '//evil.example.com',
    '//evil.example.com/people',
    '/\\evil.example.com',
    'javascript:alert(1)',
    'people',
  ])('站外或不是站內路徑的網址（%s）一律進入座位安排', (raw) => {
    expect(safeCallbackPath(raw)).toBe('/');
  });

  it('不回到登入頁本身，避免登入後又停在登入頁', () => {
    expect(safeCallbackPath('/login')).toBe('/');
    expect(safeCallbackPath('/login?error=AccessDenied')).toBe('/');
  });

  it('不回到 API 路徑', () => {
    expect(safeCallbackPath('/api/state')).toBe('/');
    expect(safeCallbackPath('/api/auth/signin')).toBe('/');
  });
});
