import 'server-only';
import iconv from 'iconv-lite';
import Papa from 'papaparse';
import { IMPORT_MAX_BYTES } from '@/contracts/imports';
import { AppError } from './http';

// 兩種 CSV 匯入共用（docs/architecture.md 第 11.1 節；employees.md EMP-R46）：
// - 編碼：Excel 另存的 CSV 可能是 UTF-8（含 BOM）或 Big5，先試 UTF-8，不合法再用 Big5。
// - 儲存格可以有換行（引號包住的多行文字）。

/** 把上傳的位元組轉成文字 */
export function decodeCsv(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  try {
    return utf8.decode(bytes);
  } catch {
    return iconv.decode(Buffer.from(bytes), 'big5');
  }
}

/**
 * 解析成二維陣列（每列每格的原始文字，去掉每格前後空白）。
 * 列號要和用 Excel 開啟時一致（docs/spec/README.md COM-R16）：完全空白的列保留在原本的位置（每格都是空字串），
 * 回傳的第 i 個元素（0 起算）就是檔案的第 i+1 列；儲存格內的換行不另算一列；檔案最後的換行不多算一列。
 * 空白列由各自的匯入規則略過（employees.md EMP-R49；報名表沒有名字的列）。
 */
export function parseCsv(text: string): string[][] {
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data.map((row) => row.map((cell) => (cell ?? '').trim()));
  // 檔案以換行結尾時，Papa 會在最後多解析出一列空字串，那不是檔案中的一列
  const last = rows[rows.length - 1];
  if (/[\r\n]$/.test(text) && last && last.length === 1 && last[0] === '') rows.pop();
  return rows;
}

/** 完全空白的列（空行、只有逗號、只有空白） */
export const isBlankRow = (row: readonly string[]): boolean => row.every((cell) => cell.trim() === '');

/** 從 multipart 請求取出上傳的 CSV 檔（欄位名稱 file） */
export async function readUploadedCsv(req: Request): Promise<string[][]> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError('VALIDATION_FAILED', 'multipart form required', { file: '請選擇要匯入的檔案。' });
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw new AppError('VALIDATION_FAILED', 'file required', { file: '請選擇要匯入的檔案。' });
  }
  if (file.size > IMPORT_MAX_BYTES) {
    throw new AppError('IMPORT_FORMAT_INVALID', 'file too large');
  }
  if (!/\.csv$/i.test(file.name)) {
    throw new AppError('IMPORT_FORMAT_INVALID', 'csv file required');
  }
  return parseCsv(decodeCsv(new Uint8Array(await file.arrayBuffer())));
}

/** 表頭比對用：去掉前後空白、全形空白與 BOM */
export const normalizeHeader = (cell: string) => cell.replace(/^﻿/, '').replace(/[\s　]+/g, '');
