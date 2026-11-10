// API 錯誤格式與 HTTP 狀態碼：docs/architecture.md 第 8.1、8.2 節；COM-R07（哪些錯誤代表別人剛改過資料）；
// D-018：超過上限回 409，錯誤碼區分 10 位（TABLE_FULL、STAFF_TABLE_FULL）與 12 位（TABLE_LIMIT、STAFF_TABLE_LIMIT）。
import { describe, expect, it } from 'vitest';
import { apiErrorSchema, errorStatus, isConflictCode, type ErrorCode } from '@/contracts/errors';

describe('errorStatus', () => {
  it.each<[ErrorCode, number]>([
    ['VALIDATION_FAILED', 400],
    ['IMPORT_FORMAT_INVALID', 400],
    ['UNAUTHENTICATED', 401],
    ['NOT_FOUND', 404],
    ['TABLE_FULL', 409],
    ['TABLE_LIMIT', 409],
    ['STAFF_TABLE_FULL', 409],
    ['STAFF_TABLE_LIMIT', 409],
    ['STAFF_EMPLOYEE_ONLY', 409],
    ['DUPLICATE_PARTICIPANT', 409],
    ['DEPENDENT_EXISTS', 409],
    ['INTERNAL', 500],
  ])('%s 是 HTTP %i', (code, status) => {
    expect(errorStatus[code]).toBe(status);
  });
});

describe('isConflictCode（COM-R07：這次操作不儲存、重新載入）', () => {
  it.each<ErrorCode>([
    'NOT_FOUND',
    'TABLE_FULL',
    'TABLE_LIMIT',
    'STAFF_TABLE_FULL',
    'STAFF_TABLE_LIMIT',
    'STAFF_EMPLOYEE_ONLY',
    'DUPLICATE_PARTICIPANT',
    'DEPENDENT_EXISTS',
  ])('%s 是別人剛改過資料', (code) => {
    expect(isConflictCode(code)).toBe(true);
  });

  it.each<ErrorCode>(['VALIDATION_FAILED', 'IMPORT_FORMAT_INVALID', 'UNAUTHENTICATED', 'INTERNAL'])(
    '%s 不是',
    (code) => {
      expect(isConflictCode(code)).toBe(false);
    },
  );
});

describe('apiErrorSchema', () => {
  it('錯誤格式是 { error: { code, message } }，可帶欄位錯誤', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'TABLE_FULL', message: 'table full' } }).success).toBe(true);
    expect(apiErrorSchema.safeParse({ error: { code: 'TABLE_LIMIT', message: 'table limit' } }).success).toBe(true);
    expect(apiErrorSchema.safeParse({ error: { code: 'STAFF_TABLE_LIMIT', message: 'staff limit' } }).success).toBe(true);
    expect(
      apiErrorSchema.safeParse({
        error: { code: 'VALIDATION_FAILED', message: 'invalid', fields: { name: '請輸入姓名。' } },
      }).success,
    ).toBe(true);
  });

  it('不認得的 code 不是合法的錯誤格式', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'SOMETHING_ELSE', message: 'x' } }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ code: 'TABLE_FULL' }).success).toBe(false);
  });
});
