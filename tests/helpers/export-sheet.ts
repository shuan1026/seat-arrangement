// 匯出座位表的版面：Excel 位址（A1）工具、規格 3.3 節每一桌的位置、讀取 src/domain/seating-sheet.ts 版面模型的工具。
// 不引用 src/，E2E 也可以用。位址寫法依 docs/spec/export.md「本檔寫法」：欄 A 是第 1 欄…L 是第 12 欄，列從 1 起算。

/** 版面模型的底色類別：標題格、貴賓、兒童椅、素食 */
export type SheetFillName = 'header' | 'guest' | 'childSeat' | 'vegetarian';

/** 版面模型的一格（列、欄 1 起算） */
export interface ModelCell {
  row: number;
  col: number;
  text: string;
  fill?: SheetFillName | null;
  border?: boolean;
}

/** 合併範圍（1 起算，含兩端） */
export interface ModelMerge {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface SheetModel {
  name: string;
  cells: readonly ModelCell[];
  merges: readonly ModelMerge[];
}

export const LAST_COLUMN = 12; // L 欄

/** 'A' → 1、'L' → 12、'AA' → 27 */
export function colNumber(letters: string): number {
  return [...letters.toUpperCase()].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}

/** 1 → 'A'、12 → 'L'、27 → 'AA' */
export function colLetter(col: number): string {
  let n = col;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export const toAddress = (row: number, col: number): string => `${colLetter(col)}${row}`;

export function parseAddress(address: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(address);
  if (!m?.[1] || !m[2]) throw new Error(`不是儲存格位址：${address}`);
  return { row: Number(m[2]), col: colNumber(m[1]) };
}

export const rangeOf = (m: ModelMerge): string => `${toAddress(m.top, m.left)}:${toAddress(m.bottom, m.right)}`;

const compareAddress = (a: string, b: string): number => {
  const x = parseAddress(a);
  const y = parseAddress(b);
  return x.row - y.row || x.col - y.col;
};

export const sortAddresses = (addresses: Iterable<string>): string[] => [...addresses].sort(compareAddress);

/** 'H4'、4..10 → H4–H10 */
export const column = (letter: string, fromRow: number, toRow: number): string[] =>
  Array.from({ length: toRow - fromRow + 1 }, (_, i) => `${letter}${fromRow + i}`);

/** 規格 3.3 節「各桌位置」：桌號 → 標題格的合併範圍、名單欄 */
export const TABLE_BLOCKS: ReadonlyMap<number, { range: string; listCol: string }> = new Map([
  [1, { range: 'G1:G10', listCol: 'H' }],
  [2, { range: 'D1:D10', listCol: 'E' }],
  [3, { range: 'I21:I30', listCol: 'J' }],
  [4, { range: 'I41:I50', listCol: 'J' }],
  [5, { range: 'I61:I70', listCol: 'J' }],
  [6, { range: 'I81:I90', listCol: 'J' }],
  [7, { range: 'H11:H20', listCol: 'I' }],
  [8, { range: 'H31:H40', listCol: 'I' }],
  [9, { range: 'H51:H60', listCol: 'I' }],
  [10, { range: 'H71:H80', listCol: 'I' }],
  [11, { range: 'H91:H100', listCol: 'I' }],
  [12, { range: 'G21:G30', listCol: 'H' }],
  [13, { range: 'G41:G50', listCol: 'H' }],
  [14, { range: 'G61:G70', listCol: 'H' }],
  [15, { range: 'G81:G90', listCol: 'H' }],
  [16, { range: 'G101:G110', listCol: 'H' }],
  [17, { range: 'D21:D30', listCol: 'E' }],
  [18, { range: 'D41:D50', listCol: 'E' }],
  [19, { range: 'D61:D70', listCol: 'E' }],
  [20, { range: 'D81:D90', listCol: 'E' }],
  [21, { range: 'D101:D110', listCol: 'E' }],
  [22, { range: 'C11:C20', listCol: 'D' }],
  [23, { range: 'C31:C40', listCol: 'D' }],
  [24, { range: 'C51:C60', listCol: 'D' }],
  [25, { range: 'C71:C80', listCol: 'D' }],
  [26, { range: 'C91:C100', listCol: 'D' }],
  [27, { range: 'B21:B30', listCol: 'C' }],
  [28, { range: 'B41:B50', listCol: 'C' }],
  [29, { range: 'B61:B70', listCol: 'C' }],
  [30, { range: 'B81:B90', listCol: 'C' }],
]);

export const TABLE_IDS: readonly number[] = Array.from({ length: 30 }, (_, i) => i + 1);

/** 第 n 桌：標題格（左上角位址）、合併範圍、十格名單格 */
export function tableBlock(n: number): { header: string; range: string; list: string[] } {
  const b = TABLE_BLOCKS.get(n);
  if (!b) throw new Error(`沒有第 ${n} 桌`);
  const [top = ''] = b.range.split(':');
  const { row } = parseAddress(top);
  return { header: top, range: b.range, list: column(b.listCol, row, row + 9) };
}

/** 未入座第 i 位（1 起算）的位址（EXP-R18） */
export function unseatedAddress(i: number): string {
  const row = 112 + 10 * Math.floor((i - 1) / 100) + ((i - 1) % 10);
  const col = colNumber('C') + (Math.floor((i - 1) / 10) % 10);
  return toAddress(row, col);
}

/** 第 n 桌所在的段（1–11）：沒有超過時第 k 段是第 10k−9 到 10k 列（EXP-R09、本檔 3.3） */
export function segmentOf(n: number): number {
  const b = TABLE_BLOCKS.get(n);
  if (!b) throw new Error(`沒有第 ${n} 桌`);
  const { row } = parseAddress(b.range.split(':')[0] ?? '');
  return (row - 1) / 10 + 1;
}

/**
 * 有桌次 11、12 位時的版面（docs/spec/export.md EXP-R23）：tallSegments 是改為十二列的段（1–11）。
 * 只有那幾段改為十二列，每多一段，下面所有的列（之後的段、第 111 列的空白列、未入座區塊）往下移兩列。
 * 工作人員區塊（K、L 欄）與圖例（A3–A5）不在段裡，不受影響。
 */
export function overflowLayout(tallSegments: Iterable<number>) {
  const tall = new Set(tallSegments);
  const segmentRows = (k: number): number => (tall.has(k) ? 12 : 10);
  const segmentTop = (k: number): number => {
    let row = 1;
    for (let j = 1; j < k; j++) row += segmentRows(j);
    return row;
  };
  const shift = 2 * tall.size;

  /** 第 n 桌：標題格、合併範圍、名單格（十或十二格） */
  const block = (n: number): { header: string; range: string; list: string[] } => {
    const b = TABLE_BLOCKS.get(n);
    if (!b) throw new Error(`沒有第 ${n} 桌`);
    const { col } = parseAddress(b.range.split(':')[0] ?? '');
    const seg = segmentOf(n);
    const top = segmentTop(seg);
    const rows = segmentRows(seg);
    const header = toAddress(top, col);
    return { header, range: `${header}:${toAddress(top + rows - 1, col)}`, list: column(b.listCol, top, top + rows - 1) };
  };

  /** 未入座第 i 位（1 起算）的位址 */
  const unseated = (i: number): string => {
    const a = parseAddress(unseatedAddress(i));
    return toAddress(a.row + shift, a.col);
  };

  /** 未入座 count 位時，標題格的合併範圍 */
  const unseatedRange = (count: number): string => {
    const segments = Math.ceil(count / 100);
    return `B${112 + shift}:B${111 + shift + 10 * segments}`;
  };

  return {
    tall: [...tall].sort((a, b) => a - b),
    segmentTop,
    segmentRows,
    block,
    /** 桌次區最後一列（沒有超過時是 110） */
    lastTableRow: 110 + shift,
    /** 空白列（沒有超過時是 111） */
    blankRow: 111 + shift,
    /** 未入座區塊的起始列（沒有超過時是 112） */
    unseatedTop: 112 + shift,
    unseatedAddress: unseated,
    unseatedRange,
  };
}

/**
 * 從檔案的合併範圍找出改為十二列的段（EXP-R23）：依段的順序往下，看這一段第一桌的標題格合併了十列還是十二列。
 * 給資料庫可能留著其他測試資料的 E2E 用：先找出哪幾段超過，再照 overflowLayout 比對每一桌的位置。
 */
export function tallSegmentsIn(merges: readonly string[]): number[] {
  const set = new Set(merges);
  const tall: number[] = [];
  let top = 1;
  for (let k = 1; k <= 11; k++) {
    const n = TABLE_IDS.find((id) => segmentOf(id) === k);
    if (n === undefined) throw new Error(`第 ${k} 段沒有桌次`);
    const { col } = parseAddress(TABLE_BLOCKS.get(n)?.range.split(':')[0] ?? '');
    const letter = colLetter(col);
    if (set.has(`${letter}${top}:${letter}${top + 11}`)) {
      tall.push(k);
      top += 12;
    } else {
      top += 10;
    }
  }
  return tall;
}

/** 用 Excel 位址讀版面模型；沒列在 cells 的格是空白、沒有底色、沒有框線 */
export class SheetReader {
  private readonly byAddress = new Map<string, ModelCell>();
  private readonly mergeByTopLeft = new Map<string, string>();
  readonly duplicates: string[] = [];

  constructor(readonly model: SheetModel) {
    for (const c of model.cells) {
      const a = toAddress(c.row, c.col);
      if (this.byAddress.has(a)) this.duplicates.push(a);
      this.byAddress.set(a, c);
    }
    for (const m of model.merges) this.mergeByTopLeft.set(toAddress(m.top, m.left), rangeOf(m));
  }

  get name(): string {
    return this.model.name;
  }

  cell(address: string): ModelCell | undefined {
    return this.byAddress.get(address);
  }

  text(address: string): string {
    return this.cell(address)?.text ?? '';
  }

  fill(address: string): SheetFillName | null {
    return this.cell(address)?.fill ?? null;
  }

  border(address: string): boolean {
    return this.cell(address)?.border ?? false;
  }

  /** 以這一格為左上角的合併範圍，例如 'G1:G10' */
  merge(address: string): string | undefined {
    return this.mergeByTopLeft.get(address);
  }

  /** 全部合併範圍，依位址排序 */
  merges(): string[] {
    return [...this.mergeByTopLeft.values()].sort((a, b) => compareAddress(a.split(':')[0] ?? '', b.split(':')[0] ?? ''));
  }

  /** 有文字、底色或框線的格，依列、欄排序 */
  used(): string[] {
    return sortAddresses(
      [...this.byAddress.entries()]
        .filter(([, c]) => c.text !== '' || (c.fill ?? null) !== null || (c.border ?? false))
        .map(([a]) => a),
    );
  }

  /** 全部有文字的格的內容 */
  texts(): string[] {
    return this.model.cells.map((c) => c.text).filter((t) => t !== '');
  }

  /** 正規化後的內容：方便比較兩份模型是否相同 */
  normalized(): { name: string; cells: [string, string, SheetFillName | null, boolean][]; merges: string[] } {
    return {
      name: this.model.name,
      cells: this.used().map((a) => [a, this.text(a), this.fill(a), this.border(a)]),
      merges: this.merges(),
    };
  }
}
