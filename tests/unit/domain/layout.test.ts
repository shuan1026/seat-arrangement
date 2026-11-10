// 30 桌與工作人員桌的排列：docs/spec/seating.md 第 2.1.4 節的桌號與位置代碼對照、欄與列；SEAT-R01、R03～R05。
import { describe, expect, it } from 'vitest';
import { STAFF_TABLE_ID, TABLE_COUNT } from '@/contracts/entities';
import { LAYOUT_COLUMNS, LAYOUT_ROWS, placementOf, STAFF_TABLE_PLACEMENT, TABLE_LAYOUT } from '@/domain/layout';

// 2.1.4「桌號與位置代碼的對應」
const CODE_BY_TABLE: Record<number, string> = {
  1: 'B-1',
  2: 'A-1',
  3: 'B-4',
  4: 'B-7',
  5: 'B-10',
  6: 'B-13',
  7: 'B-2',
  8: 'B-5',
  9: 'B-8',
  10: 'B-11',
  11: 'B-14',
  12: 'B-3',
  13: 'B-6',
  14: 'B-9',
  15: 'B-12',
  16: 'B-15',
  17: 'A-3',
  18: 'A-6',
  19: 'A-9',
  20: 'A-12',
  21: 'A-15',
  22: 'A-2',
  23: 'A-5',
  24: 'A-8',
  25: 'A-11',
  26: 'A-14',
  27: 'A-4',
  28: 'A-7',
  29: 'A-10',
  30: 'A-13',
};

// 2.1.4「依示意圖換成欄與列」：欄由左到右，列 0 最靠近舞台，0.5 表示錯開半格
const COLUMNS = ['A 外', 'A 中', 'A 內', 'B 內', 'B 中', 'B 外'] as const;
type Column = (typeof COLUMNS)[number];
const GRID: { row: number; cells: Partial<Record<Column, number | 'STAFF'>> }[] = [
  { row: 0, cells: { 'A 內': 2, 'B 內': 1, 'B 外': 'STAFF' } },
  { row: 0.5, cells: { 'A 中': 22, 'B 中': 7 } },
  { row: 1, cells: { 'A 外': 27, 'A 內': 17, 'B 內': 12, 'B 外': 3 } },
  { row: 1.5, cells: { 'A 中': 23, 'B 中': 8 } },
  { row: 2, cells: { 'A 外': 28, 'A 內': 18, 'B 內': 13, 'B 外': 4 } },
  { row: 2.5, cells: { 'A 中': 24, 'B 中': 9 } },
  { row: 3, cells: { 'A 外': 29, 'A 內': 19, 'B 內': 14, 'B 外': 5 } },
  { row: 3.5, cells: { 'A 中': 25, 'B 中': 10 } },
  { row: 4, cells: { 'A 外': 30, 'A 內': 20, 'B 內': 15, 'B 外': 6 } },
  { row: 4.5, cells: { 'A 中': 26, 'B 中': 11 } },
  { row: 5, cells: { 'A 內': 21, 'B 內': 16 } },
];

const expectedPositions = new Map<number | 'STAFF', { col: number; row: number }>();
for (const { row, cells } of GRID) {
  for (const [column, table] of Object.entries(cells) as [Column, number | 'STAFF'][]) {
    expectedPositions.set(table, { col: COLUMNS.indexOf(column), row });
  }
}

const tableIds = Array.from({ length: TABLE_COUNT }, (_, i) => i + 1);

describe('30 桌（SEAT-R01）', () => {
  it('共 30 桌，桌號 1–30 各一桌', () => {
    expect(TABLE_COUNT).toBe(30);
    expect(TABLE_LAYOUT).toHaveLength(30);
    expect(TABLE_LAYOUT.map((t) => t.id).sort((a, b) => a - b)).toEqual(tableIds);
  });

  it('不在 30 桌與工作人員桌裡的桌號沒有位置', () => {
    expect(placementOf(31)).toBeUndefined();
    expect(placementOf(-1)).toBeUndefined();
  });
});

describe('桌號與位置代碼對照（2.1.4、SEAT-R04）', () => {
  it.each(tableIds)('第 %i 桌的位置代碼依規格對照表', (id) => {
    expect(placementOf(id)?.code).toBe(CODE_BY_TABLE[id]);
  });

  it('A-1～A-15、B-1～B-15 每個位置代碼剛好一桌', () => {
    const expected = ['A', 'B'].flatMap((zone) => Array.from({ length: 15 }, (_, i) => `${zone}-${i + 1}`)).sort();
    expect(TABLE_LAYOUT.map((t) => t.code).sort()).toEqual(expected);
  });
});

describe('欄與列（2.1.4、SEAT-R03）', () => {
  it.each(tableIds)('第 %i 桌在規格表上的欄與列', (id) => {
    const placement = placementOf(id);
    expect(placement).toMatchObject(expectedPositions.get(id) ?? {});
    expect(expectedPositions.has(id)).toBe(true);
  });

  it('A 區 15 桌在左邊三欄、B 區 15 桌在右邊三欄', () => {
    for (const t of TABLE_LAYOUT) {
      if (t.code.startsWith('A-')) expect(t.col, `第 ${t.id} 桌`).toBeLessThan(3);
      else expect(t.col, `第 ${t.id} 桌`).toBeGreaterThanOrEqual(3);
    }
  });

  it('相鄰的列錯開半格：中間欄在半格上，外側與內側欄在整格上', () => {
    for (const t of TABLE_LAYOUT) {
      const middle = COLUMNS[t.col] === 'A 中' || COLUMNS[t.col] === 'B 中';
      expect(Number.isInteger(t.row), `第 ${t.id} 桌`).toBe(!middle);
    }
  });

  it('主桌（第 1、2 桌）最靠近舞台，在 A 內與 B 內兩欄', () => {
    const minRow = Math.min(...TABLE_LAYOUT.map((t) => t.row));
    expect(placementOf(1)?.row).toBe(minRow);
    expect(placementOf(2)?.row).toBe(minRow);
    expect(COLUMNS[placementOf(2)?.col ?? -1]).toBe('A 內');
    expect(COLUMNS[placementOf(1)?.col ?? -1]).toBe('B 內');
  });

  it('沒有兩桌在同一個位置，而且都在場地範圍內', () => {
    const all = [...TABLE_LAYOUT, STAFF_TABLE_PLACEMENT];
    const keys = all.map((t) => `${t.col}:${t.row}`);
    expect(new Set(keys).size).toBe(all.length);
    for (const t of all) {
      expect(t.col).toBeGreaterThanOrEqual(0);
      expect(t.col).toBeLessThan(LAYOUT_COLUMNS);
      expect(t.row).toBeGreaterThanOrEqual(0);
      expect(t.row).toBeLessThan(LAYOUT_ROWS);
    }
  });
});

describe('工作人員桌（SEAT-R05）', () => {
  it('不編號，用工作人員桌的固定 id 取得位置', () => {
    expect(STAFF_TABLE_PLACEMENT.id).toBe(STAFF_TABLE_ID);
    expect(placementOf(STAFF_TABLE_ID)).toEqual(STAFF_TABLE_PLACEMENT);
    expect(TABLE_LAYOUT.some((t) => t.id === STAFF_TABLE_ID)).toBe(false);
  });

  it('在 B 外側欄最上面（規格表第 0 列）', () => {
    expect(STAFF_TABLE_PLACEMENT).toMatchObject(expectedPositions.get('STAFF') ?? {});
    expect(COLUMNS[STAFF_TABLE_PLACEMENT.col]).toBe('B 外');
  });

  it('在第 3 桌的正上方', () => {
    const t3 = placementOf(3);
    expect(STAFF_TABLE_PLACEMENT.col).toBe(t3?.col);
    expect(STAFF_TABLE_PLACEMENT.row).toBeLessThan(t3?.row ?? -1);
    const sameColumn = TABLE_LAYOUT.filter((t) => t.col === STAFF_TABLE_PLACEMENT.col);
    expect(Math.min(...sameColumn.map((t) => t.row))).toBe(t3?.row);
  });
});
