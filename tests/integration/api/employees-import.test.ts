// 匯入員工名單：POST /api/employees/import（multipart，欄位 file）→ ImportResult（src/contracts/imports.ts）。
// 規格：docs/spec/employees.md 第 3.8 節 EMP-R44～R62，驗收條件 EMP-AC59～AC73；docs/architecture.md 第 11.1 節
// （匯入順序寫進 sortOrder、新增的員工排在最後、上限 1 MB）；D-011（不刪除檔案裡沒有的員工）；
// D-012（英文名空白略過、合併列取第一列、已有兩位同名同部門時列為需要處理、欄位一致的判斷）；
// 待確認 EMP-Q02（非 CSV 檔）、Q03（{n} 含更新的員工，依 contracts/imports.ts 的 imported）、Q04、Q06、Q09 依 D-008 照目前做法。
// 列的解析規則逐條在 tests/unit/domain/roster-import.test.ts；這裡驗證寫進資料庫的結果與 API 回應。
// 不參加的標記（D-014）：更新既有員工時維持不變、新增的員工是未報名（EMP-R66、EMP-AC87）。
// 錯誤清單的列號（errors[].row）是這一列在檔案中的列號，和用 Excel 開啟時一致：表頭是第 1 列，空白列也算一列，
// 儲存格內的換行不另算一列（階段 3 決定；見本檔最後一個 describe 與 tests/unit/server/csv.test.ts）。
import iconv from 'iconv-lite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/employees/import/route';
import { importResultSchema, type ImportResult } from '@/contracts/imports';
import { buildDirectory, displayName, employeeSecondLine } from '@/domain/display';
import { departmentOptions } from '@/domain/employees';
import { loadState } from '@/server/services/state';
import { prisma, resetData } from '../../helpers/db';
import {
  ADDRESS_BOOK_HEADER,
  FAKE_MOBILE,
  FAKE_PICKUP_GROUP,
  SHUFFLED_HEADER,
  SWITCHBOARD_ROW,
  TEMPLATE_HEADER,
  headerRenamed,
  headerWithout,
  rosterCsv,
  rosterPerson,
  withSerial,
  type RosterColumn,
  type RosterRecord,
} from '../../helpers/employees-roster';
import { createDependent, createEmployee, createRegisteredEmployee } from '../../helpers/factory';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

const URL_IMPORT = 'http://localhost:3000/api/employees/import';

function upload(content: string | Uint8Array<ArrayBuffer> | null, filename = 'roster.csv') {
  const form = new FormData();
  if (content !== null) form.append('file', new File([content], filename, { type: 'text/csv' }));
  return POST(new Request(URL_IMPORT, { method: 'POST', body: form }), { params: Promise.resolve({}) });
}

async function imported(records: readonly RosterRecord[], header?: readonly string[]): Promise<ImportResult> {
  const res = await upload(rosterCsv(records, header));
  expect(res.ok, `匯入回應 ${res.status}`).toBe(true);
  return importResultSchema.parse(await res.json());
}

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = (await res.json()) as { error: { code: string; fields?: Record<string, string> } };
  expect(body.error.code).toBe(code);
  return body.error;
}

const employeesNamed = (name: string) => prisma.employee.findMany({ where: { name }, orderBy: { id: 'asc' } });

beforeEach(async () => {
  await resetData();
});

describe('檔案本身的檢查（EMP-R47、EMP-R48、EMP-Q02）', () => {
  it('沒選檔案：400，檔案欄位「請選擇要匯入的檔案。」，員工名單不變（EMP-R47、EMP-AC59）', async () => {
    await createEmployee({ name: '既有', department: '研發部' });
    const error = await expectError(await upload(null), 400, 'VALIDATION_FAILED');
    expect(error.fields).toMatchObject({ file: '請選擇要匯入的檔案。' });
    expect(await prisma.employee.count()).toBe(1);
  });

  it.each([
    ['少了「部門」欄', headerWithout('部門')],
    ['「部門」欄名改成「單位」', headerRenamed('部門', '單位')],
  ])('%s：400 IMPORT_FORMAT_INVALID，檔案中的任何一列都沒有匯入（EMP-R48、EMP-AC60）', async (_label, header) => {
    const existing = await createEmployee({ name: '既有', department: '研發部', extension: '1111' });
    const csv = rosterCsv(
      [
        { ...rosterPerson('王小明', '業務部'), 單位: '業務部' },
        { ...rosterPerson('既有', '研發部', { 分機: '9999' }), 單位: '研發部' },
      ],
      header,
    );
    await expectError(await upload(csv), 400, 'IMPORT_FORMAT_INVALID');
    const rows = await prisma.employee.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: existing.id, extension: '1111' });
  });

  it('不是 CSV 檔（副檔名 .txt）：400 IMPORT_FORMAT_INVALID，不匯入（EMP-Q02 原型只檢查副檔名）', async () => {
    await expectError(await upload(rosterCsv([rosterPerson('王小明', '業務部')]), 'roster.txt'), 400, 'IMPORT_FORMAT_INVALID');
    expect(await prisma.employee.count()).toBe(0);
  });

  it('Big5 編碼的檔案也能匯入（docs/architecture.md 第 4 節）', async () => {
    const bytes = Uint8Array.from(iconv.encode(rosterCsv([rosterPerson('王小明', '業務部', { 分機: '1234' })]), 'big5'));
    const res = await upload(bytes);
    expect(res.ok).toBe(true);
    expect((await employeesNamed('王小明')).map((e) => e.extension)).toEqual(['1234']);
  });

  it('只有表頭：沒有任何員工、沒有需要處理的列', async () => {
    const result = await imported([]);
    expect(result).toMatchObject({ imported: 0, created: 0, updated: 0, errors: [] });
    expect(await prisma.employee.count()).toBe(0);
  });
});

describe('新增員工（EMP-R55、EMP-R59）', () => {
  it('EMP-AC61：員工名單是空的、檔案有 3 列員工 → 新增 3 位，{n} 為 3、{m} 為 0', async () => {
    const result = await imported([
      rosterPerson('王小明', '業務部', { 分機: '1234', 英文名: 'Xiaoming', 地區: '台北', 辦公室: '台北辦公室', 組別: '北區組' }),
      rosterPerson('李小華', '研發部', { 分機: '2001', 英文名: 'Lisa', 地區: '台中', 組別: '韌體組' }),
      rosterPerson('張三', '研發部', { 分機: '2002', 英文名: 'Zhang', 組別: '軟體組' }),
    ]);
    expect(result).toMatchObject({ imported: 3, created: 3, updated: 0, errors: [] });

    const rows = await prisma.employee.findMany({ orderBy: { sortOrder: 'asc' } });
    expect(rows.map((e) => e.name)).toEqual(['王小明', '李小華', '張三']);
    expect(rows[0]).toMatchObject({
      name: '王小明',
      englishName: 'Xiaoming',
      department: '業務部',
      team: '北區組',
      extension: '1234',
      region: '台北',
      office: '台北辦公室',
      note: null,
    });
  });

  it('新增的員工依檔案的列順序，排在既有員工之後（docs/architecture.md 第 11.1 節、EMP-Q09）', async () => {
    const existing = await createEmployee({ name: '既有', department: '研發部', sortOrder: 100 });
    await imported([rosterPerson('乙', '業務部'), rosterPerson('甲', '研發部')]);
    const rows = await prisma.employee.findMany({ orderBy: { sortOrder: 'asc' } });
    expect(rows.map((e) => e.name)).toEqual(['既有', '乙', '甲']);
    expect(rows[1]!.sortOrder).toBeGreaterThan(existing.sortOrder);
  });

  it('新增的員工是未報名', async () => {
    await imported([rosterPerson('王小明', '業務部')]);
    expect(await prisma.participant.count()).toBe(0);
  });

  it('{n} 以員工計算：合併成一位的多列只算一位', async () => {
    const result = await imported([
      rosterPerson('王小明', '業務部', { 分機: '1234' }),
      rosterPerson('王小明', '業務部', { 分機: '1235' }),
      rosterPerson('李小華', '研發部'),
    ]);
    expect(result).toMatchObject({ imported: 2, created: 2, errors: [] });
  });
});

describe('略過與合併（EMP-R46、EMP-R49～R54）', () => {
  it('EMP-AC62、AC63：總機資訊列（多行分機）與整列空白的分隔列不新增員工，也不算在 {m}；其他列照常匯入', async () => {
    const result = await imported([
      SWITCHBOARD_ROW,
      rosterPerson('王小明', '業務部'),
      {},
      rosterPerson('李小華', '研發部'),
    ]);
    expect(result).toMatchObject({ imported: 2, created: 2, errors: [] });
    expect((await prisma.employee.findMany({ orderBy: { sortOrder: 'asc' } })).map((e) => e.name)).toEqual([
      '王小明',
      '李小華',
    ]);
  });

  it('EMP-AC64：姓名「第一會議室」、部門「公共區域」的列不新增，也不算在 {m}；部門清單不出現「公共區域」', async () => {
    const result = await imported([
      { 分機: '1600', 姓名: '第一會議室', 部門: '公共區域', 地區: '台北' },
      rosterPerson('王小明', '業務部'),
    ]);
    expect(result).toMatchObject({ imported: 1, errors: [] });
    const { employees } = await loadState();
    expect(departmentOptions(employees)).toEqual(['業務部']);
    expect(employees.some((e) => e.name === '第一會議室')).toBe(false);
  });

  it('EMP-AC65：姓名「空位」、英文名「空位」，分機與部門都有值的列不新增，也不算在 {m}', async () => {
    const result = await imported([{ 分機: '1500', 姓名: '空位', 英文名: '空位', 部門: '研發部' }, rosterPerson('王小明', '業務部')]);
    expect(result).toMatchObject({ imported: 1, errors: [] });
    expect(await employeesNamed('空位')).toEqual([]);
  });

  it('EMP-AC66：兩列王小明（業務部），分機 1234 與 1235 → 只新增一位，分機「1234／1235」', async () => {
    await imported([rosterPerson('王小明', '業務部', { 分機: '1234' }), rosterPerson('王小明', '業務部', { 分機: '1235' })]);
    const rows = await employeesNamed('王小明');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.extension).toBe('1234／1235');
  });

  it('EMP-AC67：分機「N/A」→ 沒有分機，第二行只顯示部門（EMP-R53、COM-R10）', async () => {
    await imported([rosterPerson('王小明', '業務部', { 分機: 'N/A' })]);
    const [row] = await employeesNamed('王小明');
    expect(row!.extension).toBeNull();
    expect(employeeSecondLine(row!)).toBe('業務部');
  });

  it('EMP-AC68：組別填「韌體組」的有組別，留空的沒有組別（EMP-R54）', async () => {
    await imported([rosterPerson('李小華', '研發部', { 組別: '韌體組' }), rosterPerson('張三', '研發部', { 組別: '' })]);
    expect((await employeesNamed('李小華'))[0]!.team).toBe('韌體組');
    expect((await employeesNamed('張三'))[0]!.team).toBeNull();
  });
});

describe('對應既有員工：姓名加部門（EMP-R55～R57、EMP-R61）', () => {
  it('EMP-AC69：已有王小明（業務部、1234、北區組、備註素食）→ 檔案分機 1300、組別留空 → 仍只有一位；分機 1300、沒有組別、備註仍是素食', async () => {
    const wang = await createEmployee({
      name: '王小明',
      department: '業務部',
      extension: '1234',
      team: '北區組',
      note: '素食',
      englishName: 'Old',
      region: '台中',
      office: '舊辦公室',
    });
    const result = await imported([
      rosterPerson('王小明', '業務部', { 分機: '1300', 組別: '', 英文名: 'Xiaoming', 地區: '台北', 辦公室: '台北辦公室' }),
    ]);
    expect(result).toMatchObject({ imported: 1, created: 0, updated: 1, errors: [] });

    const rows = await employeesNamed('王小明');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: wang.id,
      extension: '1300',
      team: null,
      note: '素食',
      englishName: 'Xiaoming',
      region: '台北',
      office: '台北辦公室',
    });
  });

  it('更新既有員工不改變他在員工名單的位置（EMP-Q09：匯入更新不改位置）', async () => {
    const wang = await createEmployee({ name: '王小明', department: '業務部', sortOrder: 5 });
    await createEmployee({ name: '李小華', department: '研發部', sortOrder: 6 });
    await imported([rosterPerson('新人', '研發部'), rosterPerson('王小明', '業務部', { 分機: '1300' })]);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: wang.id } })).sortOrder).toBe(5);
  });

  it('EMP-AC70：已有王小明（業務部）→ 檔案有王小明（研發部）→ 新增一位研發部的王小明，業務部的不變', async () => {
    const wang = await createEmployee({ name: '王小明', department: '業務部', extension: '1234' });
    const result = await imported([rosterPerson('王小明', '研發部', { 分機: '2234' })]);
    expect(result).toMatchObject({ imported: 1, created: 1, updated: 0 });
    const rows = await employeesNamed('王小明');
    expect(rows.map((e) => [e.department, e.extension])).toEqual([
      ['業務部', '1234'],
      ['研發部', '2234'],
    ]);
    expect(rows[0]!.id).toBe(wang.id);
  });

  it('換了部門的已報名員工：新增另一位，報名留在舊的那筆（EMP-Q04 目前做法）', async () => {
    const old = await createRegisteredEmployee({ name: '王小明', department: '業務部' }, { tableId: 5, seatOrder: 0 });
    await imported([rosterPerson('王小明', '研發部')]);
    const p = await prisma.participant.findUniqueOrThrow({ where: { id: old.participant.id } });
    expect(p).toMatchObject({ employeeId: old.employee.id, tableId: 5, seatOrder: 0 });
    expect(await prisma.participant.count()).toBe(1);
  });

  it('EMP-AC71：已報名、坐第 5 桌的王小明分機改成 1300 → 參與人員與桌次詳情的第二行跟著變，座位不變（EMP-R57）', async () => {
    const wang = await createRegisteredEmployee(
      { name: '王小明', department: '業務部', extension: '1234' },
      { tableId: 5, seatOrder: 0 },
    );
    const dependent = await createDependent(wang.participant.id, { tableId: 5, seatOrder: 1 });
    await imported([rosterPerson('王小明', '業務部', { 分機: '1300' })]);

    const state = await loadState();
    const dir = buildDirectory(state);
    const me = state.participants.find((p) => p.id === wang.participant.id)!;
    expect(me).toMatchObject({ employeeId: wang.employee.id, tableId: 5, seatOrder: 0 });
    expect(displayName(me, dir)).toBe('王小明');
    expect(employeeSecondLine(state.employees.find((e) => e.id === wang.employee.id)!)).toBe('業務部・分機 1300');
    expect(state.participants.find((p) => p.id === dependent.id)).toMatchObject({ hostId: wang.participant.id, tableId: 5 });
  });

  it('員工名單裡有、這次檔案裡沒有的員工保留不變，報名與座位也不變（EMP-R61、D-011）', async () => {
    const left = await createRegisteredEmployee(
      { name: '已離職', department: '研發部', extension: '2999', note: '保留' },
      { tableId: 3, seatOrder: 0 },
    );
    const dependent = await createDependent(left.participant.id, { tableId: 3, seatOrder: 1 });
    await imported([rosterPerson('王小明', '業務部')]);

    expect(await prisma.employee.findUniqueOrThrow({ where: { id: left.employee.id } })).toMatchObject({
      name: '已離職',
      extension: '2999',
      note: '保留',
    });
    expect(await prisma.participant.findUniqueOrThrow({ where: { id: left.participant.id } })).toMatchObject({
      tableId: 3,
      seatOrder: 0,
    });
    expect(await prisma.participant.findUniqueOrThrow({ where: { id: dependent.id } })).toMatchObject({ tableId: 3 });
  });

  it('EMP-AC87：甲不參加 → 匯入含甲（分機改為 1235）與新員工丁的通訊錄 → 甲的分機更新、仍是不參加；丁是未報名（EMP-R66、D-014）', async () => {
    const jia = await createEmployee({ name: '甲', department: '研發部', extension: '1234', declined: true });

    const result = await imported([rosterPerson('甲', '研發部', { 分機: '1235' }), rosterPerson('丁', '業務部', { 分機: '2001' })]);

    expect(result).toMatchObject({ imported: 2, created: 1, updated: 1, errors: [] });
    expect(await prisma.employee.findUniqueOrThrow({ where: { id: jia.id } })).toMatchObject({ extension: '1235', declined: true });
    const [ding] = await employeesNamed('丁');
    expect(ding).toMatchObject({ extension: '2001', declined: false });
    expect(await prisma.participant.count()).toBe(0);
  });

  it('未報名的員工經匯入更新後仍是未報名，不會變成不參加；檔案裡沒有的不參加員工維持不參加（EMP-R66、EMP-R61）', async () => {
    const wang = await createEmployee({ name: '王小明', department: '業務部', extension: '1234' });
    const left = await createEmployee({ name: '已離職', department: '研發部', declined: true });
    await imported([rosterPerson('王小明', '業務部', { 分機: '1300' })]);
    expect(await prisma.employee.findUniqueOrThrow({ where: { id: wang.id } })).toMatchObject({ extension: '1300', declined: false });
    expect(await prisma.employee.findUniqueOrThrow({ where: { id: left.id } })).toMatchObject({ declined: true });
  });

  it('已報名的員工經匯入更新後仍是已報名，不會帶上不參加的標記（EMP-R66、EMP-R57）', async () => {
    const wang = await createRegisteredEmployee({ name: '王小明', department: '業務部', extension: '1234' }, { tableId: 5, seatOrder: 0 });
    await imported([rosterPerson('王小明', '業務部', { 分機: '1300' })]);
    expect(await prisma.employee.findUniqueOrThrow({ where: { id: wang.employee.id } })).toMatchObject({ declined: false });
    expect(await prisma.participant.findUniqueOrThrow({ where: { id: wang.participant.id } })).toMatchObject({ tableId: 5 });
  });

  it('檔案中合併的多列對應到既有員工：更新成合併後的分機', async () => {
    const wang = await createEmployee({ name: '王小明', department: '業務部', extension: '1111' });
    await imported([rosterPerson('王小明', '業務部', { 分機: '1234' }), rosterPerson('王小明', '業務部', { 分機: '1235' })]);
    expect(await prisma.employee.findUniqueOrThrow({ where: { id: wang.id } })).toMatchObject({ extension: '1234／1235' });
    expect(await prisma.employee.count()).toBe(1);
  });
});

describe('有錯誤的列與匯入結果（EMP-R58、EMP-R59、EMP-Q03）', () => {
  it('EMP-AC72：空的員工名單、檔案 5 列其中 1 列部門空白 → 4 位新增，{m} 為 1，錯誤清單包含這一列', async () => {
    const bad = rosterPerson('丙', '', { 分機: '1300', 英文名: 'Bing' });
    const result = await imported([
      rosterPerson('甲', '研發部'),
      rosterPerson('乙', '研發部'),
      bad,
      rosterPerson('丁', '業務部'),
      rosterPerson('戊', '業務部'),
    ]);
    expect(result).toMatchObject({ imported: 4, created: 4, updated: 0 });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 4 });
    expect(result.errors[0]!.values).toEqual(expect.arrayContaining(['丙', '1300', 'Bing']));
    expect(result.errors[0]!.reason.trim()).not.toBe('');
    expect(result.header.length).toBeGreaterThan(0);

    expect((await prisma.employee.findMany({ orderBy: { sortOrder: 'asc' } })).map((e) => e.name)).toEqual([
      '甲',
      '乙',
      '丁',
      '戊',
    ]);
  });

  it('EMP-AC73：手機號碼與代接群組不存，API 回應與全部資料都看不到（EMP-R56）', async () => {
    const res = await upload(rosterCsv([rosterPerson('王小明', '業務部', { 手機號碼: FAKE_MOBILE, 代接群組: FAKE_PICKUP_GROUP })]));
    const text = await res.text();
    expect(res.ok).toBe(true);
    expect(text).not.toContain(FAKE_MOBILE);
    expect(text).not.toContain(FAKE_PICKUP_GROUP);

    const state = JSON.stringify(await loadState());
    expect(state).toContain('王小明');
    expect(state).not.toContain(FAKE_MOBILE);
    expect(state).not.toContain(FAKE_PICKUP_GROUP);
  });

  it('錯誤清單只列需要處理的列，不含略過的列', async () => {
    const result = await imported([
      SWITCHBOARD_ROW,
      { 姓名: '空位', 英文名: '空位', 部門: '研發部' },
      { 姓名: '第一會議室', 部門: '公共區域' },
      rosterPerson('丙', ''),
      rosterPerson('王小明', '業務部'),
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.values).toContain('丙');
    expect(result.imported).toBe(1);
  });
});

describe('欄位一致的判斷（EMP-R48、EMP-R62、D-012）', () => {
  const REQUIRED: RosterColumn[] = ['分機', '姓名', '英文名', '手機號碼', '部門', '地區', '辦公室', '代接群組'];

  it.each(REQUIRED)('少了「%s」欄：400 IMPORT_FORMAT_INVALID，任何一列都沒有匯入', async (column) => {
    await createEmployee({ name: '既有', department: '研發部', extension: '1111' });
    const csv = rosterCsv([rosterPerson('王小明', '業務部'), rosterPerson('既有', '研發部', { 分機: '9999' })], headerWithout(column));
    await expectError(await upload(csv), 400, 'IMPORT_FORMAT_INVALID');
    const rows = await prisma.employee.findMany();
    expect(rows.map((e) => [e.name, e.extension])).toEqual([['既有', '1111']]);
  });

  it('目前通訊錄匯出檔（第一欄是沒有欄名的序號、「姓名」欄名前有空白、沒有「組別」欄）可以直接匯入，序號不存', async () => {
    const result = await imported(
      withSerial([
        rosterPerson('王小明', '業務部', { 分機: '1234', 英文名: 'Xiaoming' }),
        SWITCHBOARD_ROW,
        rosterPerson('李小華', '研發部', { 分機: '2001', 英文名: 'Lisa' }),
      ]),
      ADDRESS_BOOK_HEADER,
    );
    expect(result).toMatchObject({ imported: 2, created: 2, errors: [] });

    const rows = await prisma.employee.findMany({ orderBy: { sortOrder: 'asc' } });
    expect(rows.map((e) => [e.name, e.department, e.extension, e.englishName, e.team])).toEqual([
      ['王小明', '業務部', '1234', 'Xiaoming', null],
      ['李小華', '研發部', '2001', 'Lisa', null],
    ]);
    // 序號（901、902、903）不會被當成任何欄位存下來
    for (const e of rows) {
      const values = [e.name, e.englishName, e.department, e.team, e.extension, e.region, e.office, e.note];
      for (const serial of ['901', '902', '903']) expect(values).not.toContain(serial);
    }
  });

  it('欄位順序打亂：依欄名讀取，每一欄都存對', async () => {
    await imported(
      [rosterPerson('王小明', '業務部', { 分機: '1234', 英文名: 'Xiaoming', 地區: '台中', 辦公室: '台中辦公室', 組別: '北區組' })],
      SHUFFLED_HEADER,
    );
    expect((await employeesNamed('王小明'))[0]).toMatchObject({
      department: '業務部',
      extension: '1234',
      englishName: 'Xiaoming',
      region: '台中',
      office: '台中辦公室',
      team: '北區組',
    });
  });

  it('沒有「組別」欄：新增的員工沒有組別，既有員工的組別維持不變、其他欄位照常更新（EMP-R62）', async () => {
    const wang = await createEmployee({ name: '王小明', department: '業務部', extension: '1234', team: '北區組', note: '素食' });
    const result = await imported(
      [rosterPerson('王小明', '業務部', { 分機: '1300', 英文名: 'Xiaoming' }), rosterPerson('新人', '研發部')],
      headerWithout('組別'),
    );
    expect(result).toMatchObject({ imported: 2, created: 1, updated: 1, errors: [] });

    expect(await prisma.employee.findUniqueOrThrow({ where: { id: wang.id } })).toMatchObject({
      extension: '1300',
      englishName: 'Xiaoming',
      team: '北區組',
      note: '素食',
    });
    expect((await employeesNamed('新人'))[0]!.team).toBeNull();
  });

  it('有「組別」欄但留空：既有員工的組別清掉（對照 EMP-AC69）', async () => {
    const wang = await createEmployee({ name: '王小明', department: '業務部', team: '北區組' });
    await imported([rosterPerson('王小明', '業務部', { 組別: '' })]);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: wang.id } })).team).toBeNull();
  });
});

describe('英文名空白的列略過（EMP-R51、D-012）', () => {
  it('一般部門底下的設備列（英文名空白）：不新增，也不算在 {m}', async () => {
    const result = await imported([
      { 分機: '2900', 姓名: '第二實驗室', 部門: '研發部', 地區: '台北' },
      rosterPerson('王小明', '業務部'),
    ]);
    expect(result).toMatchObject({ imported: 1, created: 1, errors: [] });
    expect(await employeesNamed('第二實驗室')).toEqual([]);
    const { employees } = await loadState();
    expect(employees.map((e) => e.name)).toEqual(['王小明']);
  });

  it('英文名空白、部門也空白：略過，不算在 {m}（略過規則先於錯誤判斷）', async () => {
    const result = await imported([{ 分機: '2902', 姓名: '測試區', 部門: '' }, rosterPerson('王小明', '業務部')]);
    expect(result).toMatchObject({ imported: 1, errors: [] });
  });

  it('既有員工在檔案中的列英文名空白：這一列略過，既有員工不更新', async () => {
    const wang = await createEmployee({ name: '王小明', department: '業務部', extension: '1234', englishName: 'Xiaoming' });
    const result = await imported([rosterPerson('王小明', '業務部', { 分機: '1300', 英文名: '' })]);
    expect(result).toMatchObject({ imported: 0, updated: 0, errors: [] });
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: wang.id } })).extension).toBe('1234');
  });
});

describe('合併列在分機以外的欄位取第一列（EMP-R52、D-012）', () => {
  const rows = [
    rosterPerson('王小明', '業務部', { 分機: '1234', 英文名: 'Xiaoming', 地區: '台北', 辦公室: '台北辦公室', 組別: '北區組' }),
    rosterPerson('王小明', '業務部', { 分機: '1235', 英文名: 'Ming', 地區: '台中', 辦公室: '台中辦公室', 組別: '中區組' }),
  ];
  const firstRow = { extension: '1234／1235', englishName: 'Xiaoming', region: '台北', office: '台北辦公室', team: '北區組' };

  it('新增：一位員工，英文名、地區、辦公室、組別是第一列的值', async () => {
    await imported(rows);
    const found = await employeesNamed('王小明');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject(firstRow);
  });

  it('更新既有員工：同樣改成第一列的值，備註不變', async () => {
    const wang = await createEmployee({ name: '王小明', department: '業務部', extension: '1111', note: '素食', team: '舊組' });
    const result = await imported(rows);
    expect(result).toMatchObject({ imported: 1, updated: 1, created: 0 });
    expect(await prisma.employee.findUniqueOrThrow({ where: { id: wang.id } })).toMatchObject({ ...firstRow, note: '素食' });
  });
});

describe('系統已有兩位以上同名同部門的員工（EMP-R55、D-012）', () => {
  it('檔案中這組姓名加部門的每一列都列為需要處理；兩位既有員工都不變，也不新增；其他列照常匯入', async () => {
    const first = await createEmployee({ name: '王小明', department: '業務部', extension: '1111', englishName: 'One' });
    const second = await createEmployee({ name: '王小明', department: '業務部', extension: '2222', englishName: 'Two' });
    const result = await imported([
      rosterPerson('李小華', '研發部'),
      rosterPerson('王小明', '業務部', { 分機: '1234' }),
      rosterPerson('張三', '研發部'),
      rosterPerson('王小明', '業務部', { 分機: '1235' }),
    ]);

    expect(result).toMatchObject({ imported: 2, created: 2, updated: 0 });
    expect(result.errors.map((e) => e.row).sort((a, b) => a - b)).toEqual([3, 5]);
    for (const error of result.errors) {
      expect(error.values).toEqual(expect.arrayContaining(['王小明', '業務部']));
      expect(error.reason.trim()).not.toBe('');
    }
    expect(result.errors.find((e) => e.row === 3)!.values).toContain('1234');
    expect(result.errors.find((e) => e.row === 5)!.values).toContain('1235');

    const same = await employeesNamed('王小明');
    expect(same.map((e) => [e.id, e.extension, e.englishName])).toEqual([
      [first.id, '1111', 'One'],
      [second.id, '2222', 'Two'],
    ]);
    expect((await prisma.employee.findMany({ orderBy: { sortOrder: 'asc' } })).map((e) => e.name)).toEqual([
      '王小明',
      '王小明',
      '李小華',
      '張三',
    ]);
  });

  it('檔案中只有一列對到這組：這一列列為需要處理', async () => {
    await createEmployee({ name: '王小明', department: '業務部' });
    await createEmployee({ name: '王小明', department: '業務部' });
    const result = await imported([rosterPerson('王小明', '業務部', { 分機: '1300' })]);
    expect(result).toMatchObject({ imported: 0, created: 0, updated: 0 });
    expect(result.errors.map((e) => e.row)).toEqual([2]);
    expect(await prisma.employee.count()).toBe(2);
  });

  it('同名但部門不同的兩位不算重複：各自照常更新', async () => {
    const sales = await createEmployee({ name: '王小明', department: '業務部', extension: '1111' });
    const rd = await createEmployee({ name: '王小明', department: '研發部', extension: '2222' });
    const result = await imported([
      rosterPerson('王小明', '業務部', { 分機: '1234' }),
      rosterPerson('王小明', '研發部', { 分機: '2234' }),
    ]);
    expect(result).toMatchObject({ imported: 2, updated: 2, created: 0, errors: [] });
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: sales.id } })).extension).toBe('1234');
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: rd.id } })).extension).toBe('2234');
  });
});

describe('錯誤清單的列號：和用 Excel 開啟時看到的列號一致（EMP-R59、EMP-R49、EMP-R46）', () => {
  const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const line = (record: RosterRecord) => TEMPLATE_HEADER.map((h) => quote(record[h] ?? '')).join(',');
  /** 組出 CSV 文字（CRLF）：'' 是一個空行，',' 開頭的字串原樣放入（例如只有逗號的列） */
  const csvOf = (items: readonly (RosterRecord | string)[]) =>
    [TEMPLATE_HEADER.join(','), ...items.map((item) => (typeof item === 'string' ? item : line(item)))].join('\r\n') + '\r\n';
  const commasOnly = ','.repeat(TEMPLATE_HEADER.length - 1);

  async function importText(text: string): Promise<ImportResult> {
    const res = await upload(text);
    expect(res.ok, `匯入回應 ${res.status}`).toBe(true);
    return importResultSchema.parse(await res.json());
  }

  it('檔案中間有空白分隔列：後面那一列部門空白，列號照檔案算（表頭第 1 列、空白列也算一列）', async () => {
    const result = await importText(
      csvOf([
        rosterPerson('甲', '研發部'), // 2
        '', // 3 空行
        commasOnly, // 4 只有逗號
        rosterPerson('乙', '研發部'), // 5
        rosterPerson('丙', '', { 分機: '1300', 英文名: 'Bing' }), // 6
      ]),
    );
    expect(result).toMatchObject({ imported: 2, created: 2 });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 6 });
    expect(result.errors[0]!.values).toEqual(expect.arrayContaining(['丙', '1300', 'Bing']));
    expect((await prisma.employee.findMany({ orderBy: { sortOrder: 'asc' } })).map((e) => e.name)).toEqual(['甲', '乙']);
  });

  it('總機資訊列（儲存格內多行）只算一列；空白列也算一列；空白列與總機資訊列都不算在 {m}', async () => {
    const result = await importText(
      csvOf([
        SWITCHBOARD_ROW, // 2（分機欄有三行文字）
        rosterPerson('王小明', '業務部'), // 3
        '', // 4
        rosterPerson('丁', '', { 英文名: 'Ding' }), // 5
        commasOnly, // 6
        rosterPerson('戊', '', { 英文名: 'Wu' }), // 7
      ]),
    );
    expect(result).toMatchObject({ imported: 1, created: 1 });
    expect(result.errors.map((e) => e.row)).toEqual([5, 7]);
  });

  it('系統已有兩位同名同部門（EMP-R55）：中間隔著空白列時，每一列的列號都照檔案算', async () => {
    await createEmployee({ name: '王小明', department: '業務部' });
    await createEmployee({ name: '王小明', department: '業務部' });
    const result = await importText(
      csvOf([
        rosterPerson('王小明', '業務部', { 分機: '1234' }), // 2
        '', // 3
        '', // 4
        rosterPerson('李小華', '研發部'), // 5
        commasOnly, // 6
        rosterPerson('王小明', '業務部', { 分機: '1235' }), // 7
      ]),
    );
    expect(result).toMatchObject({ imported: 1, created: 1 });
    expect(result.errors.map((e) => e.row).sort((a, b) => a - b)).toEqual([2, 7]);
  });

  it('只有空白列：沒有員工、沒有需要處理的列', async () => {
    const result = await importText(csvOf(['', commasOnly, '']));
    expect(result).toMatchObject({ imported: 0, created: 0, updated: 0, errors: [] });
    expect(await prisma.employee.count()).toBe(0);
  });
});
