// 在瀏覽器產生並下載檔案：匯入範本、錯誤清單（docs/architecture.md 第 11.1 節：錯誤清單由前端產生，伺服器不存檔）。

/** CSV 儲存格：含逗號、引號、換行時用引號包起來 */
export const csvCell = (v: string | number | null | undefined): string => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 組出 CSV 文字；開頭加 BOM，Excel 才會用 UTF-8 開啟中文 */
export const toCsv = (header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string =>
  '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): void {
  downloadBlob(filename, new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' }));
}
