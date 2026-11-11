// 30 個位置的排列與桌號（docs/spec/seating.md 2.1.4；docs/decision-record.md D-019、D-027）：左右對稱，A 區在舞台左側、B 區在右側，
// 各分外、中、內三列，相鄰的列錯開半格。欄 0–5 由左到右：A 外側、A 中間、A 內側、B 內側、B 中間、B 外側。row 以半格為單位錯開。
// 這裡的編號是「位置」1–30（SeatTable.position）；桌子本身的 id 另外存在資料庫，桌子搬到哪個位置，桌號就是那個位置的代碼（D-027）。
// 畫面、匯出與網址參數用桌號 A1～A15、B1～B15（docs/architecture.md「桌號」），位置與桌號的對應只寫在這裡；
// 桌子 id 與位置之間的換算在 src/domain/tables.ts。下面的函式名稱沿用 D-019 時的寫法，參數都是位置編號。
import { STAFF_TABLE_ID } from '@/contracts/entities';

export type TablePlacement = { id: number; code: string; col: number; row: number };

/** 依位置編號排列，也就是自動排座的填桌順序（auto-arrange.md「填桌順序」）；id 是位置編號 */
export const TABLE_LAYOUT: readonly TablePlacement[] = [
  { id: 1, code: 'B1', col: 3, row: 0 },
  { id: 2, code: 'A1', col: 2, row: 0 },
  { id: 3, code: 'B4', col: 5, row: 1 },
  { id: 4, code: 'B7', col: 5, row: 2 },
  { id: 5, code: 'B10', col: 5, row: 3 },
  { id: 6, code: 'B13', col: 5, row: 4 },
  { id: 7, code: 'B2', col: 4, row: 0.5 },
  { id: 8, code: 'B5', col: 4, row: 1.5 },
  { id: 9, code: 'B8', col: 4, row: 2.5 },
  { id: 10, code: 'B11', col: 4, row: 3.5 },
  { id: 11, code: 'B14', col: 4, row: 4.5 },
  { id: 12, code: 'B3', col: 3, row: 1 },
  { id: 13, code: 'B6', col: 3, row: 2 },
  { id: 14, code: 'B9', col: 3, row: 3 },
  { id: 15, code: 'B12', col: 3, row: 4 },
  { id: 16, code: 'B15', col: 3, row: 5 },
  { id: 17, code: 'A3', col: 2, row: 1 },
  { id: 18, code: 'A6', col: 2, row: 2 },
  { id: 19, code: 'A9', col: 2, row: 3 },
  { id: 20, code: 'A12', col: 2, row: 4 },
  { id: 21, code: 'A15', col: 2, row: 5 },
  { id: 22, code: 'A2', col: 1, row: 0.5 },
  { id: 23, code: 'A5', col: 1, row: 1.5 },
  { id: 24, code: 'A8', col: 1, row: 2.5 },
  { id: 25, code: 'A11', col: 1, row: 3.5 },
  { id: 26, code: 'A14', col: 1, row: 4.5 },
  { id: 27, code: 'A4', col: 0, row: 1 },
  { id: 28, code: 'A7', col: 0, row: 2 },
  { id: 29, code: 'A10', col: 0, row: 3 },
  { id: 30, code: 'A13', col: 0, row: 4 },
];

/** 工作人員桌：B 區外側列最上面（B4 上方、控台下方），不編號、不在 30 個位置裡；id 是工作人員桌的桌子 id 0，code 只是內部代碼，畫面不顯示 */
export const STAFF_TABLE_PLACEMENT: TablePlacement = { id: STAFF_TABLE_ID, code: 'STAFF', col: 5, row: 0 };

export const LAYOUT_COLUMNS = 6;
export const LAYOUT_ROWS = 6;

export const placementOf = (tableId: number): TablePlacement | undefined =>
  tableId === STAFF_TABLE_ID ? STAFF_TABLE_PLACEMENT : TABLE_LAYOUT.find((t) => t.id === tableId);

const CODE_BY_ID = new Map(TABLE_LAYOUT.map((t) => [t.id, t.code]));
const ID_BY_CODE = new Map(TABLE_LAYOUT.map((t) => [t.code, t.id]));

/** 位置編號 → 桌號，例如 1 → 'B1'；1–30 以外是 undefined */
export const tableCodeOf = (tableId: number): string | undefined => CODE_BY_ID.get(tableId);

/** 桌號 → 位置編號，例如 'A1' → 2；只認 A1～A15、B1～B15 的寫法（大小寫、前後空白由呼叫端先整理，見 parseTableCode） */
export const tableIdOfCode = (code: string): number | undefined => ID_BY_CODE.get(code);

/** 使用者或檔案提供的桌號：不分大小寫、去掉前後空白（「a1」「 A1 」都是 A1）；不是桌號時 undefined */
export const parseTableCode = (raw: string): number | undefined => tableIdOfCode(raw.trim().toUpperCase());

/**
 * 句子與標題中的寫法「{桌號} 桌」，例如 1 → 'B1 桌'（docs/spec/README.md 第 12 節）。
 * 不在 1–30 的位置編號照理不會出現；萬一出現就寫數字，不讓畫面壞掉。
 */
export const tableTitle = (tableId: number): string => `${tableCodeOf(tableId) ?? tableId} 桌`;

/** 單獨出現時的寫法「{桌號}」，例如 1 → 'B1'（座位圖收合的桌次、桌次徽章、參與人員頁的桌次欄） */
export const tableCodeLabel = (tableId: number): string => tableCodeOf(tableId) ?? String(tableId);

/** 清單順序（SEAT-R04）：A1～A15，再 B1～B15 */
export const TABLE_CODES_IN_ORDER: readonly string[] = ['A', 'B'].flatMap((zone) =>
  Array.from({ length: 15 }, (_, i) => `${zone}${i + 1}`),
);

/** 清單順序的位置編號 */
export const TABLE_IDS_IN_ORDER: readonly number[] = TABLE_CODES_IN_ORDER.map((code) => ID_BY_CODE.get(code) ?? 0);

const LIST_RANK = new Map(TABLE_IDS_IN_ORDER.map((id, i) => [id, i]));

/** 依清單順序（A1～A15、B1～B15）比較兩個位置編號；不在 1–30 的排最後 */
export const compareTableIds = (a: number, b: number): number =>
  (LIST_RANK.get(a) ?? Number.MAX_SAFE_INTEGER) - (LIST_RANK.get(b) ?? Number.MAX_SAFE_INTEGER);

/** 自動排座的填桌順序（位置編號）：1、2…30，也就是 B1、A1、B4、B7…A13（auto-arrange.md「填桌順序」，D-019、D-027 前後不變） */
export const FILL_ORDER: readonly number[] = TABLE_LAYOUT.map((t) => t.id).sort((a, b) => a - b);
