// 自動排座以 2026 年示範資料的結構驗收：docs/spec/auto-arrange.md 第 5.2 節、ARR-AC19（清空後重排）、ARR-AC20（只排未入座）；
// 涵蓋 ARR-R02～R10、R12、R14～R16 與 D-009。資料在 tests/helpers/auto-arrange-fixture-2026.ts（姓名全部虛構）。
// 預期結果照規格 5.2 節「清空後重排的預期結果」；「只排未入座的預期結果」和清空後重排完全相同。
// Sonner「已把 211 位安排到第 3–27 桌。」由摘要組成：placed 211、tableIds 最小 3、最大 27、left 0。
import { describe, expect, it } from 'vitest';
import { TABLE_COUNT } from '@/contracts/entities';
import { ARRANGE_MODES, dep, type ArrangeMode, type Outcome } from '../../helpers/auto-arrange-scenario';
import {
  buildFixture2026,
  GROUPS_2026,
  GUEST_COUNT_2026,
  groupLabel,
  memberName2026,
  NOTE_TABLES_2026,
} from '../../helpers/auto-arrange-fixture-2026';

/** 規格 5.2 節「各桌依座位順序的組成」表（原文） */
const EXPECTED_TABLES: readonly (readonly [table: number, count: number, composition: string])[] = [
  [3, 10, '總經理室（無組別）2｜稽核室（無組別）1｜財務會計部（無組別）4｜經營企劃室（無組別）3'],
  [4, 10, '經營企劃室（無組別）6｜工程服務部（無組別）3｜資材運籌部（無組別）1'],
  [5, 10, '工程服務部／中南區工服組 6｜資材運籌部（無組別）4'],
  [6, 10, '工程服務部／MIS 5｜工程服務部／北區工服組 5'],
  [7, 10, '資材運籌部（無組別）7｜公共自行車事業部（無組別）3'],
  [8, 10, '公共自行車事業部（無組別）10'],
  [9, 10, '公共自行車事業部（無組別）1｜智慧自行車事業部（無組別）9'],
  [10, 10, '智慧自行車事業部（無組別）1｜軟體開發部／嵌入式軟體開發組 6｜智慧駐車事業部（無組別）3'],
  [11, 10, '軟體開發部／前端 8｜智慧駐車事業部（無組別）2'],
  [13, 10, '軟體開發部／後端一組 10'],
  [14, 10, '軟體開發部／手機軟體開發組 5｜軟體開發部／後端二組 4｜智慧駐車事業部（無組別）1'],
  [15, 10, '智慧駐車事業部（無組別）3｜半導體事業部（無組別）7'],
  [16, 10, '半導體事業部（無組別）6｜硬體開發部／機構設計組 3｜硬體開發部（無組別）1'],
  [18, 10, '硬體開發部／韌體設計組 7｜AI跨域市場中心／AI發展中心 2｜AI跨域市場中心（無組別）1'],
  [19, 10, 'AI跨域市場中心／devops 4｜AI跨域市場中心／服務設計組 5｜測試工程部（無組別）1'],
  [20, 10, 'AI跨域市場中心／數據組 5｜AI跨域市場中心／行銷 3｜AI跨域市場中心（無組別）2'],
  [21, 10, 'AI跨域市場中心（無組別）4｜工程服務部／系統維運組 6'],
  [23, 10, '工程服務部／系統維運組 6｜硬體開發部／硬體設計組 3｜測試工程部／整合測試組 1'],
  [24, 10, '硬體開發部／硬體設計組 9｜測試工程部／整合測試組 1'],
  [25, 10, '測試工程部／整合測試組 6｜測試工程部／自動化測試組 4'],
  [26, 9, '測試工程部／自動化測試組 3｜測試工程部／維修 6'],
  [27, 2, '測試工程部／維修 2'],
];

/** 規格 5.2 節「拆到兩桌以上的組有 5 組」：組 → 各桌的人數 */
const SPLIT_GROUPS: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  '工程服務部／系統維運組': { 21: 6, 23: 6 },
  '硬體開發部／硬體設計組': { 23: 3, 24: 9 },
  '測試工程部／整合測試組': { 23: 1, 24: 1, 25: 6 },
  '測試工程部／自動化測試組': { 25: 4, 26: 3 },
  '測試工程部／維修': { 26: 6, 27: 2 },
};

const USED_TABLES = EXPECTED_TABLES.map(([t]) => t);

/** 「工程服務部／中南區工服組 6」→ ['工程服務部／中南區工服組', 6] */
const parseComposition = (text: string): [string, number][] =>
  text.split('｜').map((segment) => {
    const m = /^(.+?)\s*(\d+)$/.exec(segment.trim());
    if (!m?.[1] || !m[2]) throw new Error(`看不懂的組成：${segment}`);
    return [m[1].trim(), Number(m[2])];
  });

/** 一桌依座位順序的組成：連續同一組的人合成一段 */
function compositionOf(names: readonly string[], groupOf: ReadonlyMap<string, string>): [string, number][] {
  const out: [string, number][] = [];
  for (const name of names) {
    const label = groupOf.get(name) ?? `（不在示範資料：${name}）`;
    const last = out[out.length - 1];
    if (last && last[0] === label) last[1] += 1;
    else out.push([label, 1]);
  }
  return out;
}

const fixture = buildFixture2026();
const results = new Map<string, Outcome>();
/** 同一種範圍只執行一次 */
const arranged = (mode: ArrangeMode, opts: { reversedInput?: boolean } = {}): Outcome => {
  const key = `${mode}:${opts.reversedInput ? 'reversed' : 'normal'}`;
  const cached = results.get(key);
  if (cached) return cached;
  const outcome = fixture.scenario.run(mode, opts);
  results.set(key, outcome);
  return outcome;
};

const hw = (n: number) => memberName2026('硬體開發部', '硬體設計組', n);
const itg = (n: number) => memberName2026('測試工程部', '整合測試組', n);
const auto = (n: number) => memberName2026('測試工程部', '自動化測試組', n);
const fix = (n: number) => memberName2026('測試工程部', '維修', n);
const sre = (n: number) => memberName2026('工程服務部', '系統維運組', n);

describe('示範資料的結構（5.2 節總數、桌次）', () => {
  it('14 個部門、20 組；員工 167 位、眷屬 44 位、外部貴賓 12 位；沒有工作人員；全部未入座', () => {
    const { participants, employees } = fixture.scenario;
    expect(new Set(GROUPS_2026.map((g) => g.department)).size).toBe(14);
    expect(GROUPS_2026.filter((g) => g.team !== null)).toHaveLength(20);
    expect(participants.filter((p) => p.kind === 'EMPLOYEE')).toHaveLength(167);
    expect(participants.filter((p) => p.kind === 'DEPENDENT')).toHaveLength(44);
    expect(participants.filter((p) => p.kind === 'GUEST')).toHaveLength(GUEST_COUNT_2026);
    expect(participants).toHaveLength(223);
    expect(participants.every((p) => p.tableId === null)).toBe(true);
    expect(employees).toHaveLength(167 + 15);
  });

  it('各組人數照規格表（員工＋眷屬）', () => {
    expect(fixture.members.get('工程服務部／系統維運組')).toHaveLength(12);
    expect(fixture.members.get('資材運籌部（無組別）')).toHaveLength(12);
    expect(fixture.members.get('硬體開發部／硬體設計組')).toHaveLength(12);
    expect(fixture.members.get('測試工程部／維修')).toHaveLength(8);
    const total = [...fixture.members.values()].reduce((sum, names) => sum + names.length, 0);
    expect(total).toBe(211);
  });

  it('對話框的數字：只排未入座的 211 位、有備註名稱的 5 桌（ARR-R15）', () => {
    const o = arranged('unseatedOnly');
    expect(o.summary.placed + o.summary.left).toBe(211);
    expect(fixture.scenario.tables.filter((t) => t.kind === 'NORMAL' && t.noteName !== null)).toHaveLength(5);
  });
});

describe.each([
  { mode: 'rebuild', title: 'ARR-AC19 清空後重排' },
  { mode: 'unseatedOnly', title: 'ARR-AC20 只排未入座' },
] as const)('$mode（$title）', ({ mode }) => {
  it('Sonner「已把 211 位安排到第 3–27 桌。」：211 位全部排進去，有排進人的桌是第 3–27 桌中沒有備註名稱的桌（ARR-R14）', () => {
    const o = arranged(mode);
    expect(o.summary).toEqual({ placed: 211, tableIds: USED_TABLES, left: 0 });
    expect(Math.min(...o.summary.tableIds)).toBe(3);
    expect(Math.max(...o.summary.tableIds)).toBe(27);
  });

  it('各桌人數：第 3–25 桌中沒有備註名稱的 20 桌各 10 位，第 26 桌 9 位，第 27 桌 2 位；第 28–30 桌是空桌', () => {
    const o = arranged(mode);
    const expected = new Map(EXPECTED_TABLES.map(([t, count]) => [t, count]));
    for (let t = 1; t <= TABLE_COUNT; t++) {
      expect(o.table(t), `第 ${t} 桌`).toHaveLength(expected.get(t) ?? 0);
    }
    expect(EXPECTED_TABLES.filter(([t, count]) => t <= 25 && count === 10)).toHaveLength(20);
  });

  it.each(EXPECTED_TABLES)('第 %i 桌 %i 位，依座位順序的組成：%s（ARR-R05～R09、R16）', (table, count, composition) => {
    const o = arranged(mode);
    expect(o.table(table)).toHaveLength(count);
    expect(compositionOf(o.table(table), fixture.groupOf)).toEqual(parseComposition(composition));
  });

  it('有備註名稱的 5 桌仍是空桌，排座不用它們（ARR-R02、ARR-R12）', () => {
    const o = arranged(mode);
    for (const t of Object.keys(NOTE_TABLES_2026).map(Number)) expect(o.table(t), `第 ${t} 桌`).toEqual([]);
  });

  it('12 位外部貴賓都留在未入座；沒有員工或眷屬未入座（ARR-R01）', () => {
    const o = arranged(mode);
    expect(o.unseated()).toEqual(fixture.guests);
  });

  it('每一位眷屬都和所屬員工同桌，並緊接在員工後面（D-009）', () => {
    const o = arranged(mode);
    const dependents = fixture.scenario.participants.filter((p) => p.kind === 'DEPENDENT');
    expect(dependents).toHaveLength(44);
    for (const d of dependents) {
      const hostName = fixture.scenario.nameOf(d.hostId ?? -1);
      const host = o.position(hostName);
      expect(o.position(dep(hostName)), dep(hostName)).toEqual({
        tableId: host.tableId,
        seatOrder: (host.seatOrder ?? -2) + 1,
      });
    }
  });

  it('拆到兩桌以上的組有 5 組，其他 15 組各自在同一桌', () => {
    const o = arranged(mode);
    const teams = GROUPS_2026.filter((g) => g.team !== null).map((g) => groupLabel(g.department, g.team));
    expect(teams).toHaveLength(20);
    const split: Record<string, Record<number, number>> = {};
    for (const label of teams) {
      const perTable: Record<number, number> = {};
      for (const name of fixture.members.get(label) ?? []) {
        const t = o.position(name).tableId ?? 0;
        perTable[t] = (perTable[t] ?? 0) + 1;
      }
      if (Object.keys(perTable).length > 1) split[label] = perTable;
    }
    expect(split).toEqual(SPLIT_GROUPS);
  });

  it('第 23 桌：硬體設計組帶眷屬的第 3 位員工和眷屬一起移到第 24 桌最前面；空位由後面部門整合測試組的第 1 位員工補上（ARR-R09、R16）', () => {
    const o = arranged(mode);
    expect(o.table(23)).toEqual([
      ...[6, 7, 8, 9, 10, 11].map(sre),
      hw(1),
      hw(2),
      dep(hw(2)),
      itg(1),
    ]);
    expect(o.table(24)).toEqual([
      hw(3),
      dep(hw(3)),
      hw(4),
      dep(hw(4)),
      hw(5),
      hw(6),
      dep(hw(6)),
      hw(7),
      hw(8),
      itg(2),
    ]);
    expect(o.table(25)).toEqual([itg(3), dep(itg(3)), itg(4), itg(5), itg(6), itg(7), ...[1, 2, 3, 4].map(auto)]);
  });

  it('第 26 桌：維修帶眷屬的第 5 位員工和眷屬一起移到第 27 桌；後面沒有單獨的員工可以補，第 26 桌留 1 個空位（ARR-R09、R16、R10）', () => {
    const o = arranged(mode);
    expect(o.table(26)).toEqual([auto(5), auto(6), auto(7), fix(1), dep(fix(1)), fix(2), dep(fix(2)), fix(3), fix(4)]);
    expect(o.table(27)).toEqual([fix(5), dep(fix(5))]);
  });

  it('桌桌填滿：第 27 桌之前的可用桌都坐滿 10 人，只有第 26 桌因找不到人補而空 1 位（ARR-R10）', () => {
    const o = arranged(mode);
    const last = Math.max(...o.summary.tableIds);
    const notFull = USED_TABLES.filter((t) => t < last && o.table(t).length < 10);
    expect(notFull).toEqual([26]);
    expect(o.table(26)).toHaveLength(9);
  });

  it('系統維運組 12 人排在第 21、23 桌，和工程服務部其他的組（第 4–6 桌）分開（ARR-R08）', () => {
    const o = arranged(mode);
    const tablesOf = (label: string) =>
      [...new Set((fixture.members.get(label) ?? []).map((n) => o.position(n).tableId))].sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(tablesOf('工程服務部／系統維運組')).toEqual([21, 23]);
    expect(tablesOf('工程服務部／中南區工服組')).toEqual([5]);
    expect(tablesOf('工程服務部／MIS')).toEqual([6]);
    expect(tablesOf('工程服務部／北區工服組')).toEqual([6]);
    expect(tablesOf('工程服務部（無組別）')).toEqual([4]);
  });
});

describe('兩種範圍與輸入順序', () => {
  it('只排未入座的結果和清空後重排完全相同：各桌的組成與順序、空位、拆開的組、摘要（5.2 節「只排未入座的預期結果」）', () => {
    const rebuild = arranged('rebuild');
    const unseatedOnly = arranged('unseatedOnly');
    const byId = (a: { participantId: number }, b: { participantId: number }) => a.participantId - b.participantId;
    expect(unseatedOnly.changes.slice().sort(byId)).toEqual(rebuild.changes.slice().sort(byId));
    expect(unseatedOnly.summary).toEqual(rebuild.summary);
    expect(rebuild.changes).toHaveLength(211);
  });

  it.each(ARRANGE_MODES)('%s：員工、參與人員、桌次陣列倒過來傳入，結果相同（員工名單依 sortOrder、桌次依桌號）', (mode) => {
    const normal = arranged(mode);
    const reversed = arranged(mode, { reversedInput: true });
    const byId = (a: { participantId: number }, b: { participantId: number }) => a.participantId - b.participantId;
    expect(reversed.changes.slice().sort(byId)).toEqual(normal.changes.slice().sort(byId));
    expect(reversed.summary).toEqual(normal.summary);
  });
});
