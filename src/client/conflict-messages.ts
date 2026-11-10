// 別人剛改過資料、操作不能完成時的提示（docs/spec/README.md COM-R08）：
// 違反的規則有既有提示時用那句提示，其他情況用共用文案。
// 需要帶入資料的提示（例如「第 {n} 桌已滿，請先移出一位。」）由各功能在送出操作時以 Job.conflictMessage 提供。
import type { ErrorCode } from '@/contracts/errors';

export const CONFLICT_FALLBACK = '資料已被其他人更新，已重新載入。';

const BY_CODE: Partial<Record<ErrorCode, string>> = {
  // docs/spec/seating.md SEAT-R41、SEAT-R42、SEAT-R86
  STAFF_TABLE_FULL: '工作人員桌已滿，請先移出一位。',
  STAFF_EMPLOYEE_ONLY: '只有員工可以放進工作人員桌。',
};

export const conflictMessage = (code: ErrorCode): string => BY_CODE[code] ?? CONFLICT_FALLBACK;

/** 桌次已滿（SEAT-R20、SEAT-R86） */
export const tableFullMessage = (tableId: number) => `第 ${tableId} 桌已滿，請先移出一位。`;
