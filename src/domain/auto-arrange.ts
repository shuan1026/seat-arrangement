// 自動排座（docs/spec/auto-arrange.md 第 3 節 ARR-R01～R16；員工與眷屬一定同桌依 D-009）。
// 純函式：輸入員工名單、參與人員、桌次與範圍，回傳位置有改變的人與摘要，不改傳入的資料、不碰資料庫。
// 待確認依 D-008 照目前假設：ARR-Q02 一位都沒排進去時座位都不變、ARR-Q05 部門依員工名單第一次出現的先後、
// ARR-Q06 只排未入座時只看桌次與空位。
import { TABLE_CAPACITY, type Employee, type Participant, type SeatTable } from '@/contracts/entities';
import type { AutoArrangeSummary } from '@/contracts/seating';
import { buildDirectory, departmentOf, teamOf, type Directory } from './display';
import { FILL_ORDER } from './layout';
import { participantComparator } from './participants';

export type AutoArrangeMode = 'unseatedOnly' | 'rebuild';

export type AutoArrangeInput = {
  employees: readonly Employee[];
  participants: readonly Participant[];
  tables: readonly SeatTable[];
  mode: AutoArrangeMode;
};

/** 一位參與人員的新位置；tableId 為 null 表示回到未入座；seatOrder 0 起算 */
export type AutoArrangeChange = { participantId: number; tableId: number | null; seatOrder: number | null };

export type AutoArrangeResult = { changes: AutoArrangeChange[]; summary: AutoArrangeSummary };

// ---- 參與人員的預設排序（ARR-R05）：和參與人員頁同一份，見 participants.ts 的 participantComparator ----

/** display.ts 的索引；它的參數型別是可變陣列，這裡先複製一份，不動傳入的陣列 */
const directoryOf = (state: { employees: readonly Employee[]; participants: readonly Participant[] }): Directory =>
  buildDirectory({ employees: [...state.employees], participants: [...state.participants] });

// ---- 自動排座 ----

/** 排座單位（ARR-R06）：一起排進同一桌的一群候選人，依 ARR-R05 的順序 */
type Unit = { dept: string | null; team: string | null; members: Participant[] };

const isDependentOf = (d: Participant | undefined, host: Participant | undefined): boolean =>
  !!d && !!host && d.kind === 'DEPENDENT' && d.hostId === host.id;

/** ARR-R06：同部門同組別一個單位；沒有組別的員工連同眷屬一個單位；所屬員工不是候選人、沒有組別的眷屬自己一個單位 */
function toUnits(sorted: readonly Participant[], dir: Directory): Unit[] {
  const units: Unit[] = [];
  for (const p of sorted) {
    const dept = departmentOf(p, dir);
    const team = teamOf(p, dir) || null;
    const last = units[units.length - 1];
    const sameUnit =
      !!last &&
      last.dept === dept &&
      (team !== null
        ? last.team === team
        : last.team === null && last.members.length === 1 && isDependentOf(p, last.members[0]));
    if (sameUnit) last.members.push(p);
    else units.push({ dept, team, members: [p] });
  }
  return units;
}

/** 從最前面之後的單位找符合條件的：先找同部門、再找後面部門，都取順序上最近的（ARR-R08、ARR-R16） */
function* laterUnits(units: readonly Unit[], dept: string | null): Generator<Unit> {
  const rest = units.slice(1);
  yield* rest.filter((u) => u.dept === dept);
  yield* rest.filter((u) => u.dept !== dept);
}

export function autoArrange(input: AutoArrangeInput): AutoArrangeResult {
  const { employees, participants, tables, mode } = input;
  const dir = directoryOf({ employees, participants });

  // ARR-R02：可用的桌是沒有備註名稱的一般桌，依填桌順序（B1、A1、B4、B7…A13，也就是內部編號 1–30，D-019）；
  // 工作人員桌不是可用的桌
  const usableIds = new Set(tables.filter((t) => t.kind === 'NORMAL' && !t.noteName).map((t) => t.id));
  const usable = FILL_ORDER.filter((id) => usableIds.has(id));
  const usableSet = new Set(usable);
  const onUsable = (p: Participant) => p.tableId !== null && usableSet.has(p.tableId);

  // ARR-R01、R03、R04：候選人是未入座的員工與眷屬；清空後重排再加上可用桌上的員工與眷屬。
  // 外部貴賓一律不排；工作人員在工作人員桌，不是未入座也不在可用的桌，所以不會是候選人。
  const isCandidate = (p: Participant) =>
    p.kind !== 'GUEST' && (p.tableId === null || (mode === 'rebuild' && onUsable(p)));
  const candidates = participants.filter(isCandidate).sort(participantComparator(dir));
  const candidateIds = new Set(candidates.map((p) => p.id));

  // ARR-R16：單獨的員工是這一次要排的人裡沒有他的眷屬的員工
  const hostsWithDependent = new Set(
    candidates
      .filter((p) => p.kind === 'DEPENDENT' && p.hostId !== null && candidateIds.has(p.hostId))
      .map((p) => p.hostId),
  );
  const isSingle = (p: Participant) => p.kind === 'EMPLOYEE' && !hostsWithDependent.has(p.id);

  // 各桌目前的人數：只排未入座時已入座的人不動，新排的人接在後面；清空後重排時可用的桌先清空
  const seated = new Map<number, number>();
  if (mode === 'unseatedOnly') {
    for (const p of participants)
      if (onUsable(p) && p.tableId !== null) seated.set(p.tableId, (seated.get(p.tableId) ?? 0) + 1);
  }

  const units = toUnits(candidates, dir);
  const placements = new Map<number, { tableId: number; seatOrder: number }>();

  for (const tableId of usable) {
    if (units.length === 0) break;
    let next = seated.get(tableId) ?? 0;
    const put = (people: readonly Participant[]) => {
      for (const p of people) placements.set(p.id, { tableId, seatOrder: next++ });
    };

    while (units.length > 0 && next < TABLE_CAPACITY) {
      const space = TABLE_CAPACITY - next;
      const front = units[0];
      if (!front) break;

      // ARR-R07：最前面的單位排得進就整個排進去
      if (front.members.length <= space) {
        put(front.members);
        units.shift();
        continue;
      }

      // ARR-R08：排不進時，從後面找排得進的單位來填（先同部門、再後面部門，取最近的）
      let filler: Unit | undefined;
      for (const u of laterUnits(units, front.dept)) {
        if (u.members.length <= space) {
          filler = u;
          break;
        }
      }
      if (filler) {
        put(filler.members);
        units.splice(units.indexOf(filler), 1);
        continue;
      }

      // ARR-R09：都排不進才拆最前面的單位，取剛好等於空位數的人；
      // 拆點不落在員工和眷屬之間（D-009）：取到的最後一位是後面緊跟著眷屬的員工時，這位員工和眷屬一起留到下一桌
      let take = space;
      if (isDependentOf(front.members[take], front.members[take - 1])) take -= 1;
      put(front.members.splice(0, take));

      // ARR-R16：因此空出的 1 個位子，從後面的單位找一位單獨的員工補上（被拆的那一組剩下的人不算）；找不到就留空
      if (take < space) {
        for (const u of laterUnits(units, front.dept)) {
          const i = u.members.findIndex(isSingle);
          if (i < 0) continue;
          const [single] = u.members.splice(i, 1);
          if (single) put([single]);
          if (u.members.length === 0) units.splice(units.indexOf(u), 1);
          break;
        }
      }
      // 其餘的人仍是最前面的單位，到下一張可用的桌再處理
      break;
    }
  }

  const placed = placements.size;
  const tableIds = [...new Set([...placements.values()].map((x) => x.tableId))].sort((a, b) => a - b);
  // ARR-R11：排不下的人留在未入座
  const summary: AutoArrangeSummary = { placed, tableIds, left: candidates.length - placed };

  // ARR-Q02 的目前假設：一位都沒排進去時座位都不變（清空後重排也不清空）
  if (placed === 0) return { changes: [], summary };

  const changes: AutoArrangeChange[] = [];
  for (const p of [...participants].sort((a, b) => a.id - b.id)) {
    const to = placements.get(p.id);
    let tableId: number | null = p.tableId;
    let seatOrder: number | null = p.seatOrder;
    if (to) {
      ({ tableId, seatOrder } = to);
    } else if (candidateIds.has(p.id) || (mode === 'rebuild' && p.kind === 'GUEST' && onUsable(p))) {
      // 排不下的候選人留在未入座；清空後重排時可用桌上的外部貴賓回到未入座（ARR-R04）
      tableId = null;
      seatOrder = null;
    }
    if (tableId !== p.tableId || seatOrder !== p.seatOrder) changes.push({ participantId: p.id, tableId, seatOrder });
  }
  return { changes, summary };
}

/**
 * 自動排座套用後的 Sonner 文字（ARR-R14、ARR-Q02、ARR-Q03；D-019 改寫成桌數）：
 * {k} 是這一次有排進人的桌數，不是桌號範圍；一位都沒排進去時是警告「沒有可以排的員工與眷屬。」
 */
export function autoArrangeMessage(summary: AutoArrangeSummary): string {
  if (summary.placed === 0) return '沒有可以排的員工與眷屬。';
  const head = `已把 ${summary.placed} 位安排到 ${summary.tableIds.length} 桌`;
  return summary.left ? `${head}，還有 ${summary.left} 位排不下，留在未入座。` : `${head}。`;
}
