// 發布頁 /seats 的資料與找座位（docs/spec/permissions.md 第 2.3 節、PRM-R24～R33；docs/architecture.md 第 11.5 節）。
// toPublishedTables：伺服器把全部資料縮成發布頁要顯示的欄位（PublishedSeating 的 tables）。
// searchPublishedSeats：發布頁在瀏覽器用這份資料找座位、區分同名、決定要標示哪些桌次。
import { STAFF_TABLE_ID, TABLE_COUNT, type AppState, type Participant } from '@/contracts/entities';
import type { PublishedTable } from '@/contracts/permissions';
import { buildDirectory, departmentOf, displayName, tableDepartmentLabels } from './display';
import { tableTitle, TABLE_IDS_IN_ORDER } from './layout';
import { sortParticipants } from './participants';

/** 外部貴賓在同名區分時寫「（貴賓）」（PRM-R32） */
const GUEST_GROUP = '貴賓';

/**
 * 30 桌與工作人員桌，依內部編號 0–30。名單依桌內順序（工作人員桌依參與人員的預設排序，SEAT-R34）；
 * 部門標示同座位安排頁（SEAT-R07～R09）。只放顯示名稱與部門，未入座的人不在裡面（PRM-R27）。
 */
export function toPublishedTables(state: AppState): PublishedTable[] {
  const dir = buildDirectory(state);
  const notes = new Map(state.tables.map((t) => [t.id, t.noteName]));
  const byTable = new Map<number, Participant[]>();
  for (const p of state.participants) {
    if (p.tableId === null) continue;
    byTable.set(p.tableId, [...(byTable.get(p.tableId) ?? []), p]);
  }
  const out: PublishedTable[] = [];
  for (let id = 0; id <= TABLE_COUNT; id++) {
    const seated = byTable.get(id) ?? [];
    const roster =
      id === STAFF_TABLE_ID
        ? sortParticipants(seated, dir)
        : [...seated].sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0) || a.id - b.id);
    out.push({
      id,
      noteName: id === STAFF_TABLE_ID ? null : (notes.get(id) ?? null),
      departmentLabel: tableDepartmentLabels(roster, dir).join('＋') || '空桌',
      people: roster.map((p) => ({
        displayName: displayName(p, dir),
        group: p.kind === 'GUEST' ? GUEST_GROUP : (departmentOf(p, dir) ?? ''),
      })),
    });
  }
  return out;
}

type SearchableTable = Pick<PublishedTable, 'id'> & { people: readonly PublishedTable['people'][number][] };

export type SeatSearchResult = { tableId: number; text: string };

/** 結果的順序：A1～A15、B1～B15、工作人員桌（PRM-R31） */
const RESULT_ORDER: readonly number[] = [...TABLE_IDS_IN_ORDER, STAFF_TABLE_ID];

/** 「{桌號} 桌」；工作人員是「工作人員桌」 */
const placeText = (tableId: number): string => (tableId === STAFF_TABLE_ID ? '工作人員桌' : tableTitle(tableId));

/**
 * 找座位（PRM-R30～R32）：比對顯示名稱，包含關鍵字就符合；關鍵字去掉前後空白、英文不分大小寫；關鍵字空白時沒有結果。
 * 每一位一行「{顯示名稱}：{桌號} 桌」；結果中有兩位以上顯示名稱完全相同時，這幾位加「（{部門}）」。
 */
export function searchPublishedSeats(tables: readonly SearchableTable[], keyword: string): SeatSearchResult[] {
  const k = keyword.trim().toLowerCase();
  if (!k) return [];
  const byId = new Map(tables.map((t) => [t.id, t]));
  const found: { tableId: number; name: string; group: string }[] = [];
  for (const id of RESULT_ORDER) {
    for (const person of byId.get(id)?.people ?? []) {
      if (person.displayName.toLowerCase().includes(k)) found.push({ tableId: id, name: person.displayName, group: person.group });
    }
  }
  const counts = new Map<string, number>();
  for (const f of found) counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
  return found.map((f) => ({
    tableId: f.tableId,
    text: `${(counts.get(f.name) ?? 0) > 1 ? `${f.name}（${f.group}）` : f.name}：${placeText(f.tableId)}`,
  }));
}

/** 沒有符合時的提示「找不到「{關鍵字}」。」（PRM-R33） */
export const seatNotFoundMessage = (keyword: string): string => `找不到「${keyword.trim()}」。`;
