// E2E 登入：不經過 Google，用測試專用的 NEXTAUTH_SECRET 直接產生 session cookie（docs/architecture.md 第 15.1 節）。
// 只在測試使用；正式程式不提供任何測試用的登入方式。
//
// 權限（D-021、D-026；docs/spec/README.md 第 2 節、AUTH-R11）：權限名單在資料庫的 Member 表，每個 email 是編輯者或檢視者；
// 不在名單上的公司帳號沒有權限（只能看發布頁，開三頁看到「沒有權限」頁）。測試工具的約定：
// - signIn(context, baseURL, user?)：登入的帳號一律先以編輯者寫進名單（已在名單上就改成編輯者），所以預設的測試帳號（TEST_USER）是編輯者，
//   既有會修改資料的測試不必改。傳別的帳號（例如甲）也一樣會成為編輯者。
// - signInAsViewer(context, baseURL, user?)：先把這個帳號以檢視者寫進名單（已在名單上就改成檢視者）再登入（預設 VIEWER_USER）。
// - signInWithoutAccess(context, baseURL, user?)：先把這個帳號從名單移除再登入，是「沒有權限」的情境（預設丁 DING）。
// - setSessionCookie：只放 session cookie、不動名單；用在「名單是別人在權限頁改的」這類情境（AUTH-R14）。
// - 名單本身的操作（makeEditor、makeViewer、removeMember、setMembers、setEditors、memberList、memberIdOf…）在 ./permissions-db.ts。
// 手機組（mobile-320）的測試依序跑在同一個資料庫上：每支測試開頭要自己用上面的函式把名單設好，不依賴前一支留下的狀態。
import type { BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { makeEditor, makeViewer, removeMember } from './permissions-db';

export const E2E_SECRET = process.env.E2E_NEXTAUTH_SECRET || 'e2e-only-secret-not-for-production';

export type TestUser = { name: string; email: string; sub: string };

/** 預設的測試帳號：signIn 時以編輯者寫進名單 */
export const TEST_USER: TestUser = { name: '測試承辦人', email: 'tester@program.com.tw', sub: 'e2e-user-1' };

/** 檢視者的測試帳號：signInAsViewer 時以檢視者寫進名單 */
export const VIEWER_USER: TestUser = { name: '檢視同仁', email: 'viewer@program.com.tw', sub: 'e2e-viewer-1' };

/** docs/spec/permissions.md 第 5 節驗收條件用的虛構帳號：甲、乙、丙、丁（丁一律不在名單上） */
export const JIA: TestUser = { name: '甲同仁', email: 'jia@program.com.tw', sub: 'e2e-jia' };
export const YI: TestUser = { name: '乙同仁', email: 'yi@program.com.tw', sub: 'e2e-yi' };
export const BING: TestUser = { name: '丙同仁', email: 'bing@program.com.tw', sub: 'e2e-bing' };
export const DING: TestUser = { name: '丁同仁', email: 'ding@program.com.tw', sub: 'e2e-ding' };

/** 只放 session cookie，不改權限名單 */
export async function setSessionCookie(context: BrowserContext, baseURL: string, user: TestUser = TEST_USER) {
  const token = await encode({ token: { name: user.name, email: user.email, sub: user.sub }, secret: E2E_SECRET });
  const url = new URL(baseURL);
  await context.addCookies([
    { name: 'next-auth.session-token', value: token, domain: url.hostname, path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
}

/** 以編輯者登入：先把這個帳號以編輯者寫進名單（已在名單上就改成編輯者），再放 session cookie */
export async function signIn(context: BrowserContext, baseURL: string, user: TestUser = TEST_USER) {
  await makeEditor(user.email);
  await setSessionCookie(context, baseURL, user);
}

/** 以檢視者登入：先把這個帳號以檢視者寫進名單（已在名單上就改成檢視者），再放 session cookie */
export async function signInAsViewer(context: BrowserContext, baseURL: string, user: TestUser = VIEWER_USER) {
  await makeViewer(user.email);
  await setSessionCookie(context, baseURL, user);
}

/** 以沒有權限的公司帳號登入：先把這個帳號從名單移除，再放 session cookie */
export async function signInWithoutAccess(context: BrowserContext, baseURL: string, user: TestUser = DING) {
  await removeMember(user.email);
  await setSessionCookie(context, baseURL, user);
}

export { makeEditor, makeViewer, memberIdOf, memberList, removeMember, setEditors, setMembers } from './permissions-db';
