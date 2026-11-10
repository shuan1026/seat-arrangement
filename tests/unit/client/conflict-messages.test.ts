// 別人剛改過資料時的提示：docs/spec/README.md COM-R08、第 14 節「別人剛改過資料」、COM-AC04、COM-AC05；
// docs/spec/seating.md SEAT-R20、SEAT-R41、SEAT-R42、SEAT-R86（座位安排的既有提示）；
// docs/architecture.md 第 8.2 節（404、DUPLICATE_PARTICIPANT、DEPENDENT_EXISTS 用共用文案）。
// D-018：從選單入座時桌次被坐到 10 位用「第 {n} 桌已滿，請先移出一位。」；拖移或「加入人員」時桌次被坐到 12 位用
// 「第 {n} 桌已達 12 位，請先移出一位。」；工作人員桌被放到 12 位用「工作人員桌已達 12 位，請先移出一位。」（SEAT-R86）。
//
// 假設 src/client/conflict-messages.ts 另外匯出：
//   export const tableLimitMessage: (tableId: number) => string;   // 「第 {n} 桌已達 12 位，請先移出一位。」
import { describe, expect, it } from 'vitest';
import type { ErrorCode } from '@/contracts/errors';
import { CONFLICT_FALLBACK, conflictMessage, tableFullMessage, tableLimitMessage } from '@/client/conflict-messages';

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

  it('工作人員桌已到 10 位（人員對話框的「工作人員」）：「工作人員桌已滿，請先移出一位。」（PPL-R54、seating.md 4.5）', () => {
    expect(conflictMessage('STAFF_TABLE_FULL')).toBe('工作人員桌已滿，請先移出一位。');
  });

  it('工作人員桌被別人放到 12 位：「工作人員桌已達 12 位，請先移出一位。」（SEAT-R42、SEAT-R86、D-018）', () => {
    expect(conflictMessage('STAFF_TABLE_LIMIT')).toBe('工作人員桌已達 12 位，請先移出一位。');
  });

  it('只有員工可以放進工作人員桌：「只有員工可以放進工作人員桌。」（SEAT-R41）', () => {
    expect(conflictMessage('STAFF_EMPLOYEE_ONLY')).toBe('只有員工可以放進工作人員桌。');
  });
});

describe('tableFullMessage：從選單入座時桌次已到 10 位（SEAT-R23、SEAT-R86、COM-AC04、SEAT-AC97）', () => {
  it.each([
    [5, '第 5 桌已滿，請先移出一位。'],
    [1, '第 1 桌已滿，請先移出一位。'],
    [30, '第 30 桌已滿，請先移出一位。'],
  ])('第 %i 桌', (tableId, text) => {
    expect(tableFullMessage(tableId)).toBe(text);
  });
});

describe('tableLimitMessage：拖移或「加入人員」時桌次已到 12 位（SEAT-R20、SEAT-R86、SEAT-AC14、SEAT-AC88、SEAT-AC92）', () => {
  it.each([
    [5, '第 5 桌已達 12 位，請先移出一位。'],
    [1, '第 1 桌已達 12 位，請先移出一位。'],
    [30, '第 30 桌已達 12 位，請先移出一位。'],
  ])('第 %i 桌', (tableId, text) => {
    expect(tableLimitMessage(tableId)).toBe(text);
  });
});
