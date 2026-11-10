// 桌號（docs/decision-record.md D-019；docs/spec/README.md 第 12、13 節；docs/architecture.md「桌號」）：
// 資料庫與 API 的桌次用內部編號 1–30（工作人員桌 0）；畫面、匯出與網址參數用桌號 A1～A15、B1～B15。
// 測試的預期值照規格的對應表寫死，不引用 src/，E2E 也可以用。

/** 內部編號 → 桌號（D-019 的對應表；也是 seating.md 2.1.4 的位置） */
export const TABLE_CODE_BY_ID: ReadonlyMap<number, string> = new Map([
  [1, 'B1'],
  [2, 'A1'],
  [3, 'B4'],
  [4, 'B7'],
  [5, 'B10'],
  [6, 'B13'],
  [7, 'B2'],
  [8, 'B5'],
  [9, 'B8'],
  [10, 'B11'],
  [11, 'B14'],
  [12, 'B3'],
  [13, 'B6'],
  [14, 'B9'],
  [15, 'B12'],
  [16, 'B15'],
  [17, 'A3'],
  [18, 'A6'],
  [19, 'A9'],
  [20, 'A12'],
  [21, 'A15'],
  [22, 'A2'],
  [23, 'A5'],
  [24, 'A8'],
  [25, 'A11'],
  [26, 'A14'],
  [27, 'A4'],
  [28, 'A7'],
  [29, 'A10'],
  [30, 'A13'],
]);

/** 內部編號 1–30 */
export const INTERNAL_TABLE_IDS: readonly number[] = Array.from({ length: 30 }, (_, i) => i + 1);

/** 內部編號 → 桌號，例如 1 → 'B1'；不在 1–30 時丟錯 */
export function codeOf(id: number): string {
  const code = TABLE_CODE_BY_ID.get(id);
  if (!code) throw new Error(`沒有內部編號 ${id} 的桌次`);
  return code;
}

/** 桌號 → 內部編號，例如 'A1' → 2；不是 A1～A15、B1～B15 時丟錯 */
export function idOfCode(code: string): number {
  for (const [id, c] of TABLE_CODE_BY_ID) if (c === code) return id;
  throw new Error(`沒有桌號 ${code}`);
}

/** 句子與標題中的寫法「{桌號} 桌」，例如 1 → 'B1 桌'（README 第 12 節） */
export const tableTitle = (id: number): string => `${codeOf(id)} 桌`;

/** 清單順序（SEAT-R04、SEAT-R23、SEAT-R39、PPL-R26、PPL-R56）：A1～A15，再 B1～B15 */
export const CODES_IN_LIST_ORDER: readonly string[] = ['A', 'B'].flatMap((zone) =>
  Array.from({ length: 15 }, (_, i) => `${zone}${i + 1}`),
);

/** 清單順序的內部編號 */
export const IDS_IN_LIST_ORDER: readonly number[] = CODES_IN_LIST_ORDER.map(idOfCode);

/** 填桌順序（auto-arrange.md 第 2 節）：B1、A1、B4、B7…A13，也就是內部編號 1–30 的順序（D-019 前後不變） */
export const FILL_ORDER_CODES: readonly string[] = [
  'B1', 'A1', 'B4', 'B7', 'B10', 'B13', 'B2', 'B5', 'B8', 'B11', 'B14', 'B3', 'B6', 'B9', 'B12', 'B15',
  'A3', 'A6', 'A9', 'A12', 'A15', 'A2', 'A5', 'A8', 'A11', 'A14', 'A4', 'A7', 'A10', 'A13',
];

/** 依清單順序比較兩個內部編號（A1～A15、B1～B15） */
export const compareByListOrder = (a: number, b: number): number => IDS_IN_LIST_ORDER.indexOf(a) - IDS_IN_LIST_ORDER.indexOf(b);
