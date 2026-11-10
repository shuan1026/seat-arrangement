// 座位異動指令與桌次備註名稱的輸入格式：docs/architecture.md 第 8.1 節；docs/spec/seating.md
// SEAT-R01、SEAT-R02（30 桌、每桌 10 位）、SEAT-R12（清空備註名稱就移除）、SEAT-R34（工作人員桌不能調整順序）、
// SEAT-R40、SEAT-R50（放進工作人員桌）、SEAT-R48（工作人員桌不能對調、沒有清空桌次）。
import { describe, expect, it } from 'vitest';
import { seatingOperationSchema, tableUpdateSchema } from '@/contracts/seating';
import { accepts } from '../../helpers/schema';

const ok = (input: unknown) => accepts(seatingOperationSchema, input);

describe('seat：入座、搬移、放進工作人員桌', () => {
  it.each([1, 30, 0])('可以放到第 %i 桌（0 是工作人員桌）', (tableId) => {
    expect(ok({ type: 'seat', participantId: 1, tableId })).toBe(true);
  });

  it.each([31, -1, 1.5])('桌號 %s 不存在', (tableId) => {
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
});

describe('seatMany：加入人員', () => {
  it('可以加入一般桌與工作人員桌', () => {
    expect(ok({ type: 'seatMany', tableId: 3, participantIds: [1, 2, 3] })).toBe(true);
    expect(ok({ type: 'seatMany', tableId: 0, participantIds: [1, 2] })).toBe(true);
  });

  it('一次最多 10 位（每桌 10 個座位）', () => {
    const ten = Array.from({ length: 10 }, (_, i) => i + 1);
    expect(ok({ type: 'seatMany', tableId: 3, participantIds: ten })).toBe(true);
    expect(ok({ type: 'seatMany', tableId: 3, participantIds: [...ten, 11] })).toBe(false);
  });

  it('桌號 31 不存在', () => {
    expect(ok({ type: 'seatMany', tableId: 31, participantIds: [1] })).toBe(false);
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

  it('名單最多 10 位', () => {
    expect(ok({ type: 'reorder', tableId: 3, participantIds: Array.from({ length: 11 }, (_, i) => i + 1) })).toBe(
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

  it('桌號 31 不存在', () => {
    expect(ok({ type: 'clear', tableId: 31 })).toBe(false);
  });
});

describe('swap：對調桌次', () => {
  it('兩張一般桌可以對調', () => {
    expect(ok({ type: 'swap', tableA: 3, tableB: 7 })).toBe(true);
    expect(ok({ type: 'swap', tableA: 1, tableB: 30 })).toBe(true);
  });

  it('工作人員桌不能對調（SEAT-R48）', () => {
    expect(ok({ type: 'swap', tableA: 0, tableB: 7 })).toBe(false);
    expect(ok({ type: 'swap', tableA: 3, tableB: 0 })).toBe(false);
  });

  it('桌號 31 不存在', () => {
    expect(ok({ type: 'swap', tableA: 3, tableB: 31 })).toBe(false);
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
  it('送回操作前的狀態', () => {
    expect(
      ok({
        type: 'restore',
        snapshot: {
          participants: [
            { id: 1, tableId: 3, seatOrder: 1 },
            { id: 2, tableId: null, seatOrder: null },
          ],
          tables: [{ id: 3, noteName: '主桌' }],
        },
      }),
    ).toBe(true);
  });

  it('沒有狀態不能復原', () => {
    expect(ok({ type: 'restore' })).toBe(false);
    expect(ok({ type: 'restore', snapshot: { participants: [{ id: 1 }] } })).toBe(false);
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
