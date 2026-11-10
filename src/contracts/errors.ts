// API 錯誤格式（docs/architecture.md 第 8.2 節）：{ error: { code, message } }。
// 畫面文案由前端依 code 對應正式規格，message 只給開發者看。
import { z } from 'zod';

export const errorCodes = [
  'VALIDATION_FAILED',
  'IMPORT_FORMAT_INVALID',
  'UNAUTHENTICATED',
  'FORBIDDEN_ORIGIN',
  'NOT_FOUND',
  /** 一般桌到 10 位（選擇桌次、人員對話框） */
  'TABLE_FULL',
  /** 一般桌到 12 位（拖移、「加入人員」、復原，D-018） */
  'TABLE_LIMIT',
  /** 工作人員桌到 10 位（人員對話框的「工作人員」） */
  'STAFF_TABLE_FULL',
  /** 工作人員桌到 12 位（拖移、「加入人員」、復原，D-018） */
  'STAFF_TABLE_LIMIT',
  'STAFF_EMPLOYEE_ONLY',
  'DUPLICATE_PARTICIPANT',
  'DEPENDENT_EXISTS',
  'CONFLICT',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof errorCodes)[number];

export const errorStatus: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  IMPORT_FORMAT_INVALID: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN_ORIGIN: 403,
  NOT_FOUND: 404,
  TABLE_FULL: 409,
  TABLE_LIMIT: 409,
  STAFF_TABLE_FULL: 409,
  STAFF_TABLE_LIMIT: 409,
  STAFF_EMPLOYEE_ONLY: 409,
  DUPLICATE_PARTICIPANT: 409,
  DEPENDENT_EXISTS: 409,
  CONFLICT: 409,
  INTERNAL: 500,
};

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(errorCodes),
    message: z.string(),
    /** 欄位錯誤：欄位名稱 → 原因 */
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** 別人剛改過資料、這次操作不能完成：前端要重新載入（docs/spec/README.md COM-R07） */
export const isConflictCode = (code: ErrorCode) => errorStatus[code] === 409 || code === 'NOT_FOUND';
