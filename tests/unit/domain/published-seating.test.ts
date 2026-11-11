// 發布頁的找座位：docs/spec/permissions.md PRM-R30（比對已入座與工作人員桌的人的顯示名稱，包含關鍵字就符合；去掉前後空白、英文不分大小寫；
// 不比對分機、部門、組別與單位／頭銜；關鍵字空白時沒有結果；未入座的人不在資料裡）、PRM-R31（「{顯示名稱}：{桌號} 桌」，工作人員是
// 「{顯示名稱}：工作人員桌」；依 A1～A15、B1～B15、工作人員桌的順序，同一桌依名單順序）、PRM-R32（結果中顯示名稱完全相同時加「（{部門}）」，
// 外部貴賓寫「（貴賓）」；沒有重複的不加）、PRM-R33（找不到「{關鍵字}」。）、第 4.3 節文案；PRM-AC27～AC31；
// 待確認 PRM-Q01（已報名但未入座的人搜尋自己：目前假設和找不到一樣）。
// docs/architecture.md 第 11.5 節：發布頁的資料是 PublishedSeating（每桌 id、noteName、departmentLabel、people[{ displayName, group }]，
// group 是部門，外部貴賓是「貴賓」），搜尋、同名區分與桌次標示都在前端用這份資料計算。
// 桌號（D-019）：資料用位置編號（1 = B1、2 = A1、3 = B4、7 = B2、16 = B15、17 = A3、30 = A13），工作人員桌是 0。
// D-027：每一桌多一個 position（所在位置 1–30，工作人員桌 null），桌號照所在的位置；這裡沒有特別寫的桌 position = id。
// 發布頁的資料只有場上的桌與工作人員桌，暫存的桌與桌上的人、「未放桌」的位置都不在裡面（PRM-R24、PRM-R30、PRM-AC45）。
//
// 假設的介面（src/domain/published-seating.ts，純函式）：
//   export function toPublishedTables(state: AppState): PublishedTable[];
//     src/contracts/permissions.ts 的 PublishedTable：{ id, position, noteName, departmentLabel, people[{ displayName, group }] }；
//     只回傳場上的桌與工作人員桌（暫存的桌不回傳），名單依桌內順序。
//   export function searchPublishedSeats(
//     tables: readonly { id: number; position: number | null; people: readonly { displayName: string; group: string }[] }[],
//     keyword: string,
//   ): { tableId: number; text: string }[];
//     依 PRM-R30～R32 回傳每一位符合的人（text 是畫面上那一行的文字，桌號照 position），順序同 PRM-R31；關鍵字空白時回空陣列。
//   export function seatNotFoundMessage(keyword: string): string;   // 「找不到「{關鍵字}」。」
import { describe, expect, it } from 'vitest';
import type { AppState } from '@/contracts/entities';
import { searchPublishedSeats, seatNotFoundMessage, toPublishedTables } from '@/domain/published-seating';
import {
  allTables,
  asDependent,
  asEmployee,
  asGuest,
  employee,
  normalTable,
  stagedTable,
  updateTable,
  withoutPositions,
} from '../../helpers/seating-fixtures';

type Person = { displayName: string; group: string };
type Table = { id: number; position: number | null; noteName: string | null; departmentLabel: string; people: Person[] };

const STAFF = 0;
const B1 = 1;
const A1 = 2;
const B4 = 3;
const B2 = 7;
const B15 = 16;
const A3 = 17;
const A13 = 30;

const person = (displayName: string, group: string): Person => ({ displayName, group });
/** 部門標示由伺服器算好（domain/display.ts），搜尋不用它；這裡給一個合理的值。position 預設和 id 相同（工作人員桌是 null） */
const table = (id: number, people: Person[], noteName: string | null = null, position: number | null = id === 0 ? null : id): Table => ({
  id,
  position,
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

describe('D-027 桌號照所在的位置（SEAT-R04、PRM-R31）', () => {
  it('B4 那一桌（id 3）搬到 B2 的位置（7）：「王小明：B2 桌」', () => {
    const tables = [table(3, [person('王小明', '研發一部')], null, 7), table(STAFF, [])];
    expect(searchPublishedSeats(tables, '王小明')).toEqual([{ tableId: 3, text: '王小明：B2 桌' }]);
  });

  it('新增的桌（id 31）在 A3：「陳大文：A3 桌」；結果帶著桌子的 id', () => {
    const tables = [table(31, [person('陳大文', '業務部')], null, A3), table(STAFF, [])];
    expect(searchPublishedSeats(tables, '陳大文')).toEqual([{ tableId: 31, text: '陳大文：A3 桌' }]);
  });

  it('結果依所在位置的清單順序（A1～A15、B1～B15），不是依桌子的 id', () => {
    // id 1 的桌在 A13（30）、id 30 的桌在 B1（1）
    const tables = [table(1, [person('王甲', '業務部')], null, A13), table(30, [person('王乙', '業務部')], null, B1), table(STAFF, [])];
    expect(texts(tables, '王')).toEqual(['王甲：A13 桌', '王乙：B1 桌']);
  });
});

describe('toPublishedTables：伺服器給發布頁的資料（PRM-R24、PRM-R27、PRM-R30、PRM-AC45、D-027）', () => {
  /**
   * 王小明（研發一部）坐 B4（id 3）；陳大文（業務部）坐暫存區的一桌（id 31）；B8（位置 9）是「未放桌」；
   * 林董（外部貴賓）坐 B2（id 7，「主桌」）；李美華是工作人員
   */
  function state(): AppState {
    const tables = [...withoutPositions(allTables({ 7: '主桌' }), [9]), stagedTable(31, '2026-11-01T08:00:00.000Z', { noteName: '暫放' })];
    return {
      employees: [
        employee(1, { name: '王小明', department: '研發一部', extension: '1234' }),
        employee(2, { name: '陳大文', department: '業務部' }),
        employee(3, { name: '李美華', department: '總務部' }),
      ],
      participants: [
        asEmployee(1, { tableId: 3, seatOrder: 0, vegetarian: true }),
        asDependent(11, 1, { tableId: 3, seatOrder: 1 }),
        asEmployee(2, { tableId: 31, seatOrder: 0 }),
        asGuest(21, { guestName: '林董', tableId: 7, seatOrder: 0 }),
        asEmployee(3, { tableId: 0, seatOrder: 0 }),
      ],
      tables,
    };
  }

  it('只有場上的桌（29 張）與工作人員桌：沒有暫存的桌，也沒有 B8（PRM-AC45）', () => {
    const out = toPublishedTables(state());
    expect(out).toHaveLength(30);
    expect(out.map((t) => t.id)).not.toContain(31);
    expect(out.map((t) => t.position)).not.toContain(9);
    expect(out.filter((t) => t.id === STAFF)).toHaveLength(1);
  });

  it('每一桌多一個 position：場上的桌是所在位置，工作人員桌是 null', () => {
    const out = toPublishedTables(state());
    expect(out.find((t) => t.id === 3)).toEqual({
      id: 3,
      position: 3,
      noteName: null,
      departmentLabel: '研發一部',
      people: [
        { displayName: '王小明', group: '研發一部' },
        { displayName: '王小明_眷屬', group: '研發一部' },
      ],
    });
    expect(out.find((t) => t.id === STAFF)).toMatchObject({ position: null, noteName: null, people: [{ displayName: '李美華', group: '總務部' }] });
    expect(out.find((t) => t.id === 7)).toMatchObject({ position: 7, noteName: '主桌', people: [{ displayName: '林董', group: '貴賓' }] });
  });

  it('暫存的桌上的人不在資料裡：搜尋「陳大文」找不到（PRM-R30、PRM-AC45）', () => {
    const out = toPublishedTables(state());
    expect(JSON.stringify(out)).not.toContain('陳大文');
    expect(JSON.stringify(out)).not.toContain('暫放');
    expect(searchPublishedSeats(out, '陳大文')).toEqual([]);
  });

  it('搬到別的位置的桌：position 是新的位置，搜尋結果用新位置的桌號', () => {
    // id 3 的桌（王小明）搬到 B8（9）
    const s = state();
    s.tables = updateTable(s.tables, 3, { position: 9 });
    const out = toPublishedTables(s);
    expect(out.find((t) => t.id === 3)?.position).toBe(9);
    expect(texts(out, '王小明')).toEqual(['王小明：B8 桌', '王小明_眷屬：B8 桌']);
  });

  it('新增的桌放在位置上：照常出現', () => {
    const s = state();
    s.tables = [...s.tables, normalTable(32, { position: 9, noteName: '新桌' })];
    const out = toPublishedTables(s);
    expect(out.find((t) => t.id === 32)).toMatchObject({ position: 9, noteName: '新桌', departmentLabel: '空桌', people: [] });
  });

  it('不含分機、素食、兒童椅、備註等欄位（PRM-R27）', () => {
    const out = toPublishedTables(state());
    expect(JSON.stringify(out)).not.toContain('1234');
    for (const t of out) {
      expect(Object.keys(t).sort()).toEqual(['departmentLabel', 'id', 'noteName', 'people', 'position']);
      for (const p of t.people) expect(Object.keys(p).sort()).toEqual(['displayName', 'group']);
    }
  });
});
