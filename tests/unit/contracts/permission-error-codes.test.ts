// 權限與發布的錯誤碼與資料形狀：docs/architecture.md 第 8 節、第 8.2 節——403 NOT_EDITOR（檢視者呼叫會修改資料的 API 或權限名單的 API）、
// 403 NO_ACCESS（不在權限名單上的人呼叫 GET /api/seats 以外的 API，D-026）、409 MEMBER_EXISTS（新增的 email 已在名單，原本的 EDITOR_EXISTS 改名）、
// 409 LAST_EDITOR（要移除或改為檢視者的是最後一位編輯者）；D-021、D-026。
// NOT_EDITOR、NO_ACCESS 都不是「別人剛改過資料」：前端另外處理（AUTH-R13、AUTH-R17，見 tests/unit/client/save-queue-not-editor.test.ts）。
//
// 假設的介面（src/contracts/permissions.ts）：
//   memberSchema = z.object({ id: number, email: string, role: 'EDITOR' | 'VIEWER' })，型別 Member
//   memberCreateSchema = z.object({ email: string, role: 'EDITOR' | 'VIEWER' })   // POST /api/members 的本體
//   memberRoleUpdateSchema = z.object({ role: 'EDITOR' | 'VIEWER' })              // PATCH /api/members/{id} 的本體
//   舊的 editorSchema、editorCreateSchema 拿掉。
import { describe, expect, it } from 'vitest';
import { apiErrorSchema, errorCodes, errorStatus, isConflictCode, type ErrorCode } from '@/contracts/errors';
import * as permissions from '@/contracts/permissions';
import { accepts } from '../../helpers/schema';

const { memberCreateSchema, memberRoleUpdateSchema, memberSchema } = permissions;

describe('errorStatus（權限）', () => {
  it.each<[ErrorCode, number]>([
    ['NOT_EDITOR', 403],
    ['NO_ACCESS', 403],
    ['MEMBER_EXISTS', 409],
    ['LAST_EDITOR', 409],
  ])('%s 是 HTTP %i', (code, status) => {
    expect(errorStatus[code]).toBe(status);
  });

  it('EDITOR_EXISTS 改名為 MEMBER_EXISTS，不再是錯誤碼', () => {
    expect((errorCodes as readonly string[]).includes('EDITOR_EXISTS')).toBe(false);
    expect(errorCodes).toContain('MEMBER_EXISTS');
    expect(errorCodes).toContain('NO_ACCESS');
  });
});

describe('isConflictCode', () => {
  it.each<ErrorCode>(['NOT_EDITOR', 'NO_ACCESS'])('%s 不是別人剛改過資料（不用共用的「資料已被其他人更新」）', (code) => {
    expect(isConflictCode(code)).toBe(false);
  });

  it.each<ErrorCode>(['MEMBER_EXISTS', 'LAST_EDITOR'])('%s 是別人剛改過名單（PRM-R10、PRM-R12）', (code) => {
    expect(isConflictCode(code)).toBe(true);
  });
});

describe('apiErrorSchema', () => {
  it.each(['NOT_EDITOR', 'NO_ACCESS', 'MEMBER_EXISTS', 'LAST_EDITOR'])('%s 是合法的錯誤碼', (code) => {
    expect(apiErrorSchema.safeParse({ error: { code, message: code } }).success).toBe(true);
  });

  it('MEMBER_EXISTS 可以帶 fields.email（「{email} 已經是檢視者。」）', () => {
    expect(
      apiErrorSchema.safeParse({ error: { code: 'MEMBER_EXISTS', message: 'exists', fields: { email: 'yi@program.com.tw 已經是檢視者。' } } }).success,
    ).toBe(true);
  });

  it('EDITOR_EXISTS 不是合法的錯誤碼', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'EDITOR_EXISTS', message: 'x' } }).success).toBe(false);
  });
});

describe('權限名單的資料形狀（docs/architecture.md 第 8 節）', () => {
  it('memberSchema：{ id, email, role }，role 是 EDITOR 或 VIEWER', () => {
    expect(memberSchema.parse({ id: 1, email: 'jia@program.com.tw', role: 'EDITOR' })).toEqual({ id: 1, email: 'jia@program.com.tw', role: 'EDITOR' });
    expect(accepts(memberSchema, { id: 2, email: 'yi@program.com.tw', role: 'VIEWER' })).toBe(true);
    expect(accepts(memberSchema, { id: 2, email: 'yi@program.com.tw' })).toBe(false);
    expect(accepts(memberSchema, { id: 2, email: 'yi@program.com.tw', role: 'ADMIN' })).toBe(false);
  });

  it('memberCreateSchema：email 與 role 都要有；role 只能是 EDITOR 或 VIEWER（大小寫不同不算）', () => {
    expect(accepts(memberCreateSchema, { email: 'bing@program.com.tw', role: 'VIEWER' })).toBe(true);
    expect(accepts(memberCreateSchema, { email: 'bing@program.com.tw', role: 'EDITOR' })).toBe(true);
    expect(accepts(memberCreateSchema, { email: 'bing@program.com.tw' })).toBe(false);
    expect(accepts(memberCreateSchema, { email: 'bing@program.com.tw', role: 'viewer' })).toBe(false);
    expect(accepts(memberCreateSchema, { email: 'bing@program.com.tw', role: '檢視者' })).toBe(false);
    expect(accepts(memberCreateSchema, { role: 'VIEWER' })).toBe(false);
  });

  it('memberRoleUpdateSchema：{ role }，role 只能是 EDITOR 或 VIEWER', () => {
    expect(accepts(memberRoleUpdateSchema, { role: 'EDITOR' })).toBe(true);
    expect(accepts(memberRoleUpdateSchema, { role: 'VIEWER' })).toBe(true);
    expect(accepts(memberRoleUpdateSchema, {})).toBe(false);
    expect(accepts(memberRoleUpdateSchema, { role: 'OWNER' })).toBe(false);
  });

  it('舊的 editorSchema、editorCreateSchema 已經拿掉', () => {
    const exported = permissions as unknown as Record<string, unknown>;
    expect(exported.editorSchema).toBeUndefined();
    expect(exported.editorCreateSchema).toBeUndefined();
  });
});
