// 參與人員的輸入格式：docs/spec/participants.md PPL-R01（三種類別）、PPL-R05（稱謂選填）、PPL-R06、PPL-R51（外部貴賓姓名必填）、
// PPL-R09（兒童椅、素食）、PPL-R10（工作人員）、PPL-R46（同時加一位眷屬）、PPL-R59（必填文案）、
// PPL-R64（匯入改用 Google 表單報名表原檔，D-010）、PPL-Q07、PPL-Q08（編輯可變更類別與桌次，目前假設，D-008）、
// PPL-AC40、PPL-AC54、PPL-AC55；EMP-R21（一次加入多位至少一位）；seating.md SEAT-R01（API 的桌次是內部編號 1–30，D-019）。
import { describe, expect, it } from 'vitest';
import * as participantsContract from '@/contracts/participants';
import { accepts, fieldErrors } from '../../helpers/schema';

const { bulkJoinSchema, participantCreateSchema, participantUpdateSchema } = participantsContract;

describe('participantCreateSchema：外部貴賓', () => {
  it('姓名沒填顯示「請輸入姓名。」（PPL-R51、PPL-AC54）', () => {
    expect(fieldErrors(participantCreateSchema, { kind: 'GUEST', guestName: '' })).toEqual({
      guestName: '請輸入姓名。',
    });
    expect(fieldErrors(participantCreateSchema, { kind: 'GUEST', guestName: '   ' })).toEqual({
      guestName: '請輸入姓名。',
    });
  });

  it('沒有姓名欄位時也顯示「請輸入姓名。」（PPL-R59）', () => {
    expect(fieldErrors(participantCreateSchema, { kind: 'GUEST' })).toEqual({ guestName: '請輸入姓名。' });
  });

  it('只填姓名「貴賓席」就可以新增，單位／頭銜選填（PPL-R06、PPL-AC55）', () => {
    const parsed = participantCreateSchema.parse({ kind: 'GUEST', guestName: '貴賓席' });
    expect(parsed).toMatchObject({ kind: 'GUEST', guestName: '貴賓席', childSeat: false, vegetarian: false });
    expect(parsed.tableId ?? null).toBeNull();
    expect(parsed.note ?? null).toBeNull();
    expect(parsed.kind === 'GUEST' ? (parsed.organization ?? null) : 'not guest').toBeNull();
  });

  it('單位／頭銜、兒童椅、素食照填入的值（PPL-R09、PPL-AC02）', () => {
    expect(
      participantCreateSchema.parse({
        kind: 'GUEST',
        guestName: '林董',
        organization: '測試科技 董事長',
        childSeat: true,
        vegetarian: true,
      }),
    ).toMatchObject({ organization: '測試科技 董事長', childSeat: true, vegetarian: true });
  });
});

describe('participantCreateSchema：員工', () => {
  it('沒選員工顯示「請選擇員工。」（PPL-R59、PPL-AC54）', () => {
    expect(fieldErrors(participantCreateSchema, { kind: 'EMPLOYEE' })).toEqual({ employeeId: '請選擇員工。' });
    expect(fieldErrors(participantCreateSchema, { kind: 'EMPLOYEE', employeeId: null })).toEqual({
      employeeId: '請選擇員工。',
    });
  });

  it('預設不是工作人員、未入座', () => {
    expect(participantCreateSchema.parse({ kind: 'EMPLOYEE', employeeId: 1 })).toMatchObject({
      kind: 'EMPLOYEE',
      employeeId: 1,
      isStaff: false,
      tableId: null,
      childSeat: false,
      vegetarian: false,
    });
  });

  it('可以勾工作人員（PPL-R10、PPL-AC44）', () => {
    expect(participantCreateSchema.parse({ kind: 'EMPLOYEE', employeeId: 1, isStaff: true })).toMatchObject({
      isStaff: true,
    });
  });

  it('可以同時加一位眷屬，眷屬有自己的稱謂、兒童椅與素食（PPL-R46、PPL-AC40）', () => {
    expect(
      participantCreateSchema.parse({
        kind: 'EMPLOYEE',
        employeeId: 1,
        dependent: { relation: '子女', childSeat: true },
      }),
    ).toMatchObject({ dependent: { relation: '子女', childSeat: true, vegetarian: false } });
  });
});

describe('participantCreateSchema：眷屬', () => {
  it('沒選所屬員工顯示「請選擇所屬員工。」（PPL-R04、PPL-R59、PPL-AC54）', () => {
    expect(fieldErrors(participantCreateSchema, { kind: 'DEPENDENT' })).toEqual({ hostId: '請選擇所屬員工。' });
    expect(fieldErrors(participantCreateSchema, { kind: 'DEPENDENT', hostId: null })).toEqual({
      hostId: '請選擇所屬員工。',
    });
  });

  it('稱謂選填，留空視為沒有（PPL-R05）', () => {
    const relationOf = (input: object) => {
      const parsed = participantCreateSchema.parse({ kind: 'DEPENDENT', hostId: 11, ...input });
      return parsed.kind === 'DEPENDENT' ? (parsed.relation ?? null) : 'not dependent';
    };
    expect(relationOf({})).toBeNull();
    expect(relationOf({ relation: '' })).toBeNull();
    expect(relationOf({ relation: '配偶' })).toBe('配偶');
  });
});

describe('participantCreateSchema：類別與桌次', () => {
  it('類別只有員工、眷屬、外部貴賓（PPL-R01）', () => {
    expect(accepts(participantCreateSchema, { kind: 'VIP', guestName: '林董' })).toBe(false);
    expect(accepts(participantCreateSchema, { guestName: '林董' })).toBe(false);
  });

  it.each([1, 30, null])('桌次可以是第 1–30 桌或未入座（%s）', (tableId) => {
    expect(accepts(participantCreateSchema, { kind: 'GUEST', guestName: '林董', tableId })).toBe(true);
  });

  it.each([0, 31, -1, 2.5])('桌次不能是 %s（工作人員桌用「工作人員」指定，不是內部編號 0）', (tableId) => {
    expect(accepts(participantCreateSchema, { kind: 'GUEST', guestName: '林董', tableId })).toBe(false);
    expect(accepts(participantCreateSchema, { kind: 'EMPLOYEE', employeeId: 1, tableId })).toBe(false);
  });
});

describe('participantUpdateSchema', () => {
  it('只送要改的欄位', () => {
    expect(participantUpdateSchema.parse({})).toEqual({});
    expect(participantUpdateSchema.parse({ vegetarian: true })).toEqual({ vegetarian: true });
  });

  it('外部貴賓的姓名改成空白顯示「請輸入姓名。」（PPL-R51）', () => {
    expect(fieldErrors(participantUpdateSchema, { guestName: '' })).toEqual({ guestName: '請輸入姓名。' });
  });

  it.each(['EMPLOYEE', 'DEPENDENT', 'GUEST'])('編輯時可以把類別改成 %s（PPL-Q07 的目前假設）', (kind) => {
    expect(participantUpdateSchema.parse({ kind })).toEqual({ kind });
  });

  it('改成員工時帶上要對應的員工（PPL-Q07 的目前假設）', () => {
    expect(participantUpdateSchema.parse({ kind: 'EMPLOYEE', employeeId: 3 })).toEqual({
      kind: 'EMPLOYEE',
      employeeId: 3,
    });
    expect(accepts(participantUpdateSchema, { kind: 'EMPLOYEE', employeeId: 'abc' })).toBe(false);
    expect(accepts(participantUpdateSchema, { kind: 'EMPLOYEE', employeeId: 1.5 })).toBe(false);
  });

  it('類別只有員工、眷屬、外部貴賓（PPL-R01）', () => {
    expect(accepts(participantUpdateSchema, { kind: 'VIP' })).toBe(false);
  });

  it.each([1, 30, null])('編輯時可以改到第 1–30 桌或改回未入座（%s）（PPL-Q08 的目前假設）', (tableId) => {
    expect(participantUpdateSchema.parse({ tableId })).toEqual({ tableId });
  });

  it.each([0, 31, -1, 2.5])('編輯時桌次不能是 %s（工作人員桌用「工作人員」指定）', (tableId) => {
    expect(accepts(participantUpdateSchema, { tableId })).toBe(false);
  });
});

describe('bulkJoinSchema（EMP-R21、EMP-R22）', () => {
  it('至少勾一位員工', () => {
    expect(accepts(bulkJoinSchema, { employeeIds: [] })).toBe(false);
    expect(accepts(bulkJoinSchema, { employeeIds: [1, 2, 3] })).toBe(true);
  });
});

describe('匯入參與人員（PPL-R64、D-010）', () => {
  it('不再提供自訂的匯入範本（改用 Google 表單報名表原檔，對話框沒有「下載範本」）', () => {
    expect(Object.keys(participantsContract).filter((name) => /TEMPLATE/i.test(name))).toEqual([]);
  });
});
