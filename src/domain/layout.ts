// 30 桌的排列（docs/spec/seating.md）：左右對稱，A 區在舞台左側、B 區在右側，各分外、中、內三列，相鄰的列錯開半格。
// 欄 0–5 由左到右：A 外側、A 中間、A 內側、B 內側、B 中間、B 外側。row 以半格為單位錯開。
// 位置代碼只在規格中對照用，畫面與匯出都只顯示桌號。
import { STAFF_TABLE_ID } from '@/contracts/entities';

export type TablePlacement = { id: number; code: string; col: number; row: number };

export const TABLE_LAYOUT: readonly TablePlacement[] = [
  { id: 1, code: 'B-1', col: 3, row: 0 },
  { id: 2, code: 'A-1', col: 2, row: 0 },
  { id: 3, code: 'B-4', col: 5, row: 1 },
  { id: 4, code: 'B-7', col: 5, row: 2 },
  { id: 5, code: 'B-10', col: 5, row: 3 },
  { id: 6, code: 'B-13', col: 5, row: 4 },
  { id: 7, code: 'B-2', col: 4, row: 0.5 },
  { id: 8, code: 'B-5', col: 4, row: 1.5 },
  { id: 9, code: 'B-8', col: 4, row: 2.5 },
  { id: 10, code: 'B-11', col: 4, row: 3.5 },
  { id: 11, code: 'B-14', col: 4, row: 4.5 },
  { id: 12, code: 'B-3', col: 3, row: 1 },
  { id: 13, code: 'B-6', col: 3, row: 2 },
  { id: 14, code: 'B-9', col: 3, row: 3 },
  { id: 15, code: 'B-12', col: 3, row: 4 },
  { id: 16, code: 'B-15', col: 3, row: 5 },
  { id: 17, code: 'A-3', col: 2, row: 1 },
  { id: 18, code: 'A-6', col: 2, row: 2 },
  { id: 19, code: 'A-9', col: 2, row: 3 },
  { id: 20, code: 'A-12', col: 2, row: 4 },
  { id: 21, code: 'A-15', col: 2, row: 5 },
  { id: 22, code: 'A-2', col: 1, row: 0.5 },
  { id: 23, code: 'A-5', col: 1, row: 1.5 },
  { id: 24, code: 'A-8', col: 1, row: 2.5 },
  { id: 25, code: 'A-11', col: 1, row: 3.5 },
  { id: 26, code: 'A-14', col: 1, row: 4.5 },
  { id: 27, code: 'A-4', col: 0, row: 1 },
  { id: 28, code: 'A-7', col: 0, row: 2 },
  { id: 29, code: 'A-10', col: 0, row: 3 },
  { id: 30, code: 'A-13', col: 0, row: 4 },
];

/** 工作人員桌：B 區外側列最上面（B-4 上方、控台下方），不編號、不算在 30 桌裡 */
export const STAFF_TABLE_PLACEMENT: TablePlacement = { id: STAFF_TABLE_ID, code: 'STAFF', col: 5, row: 0 };

export const LAYOUT_COLUMNS = 6;
export const LAYOUT_ROWS = 6;

export const placementOf = (tableId: number): TablePlacement | undefined =>
  tableId === STAFF_TABLE_ID ? STAFF_TABLE_PLACEMENT : TABLE_LAYOUT.find((t) => t.id === tableId);
