// 權限與發布的錯誤碼：docs/architecture.md 第 8.2 節——403 NOT_EDITOR（不是編輯者呼叫會修改資料的 API 或編輯者名單的 API）、
// 409 EDITOR_EXISTS（新增的 email 已在名單）、409 LAST_EDITOR（要移除的是最後一位）；D-021。
// NOT_EDITOR 不是「別人剛改過資料」：前端另外處理（AUTH-R13，見 tests/unit/client/save-queue-not-editor.test.ts）。
import { describe, expect, it } from 'vitest';
import { apiErrorSchema, errorStatus, isConflictCode, type ErrorCode } from '@/contracts/errors';

describe('errorStatus（權限）', () => {
  it.each<[ErrorCode, number]>([
    ['NOT_EDITOR', 403],
    ['EDITOR_EXISTS', 409],
    ['LAST_EDITOR', 409],
  ])('%s 是 HTTP %i', (code, status) => {
    expect(errorStatus[code]).toBe(status);
  });
});

describe('isConflictCode', () => {
  it('NOT_EDITOR 不是別人剛改過資料（不用共用的「資料已被其他人更新」）', () => {
    expect(isConflictCode('NOT_EDITOR')).toBe(false);
  });

  it.each<ErrorCode>(['EDITOR_EXISTS', 'LAST_EDITOR'])('%s 是別人剛改過名單（PRM-R10、PRM-R12）', (code) => {
    expect(isConflictCode(code)).toBe(true);
  });
});

describe('apiErrorSchema', () => {
  it.each(['NOT_EDITOR', 'EDITOR_EXISTS', 'LAST_EDITOR'])('%s 是合法的錯誤碼', (code) => {
    expect(apiErrorSchema.safeParse({ error: { code, message: code } }).success).toBe(true);
  });
});
