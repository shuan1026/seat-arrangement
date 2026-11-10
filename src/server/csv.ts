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

/** 解析成二維陣列（每列每格的原始文字，去掉每格前後空白）；略過完全空白的列 */
export function parseCsv(text: string): string[][] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  return result.data.map((row) => row.map((cell) => (cell ?? '').trim()));
}

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
