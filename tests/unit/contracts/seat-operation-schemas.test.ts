// 座位異動指令與桌次備註名稱的輸入格式：docs/architecture.md 第 8.1 節；docs/spec/seating.md
// SEAT-R01、SEAT-R02（30 個位置、每桌標準 10 位、最多 12 位，D-018）、SEAT-R12（清空備註名稱就移除）、SEAT-R34（工作人員桌不能調整順序）、
// SEAT-R40、SEAT-R50（放進工作人員桌）、SEAT-R48（工作人員桌不能對調、沒有清空桌次）、
// SEAT-R30、SEAT-R88（拖移與「加入人員」的 seat、seatMany 帶 allowOverflow，最多 12 位）；
// D-027：SEAT-R35（moveTable：to 是位置 1–30 或暫存區，expectedTableId 是畫面上目標位置的桌，「未放桌」是 null）、
// SEAT-R96（createTable：在位置 1–30 新增一桌）、SEAT-R97（deleteTable）、SEAT-R98（工作人員桌不能搬動、刪除）、SEAT-R78（restore 的快照記桌子的位置、
// 暫存順序、備註名稱與 exists）。原本的 swap 指令拿掉，對調改用 moveTable（兩桌交換位置）。
// 桌子的 id 不再限制 1–30（D-027）：一般桌是 1 以上的整數（新增的桌從 31 起），工作人員桌是 0。
import { describe, expect, it } from 'vitest';
import { seatTableSchema } from '@/contracts/entities';
import { seatingOperationSchema, seatingResultSchema, tableUpdateSchema } from '@/contracts/seating';
import { accepts } from '../../helpers/schema';

const ok = (input: unknown) => accepts(seatingOperationSchema, input);

describe('seat：入座、搬移、放進工作人員桌', () => {
  // API 的桌次用桌子的 id：既有的 30 桌是 1–30、新增的桌從 31 起，工作人員桌 0（docs/architecture.md「桌號」、D-019、D-027）
  it.each([1, 30, 31, 57, 0])('可以放到 id %i 的桌（0 是工作人員桌，31 起是新增的桌）', (tableId) => {
    expect(ok({ type: 'seat', participantId: 1, tableId })).toBe(true);
  });

  it.each([-1, 1.5])('桌子的 id %s 格式不對', (tableId) => {
    expect(ok({ type: 'seat', participantId: 1, tableId })).toBe(false);
  });

  it.each(['A1', 'B15', '1'])('API 不收桌號字串「%s」，只收內部編號（D-019）', (tableId) => {
    expect(ok({ type: 'seat', participantId: 1, tableId })).toBe(false);
  });

  it('可以指定放在名單的第幾列；不能是負數', () => {
    expect(ok({ type: 'seat', participantId: 1, tableId: 3, index: 0 })).toBe(true);
    expect(ok({ type: 'seat', participantId: 1, tableId: 3, index: 4 })).toBe(true);
    expect(ok({ type: 'seat', participantId: 1, tableId: 3, index: -1 })).toBe(false);
  });

  it('要指定是哪一位', () => {
    expect(ok({ type: 'seat', tableId: 3 })).toBe(false);
  });

  it('拖移帶 allowOverflow（true 或 false），可省略；解析後保留這個值（docs/architecture.md 第 8.1 節、SEAT-R88）', () => {
    expect(ok({ type: 'seat', participantId: 1, tableId: 3, allowOverflow: true })).toBe(true);
    expect(ok({ type: 'seat', participantId: 1, tableId: 0, allowOverflow: true })).toBe(true);
    expect(ok({ type: 'seat', participantId: 1, tableId: 3, index: 10, allowOverflow: true })).toBe(true);
    expect(ok({ type: 'seat', participantId: 1, tableId: 3, allowOverflow: false })).toBe(true);
    expect(seatingOperationSchema.parse({ type: 'seat', participantId: 1, tableId: 3, allowOverflow: true })).toEqual({
      type: 'seat',
      participantId: 1,
      tableId: 3,
      allowOverflow: true,
    });
  });

  it('allowOverflow 只能是布林值', () => {
    expect(ok({ type: 'seat', participantId: 1, tableId: 3, allowOverflow: 'yes' })).toBe(false);
    expect(ok({ type: 'seat', participantId: 1, tableId: 3, allowOverflow: 1 })).toBe(false);
  });
});

describe('seatMany：加入人員', () => {
  it('可以加入一般桌與工作人員桌', () => {
    expect(ok({ type: 'seatMany', tableId: 3, participantIds: [1, 2, 3] })).toBe(true);
    expect(ok({ type: 'seatMany', tableId: 0, participantIds: [1, 2] })).toBe(true);
  });

  // 原本是「一次最多 10 位」；D-018 起空桌按「加入人員」最多可以勾 12 位（SEAT-R30：{k} 是 12 減這一桌的人數）
  it('一次最多 12 位（每桌最多 12 位，SEAT-R02、SEAT-R30）', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(ok({ type: 'seatMany', tableId: 3, participantIds: twelve.slice(0, 10) })).toBe(true);
    expect(ok({ type: 'seatMany', tableId: 3, participantIds: twelve, allowOverflow: true })).toBe(true);
    expect(ok({ type: 'seatMany', tableId: 3, participantIds: [...twelve, 13], allowOverflow: true })).toBe(false);
  });

  it('「加入人員」帶 allowOverflow，解析後保留這個值（docs/architecture.md 第 8.1 節）', () => {
    expect(ok({ type: 'seatMany', tableId: 0, participantIds: [1], allowOverflow: true })).toBe(true);
    expect(seatingOperationSchema.parse({ type: 'seatMany', tableId: 3, participantIds: [1, 2], allowOverflow: true })).toEqual({
      type: 'seatMany',
      tableId: 3,
      participantIds: [1, 2],
      allowOverflow: true,
    });
    expect(ok({ type: 'seatMany', tableId: 3, participantIds: [1], allowOverflow: 'true' })).toBe(false);
  });

  it('新增的桌（id 31 起）也可以加入；id 不能是負數或小數（D-027）', () => {
    expect(ok({ type: 'seatMany', tableId: 31, participantIds: [1] })).toBe(true);
    expect(ok({ type: 'seatMany', tableId: -1, participantIds: [1] })).toBe(false);
    expect(ok({ type: 'seatMany', tableId: 3.5, participantIds: [1] })).toBe(false);
  });
});

describe('unseat：移出桌次或工作人員桌', () => {
  it('指定哪一位就可以', () => {
    expect(ok({ type: 'unseat', participantId: 1 })).toBe(true);
    expect(ok({ type: 'unseat' })).toBe(false);
  });
});

describe('reorder：桌內調整順序', () => {
  it('一般桌可以調整順序', () => {
    expect(ok({ type: 'reorder', tableId: 3, participantIds: [3, 1, 2] })).toBe(true);
  });

  it('工作人員桌不能調整順序（SEAT-R34）', () => {
    expect(ok({ type: 'reorder', tableId: 0, participantIds: [1, 2] })).toBe(false);
  });

  it('新增的桌（id 31 起）也可以調整順序（D-027）', () => {
    expect(ok({ type: 'reorder', tableId: 31, participantIds: [2, 1] })).toBe(true);
  });

  // 原本是「名單最多 10 位」；D-018 起一桌可以有 12 位，12 位的桌也要能調整順序（SEAT-R02、SEAT-R33）
  it('名單最多 12 位', () => {
    expect(ok({ type: 'reorder', tableId: 3, participantIds: Array.from({ length: 12 }, (_, i) => i + 1) })).toBe(true);
    expect(ok({ type: 'reorder', tableId: 3, participantIds: Array.from({ length: 13 }, (_, i) => i + 1) })).toBe(
      false,
    );
  });
});

describe('clear：清空桌次', () => {
  it('一般桌可以清空', () => {
    expect(ok({ type: 'clear', tableId: 3 })).toBe(true);
  });

  it('工作人員桌沒有清空桌次（SEAT-R48）', () => {
    expect(ok({ type: 'clear', tableId: 0 })).toBe(false);
  });

  it('新增的桌（id 31 起）也可以清空（D-027）', () => {
    expect(ok({ type: 'clear', tableId: 31 })).toBe(true);
  });
});

describe('swap：拿掉了（D-027，對調改用 moveTable）', () => {
  it('不再接受 swap 指令', () => {
    expect(ok({ type: 'swap', tableA: 3, tableB: 7 })).toBe(false);
  });
});

describe('moveTable：搬動桌子（SEAT-R35、SEAT-R91、SEAT-R93、D-027）', () => {
  it('搬到另一個位置（1–30）：expectedTableId 是畫面上那個位置目前的桌', () => {
    expect(ok({ type: 'moveTable', tableId: 3, to: 7, expectedTableId: 7 })).toBe(true);
    expect(ok({ type: 'moveTable', tableId: 3, to: 1, expectedTableId: 1 })).toBe(true);
    expect(ok({ type: 'moveTable', tableId: 3, to: 30, expectedTableId: 30 })).toBe(true);
  });

  it('搬到「未放桌」的位置：expectedTableId 是 null', () => {
    expect(ok({ type: 'moveTable', tableId: 3, to: 9, expectedTableId: null })).toBe(true);
  });

  it('移到暫存區：to 是 \'staging\'，expectedTableId 傳 null', () => {
    expect(ok({ type: 'moveTable', tableId: 3, to: 'staging', expectedTableId: null })).toBe(true);
  });

  it('暫存的桌（新增的桌 id 31 起也一樣）放回位置', () => {
    expect(ok({ type: 'moveTable', tableId: 31, to: 17, expectedTableId: null })).toBe(true);
    expect(ok({ type: 'moveTable', tableId: 31, to: 7, expectedTableId: 7 })).toBe(true);
  });

  it.each([0, 31, -1, 1.5, '7', 'A1', 'B4'])('to 只能是位置 1–30 或 \'staging\'：%s 不接受（API 不收桌號，D-019）', (to) => {
    expect(ok({ type: 'moveTable', tableId: 3, to, expectedTableId: null })).toBe(false);
  });

  it('其他字串（例如 \'stage\'、\'暫存區\'）不是暫存區', () => {
    expect(ok({ type: 'moveTable', tableId: 3, to: 'stage', expectedTableId: null })).toBe(false);
    expect(ok({ type: 'moveTable', tableId: 3, to: '暫存區', expectedTableId: null })).toBe(false);
  });

  it('一定要有 expectedTableId（「未放桌」寫 null，不能省略）', () => {
    expect(ok({ type: 'moveTable', tableId: 3, to: 9 })).toBe(false);
    expect(ok({ type: 'moveTable', tableId: 3, to: 9, expectedTableId: 'B8' })).toBe(false);
  });

  it('要指定是哪一張桌；id 不能是負數（工作人員桌被拒在 API 層檢查，SEAT-R98）', () => {
    expect(ok({ type: 'moveTable', to: 9, expectedTableId: null })).toBe(false);
    expect(ok({ type: 'moveTable', tableId: -1, to: 9, expectedTableId: null })).toBe(false);
  });
});

describe('createTable：在「未放桌」的位置新增一桌（SEAT-R96、D-027）', () => {
  it.each([1, 9, 30])('位置 %i', (position) => {
    expect(ok({ type: 'createTable', position })).toBe(true);
  });

  it.each([0, 31, -1, 2.5, 'B8'])('位置只能是 1–30：%s 不接受', (position) => {
    expect(ok({ type: 'createTable', position })).toBe(false);
  });

  it('不能新增在暫存區、一定要有位置', () => {
    expect(ok({ type: 'createTable', position: 'staging' })).toBe(false);
    expect(ok({ type: 'createTable' })).toBe(false);
  });
});

describe('deleteTable：刪除桌（SEAT-R97、D-027）', () => {
  it('場上的桌、暫存的桌、新增的桌都可以刪', () => {
    expect(ok({ type: 'deleteTable', tableId: 3 })).toBe(true);
    expect(ok({ type: 'deleteTable', tableId: 31 })).toBe(true);
  });

  it('要指定是哪一張桌；id 不能是負數或小數', () => {
    expect(ok({ type: 'deleteTable' })).toBe(false);
    expect(ok({ type: 'deleteTable', tableId: -1 })).toBe(false);
    expect(ok({ type: 'deleteTable', tableId: 1.5 })).toBe(false);
  });
});

describe('autoArrange：自動排座', () => {
  it.each(['unseatedOnly', 'rebuild'])('範圍 %s', (mode) => {
    expect(ok({ type: 'autoArrange', mode })).toBe(true);
  });

  it('其他範圍不接受', () => {
    expect(ok({ type: 'autoArrange', mode: 'all' })).toBe(false);
    expect(ok({ type: 'autoArrange' })).toBe(false);
  });
});

describe('restore：復原', () => {
  it('送回操作前的狀態：人的座位，以及桌子的位置、暫存順序、備註名稱與操作前是否存在（D-027、docs/architecture.md 第 8.1 節）', () => {
    expect(
      ok({
        type: 'restore',
        snapshot: {
          participants: [
            { id: 1, tableId: 3, seatOrder: 1 },
            { id: 2, tableId: null, seatOrder: null },
          ],
          tables: [
            { id: 3, kind: 'NORMAL', position: 3, stagedAt: null, noteName: '主桌', exists: true },
            { id: 7, kind: 'NORMAL', position: null, stagedAt: '2026-11-11T08:00:00.000Z', noteName: null, exists: true },
            { id: 31, kind: 'NORMAL', position: null, stagedAt: null, noteName: null, exists: false },
          ],
        },
      }),
    ).toBe(true);
  });

  it('沒有動到桌子時 tables 是空陣列', () => {
    expect(ok({ type: 'restore', snapshot: { participants: [{ id: 1, tableId: null, seatOrder: null }], tables: [] } })).toBe(true);
  });

  it('沒有狀態不能復原', () => {
    expect(ok({ type: 'restore' })).toBe(false);
    expect(ok({ type: 'restore', snapshot: { participants: [{ id: 1 }] } })).toBe(false);
  });

  it('桌子的快照要有 position、stagedAt、noteName 與 exists（只有 id、noteName 的舊格式不接受）', () => {
    const table = { id: 3, kind: 'NORMAL', position: 3, stagedAt: null, noteName: '主桌', exists: true };
    for (const missing of ['position', 'stagedAt', 'noteName', 'exists']) {
      const rest = Object.fromEntries(Object.entries(table).filter(([key]) => key !== missing));
      expect(ok({ type: 'restore', snapshot: { participants: [], tables: [rest] } }), missing).toBe(false);
    }
    expect(ok({ type: 'restore', snapshot: { participants: [], tables: [{ id: 3, noteName: '主桌' }] } })).toBe(false);
    expect(ok({ type: 'restore', snapshot: { participants: [], tables: [{ ...table, exists: 'yes' }] } })).toBe(false);
  });
});

describe('seatTableSchema：桌子（D-027、docs/architecture.md 第 7.1 節）', () => {
  it('場上的桌：position 是 1–30 的位置，stagedAt 是 null', () => {
    expect(accepts(seatTableSchema, { id: 3, kind: 'NORMAL', position: 3, stagedAt: null, noteName: '主桌' })).toBe(true);
  });

  it('暫存的桌：position 是 null，stagedAt 是 ISO 字串', () => {
    expect(
      accepts(seatTableSchema, { id: 31, kind: 'NORMAL', position: null, stagedAt: '2026-11-11T08:00:00.000Z', noteName: null }),
    ).toBe(true);
  });

  it('工作人員桌：id 0、kind STAFF、position null', () => {
    expect(accepts(seatTableSchema, { id: 0, kind: 'STAFF', position: null, stagedAt: null, noteName: null })).toBe(true);
  });

  it('一定要有 position 與 stagedAt（沒有位置是 null，不是省略）', () => {
    expect(accepts(seatTableSchema, { id: 3, kind: 'NORMAL', noteName: null })).toBe(false);
    expect(accepts(seatTableSchema, { id: 3, kind: 'NORMAL', position: 3, noteName: null })).toBe(false);
    expect(accepts(seatTableSchema, { id: 3, kind: 'NORMAL', stagedAt: null, noteName: null })).toBe(false);
  });

  it('stagedAt 是字串，不是數字', () => {
    expect(accepts(seatTableSchema, { id: 31, kind: 'NORMAL', position: null, stagedAt: 1731312000000, noteName: null })).toBe(false);
  });
});

describe('seatingResultSchema：回應帶這次刪除的桌（D-027）', () => {
  const base = { participants: [], tables: [], undo: { participants: [], tables: [] } };

  it('deletedTableIds 是這次刪除的桌的 id（沒有刪除時是空陣列）', () => {
    expect(accepts(seatingResultSchema, { ...base, deletedTableIds: [] })).toBe(true);
    expect(accepts(seatingResultSchema, { ...base, deletedTableIds: [3] })).toBe(true);
  });

  it('tables 裡的桌是完整的 SeatTable（含 position、stagedAt）', () => {
    expect(
      accepts(seatingResultSchema, {
        ...base,
        deletedTableIds: [],
        tables: [{ id: 3, kind: 'NORMAL', position: null, stagedAt: '2026-11-11T08:00:00.000Z', noteName: '主桌' }],
      }),
    ).toBe(true);
    expect(accepts(seatingResultSchema, { ...base, deletedTableIds: [], tables: [{ id: 3, kind: 'NORMAL', noteName: '主桌' }] })).toBe(false);
  });
});

describe('不認得的指令', () => {
  it('不接受', () => {
    expect(ok({ type: 'teleport', participantId: 1, tableId: 3 })).toBe(false);
    expect(ok({ participantId: 1, tableId: 3 })).toBe(false);
  });
});

describe('tableUpdateSchema：備註名稱（SEAT-R12；SEAT-Q13 的目前假設，D-008）', () => {
  it('照填入的文字儲存', () => {
    expect(tableUpdateSchema.parse({ noteName: '主桌' })).toEqual({ noteName: '主桌' });
    expect(tableUpdateSchema.parse({ noteName: '董事貴賓' })).toEqual({ noteName: '董事貴賓' });
  });

  it('把欄位清空就移除備註名稱', () => {
    expect(tableUpdateSchema.parse({ noteName: '' })).toEqual({ noteName: null });
    expect(tableUpdateSchema.parse({ noteName: null })).toEqual({ noteName: null });
  });

  it('去掉前後空白', () => {
    expect(tableUpdateSchema.parse({ noteName: '  主桌  ' })).toEqual({ noteName: '主桌' });
    expect(tableUpdateSchema.parse({ noteName: '　供應商　' })).toEqual({ noteName: '供應商' });
  });

  it('只有空白時視為清空，移除備註名稱', () => {
    expect(tableUpdateSchema.parse({ noteName: '   ' })).toEqual({ noteName: null });
    expect(tableUpdateSchema.parse({ noteName: '　' })).toEqual({ noteName: null });
  });

  it('最多 20 字（去掉前後空白後計算）', () => {
    const twenty = '備'.repeat(20);
    expect(tableUpdateSchema.parse({ noteName: twenty })).toEqual({ noteName: twenty });
    expect(tableUpdateSchema.parse({ noteName: ` ${twenty} ` })).toEqual({ noteName: twenty });
    expect(accepts(tableUpdateSchema, { noteName: '備'.repeat(21) })).toBe(false);
  });
});
