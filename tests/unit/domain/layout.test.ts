// 30 桌與工作人員桌的排列與桌號：docs/spec/seating.md 第 2.1.4 節（桌號與位置、欄與列）；SEAT-R01、R03～R05；
// docs/decision-record.md D-019（內部編號 1–30 ↔ 桌號 A1～A15、B1～B15 的對應、清單順序、填桌順序）；
// docs/architecture.md「桌號」（資料庫與 API 用內部編號，畫面、匯出與網址參數用桌號，對應寫在 src/domain/layout.ts）；
// docs/spec/auto-arrange.md「填桌順序」。
//
// 假設 src/domain/layout.ts 另外匯出（實作請照這個介面）：
//   export function tableCodeOf(tableId: number): string | undefined;   // 內部編號 → 桌號，例如 1 → 'B1'；工作人員桌與 1–30 以外是 undefined
//   export function tableIdOfCode(code: string): number | undefined;    // 桌號 → 內部編號，例如 'A1' → 2；不是 A1～A15、B1～B15 是 undefined
//   export const TABLE_CODES_IN_ORDER: readonly string[];               // 清單順序：A1～A15，再 B1～B15（SEAT-R04）
//   export const FILL_ORDER: readonly number[];                         // 自動排座的填桌順序（內部編號）：1、2、3…30
// 預期值照規格寫死（tests/helpers/table-codes.ts），不從實作推導。
import { describe, expect, it } from 'vitest';
import { STAFF_TABLE_ID, TABLE_COUNT } from '@/contracts/entities';
import {
  FILL_ORDER,
  LAYOUT_COLUMNS,
  LAYOUT_ROWS,
  placementOf,
  STAFF_TABLE_PLACEMENT,
  TABLE_CODES_IN_ORDER,
  TABLE_LAYOUT,
  tableCodeOf,
  tableIdOfCode,
} from '@/domain/layout';
import { CODES_IN_LIST_ORDER, codeOf, FILL_ORDER_CODES, idOfCode } from '../../helpers/table-codes';

// 2.1.4「依示意圖換成欄與列」（表內是桌號）：欄由左到右，列 0 最靠近舞台，0.5 表示錯開半格
const COLUMNS = ['A 外', 'A 中', 'A 內', 'B 內', 'B 中', 'B 外'] as const;
type Column = (typeof COLUMNS)[number];
const GRID: { row: number; cells: Partial<Record<Column, string>> }[] = [
  { row: 0, cells: { 'A 內': 'A1', 'B 內': 'B1', 'B 外': 'STAFF' } },
  { row: 0.5, cells: { 'A 中': 'A2', 'B 中': 'B2' } },
  { row: 1, cells: { 'A 外': 'A4', 'A 內': 'A3', 'B 內': 'B3', 'B 外': 'B4' } },
  { row: 1.5, cells: { 'A 中': 'A5', 'B 中': 'B5' } },
  { row: 2, cells: { 'A 外': 'A7', 'A 內': 'A6', 'B 內': 'B6', 'B 外': 'B7' } },
  { row: 2.5, cells: { 'A 中': 'A8', 'B 中': 'B8' } },
  { row: 3, cells: { 'A 外': 'A10', 'A 內': 'A9', 'B 內': 'B9', 'B 外': 'B10' } },
  { row: 3.5, cells: { 'A 中': 'A11', 'B 中': 'B11' } },
  { row: 4, cells: { 'A 外': 'A13', 'A 內': 'A12', 'B 內': 'B12', 'B 外': 'B13' } },
  { row: 4.5, cells: { 'A 中': 'A14', 'B 中': 'B14' } },
  { row: 5, cells: { 'A 內': 'A15', 'B 內': 'B15' } },
];

/** 桌號（或 'STAFF'）→ 欄與列 */
const expectedPositions = new Map<string, { col: number; row: number }>();
for (const { row, cells } of GRID) {
  for (const [column, code] of Object.entries(cells) as [Column, string][]) {
    expectedPositions.set(code, { col: COLUMNS.indexOf(column), row });
  }
}

const tableIds = Array.from({ length: TABLE_COUNT }, (_, i) => i + 1);

describe('30 桌（SEAT-R01）', () => {
  it('共 30 桌，內部編號 1–30 各一桌', () => {
    expect(TABLE_COUNT).toBe(30);
    expect(TABLE_LAYOUT).toHaveLength(30);
    expect(TABLE_LAYOUT.map((t) => t.id).sort((a, b) => a - b)).toEqual(tableIds);
  });

  it('不在 30 桌與工作人員桌裡的內部編號沒有位置', () => {
    expect(placementOf(31)).toBeUndefined();
    expect(placementOf(-1)).toBeUndefined();
  });
});

describe('內部編號 → 桌號（D-019、SEAT-R04）', () => {
  it.each(tableIds)('內部編號 %i 的桌號依 D-019 的對應表', (id) => {
    expect(tableCodeOf(id)).toBe(codeOf(id));
  });

  it('D-019 的對應：1→B1、2→A1、3→B4、5→B10、16→B15、21→A15、22→A2、30→A13', () => {
    expect([1, 2, 3, 5, 16, 21, 22, 30].map((id) => tableCodeOf(id))).toEqual(['B1', 'A1', 'B4', 'B10', 'B15', 'A15', 'A2', 'A13']);
  });

  it('A1～A15、B1～B15 每個桌號剛好一桌，沒有重複，也沒有其他寫法（不是「A-1」、不是「第 n 桌」）', () => {
    const codes = tableIds.map((id) => tableCodeOf(id));
    expect(new Set(codes).size).toBe(30);
    expect(codes.slice().sort()).toEqual(CODES_IN_LIST_ORDER.slice().sort());
    for (const code of codes) expect(code, String(code)).toMatch(/^[AB](?:[1-9]|1[0-5])$/);
  });

  it('工作人員桌不編號，沒有桌號（SEAT-R05、SEAT-R48）', () => {
    expect(tableCodeOf(STAFF_TABLE_ID)).toBeUndefined();
  });

  it.each([31, -1, 100])('不在 1–30 的內部編號 %i 沒有桌號', (id) => {
    expect(tableCodeOf(id)).toBeUndefined();
  });
});

describe('桌號 → 內部編號（網址參數 /?table={桌號}、seed 的 tables.csv）', () => {
  it.each(CODES_IN_LIST_ORDER.map((code) => [code, idOfCode(code)] as const))('%s → 內部編號 %i', (code, id) => {
    expect(tableIdOfCode(code)).toBe(id);
  });

  it('來回轉換一致：每一桌的內部編號 → 桌號 → 內部編號是同一桌', () => {
    for (const id of tableIds) {
      const code = tableCodeOf(id);
      expect(code, `內部編號 ${id}`).toBeDefined();
      expect(tableIdOfCode(code ?? ''), `${code}`).toBe(id);
    }
  });

  it.each(['A0', 'A16', 'B16', 'C1', 'D3', '1', '31', '0', 'A', 'B', '', 'A-1', 'B-15', '第 1 桌', 'A1 桌', 'STAFF', '工作人員桌'])(
    '「%s」不是桌號，沒有對應的桌',
    (code) => {
      expect(tableIdOfCode(code)).toBeUndefined();
    },
  );

  it('「A1」不會對到 A10～A15，「B1」不會對到 B10～B15', () => {
    expect(tableIdOfCode('A1')).toBe(2);
    expect(['A10', 'A11', 'A12', 'A13', 'A14', 'A15'].map((c) => tableIdOfCode(c))).not.toContain(2);
    expect(tableIdOfCode('B1')).toBe(1);
    expect(['B10', 'B11', 'B12', 'B13', 'B14', 'B15'].map((c) => tableIdOfCode(c))).not.toContain(1);
  });
});

describe('清單順序：A1～A15，再 B1～B15（SEAT-R04、SEAT-R23、SEAT-R39、PPL-R26、PPL-R56）', () => {
  it('TABLE_CODES_IN_ORDER 依 A1、A2…A15、B1、B2…B15 排列（數字依大小，不是字串順序）', () => {
    expect(TABLE_CODES_IN_ORDER).toEqual(CODES_IN_LIST_ORDER);
    expect(TABLE_CODES_IN_ORDER.indexOf('A2')).toBeLessThan(TABLE_CODES_IN_ORDER.indexOf('A10'));
    expect(TABLE_CODES_IN_ORDER.indexOf('A15')).toBeLessThan(TABLE_CODES_IN_ORDER.indexOf('B1'));
  });

  it('清單順序換成內部編號：2、22、17、27、23、18、28、24、19、29、25、20、30、26、21，再 1、7、12、3、8、13、4、9、14、5、10、15、6、11、16', () => {
    expect(TABLE_CODES_IN_ORDER.map((c) => tableIdOfCode(c))).toEqual([
      2, 22, 17, 27, 23, 18, 28, 24, 19, 29, 25, 20, 30, 26, 21, 1, 7, 12, 3, 8, 13, 4, 9, 14, 5, 10, 15, 6, 11, 16,
    ]);
  });
});

describe('填桌順序（auto-arrange.md「填桌順序」、ARR-R02、D-019）', () => {
  it('仍是內部編號 1、2、3…30 的順序，桌號改名前後不變', () => {
    expect(FILL_ORDER).toEqual(tableIds);
  });

  it('寫成桌號是 B1、A1、B4、B7、B10、B13、B2…A13（規格的寫法），不是清單順序', () => {
    expect(FILL_ORDER.map((id) => tableCodeOf(id))).toEqual(FILL_ORDER_CODES);
    expect(FILL_ORDER.map((id) => tableCodeOf(id))).not.toEqual(TABLE_CODES_IN_ORDER);
  });
});

describe('欄與列（2.1.4、SEAT-R03）', () => {
  it.each(tableIds)('內部編號 %i 的桌在規格表上自己桌號的欄與列', (id) => {
    const code = codeOf(id);
    expect(expectedPositions.has(code), code).toBe(true);
    expect(placementOf(id)).toMatchObject(expectedPositions.get(code) ?? {});
  });

  it('A 區 15 桌在左邊三欄、B 區 15 桌在右邊三欄', () => {
    for (const t of TABLE_LAYOUT) {
      const code = codeOf(t.id);
      if (code.startsWith('A')) expect(t.col, `${code} 桌`).toBeLessThan(3);
      else expect(t.col, `${code} 桌`).toBeGreaterThanOrEqual(3);
    }
  });

  it('相鄰的列錯開半格：中間欄在半格上，外側與內側欄在整格上', () => {
    for (const t of TABLE_LAYOUT) {
      const middle = COLUMNS[t.col] === 'A 中' || COLUMNS[t.col] === 'B 中';
      expect(Number.isInteger(t.row), `${codeOf(t.id)} 桌`).toBe(!middle);
    }
  });

  it('主桌（A1、B1 桌）最靠近舞台，在 A 內與 B 內兩欄', () => {
    const minRow = Math.min(...TABLE_LAYOUT.map((t) => t.row));
    const a1 = placementOf(idOfCode('A1'));
    const b1 = placementOf(idOfCode('B1'));
    expect(a1?.row).toBe(minRow);
    expect(b1?.row).toBe(minRow);
    expect(COLUMNS[a1?.col ?? -1]).toBe('A 內');
    expect(COLUMNS[b1?.col ?? -1]).toBe('B 內');
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

  it('在 B4 桌的正上方', () => {
    const b4 = placementOf(idOfCode('B4'));
    expect(STAFF_TABLE_PLACEMENT.col).toBe(b4?.col);
    expect(STAFF_TABLE_PLACEMENT.row).toBeLessThan(b4?.row ?? -1);
    const sameColumn = TABLE_LAYOUT.filter((t) => t.col === STAFF_TABLE_PLACEMENT.col);
    expect(Math.min(...sameColumn.map((t) => t.row))).toBe(b4?.row);
  });
});
