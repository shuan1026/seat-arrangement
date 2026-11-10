import 'server-only';
import { buildSeatingSheet } from '@/domain/seating-sheet';
import { prisma } from '../db';
import { seatingSheetToXlsx } from '../excel';
import { loadState } from './state';

// 匯出座位表（docs/spec/export.md）：讀資料庫裡已儲存的資料（EXP-Q06）→ 版面模型 → .xlsx。
// 內容是全部 30 桌、工作人員與未入座的人，和頁面的搜尋、篩選無關（EXP-R02），所以不接受任何參數。

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const taipeiDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 匯出當天的台灣日期 YYYYMMDD，和主機時區無關（EXP-R03） */
export function taipeiDateStamp(now: Date = new Date()): string {
  const parts = taipeiDate.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

/** 檔名「座位表_{YYYYMMDD}.xlsx」（EXP-R03） */
export const seatingFileName = (now: Date = new Date()): string => `座位表_${taipeiDateStamp(now)}.xlsx`;

/**
 * Content-Disposition：filename* 用 RFC 5987 帶中文檔名；filename 是給不支援 filename* 的舊瀏覽器的 ASCII 備用名稱
 * （HTTP 標頭不能放中文字）。
 */
export function attachmentDisposition(now: Date = new Date()): string {
  const name = seatingFileName(now);
  return `attachment; filename="seating_${taipeiDateStamp(now)}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export type SeatingExport = { bytes: Uint8Array<ArrayBuffer>; disposition: string; participantCount: number };

export async function exportSeating(now: Date = new Date()): Promise<SeatingExport> {
  const state = await loadState(prisma);
  const out = await seatingSheetToXlsx(buildSeatingSheet(state));
  // 複製成獨立的 ArrayBuffer：Response 的本體型別不接受 Buffer 共用的記憶體池
  const bytes = new Uint8Array(out.byteLength);
  bytes.set(out instanceof Uint8Array ? out : new Uint8Array(out));
  return { bytes, disposition: attachmentDisposition(now), participantCount: state.participants.length };
}
