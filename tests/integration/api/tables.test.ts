// PATCH /api/tables/{id}：修改桌次的備註名稱（docs/architecture.md 第 8 節；src/contracts/seating.ts tableUpdateSchema）。
// docs/spec/seating.md SEAT-R12（離開欄位就儲存、清空就移除）、SEAT-R14（備註名稱不影響入座）、SEAT-R48（工作人員桌沒有備註名稱）、
// SEAT-R80（編輯備註名稱不能復原）、SEAT-Q13（20 字、去掉前後空白，目前假設）；
// docs/spec/README.md COM-R09、COM-AC06（兩人先後改同一桌的備註名稱，以後改的為準）。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma, resetData } from '../../helpers/db';
import { allPositions, expectError, noteNameOf, patchTable, patchTableOk, seatNewEmployees } from '../../helpers/seating-api';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

beforeEach(async () => {
  await resetData();
});

describe('修改備註名稱（SEAT-R12、SEAT-AC27）', () => {
  it('設定備註名稱：立即儲存，回傳這一桌', async () => {
    const result = await patchTableOk(7, { noteName: '供應商' });
    expect(result.table).toEqual({ id: 7, kind: 'NORMAL', noteName: '供應商' });
    expect(await noteNameOf(7)).toBe('供應商');
  });

  it('把欄位清空：移除備註名稱', async () => {
    await prisma.seatTable.update({ where: { id: 7 }, data: { noteName: '供應商' } });
    expect((await patchTableOk(7, { noteName: '' })).table.noteName).toBeNull();
    expect(await noteNameOf(7)).toBeNull();

    await prisma.seatTable.update({ where: { id: 7 }, data: { noteName: '主桌' } });
    await patchTableOk(7, { noteName: null });
    expect(await noteNameOf(7)).toBeNull();
  });

  it('去掉前後空白；只有空白時視為清空（SEAT-Q13 的目前假設）', async () => {
    await patchTableOk(3, { noteName: '  董事貴賓  ' });
    expect(await noteNameOf(3)).toBe('董事貴賓');
    await patchTableOk(3, { noteName: '　' });
    expect(await noteNameOf(3)).toBeNull();
  });

  it('最多 20 字：超過時 400 VALIDATION_FAILED，不儲存（SEAT-Q13 的目前假設）', async () => {
    await patchTableOk(3, { noteName: '備'.repeat(20) });
    expect(await noteNameOf(3)).toBe('備'.repeat(20));
    await expectError(await patchTable(3, { noteName: '備'.repeat(21) }), 400, 'VALIDATION_FAILED');
    expect(await noteNameOf(3)).toBe('備'.repeat(20));
  });

  it('只改這一桌，不影響其他桌與任何人的座位（SEAT-R14）', async () => {
    await seatNewEmployees(3, 4);
    await prisma.seatTable.update({ where: { id: 8 }, data: { noteName: '客戶貴賓' } });
    const before = await allPositions();
    await patchTableOk(3, { noteName: '主桌' });
    expect(await allPositions()).toEqual(before);
    expect(await noteNameOf(8)).toBe('客戶貴賓');
  });

  it('不能復原：回應沒有 undo（SEAT-R80）', async () => {
    const res = await patchTable(3, { noteName: '主桌' });
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['table']);
  });

  it('兩人先後修改同一桌：都儲存，以後改的為準（COM-R09、COM-AC06）', async () => {
    await patchTableOk(3, { noteName: '主桌' });
    await patchTableOk(3, { noteName: '董事貴賓' });
    expect(await noteNameOf(3)).toBe('董事貴賓');
  });
});

describe('不能修改的桌次', () => {
  it('第 31 桌不存在：404 NOT_FOUND（SEAT-R01）', async () => {
    await expectError(await patchTable(31, { noteName: '主桌' }), 404, 'NOT_FOUND');
  });

  it('桌號不是數字：404 NOT_FOUND', async () => {
    await expectError(await patchTable('abc', { noteName: '主桌' }), 404, 'NOT_FOUND');
  });

  it('工作人員桌沒有備註名稱：被拒絕，不儲存（SEAT-R48）', async () => {
    const res = await patchTable(0, { noteName: '主桌' });
    expect([400, 404]).toContain(res.status);
    expect(await noteNameOf(0)).toBeNull();
  });

  it('輸入格式不對：400 VALIDATION_FAILED', async () => {
    await expectError(await patchTable(3, { noteName: 123 }), 400, 'VALIDATION_FAILED');
    await expectError(await patchTable(3, 'not json'), 400, 'VALIDATION_FAILED');
  });
});
