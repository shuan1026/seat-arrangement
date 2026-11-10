// 員工的輸入格式：docs/spec/employees.md EMP-R33（必填與錯誤文案）、EMP-R54（組別留空）、EMP-AC40、EMP-AC41；
// README.md COM-R15（多個分機）；docs/architecture.md 第 7.1 節（欄位長度）。
import { describe, expect, it } from 'vitest';
import { employeeInputSchema, ROSTER_TEMPLATE_HEADER } from '@/contracts/employees';
import { accepts, fieldErrors } from '../../helpers/schema';

describe('employeeInputSchema', () => {
  it('只填姓名與部門就可以儲存，其他欄位都是空的', () => {
    const parsed = employeeInputSchema.parse({ name: '王小明', department: '研發一部' });
    expect(parsed).toMatchObject({ name: '王小明', department: '研發一部' });
    for (const key of ['englishName', 'team', 'extension', 'region', 'office', 'note'] as const) {
      expect(parsed[key] ?? null, key).toBeNull();
    }
  });

  it('姓名與部門都沒填：姓名「請輸入姓名。」、部門「請選擇部門。」（EMP-AC40）', () => {
    expect(fieldErrors(employeeInputSchema, { name: '', department: '' })).toEqual({
      name: '請輸入姓名。',
      department: '請選擇部門。',
    });
  });

  it('只有空白也算沒填', () => {
    expect(fieldErrors(employeeInputSchema, { name: '   ', department: '　' })).toEqual({
      name: '請輸入姓名。',
      department: '請選擇部門。',
    });
  });

  it('姓名填好、部門沒選：只有部門錯誤（EMP-AC41）', () => {
    expect(fieldErrors(employeeInputSchema, { name: '王小明', department: '' })).toEqual({
      department: '請選擇部門。',
    });
  });

  it('沒有姓名或部門欄位時，一樣是「請輸入姓名。」「請選擇部門。」（EMP-R33）', () => {
    expect(fieldErrors(employeeInputSchema, { department: '研發一部' })).toEqual({ name: '請輸入姓名。' });
    expect(fieldErrors(employeeInputSchema, { name: '王小明' })).toEqual({ department: '請選擇部門。' });
    expect(fieldErrors(employeeInputSchema, {})).toEqual({ name: '請輸入姓名。', department: '請選擇部門。' });
    expect(fieldErrors(employeeInputSchema, { name: null, department: null })).toEqual({
      name: '請輸入姓名。',
      department: '請選擇部門。',
    });
  });

  it('去掉姓名與部門前後的空白', () => {
    expect(employeeInputSchema.parse({ name: ' 王小明 ', department: ' 研發一部 ' })).toMatchObject({
      name: '王小明',
      department: '研發一部',
    });
  });

  it('選填欄位留空視為沒有（EMP-R54：組別留空就是沒有組別）', () => {
    expect(
      employeeInputSchema.parse({ name: '王小明', department: '研發一部', team: '', extension: '', note: '   ' }),
    ).toMatchObject({ team: null, extension: null, note: null });
  });

  it('多個分機以「／」合併的值原樣保留（COM-R15）', () => {
    expect(
      employeeInputSchema.parse({ name: '王小明', department: '研發一部', extension: '1234／1235' }).extension,
    ).toBe('1234／1235');
  });

  it('姓名、部門最多 50 字（資料表欄位長度）', () => {
    expect(accepts(employeeInputSchema, { name: '甲'.repeat(50), department: '乙'.repeat(50) })).toBe(true);
    expect(accepts(employeeInputSchema, { name: '甲'.repeat(51), department: '研發一部' })).toBe(false);
    expect(accepts(employeeInputSchema, { name: '王小明', department: '乙'.repeat(51) })).toBe(false);
  });
});

describe('ROSTER_TEMPLATE_HEADER（EMP-R45）', () => {
  it('範本表頭依序為分機、姓名、英文名、手機號碼、部門、地區、辦公室、代接群組、組別', () => {
    expect([...ROSTER_TEMPLATE_HEADER]).toEqual([
      '分機',
      '姓名',
      '英文名',
      '手機號碼',
      '部門',
      '地區',
      '辦公室',
      '代接群組',
      '組別',
    ]);
  });
});
