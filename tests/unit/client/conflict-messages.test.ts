// 別人剛改過資料時的提示：docs/spec/README.md COM-R08、第 14 節「別人剛改過資料」、COM-AC04、COM-AC05；
// docs/spec/seating.md SEAT-R20、SEAT-R41、SEAT-R42、SEAT-R86（座位安排的既有提示）；
// docs/architecture.md 第 8.2 節（404、DUPLICATE_PARTICIPANT、DEPENDENT_EXISTS 用共用文案）。
import { describe, expect, it } from 'vitest';
import type { ErrorCode } from '@/contracts/errors';
import { CONFLICT_FALLBACK, conflictMessage, tableFullMessage } from '@/client/conflict-messages';

describe('conflictMessage', () => {
  it('共用文案是「資料已被其他人更新，已重新載入。」', () => {
    expect(CONFLICT_FALLBACK).toBe('資料已被其他人更新，已重新載入。');
  });

  it.each<ErrorCode>(['NOT_FOUND', 'DUPLICATE_PARTICIPANT', 'DEPENDENT_EXISTS', 'CONFLICT'])(
    '%s 沒有既有提示，用共用文案',
    (code) => {
      expect(conflictMessage(code)).toBe('資料已被其他人更新，已重新載入。');
    },
  );

  it('工作人員桌被別人放滿：「工作人員桌已滿，請先移出一位。」（SEAT-R42、SEAT-R86）', () => {
    expect(conflictMessage('STAFF_TABLE_FULL')).toBe('工作人員桌已滿，請先移出一位。');
  });

  it('只有員工可以放進工作人員桌：「只有員工可以放進工作人員桌。」（SEAT-R41）', () => {
    expect(conflictMessage('STAFF_EMPLOYEE_ONLY')).toBe('只有員工可以放進工作人員桌。');
  });
});

describe('tableFullMessage（SEAT-R20、SEAT-R86、COM-AC04、SEAT-AC88）', () => {
  it.each([
    [5, '第 5 桌已滿，請先移出一位。'],
    [1, '第 1 桌已滿，請先移出一位。'],
    [30, '第 30 桌已滿，請先移出一位。'],
  ])('第 %i 桌', (tableId, text) => {
    expect(tableFullMessage(tableId)).toBe(text);
  });
});
