// 兩種 CSV 匯入共用的回應（docs/spec/employees.md 第 3.8 節、participants.md 第 3.6 節）。
// 上傳用 multipart/form-data，欄位名稱 file；上限 1 MB。匯入成功後前端重新載入全部資料。
import { z } from 'zod';

export const IMPORT_MAX_BYTES = 1024 * 1024;

export const importRowErrorSchema = z.object({
  /** 檔案中的列號（表頭是第 1 列） */
  row: z.number().int(),
  /** 需要處理的原因（畫面文案） */
  reason: z.string(),
  /** 這一列的原始內容，給「下載錯誤清單」用 */
  values: z.array(z.string()),
});
export type ImportRowError = z.infer<typeof importRowErrorSchema>;

export const importResultSchema = z.object({
  /** 成功匯入（新增或更新）的筆數 */
  imported: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  /** 略過、不算需要處理的列數（例如總機資訊、空位） */
  skipped: z.number().int(),
  errors: z.array(importRowErrorSchema),
  /** 錯誤清單 CSV 的表頭 */
  header: z.array(z.string()),
});
export type ImportResult = z.infer<typeof importResultSchema>;
