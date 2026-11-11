// POST /api/seating/operations 的桌子指令（D-027；docs/architecture.md 第 7.1、8.1、8.2 節）：
// moveTable { tableId, to: 位置 1–30 | 'staging', expectedTableId }、createTable { position }、deleteTable { tableId }，以及它們的 restore。
// docs/spec/seating.md SEAT-R01、R35、R36、R38、R76、R78、R85、R91～R98；SEAT-AC109～AC113、AC115～AC118、AC121～AC124、AC126。
// 對調（場上的桌 → 有桌的位置）的既有情境在 seating-operations.test.ts，同時操作在 seating-concurrency.test.ts，
// 檢視者與沒有權限的人在 editor-guard.test.ts。
//
// 資料：resetData 後 1–30 桌在同號的位置（3 = B4、7 = B2、9 = B8、17 = A3，D-019），暫存區沒有桌。
// 「未放桌」用 emptyPosition 刪掉那個位置上的桌；暫存的桌用 stageTable 或 insertTable({ position: null })（tests/helpers/seating-api.ts）。
// 回應（SeatingResult）：participants 是位置有改變的人、tables 是有變動或新增的桌（完整的 SeatTable）、deletedTableIds 是這次刪除的桌、
// undo.tables 是 { id, kind, position, stagedAt, noteName, exists }（新增的桌 exists 是 false）。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import { prisma, resetData } from '../../helpers/db';
import {
  allPositions,
  allTableRows,
  emptyPosition,
  expectAllContiguous,
  expectError,
  insertTable,
  newUnseated,
  operate,
  positionOf,
  positionOfTable,
  postOperation,
  roster,
  rosterAt,
  seatNewEmployees,
  stagedTableIds,
  stagedTableWith,
  stageTable,
  staffIds,
  tableAt,
  tableRow,
} from '../../helpers/seating-api';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

beforeEach(async () => {
  await resetData();
});

const unseated = { tableId: null, seatOrder: null };
const B4 = 3;
const B2 = 7;
const B8 = 9;
const A3 = 17;
const isoTime = (v: string | null | undefined) => v !== null && v !== undefined && !Number.isNaN(Date.parse(v));

describe('moveTable：場上的桌 → 「未放桌」的位置（SEAT-R35、R36、SEAT-AC109）', () => {
  it('B4 桌（「主桌」，甲、乙）搬到 B8（未放桌）：B8 有這一桌，B4 變成「未放桌」；人不搬；復原後回來，B8 回到「未放桌」', async () => {
    await emptyPosition(B8);
    const people = await seatNewEmployees(B4, 2);
    await prisma.seatTable.update({ where: { id: B4 }, data: { noteName: '主桌' } });
    const peopleBefore = await allPositions();

    const result = await operate({ type: 'moveTable', tableId: B4, to: B8, expectedTableId: null });

    expect(await tableAt(B8)).toBe(B4);
    expect(await tableAt(B4)).toBeNull();
    expect(await rosterAt(B8)).toEqual(people);
    expect(await tableRow(B4)).toEqual({ id: B4, kind: 'NORMAL', position: B8, stagedAt: null, noteName: '主桌' });
    expect(await allPositions()).toEqual(peopleBefore);
    expect(result.participants).toEqual([]);
    expect(result.tables).toEqual([{ id: B4, kind: 'NORMAL', position: B8, stagedAt: null, noteName: '主桌' }]);
    expect(result.deletedTableIds).toEqual([]);
    expect(result.undo).toEqual({
      participants: [],
      tables: [{ id: B4, kind: 'NORMAL', position: B4, stagedAt: null, noteName: '主桌', exists: true }],
    });

    await operate({ type: 'restore', snapshot: result.undo });
    expect(await tableAt(B4)).toBe(B4);
    expect(await tableAt(B8)).toBeNull();
    expect(await rosterAt(B4)).toEqual(people);
    expect(await tableRow(B4)).toMatchObject({ noteName: '主桌', stagedAt: null });
  });

  it('畫面上以為 B8 是「未放桌」，其實別人剛放了一桌（expectedTableId 不符）：409 CONFLICT，資料不變（SEAT-R85）', async () => {
    await emptyPosition(B8);
    await insertTable({ position: B8 });
    const tables = await allTableRows();
    await expectError(await postOperation({ type: 'moveTable', tableId: B4, to: B8, expectedTableId: null }), 409, 'CONFLICT');
    expect(await allTableRows()).toEqual(tables);
  });

  it('畫面上以為 B2 有某一桌，其實是別桌或已變成「未放桌」：409 CONFLICT，資料不變', async () => {
    await emptyPosition(B8);
    const tables = await allTableRows();
    await expectError(await postOperation({ type: 'moveTable', tableId: B4, to: B2, expectedTableId: 12 }), 409, 'CONFLICT');
    await expectError(await postOperation({ type: 'moveTable', tableId: B4, to: B8, expectedTableId: B8 }), 409, 'CONFLICT');
    expect(await allTableRows()).toEqual(tables);
  });
});

describe('moveTable：場上的桌 → 暫存區（SEAT-R35、R91、SEAT-AC110、AC114、AC115）', () => {
  it('B4 桌移到暫存區：position null、stagedAt 是現在的時間；B4 變成「未放桌」；名單與備註名稱跟著桌子；人仍坐在這一桌（暫存的桌上的人）', async () => {
    const people = await seatNewEmployees(B4, 2);
    await prisma.seatTable.update({ where: { id: B4 }, data: { noteName: '主桌' } });
    const start = Date.now();

    const result = await operate({ type: 'moveTable', tableId: B4, to: 'staging', expectedTableId: null });

    const row = await tableRow(B4);
    expect(row).toMatchObject({ position: null, noteName: '主桌' });
    expect(isoTime(row?.stagedAt)).toBe(true);
    expect(Date.parse(row!.stagedAt!)).toBeGreaterThanOrEqual(start - 60_000);
    expect(await tableAt(B4)).toBeNull();
    expect(await roster(B4)).toEqual(people);
    expect(result.tables).toEqual([{ id: B4, kind: 'NORMAL', position: null, stagedAt: row!.stagedAt, noteName: '主桌' }]);
    expect(result.undo.tables).toEqual([{ id: B4, kind: 'NORMAL', position: B4, stagedAt: null, noteName: '主桌', exists: true }]);
  });

  it('排在暫存區最下面（SEAT-AC114）；復原後回到 B4，暫存區只剩原本的兩桌', async () => {
    const first = await insertTable({ position: null, stagedAt: new Date('2026-01-01T00:00:00.000Z') });
    const second = await insertTable({ position: null, stagedAt: new Date('2026-01-02T00:00:00.000Z') });

    const result = await operate({ type: 'moveTable', tableId: B4, to: 'staging', expectedTableId: null });
    expect(await stagedTableIds()).toEqual([first, second, B4]);

    await operate({ type: 'restore', snapshot: result.undo });
    expect(await stagedTableIds()).toEqual([first, second]);
    expect(await tableAt(B4)).toBe(B4);
  });

  it('已滿、超過的桌也可以移到暫存區', async () => {
    await seatNewEmployees(5, 12);
    await operate({ type: 'moveTable', tableId: 5, to: 'staging', expectedTableId: null });
    expect(await positionOfTable(5)).toBeNull();
    expect(await roster(5)).toHaveLength(12);
  });

  it('暫存的桌放回暫存區：沒有作用（SEAT-R38）', async () => {
    const id = await insertTable({ position: null });
    const tables = await allTableRows();
    const result = await operate({ type: 'moveTable', tableId: id, to: 'staging', expectedTableId: null });
    expect(result.undo).toEqual({ participants: [], tables: [] });
    expect(await allTableRows()).toEqual(tables);
  });
});

describe('moveTable：暫存的桌 → 「未放桌」的位置（SEAT-R35、R93、SEAT-AC111、AC117）', () => {
  it('暫存的桌（「主桌」，甲、乙）放到 A3（未放桌）：position 17、stagedAt null；暫存區沒有桌；復原後回到暫存區、原本的時間', async () => {
    await emptyPosition(A3);
    const stagedAt = new Date('2026-11-01T08:00:00.000Z');
    const id = await insertTable({ position: null, stagedAt, noteName: '主桌' });
    const people = await seatNewEmployees(id, 2);

    const result = await operate({ type: 'moveTable', tableId: id, to: A3, expectedTableId: null });

    expect(await tableAt(A3)).toBe(id);
    expect(await tableRow(id)).toEqual({ id, kind: 'NORMAL', position: A3, stagedAt: null, noteName: '主桌' });
    expect(await rosterAt(A3)).toEqual(people);
    expect(await stagedTableIds()).toEqual([]);

    await operate({ type: 'restore', snapshot: result.undo });
    expect(await tableRow(id)).toEqual({ id, kind: 'NORMAL', position: null, stagedAt: stagedAt.toISOString(), noteName: '主桌' });
    expect(await tableAt(A3)).toBeNull();
  });
});

describe('moveTable：暫存的桌 → 有桌的位置，交換（SEAT-R35、SEAT-AC112）', () => {
  it('暫存的桌（坐丙）放到 B2（坐丁）：B2 是坐丙的桌，原本坐丁的桌移到暫存區最下面；復原後 B2 回到坐丁，暫存區只有坐丙那一桌', async () => {
    const other = await insertTable({ position: null, stagedAt: new Date('2026-01-01T00:00:00.000Z') });
    const { tableId: staged, people: [bing] } = await stagedTableWith(1);
    const [ding] = await seatNewEmployees(B2, 1);

    const result = await operate({ type: 'moveTable', tableId: staged, to: B2, expectedTableId: B2 });

    expect(await tableAt(B2)).toBe(staged);
    expect(await rosterAt(B2)).toEqual([bing]);
    const old = await tableRow(B2);
    expect(old?.position).toBeNull();
    expect(isoTime(old?.stagedAt)).toBe(true);
    expect(await stagedTableIds()).toEqual([other, B2]);
    expect(await roster(B2)).toEqual([ding]);
    expect(result.tables.map((t) => t.id).sort((a, b) => a - b)).toEqual([B2, staged].sort((a, b) => a - b));

    await operate({ type: 'restore', snapshot: result.undo });
    expect(await tableAt(B2)).toBe(B2);
    expect(await rosterAt(B2)).toEqual([ding]);
    expect(await stagedTableIds()).toEqual([other, staged]);
  });

  it('畫面上以為 B2 是「未放桌」，其實有桌：409 CONFLICT，暫存的桌仍在暫存區', async () => {
    const id = await insertTable({ position: null });
    await expectError(await postOperation({ type: 'moveTable', tableId: id, to: B2, expectedTableId: null }), 409, 'CONFLICT');
    expect(await positionOfTable(id)).toBeNull();
    expect(await tableAt(B2)).toBe(B2);
  });
});

describe('三桌輪換（SEAT-AC113）', () => {
  it('A1 坐甲、B1 坐乙、B4 坐丙 → A1 拖到暫存區、B1 拖到 A1、B4 拖到 B1、暫存的桌拖到 B4 → A1 坐乙、B1 坐丙、B4 坐甲；暫存區沒有桌', async () => {
    const A1 = 2;
    const B1 = 1;
    const [jia] = await seatNewEmployees(A1, 1);
    const [yi] = await seatNewEmployees(B1, 1);
    const [bing] = await seatNewEmployees(B4, 1);

    await operate({ type: 'moveTable', tableId: A1, to: 'staging', expectedTableId: null });
    await operate({ type: 'moveTable', tableId: B1, to: A1, expectedTableId: null });
    await operate({ type: 'moveTable', tableId: B4, to: B1, expectedTableId: null });
    await operate({ type: 'moveTable', tableId: A1, to: B4, expectedTableId: null });

    expect(await rosterAt(A1)).toEqual([yi]);
    expect(await rosterAt(B1)).toEqual([bing]);
    expect(await rosterAt(B4)).toEqual([jia]);
    expect(await stagedTableIds()).toEqual([]);
    await expectAllContiguous();
  });
});

describe('moveTable：被拒（SEAT-R38、SEAT-R85、SEAT-R98）', () => {
  it('要搬的桌已被別人刪除：被拒（404 或 409），資料不變', async () => {
    await prisma.seatTable.delete({ where: { id: B4 } });
    const tables = await allTableRows();
    const res = await postOperation({ type: 'moveTable', tableId: B4, to: 'staging', expectedTableId: null });
    expect([404, 409]).toContain(res.status);
    expect(await allTableRows()).toEqual(tables);
  });

  it('工作人員桌不能搬動（SEAT-R98、SEAT-AC126）：被拒，工作人員桌仍是 id 0、position null', async () => {
    await seatNewEmployees(STAFF_TABLE_ID, 2);
    await emptyPosition(B8);
    for (const op of [
      { type: 'moveTable', tableId: STAFF_TABLE_ID, to: B8, expectedTableId: null },
      { type: 'moveTable', tableId: STAFF_TABLE_ID, to: 'staging', expectedTableId: null },
    ]) {
      expect([400, 409]).toContain((await postOperation(op)).status);
    }
    expect(await tableRow(STAFF_TABLE_ID)).toEqual({ id: STAFF_TABLE_ID, kind: 'STAFF', position: null, stagedAt: null, noteName: null });
    expect(await staffIds()).toHaveLength(2);
    expect(await tableAt(B8)).toBeNull();
  });

  it('輸入格式不對：to 不是位置或暫存區、沒有 expectedTableId：400 VALIDATION_FAILED', async () => {
    for (const op of [
      { type: 'moveTable', tableId: B4, to: 31, expectedTableId: null },
      { type: 'moveTable', tableId: B4, to: 'B8', expectedTableId: null },
      { type: 'moveTable', tableId: B4, to: B8 },
    ]) {
      await expectError(await postOperation(op), 400, 'VALIDATION_FAILED');
    }
  });
});

describe('createTable：在「未放桌」的位置新增一桌（SEAT-R96、SEAT-AC121）', () => {
  it('B8 是「未放桌」→ 新增：B8 有一張空桌（沒有人、沒有備註名稱），id 是 31；回應的 tables 有這一桌，undo 的 exists 是 false', async () => {
    await emptyPosition(B8);

    const result = await operate({ type: 'createTable', position: B8 });

    expect(await tableAt(B8)).toBe(31);
    expect(await tableRow(31)).toEqual({ id: 31, kind: 'NORMAL', position: B8, stagedAt: null, noteName: null });
    expect(await roster(31)).toEqual([]);
    expect(result.tables).toEqual([{ id: 31, kind: 'NORMAL', position: B8, stagedAt: null, noteName: null }]);
    expect(result.participants).toEqual([]);
    expect(result.deletedTableIds).toEqual([]);
    expect(result.undo.participants).toEqual([]);
    expect(result.undo.tables).toEqual([expect.objectContaining({ id: 31, exists: false })]);
  });

  it('按「復原」：新增的桌刪除，B8 回到「未放桌」；回應的 deletedTableIds 有這一桌', async () => {
    await emptyPosition(B8);
    const created = await operate({ type: 'createTable', position: B8 });

    const restored = await operate({ type: 'restore', snapshot: created.undo });

    expect(await tableRow(31)).toBeNull();
    expect(await tableAt(B8)).toBeNull();
    expect(restored.deletedTableIds).toEqual([31]);
  });

  it('新增的桌的 id 是當下最大的 id 加 1：連續新增兩桌是 31、32；刪掉 32 再新增，又是 32', async () => {
    await emptyPosition(B8);
    await emptyPosition(A3);
    await operate({ type: 'createTable', position: B8 });
    await operate({ type: 'createTable', position: A3 });
    expect(await tableAt(B8)).toBe(31);
    expect(await tableAt(A3)).toBe(32);

    await operate({ type: 'deleteTable', tableId: 32 });
    await operate({ type: 'createTable', position: A3 });
    expect(await tableAt(A3)).toBe(32);
  });

  it('暫存區有 id 33 的桌時，新增的桌是 34（不和任何一桌重複）', async () => {
    await emptyPosition(B8);
    await insertTable({ id: 33, position: null });
    await operate({ type: 'createTable', position: B8 });
    expect(await tableAt(B8)).toBe(34);
  });

  it('新增的桌可以入座、改順序、清空、移到暫存區（和一般桌相同）', async () => {
    await emptyPosition(B8);
    await operate({ type: 'createTable', position: B8 });
    const a = await newUnseated();
    const b = await newUnseated();
    await operate({ type: 'seat', participantId: a, tableId: 31, allowOverflow: true });
    await operate({ type: 'seatMany', tableId: 31, participantIds: [b], allowOverflow: true });
    expect(await roster(31)).toEqual([a, b]);
    await operate({ type: 'reorder', tableId: 31, participantIds: [b, a] });
    expect(await roster(31)).toEqual([b, a]);
    await operate({ type: 'moveTable', tableId: 31, to: 'staging', expectedTableId: null });
    expect(await positionOfTable(31)).toBeNull();
    await expectAllContiguous();
  });

  it('位置已有桌（例如別人剛新增）：409 CONFLICT，不新增', async () => {
    const count = await prisma.seatTable.count();
    await expectError(await postOperation({ type: 'createTable', position: B8 }), 409, 'CONFLICT');
    expect(await prisma.seatTable.count()).toBe(count);
  });

  it('位置不是 1–30：400 VALIDATION_FAILED', async () => {
    for (const position of [0, 31, 'B8']) await expectError(await postOperation({ type: 'createTable', position }), 400, 'VALIDATION_FAILED');
  });
});

describe('deleteTable：刪除桌（SEAT-R97、SEAT-R28、SEAT-AC122、AC123）', () => {
  it('B4 桌（6 位、「主桌」）刪除：這一桌刪掉、B4 變成「未放桌」；6 位變成未入座、人員不刪；回應的 participants 是這 6 位、deletedTableIds 是 [3]', async () => {
    const people = await seatNewEmployees(B4, 6);
    await prisma.seatTable.update({ where: { id: B4 }, data: { noteName: '主桌' } });
    const count = await prisma.participant.count();

    const result = await operate({ type: 'deleteTable', tableId: B4 });

    expect(await tableRow(B4)).toBeNull();
    expect(await tableAt(B4)).toBeNull();
    for (const id of people) expect(await positionOf(id)).toEqual(unseated);
    expect(await prisma.participant.count()).toBe(count);
    expect(result.deletedTableIds).toEqual([B4]);
    expect(result.participants.map((p) => p.id).sort((a, b) => a - b)).toEqual([...people].sort((a, b) => a - b));
    for (const p of result.participants) expect(p).toMatchObject(unseated);
    expect(result.undo.tables).toEqual([{ id: B4, kind: 'NORMAL', position: B4, stagedAt: null, noteName: '主桌', exists: true }]);
    expect(result.undo.participants.map((p) => p.id).sort((a, b) => a - b)).toEqual([...people].sort((a, b) => a - b));
  });

  it('按「復原」：B4 桌以原本的 id 回到 B4，6 位的座位順序與「主桌」都和刪除前相同；回應的 tables 有這一桌（SEAT-AC122）', async () => {
    const people = await seatNewEmployees(B4, 6);
    await prisma.seatTable.update({ where: { id: B4 }, data: { noteName: '主桌' } });
    const deleted = await operate({ type: 'deleteTable', tableId: B4 });

    const restored = await operate({ type: 'restore', snapshot: deleted.undo });

    expect(await tableRow(B4)).toEqual({ id: B4, kind: 'NORMAL', position: B4, stagedAt: null, noteName: '主桌' });
    expect(await roster(B4)).toEqual(people);
    expect(restored.tables).toEqual(expect.arrayContaining([{ id: B4, kind: 'NORMAL', position: B4, stagedAt: null, noteName: '主桌' }]));
    await expectAllContiguous();
  });

  it('空桌刪除：只有桌子刪掉（SEAT-AC123）', async () => {
    const result = await operate({ type: 'deleteTable', tableId: 8 });
    expect(await tableAt(8)).toBeNull();
    expect(result.participants).toEqual([]);
    expect(result.deletedTableIds).toEqual([8]);
  });

  it('暫存的桌刪除：桌上的人變成一般的未入座；復原後回到暫存區原本的順序（SEAT-AC123、SEAT-R78）', async () => {
    const { tableId: first, people } = await stagedTableWith(2);
    const second = await insertTable({ position: null });

    const result = await operate({ type: 'deleteTable', tableId: first });
    expect(await tableRow(first)).toBeNull();
    for (const id of people) expect(await positionOf(id)).toEqual(unseated);
    expect(await stagedTableIds()).toEqual([second]);

    await operate({ type: 'restore', snapshot: result.undo });
    expect(await stagedTableIds()).toEqual([first, second]);
    expect(await roster(first)).toEqual(people);
  });

  it('已被刪除：404 NOT_FOUND（docs/architecture.md 第 8.1 節）', async () => {
    await operate({ type: 'deleteTable', tableId: B4 });
    await expectError(await postOperation({ type: 'deleteTable', tableId: B4 }), 404, 'NOT_FOUND');
  });

  it('工作人員桌不能刪（SEAT-R98、SEAT-AC126）：被拒，工作人員都還在', async () => {
    const staff = await seatNewEmployees(STAFF_TABLE_ID, 2);
    expect([400, 409]).toContain((await postOperation({ type: 'deleteTable', tableId: STAFF_TABLE_ID })).status);
    expect(await tableRow(STAFF_TABLE_ID)).not.toBeNull();
    expect(await staffIds()).toEqual(staff);
  });
});

describe('暫存的桌：人不能放進去（SEAT-R92、docs/architecture.md 第 8.1 節）', () => {
  it('seat、seatMany 指到暫存的桌：409 CONFLICT，資料不變（SEAT-AC118）', async () => {
    const { tableId } = await stagedTableWith(2);
    const wang = await newUnseated();
    const before = await allPositions();
    await expectError(await postOperation({ type: 'seat', participantId: wang, tableId }), 409, 'CONFLICT');
    await expectError(await postOperation({ type: 'seat', participantId: wang, tableId, allowOverflow: true }), 409, 'CONFLICT');
    await expectError(await postOperation({ type: 'seatMany', tableId, participantIds: [wang], allowOverflow: true }), 409, 'CONFLICT');
    expect(await allPositions()).toEqual(before);
  });

  it('reorder、clear 指到暫存的桌：409 CONFLICT，名單不變', async () => {
    const { tableId, people } = await stagedTableWith(2);
    await expectError(await postOperation({ type: 'reorder', tableId, participantIds: [...people].reverse() }), 409, 'CONFLICT');
    await expectError(await postOperation({ type: 'clear', tableId }), 409, 'CONFLICT');
    expect(await roster(tableId)).toEqual(people);
  });

  it('剛被別人移到暫存區的桌（畫面還沒更新）：入座回 409 CONFLICT，不入座（SEAT-R85）', async () => {
    await stageTable(B4);
    const wang = await newUnseated();
    await expectError(await postOperation({ type: 'seat', participantId: wang, tableId: B4 }), 409, 'CONFLICT');
    expect(await positionOf(wang)).toEqual(unseated);
  });
});

describe('暫存的桌上的人（SEAT-R94、SEAT-AC118、PPL-AC92）', () => {
  it('拖到場上的桌：離開暫存的桌入座；暫存的桌其他人往前補；復原後回到原本的座號', async () => {
    const { tableId, people: [jia, yi] } = await stagedTableWith(2);
    const result = await operate({ type: 'seat', participantId: jia, tableId: B2, allowOverflow: true });
    expect(await roster(B2)).toEqual([jia]);
    expect(await roster(tableId)).toEqual([yi]);
    await operate({ type: 'restore', snapshot: result.undo });
    expect(await roster(tableId)).toEqual([jia, yi]);
  });

  it('「移出桌次」：變成一般的未入座；復原後回到暫存的桌原本的座號', async () => {
    const { tableId, people: [jia, yi] } = await stagedTableWith(2);
    const result = await operate({ type: 'unseat', participantId: yi });
    expect(await positionOf(yi!)).toEqual(unseated);
    expect(await roster(tableId)).toEqual([jia]);
    await operate({ type: 'restore', snapshot: result.undo });
    expect(await roster(tableId)).toEqual([jia, yi]);
  });
});

describe('復原的衝突（SEAT-R85、COM-R07）', () => {
  it('復原「搬到未放桌」時，B4 已被別人放了另一桌：被拒（409），資料不變', async () => {
    await emptyPosition(B8);
    const moved = await operate({ type: 'moveTable', tableId: B4, to: B8, expectedTableId: null });
    await insertTable({ position: B4 });
    const tables = await allTableRows();
    const res = await postOperation({ type: 'restore', snapshot: moved.undo });
    expect(res.status).toBe(409);
    expect(await allTableRows()).toEqual(tables);
  });
});
