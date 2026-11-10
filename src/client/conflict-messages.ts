// 別人剛改過資料、操作不能完成時的提示（docs/spec/README.md COM-R08）：
// 違反的規則有既有提示時用那句提示，其他情況用共用文案。
// 需要帶入資料的提示（例如「{桌號} 桌已滿，請先移出一位。」）由各功能在送出操作時以 Job.conflictMessage 提供。
import type { ErrorCode } from '@/contracts/errors';
import { tableTitle } from '@/domain/layout';

export const CONFLICT_FALLBACK = '資料已被其他人更新，已重新載入。';

const BY_CODE: Partial<Record<ErrorCode, string>> = {
  // docs/spec/seating.md SEAT-R41、SEAT-R42、SEAT-R86；工作人員桌到 10 位（人員對話框）與到 12 位（拖移、加入人員，D-018）
  STAFF_TABLE_FULL: '工作人員桌已滿，請先移出一位。',
  STAFF_TABLE_LIMIT: '工作人員桌已達 12 位，請先移出一位。',
  STAFF_EMPLOYEE_ONLY: '只有員工可以放進工作人員桌。',
};

export const conflictMessage = (code: ErrorCode): string => BY_CODE[code] ?? CONFLICT_FALLBACK;

/** 桌次已滿：從選單入座時到 10 位（SEAT-R23、SEAT-R86）；參數是內部編號，文案用桌號（D-019） */
export const tableFullMessage = (tableId: number) => `${tableTitle(tableId)}已滿，請先移出一位。`;

/** 桌次已達 12 位：拖移或「加入人員」時（SEAT-R20、SEAT-R86、D-018）；參數是內部編號，文案用桌號（D-019） */
export const tableLimitMessage = (tableId: number) => `${tableTitle(tableId)}已達 12 位，請先移出一位。`;
