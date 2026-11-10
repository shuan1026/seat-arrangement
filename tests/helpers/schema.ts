// 測試 zod 輸入格式用：把驗證錯誤整理成「欄位路徑 → 第一則訊息」，方便比對規格的欄位錯誤文案。
import type { z } from 'zod';

export function fieldErrors(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export const accepts = (schema: z.ZodType, input: unknown): boolean => schema.safeParse(input).success;
