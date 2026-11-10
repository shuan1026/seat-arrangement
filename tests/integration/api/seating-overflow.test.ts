// D-018 每桌可以放到 12 位：POST /api/seating/operations（docs/architecture.md 第 7.2、8.1、8.2 節）。
// docs/spec/seating.md SEAT-R02（標準 10 位、最多 12 位）、SEAT-R20（拖移到 12 位的桌擋下）、SEAT-R30、SEAT-R50（加入人員到 12 位）、
// SEAT-R42（工作人員桌同規則）、SEAT-R86（別人剛改過資料）、SEAT-R88（只有拖移與「加入人員」可以放進第 11、12 位；
// 復原與對調可以回到 12 位）、5.12 節 SEAT-AC91～AC98，以及改過的 SEAT-AC14、AC15、AC42、AC44；
// docs/spec/auto-arrange.md ARR-R17（自動排座每桌只排到 10 位）。
//
// 指令約定（docs/architecture.md 第 8.1 節）：
// - seat、seatMany 帶 allowOverflow: true（拖移與「加入人員」）時每桌上限 12 位；不帶時上限 10 位（選擇桌次對話框）。
// - restore、swap 上限 12 位；autoArrange 每桌只排到 10 位。
// - 超過上限回 409：10 位是 TABLE_FULL、12 位是 TABLE_LIMIT；工作人員桌是 STAFF_TABLE_FULL、STAFF_TABLE_LIMIT。
// 這個檔案用預設的排座函式（src/domain/auto-arrange.ts）。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import { prisma, resetData } from '../../helpers/db';
import { createRegisteredEmployee } from '../../helpers/factory';
import {
  allPositions,
  expectAllContiguous,
  expectError,
  newUnseated,
  operate,
  positionOf,
  postOperation,
  roster,
  seatNewEmployees,
  staffIds,
} from '../../helpers/seating-api';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

beforeEach(async () => {
  await resetData();
});

const unseated = { tableId: null, seatOrder: null };

async function unseatedMany(count: number): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) ids.push(await newUnseated());
  return ids;
}

describe('seat 帶 allowOverflow（拖移）：每桌最多 12 位（SEAT-R02、SEAT-R20、SEAT-R88）', () => {
  it.each([9, 10, 11])(
    '有 %i 位的桌：放進來、排到名單最後並立即儲存；回應有新位置與操作前的狀態（SEAT-R16、SEAT-AC91）',
    async (n) => {
      const table5 = await seatNewEmployees(5, n);
      const wang = await newUnseated({ name: '王小明' });

      const result = await operate({ type: 'seat', participantId: wang, tableId: 5, allowOverflow: true });

      expect(await roster(5)).toEqual([...table5, wang]);
      expect(await positionOf(wang)).toEqual({ tableId: 5, seatOrder: n });
      expect(result.participants.find((p) => p.id === wang)).toMatchObject({ tableId: 5, seatOrder: n });
      expect(result.undo.participants).toEqual([{ id: wang, ...unseated }]);
    },
  );

  it('已有 12 位：409 TABLE_LIMIT，不入座、資料不變（SEAT-R20、SEAT-AC14、SEAT-AC92）', async () => {
    await seatNewEmployees(5, 12);
    const wang = await newUnseated();
    const before = await allPositions();

    await expectError(
      await postOperation({ type: 'seat', participantId: wang, tableId: 5, allowOverflow: true }),
      409,
      'TABLE_LIMIT',
    );
    await expectError(
      await postOperation({ type: 'seat', participantId: wang, tableId: 5, index: 0, allowOverflow: true }),
      409,
      'TABLE_LIMIT',
    );
    expect(await allPositions()).toEqual(before);
  });

  it('10 位的桌連續放進第 11、12 位，第 13 位 409 TABLE_LIMIT（邊界 10／11／12／13）', async () => {
    const table5 = await seatNewEmployees(5, 10);
    const [a, b, c] = await unseatedMany(3);
    await operate({ type: 'seat', participantId: a, tableId: 5, allowOverflow: true });
    await operate({ type: 'seat', participantId: b, tableId: 5, allowOverflow: true });
    await expectError(
      await postOperation({ type: 'seat', participantId: c, tableId: 5, allowOverflow: true }),
      409,
      'TABLE_LIMIT',
    );
    expect(await roster(5)).toEqual([...table5, a, b]);
    expect(await positionOf(c!)).toEqual(unseated);
    await expectAllContiguous();
  });

  it('放在名單的某一列：插入那一列，成為 11 位，後面的人往後移（SEAT-R17）', async () => {
    const table5 = await seatNewEmployees(5, 10);
    const wang = await newUnseated();
    await operate({ type: 'seat', participantId: wang, tableId: 5, index: 1, allowOverflow: true });
    expect(await roster(5)).toEqual([table5[0], wang, ...table5.slice(1)]);
    await expectAllContiguous();
  });

  it('搬移：已入座的人拖到 10 位的桌，成為第 11 位；原桌其他人往前補（SEAT-R19）', async () => {
    const [a, wang, c] = await seatNewEmployees(3, 3);
    const table5 = await seatNewEmployees(5, 10);
    await operate({ type: 'seat', participantId: wang, tableId: 5, allowOverflow: true });
    expect(await roster(5)).toEqual([...table5, wang]);
    expect(await roster(3)).toEqual([a, c]);
    await expectAllContiguous();
  });

  it('搬移：已入座的人拖到 12 位的桌，409 TABLE_LIMIT，留在原桌（SEAT-R20、SEAT-AC15）', async () => {
    const [wang] = await seatNewEmployees(3, 1);
    await seatNewEmployees(5, 12);
    await expectError(
      await postOperation({ type: 'seat', participantId: wang, tableId: 5, allowOverflow: true }),
      409,
      'TABLE_LIMIT',
    );
    expect(await positionOf(wang!)).toEqual({ tableId: 3, seatOrder: 0 });
  });

  it('工作人員拖到 10 位的桌：成為第 11 位，不再是工作人員（SEAT-R45）', async () => {
    const [wang] = await seatNewEmployees(STAFF_TABLE_ID, 1);
    const table5 = await seatNewEmployees(5, 10);
    await operate({ type: 'seat', participantId: wang, tableId: 5, allowOverflow: true });
    expect(await roster(5)).toEqual([...table5, wang]);
    expect(await staffIds()).toEqual([]);
  });

  it('工作人員拖到 12 位的桌：409 TABLE_LIMIT，仍是工作人員（SEAT-R45、SEAT-AC44）', async () => {
    const [wang] = await seatNewEmployees(STAFF_TABLE_ID, 1);
    await seatNewEmployees(5, 12);
    await expectError(
      await postOperation({ type: 'seat', participantId: wang, tableId: 5, allowOverflow: true }),
      409,
      'TABLE_LIMIT',
    );
    expect(await staffIds()).toEqual([wang]);
  });

  it('12 位的桌內調整順序（seat 指定同一桌的某一列、reorder）：都可以（SEAT-R32、SEAT-R33）', async () => {
    const table5 = await seatNewEmployees(5, 12);
    await operate({ type: 'seat', participantId: table5[11], tableId: 5, index: 0, allowOverflow: true });
    expect(await roster(5)).toEqual([table5[11], ...table5.slice(0, 11)]);
    const next = [...table5].reverse();
    await operate({ type: 'reorder', tableId: 5, participantIds: next });
    expect(await roster(5)).toEqual(next);
    await expectAllContiguous();
  });

  it('allowOverflow: false 與不帶相同：10 位的桌 409 TABLE_FULL', async () => {
    await seatNewEmployees(5, 10);
    const wang = await newUnseated();
    await expectError(
      await postOperation({ type: 'seat', participantId: wang, tableId: 5, allowOverflow: false }),
      409,
      'TABLE_FULL',
    );
  });

  it.each([10, 11, 12])(
    '不帶 allowOverflow（選擇桌次）：%i 位的桌 409 TABLE_FULL（不是 TABLE_LIMIT），資料不變（SEAT-R23、SEAT-R88、SEAT-AC94、SEAT-AC97）',
    async (n) => {
      await seatNewEmployees(5, n);
      const wang = await newUnseated();
      const before = await allPositions();
      await expectError(await postOperation({ type: 'seat', participantId: wang, tableId: 5 }), 409, 'TABLE_FULL');
      expect(await allPositions()).toEqual(before);
    },
  );

  it('allowOverflow 不是布林值：400 VALIDATION_FAILED', async () => {
    const wang = await newUnseated();
    await expectError(
      await postOperation({ type: 'seat', participantId: wang, tableId: 5, allowOverflow: 'yes' }),
      400,
      'VALIDATION_FAILED',
    );
    expect(await positionOf(wang)).toEqual(unseated);
  });
});

describe('工作人員桌：和一般桌相同，最多 12 位（SEAT-R42、SEAT-AC42、SEAT-AC95）', () => {
  it('帶 allowOverflow：10 位的工作人員桌放進第 11 位、再放進第 12 位；第 13 位 409 STAFF_TABLE_LIMIT，留在原處', async () => {
    await seatNewEmployees(STAFF_TABLE_ID, 10);
    const a = await newUnseated();
    const [b] = await seatNewEmployees(3, 1);
    const c = await newUnseated();

    await operate({ type: 'seat', participantId: a, tableId: STAFF_TABLE_ID, allowOverflow: true });
    await operate({ type: 'seat', participantId: b, tableId: STAFF_TABLE_ID, allowOverflow: true });
    expect(await staffIds()).toHaveLength(12);
    expect(await staffIds()).toEqual(expect.arrayContaining([a, b]));
    expect(await roster(3)).toEqual([]);

    await expectError(
      await postOperation({ type: 'seat', participantId: c, tableId: STAFF_TABLE_ID, allowOverflow: true }),
      409,
      'STAFF_TABLE_LIMIT',
    );
    expect(await positionOf(c)).toEqual(unseated);
    expect(await staffIds()).toHaveLength(12);
  });

  it.each([10, 11])('不帶 allowOverflow：工作人員桌有 %i 位時 409 STAFF_TABLE_FULL', async (n) => {
    await seatNewEmployees(STAFF_TABLE_ID, n);
    const wang = await newUnseated();
    await expectError(
      await postOperation({ type: 'seat', participantId: wang, tableId: STAFF_TABLE_ID }),
      409,
      'STAFF_TABLE_FULL',
    );
    expect(await staffIds()).toHaveLength(n);
  });
});

describe('seatMany 帶 allowOverflow（加入人員）：最多到這一桌 12 位（SEAT-R30、SEAT-R31、SEAT-R50、SEAT-AC93）', () => {
  it('10 位的桌加入 2 位：12 位、依勾選順序排到最後；復原後這 2 位回到未入座（SEAT-AC93、SEAT-R78）', async () => {
    const table5 = await seatNewEmployees(5, 10);
    const [a, b] = await unseatedMany(2);

    const result = await operate({ type: 'seatMany', tableId: 5, participantIds: [b, a], allowOverflow: true });
    expect(await roster(5)).toEqual([...table5, b, a]);

    await operate({ type: 'restore', snapshot: result.undo });
    expect(await roster(5)).toEqual(table5);
    for (const id of [a, b]) expect(await positionOf(id!)).toEqual(unseated);
  });

  it('10 位的桌加入 3 位：409 TABLE_LIMIT，整批不加入（SEAT-R30、COM-R07）', async () => {
    await seatNewEmployees(5, 10);
    const ids = await unseatedMany(3);
    const before = await allPositions();
    await expectError(
      await postOperation({ type: 'seatMany', tableId: 5, participantIds: ids, allowOverflow: true }),
      409,
      'TABLE_LIMIT',
    );
    expect(await allPositions()).toEqual(before);
  });

  it('7 位的桌加入 5 位：剛好 12 位（{k} 是 12 減這一桌的人數，SEAT-R30）', async () => {
    const table3 = await seatNewEmployees(3, 7);
    const ids = await unseatedMany(5);
    await operate({ type: 'seatMany', tableId: 3, participantIds: ids, allowOverflow: true });
    expect(await roster(3)).toEqual([...table3, ...ids]);
  });

  it('空桌一次加入 12 位', async () => {
    const ids = await unseatedMany(12);
    await operate({ type: 'seatMany', tableId: 9, participantIds: ids, allowOverflow: true });
    expect(await roster(9)).toEqual(ids);
    await expectAllContiguous();
  });

  it('工作人員桌 10 位加入 2 位：12 位；再加入 1 位：409 STAFF_TABLE_LIMIT（SEAT-R50）', async () => {
    await seatNewEmployees(STAFF_TABLE_ID, 10);
    const [a, b, c] = await unseatedMany(3);
    await operate({ type: 'seatMany', tableId: STAFF_TABLE_ID, participantIds: [a, b], allowOverflow: true });
    expect(await staffIds()).toHaveLength(12);
    await expectError(
      await postOperation({ type: 'seatMany', tableId: STAFF_TABLE_ID, participantIds: [c], allowOverflow: true }),
      409,
      'STAFF_TABLE_LIMIT',
    );
    expect(await positionOf(c!)).toEqual(unseated);
  });

  it('工作人員桌 11 位加入 2 位：409 STAFF_TABLE_LIMIT，整批不加入', async () => {
    await seatNewEmployees(STAFF_TABLE_ID, 11);
    const ids = await unseatedMany(2);
    await expectError(
      await postOperation({ type: 'seatMany', tableId: STAFF_TABLE_ID, participantIds: ids, allowOverflow: true }),
      409,
      'STAFF_TABLE_LIMIT',
    );
    expect(await staffIds()).toHaveLength(11);
  });
});

describe('restore、swap 上限 12 位（SEAT-R88、SEAT-AC98）', () => {
  it('11 位的第 5 桌移出一位後按「復原」：回到 11 位、原本的座號（SEAT-AC98）', async () => {
    const table5 = await seatNewEmployees(5, 11);
    const removed = await operate({ type: 'unseat', participantId: table5[4] });
    expect(await roster(5)).toHaveLength(10);
    await operate({ type: 'restore', snapshot: removed.undo });
    expect(await roster(5)).toEqual(table5);
    expect(await positionOf(table5[4]!)).toEqual({ tableId: 5, seatOrder: 4 });
  });

  it('11 位的第 5 桌和 9 位的第 6 桌對調：名單整組交換，第 6 桌變成 11 位；復原後回到對調前（SEAT-R35、SEAT-AC98）', async () => {
    const table5 = await seatNewEmployees(5, 11);
    const table6 = await seatNewEmployees(6, 9);
    const result = await operate({ type: 'swap', tableA: 5, tableB: 6 });
    expect(await roster(6)).toEqual(table5);
    expect(await roster(5)).toEqual(table6);
    await operate({ type: 'restore', snapshot: result.undo });
    expect(await roster(5)).toEqual(table5);
    expect(await roster(6)).toEqual(table6);
  });

  it('12 位的桌和 12 位的桌對調：都可以', async () => {
    const table5 = await seatNewEmployees(5, 12);
    const table6 = await seatNewEmployees(6, 12);
    await operate({ type: 'swap', tableA: 6, tableB: 5 });
    expect(await roster(5)).toEqual(table6);
    expect(await roster(6)).toEqual(table5);
  });

  it('工作人員桌 12 位移出一位、別人補進第 12 位後再復原：409 STAFF_TABLE_LIMIT，資料不變（COM-R07）', async () => {
    const staff = await seatNewEmployees(STAFF_TABLE_ID, 12);
    const removed = await operate({ type: 'unseat', participantId: staff[0] });
    const other = await newUnseated();
    await operate({ type: 'seat', participantId: other, tableId: STAFF_TABLE_ID, allowOverflow: true });
    const before = await allPositions();
    await expectError(await postOperation({ type: 'restore', snapshot: removed.undo }), 409, 'STAFF_TABLE_LIMIT');
    expect(await allPositions()).toEqual(before);
  });
});

describe('autoArrange 每桌只排到 10 位（ARR-R17）', () => {
  it('只排未入座：第 1 桌 11 位算沒有空位、不再排人；第 2 桌 9 位只排到第 10 位，其餘排到第 3 桌', async () => {
    const table1 = await seatNewEmployees(1, 11);
    const table2 = await seatNewEmployees(2, 9);
    const ids = await unseatedMany(3);

    const result = await operate({ type: 'autoArrange', mode: 'unseatedOnly' });

    expect(result.summary).toEqual({ placed: 3, tableIds: [2, 3], left: 0 });
    expect(await roster(1)).toEqual(table1);
    expect(await roster(2)).toEqual([...table2, ids[0]]);
    expect(await roster(3)).toEqual(ids.slice(1));
    await expectAllContiguous();
  });

  it('清空後重排：沒有備註名稱的 11 位桌清空後每桌最多 10 位；有備註名稱的 12 位桌不動', async () => {
    const table1 = await seatNewEmployees(1, 12);
    await prisma.seatTable.update({ where: { id: 1 }, data: { noteName: '主桌' } });
    const table2 = await seatNewEmployees(2, 11);

    const result = await operate({ type: 'autoArrange', mode: 'rebuild' });

    expect(result.summary).toEqual({ placed: 11, tableIds: [2, 3], left: 0 });
    expect(await roster(1)).toEqual(table1);
    expect(await roster(2)).toEqual(table2.slice(0, 10));
    expect(await roster(3)).toEqual(table2.slice(10));
    await expectAllContiguous();
  });

  it('復原自動排座：11 位的桌與其他桌都回到排座之前（ARR-R13）', async () => {
    const table1 = await seatNewEmployees(1, 11);
    const ids = await unseatedMany(2);
    const before = await allPositions();
    const result = await operate({ type: 'autoArrange', mode: 'unseatedOnly' });
    expect(await roster(2)).toEqual(ids);
    await operate({ type: 'restore', snapshot: result.undo });
    expect(await allPositions()).toEqual(before);
    expect(await roster(1)).toEqual(table1);
  });
});

describe('別人剛改過資料（SEAT-R86、SEAT-AC88、SEAT-AC97）', () => {
  it('畫面上第 5 桌 11 位、別人已把它坐到 12 位：拖移 409 TABLE_LIMIT，這次不儲存（SEAT-AC88）', async () => {
    await seatNewEmployees(5, 11);
    const wang = await newUnseated({ name: '王小明' });
    // 別人剛把第 12 位坐進去
    const { participant: other } = await createRegisteredEmployee({ name: '別人加的' }, { tableId: 5, seatOrder: 11 });
    const before = await allPositions();

    await expectError(
      await postOperation({ type: 'seat', participantId: wang, tableId: 5, allowOverflow: true }),
      409,
      'TABLE_LIMIT',
    );
    expect(await allPositions()).toEqual(before);
    expect(await roster(5)).toContain(other.id);
  });

  it('從選擇桌次選第 6 桌時別人已把第 6 桌坐到 10 位：不帶 allowOverflow，409 TABLE_FULL（SEAT-AC97）', async () => {
    await seatNewEmployees(6, 10);
    const wang = await newUnseated();
    await expectError(await postOperation({ type: 'seat', participantId: wang, tableId: 6 }), 409, 'TABLE_FULL');
    expect(await positionOf(wang)).toEqual(unseated);
  });
});
