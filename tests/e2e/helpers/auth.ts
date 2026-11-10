// E2E 登入：不經過 Google，用測試專用的 NEXTAUTH_SECRET 直接產生 session cookie（docs/architecture.md 第 15.1 節）。
// 只在測試使用；正式程式不提供任何測試用的登入方式。
//
// 權限（D-021；docs/spec/README.md 第 2 節、AUTH-R11）：正式環境登入後預設只能檢視，編輯者名單在資料庫的 Editor 表。
// 測試工具的約定：
// - signIn(context, baseURL, user?)：登入的帳號一律先寫進編輯者名單，所以預設的測試帳號（TEST_USER）是編輯者，
//   既有會修改資料的測試不必改。傳別的帳號（例如甲）也一樣會成為編輯者。
// - signInAsViewer(context, baseURL, user?)：先把這個帳號從編輯者名單移除再登入，是「只能檢視」的情境（預設 VIEWER_USER）。
// - setSessionCookie：只放 session cookie、不動編輯者名單；用在「名單是別人在權限頁改的」這類情境（AUTH-R14）。
// - 名單本身的操作（makeEditor、removeEditor、setEditors、editorEmails）在 ./permissions-db.ts。
import type { BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { makeEditor, removeEditor } from './permissions-db';

export const E2E_SECRET = process.env.E2E_NEXTAUTH_SECRET || 'e2e-only-secret-not-for-production';

export type TestUser = { name: string; email: string; sub: string };

/** 預設的測試帳號：signIn 時寫進編輯者名單，是編輯者 */
export const TEST_USER: TestUser = { name: '測試承辦人', email: 'tester@program.com.tw', sub: 'e2e-user-1' };

/** 只能檢視的測試帳號：不在編輯者名單上（signInAsViewer 會確保這一點） */
export const VIEWER_USER: TestUser = { name: '檢視同仁', email: 'viewer@program.com.tw', sub: 'e2e-viewer-1' };

/** docs/spec/permissions.md 第 5 節驗收條件用的虛構帳號：甲、乙、丙 */
export const JIA: TestUser = { name: '甲同仁', email: 'jia@program.com.tw', sub: 'e2e-jia' };
export const YI: TestUser = { name: '乙同仁', email: 'yi@program.com.tw', sub: 'e2e-yi' };
export const BING: TestUser = { name: '丙同仁', email: 'bing@program.com.tw', sub: 'e2e-bing' };

/** 只放 session cookie，不改編輯者名單 */
export async function setSessionCookie(context: BrowserContext, baseURL: string, user: TestUser = TEST_USER) {
  const token = await encode({ token: { name: user.name, email: user.email, sub: user.sub }, secret: E2E_SECRET });
  const url = new URL(baseURL);
  await context.addCookies([
    { name: 'next-auth.session-token', value: token, domain: url.hostname, path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
}

/** 以編輯者登入：先把這個帳號寫進編輯者名單（已經是就不變），再放 session cookie */
export async function signIn(context: BrowserContext, baseURL: string, user: TestUser = TEST_USER) {
  await makeEditor(user.email);
  await setSessionCookie(context, baseURL, user);
}

/** 以「只能檢視」登入：先把這個帳號從編輯者名單移除，再放 session cookie */
export async function signInAsViewer(context: BrowserContext, baseURL: string, user: TestUser = VIEWER_USER) {
  await removeEditor(user.email);
  await setSessionCookie(context, baseURL, user);
}

export { editorEmails, makeEditor, removeEditor, setEditors } from './permissions-db';
