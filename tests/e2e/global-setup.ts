// E2E 開始前：重建測試資料庫（和整合測試共用同一套做法），再把預設的測試帳號寫進編輯者名單。
// 預設的測試帳號是編輯者、只能檢視的情境用另一個帳號（tests/e2e/helpers/auth.ts；D-021）。
// 每個測試的 signIn 也會再確認一次，所以權限頁的測試改過名單之後，下一個測試仍是編輯者。
import { loadTestEnv, recreateTestDatabase } from '../helpers/test-database';
import { TEST_USER } from './helpers/auth';
import { makeEditor } from './helpers/permissions-db';

export default async function globalSetup() {
  const name = loadTestEnv();
  await recreateTestDatabase(name);
  await makeEditor(TEST_USER.email);
}
