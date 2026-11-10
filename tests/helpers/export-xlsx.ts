// 讀回產生的座位表 .xlsx（ExcelJS），給 Excel 輸出的單元測試、API 整合測試與 E2E 共用。不引用 src/，E2E 也可以用。
import ExcelJS from 'exceljs';
import type { Cell, Workbook, Worksheet } from 'exceljs';

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type BorderSide = 'top' | 'left' | 'bottom' | 'right';
export const BORDER_SIDES: readonly BorderSide[] = ['top', 'left', 'bottom', 'right'];

/** ExcelJS 的 load 需要 ArrayBuffer；Buffer、Uint8Array 先複製成獨立的 ArrayBuffer */
export async function loadWorkbook(bytes: ArrayBuffer | Uint8Array): Promise<Workbook> {
  let data: ArrayBuffer;
  if (bytes instanceof Uint8Array) {
    data = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(data).set(bytes);
  } else {
    data = bytes;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  return wb;
}

/** 儲存格的文字：一般文字或 rich text 都轉成字串；沒有值是 '' */
export function cellText(cell: Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object' && 'richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
  return cell.text;
}

/** 實心底色的 RGB（'RRGGBB'，大寫）；沒有底色是 null */
export function fillRgb(cell: Cell): string | null {
  const f = cell.fill;
  if (!f || f.type !== 'pattern' || f.pattern === 'none') return null;
  const argb = f.fgColor?.argb;
  return argb ? argb.slice(-6).toUpperCase() : null;
}

/** 有畫線的邊 */
export function borderSides(cell: Cell): BorderSide[] {
  const b = cell.border;
  if (!b) return [];
  return BORDER_SIDES.filter((side) => !!b[side]?.style);
}

/** 某一邊框線的 RGB（'RRGGBB'，大寫） */
export function borderRgb(cell: Cell, side: BorderSide): string | null {
  const argb = cell.border?.[side]?.color?.argb;
  return argb ? argb.slice(-6).toUpperCase() : null;
}

/** 全部合併範圍（'G1:G10'），排序後回傳 */
export function mergeRanges(ws: Worksheet): string[] {
  return [...ws.model.merges].sort();
}

/** 有值的格（合併範圍只算左上角那一格）：位址 → 文字 */
export function cellTexts(ws: Worksheet): Map<string, string> {
  const out = new Map<string, string>();
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const text = cellText(cell);
      if (text !== '') out.set(cell.address, text);
    });
  });
  return out;
}

/** Content-Disposition 的下載檔名：優先讀 filename*=UTF-8''…，其次 filename="…" */
export function downloadFileName(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i.exec(header);
  const value = plain?.[1] ?? plain?.[2];
  return value?.trim();
}

/** 台灣日期 YYYYMMDD */
export function taiwanDateStamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}
