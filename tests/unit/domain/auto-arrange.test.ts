// 自動排座的排座規則：docs/spec/auto-arrange.md 第 3 節（ARR-R01～ARR-R17；ARR-R17 每桌最多排到 10 位，D-018）與第 5.1 節小型資料的驗收條件
// （ARR-AC01～AC09、AC11～AC16、AC21、AC22）。員工與眷屬一定同桌依 D-009；待確認依 D-008 照目前假設
// （ARR-Q02 一位都沒排進去時座位都不變、ARR-Q03 只排進一桌、ARR-Q05 部門順序、ARR-Q06 只看桌號與空位）。
// 5.2 節的示範資料（ARR-AC19、AC20）在 auto-arrange-2026.test.ts。
//
// 不在這裡：第 2 節的對話框（ARR-AC16 的選項停用、AC17 取消、AC18 手機版面）、Sonner 的文字與「復原」（ARR-AC10、ARR-R13
// 的復原由座位異動 API 的 restore 處理）。Sonner 文字由摘要組成，這裡驗摘要：summary.placed 是 {n}、tableIds 的最小與最大是
// {a}、{b}、left 是 {m}；對話框的「只排未入座的 {n} 位」等於只排未入座時的 placed + left（ARR-R15）。
//
// 受測介面與每次執行都檢查的共同條件見 tests/helpers/auto-arrange-scenario.ts。
// 姓名都是虛構的代號（業1、研1、行1、賓1…），員工名單依加入的先後。
import { describe, expect, it } from 'vitest';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import { ARRANGE_MODES, dep, range, Scenario } from '../../helpers/auto-arrange-scenario';

describe('第 5.1 節小型資料的驗收條件', () => {
  it('ARR-AC01 部門、組別依員工名單第一次出現的先後，沒有組別的排在部門最後，眷屬緊接在員工後面（ARR-R05～R07）', () => {
    const s = new Scenario()
      .addEmployee('業1', '業務部', '二組')
      .addEmployee('業2', '業務部', '一組')
      .addEmployee('業3', '業務部')
      .addEmployee('業4', '業務部', '二組', { dependent: true })
      .addEmployee('研1', '研發部')
      .addEmployee('業5', '業務部', '一組');

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(['業1', '業4', dep('業4'), '業2', '業5', '業3', '研1']);
    expect(o.table(2)).toEqual([]);
    expect(o.summary).toEqual({ placed: 7, tableIds: [1], left: 0 });
  });

  it('ARR-AC02 一個部門排完剩下的空位由後面部門的人併桌：「已把 14 位安排到第 1–2 桌。」（ARR-R05、R07、R10、R14）', () => {
    const s = new Scenario().addGroup('業務部', null, range('業', 1, 7)).addGroup('研發部', null, range('研', 1, 7));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('業', 1, 7), ...range('研', 1, 3)]);
    expect(o.table(2)).toEqual(range('研', 4, 7));
    expect(o.summary).toEqual({ placed: 14, tableIds: [1, 2], left: 0 });
  });

  it('ARR-AC03 一組 12 人超過一桌：拆成 10 人與 2 人，「已把 12 位安排到第 1–2 桌。」（ARR-R09、R14）', () => {
    const s = new Scenario().addGroup('研發部', '前端組', range('研', 1, 12));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(range('研', 1, 10));
    expect(o.table(2)).toEqual(['研11', '研12']);
    expect(o.summary).toEqual({ placed: 12, tableIds: [1, 2], left: 0 });
  });

  it('ARR-AC04 排不進的組先由同部門、再由後面部門排得進的單位填，找不到才拆組（ARR-R08、R09）', () => {
    const s = new Scenario()
      .addGroup('研發部', '前端組', range('研', 1, 12))
      .addGroup('研發部', '後端組', range('後', 1, 3))
      .addGroup('行政部', null, ['行1']);

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(['後1', '後2', '後3', '行1', ...range('研', 1, 6)]);
    expect(o.table(2)).toEqual(range('研', 7, 12));
    expect(o.summary).toEqual({ placed: 16, tableIds: [1, 2], left: 0 });
  });

  it('ARR-AC05 同部門排得進的單位取順序上最近的；同部門沒有才取後面部門的，「已把 17 位安排到第 1–2 桌。」（ARR-R08）', () => {
    const s = new Scenario()
      .addGroup('業務部', '北區組', range('北', 1, 6))
      .addGroup('業務部', '南區組', range('南', 1, 5))
      .addGroup('業務部', '中區組', range('中', 1, 3))
      .addGroup('業務部', '東區組', range('東', 1, 2))
      .addGroup('研發部', null, ['研1']);

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('北', 1, 6), ...range('中', 1, 3), '研1']);
    expect(o.table(2)).toEqual([...range('南', 1, 5), '東1', '東2']);
    expect(o.summary).toEqual({ placed: 17, tableIds: [1, 2], left: 0 });
  });

  it('ARR-AC06 剩 1 個空位：員工與眷屬 2 人的單位排不進，由後面 1 人的單位補，「已把 3 位安排到第 1–2 桌。」（ARR-R05、R06、R08）', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 9))
      .addEmployee('業1', '業務部', null, { dependent: true })
      .addEmployee('業2', '業務部')
      .seat(1, range('行', 1, 9));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('行', 1, 9), '業2']);
    expect(o.position('業2')).toEqual({ tableId: 1, seatOrder: 9 });
    expect(o.table(2)).toEqual(['業1', dep('業1')]);
    expect(o.summary).toEqual({ placed: 3, tableIds: [1, 2], left: 0 });
  });

  it('ARR-AC07 拆點落在員工與眷屬之間、沒有人可以補：員工與眷屬一起到下一桌，第 10 位空著（ARR-R09、R16、R10、D-009）', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 8))
      .addGroup('業務部', '北區組', ['業1', '業2'], ['業2'])
      .seat(1, range('行', 1, 8));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('行', 1, 8), '業1']);
    expect(o.position('業1')).toEqual({ tableId: 1, seatOrder: 8 });
    expect(o.table(1)).toHaveLength(9);
    expect(o.table(2)).toEqual(['業2', dep('業2')]);
    expect(o.summary).toEqual({ placed: 3, tableIds: [1, 2], left: 0 });
  });

  it('ARR-AC08 只排未入座：有備註名稱的桌不用、坐滿的桌跳過、外部貴賓不排，「已把 3 位安排到第 2–4 桌。」（ARR-R01～R03、R09、R14、R15）', () => {
    const s = new Scenario()
      .addGroup('研發部', null, range('研', 1, 8))
      .addGroup('行政部', null, range('行', 1, 10))
      .addGroup('業務部', '北區組', range('業', 1, 3))
      .addGuest('賓1')
      .addGuest('賓2')
      .addGuest('賓3')
      .addGuest('賓4')
      .note(1, '主桌')
      .seat(1, ['賓1', '賓2', '賓3'])
      .seat(2, range('研', 1, 8))
      .seat(3, range('行', 1, 10));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(['賓1', '賓2', '賓3']);
    expect(o.table(2)).toEqual([...range('研', 1, 8), '業1', '業2']);
    expect(o.table(3)).toEqual(range('行', 1, 10));
    expect(o.table(4)).toEqual(['業3']);
    expect(o.position('賓4')).toEqual({ tableId: null, seatOrder: null });
    expect(o.changedNames()).toEqual(['業1', '業2', '業3']);
    // 對話框「只排未入座的 3 位」：未入座的員工與眷屬，不含外部貴賓賓4（ARR-R15）
    expect(o.summary.placed + o.summary.left).toBe(3);
    expect(o.summary).toEqual({ placed: 3, tableIds: [2, 4], left: 0 });
  });

  it('ARR-AC09 清空後重排：有備註名稱的桌與桌上的人不動，可用桌上的外部貴賓回到未入座，「已把 11 位安排到第 2–4 桌。」（ARR-R02、R04、R05、R12、R14）', () => {
    const s = new Scenario()
      .addGroup('業務部', null, range('業', 1, 3))
      .addGroup('研發部', null, range('研', 1, 10))
      .addGuest('賓1')
      .addGuest('賓2')
      .note(1, '主桌')
      .seat(1, ['業1', '業2', '賓1'])
      .seat(2, ['賓2', ...range('研', 1, 9)])
      .note(3, '供應商')
      .seat(4, ['業3']);

    const o = s.run('rebuild');

    expect(o.table(1)).toEqual(['業1', '業2', '賓1']);
    expect(o.table(2)).toEqual(['業3', ...range('研', 1, 9)]);
    expect(o.table(3)).toEqual([]);
    expect(o.table(4)).toEqual(['研10']);
    expect(o.position('賓2')).toEqual({ tableId: null, seatOrder: null });
    expect(o.summary).toEqual({ placed: 11, tableIds: [2, 4], left: 0 });
    // 研1–研9 重排後仍在第 2 桌的同一個位子，不列在 changes；回到未入座的賓2 要列（復原時才回得去，ARR-R13、ARR-AC10）
    expect(o.changedNames()).toEqual(['業3', '研10', '賓2']);
    expect(o.changes.find((c) => c.participantId === s.id('賓2'))).toEqual({
      participantId: s.id('賓2'),
      tableId: null,
      seatOrder: null,
    });
  });

  it('ARR-AC11 工作人員不排，工作人員的眷屬照常排；外部貴賓不排，「已把 2 位安排到第 1–2 桌。」（ARR-R01、R05、R06、R15）', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 9))
      .addEmployee('業1', '業務部', null, { dependent: true })
      .addEmployee('業2', '業務部')
      .addGuest('賓1')
      .seat(1, range('行', 1, 9))
      .staff(['業1']);

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('行', 1, 9), dep('業1')]);
    expect(o.table(2)).toEqual(['業2']);
    expect(o.position('業1')).toEqual({ tableId: STAFF_TABLE_ID, seatOrder: 0 });
    expect(o.position('賓1')).toEqual({ tableId: null, seatOrder: null });
    // 對話框「只排未入座的 2 位」（ARR-R15）
    expect(o.summary.placed + o.summary.left).toBe(2);
    expect(o.summary).toEqual({ placed: 2, tableIds: [1, 2], left: 0 });
  });

  it('ARR-AC12 ARR-AC11 的資料清空後重排：第 1 桌的人一起重排，工作人員與外部貴賓不動，「已把 11 位安排到第 1–2 桌。」（ARR-R01、R04）', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 9))
      .addEmployee('業1', '業務部', null, { dependent: true })
      .addEmployee('業2', '業務部')
      .addGuest('賓1')
      .seat(1, range('行', 1, 9))
      .staff(['業1']);

    const o = s.run('rebuild');

    expect(o.table(1)).toEqual([...range('行', 1, 9), dep('業1')]);
    expect(o.table(2)).toEqual(['業2']);
    expect(o.position('業1')).toEqual({ tableId: STAFF_TABLE_ID, seatOrder: 0 });
    expect(o.position('賓1')).toEqual({ tableId: null, seatOrder: null });
    expect(o.summary).toEqual({ placed: 11, tableIds: [1, 2], left: 0 });
    expect(o.changedNames()).toEqual([dep('業1'), '業2']);
  });

  it('ARR-AC13 空位不夠：能排多少排多少，「已把 3 位安排到第 29–30 桌，還有 4 位排不下，留在未入座。」（ARR-R09、R11、R14）', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 17))
      .addGroup('業務部', '北區組', range('業', 1, 3))
      .addGroup('研發部', '前端組', range('研', 1, 4));
    for (let t = 1; t <= 28; t++) s.note(t, `保留${t}`);
    s.seat(29, range('行', 1, 8)).seat(30, range('行', 9, 17));

    const o = s.run('unseatedOnly');

    expect(o.table(29)).toEqual([...range('行', 1, 8), '業1', '業2']);
    expect(o.table(30)).toEqual([...range('行', 9, 17), '業3']);
    expect(o.unseated()).toEqual(range('研', 1, 4));
    expect(o.summary).toEqual({ placed: 3, tableIds: [29, 30], left: 4 });
  });

  it('ARR-AC14 30 桌都坐滿：座位都不變，一位都沒排進去（ARR-R11、ARR-Q02）', () => {
    const s = new Scenario().addGroup('行政部', null, range('行', 1, 300)).addEmployee('業1', '業務部');
    for (let t = 1; t <= 30; t++) s.seat(t, range('行', t * 10 - 9, t * 10));

    const o = s.run('unseatedOnly');

    expect(o.changes).toEqual([]);
    expect(o.position('業1')).toEqual({ tableId: null, seatOrder: null });
    expect(o.summary).toEqual({ placed: 0, tableIds: [], left: 1 });
  });

  it('ARR-AC15 只排進一桌：摘要只有一個桌號，Sonner 寫「第 1 桌」（ARR-R14、ARR-Q03）', () => {
    const s = new Scenario()
      .addEmployee('業1', '業務部', '二組')
      .addEmployee('業2', '業務部', '一組')
      .addEmployee('業3', '業務部')
      .addEmployee('業4', '業務部', '二組', { dependent: true })
      .addEmployee('研1', '研發部')
      .addEmployee('業5', '業務部', '一組');

    const o = s.run('unseatedOnly');

    expect(o.summary).toEqual({ placed: 7, tableIds: [1], left: 0 });
  });

  it('ARR-AC16 未入座的只有外部貴賓：只排未入座的候選人是 0 位、座位都不變；清空後重排仍可以排（ARR-R15）', () => {
    const s = new Scenario()
      .addGroup('業務部', null, ['業1', '業2', '業3'])
      .addEmployee('業4', '業務部', null, { dependent: true })
      .addGuest('賓1')
      .seat(3, ['業2', '業3'])
      .seat(5, ['業4', dep('業4')])
      .staff(['業1']);

    const unseatedOnly = s.run('unseatedOnly');
    expect(unseatedOnly.changes).toEqual([]);
    expect(unseatedOnly.summary).toEqual({ placed: 0, tableIds: [], left: 0 });

    const rebuild = s.run('rebuild');
    expect(rebuild.table(1)).toEqual(['業2', '業3', '業4', dep('業4')]);
    expect(rebuild.table(3)).toEqual([]);
    expect(rebuild.table(5)).toEqual([]);
    expect(rebuild.position('業1')).toEqual({ tableId: STAFF_TABLE_ID, seatOrder: 0 });
    expect(rebuild.position('賓1')).toEqual({ tableId: null, seatOrder: null });
    expect(rebuild.summary).toEqual({ placed: 4, tableIds: [1], left: 0 });
  });

  it('ARR-AC21 拆點落在員工與眷屬之間、有人可以補：空位先從同部門後面的組找單獨的員工（ARR-R08、R09、R16、D-009）', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 8))
      .addGroup('業務部', '北區組', ['業1', '業2'], ['業2'])
      .addGroup('業務部', '南區組', ['南1', '南2', '南3'], ['南1'])
      .addGroup('研發部', '前端組', range('研', 1, 3))
      .seat(1, range('行', 1, 8));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('行', 1, 8), '業1', '南2']);
    expect(o.table(2)).toEqual(['業2', dep('業2'), '南1', dep('南1'), '南3', '研1', '研2', '研3']);
    expect(o.summary).toEqual({ placed: 10, tableIds: [1, 2], left: 0 });
  });

  it('ARR-AC22 沒有組別的員工與眷屬遇到只剩 1 個空位：兩人一起到下一桌，空位由後面部門的員工補（ARR-R06、R09、R16）', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 9))
      .addEmployee('業1', '業務部', null, { dependent: true })
      .addGroup('研發部', '前端組', ['研1', '研2'])
      .seat(1, range('行', 1, 9));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('行', 1, 9), '研1']);
    expect(o.table(2)).toEqual(['業1', dep('業1'), '研2']);
    expect(o.summary).toEqual({ placed: 4, tableIds: [1, 2], left: 0 });
  });
});

describe('ARR-R01 只排員工與眷屬', () => {
  it.each(ARRANGE_MODES)('%s：外部貴賓一律不排，未入座的留在未入座', (mode) => {
    const s = new Scenario().addGroup('業務部', null, ['業1', '業2']).addGuest('賓1').addGuest('賓2');

    const o = s.run(mode);

    expect(o.table(1)).toEqual(['業1', '業2']);
    expect(o.unseated()).toEqual(['賓1', '賓2']);
  });

  it.each(ARRANGE_MODES)('%s：工作人員一律不排，留在工作人員桌，順序不變', (mode) => {
    const s = new Scenario().addGroup('業務部', null, ['業1', '業2', '業3', '業4']).staff(['業3', '業1']);

    const o = s.run(mode);

    expect(o.table(STAFF_TABLE_ID)).toEqual(['業3', '業1']);
    expect(o.table(1)).toEqual(['業2', '業4']);
  });
});

describe('ARR-R02 可用的桌', () => {
  it('有備註名稱的桌即使是空桌也不用，依桌號由小到大使用沒有備註名稱的桌', () => {
    const s = new Scenario().addGroup('業務部', null, range('業', 1, 12)).note(1, '主桌').note(2, '主桌').note(4, '供應商');

    const o = s.run('unseatedOnly');

    expect(o.table(3)).toEqual(range('業', 1, 10));
    expect(o.table(5)).toEqual(['業11', '業12']);
    for (const t of [1, 2, 4]) expect(o.table(t)).toEqual([]);
    expect(o.summary).toEqual({ placed: 12, tableIds: [3, 5], left: 0 });
  });

  it('工作人員桌不是可用的桌：30 桌都有備註名稱時，即使工作人員桌有空位也不排', () => {
    const s = new Scenario().addGroup('業務部', null, ['業1', '業2']).staff(['業1']);
    for (let t = 1; t <= 30; t++) s.note(t, `保留${t}`);

    const o = s.run('unseatedOnly');

    expect(o.table(STAFF_TABLE_ID)).toEqual(['業1']);
    expect(o.unseated()).toEqual(['業2']);
    expect(o.summary).toEqual({ placed: 0, tableIds: [], left: 1 });
  });

  it.each(ARRANGE_MODES)('%s：傳入的員工、參與人員、桌次陣列順序不影響結果（員工名單依 sortOrder、桌次依桌號）', (mode) => {
    const build = () =>
      new Scenario()
        .addGroup('業務部', '北區組', range('北', 1, 6))
        .addGroup('業務部', '南區組', range('南', 1, 5))
        .addGroup('業務部', '中區組', range('中', 1, 3))
        .addEmployee('東1', '業務部', '東區組', { dependent: true })
        .addGroup('研發部', null, ['研1', '研2'])
        .note(2, '主桌');

    const normal = build().run(mode);
    const reversed = build().run(mode, { reversedInput: true });

    expect(reversed.changes.slice().sort((a, b) => a.participantId - b.participantId)).toEqual(
      normal.changes.slice().sort((a, b) => a.participantId - b.participantId),
    );
    expect(reversed.summary).toEqual(normal.summary);
    expect(normal.table(1)).toEqual([...range('北', 1, 6), ...range('中', 1, 3), '研1']);
  });
});

describe('ARR-R03 只排未入座', () => {
  it('已入座的人都不動；新排的人接在該桌原本的人後面', () => {
    const s = new Scenario()
      .addGroup('行政部', null, ['行1', '行2', '行3'])
      .addGroup('業務部', null, ['業1', '業2'])
      .seat(1, ['行3', '行1', '行2']);

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(['行3', '行1', '行2', '業1', '業2']);
    expect(o.position('業1')).toEqual({ tableId: 1, seatOrder: 3 });
    expect(o.position('業2')).toEqual({ tableId: 1, seatOrder: 4 });
    expect(o.changedNames()).toEqual(['業1', '業2']);
  });

  it('從桌號最小、還有空位的可用桌開始填，一桌填滿再下一桌', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 19))
      .addGroup('業務部', null, ['業1', '業2', '業3'])
      .seat(1, range('行', 1, 10))
      .seat(2, range('行', 11, 19));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(range('行', 1, 10));
    expect(o.table(2)).toEqual([...range('行', 11, 19), '業1']);
    expect(o.table(3)).toEqual(['業2', '業3']);
    expect(o.summary).toEqual({ placed: 3, tableIds: [2, 3], left: 0 });
  });

  it('不靠近已入座的同組同事或所屬員工，只看桌號與空位（ARR-Q06 的目前假設）', () => {
    const s = new Scenario()
      .addGroup('業務部', '北區組', ['北1', '北2'], ['北1'])
      .seat(5, ['北1']);

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([dep('北1'), '北2']);
    expect(o.table(5)).toEqual(['北1']);
  });
});

describe('ARR-R04 清空後重排', () => {
  it('先清空所有可用的桌，再依規則重新排列，原本的座位順序不保留', () => {
    const s = new Scenario()
      .addGroup('業務部', null, ['業1'])
      .addGroup('研發部', null, ['研1', '研2'])
      .seat(5, ['研2', '研1'])
      .seat(9, ['業1']);

    const o = s.run('rebuild');

    expect(o.table(1)).toEqual(['業1', '研1', '研2']);
    expect(o.table(5)).toEqual([]);
    expect(o.table(9)).toEqual([]);
    expect(o.summary).toEqual({ placed: 3, tableIds: [1], left: 0 });
  });

  it('候選人是可用桌上原本的員工與眷屬，加上未入座的員工與眷屬', () => {
    const s = new Scenario()
      .addEmployee('業1', '業務部', null, { dependent: true })
      .addGroup('業務部', null, ['業2', '業3'])
      .seat(7, ['業3', dep('業1')]);

    const o = s.run('rebuild');

    expect(o.table(1)).toEqual(['業1', dep('業1'), '業2', '業3']);
    expect(o.table(7)).toEqual([]);
    expect(o.summary).toEqual({ placed: 4, tableIds: [1], left: 0 });
  });

  it('原本坐在可用桌的外部貴賓回到未入座，不會被排回去；有備註名稱的桌上的外部貴賓不動', () => {
    const s = new Scenario()
      .addGroup('業務部', null, ['業1'])
      .addGuest('賓1')
      .addGuest('賓2')
      .note(1, '主桌')
      .seat(1, ['賓1'])
      .seat(3, ['賓2', '業1']);

    const o = s.run('rebuild');

    expect(o.table(1)).toEqual(['賓1']);
    expect(o.table(2)).toEqual(['業1']);
    expect(o.table(3)).toEqual([]);
    expect(o.unseated()).toEqual(['賓2']);
    expect(o.changedNames()).toEqual(['業1', '賓2']);
  });

  it('有備註名稱的桌上的員工不是候選人，名單與座位順序都不變', () => {
    const s = new Scenario()
      .addGroup('業務部', null, ['業1', '業2', '業3'])
      .note(4, '主桌')
      .seat(4, ['業3', '業1']);

    const o = s.run('rebuild');

    expect(o.table(4)).toEqual(['業3', '業1']);
    expect(o.table(1)).toEqual(['業2']);
    expect(o.summary).toEqual({ placed: 1, tableIds: [1], left: 0 });
  });

  it('空位不夠時，原本坐在可用桌的人也可能排不下，回到未入座（ARR-R11）', () => {
    const s = new Scenario().addGroup('業務部', null, ['業1']).addGroup('研發部', null, range('研', 1, 10));
    for (let t = 1; t <= 29; t++) s.note(t, `保留${t}`);
    s.seat(30, range('研', 1, 10));

    const o = s.run('rebuild');

    expect(o.table(30)).toEqual(['業1', ...range('研', 1, 9)]);
    expect(o.position('研10')).toEqual({ tableId: null, seatOrder: null });
    expect(o.summary).toEqual({ placed: 10, tableIds: [30], left: 1 });
  });
});

describe('ARR-R05 排列順序', () => {
  it('部門依員工名單中第一次出現的先後；部門的人在名單上不連續也排在一起（ARR-Q05 的目前假設）', () => {
    const s = new Scenario()
      .addEmployee('業1', '業務部')
      .addEmployee('研1', '研發部')
      .addEmployee('業2', '業務部')
      .addEmployee('行1', '行政部')
      .addEmployee('研2', '研發部');

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(['業1', '業2', '研1', '研2', '行1']);
  });

  it('部門與組別的先後看整份員工名單，含沒有報名的員工', () => {
    const s = new Scenario()
      .addEmployee('研0', '研發部', '後端組', { registered: false })
      .addEmployee('業1', '業務部')
      .addEmployee('研1', '研發部', '前端組')
      .addEmployee('研2', '研發部', '後端組');

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(['研2', '研1', '業1']);
  });

  it('同一組內依員工名單順序；組別依同部門內第一次出現的先後；沒有組別的人排在部門最後', () => {
    const s = new Scenario()
      .addEmployee('業1', '業務部')
      .addEmployee('業2', '業務部', '南區組')
      .addEmployee('業3', '業務部', '北區組')
      .addEmployee('業4', '業務部')
      .addEmployee('業5', '業務部', '南區組')
      .addEmployee('業6', '業務部', '北區組');

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(['業2', '業5', '業3', '業6', '業1', '業4']);
  });

  it('眷屬的部門與組別跟著所屬員工，人數算在該組', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 7))
      .addGroup('業務部', '北區組', ['北1', '北2', '北3'], ['北2'])
      .addGroup('研發部', null, ['研1'])
      .seat(1, range('行', 1, 7))
      .seat(9, ['北2']);

    const o = s.run('unseatedOnly');

    // 北區組的候選人是北1、北2_眷屬、北3 共 3 人，剛好填滿第 1 桌剩下的 3 個空位
    expect(o.table(1)).toEqual([...range('行', 1, 7), '北1', dep('北2'), '北3']);
    expect(o.table(2)).toEqual(['研1']);
  });

  it('所屬員工已入座（只排未入座）：眷屬仍排在所屬員工原本的位置', () => {
    const s = new Scenario()
      .addEmployee('業1', '業務部')
      .addEmployee('業2', '業務部', null, { dependent: true })
      .addEmployee('業3', '業務部')
      .seat(6, ['業2']);

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(['業1', dep('業2'), '業3']);
    expect(o.table(6)).toEqual(['業2']);
  });

  it('所屬員工坐在有備註名稱的桌（清空後重排）：眷屬仍排在所屬員工原本的位置', () => {
    const s = new Scenario()
      .addEmployee('業1', '業務部')
      .addEmployee('業2', '業務部', null, { dependent: true })
      .addEmployee('業3', '業務部')
      .note(1, '主桌')
      .seat(1, ['業2'])
      .seat(3, ['業3', dep('業2')]);

    const o = s.run('rebuild');

    expect(o.table(1)).toEqual(['業2']);
    expect(o.table(2)).toEqual(['業1', dep('業2'), '業3']);
    expect(o.table(3)).toEqual([]);
  });
});

describe('ARR-R06 排座單位', () => {
  it('同部門、同組別的候選人含眷屬是一個單位，人數含眷屬', () => {
    const s = new Scenario()
      .addGroup('行政部', null, ['行1'])
      .addGroup('業務部', '北區組', range('北', 1, 9), ['北9'])
      .addGroup('研發部', null, ['研1'])
      .seat(1, ['行1']);

    const o = s.run('unseatedOnly');

    // 北區組 10 人（9 位員工＋1 位眷屬）超過 9 個空位：先由研1 填，再拆北區組
    expect(o.table(1)).toEqual(['行1', '研1', ...range('北', 1, 8)]);
    expect(o.table(2)).toEqual(['北9', dep('北9')]);
  });

  it('沒有組別的員工連同他的眷屬各自是一個單位，可以分別拿去填空位', () => {
    const s = new Scenario()
      .addGroup('業務部', '北區組', range('北', 1, 6))
      .addGroup('業務部', '南區組', range('南', 1, 5))
      .addEmployee('業A', '業務部')
      .addEmployee('業B', '業務部', null, { dependent: true })
      .addEmployee('業C', '業務部')
      .addEmployee('業D', '業務部');

    const o = s.run('unseatedOnly');

    // 第 1 桌剩 4 位時南區組 5 人排不進；沒有組別的人不是一個 5 人的單位，而是 1、2、1、1 人的單位
    expect(o.table(1)).toEqual([...range('北', 1, 6), '業A', '業B', dep('業B'), '業C']);
    expect(o.table(2)).toEqual([...range('南', 1, 5), '業D']);
  });
});

describe('ARR-R07、ARR-R08 填桌', () => {
  it('排不進時取順序上最近、而且排得進的單位，跳過排不進的；被拿去填的單位移走，其他單位順序不變', () => {
    const s = new Scenario()
      .addGroup('業務部', 'A組', range('甲', 1, 6))
      .addGroup('業務部', 'B組', range('乙', 1, 5))
      .addGroup('業務部', 'C組', range('丙', 1, 5))
      .addGroup('業務部', 'D組', range('丁', 1, 2))
      .addGroup('業務部', 'E組', range('戊', 1, 2));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('甲', 1, 6), '丁1', '丁2', '戊1', '戊2']);
    expect(o.table(2)).toEqual([...range('乙', 1, 5), ...range('丙', 1, 5)]);
  });

  it('同部門找不到排得進的單位時，從後面部門取順序上最近的', () => {
    const s = new Scenario()
      .addGroup('業務部', '北區組', range('北', 1, 7))
      .addGroup('業務部', '南區組', range('南', 1, 4))
      .addGroup('研發部', '前端組', range('研', 1, 4))
      .addGroup('研發部', '後端組', range('後', 1, 2))
      .addGroup('行政部', null, ['行1']);

    const o = s.run('unseatedOnly');

    // 北區組 7 → 剩 3；南區組 4 排不進，同部門沒有別的單位；後面部門最近排得進的是後端組 2 人，再來是行1
    expect(o.table(1)).toEqual([...range('北', 1, 7), '後1', '後2', '行1']);
    expect(o.table(2)).toEqual([...range('南', 1, 4), ...range('研', 1, 4)]);
  });
});

describe('ARR-R09 拆組', () => {
  it('一組超過兩桌：依序拆到下一桌，其餘的人仍是最前面的單位', () => {
    const s = new Scenario().addGroup('研發部', '前端組', range('研', 1, 25));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(range('研', 1, 10));
    expect(o.table(2)).toEqual(range('研', 11, 20));
    expect(o.table(3)).toEqual(range('研', 21, 25));
    expect(o.summary).toEqual({ placed: 25, tableIds: [1, 2, 3], left: 0 });
  });

  it('只排未入座：拆開後其餘的人到下一張還有空位的可用桌，接在原本的人後面', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 15))
      .addGroup('業務部', '北區組', range('北', 1, 5))
      .seat(1, range('行', 1, 8))
      .seat(2, range('行', 9, 15));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('行', 1, 8), '北1', '北2']);
    expect(o.table(2)).toEqual([...range('行', 9, 15), '北3', '北4', '北5']);
  });

  it('清空後重排：其餘的人坐在下一桌最前面', () => {
    const s = new Scenario()
      .addGroup('研發部', '前端組', range('研', 1, 12))
      .seat(8, ['研12', '研11'])
      .seat(9, range('研', 1, 10));

    const o = s.run('rebuild');

    expect(o.table(1)).toEqual(range('研', 1, 10));
    expect(o.table(2)).toEqual(['研11', '研12']);
    expect(o.position('研11')).toEqual({ tableId: 2, seatOrder: 0 });
  });

  it('照空位數取到的最後一位是眷屬時，照空位數拆（員工與眷屬已經同桌）', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 8))
      .addGroup('業務部', '北區組', ['北1', '北2'], ['北1'])
      .seat(1, range('行', 1, 8));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('行', 1, 8), '北1', dep('北1')]);
    expect(o.table(2)).toEqual(['北2']);
  });

  it('拆點落在員工與眷屬之間：員工不排進這一桌，和眷屬一起排到下一桌最前面（D-009）', () => {
    const s = new Scenario().addGroup('研發部', '前端組', range('研', 1, 11), ['研10']);

    const o = s.run('rebuild');

    // 前端組 12 人；第 1 桌照空位取 10 位，第 10 位是帶眷屬的研10 → 研10 和眷屬移到第 2 桌最前面；
    // 後面沒有其他單位可以補，第 1 桌留 1 個空位（ARR-R16）
    expect(o.table(1)).toEqual(range('研', 1, 9));
    expect(o.table(2)).toEqual(['研10', dep('研10'), '研11']);
    expect(o.position('研10')).toEqual({ tableId: 2, seatOrder: 0 });
    expect(o.summary).toEqual({ placed: 12, tableIds: [1, 2], left: 0 });
  });

  it('拆點前一桌找不到單獨的員工、下一桌又遇到拆點：每一桌各留 1 個空位（ARR-R09、R16、R10）', () => {
    const s = new Scenario()
      .addGroup('研發部', '前端組', range('研', 1, 11), ['研10'])
      .addGroup('研發部', '後端組', range('後', 1, 6), range('後', 1, 6));

    const o = s.run('rebuild');

    // 第 1 桌：前端組 12 人、後端組 12 人都排不進 10 個空位 → 拆前端組，研10 帶眷屬移走；後端組每位都帶眷屬，沒人可補
    // 第 2 桌：研10、眷屬、研11 共 3 人 → 剩 7 位；後端組 12 人排不進 → 拆，第 7 位是帶眷屬的後4 → 後4 移走；沒人可補
    expect(o.table(1)).toEqual(range('研', 1, 9));
    expect(o.table(2)).toEqual(['研10', dep('研10'), '研11', '後1', dep('後1'), '後2', dep('後2'), '後3', dep('後3')]);
    expect(o.table(3)).toEqual(['後4', dep('後4'), '後5', dep('後5'), '後6', dep('後6')]);
    expect(o.summary).toEqual({ placed: 24, tableIds: [1, 2, 3], left: 0 });
  });
});

describe('ARR-R16 拆點空出的位子補位', () => {
  it('所屬眷屬已入座的員工算單獨的員工，可以拿來補位', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 8))
      .addGroup('業務部', '北區組', ['業1', '業2'], ['業2'])
      .addGroup('業務部', '南區組', ['南1', '南2', '南3'], ['南1'])
      .seat(1, range('行', 1, 8))
      .seat(9, [dep('南1')]);

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('行', 1, 8), '業1', '南1']);
    expect(o.table(2)).toEqual(['業2', dep('業2'), '南2', '南3']);
  });

  it('被拆的那一組剩下的人不在找的範圍內：即使其中有單獨的員工，位子仍留空', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 8))
      .addGroup('業務部', '北區組', ['業1', '業2', '業3'], ['業2'])
      .seat(1, range('行', 1, 8));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('行', 1, 8), '業1']);
    expect(o.table(2)).toEqual(['業2', dep('業2'), '業3']);
  });

  it('後面的單位只有帶眷屬的員工時，位子留空，接著處理下一張可用的桌', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 8))
      .addGroup('業務部', '北區組', ['業1', '業2'], ['業2'])
      .addGroup('研發部', '前端組', ['研1', '研2'], ['研1', '研2'])
      .seat(1, range('行', 1, 8));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('行', 1, 8), '業1']);
    expect(o.table(2)).toEqual(['業2', dep('業2'), '研1', dep('研1'), '研2', dep('研2')]);
    expect(o.summary).toEqual({ placed: 7, tableIds: [1, 2], left: 0 });
  });

  it('同部門找不到單獨的員工時，依順序從後面部門的單位找，單位內取第一位符合的人；那個單位其他人順序不變', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 8))
      .addGroup('業務部', '北區組', ['業1', '業2'], ['業2'])
      .addGroup('研發部', '前端組', ['研1', '研2'], ['研1', '研2'])
      .addGroup('品保部', '檢驗組', ['品1', '品2', '品3'], ['品1'])
      .seat(1, range('行', 1, 8));

    const o = s.run('unseatedOnly');

    // 第 1 桌剩 2 位：北區組 3 人、前端組 4 人、檢驗組 4 人都排不進 → 拆北區組，業2 帶眷屬移走；
    // 業務部後面沒有單位；前端組每位都帶眷屬；檢驗組的品1 帶眷屬，第一位單獨的員工是品2
    expect(o.table(1)).toEqual([...range('行', 1, 8), '業1', '品2']);
    expect(o.table(2)).toEqual(['業2', dep('業2'), '研1', dep('研1'), '研2', dep('研2'), '品1', dep('品1'), '品3']);
  });
});

describe('ARR-R11 空位不夠', () => {
  it('可用的桌都坐滿後，還沒排到的人（含拆開後剩下的人）留在未入座', () => {
    const s = new Scenario().addGroup('研發部', '前端組', range('研', 1, 14));
    for (let t = 2; t <= 30; t++) s.note(t, `保留${t}`);

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(range('研', 1, 10));
    expect(o.unseated()).toEqual(range('研', 11, 14));
    expect(o.summary).toEqual({ placed: 10, tableIds: [1], left: 4 });
  });

  it('員工排不下時，他的眷屬也不排（D-009）', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 9))
      .addEmployee('業1', '業務部', null, { dependent: true })
      .seat(1, range('行', 1, 9));
    for (let t = 2; t <= 30; t++) s.note(t, `保留${t}`);

    const o = s.run('unseatedOnly');

    expect(o.changes).toEqual([]);
    expect(o.unseated()).toEqual(['業1', dep('業1')]);
    expect(o.summary).toEqual({ placed: 0, tableIds: [], left: 2 });
  });
});

describe('ARR-R12 不改備註名稱與有備註名稱的桌', () => {
  it.each(ARRANGE_MODES)('%s：有備註名稱的桌的名單與座位順序都不變，工作人員桌不變', (mode) => {
    const s = new Scenario()
      .addGroup('業務部', null, range('業', 1, 6))
      .addGuest('賓1')
      .note(1, '主桌')
      .seat(1, ['業2', '賓1', '業1'])
      .note(2, '供應商')
      .staff(['業6', '業5']);

    const o = s.run(mode);

    expect(o.table(1)).toEqual(['業2', '賓1', '業1']);
    expect(o.table(2)).toEqual([]);
    expect(o.table(STAFF_TABLE_ID)).toEqual(['業6', '業5']);
    expect(o.table(3)).toEqual(['業3', '業4']);
  });
});

describe('ARR-Q02 一位都沒排進去時（目前假設：座位都不變，清空後重排也不清空）', () => {
  it('沒有任何候選人：清空後重排不清空，可用桌上的外部貴賓不動', () => {
    const s = new Scenario().addGroup('業務部', null, ['業1']).addGuest('賓1').addGuest('賓2').seat(3, ['賓1', '賓2']).staff(['業1']);

    const o = s.run('rebuild');

    expect(o.changes).toEqual([]);
    expect(o.table(3)).toEqual(['賓1', '賓2']);
    expect(o.summary).toEqual({ placed: 0, tableIds: [], left: 0 });
  });

  it('沒有可用的桌：清空後重排也不動，候選人都排不下', () => {
    const s = new Scenario().addGroup('業務部', null, ['業1', '業2']).note(1, '主桌').seat(1, ['業1']);
    for (let t = 2; t <= 30; t++) s.note(t, `保留${t}`);

    const o = s.run('rebuild');

    expect(o.changes).toEqual([]);
    expect(o.summary).toEqual({ placed: 0, tableIds: [], left: 1 });
  });

  it('只排未入座、沒有未入座的員工與眷屬：座位都不變', () => {
    const s = new Scenario().addGroup('業務部', null, ['業1', '業2']).seat(4, ['業2', '業1']);

    const o = s.run('unseatedOnly');

    expect(o.changes).toEqual([]);
    expect(o.summary).toEqual({ placed: 0, tableIds: [], left: 0 });
  });
});

// D-018：承辦人拖移或「加入人員」可以讓一桌有 11、12 位（seating.md SEAT-R02、SEAT-R88），自動排座仍只排到 10 位。
describe('ARR-R17 自動排座每桌最多只排到 10 位', () => {
  it('只排未入座：沒有備註名稱的第 1 桌已有 11 位，算沒有空位，原本的人不動；新排的人從第 2 桌開始', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 11))
      .addGroup('業務部', null, ['業1', '業2'])
      .seat(1, range('行', 1, 11));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(range('行', 1, 11));
    expect(o.table(2)).toEqual(['業1', '業2']);
    expect(o.changedNames()).toEqual(['業1', '業2']);
    expect(o.summary).toEqual({ placed: 2, tableIds: [2], left: 0 });
  });

  it('只排未入座：第 1 桌 12 位、第 2 桌 10 位，都算沒有空位；新排的人從第 3 桌開始', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 22))
      .addGroup('業務部', null, ['業1'])
      .seat(1, range('行', 1, 12))
      .seat(2, range('行', 13, 22));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual(range('行', 1, 12));
    expect(o.table(2)).toEqual(range('行', 13, 22));
    expect(o.table(3)).toEqual(['業1']);
    expect(o.summary).toEqual({ placed: 1, tableIds: [3], left: 0 });
  });

  it('只排未入座：第 1 桌 9 位、一組 3 人 → 第 1 桌只排到第 10 位，不用第 11、12 位；其餘的人到第 2 桌（ARR-R09）', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 9))
      .addGroup('業務部', '北區組', ['業1', '業2', '業3'])
      .seat(1, range('行', 1, 9));

    const o = s.run('unseatedOnly');

    expect(o.table(1)).toEqual([...range('行', 1, 9), '業1']);
    expect(o.table(1)).toHaveLength(10);
    expect(o.table(2)).toEqual(['業2', '業3']);
    expect(o.summary).toEqual({ placed: 3, tableIds: [1, 2], left: 0 });
  });

  it('清空後重排：沒有備註名稱的第 1 桌原本 11 位，清空後照常排，每桌最多 10 位（ARR-R04）', () => {
    const s = new Scenario().addGroup('行政部', null, range('行', 1, 11)).seat(1, range('行', 1, 11));

    const o = s.run('rebuild');

    expect(o.table(1)).toEqual(range('行', 1, 10));
    expect(o.table(2)).toEqual(['行11']);
    expect(o.summary).toEqual({ placed: 11, tableIds: [1, 2], left: 0 });
  });

  it('清空後重排：12 位的可用桌清空後，原本的 12 位與未入座的人一起重排，每桌 10 位', () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 12))
      .addGroup('業務部', null, range('業', 1, 3))
      .seat(4, range('行', 1, 12));

    const o = s.run('rebuild');

    expect(o.table(1)).toEqual(range('行', 1, 10));
    expect(o.table(2)).toEqual(['行11', '行12', '業1', '業2', '業3']);
    expect(o.table(4)).toEqual([]);
    expect(o.summary).toEqual({ placed: 15, tableIds: [1, 2], left: 0 });
  });

  it.each(ARRANGE_MODES)('%s：有備註名稱的桌上 12 位的名單與順序都不動，第 11、12 位也不動', (mode) => {
    const twelve = range('行', 1, 12).reverse();
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 12))
      .addGroup('業務部', null, ['業1'])
      .note(1, '主桌')
      .seat(1, twelve);

    const o = s.run(mode);

    expect(o.table(1)).toEqual(twelve);
    expect(o.table(2)).toEqual(['業1']);
    expect(o.summary).toEqual({ placed: 1, tableIds: [2], left: 0 });
  });

  it('只排未入座：可用的桌都已有 10 位以上（含 11、12 位），一位都沒排進去，座位都不變（ARR-R11、ARR-Q02）', () => {
    const s = new Scenario().addGroup('行政部', null, range('行', 1, 23)).addGroup('業務部', null, ['業1']);
    for (let t = 1; t <= 28; t++) s.note(t, `保留${t}`);
    s.seat(29, range('行', 1, 11)).seat(30, range('行', 12, 23));

    const o = s.run('unseatedOnly');

    expect(o.changes).toEqual([]);
    expect(o.table(29)).toHaveLength(11);
    expect(o.table(30)).toHaveLength(12);
    expect(o.summary).toEqual({ placed: 0, tableIds: [], left: 1 });
  });
});
