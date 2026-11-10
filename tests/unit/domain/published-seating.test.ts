// 發布頁的找座位：docs/spec/permissions.md PRM-R30（比對已入座與工作人員桌的人的顯示名稱，包含關鍵字就符合；去掉前後空白、英文不分大小寫；
// 不比對分機、部門、組別與單位／頭銜；關鍵字空白時沒有結果；未入座的人不在資料裡）、PRM-R31（「{顯示名稱}：{桌號} 桌」，工作人員是
// 「{顯示名稱}：工作人員桌」；依 A1～A15、B1～B15、工作人員桌的順序，同一桌依名單順序）、PRM-R32（結果中顯示名稱完全相同時加「（{部門}）」，
// 外部貴賓寫「（貴賓）」；沒有重複的不加）、PRM-R33（找不到「{關鍵字}」。）、第 4.3 節文案；PRM-AC27～AC31；
// 待確認 PRM-Q01（已報名但未入座的人搜尋自己：目前假設和找不到一樣）。
// docs/architecture.md 第 11.5 節：發布頁的資料是 PublishedSeating（每桌 id、noteName、departmentLabel、people[{ displayName, group }]，
// group 是部門，外部貴賓是「貴賓」），搜尋、同名區分與桌次標示都在前端用這份資料計算。
// 桌號（D-019）：資料用內部編號（1 = B1、2 = A1、3 = B4、7 = B2、16 = B15、17 = A3、30 = A13），工作人員桌是 0。
//
// 假設的介面（src/domain/published-seating.ts，純函式）：
//   export function searchPublishedSeats(
//     tables: readonly { id: number; noteName: string | null; departmentLabel: string; people: readonly { displayName: string; group: string }[] }[],
//     keyword: string,
//   ): { tableId: number; text: string }[];
//     依 PRM-R30～R32 回傳每一位符合的人（text 是畫面上那一行的文字），順序同 PRM-R31；關鍵字空白時回空陣列。
//   export function seatNotFoundMessage(keyword: string): string;   // 「找不到「{關鍵字}」。」
import { describe, expect, it } from 'vitest';
import { searchPublishedSeats, seatNotFoundMessage } from '@/domain/published-seating';

type Person = { displayName: string; group: string };
type Table = { id: number; noteName: string | null; departmentLabel: string; people: Person[] };

const STAFF = 0;
const B1 = 1;
const A1 = 2;
const B4 = 3;
const B2 = 7;
const B15 = 16;
const A3 = 17;
const A13 = 30;

const person = (displayName: string, group: string): Person => ({ displayName, group });
/** 部門標示由伺服器算好（domain/display.ts），搜尋不用它；這裡給一個合理的值 */
const table = (id: number, people: Person[], noteName: string | null = null): Table => ({
  id,
  noteName,
  departmentLabel: [...new Set(people.map((p) => p.group))].join('＋') || '空桌',
  people,
});

/** 31 張桌（30 桌與工作人員桌），沒給的桌是空桌 */
function seating(given: Table[]): Table[] {
  const byId = new Map(given.map((t) => [t.id, t]));
  return Array.from({ length: 31 }, (_, id) => byId.get(id) ?? table(id, []));
}

const texts = (tables: Table[], keyword: string) => searchPublishedSeats(tables, keyword).map((r) => r.text);

/** 驗收條件的資料：B4 桌依序是王小明（研發一部）、王小明_眷屬、林董（外部貴賓）；B2 桌備註名稱「主桌」；陳大華是工作人員 */
const SAMPLE = seating([
  table(B4, [person('王小明', '研發一部'), person('王小明_眷屬', '研發一部'), person('林董', '貴賓')]),
  table(B2, [person('李美華', '業務部')], '主桌'),
  table(STAFF, [person('陳大華', '總務部')]),
]);

describe('找到（PRM-R30、PRM-R31、PRM-AC28）', () => {
  it('搜尋「王小明」→「王小明：B4 桌」「王小明_眷屬：B4 桌」，依名單順序', () => {
    expect(texts(SAMPLE, '王小明')).toEqual(['王小明：B4 桌', '王小明_眷屬：B4 桌']);
  });

  it('每一個結果帶著所在的桌次（用來標示桌次）', () => {
    expect(searchPublishedSeats(SAMPLE, '王小明').map((r) => r.tableId)).toEqual([B4, B4]);
  });

  it('包含關鍵字就符合：「小明」也找得到兩位', () => {
    expect(texts(SAMPLE, '小明')).toEqual(['王小明：B4 桌', '王小明_眷屬：B4 桌']);
  });

  it('關鍵字去掉前後空白（含全形空白）', () => {
    expect(texts(SAMPLE, '  林董 ')).toEqual(['林董：B4 桌']);
    expect(texts(SAMPLE, '　林董　')).toEqual(['林董：B4 桌']);
  });

  it('英文不分大小寫', () => {
    const tables = seating([table(A1, [person('David Lin', '貴賓')])]);
    expect(texts(tables, 'david')).toEqual(['David Lin：A1 桌']);
    expect(texts(tables, ' LIN ')).toEqual(['David Lin：A1 桌']);
  });
});

describe('工作人員（PRM-R31、PRM-AC29）', () => {
  it('搜尋「陳大華」→「陳大華：工作人員桌」，結果帶著工作人員桌', () => {
    expect(searchPublishedSeats(SAMPLE, '陳大華')).toEqual([{ tableId: STAFF, text: '陳大華：工作人員桌' }]);
  });
});

describe('結果的順序：A1～A15、B1～B15、工作人員桌，同一桌依名單順序（PRM-R31）', () => {
  it('B15、工作人員桌、A13、B1、A1 各有一位「王」→ A1、A13、B1、B15、工作人員桌', () => {
    const tables = seating([
      table(B15, [person('王五', '業務部')]),
      table(STAFF, [person('王工作', '總務部')]),
      table(A13, [person('王三', '研發一部')]),
      table(B1, [person('王四', '研發二部'), person('王四_眷屬', '研發二部')]),
      table(A1, [person('王一', '研發一部'), person('林二', '研發一部'), person('王二', '研發一部')]),
    ]);
    expect(texts(tables, '王')).toEqual([
      '王一：A1 桌',
      '王二：A1 桌',
      '王三：A13 桌',
      '王四：B1 桌',
      '王四_眷屬：B1 桌',
      '王五：B15 桌',
      '王工作：工作人員桌',
    ]);
  });
});

describe('同名（PRM-R32、PRM-AC30）', () => {
  it('研發一部的王小明在 B4、業務部的王小明在 A3 → 都加部門；A3 在 B4 前面（A 區在 B 區前面）', () => {
    const tables = seating([table(B4, [person('王小明', '研發一部')]), table(A3, [person('王小明', '業務部')])]);
    expect(searchPublishedSeats(tables, '王小明')).toEqual([
      { tableId: A3, text: '王小明（業務部）：A3 桌' },
      { tableId: B4, text: '王小明（研發一部）：B4 桌' },
    ]);
  });

  it('外部貴賓同名寫「（貴賓）」：「貴賓席」兩位在 B1、A1 →「貴賓席（貴賓）：A1 桌」「貴賓席（貴賓）：B1 桌」', () => {
    const tables = seating([table(B1, [person('貴賓席', '貴賓')]), table(A1, [person('貴賓席', '貴賓')])]);
    expect(texts(tables, '貴賓席')).toEqual(['貴賓席（貴賓）：A1 桌', '貴賓席（貴賓）：B1 桌']);
  });

  it('只有顯示名稱完全相同的才加部門：「王」找到兩位王小明與一位王大華 → 王大華不加', () => {
    const tables = seating([
      table(B4, [person('王小明', '研發一部')]),
      table(A3, [person('王小明', '業務部'), person('王大華', '業務部')]),
    ]);
    expect(texts(tables, '王')).toEqual(['王小明（業務部）：A3 桌', '王大華：A3 桌', '王小明（研發一部）：B4 桌']);
  });

  it('「王小明」與「王小明_眷屬」不是同名，都不加部門', () => {
    expect(texts(SAMPLE, '王小明')).toEqual(['王小明：B4 桌', '王小明_眷屬：B4 桌']);
  });

  it('顯示名稱只是包含另一位的名字（「王小明」與「王小明明」）不算同名，都不加部門', () => {
    const tables = seating([table(B4, [person('王小明', '研發一部')]), table(A3, [person('王小明明', '業務部')])]);
    expect(texts(tables, '王小明')).toEqual(['王小明明：A3 桌', '王小明：B4 桌']);
  });

  it('同名的兩位眷屬用所屬員工的部門區分', () => {
    const tables = seating([
      table(B4, [person('王小明_眷屬', '研發一部')]),
      table(A1, [person('王小明_眷屬', '業務部')]),
    ]);
    expect(texts(tables, '眷屬')).toEqual(['王小明_眷屬（業務部）：A1 桌', '王小明_眷屬（研發一部）：B4 桌']);
  });
});

describe('不比對顯示名稱以外的內容（PRM-R30）', () => {
  it('部門「研發一部」不是任何人的顯示名稱 → 沒有結果', () => {
    expect(texts(SAMPLE, '研發一部')).toEqual([]);
  });

  it('「貴賓」只比對顯示名稱：林董的 group 是貴賓，但顯示名稱不含「貴賓」，不會找到他', () => {
    const tables = seating([table(B4, [person('林董', '貴賓')]), table(A1, [person('貴賓席', '貴賓')])]);
    expect(texts(tables, '貴賓')).toEqual(['貴賓席：A1 桌']);
  });

  it('備註名稱「主桌」不比對 → 沒有結果', () => {
    expect(texts(SAMPLE, '主桌')).toEqual([]);
  });

  it('桌號「B4」不比對 → 沒有結果', () => {
    expect(texts(SAMPLE, 'B4')).toEqual([]);
  });
});

describe('關鍵字空白（PRM-R30）', () => {
  it.each(['', '   ', '　'])('「%s」→ 沒有結果、不標示', (keyword) => {
    expect(searchPublishedSeats(SAMPLE, keyword)).toEqual([]);
  });
});

describe('找不到（PRM-R33、PRM-AC31、PRM-AC27、PRM-Q01）', () => {
  it('搜尋「xyz」→ 沒有結果；提示「找不到「xyz」。」', () => {
    expect(searchPublishedSeats(SAMPLE, 'xyz')).toEqual([]);
    expect(seatNotFoundMessage('xyz')).toBe('找不到「xyz」。');
  });

  it('分機「1234」不在發布頁的資料裡 → 找不到', () => {
    expect(searchPublishedSeats(SAMPLE, '1234')).toEqual([]);
    expect(seatNotFoundMessage('1234')).toBe('找不到「1234」。');
  });

  it('PRM-Q01 目前假設：陳大文已報名但未入座，不在發布頁的資料裡 → 和找不到一樣', () => {
    expect(searchPublishedSeats(SAMPLE, '陳大文')).toEqual([]);
    expect(seatNotFoundMessage('陳大文')).toBe('找不到「陳大文」。');
  });

  it('沒有任何人入座 → 搜尋任何姓名都是找不到', () => {
    expect(searchPublishedSeats(seating([]), '王')).toEqual([]);
  });
});
