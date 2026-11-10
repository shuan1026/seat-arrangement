// 匯出座位表的版面模型：docs/spec/export.md 第 3.2～3.6 節（EXP-R02、EXP-R04、EXP-R08～R23）、第 5 節驗收條件
// （EXP-AC04～AC17 的每一格內容、EXP-AC18 與頁面篩選無關、EXP-AC20 的底色類別、EXP-AC22、AC23 有桌次 11、12 位時
// 只有那一段改為十二列，D-018）。待確認依 D-008 照目前假設：
// EXP-Q01 不放分機、EXP-Q02 只有 F 欄空白、EXP-Q03 工作人員超過十位往下延伸、EXP-Q05 框線範圍與未入座區塊的位置。
// 位置、標題格、合併範圍逐格比對；色碼、粗體、欄寬、列印設定在 tests/unit/server/excel.test.ts 檢查 Excel 檔。
// 姓名都是規格裡的虛構示範資料，或「員1」「未1」這類代號。
//
// 假設的介面（src/domain/seating-sheet.ts，與 Excel 無關，實作照這裡）：
//   export type SheetFill = 'header' | 'guest' | 'childSeat' | 'vegetarian';  // 標題格、貴賓、兒童椅、素食
//   export type SheetCell = {
//     row: number;              // 列，1 起算
//     col: number;              // 欄，1 起算（A = 1 … L = 12）
//     text: string;             // 同一格內的換行（規格的「↵」）用 '\n'；空白格是 ''
//     fill: SheetFill | null;   // 底色類別；沒有底色是 null
//     border: boolean;          // 四周畫框線（色碼由 Excel 輸出決定）
//   };
//   export type SheetMerge = { top: number; left: number; bottom: number; right: number };  // 1 起算、含兩端
//   export type SeatingSheet = { name: string; cells: SheetCell[]; merges: SheetMerge[] };
//   export function buildSeatingSheet(data: AppState): SeatingSheet;  // AppState 見 src/contracts/entities.ts
// 約定：
//   - cells 只列有文字、底色或框線的格，同一格最多一筆；沒列出的格是空白、沒有底色、沒有框線。
//   - 合併範圍只列左上角那一格（文字、底色、框線都放在那一格），範圍內其他格不列。
//   - 只看傳入的資料；陣列順序不影響結果。桌內名單依 seatOrder。
import { describe, expect, it } from 'vitest';
import { buildDirectory, tableDepartmentLabel } from '@/domain/display';
import { buildSeatingSheet } from '@/domain/seating-sheet';
import {
  column,
  LAST_COLUMN,
  overflowLayout,
  parseAddress,
  segmentOf,
  SheetReader,
  sortAddresses,
  TABLE_IDS,
  tableBlock,
  unseatedAddress,
} from '../../helpers/export-sheet';
import { sampleA, SheetData } from '../../helpers/export-state';

/** 產生版面模型，並檢查每一份模型都要成立的格式 */
function read(data: SheetData, opts: { reversed?: boolean } = {}): SheetReader {
  const sheet = new SheetReader(buildSeatingSheet(data.state(opts)));
  expect(sheet.duplicates, '同一格只能列一次').toEqual([]);
  for (const c of sheet.model.cells) {
    expect(c.col, `第 ${c.row} 列第 ${c.col} 欄超出 A–L 欄（EXP-R08）`).toBeGreaterThanOrEqual(1);
    expect(c.col, `第 ${c.row} 列第 ${c.col} 欄超出 A–L 欄（EXP-R08）`).toBeLessThanOrEqual(LAST_COLUMN);
    expect(c.row).toBeGreaterThanOrEqual(1);
  }
  for (const m of sheet.model.merges) {
    for (const c of sheet.model.cells) {
      const inside = c.row >= m.top && c.row <= m.bottom && c.col >= m.left && c.col <= m.right;
      const topLeft = c.row === m.top && c.col === m.left;
      expect(inside && !topLeft, `合併範圍內只列左上角那一格（第 ${c.row} 列第 ${c.col} 欄）`).toBe(false);
    }
  }
  return sheet;
}

/** 第一次用到才產生，同一組測試共用 */
const lazy = <T>(make: () => T): (() => T) => {
  let value: T | undefined;
  return () => (value ??= make());
};

const usedRows = (s: SheetReader) => s.used().map((a) => parseAddress(a).row);

describe('資料甲（EXP-AC04～AC10）', () => {
  const sheet = lazy(() => read(sampleA()));

  it('工作表名稱是「座位表」（EXP-R04）', () => {
    expect(sheet().name).toBe('座位表');
  });

  it('EXP-AC04 第 1 桌：G1:G10 合併「第 1 桌↵主桌↵總經理室＋貴賓↵(3)」；H1、H2 沒有底色；H3 兒童椅底色；H4–H10 空白、有框線', () => {
    const s = sheet();
    expect(s.merge('G1')).toBe('G1:G10');
    expect(s.text('G1')).toBe('第 1 桌\n主桌\n總經理室＋貴賓\n(3)');
    expect([s.text('H1'), s.fill('H1')]).toEqual(['王大同', null]);
    expect([s.text('H2'), s.fill('H2')]).toEqual(['李小華', null]);
    expect([s.text('H3'), s.fill('H3')]).toEqual(['周董事(+兒童椅)(素食)', 'childSeat']);
    for (const a of column('H', 4, 10)) {
      expect([a, s.text(a), s.fill(a), s.border(a)]).toEqual([a, '', null, true]);
    }
  });

  it('EXP-AC05 第 5 桌：I61:I70「第 5 桌↵業務部↵(3)」沒有備註名稱那一行；J61 沒有底色、J62 兒童椅、J63 素食', () => {
    const s = sheet();
    expect(s.merge('I61')).toBe('I61:I70');
    expect(s.text('I61')).toBe('第 5 桌\n業務部\n(3)');
    expect([s.text('J61'), s.fill('J61')]).toEqual(['陳志明', null]);
    expect([s.text('J62'), s.fill('J62')]).toEqual(['陳志明_眷屬(+兒童椅)', 'childSeat']);
    expect([s.text('J63'), s.fill('J63')]).toEqual(['林美玲(素食)', 'vegetarian']);
  });

  it('EXP-AC06 第 22 桌：C11:C20「第 22 桌↵客戶貴賓↵貴賓↵(1)」；D11「吳協理」貴賓底色，不加文字', () => {
    const s = sheet();
    expect(s.merge('C11')).toBe('C11:C20');
    expect(s.text('C11')).toBe('第 22 桌\n客戶貴賓\n貴賓\n(1)');
    expect([s.text('D11'), s.fill('D11')]).toEqual(['吳協理', 'guest']);
  });

  it('EXP-AC07 空桌：B81:B90「第 30 桌↵空桌↵(0)」、D21:D30「第 17 桌↵供應商↵空桌↵(0)」；名單格空白、有框線', () => {
    const s = sheet();
    expect(s.merge('B81')).toBe('B81:B90');
    expect(s.text('B81')).toBe('第 30 桌\n空桌\n(0)');
    expect(s.merge('D21')).toBe('D21:D30');
    expect(s.text('D21')).toBe('第 17 桌\n供應商\n空桌\n(0)');
    for (const a of [...column('C', 81, 90), ...column('E', 21, 30)]) {
      expect([a, s.text(a), s.fill(a), s.border(a)]).toEqual([a, '', null, true]);
    }
  });

  it('EXP-AC08 圖例：A3「貴賓」、A4「兒童椅」、A5「素食」，底色分別與 D11、H3、J63 相同；A 欄其他格空白（EXP-R15）', () => {
    const s = sheet();
    expect([s.text('A3'), s.fill('A3')]).toEqual(['貴賓', s.fill('D11')]);
    expect([s.text('A4'), s.fill('A4')]).toEqual(['兒童椅', s.fill('H3')]);
    expect([s.text('A5'), s.fill('A5')]).toEqual(['素食', s.fill('J63')]);
    expect(s.used().filter((a) => /^A\d+$/.test(a))).toEqual(['A3', 'A4', 'A5']);
  });

  it('EXP-AC09 工作人員：K1:K10「工作人員↵(1)」；L1「張家豪」；L2–L10 空白（EXP-R16）', () => {
    const s = sheet();
    expect(s.merge('K1')).toBe('K1:K10');
    expect(s.text('K1')).toBe('工作人員\n(1)');
    expect(s.text('L1')).toBe('張家豪');
    for (const a of column('L', 2, 10)) expect([a, s.text(a), s.fill(a)]).toEqual([a, '', null]);
  });

  it('EXP-AC10 第 111 列以下沒有任何內容；F 欄沒有任何內容；沒有任何一格出現位置代碼（EXP-R08、EXP-R11、EXP-R19）', () => {
    const s = sheet();
    expect(usedRows(s).filter((r) => r >= 111)).toEqual([]);
    expect(s.used().filter((a) => /^F\d+$/.test(a))).toEqual([]);
    expect(s.texts().filter((t) => /[AB]-\d+|STAFF/.test(t))).toEqual([]);
  });

  it('只用到規格列出的格：30 桌各 1 格標題與 10 格名單、圖例 3 格、工作人員標題與 L1–L10；其他格都空白（EXP-R08）', () => {
    const s = sheet();
    const expected = new Set<string>(['A3', 'A4', 'A5', 'K1', ...column('L', 1, 10)]);
    for (const n of TABLE_IDS) {
      const b = tableBlock(n);
      expected.add(b.header);
      for (const a of b.list) expected.add(a);
    }
    expect(expected.size).toBe(30 * 11 + 3 + 11);
    expect(s.used()).toEqual(sortAddresses(expected));
  });

  it('合併的只有 30 桌的標題格與工作人員標題格（EXP-R10、EXP-R16）', () => {
    const s = sheet();
    const expected = [...TABLE_IDS.map((n) => tableBlock(n).range), 'K1:K10'];
    expect(s.merges().slice().sort()).toEqual(expected.sort());
  });

  it('所有標題格（桌次、工作人員）用標題底色；圖例與名單格不用（EXP-R21、EXP-AC20）', () => {
    const s = sheet();
    for (const n of TABLE_IDS) expect([n, s.fill(tableBlock(n).header)]).toEqual([n, 'header']);
    expect(s.fill('K1')).toBe('header');
    const headers = new Set([...TABLE_IDS.map((n) => tableBlock(n).header), 'K1']);
    expect(s.used().filter((a) => s.fill(a) === 'header' && !headers.has(a))).toEqual([]);
  });

  it('每一桌的標題格與十格名單格都畫框線，空位也畫；圖例三格、工作人員標題與 L1–L10 也畫（EXP-R22、EXP-Q05 ②③）', () => {
    const s = sheet();
    for (const n of TABLE_IDS) {
      const b = tableBlock(n);
      for (const a of [b.header, ...b.list]) expect([n, a, s.border(a)]).toEqual([n, a, true]);
    }
    for (const a of ['A3', 'A4', 'A5', 'K1', ...column('L', 1, 10)]) expect([a, s.border(a)]).toEqual([a, true]);
  });
});

describe('各桌位置（EXP-R09、EXP-R10、EXP-AC11）', () => {
  const sheet = lazy(() => {
    const data = new SheetData();
    for (const n of TABLE_IDS) data.employee(`員${n}`, '業務部');
    for (const n of TABLE_IDS) data.seat(n, [`員${n}`]);
    return read(data);
  });

  it.each(TABLE_IDS)('第 %i 桌：標題格在規格 3.3 表的位置合併十列，名單第一格是員n，同一欄其餘九格空白', (n) => {
    const s = sheet();
    const b = tableBlock(n);
    expect(s.merge(b.header)).toBe(b.range);
    expect(s.text(b.header)).toBe(`第 ${n} 桌\n業務部\n(1)`);
    expect(s.fill(b.header)).toBe('header');
    expect(s.text(b.list[0] ?? '')).toBe(`員${n}`);
    for (const a of b.list.slice(1)) expect([a, s.text(a), s.border(a)]).toEqual([a, '', true]);
  });

  it('沒有任何一格出現位置代碼 A-1～A-15、B-1～B-15（EXP-R11）', () => {
    expect(sheet().texts().filter((t) => /[AB]-\d+/.test(t))).toEqual([]);
  });

  it('F 欄是走道，沒有任何內容（EXP-R08、EXP-Q02）', () => {
    expect(sheet().used().filter((a) => /^F\d+$/.test(a))).toEqual([]);
  });
});

describe('桌次標題格（EXP-R12）', () => {
  const T3 = tableBlock(3);
  const header3 = (data: SheetData) => read(data).text(T3.header);

  it('部門依人數多到少以「＋」連接', () => {
    const data = new SheetData()
      .employee('研甲', '研發部')
      .employee('研乙', '研發部')
      .employee('業甲', '業務部')
      .employee('業乙', '業務部')
      .employee('業丙', '業務部')
      .seat(3, ['研甲', '研乙', '業甲', '業乙', '業丙']);
    expect(header3(data)).toBe('第 3 桌\n業務部＋研發部\n(5)');
  });

  it('和座位圖的桌次部門標示相同（seating.md SEAT-R07～R09，人數相同時的先後也一樣）', () => {
    const data = new SheetData()
      .employee('業甲', '業務部')
      .employee('研甲', '研發部')
      .employee('行甲', '行政部')
      .dependent('研甲')
      .guest('賓甲')
      .seat(3, ['研甲', '業甲', '賓甲', '行甲', '研甲_眷屬']);
    const state = data.state();
    const seated = state.participants
      .filter((p) => p.tableId === 3)
      .sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0));
    const label = tableDepartmentLabel(seated, buildDirectory(state));
    expect(header3(data)).toBe(`第 3 桌\n${label}\n(5)`);
    expect(label).toBe('研發部＋業務部＋行政部＋貴賓');
  });

  it('眷屬算所屬員工的部門，所屬員工不在這一桌也一樣', () => {
    const data = new SheetData().employee('業甲', '業務部').dependent('業甲').seat(3, ['業甲_眷屬']);
    expect(header3(data)).toBe('第 3 桌\n業務部\n(1)');
  });

  it('有外部貴賓時最後加「貴賓」，人數含外部貴賓', () => {
    const data = new SheetData()
      .employee('研甲', '研發部')
      .guest('賓甲')
      .guest('賓乙')
      .seat(3, ['賓甲', '研甲', '賓乙']);
    expect(header3(data)).toBe('第 3 桌\n研發部＋貴賓\n(3)');
  });

  it('只有外部貴賓時部門寫「貴賓」', () => {
    const data = new SheetData().guest('賓甲').seat(3, ['賓甲']);
    expect(header3(data)).toBe('第 3 桌\n貴賓\n(1)');
  });

  it('有備註名稱時第二行是備註名稱；有人時接著部門與人數', () => {
    const data = new SheetData().employee('研甲', '研發部').note(3, '董事貴賓').seat(3, ['研甲']);
    expect(header3(data)).toBe('第 3 桌\n董事貴賓\n研發部\n(1)');
  });

  it('有備註名稱、沒有人：「第 n 桌↵備註名稱↵空桌↵(0)」；沒有備註名稱的空桌不留空行', () => {
    const data = new SheetData().note(3, '保留');
    const s = read(data);
    expect(s.text(T3.header)).toBe('第 3 桌\n保留\n空桌\n(0)');
    expect(s.text(tableBlock(4).header)).toBe('第 4 桌\n空桌\n(0)');
  });

  it('坐滿 10 人時人數是 (10)，十格名單格由上往下都有人', () => {
    const data = new SheetData();
    for (let i = 1; i <= 10; i++) data.employee(`員${i}`, '業務部');
    data.seat(3, Array.from({ length: 10 }, (_, i) => `員${i + 1}`));
    const s = read(data);
    expect(s.text(T3.header)).toBe('第 3 桌\n業務部\n(10)');
    expect(T3.list.map((a) => s.text(a))).toEqual(Array.from({ length: 10 }, (_, i) => `員${i + 1}`));
  });

  it('工作人員不算在桌次的人數裡', () => {
    const s = read(sampleA());
    expect(s.text(tableBlock(1).header)).toBe('第 1 桌\n主桌\n總經理室＋貴賓\n(3)');
    expect(s.texts().filter((t) => t.startsWith('第 ') && t.includes('研發部'))).toEqual([]);
  });
});

describe('名單格（EXP-R10、EXP-R13、EXP-R14、EXP-Q01）', () => {
  it('依座位順序由上往下放，和資料的先後無關', () => {
    const data = new SheetData()
      .employee('員甲', '業務部')
      .employee('員乙', '業務部')
      .employee('員丙', '業務部')
      .seat(3, ['員丙', '員甲', '員乙']);
    const s = read(data, { reversed: true });
    expect(column('J', 21, 24).map((a) => s.text(a))).toEqual(['員丙', '員甲', '員乙', '']);
  });

  // 第 3 桌依序坐這十位；J21–J30
  const CASES: [label: string, text: string, fill: string | null][] = [
    ['員工，沒有標記', '員甲', null],
    ['員工需要兒童椅', '員乙(+兒童椅)', 'childSeat'],
    ['員工素食', '員丙(素食)', 'vegetarian'],
    ['員工需要兒童椅又素食', '員丁(+兒童椅)(素食)', 'childSeat'],
    ['眷屬需要兒童椅', '員甲_眷屬(+兒童椅)', 'childSeat'],
    ['眷屬素食', '員乙_眷屬(素食)', 'vegetarian'],
    ['外部貴賓，沒有標記', '賓甲', 'guest'],
    ['素食的外部貴賓', '賓乙(素食)', 'vegetarian'],
    ['需要兒童椅的外部貴賓', '賓丙(+兒童椅)', 'childSeat'],
    ['需要兒童椅又素食的外部貴賓', '賓丁(+兒童椅)(素食)', 'childSeat'],
  ];
  const marked = lazy(() =>
    read(
      new SheetData()
        .employee('員甲', '業務部', { extension: '1234' })
        .employee('員乙', '業務部', { childSeat: true })
        .employee('員丙', '業務部', { vegetarian: true })
        .employee('員丁', '業務部', { childSeat: true, vegetarian: true })
        .dependent('員甲', { childSeat: true })
        .dependent('員乙', { vegetarian: true })
        .guest('賓甲')
        .guest('賓乙', { vegetarian: true })
        .guest('賓丙', { childSeat: true })
        .guest('賓丁', { childSeat: true, vegetarian: true })
        .seat(3, ['員甲', '員乙', '員丙', '員丁', '員甲_眷屬', '員乙_眷屬', '賓甲', '賓乙', '賓丙', '賓丁']),
    ),
  );

  it.each(CASES.map((c, i) => [...c, `J${21 + i}`] as const))(
    '%s：「%s」，底色 %s（%s）',
    (_label, text, fill, address) => {
      const s = marked();
      expect(s.text(address)).toBe(text);
      expect(s.fill(address)).toBe(fill);
      expect(s.border(address)).toBe(true);
    },
  );

  it('名單格只放顯示名稱與標記，不放分機（EXP-Q01）', () => {
    expect(marked().texts().filter((t) => t.includes('1234'))).toEqual([]);
  });
});

describe('工作人員區塊（EXP-R13、EXP-R14、EXP-R16、EXP-R20、EXP-Q03、EXP-Q05）', () => {
  const staffSheet = (count: number) => {
    const data = new SheetData();
    const names = Array.from({ length: count }, (_, i) => `工${i + 1}`);
    for (const name of names) data.employee(name, '業務部');
    return read(data.staff(names));
  };

  it('EXP-AC12 沒有工作人員：K1:K10「工作人員↵(0)」，L1–L10 空白、有框線；張家豪坐在第 5 桌第 4 位', () => {
    const s = read(sampleA().seat(5, ['張家豪']));
    expect(s.merge('K1')).toBe('K1:K10');
    expect(s.text('K1')).toBe('工作人員\n(0)');
    for (const a of column('L', 1, 10)) expect([a, s.text(a), s.border(a)]).toEqual([a, '', true]);
    expect(s.text('I61')).toBe('第 5 桌\n業務部＋研發部\n(4)');
    expect(s.text('J64')).toBe('張家豪');
  });

  it('EXP-AC13 12 位工作人員：K1:K12「工作人員↵(12)」；L1–L12 依序為工1–工12，都有框線', () => {
    const s = staffSheet(12);
    expect(s.merge('K1')).toBe('K1:K12');
    expect(s.text('K1')).toBe('工作人員\n(12)');
    expect(column('L', 1, 12).map((a) => s.text(a))).toEqual(Array.from({ length: 12 }, (_, i) => `工${i + 1}`));
    for (const a of column('L', 1, 12)) expect([a, s.border(a)]).toEqual([a, true]);
    expect(s.used().filter((a) => /^[KL]\d+$/.test(a) && parseAddress(a).row > 12)).toEqual([]);
  });

  it('剛好 10 位：K1:K10，名單放到 L10', () => {
    const s = staffSheet(10);
    expect(s.merge('K1')).toBe('K1:K10');
    expect(s.text('K1')).toBe('工作人員\n(10)');
    expect(s.text('L10')).toBe('工10');
    expect(s.used().filter((a) => /^[KL]\d+$/.test(a) && parseAddress(a).row > 10)).toEqual([]);
  });

  it('11 位：往下延伸到 K1:K11，名單放到 L11（EXP-Q03）', () => {
    const s = staffSheet(11);
    expect(s.merge('K1')).toBe('K1:K11');
    expect(s.text('K1')).toBe('工作人員\n(11)');
    expect(s.text('L11')).toBe('工11');
    expect([s.border('L11'), s.border('L12')]).toEqual([true, false]);
  });

  it('EXP-AC14 名單依參與人員的預設排序，不看工作人員桌的順序：總經理室排在研發部之前（EXP-R20）', () => {
    const data = sampleA().staff(['王大同']);
    // 工作人員桌的順序是張家豪、王大同
    expect(data.get('張家豪').seatOrder).toBe(0);
    const s = read(data);
    expect([s.text('L1'), s.text('L2'), s.text('L3')]).toEqual(['王大同', '張家豪', '']);
    expect(s.text('K1')).toBe('工作人員\n(2)');
  });

  it('預設排序：部門依員工名單中第一次出現的先後排在一起，同部門依員工名單順序（PPL-R20、PPL-Q13）', () => {
    const data = new SheetData()
      .employee('業甲', '業務部')
      .employee('研甲', '研發部')
      .employee('業乙', '業務部')
      .employee('研乙', '研發部')
      .staff(['研乙', '研甲', '業乙', '業甲']);
    const s = read(data, { reversed: true });
    expect(column('L', 1, 4).map((a) => s.text(a))).toEqual(['業甲', '業乙', '研甲', '研乙']);
  });

  it('工作人員的名單格也加兒童椅、素食的文字與底色（EXP-R13、EXP-R14）', () => {
    const data = new SheetData()
      .employee('員甲', '業務部', { vegetarian: true })
      .employee('員乙', '業務部', { childSeat: true, vegetarian: true })
      .staff(['員甲', '員乙']);
    const s = read(data);
    expect([s.text('L1'), s.fill('L1')]).toEqual(['員甲(素食)', 'vegetarian']);
    expect([s.text('L2'), s.fill('L2')]).toEqual(['員乙(+兒童椅)(素食)', 'childSeat']);
  });

  it('工作人員的眷屬照常坐自己的桌次，不在工作人員區塊（PPL-R10）', () => {
    const data = new SheetData().employee('員甲', '業務部').dependent('員甲').staff(['員甲']).seat(3, ['員甲_眷屬']);
    const s = read(data);
    expect(s.text('K1')).toBe('工作人員\n(1)');
    expect(s.text('L1')).toBe('員甲');
    expect(s.text('L2')).toBe('');
    expect(s.text('J21')).toBe('員甲_眷屬');
  });
});

describe('未入座區塊（EXP-R17～R20、EXP-Q05 ①④）', () => {
  it('EXP-AC15 11 位未入座：第 111 列空白；B112:B121「未入座↵(11)」；C112–C121、D112 依預設排序；賓甲素食底色', () => {
    const data = new SheetData();
    for (let i = 1; i <= 9; i++) data.employee(`業${i}`, '業務部');
    data.dependent('業1').guest('賓甲', { vegetarian: true });
    const s = read(data);

    expect(usedRows(s).filter((r) => r === 111)).toEqual([]);
    expect(s.merge('B112')).toBe('B112:B121');
    expect(s.text('B112')).toBe('未入座\n(11)');
    expect([s.fill('B112'), s.border('B112')]).toEqual(['header', true]);
    expect(column('C', 112, 121).map((a) => s.text(a))).toEqual([
      '業1',
      '業1_眷屬',
      '業2',
      '業3',
      '業4',
      '業5',
      '業6',
      '業7',
      '業8',
      '業9',
    ]);
    expect([s.text('D112'), s.fill('D112')]).toEqual(['賓甲(素食)', 'vegetarian']);
    expect(s.text('D113')).toBe('');
  });

  it('EXP-AC16 105 位：B112:B131「未入座↵(105)」；未1 在 C112、未10 在 C121、未11 在 D112、未100 在 L121、未101 在 C122、未105 在 C126', () => {
    const data = new SheetData();
    for (let i = 1; i <= 105; i++) data.employee(`未${i}`, '研發部');
    const s = read(data);

    expect(s.merge('B112')).toBe('B112:B131');
    expect(s.text('B112')).toBe('未入座\n(105)');
    expect(s.text('C112')).toBe('未1');
    expect(s.text('C121')).toBe('未10');
    expect(s.text('D112')).toBe('未11');
    expect(s.text('L121')).toBe('未100');
    expect(s.text('C122')).toBe('未101');
    expect(s.text('C126')).toBe('未105');
    for (let i = 1; i <= 105; i++) expect([i, s.text(unseatedAddress(i))]).toEqual([i, `未${i}`]);
  });

  it('只有放了人的名單格畫框線，標題格也畫；段內其他格空白（EXP-Q05 ④）', () => {
    const data = new SheetData();
    for (let i = 1; i <= 105; i++) data.employee(`未${i}`, '研發部');
    const s = read(data);
    expect(s.border('B112')).toBe(true);
    for (let i = 1; i <= 105; i++) expect([i, s.border(unseatedAddress(i))]).toEqual([i, true]);
    for (const a of ['C127', 'C131', 'D122', 'L131']) expect([a, s.text(a), s.fill(a), s.border(a)]).toEqual([a, '', null, false]);
    const rows = usedRows(s);
    expect(Math.max(...rows)).toBe(126);
  });

  it.each([
    [1, 'B112:B121', 'C112'],
    [10, 'B112:B121', 'C121'],
    [100, 'B112:B121', 'L121'],
    [101, 'B112:B131', 'C122'],
    [200, 'B112:B131', 'L131'],
    [201, 'B112:B141', 'C132'],
  ])('%i 位：標題格合併 %s，最後一位在 %s（段數＝⌈人數÷100⌉，EXP-R18）', (count, range, lastAddress) => {
    const data = new SheetData();
    for (let i = 1; i <= count; i++) data.employee(`未${i}`, '研發部');
    const s = read(data);
    expect(s.merge('B112')).toBe(range);
    expect(s.text('B112')).toBe(`未入座\n(${count})`);
    expect(s.text(lastAddress)).toBe(`未${count}`);
    expect(unseatedAddress(count)).toBe(lastAddress);
    for (let i = 1; i <= count; i++) expect([i, s.text(unseatedAddress(i))]).toEqual([i, `未${i}`]);
  });

  it('未入座是不在任何一桌、也不是工作人員的參與人員，含外部貴賓（EXP-R17）', () => {
    const data = new SheetData()
      .employee('員甲', '業務部')
      .employee('員乙', '業務部')
      .employee('員丙', '業務部')
      .guest('賓甲')
      .guest('賓乙')
      .seat(3, ['員甲', '賓乙'])
      .staff(['員乙']);
    const s = read(data);
    expect(s.text('B112')).toBe('未入座\n(2)');
    expect([s.text('C112'), s.text('C113'), s.text('C114')]).toEqual(['員丙', '賓甲', '']);
    expect([s.fill('C113')]).toEqual(['guest']);
  });

  it('沒有報名的員工不是參與人員，不算未入座', () => {
    const data = new SheetData().employee('員甲', '業務部', { registered: false }).employee('員乙', '業務部');
    const s = read(data);
    expect(s.text('B112')).toBe('未入座\n(1)');
    expect(s.text('C112')).toBe('員乙');
  });

  it('預設排序：部門依員工名單第一次出現的先後、眷屬緊接在所屬員工的位置、外部貴賓排最後並依新增的先後（EXP-R20、PPL-R20、PPL-Q13）', () => {
    const data = new SheetData()
      .employee('業甲', '業務部')
      .employee('研甲', '研發部')
      .employee('業乙', '業務部')
      .dependent('業乙')
      .dependent('研甲')
      .guest('賓乙', { createdAt: '2026-10-05T00:00:00.000Z' })
      .guest('賓甲', { createdAt: '2026-10-02T00:00:00.000Z' })
      .seat(3, ['業乙']);
    const s = read(data, { reversed: true });
    expect(s.text('B112')).toBe('未入座\n(6)');
    expect(column('C', 112, 118).map((a) => s.text(a))).toEqual([
      '業甲',
      '業乙_眷屬',
      '研甲',
      '研甲_眷屬',
      '賓甲',
      '賓乙',
      '',
    ]);
  });

  it('EXP-R19 沒有未入座的人：不放未入座區塊，第 111 列以下沒有任何內容', () => {
    const data = new SheetData().employee('員甲', '業務部').seat(3, ['員甲']);
    const s = read(data);
    expect(usedRows(s).filter((r) => r >= 111)).toEqual([]);
    expect(s.merges().filter((m) => m.startsWith('B112'))).toEqual([]);
  });
});

describe('EXP-AC17 沒有任何參與人員', () => {
  it('30 桌的標題格都是「第 n 桌↵空桌↵(0)」，位置照 3.3 節；K1:K10「工作人員↵(0)」；第 111 列以下沒有內容', () => {
    const s = read(new SheetData());
    for (const n of TABLE_IDS) {
      const b = tableBlock(n);
      expect([n, s.merge(b.header), s.text(b.header)]).toEqual([n, b.range, `第 ${n} 桌\n空桌\n(0)`]);
      for (const a of b.list) expect([a, s.text(a), s.border(a)]).toEqual([a, '', true]);
    }
    expect(s.merge('K1')).toBe('K1:K10');
    expect(s.text('K1')).toBe('工作人員\n(0)');
    expect(usedRows(s).filter((r) => r >= 111)).toEqual([]);
    expect([s.text('A3'), s.text('A4'), s.text('A5')]).toEqual(['貴賓', '兒童椅', '素食']);
  });
});

describe('與頁面的搜尋、篩選、資料先後無關（EXP-R02、EXP-AC18）', () => {
  it('同樣的資料、陣列順序不同，產生的版面完全相同', () => {
    const data = sampleA().employee('未甲', '業務部').guest('賓丙', { childSeat: true });
    expect(read(data, { reversed: true }).normalized()).toEqual(read(data).normalized());
  });
});

// ---- EXP-R23：有桌次 11、12 位（seating.md SEAT-R02，D-018） ----

/** 加 count 位員工（姓名 prefix1…prefixN），依序坐第 table 桌；回傳姓名 */
function seatNew(data: SheetData, table: number, prefix: string, count: number, department = '業務部'): string[] {
  const names = Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
  for (const name of names) data.employee(name, department);
  data.seat(table, names);
  return names;
}

describe('EXP-AC22 資料甲，第 1 桌有 11 位（EXP-R23）', () => {
  // 資料甲的第 1 桌原本 3 位；再坐 8 位總經理室的員工成為 11 位（等同把 1 位拖進 10 位的第 1 桌）。另有 1 位未入座的「未甲」。
  const sheet = lazy(() => {
    const data = sampleA();
    seatNew(data, 1, '總', 8, '總經理室');
    data.employee('未甲', '業務部');
    return read(data);
  });
  const layout = overflowLayout([1]);

  it('第 1 桌在第 1 段：G1:G12 合併「第 1 桌↵主桌↵總經理室＋貴賓↵(11)」，人數照實寫，仍是標題底色', () => {
    const s = sheet();
    expect(s.merge('G1')).toBe('G1:G12');
    expect(s.text('G1')).toBe('第 1 桌\n主桌\n總經理室＋貴賓\n(11)');
    expect([s.fill('G1'), s.border('G1')]).toEqual(['header', true]);
  });

  it('第 1 桌的名單放到第 11 位：H1–H11 依座位順序，H12 空白、有框線', () => {
    const s = sheet();
    expect(column('H', 1, 11).map((a) => s.text(a))).toEqual([
      '王大同',
      '李小華',
      '周董事(+兒童椅)(素食)',
      ...Array.from({ length: 8 }, (_, i) => `總${i + 1}`),
    ]);
    expect([s.fill('H3'), s.fill('H4'), s.fill('H11')]).toEqual(['childSeat', null, null]);
    expect([s.text('H12'), s.fill('H12'), s.border('H12')]).toEqual(['', null, true]);
    for (const a of column('H', 1, 12)) expect([a, s.border(a)]).toEqual([a, true]);
  });

  it('同一段的第 2 桌也是十二列：D1:D12「第 2 桌↵空桌↵(0)」，E1–E12 空白、有框線', () => {
    const s = sheet();
    expect(s.merge('D1')).toBe('D1:D12');
    expect(s.text('D1')).toBe('第 2 桌\n空桌\n(0)');
    for (const a of column('E', 1, 12)) expect([a, s.text(a), s.border(a)]).toEqual([a, '', true]);
  });

  it('其他段仍是十列、往下移兩列：第 22 桌 C13:C22（D13 吳協理）、第 7 桌 H13:H22、第 5 桌 I63:I72、第 16 桌 G103:G112', () => {
    const s = sheet();
    expect(s.merge('C13')).toBe('C13:C22');
    expect(s.text('C13')).toBe('第 22 桌\n客戶貴賓\n貴賓\n(1)');
    expect([s.text('D13'), s.fill('D13')]).toEqual(['吳協理', 'guest']);
    expect(s.merge('H13')).toBe('H13:H22');
    expect(s.merge('I63')).toBe('I63:I72');
    expect(s.text('I63')).toBe('第 5 桌\n業務部\n(3)');
    expect([s.text('J63'), s.text('J64'), s.text('J65')]).toEqual(['陳志明', '陳志明_眷屬(+兒童椅)', '林美玲(素食)']);
    expect(s.merge('G103')).toBe('G103:G112');
    expect(s.merge('D103')).toBe('D103:D112');
    // 原本的位置已經不是標題格
    expect(s.merge('C11')).toBeUndefined();
    expect(s.merge('I61')).toBeUndefined();
  });

  it.each(TABLE_IDS)('第 %i 桌：標題格與合併範圍照 EXP-R23 移動，名單格都有框線', (n) => {
    const s = sheet();
    const b = layout.block(n);
    expect([n, s.merge(b.header)]).toEqual([n, b.range]);
    expect(s.text(b.header).startsWith(`第 ${n} 桌\n`)).toBe(true);
    expect(s.fill(b.header)).toBe('header');
    expect(b.list).toHaveLength(segmentOf(n) === 1 ? 12 : 10);
    for (const a of b.list) expect([n, a, s.border(a)]).toEqual([n, a, true]);
  });

  it('第 113 列空白；未入座區塊往下移兩列：B114:B123「未入座↵(1)」、C114「未甲」', () => {
    const s = sheet();
    expect(layout.blankRow).toBe(113);
    expect(usedRows(s).filter((r) => r === 113)).toEqual([]);
    expect(s.merge('B114')).toBe('B114:B123');
    expect(s.text('B114')).toBe('未入座\n(1)');
    expect([s.fill('B114'), s.border('B114')]).toEqual(['header', true]);
    expect(s.text('C114')).toBe('未甲');
    expect(s.merge('B112')).toBeUndefined();
    expect(s.text('C112')).toBe('');
  });

  it('工作人員區塊與圖例不受影響：K1:K10「工作人員↵(1)」、L1「張家豪」、L2–L10 空白有框線、L11 以下沒有東西；A3–A5 圖例', () => {
    const s = sheet();
    expect(s.merge('K1')).toBe('K1:K10');
    expect(s.text('K1')).toBe('工作人員\n(1)');
    expect(s.text('L1')).toBe('張家豪');
    for (const a of column('L', 2, 10)) expect([a, s.text(a), s.border(a)]).toEqual([a, '', true]);
    expect(s.used().filter((a) => /^[KL]\d+$/.test(a) && parseAddress(a).row > 10)).toEqual([]);
    expect([s.text('A3'), s.text('A4'), s.text('A5')]).toEqual(['貴賓', '兒童椅', '素食']);
    expect(s.used().filter((a) => /^A\d+$/.test(a))).toEqual(['A3', 'A4', 'A5']);
  });

  it('只用到規格列出的格；合併的只有 30 桌、工作人員與未入座的標題格；F 欄仍是空白', () => {
    const s = sheet();
    const expected = new Set<string>(['A3', 'A4', 'A5', 'K1', ...column('L', 1, 10), 'B114', 'C114']);
    for (const n of TABLE_IDS) {
      const b = layout.block(n);
      expected.add(b.header);
      for (const a of b.list) expected.add(a);
    }
    expect(s.used()).toEqual(sortAddresses(expected));
    const merges = [...TABLE_IDS.map((n) => layout.block(n).range), 'K1:K10', 'B114:B123'];
    expect(s.merges().slice().sort()).toEqual(merges.sort());
    expect(s.used().filter((a) => /^F\d+$/.test(a))).toEqual([]);
  });

  it('標題格不另加底色：用標題底色的只有標題格，名單格的底色只有兒童椅、素食、貴賓（EXP-R14、EXP-R21、EXP-R23）', () => {
    const s = sheet();
    const headers = new Set([...TABLE_IDS.map((n) => layout.block(n).header), 'K1', 'B114']);
    expect(s.used().filter((a) => s.fill(a) === 'header' && !headers.has(a))).toEqual([]);
    for (const h of headers) expect([h, s.fill(h)]).toEqual([h, 'header']);
  });
});

describe('EXP-R23 各種超過的情況', () => {
  it('第 1 桌 12 位：標題「(12)」，名單放到 H12', () => {
    const data = new SheetData();
    const names = seatNew(data, 1, '員', 12);
    const s = read(data);
    expect(s.merge('G1')).toBe('G1:G12');
    expect(s.text('G1')).toBe('第 1 桌\n業務部\n(12)');
    expect(column('H', 1, 12).map((a) => s.text(a))).toEqual(names);
    // 第 2 段從第 13 列開始：H13 是第 7 桌的標題格
    expect(s.merge('H13')).toBe('H13:H22');
    expect(s.text('H13')).toBe('第 7 桌\n空桌\n(0)');
    expect(s.merge('C13')).toBe('C13:C22');
  });

  it('多段超過：第 3 段（第 3 桌 12 位）與第 7 段（第 19 桌 11 位）各改為十二列，下面的列各往下移兩列，共四列', () => {
    const data = new SheetData();
    const t3 = seatNew(data, 3, '三', 12);
    const t19 = seatNew(data, 19, '十九', 11);
    data.employee('未甲', '業務部');
    const s = read(data);
    const layout = overflowLayout([3, 7]);

    // 對照實際位址：第 3 段 21–32、第 4 段 33–42、第 7 段 63–74、第 11 段 105–114、空白列 115、未入座 116 起
    expect(s.merge('I21')).toBe('I21:I32');
    expect(s.merge('G21')).toBe('G21:G32');
    expect(s.merge('B21')).toBe('B21:B32');
    expect(s.merge('H33')).toBe('H33:H42');
    expect(s.merge('D63')).toBe('D63:D74');
    expect(s.merge('I63')).toBe('I63:I74');
    expect(s.merge('H75')).toBe('H75:H84');
    expect(s.merge('G105')).toBe('G105:G114');
    expect(column('J', 21, 32).map((a) => s.text(a))).toEqual(t3);
    expect(column('E', 63, 73).map((a) => s.text(a))).toEqual(t19);
    expect([s.text('E74'), s.border('E74')]).toEqual(['', true]);
    expect(s.text('D63')).toBe('第 19 桌\n業務部\n(11)');

    for (const n of TABLE_IDS) expect([n, s.merge(layout.block(n).header)]).toEqual([n, layout.block(n).range]);
    expect(layout.blankRow).toBe(115);
    expect(usedRows(s).filter((r) => r === 115)).toEqual([]);
    expect(s.merge('B116')).toBe('B116:B125');
    expect(s.text('C116')).toBe('未甲');
    // 沒有超過的段（例如第 1、2 段）不動
    expect(s.merge('G1')).toBe('G1:G10');
    expect(s.merge('C11')).toBe('C11:C20');
  });

  it('同一段的兩桌都超過（第 1 桌 11 位、第 2 桌 12 位）：這一段只改為十二列一次，下面只往下移兩列', () => {
    const data = new SheetData();
    seatNew(data, 1, '一', 11);
    seatNew(data, 2, '二', 12);
    data.employee('未甲', '業務部');
    const s = read(data);
    expect(s.merge('G1')).toBe('G1:G12');
    expect(s.merge('D1')).toBe('D1:D12');
    expect(s.text('G1')).toBe('第 1 桌\n業務部\n(11)');
    expect(s.text('D1')).toBe('第 2 桌\n業務部\n(12)');
    expect(s.merge('C13')).toBe('C13:C22');
    expect(s.merge('B114')).toBe('B114:B123');
    expect(s.text('C114')).toBe('未甲');
  });

  it('超過的是最後一段（第 16 桌 11 位）：第 11 段 G101:G112、D101:D112；空白列 113，未入座區塊從第 114 列起（超過的段在未入座區塊之前）', () => {
    const data = new SheetData();
    seatNew(data, 16, '十六', 11);
    data.employee('未甲', '業務部');
    const s = read(data);
    expect(s.merge('G101')).toBe('G101:G112');
    expect(s.merge('D101')).toBe('D101:D112');
    expect(s.text('H111')).toBe('十六11');
    expect(usedRows(s).filter((r) => r === 113)).toEqual([]);
    expect(s.merge('B114')).toBe('B114:B123');
    // 前面的段不動
    expect(s.merge('C91')).toBe('C91:C100');
  });

  it('沒有未入座的人時：超過的段之後、桌次區以下沒有任何內容（EXP-R19）', () => {
    const data = new SheetData();
    seatNew(data, 5, '五', 11);
    const s = read(data);
    const layout = overflowLayout([7]);
    expect(Math.max(...usedRows(s))).toBe(layout.lastTableRow);
    expect(usedRows(s).filter((r) => r > layout.lastTableRow)).toEqual([]);
  });

  it('105 位未入座、第 1 段超過：未入座的標題格合併 B114:B133，每一位都往下移兩列（EXP-R18、EXP-R23）', () => {
    const data = new SheetData();
    seatNew(data, 1, '一', 11);
    for (let i = 1; i <= 105; i++) data.employee(`未${i}`, '研發部');
    const s = read(data);
    const layout = overflowLayout([1]);
    expect(layout.unseatedRange(105)).toBe('B114:B133');
    expect(s.merge('B114')).toBe('B114:B133');
    expect(s.text('B114')).toBe('未入座\n(105)');
    for (let i = 1; i <= 105; i++) expect([i, s.text(layout.unseatedAddress(i))]).toEqual([i, `未${i}`]);
    expect([s.text('C114'), s.text('L123'), s.text('C124')]).toEqual(['未1', '未100', '未101']);
  });

  it('工作人員 12 位、第 1 段也超過：工作人員區塊照 EXP-R16 是 K1:K12、L1–L12，不受段的影響', () => {
    const data = new SheetData();
    seatNew(data, 1, '一', 11);
    const staff = Array.from({ length: 12 }, (_, i) => `工${i + 1}`);
    for (const name of staff) data.employee(name, '總務部');
    data.staff(staff);
    const s = read(data);
    expect(s.merge('K1')).toBe('K1:K12');
    expect(s.text('K1')).toBe('工作人員\n(12)');
    expect(column('L', 1, 12).map((a) => s.text(a))).toEqual(staff);
    expect(s.used().filter((a) => /^[KL]\d+$/.test(a) && parseAddress(a).row > 12)).toEqual([]);
    expect(s.merge('G1')).toBe('G1:G12');
  });

  it('工作人員有 11、12 位但沒有桌次超過：桌次的段都是十列（工作人員不算桌次）', () => {
    const data = new SheetData();
    const staff = Array.from({ length: 11 }, (_, i) => `工${i + 1}`);
    for (const name of staff) data.employee(name, '總務部');
    data.staff(staff).employee('未甲', '業務部');
    const s = read(data);
    for (const n of TABLE_IDS) expect([n, s.merge(tableBlock(n).header)]).toEqual([n, tableBlock(n).range]);
    expect(s.merge('B112')).toBe('B112:B121');
  });
});

describe('EXP-AC23 沒有桌次超過 10 位：版面不變（EXP-R23）', () => {
  it('第 1 桌剛好 10 位：仍是 G1:G10，第 2 段從第 11 列開始，未入座從第 112 列開始', () => {
    const data = new SheetData();
    const names = seatNew(data, 1, '員', 10);
    data.employee('未甲', '業務部');
    const s = read(data);
    expect(s.merge('G1')).toBe('G1:G10');
    expect(s.text('G1')).toBe('第 1 桌\n業務部\n(10)');
    expect(column('H', 1, 10).map((a) => s.text(a))).toEqual(names);
    // 第 11 列已經是第 2 段：H11 是第 7 桌的標題格
    expect(s.merge('H11')).toBe('H11:H20');
    expect(s.merge('C11')).toBe('C11:C20');
    expect(s.merge('B112')).toBe('B112:B121');
    expect(s.text('C112')).toBe('未甲');
  });

  it('30 桌都是 10 位：每一桌都在本檔 3.3 表的位置，沒有任何一段是十二列', () => {
    const data = new SheetData();
    for (const n of TABLE_IDS) seatNew(data, n, `桌${n}員`, 10);
    const s = read(data);
    for (const n of TABLE_IDS) expect([n, s.merge(tableBlock(n).header)]).toEqual([n, tableBlock(n).range]);
    expect(Math.max(...usedRows(s))).toBe(110);
  });

  it('資料甲：版面和 EXP-AC04～AC10 相同（overflowLayout 沒有超過的段時就是本檔 3.3 表）', () => {
    const s = read(sampleA());
    const layout = overflowLayout([]);
    for (const n of TABLE_IDS) {
      expect(layout.block(n)).toEqual(tableBlock(n));
      expect([n, s.merge(tableBlock(n).header)]).toEqual([n, tableBlock(n).range]);
    }
    expect(layout.blankRow).toBe(111);
    expect(layout.unseatedTop).toBe(112);
  });
});
