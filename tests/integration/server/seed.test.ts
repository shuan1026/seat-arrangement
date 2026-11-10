// seed（D-007）：docs/architecture.md 第 7.3 節——只在 SEED_IMPORT=1 時執行；員工表是空的、而且 roster.csv 與
// registrations.csv 都存在時才匯入；員工表已有資料或資料檔不存在時跳過，重新部署與冷啟動不會蓋掉上線後的修改；
// 兩份匯入在同一個交易內完成，任何錯誤就整批不寫入；seed 失敗就結束程序。只用暫存資料夾裡的空檔，不用真實資料。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSeedImporter, runSeed, SEED_FILES, seedDb, type SeedImporter } from '@/server/seed';
import { prisma, resetData } from '../../helpers/db';
import { createEmployee } from '../../helpers/factory';

/** 目前的環境變數，只換掉 SEED_IMPORT */
const envWith = (seedImport: string | undefined): NodeJS.ProcessEnv => ({ ...process.env, SEED_IMPORT: seedImport });
const ENABLED = envWith('1');
const SUMMARY = { employees: 2, participants: 1, dependents: 0, unmatched: 0 };

let dir: string;

beforeEach(async () => {
  await resetData();
  dir = mkdtempSync(path.join(os.tmpdir(), 'seat-seed-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const writeFiles = (...names: string[]) => {
  for (const name of names) writeFileSync(path.join(dir, name), '');
};
const writeBothFiles = () => writeFiles(SEED_FILES.roster, SEED_FILES.registrations);

/** 每個測試登記自己的匯入程式，確認有沒有被呼叫 */
function spyImporter(impl?: SeedImporter) {
  const fn = vi.fn<SeedImporter>(impl ?? (async () => SUMMARY));
  registerSeedImporter(fn);
  return fn;
}

describe('runSeed', () => {
  it.each<[string, string | undefined]>([
    ['沒有設定', undefined],
    ['設成 0', '0'],
    ['空字串', ''],
  ])('SEED_IMPORT %s時不執行（本機開發與測試不匯入）', async (_name, value) => {
    const importer = spyImporter();
    writeBothFiles();
    await expect(runSeed(envWith(value), dir)).resolves.toEqual({ status: 'disabled' });
    expect(importer).not.toHaveBeenCalled();
    expect(await prisma.employee.count()).toBe(0);
  });

  it('資料檔都不存在時跳過', async () => {
    const importer = spyImporter();
    await expect(runSeed(ENABLED, dir)).resolves.toEqual({ status: 'skipped', reason: 'no_files' });
    expect(importer).not.toHaveBeenCalled();
  });

  it.each([
    ['只有 roster.csv', SEED_FILES.roster],
    ['只有 registrations.csv', SEED_FILES.registrations],
  ])('%s 時跳過（兩個檔都要存在）', async (_name, file) => {
    const importer = spyImporter();
    writeFiles(file);
    await expect(runSeed(ENABLED, dir)).resolves.toEqual({ status: 'skipped', reason: 'no_files' });
    expect(importer).not.toHaveBeenCalled();
  });

  it('員工表已有資料時跳過，不改動既有資料', async () => {
    const importer = spyImporter();
    writeBothFiles();
    const existing = await createEmployee({ name: '王小明', department: '研發一部', extension: '1234' });

    await expect(runSeed(ENABLED, dir)).resolves.toEqual({ status: 'skipped', reason: 'has_data' });
    expect(importer).not.toHaveBeenCalled();
    expect(await prisma.employee.count()).toBe(1);
    expect(await prisma.employee.findUnique({ where: { id: existing.id } })).toMatchObject({
      name: '王小明',
      department: '研發一部',
      extension: '1234',
    });
  });

  it('還沒登記匯入程式時跳過（not_implemented），不寫任何資料', async () => {
    // 重新載入 seed 模組，拿到還沒登記匯入程式的狀態
    vi.resetModules();
    const fresh = await import('@/server/seed');
    writeBothFiles();

    await expect(fresh.runSeed(ENABLED, dir)).resolves.toEqual({ status: 'skipped', reason: 'not_implemented' });
    expect(await prisma.employee.count()).toBe(0);
  });

  it('員工表是空的、兩個資料檔都存在時匯入，回傳匯入摘要', async () => {
    const importer = spyImporter();
    writeBothFiles();

    await expect(runSeed(ENABLED, dir)).resolves.toEqual({ status: 'imported', ...SUMMARY });
    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledWith({
      roster: path.join(dir, SEED_FILES.roster),
      registrations: path.join(dir, SEED_FILES.registrations),
    });
  });

  it('匯入程式用 seedDb() 寫入的資料在成功後保留', async () => {
    spyImporter(async () => {
      await seedDb().employee.create({ data: { name: '測試員工甲', department: '測試部', sortOrder: 1 } });
      await seedDb().employee.create({ data: { name: '測試員工乙', department: '測試部', sortOrder: 2 } });
      return SUMMARY;
    });
    writeBothFiles();

    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({ status: 'imported' });
    expect(await prisma.employee.count()).toBe(2);
  });

  it('匯入程式用 seedDb() 寫入後出錯：整批不寫入，員工表維持 0 筆', async () => {
    spyImporter(async () => {
      await seedDb().employee.create({ data: { name: '測試員工甲', department: '測試部', sortOrder: 1 } });
      await seedDb().employee.create({ data: { name: '測試員工乙', department: '測試部', sortOrder: 2 } });
      throw new Error('測試用的匯入錯誤');
    });
    writeBothFiles();

    await expect(runSeed(ENABLED, dir)).rejects.toThrow();
    expect(await prisma.employee.count()).toBe(0);
    expect(await prisma.participant.count()).toBe(0);
  });

  it('匯入後再啟動一次（重新部署、冷啟動）不會再匯入', async () => {
    const importer = spyImporter(async () => {
      await prisma.employee.create({ data: { name: '測試員工甲', department: '測試部', sortOrder: 1 } });
      return SUMMARY;
    });
    writeBothFiles();

    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({ status: 'imported' });
    await expect(runSeed(ENABLED, dir)).resolves.toEqual({ status: 'skipped', reason: 'has_data' });
    expect(importer).toHaveBeenCalledTimes(1);
    expect(await prisma.employee.count()).toBe(1);
  });

  it('匯入失敗時 seed 失敗（伺服器不啟動），之後仍可以再執行', async () => {
    spyImporter(async () => {
      throw new Error('測試用的匯入錯誤');
    });
    writeBothFiles();
    await expect(runSeed(ENABLED, dir)).rejects.toThrow();

    const importer = spyImporter();
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({ status: 'imported' });
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('連續執行兩次跳過也都能完成（鎖有釋放）', async () => {
    spyImporter();
    writeBothFiles();
    await createEmployee();
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({ status: 'skipped' });
    await expect(runSeed(ENABLED, dir)).resolves.toMatchObject({ status: 'skipped' });
  });
});
