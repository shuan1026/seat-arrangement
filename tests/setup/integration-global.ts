// 整合測試開始前：重建測試資料庫並套用 migration（含 30 桌與工作人員桌）。
import { loadTestEnv, recreateTestDatabase } from '../helpers/test-database';

export default async function setup() {
  const name = loadTestEnv();
  await recreateTestDatabase(name);
}
