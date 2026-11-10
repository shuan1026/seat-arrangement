// 匯出座位表的版面模型（docs/spec/export.md 第 3.2～3.6 節；docs/architecture.md 第 11.4 節）。
// 與 Excel 無關：每一格的位置、文字、底色類別、框線與合併範圍；由 src/server/excel.ts 轉成 .xlsx。
// 純函式：只看傳入的資料，陣列順序不影響結果（EXP-R02、EXP-AC18）。
// 待確認依 D-008 照目前假設：EXP-Q01 不放分機、EXP-Q02 只有 F 欄空白、EXP-Q03 工作人員超過十位往下延伸、
// EXP-Q05 框線範圍與未入座區塊的位置。
// 有桌次 11、12 位時（D-018），只有那一桌所在的段改為十二列，下面的列（之後的段、空白列、未入座區塊）往下移（EXP-R23）；
// 工作人員區塊與圖例不在段裡，不受影響。
import { STAFF_TABLE_ID, TABLE_CAPACITY, type AppState, type Participant } from '@/contracts/entities';
import { TABLE_MAX_SEATS } from '@/contracts/seating';
import { participantComparator } from './participants';
import { buildDirectory, displayName, tableDepartmentLabel, type Directory } from './display';
import { TABLE_LAYOUT } from './layout';

/** 底色類別：標題格、貴賓、兒童椅、素食（EXP-R14、EXP-R21） */
export type SheetFill = 'header' | 'guest' | 'childSeat' | 'vegetarian';

/** 一格；列、欄 1 起算（A = 1 … L = 12）；同一格內換行用 '\n'；空白但要畫框線的格 text 為 '' */
export type SheetCell = { row: number; col: number; text: string; fill: SheetFill | null; border: boolean };

/** 合併範圍：1 起算、含兩端 */
export type SheetMerge = { top: number; left: number; bottom: number; right: number };

/** cells 只列有文字、底色或框線的格，每格最多一筆；合併範圍只列左上角那一格 */
export type SeatingSheet = { name: string; cells: SheetCell[]; merges: SheetMerge[] };

export const SHEET_NAME = '座位表';

/** 工作表用到 L 欄為止（EXP-R08） */
export const SHEET_LAST_COLUMN = 12;

/** layout.ts 的欄 0–5（A 外、A 中、A 內、B 內、B 中、B 外）→ 桌次標題格所在的欄：B、C、D、G、H、I（EXP-R08） */
const HEADER_COLUMNS: readonly number[] = [2, 3, 4, 7, 8, 9];

/** 每段十列；layout.ts 的 row 以半格為單位，一格是兩段（EXP-R09）；共 11 段 */
const SEGMENT_ROWS = TABLE_CAPACITY;
const SEGMENT_COUNT = 11;
/** 段裡有桌次超過 10 位時，那一段改為十二列（EXP-R23） */
const TALL_SEGMENT_ROWS = TABLE_MAX_SEATS;

/** 圖例在 A3–A5（EXP-R15） */
const LEGEND: readonly { text: string; fill: SheetFill }[] = [
  { text: '貴賓', fill: 'guest' },
  { text: '兒童椅', fill: 'childSeat' },
  { text: '素食', fill: 'vegetarian' },
];
const LEGEND_ROW = 3;

/** 工作人員區塊：K1 標題、L 欄名單（EXP-R16） */
const STAFF_HEADER_COL = 11;
const STAFF_LIST_COL = 12;

/** 未入座區塊：桌次區下面空一列（沒有段改為十二列時第 111 列空白），標題格 B112，名單 C–L 欄；每欄十位、一段十欄（EXP-R17、EXP-R18） */
const UNSEATED_HEADER_COL = 2;
const UNSEATED_FIRST_COL = 3;
const UNSEATED_COLUMNS = 10;

/** 名單格的文字：顯示名稱加兒童椅、素食的標記，半形括號、中間沒有空白；外部貴賓不加文字（EXP-R13） */
const nameText = (p: Participant, dir: Directory): string =>
  `${displayName(p, dir)}${p.childSeat ? '(+兒童椅)' : ''}${p.vegetarian ? '(素食)' : ''}`;

/** 名單格的底色：依兒童椅、素食、貴賓的順序取第一個；三項都沒有不加底色（EXP-R14） */
const nameFill = (p: Participant): SheetFill | null =>
  p.childSeat ? 'childSeat' : p.vegetarian ? 'vegetarian' : p.kind === 'GUEST' ? 'guest' : null;

const bySeatOrder = (a: Participant, b: Participant) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0) || a.id - b.id;

export function buildSeatingSheet(data: AppState): SeatingSheet {
  const dir = buildDirectory(data);
  const byDefaultOrder = participantComparator(dir);
  const cells = new Map<string, SheetCell>();
  const merges: SheetMerge[] = [];

  const put = (row: number, col: number, text: string, fill: SheetFill | null, border: boolean) => {
    cells.set(`${row}:${col}`, { row, col, text, fill, border });
  };
  const putName = (row: number, col: number, p: Participant | undefined) => {
    if (p) put(row, col, nameText(p, dir), nameFill(p), true);
    else put(row, col, '', null, true);
  };
  /** 標題格：底色、框線，向下合併 height 列（EXP-R10、EXP-R16、EXP-R18） */
  const header = (row: number, col: number, lines: readonly string[], height: number) => {
    put(row, col, lines.join('\n'), 'header', true);
    merges.push({ top: row, left: col, bottom: row + height - 1, right: col });
  };

  // 圖例（EXP-R15、EXP-Q05 ② 畫框線）
  LEGEND.forEach((item, i) => put(LEGEND_ROW + i, 1, item.text, item.fill, true));

  // 各段的高度：段裡有桌次 11、12 位時十二列，其他十列；每一段的起始列是前面各段高度的和（EXP-R09、EXP-R23）
  const seatedAt = (tableId: number) => data.participants.filter((p) => p.tableId === tableId).sort(bySeatOrder);
  const segmentOf = (placement: (typeof TABLE_LAYOUT)[number]) => placement.row * 2;
  const segmentRows = Array.from({ length: SEGMENT_COUNT }, () => SEGMENT_ROWS);
  for (const placement of TABLE_LAYOUT) {
    if (seatedAt(placement.id).length > TABLE_CAPACITY) segmentRows[segmentOf(placement)] = TALL_SEGMENT_ROWS;
  }
  const segmentTop = (k: number) => 1 + segmentRows.slice(0, k).reduce((a, b) => a + b, 0);
  const tableRows = segmentRows.reduce((a, b) => a + b, 0);

  // 30 桌：標題格是所在段的十（或十二）列合併；名單格在右邊一欄，依座位順序由上往下放，空位留白也畫框線（EXP-R09～R12、EXP-R22、EXP-R23）
  const notes = new Map(data.tables.map((t) => [t.id, t.noteName]));
  for (const placement of TABLE_LAYOUT) {
    const col = HEADER_COLUMNS[placement.col];
    if (col === undefined) continue;
    const seg = segmentOf(placement);
    const top = segmentTop(seg);
    const rows = segmentRows[seg] ?? SEGMENT_ROWS;
    const seated = seatedAt(placement.id);
    const note = notes.get(placement.id);
    header(
      top,
      col,
      [`第 ${placement.id} 桌`, ...(note ? [note] : []), tableDepartmentLabel(seated, dir), `(${seated.length})`],
      rows,
    );
    // 名單格是這一段的列數（十或十二格）
    for (let i = 0; i < rows; i++) putName(top + i, col + 1, seated[i]);
  }

  // 工作人員：依參與人員的預設排序；標題格合併 K1 到 K{10 與人數取大者}，名單格都畫框線（EXP-R16、EXP-R20、EXP-Q03、EXP-Q05 ③）
  const staff = data.participants.filter((p) => p.tableId === STAFF_TABLE_ID).sort(byDefaultOrder);
  const staffRows = Math.max(TABLE_CAPACITY, staff.length);
  header(1, STAFF_HEADER_COL, ['工作人員', `(${staff.length})`], staffRows);
  for (let i = 0; i < staffRows; i++) putName(1 + i, STAFF_LIST_COL, staff[i]);

  // 未入座：不在任何一桌、也不是工作人員的參與人員，含外部貴賓；只有放了人的名單格畫框線（EXP-R17～R20、EXP-Q05 ④）
  const unseated = data.participants.filter((p) => p.tableId === null).sort(byDefaultOrder);
  // 桌次區下面空一列，未入座區塊從再下一列開始（沒有段改為十二列時是第 112 列）
  const unseatedTop = tableRows + 2;
  if (unseated.length > 0) {
    const perSegment = SEGMENT_ROWS * UNSEATED_COLUMNS;
    const segments = Math.ceil(unseated.length / perSegment);
    header(unseatedTop, UNSEATED_HEADER_COL, ['未入座', `(${unseated.length})`], SEGMENT_ROWS * segments);
    unseated.forEach((p, i) => {
      const row = unseatedTop + SEGMENT_ROWS * Math.floor(i / perSegment) + (i % SEGMENT_ROWS);
      const col = UNSEATED_FIRST_COL + (Math.floor(i / SEGMENT_ROWS) % UNSEATED_COLUMNS);
      putName(row, col, p);
    });
  }

  const sorted = [...cells.values()].sort((a, b) => a.row - b.row || a.col - b.col);
  merges.sort((a, b) => a.top - b.top || a.left - b.left);
  return { name: SHEET_NAME, cells: sorted, merges };
}
