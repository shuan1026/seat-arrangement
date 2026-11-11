// 桌子與位置的換算（docs/spec/seating.md SEAT-R01、R04；docs/decision-record.md D-027）。
// 桌子（SeatTable）有自己的 id；position 是所在位置 1–30（桌號由 src/domain/layout.ts 對應），null 是暫存區；
// 工作人員桌 id 0、kind STAFF、position null，不算在 30 個位置裡也不在暫存區。純函式，前後端共用。
import { STAFF_TABLE_ID, TABLE_COUNT, type SeatTable } from '@/contracts/entities';
import { compareTableIds, FILL_ORDER, tableCodeOf } from './layout';

type TableLike = Pick<SeatTable, 'id' | 'kind' | 'position'> & Partial<Pick<SeatTable, 'stagedAt'>>;

/** 放在位置上的一般桌（場上的桌） */
export const isPlaced = (t: TableLike): boolean => t.kind === 'NORMAL' && t.position !== null;

/** 在暫存區的一般桌 */
export const isStaged = (t: TableLike): boolean => t.kind === 'NORMAL' && t.position === null;

/** 暫存區的順序：依移入的時間，最早的在最上面（2.1.12）；時間相同時依 id */
export function stagedInOrder<T extends TableLike>(tables: readonly T[]): T[] {
  return tables
    .filter(isStaged)
    .sort((a, b) => (a.stagedAt ?? '').localeCompare(b.stagedAt ?? '') || a.id - b.id);
}

/** 場上的桌，依清單順序 A1～A15、B1～B15（SEAT-R04） */
export function placedInListOrder<T extends TableLike>(tables: readonly T[]): T[] {
  return tables.filter(isPlaced).sort((a, b) => compareTableIds(a.position!, b.position!));
}

/** 場上的桌，依自動排座的填桌順序（auto-arrange.md「填桌順序」）；「未放桌」的位置自然跳過 */
export function placedInFillOrder<T extends TableLike>(tables: readonly T[]): T[] {
  const rank = new Map(FILL_ORDER.map((p, i) => [p, i]));
  return tables.filter(isPlaced).sort((a, b) => (rank.get(a.position!) ?? 0) - (rank.get(b.position!) ?? 0));
}

/** 沒有桌的位置（「未放桌」），依位置編號 */
export function emptyPositions(tables: readonly TableLike[]): number[] {
  const taken = new Set(tables.filter(isPlaced).map((t) => t.position));
  return Array.from({ length: TABLE_COUNT }, (_, i) => i + 1).filter((p) => !taken.has(p));
}

/** 用 id 或位置找桌子的索引 */
export type TableIndex = {
  byId: ReadonlyMap<number, TableLike>;
  /** 位置 → 桌子 */
  byPosition: ReadonlyMap<number, TableLike>;
  /** 桌子 id → 桌號（例如「B4」）；暫存的桌、工作人員桌與不存在的 id 是 undefined */
  codeOf: (tableId: number) => string | undefined;
  /** 這張桌是不是場上的桌 */
  placed: (tableId: number) => boolean;
  /** 這張桌是不是暫存的桌 */
  staged: (tableId: number) => boolean;
};

export function indexTables(tables: readonly TableLike[]): TableIndex {
  const byId = new Map(tables.map((t) => [t.id, t]));
  const byPosition = new Map(tables.filter(isPlaced).map((t) => [t.position!, t]));
  const codeOf = (tableId: number) => {
    const t = byId.get(tableId);
    return t && isPlaced(t) ? tableCodeOf(t.position!) : undefined;
  };
  return {
    byId,
    byPosition,
    codeOf,
    placed: (tableId) => {
      const t = byId.get(tableId);
      return !!t && isPlaced(t);
    },
    staged: (tableId) => {
      const t = byId.get(tableId);
      return !!t && isStaged(t);
    },
  };
}

/** 新增桌的 id：目前最大的 id 加 1，最小 31（既有 30 桌是 1–30，D-027） */
export const nextTableId = (tables: readonly Pick<SeatTable, 'id'>[]): number =>
  Math.max(TABLE_COUNT, ...tables.map((t) => t.id)) + 1;

export { STAFF_TABLE_ID };
