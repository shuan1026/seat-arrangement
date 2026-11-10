// E2E 開始前：重建測試資料庫（和整合測試共用同一套做法）。
import { loadTestEnv, recreateTestDatabase } from '../helpers/test-database';

export default async function globalSetup() {
  const name = loadTestEnv();
  await recreateTestDatabase(name);
}
