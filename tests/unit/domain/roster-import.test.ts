// 通訊錄 CSV 列 → 員工：docs/spec/employees.md 第 3.8 節（EMP-R45、R46、R48～R56、R58、R59、R62），
// 驗收條件 EMP-AC60～AC68、AC72、AC73；docs/architecture.md 第 11.1 節（匯入順序寫進 sortOrder）；
// D-012（英文名空白略過、合併列取第一列、欄位一致的判斷）；待確認 EMP-Q03、Q06 第 1、3 點依 D-008 照「原型或現況」欄的做法。
//
// 假設的介面（src/domain/roster-import.ts，實作照這裡）：
//   type RosterEmployee = {
//     name: string; englishName: string | null; department: string; team: string | null;
//     extension: string | null; region: string | null; office: string | null;
//   }                                  // 只有這 7 個欄位：手機號碼與代接群組不存（EMP-R56）
//   type RosterParseResult =
//     | { ok: false }                  // 檔案欄位和範本不一致（EMP-R48、EMP-R62），整份不匯入
//     | { ok: true;
//         employees: RosterEmployee[]; // 依檔案中第一次出現的順序；姓名加部門相同的列已合併（分機以外取第一列）
//         sources: { row: number; values: string[] }[][];
//                                      // 和 employees 一一對應：每位員工來自檔案的哪些列（列號，表頭是第 1 列；原始內容）
//         hasTeamColumn: boolean;      // 檔案有沒有「組別」欄；沒有時 team 一律 null，服務層不改既有員工的組別（EMP-R62）
//         skipped: number;             // 略過、不算需要處理的列（總機資訊、空位、公共區域、英文名空白）
//         errors: ImportRowError[];    // contracts/imports.ts：{ row（表頭是第 1 列）, reason, values（原始內容） }
//         header: string[] }           // 錯誤清單 CSV 的表頭
//   parseRoster(rows: string[][]): RosterParseResult
// sources 讓服務層在「系統已有兩位以上同名同部門」時，把這組的每一列都列為需要處理（EMP-R55）。
// rows 是 src/server/csv.ts parseCsv 的結果：第一列是表頭，每格已去掉前後空白；空白列也保留在原本的位置
// （每格都是空字串，或是 [] 、['']），rows[i] 就是檔案的第 i+1 列。列號是這一列在檔案中的列號，和用 Excel 開啟時一致：
// 表頭是第 1 列，空白列也算一列，儲存格內的換行不另算一列（階段 3 決定；見 tests/unit/server/csv.test.ts）。
// 以姓名加部門對應既有員工（新增或更新）是服務層的事，見 tests/integration/api/employees-import.test.ts。
import { describe, expect, it } from 'vitest';
import { parseRoster, type RosterParseResult } from '@/domain/roster-import';
import {
  ADDRESS_BOOK_HEADER,
  FAKE_MOBILE,
  FAKE_PICKUP_GROUP,
  SHUFFLED_HEADER,
  SWITCHBOARD_ROW,
  TEMPLATE_HEADER,
  headerRenamed,
  headerWithout,
  rosterPerson,
  rosterRow,
  withSerial,
  type RosterColumn,
  type RosterRecord,
} from '../../helpers/employees-roster';

type Parsed = Extract<RosterParseResult, { ok: true }>;

const rowsOf = (records: readonly RosterRecord[], header: readonly string[] = TEMPLATE_HEADER): string[][] => [
  [...header],
  ...records.map((r) => rosterRow(r, header)),
];

function parse(records: readonly RosterRecord[], header: readonly string[] = TEMPLATE_HEADER): Parsed {
  const result = parseRoster(rowsOf(records, header));
  if (!result.ok) throw new Error('表頭被判定為和範本不一致');
  return result;
}

const byName = (result: Parsed, name: string, department?: string) => {
  const found = result.employees.filter((e) => e.name === name && (department === undefined || e.department === department));
  expect(found, `${name}${department ? `（${department}）` : ''}`).toHaveLength(1);
  return found[0]!;
};

describe('表頭和範本比對（EMP-R45、EMP-R48、EMP-R62）', () => {
  it('表頭和範本相同：可以匯入', () => {
    expect(parseRoster(rowsOf([rosterPerson('王小明', '業務部')])).ok).toBe(true);
  });

  it('少了「部門」欄：和範本不一致（EMP-AC60）', () => {
    const header = headerWithout('部門');
    expect(parseRoster(rowsOf([rosterPerson('王小明', '業務部')], header))).toMatchObject({ ok: false });
  });

  it('「部門」欄名改成「單位」：和範本不一致（EMP-AC60）', () => {
    const header = headerRenamed('部門', '單位');
    expect(parseRoster(rowsOf([{ ...rosterPerson('王小明', '業務部'), 單位: '業務部' }], header))).toMatchObject({
      ok: false,
    });
  });

  it('少了「姓名」欄：和範本不一致', () => {
    expect(parseRoster(rowsOf([rosterPerson('王小明', '業務部')], headerWithout('姓名')))).toMatchObject({ ok: false });
  });

  it('沒有任何內容（連表頭都沒有）：和範本不一致', () => {
    expect(parseRoster([])).toMatchObject({ ok: false });
  });

  it('欄名前後的空白不影響比對（EMP-R62：通訊錄的「姓名」欄名前有一個空白）', () => {
    const header = TEMPLATE_HEADER.map((h) => (h === '姓名' ? ' 姓名' : h === '部門' ? '部門 ' : h));
    const result = parse([rosterPerson('王小明', '業務部')], header);
    expect(result.employees.map((e) => e.name)).toEqual(['王小明']);
  });

  it('只有表頭：沒有員工、沒有錯誤', () => {
    expect(parse([])).toMatchObject({ ok: true, employees: [], errors: [], skipped: 0 });
  });
});

describe('欄位一致的判斷（EMP-R62、D-012）', () => {
  const REQUIRED: RosterColumn[] = ['分機', '姓名', '英文名', '手機號碼', '部門', '地區', '辦公室', '代接群組'];

  it.each(REQUIRED)('少了「組別」以外的「%s」欄：和範本不一致', (column) => {
    expect(parseRoster(rowsOf([rosterPerson('王小明', '業務部')], headerWithout(column)))).toMatchObject({ ok: false });
  });

  it('沒有欄名的欄（通訊錄匯出檔第一欄的序號）忽略，值不會存進任何欄位', () => {
    const header = ['', ...TEMPLATE_HEADER];
    const result = parse(withSerial([rosterPerson('王小明', '業務部', { 分機: '1234', 英文名: 'Xiaoming' })], 901), header);
    expect(result.employees).toEqual([
      expect.objectContaining({ name: '王小明', department: '業務部', extension: '1234', englishName: 'Xiaoming' }),
    ]);
    expect(JSON.stringify(result.employees)).not.toContain('901');
  });

  it('欄位順序不限：順序打亂仍依欄名讀取每一欄', () => {
    const result = parse(
      [rosterPerson('王小明', '業務部', { 分機: '1234', 英文名: 'Xiaoming', 地區: '台北', 辦公室: '台北辦公室', 組別: '北區組' })],
      SHUFFLED_HEADER,
    );
    expect(result.employees).toEqual([
      {
        name: '王小明',
        englishName: 'Xiaoming',
        department: '業務部',
        team: '北區組',
        extension: '1234',
        region: '台北',
        office: '台北辦公室',
      },
    ]);
    expect(result.hasTeamColumn).toBe(true);
  });

  it('沒有「組別」欄：照常匯入，員工沒有組別，結果標示檔案沒有組別欄（既有員工的組別由服務層維持不變）', () => {
    const result = parse([rosterPerson('王小明', '業務部', { 分機: '1234' })], headerWithout('組別'));
    expect(result.errors).toEqual([]);
    expect(result.hasTeamColumn).toBe(false);
    expect(byName(result, '王小明')).toMatchObject({ extension: '1234', team: null });
  });

  it('有「組別」欄：結果標示有組別欄（組別留空就是沒有組別，EMP-R54）', () => {
    const result = parse([rosterPerson('王小明', '業務部', { 組別: '' })]);
    expect(result.hasTeamColumn).toBe(true);
    expect(byName(result, '王小明').team).toBeNull();
  });

  it('目前通訊錄匯出檔的格式（序號欄沒有欄名、「姓名」欄名前有空白、沒有「組別」欄）可以直接匯入', () => {
    const result = parse(
      withSerial([
        rosterPerson('王小明', '業務部', { 分機: '1234', 英文名: 'Xiaoming' }),
        SWITCHBOARD_ROW,
        rosterPerson('李小華', '研發部', { 分機: '2001', 英文名: 'Lisa' }),
      ]),
      ADDRESS_BOOK_HEADER,
    );
    expect(result.employees.map((e) => [e.name, e.department, e.extension, e.team])).toEqual([
      ['王小明', '業務部', '1234', null],
      ['李小華', '研發部', '2001', null],
    ]);
    expect(result.errors).toEqual([]);
    expect(result.hasTeamColumn).toBe(false);
  });

  it('表頭有「組別」但少了其他欄（例如「部門」）：仍然不一致', () => {
    const header = ['', ...headerWithout('部門')];
    expect(parseRoster(rowsOf(withSerial([rosterPerson('王小明', '業務部')]), header))).toMatchObject({ ok: false });
  });
});

describe('每位員工來自檔案的哪些列（EMP-R55 的服務層會用到）', () => {
  it('sources 和 employees 一一對應，帶列號（表頭是第 1 列）與原始內容；合併的員工有多列', () => {
    const a = rosterPerson('王小明', '業務部', { 分機: '1234' });
    const b = rosterPerson('李小華', '研發部');
    const c = rosterPerson('王小明', '業務部', { 分機: '1235' });
    const result = parse([a, SWITCHBOARD_ROW, b, c]);
    expect(result.employees.map((e) => e.name)).toEqual(['王小明', '李小華']);
    expect(result.sources).toEqual([
      [
        { row: 2, values: rosterRow(a) },
        { row: 5, values: rosterRow(c) },
      ],
      [{ row: 4, values: rosterRow(b) }],
    ]);
  });
});

describe('員工的欄位（EMP-R01、EMP-R54、EMP-R56）', () => {
  it('存檔案中的分機、姓名、英文名、部門、地區、辦公室、組別', () => {
    const result = parse([
      rosterPerson('王小明', '業務部', {
        分機: '1234',
        英文名: 'Xiaoming',
        地區: '台北',
        辦公室: '台北辦公室',
        組別: '北區組',
      }),
    ]);
    expect(result.employees).toEqual([
      {
        name: '王小明',
        englishName: 'Xiaoming',
        department: '業務部',
        team: '北區組',
        extension: '1234',
        region: '台北',
        office: '台北辦公室',
      },
    ]);
  });

  it('手機號碼與代接群組不存：結果裡沒有這兩個欄位，也沒有它們的值（EMP-R56、EMP-AC73）', () => {
    const result = parse([rosterPerson('王小明', '業務部', { 手機號碼: FAKE_MOBILE, 代接群組: FAKE_PICKUP_GROUP })]);
    const e = byName(result, '王小明');
    expect(Object.keys(e).sort()).toEqual(['department', 'englishName', 'extension', 'name', 'office', 'region', 'team']);
    expect(JSON.stringify(result.employees)).not.toContain(FAKE_MOBILE);
    expect(JSON.stringify(result.employees)).not.toContain(FAKE_PICKUP_GROUP);
  });

  it('「組別」欄留空視為沒有組別（EMP-R54、EMP-AC68）', () => {
    const result = parse([
      rosterPerson('李小華', '研發部', { 組別: '韌體組' }),
      rosterPerson('張三', '研發部', { 組別: '' }),
    ]);
    expect(byName(result, '李小華').team).toBe('韌體組');
    expect(byName(result, '張三').team).toBeNull();
  });

  it('選填欄位留空時是 null，不是空字串', () => {
    const result = parse([rosterPerson('王小明', '業務部', { 分機: '', 地區: '', 辦公室: '', 組別: '' })]);
    expect(byName(result, '王小明')).toMatchObject({ extension: null, region: null, office: null, team: null });
  });

  it('分機是「N/A」時視為沒有分機（EMP-R53、EMP-AC67）', () => {
    const result = parse([rosterPerson('王小明', '業務部', { 分機: 'N/A' })]);
    expect(byName(result, '王小明').extension).toBeNull();
  });

  it('員工依檔案中的列順序排列（docs/architecture.md 第 11.1 節：匯入順序寫進 sortOrder）', () => {
    const result = parse([
      rosterPerson('丙', '研發部'),
      rosterPerson('甲', '業務部'),
      rosterPerson('乙', '研發部'),
    ]);
    expect(result.employees.map((e) => e.name)).toEqual(['丙', '甲', '乙']);
  });
});

describe('略過的列：不匯入，也不算需要處理（EMP-R49～R51）', () => {
  it('總機資訊列：姓名空白、分機欄是多行的總機名稱與電話；其他列照常匯入（EMP-R46、EMP-R49、EMP-AC62）', () => {
    const result = parse([rosterPerson('王小明', '業務部'), SWITCHBOARD_ROW, rosterPerson('李小華', '研發部')]);
    expect(result.employees.map((e) => e.name)).toEqual(['王小明', '李小華']);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('每格都空白的分隔列：不新增員工，也不算需要處理（EMP-R49、EMP-AC63）', () => {
    const result = parse([rosterPerson('王小明', '業務部'), {}, rosterPerson('李小華', '研發部')]);
    expect(result.employees.map((e) => e.name)).toEqual(['王小明', '李小華']);
    expect(result.errors).toEqual([]);
  });

  it('姓名空白但其他欄有值的列：略過', () => {
    const result = parse([{ 分機: '1999', 部門: '研發部', 英文名: 'Nobody' }]);
    expect(result.employees).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('姓名是「空位」的列：略過，即使分機與部門都有值（EMP-R50、EMP-AC65）', () => {
    const result = parse([
      { 分機: '1500', 姓名: '空位', 英文名: '空位', 部門: '研發部' },
      rosterPerson('王小明', '業務部'),
    ]);
    expect(result.employees.map((e) => e.name)).toEqual(['王小明']);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('部門是「公共區域」的列（櫃台、會議室等設備）：略過，部門清單不會有「公共區域」（EMP-R51、EMP-AC64）', () => {
    const result = parse([
      { 分機: '1600', 姓名: '第一會議室', 部門: '公共區域', 地區: '台北' },
      { 分機: '1601', 姓名: '一樓櫃台', 部門: '公共區域' },
      rosterPerson('王小明', '業務部'),
    ]);
    expect(result.employees.map((e) => e.name)).toEqual(['王小明']);
    expect(result.employees.some((e) => e.department === '公共區域')).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(2);
  });
});

describe('英文名空白的列略過（EMP-R51、D-012）', () => {
  it('一般部門底下的設備列（英文名空白）：不匯入，也不算需要處理', () => {
    const result = parse([
      { 分機: '2900', 姓名: '第二實驗室', 英文名: '', 部門: '研發部', 地區: '台北', 辦公室: '測試辦公室' },
      { 分機: '2901', 姓名: '主機房', 部門: '資訊部' },
      rosterPerson('王小明', '業務部'),
    ]);
    expect(result.employees.map((e) => e.name)).toEqual(['王小明']);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(2);
  });

  it('英文名空白、部門也空白：略過規則先於錯誤判斷，略過而不是列為需要處理', () => {
    const result = parse([{ 分機: '2902', 姓名: '測試區', 部門: '' }, rosterPerson('王小明', '業務部')]);
    expect(result.employees.map((e) => e.name)).toEqual(['王小明']);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('英文名有值、部門空白：仍是需要處理的列（EMP-R58）', () => {
    const result = parse([rosterPerson('丙', '', { 英文名: 'Bing' })]);
    expect(result.errors).toHaveLength(1);
    expect(result.skipped).toBe(0);
  });

  it('同名同部門的列中，英文名空白的那一列被略過，不參與合併', () => {
    const result = parse([
      rosterPerson('王小明', '業務部', { 分機: '1234', 英文名: 'Xiaoming' }),
      rosterPerson('王小明', '業務部', { 分機: '1235', 英文名: '' }),
    ]);
    expect(byName(result, '王小明').extension).toBe('1234');
    expect(result.skipped).toBe(1);
  });

  it('英文名是第一列空白、第二列有值：只匯入第二列', () => {
    const result = parse([
      rosterPerson('王小明', '業務部', { 分機: '1234', 英文名: '' }),
      rosterPerson('王小明', '業務部', { 分機: '1235', 英文名: 'Xiaoming' }),
    ]);
    expect(byName(result, '王小明')).toMatchObject({ extension: '1235', englishName: 'Xiaoming' });
  });
});

describe('合併列在分機以外的欄位取檔案中第一列（EMP-R52、D-012）', () => {
  it('英文名、地區、辦公室、組別都取第一列；分機依列順序連接', () => {
    const result = parse([
      rosterPerson('王小明', '業務部', { 分機: '1234', 英文名: 'Xiaoming', 地區: '台北', 辦公室: '台北辦公室', 組別: '北區組' }),
      rosterPerson('王小明', '業務部', { 分機: '1235', 英文名: 'Ming', 地區: '台中', 辦公室: '台中辦公室', 組別: '中區組' }),
    ]);
    expect(result.employees).toEqual([
      {
        name: '王小明',
        englishName: 'Xiaoming',
        department: '業務部',
        team: '北區組',
        extension: '1234／1235',
        region: '台北',
        office: '台北辦公室',
      },
    ]);
  });

  it('第一列的選填欄位空白：取第一列的值，就是沒有（不拿後面列的值補）', () => {
    const result = parse([
      rosterPerson('王小明', '業務部', { 分機: '1234', 地區: '', 辦公室: '', 組別: '' }),
      rosterPerson('王小明', '業務部', { 分機: '1235', 地區: '台中', 辦公室: '台中辦公室', 組別: '中區組' }),
    ]);
    expect(byName(result, '王小明')).toMatchObject({ region: null, office: null, team: null, extension: '1234／1235' });
  });

  it('「第一列」是檔案中的第一列，不是第一列有分機的列', () => {
    const result = parse([
      rosterPerson('王小明', '業務部', { 分機: 'N/A', 英文名: 'First' }),
      rosterPerson('王小明', '業務部', { 分機: '1235', 英文名: 'Second' }),
    ]);
    expect(byName(result, '王小明')).toMatchObject({ englishName: 'First', extension: '1235' });
  });
});

describe('同一人多列合併（EMP-R52、EMP-Q06）', () => {
  it('EMP-AC66：兩列姓名「王小明」、部門「業務部」，分機 1234 與 1235 → 一位員工，分機「1234／1235」', () => {
    const result = parse([
      rosterPerson('王小明', '業務部', { 分機: '1234' }),
      rosterPerson('王小明', '業務部', { 分機: '1235' }),
    ]);
    expect(result.employees).toHaveLength(1);
    expect(byName(result, '王小明').extension).toBe('1234／1235');
    expect(result.errors).toEqual([]);
  });

  it('分機依檔案中的列順序連接（EMP-Q06 第 1 點）', () => {
    const result = parse([
      rosterPerson('王小明', '業務部', { 分機: '1235' }),
      rosterPerson('李小華', '研發部'),
      rosterPerson('王小明', '業務部', { 分機: '1234' }),
      rosterPerson('王小明', '業務部', { 分機: '1236' }),
    ]);
    expect(byName(result, '王小明').extension).toBe('1235／1234／1236');
  });

  it('合併的員工排在第一次出現的位置', () => {
    const result = parse([
      rosterPerson('王小明', '業務部', { 分機: '1234' }),
      rosterPerson('李小華', '研發部'),
      rosterPerson('王小明', '業務部', { 分機: '1235' }),
    ]);
    expect(result.employees.map((e) => e.name)).toEqual(['王小明', '李小華']);
  });

  it('其中一列的分機是「N/A」：視為沒有分機，只連接有值的分機（EMP-R53）', () => {
    const result = parse([
      rosterPerson('王小明', '業務部', { 分機: '1234' }),
      rosterPerson('王小明', '業務部', { 分機: 'N/A' }),
    ]);
    expect(byName(result, '王小明').extension).toBe('1234');
  });

  it('每一列的分機都是「N/A」：合併後沒有分機', () => {
    const result = parse([
      rosterPerson('王小明', '業務部', { 分機: 'N/A' }),
      rosterPerson('王小明', '業務部', { 分機: 'N/A' }),
    ]);
    expect(byName(result, '王小明').extension).toBeNull();
  });

  it('同一格已寫著兩個分機、以半形「/」分隔：原樣保留（EMP-Q06 第 3 點）', () => {
    const result = parse([rosterPerson('王小明', '業務部', { 分機: '1234/1235' })]);
    expect(byName(result, '王小明').extension).toBe('1234/1235');
  });

  it('姓名相同、部門不同：兩位不同的員工，不合併（EMP-R55、EMP-AC70）', () => {
    const result = parse([
      rosterPerson('王小明', '業務部', { 分機: '1234' }),
      rosterPerson('王小明', '研發部', { 分機: '2234' }),
    ]);
    expect(result.employees).toHaveLength(2);
    expect(byName(result, '王小明', '業務部').extension).toBe('1234');
    expect(byName(result, '王小明', '研發部').extension).toBe('2234');
  });
});

describe('有錯誤的列（EMP-R58、EMP-R59、EMP-Q03）', () => {
  it('EMP-AC72：5 列員工，其中 1 列有姓名、部門空白 → 4 位匯入，這 1 列列為需要處理', () => {
    const result = parse([
      rosterPerson('甲', '研發部'),
      rosterPerson('乙', '研發部'),
      rosterPerson('丙', '', { 分機: '1300', 英文名: 'Bing' }),
      rosterPerson('丁', '業務部'),
      rosterPerson('戊', '業務部'),
    ]);
    expect(result.employees.map((e) => e.name)).toEqual(['甲', '乙', '丁', '戊']);
    expect(result.errors).toHaveLength(1);
  });

  it('錯誤列帶列號（表頭是第 1 列）、原始內容與原因', () => {
    const bad = rosterPerson('丙', '', { 分機: '1300', 英文名: 'Bing' });
    const result = parse([rosterPerson('甲', '研發部'), rosterPerson('乙', '研發部'), bad]);
    const [error] = result.errors;
    expect(error?.row).toBe(4);
    expect(error?.values).toEqual(rosterRow(bad));
    expect(error?.reason.trim().length).toBeGreaterThan(0);
  });

  it('錯誤清單的表頭讓人看得出每一欄是什麼（含姓名與部門）', () => {
    const result = parse([rosterPerson('丙', '')]);
    expect(result.header).toEqual(expect.arrayContaining(['姓名', '部門']));
  });

  it('略過的列不算錯誤（總機資訊、空位、公共區域、空白列）', () => {
    const result = parse([
      SWITCHBOARD_ROW,
      { 姓名: '空位', 部門: '研發部' },
      { 姓名: '第一會議室', 部門: '公共區域' },
      {},
    ]);
    expect(result.errors).toEqual([]);
    expect(result.employees).toEqual([]);
  });

  it('姓名與部門都有、其他欄空白的列不是錯誤（EMP-Q03：目前只把部門空白列為錯誤）', () => {
    const result = parse([{ 姓名: '張三', 部門: '研發部', 英文名: 'Zhang' }]);
    expect(result.errors).toEqual([]);
    expect(byName(result, '張三')).toMatchObject({ department: '研發部', extension: null, team: null });
  });
});

describe('列號是檔案中的列號：空白列也算一列（EMP-R59 錯誤清單、EMP-R49）', () => {
  /** parseCsv 對空白列的幾種寫法：空行、只有逗號、只有空白（去掉前後空白後） */
  const BLANK_LINES: readonly (readonly string[])[] = [[], [''], TEMPLATE_HEADER.map(() => '')];

  it.each(BLANK_LINES.map((blank) => [JSON.stringify(blank), blank] as const))(
    '中間有空白列（%s）：後面的錯誤列列號照檔案算，空白列不算需要處理',
    (_label, blank) => {
      const bad = rosterPerson('丙', '', { 分機: '1300', 英文名: 'Bing' });
      const rows: string[][] = [[...TEMPLATE_HEADER], rosterRow(rosterPerson('甲', '研發部')), [...blank], rosterRow(bad)];
      const result = parseRoster(rows);
      if (!result.ok) throw new Error('表頭被判定為和範本不一致');
      expect(result.employees.map((e) => e.name)).toEqual(['甲']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ row: 4, values: rosterRow(bad) });
    },
  );

  it('好幾列空白分隔列與總機資訊列：每位員工來自的列號（sources）照檔案算', () => {
    const a = rosterPerson('王小明', '業務部', { 分機: '1234' });
    const b = rosterPerson('李小華', '研發部');
    const c = rosterPerson('王小明', '業務部', { 分機: '1235' });
    const blank = TEMPLATE_HEADER.map(() => '');
    const rows: string[][] = [
      [...TEMPLATE_HEADER], // 1
      rosterRow(a), // 2
      [...blank], // 3
      rosterRow(SWITCHBOARD_ROW), // 4（分機欄有多行文字，只算一列）
      [], // 5
      rosterRow(b), // 6
      [''], // 7
      [...blank], // 8
      rosterRow(c), // 9
    ];
    const result = parseRoster(rows);
    if (!result.ok) throw new Error('表頭被判定為和範本不一致');
    expect(result.employees.map((e) => e.name)).toEqual(['王小明', '李小華']);
    expect(result.sources).toEqual([
      [
        { row: 2, values: rosterRow(a) },
        { row: 9, values: rosterRow(c) },
      ],
      [{ row: 6, values: rosterRow(b) }],
    ]);
    expect(result.errors).toEqual([]);
  });

  it('空白列放在最前面（表頭下一列）：第一位員工在第 3 列', () => {
    const bad = rosterPerson('丙', '', { 英文名: 'Bing' });
    const result = parseRoster([[...TEMPLATE_HEADER], [''], rosterRow(bad)]);
    if (!result.ok) throw new Error('表頭被判定為和範本不一致');
    expect(result.errors.map((e) => e.row)).toEqual([3]);
  });

  it('檔案最後的空白列不影響結果：不新增員工，也不算需要處理', () => {
    const result = parseRoster([[...TEMPLATE_HEADER], rosterRow(rosterPerson('甲', '研發部')), [''], [], TEMPLATE_HEADER.map(() => '')]);
    if (!result.ok) throw new Error('表頭被判定為和範本不一致');
    expect(result.employees.map((e) => e.name)).toEqual(['甲']);
    expect(result.errors).toEqual([]);
  });
});
