import 'server-only';
import ExcelJS from 'exceljs';
import type { Borders, Fill, PaperSize } from 'exceljs';
import { SHEET_LAST_COLUMN, type SeatingSheet, type SheetFill } from '@/domain/seating-sheet';

// 把座位表的版面模型（src/domain/seating-sheet.ts）寫成 .xlsx（docs/spec/export.md EXP-R04、EXP-R05、EXP-R21、EXP-R22；
// docs/architecture.md 第 11.4 節）。待確認依 D-008 照目前假設：EXP-Q04 底色調淡的比例、EXP-Q05 ⑤～⑦ 樣式、欄寬與紙張。

/**
 * 底色的固定色碼（ARGB）。Excel 只能存固定色碼，所以由 src/styles/tokens.css 預設配色（多彩活力）的 :root 算出；
 * token 改了要同步更新這裡（tests/helpers/export-colors.ts 會從 tokens.css 重算比對）。
 */
export const SHEET_FILL_ARGB: Readonly<Record<SheetFill, string>> = {
  /** 標題格（桌次、工作人員、未入座）：--muted（--color-surface #F3F5F9），不調淡 */
  header: 'FFF3F5F9',
  /** 外部貴賓：--chart-cat-2（--color-violet #7C3AED）24% 與白色混合 */
  guest: 'FFE0D0FB',
  /** 兒童椅：--chart-cat-4（--color-amber #D97706）34% 與白色混合 */
  childSeat: 'FFF2D1AA',
  /** 素食：--chart-cat-5（--color-green #16A34A）26% 與白色混合 */
  vegetarian: 'FFC2E7D0',
};

/** 框線：--semantic-border（--popover-foreground #1F2430 76% 與 --popover #FFFFFF 混合），不調淡 */
export const SHEET_BORDER_ARGB = 'FF555962';

/** 欄寬（Excel 字元寬）：A 欄 8、B–L 欄 15（EXP-Q05 ⑥） */
const COLUMN_WIDTHS = Array.from({ length: SHEET_LAST_COLUMN }, (_, i) => (i === 0 ? 8 : 15));

/** A4 紙（EXP-Q05 ⑦）；ExcelJS 的 PaperSize 是 const enum，isolatedModules 下不能直接取值 */
const PAPER_A4 = 9 as PaperSize;

const line = { style: 'thin', color: { argb: SHEET_BORDER_ARGB } } as const;
const BOX: Partial<Borders> = { top: line, left: line, bottom: line, right: line };

const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

export async function seatingSheetToXlsx(sheet: SeatingSheet): Promise<Uint8Array | ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  // 列印設定：橫向、寬度縮成一頁、高度不限頁數（EXP-R05）
  const ws = wb.addWorksheet(sheet.name, {
    pageSetup: { paperSize: PAPER_A4, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  const mergeAt = new Map(sheet.merges.map((m) => [`${m.top}:${m.left}`, m]));

  for (const c of sheet.cells) {
    const cell = ws.getCell(c.row, c.col);
    if (c.text !== '') cell.value = c.text;
    if (c.fill) cell.fill = solid(SHEET_FILL_ARGB[c.fill]);
    if (c.border) cell.border = BOX;
    if (c.fill === 'header') {
      // 標題格粗體、文字靠上、自動換行（EXP-Q05 ⑤）
      cell.font = { bold: true };
      cell.alignment = { vertical: 'top', wrapText: true };
    }
    const m = mergeAt.get(`${c.row}:${c.col}`);
    if (m && (m.bottom > m.top || m.right > m.left)) {
      // 合併後範圍內每一格沿用左上角的樣式，合併格的外圍才會畫滿框線（EXP-R22）
      ws.mergeCells(m.top, m.left, m.bottom, m.right);
    }
  }

  return wb.xlsx.writeBuffer();
}
