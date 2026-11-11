// 重做用的伺服器行為（D-028）：docs/architecture.md 第 8.1 節「restore 也會回傳 undo（復原之前的狀態），前端把它放進重做紀錄，
// 按「重做」時同樣送 restore，回應的 undo 再放回復原紀錄」；docs/spec/seating.md SEAT-R99（重做後的範圍和那一步原本的操作相同，SEAT-R78）、
// SEAT-R77（可以連續復原、再一步一步重做）；auto-arrange.md ARR-R13（自動排座也可以重做）。
// 這裡不經過前端：做一步 → restore（復原）→ 用復原回應的 undo 再 restore（重做）→ 資料要和那一步做完時完全相同；
// 重做回應的 undo 再 restore（再復原）→ 回到那一步之前。前端的紀錄與 Sonner 在 tests/unit/components/seating-history.test.tsx。
// 復原或重做時別人剛改過相關的資料（SEAT-R100、SEAT-AC136）：undo 快照的 expect 記這一步做完時，動到的人在哪一桌、動到的桌在不在與位置；
// restore 先比對，不同就回 409 CONFLICT、資料不變。別人坐進同一桌、調整順序不算衝突；沒有 expect 的舊快照不比對（docs/architecture.md 第 8.1 節）。
// 資料：resetData 後 1–30 桌在同號的位置（3 = B4、7 = B2、9 = B8，D-019、D-027），暫存區沒有桌。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import type { SeatingResult } from '@/contracts/seating';
import { prisma, resetData } from '../../helpers/db';
import {
  allPositions,
  allTableRows,
  emptyPosition,
  expectAllContiguous,
  expectError,
  newUnseated,
  operate,
  positionOf,
  postOperation,
  seatNewEmployees,
  tableAt,
} from '../../helpers/seating-api';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

beforeEach(async () => {
  await resetData();
});

const B4 = 3;
const B2 = 7;
const B8 = 9;

type Snapshot = { people: Awaited<ReturnType<typeof allPositions>>; tables: Awaited<ReturnType<typeof allTableRows>> };
const snapshot = async (): Promise<Snapshot> => ({ people: await allPositions(), tables: await allTableRows() });

/**
 * 做 op，再復原、重做、再復原：
 * 復原後回到 before；重做後和做完時（after）完全相同（含座號、桌的位置、暫存順序與備註名稱）；再復原又回到 before。
 */
async function expectRedoable(op: unknown) {
  const before = await snapshot();
  const done: SeatingResult = await operate(op);
  const after = await snapshot();
  expect(after, '這一步有改變資料').not.toEqual(before);

  const undone = await operate({ type: 'restore', snapshot: done.undo });
  expect(await snapshot(), '復原後回到操作之前').toEqual(before);

  const redone = await operate({ type: 'restore', snapshot: undone.undo });
  expect(await snapshot(), '重做後和那一步做完時相同').toEqual(after);
  await expectAllContiguous();

  await operate({ type: 'restore', snapshot: redone.undo });
  expect(await snapshot(), '重做後再復原又回到操作之前').toEqual(before);
  await expectAllContiguous();
}

describe('restore 回傳的 undo 再送一次 restore 就是重做（SEAT-R99、SEAT-R78）', () => {
  it('入座（排到名單中間，後面的人往後移）', async () => {
    await seatNewEmployees(B4, 3);
    const wang = await newUnseated({ name: '王小明' });
    await expectRedoable({ type: 'seat', participantId: wang, tableId: B4, index: 1 });
  });

  it('搬移（B4 桌第 2 列搬到 B2 桌，B4 桌後面的人往前補）', async () => {
    const [, wang] = await seatNewEmployees(B4, 4);
    await seatNewEmployees(B2, 2);
    await expectRedoable({ type: 'seat', participantId: wang, tableId: B2 });
  });

  it('移出', async () => {
    const [, wang] = await seatNewEmployees(B4, 3);
    await expectRedoable({ type: 'unseat', participantId: wang });
  });

  it('調整順序', async () => {
    const [a, b, c] = await seatNewEmployees(B4, 3);
    await expectRedoable({ type: 'reorder', tableId: B4, participantIds: [c, a, b] });
  });

  it('清空（備註名稱保留）', async () => {
    await seatNewEmployees(B4, 6);
    await prisma.seatTable.update({ where: { id: B4 }, data: { noteName: '主桌' } });
    await expectRedoable({ type: 'clear', tableId: B4 });
  });

  it('加入人員（一次加入多位）', async () => {
    await seatNewEmployees(B4, 7);
    const ids = [await newUnseated(), await newUnseated(), await newUnseated()];
    await expectRedoable({ type: 'seatMany', tableId: B4, participantIds: ids, allowOverflow: true });
  });

  it('放進工作人員桌（從桌次拖過來）', async () => {
    const [, wang] = await seatNewEmployees(B4, 4);
    await expectRedoable({ type: 'seat', participantId: wang, tableId: STAFF_TABLE_ID, allowOverflow: true });
  });

  it('對調桌次（B4 桌和 B2 桌，備註名稱跟著桌子）', async () => {
    await seatNewEmployees(B4, 2);
    await seatNewEmployees(B2, 3);
    await prisma.seatTable.update({ where: { id: B4 }, data: { noteName: '主桌' } });
    await expectRedoable({ type: 'moveTable', tableId: B4, to: B2, expectedTableId: B2 });
  });

  it('移到暫存區（重做後 stagedAt 也和做完時相同）', async () => {
    await seatNewEmployees(B4, 2);
    await expectRedoable({ type: 'moveTable', tableId: B4, to: 'staging', expectedTableId: null });
  });

  it('新增桌（重做後是同一個 id 的桌在原本的位置）', async () => {
    await emptyPosition(B8);
    await expectRedoable({ type: 'createTable', position: B8 });
    expect(await tableAt(B8)).toBeNull();
  });

  it('刪除桌（有人、有備註名稱；重做後又刪掉，人回到未入座）', async () => {
    await seatNewEmployees(B4, 3);
    await prisma.seatTable.update({ where: { id: B4 }, data: { noteName: '主桌' } });
    await expectRedoable({ type: 'deleteTable', tableId: B4 });
  });

  it('自動排座「只排未入座」（ARR-R13、SEAT-AC137）', async () => {
    for (let i = 1; i <= 12; i++) await newUnseated({ name: `業${i}`, department: '業務部' });
    await expectRedoable({ type: 'autoArrange', mode: 'unseatedOnly' });
  });
});

describe('復原或重做時別人剛改過（SEAT-R100、SEAT-AC136）', () => {
  const unseated = { tableId: null, seatOrder: null };

  it('入座的 undo 帶 expect：這一步做完時甲在 B4 桌（不記座號）', async () => {
    const jia = await newUnseated({ name: '甲' });
    const seated = await operate({ type: 'seat', participantId: jia, tableId: B4 });
    expect(seated.undo.expect).toEqual({ participants: [{ id: jia, tableId: B4 }], tables: [] });
  });

  it('甲入座 B4 → 別人把甲移到 B2 → 用甲入座的 undo 復原：409 CONFLICT，資料不變', async () => {
    const jia = await newUnseated({ name: '甲' });
    const seated = await operate({ type: 'seat', participantId: jia, tableId: B4 });
    await operate({ type: 'seat', participantId: jia, tableId: B2 }); // 別人做的
    const before = await snapshot();

    await expectError(await postOperation({ type: 'restore', snapshot: seated.undo }), 409, 'CONFLICT');
    expect(await snapshot()).toEqual(before);
    expect(await positionOf(jia)).toEqual({ tableId: B2, seatOrder: 0 });
  });

  it('甲入座 B4 → 別人把乙也坐進 B4（同一桌）→ 用甲入座的 undo 復原：成功，甲回到未入座，乙仍在 B4 桌（往前補到第 1 列）', async () => {
    const jia = await newUnseated({ name: '甲' });
    const yi = await newUnseated({ name: '乙' });
    const seated = await operate({ type: 'seat', participantId: jia, tableId: B4 });
    await operate({ type: 'seat', participantId: yi, tableId: B4 }); // 別人做的
    expect(await positionOf(yi)).toEqual({ tableId: B4, seatOrder: 1 });

    await operate({ type: 'restore', snapshot: seated.undo });
    expect(await positionOf(jia)).toEqual(unseated);
    expect(await positionOf(yi)).toEqual({ tableId: B4, seatOrder: 0 });
    await expectAllContiguous();
  });

  it('甲入座 B4 → 別人把 B4 桌內的順序調整過 → 用甲入座的 undo 復原：成功（調整順序不算衝突）', async () => {
    const [a] = await seatNewEmployees(B4, 1);
    const jia = await newUnseated({ name: '甲' });
    const seated = await operate({ type: 'seat', participantId: jia, tableId: B4 });
    await operate({ type: 'reorder', tableId: B4, participantIds: [jia, a] }); // 別人做的

    await operate({ type: 'restore', snapshot: seated.undo });
    expect(await positionOf(jia)).toEqual(unseated);
    expect(await positionOf(a!)).toEqual({ tableId: B4, seatOrder: 0 });
  });

  it('重做時別人剛改過：甲入座 B4 → 復原 → 別人把甲坐到 B2 → 用復原回應的 undo 重做：409 CONFLICT，資料不變', async () => {
    const jia = await newUnseated({ name: '甲' });
    const seated = await operate({ type: 'seat', participantId: jia, tableId: B4 });
    const undone = await operate({ type: 'restore', snapshot: seated.undo });
    await operate({ type: 'seat', participantId: jia, tableId: B2 }); // 別人做的
    const before = await snapshot();

    await expectError(await postOperation({ type: 'restore', snapshot: undone.undo }), 409, 'CONFLICT');
    expect(await snapshot()).toEqual(before);
  });

  it('搬動桌子後，別人把那張桌搬走 → 用搬動的 undo 復原：409 CONFLICT，資料不變', async () => {
    await emptyPosition(B8);
    const moved = await operate({ type: 'moveTable', tableId: B4, to: B8, expectedTableId: null });
    await operate({ type: 'moveTable', tableId: B4, to: 'staging', expectedTableId: null }); // 別人做的
    const before = await snapshot();

    await expectError(await postOperation({ type: 'restore', snapshot: moved.undo }), 409, 'CONFLICT');
    expect(await snapshot()).toEqual(before);
  });

  it('沒有 expect 的舊快照不比對：甲入座 B4 → 別人把甲移到 B2 → 用去掉 expect 的 undo 復原：照快照還原，甲回到未入座', async () => {
    const jia = await newUnseated({ name: '甲' });
    const seated = await operate({ type: 'seat', participantId: jia, tableId: B4 });
    await operate({ type: 'seat', participantId: jia, tableId: B2 });

    await operate({ type: 'restore', snapshot: { participants: seated.undo.participants, tables: seated.undo.tables } });
    expect(await positionOf(jia)).toEqual(unseated);
  });
});

describe('連續復原、再一步一步重做（SEAT-R77、SEAT-R99、SEAT-AC130）', () => {
  it('三步（入座、入座、移出）依序復原三次、重做三次：最後和三步做完時相同', async () => {
    const wang = await newUnseated({ name: '王小明' });
    const lee = await newUnseated({ name: '李大華' });

    const steps = [
      await operate({ type: 'seat', participantId: wang, tableId: B4 }),
      await operate({ type: 'seat', participantId: lee, tableId: B4 }),
      await operate({ type: 'unseat', participantId: wang }),
    ];
    const done = await snapshot();

    // 復原：從最近一步往前；每次把回應的 undo 放進重做紀錄
    const redo: SeatingResult['undo'][] = [];
    for (const step of [...steps].reverse()) redo.push((await operate({ type: 'restore', snapshot: step.undo })).undo);
    expect(await allPositions()).toEqual({ [wang]: { tableId: null, seatOrder: null }, [lee]: { tableId: null, seatOrder: null } });

    // 重做：從最近一次復原的那一步開始
    for (const snap of [...redo].reverse()) await operate({ type: 'restore', snapshot: snap });
    expect(await snapshot()).toEqual(done);
    await expectAllContiguous();
  });
});
