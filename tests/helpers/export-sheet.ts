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
