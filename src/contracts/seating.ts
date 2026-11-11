// 座位安排 API（docs/spec/seating.md、auto-arrange.md；docs/architecture.md 第 8.1 節）
//   POST  /api/seating/operations   座位異動指令（可復原的操作都走這裡）→ SeatingResult
//   PATCH /api/tables/{id}          修改備註名稱（不可復原）              → TableResult
//   GET   /api/export/seating       下載座位表 Excel（docs/spec/export.md）
import { z } from 'zod';
import { participantSchema, seatTableSchema, STAFF_TABLE_ID, TABLE_COUNT } from './entities';

/** 每桌（含工作人員桌）最多 12 位：標準 10 位，拖移與「加入人員」可以放進第 11、12 位（SEAT-R02、D-018） */
export const TABLE_MAX_SEATS = 12;

/** 桌子的編號：0 = 工作人員桌，≥ 1 = 一般桌（既有 30 桌是 1–30，新增的桌從 31 起，D-027） */
const anyTable = z.number().int().min(STAFF_TABLE_ID);
const normalTable = z.number().int().min(1);
/** 場地的位置 1–30（A1～A15、B1～B15） */
const position = z.number().int().min(1).max(TABLE_COUNT);

/**
 * 指令之前的狀態，送回 restore 就能復原。tables 只記這次動到的桌（操作前的樣子）：
 * exists 是 false 表示操作前不存在（這次新增的桌，restore 時刪掉）；操作前存在、之後被刪掉的，restore 以原本的 id 重建（D-027）
 */
export const seatingSnapshotSchema = z.object({
  participants: z.array(
    z.object({ id: z.number().int(), tableId: z.number().int().nullable(), seatOrder: z.number().int().nullable() }),
  ),
  tables: z.array(
    z.object({
      id: z.number().int(),
      kind: z.enum(['NORMAL', 'STAFF']),
      position: z.number().int().nullable(),
      stagedAt: z.string().nullable(),
      noteName: z.string().nullable(),
      exists: z.boolean(),
    }),
  ),
});
export type SeatingSnapshot = z.infer<typeof seatingSnapshotSchema>;

export const seatingOperationSchema = z.discriminatedUnion('type', [
  /**
   * 入座、搬移、放進工作人員桌、工作人員入座；index 省略時排到名單最後（SEAT-R16～R19、R40～R45）。
   * allowOverflow：拖移帶 true，上限 12 位；選擇桌次對話框不帶，上限 10 位（SEAT-R88、D-018）
   */
  z.object({
    type: z.literal('seat'),
    participantId: z.number().int(),
    tableId: anyTable,
    index: z.number().int().min(0).optional(),
    allowOverflow: z.boolean().optional(),
  }),
  /** 桌次詳情或工作人員桌詳情的「加入人員」，依陣列順序排到名單最後（SEAT-R30、R31、R50）；帶 allowOverflow 時上限 12 位 */
  z.object({
    type: z.literal('seatMany'),
    tableId: anyTable,
    participantIds: z.array(z.number().int()).min(1).max(TABLE_MAX_SEATS),
    allowOverflow: z.boolean().optional(),
  }),
  /** 移出桌次或工作人員桌，變成未入座（SEAT-R26、R46） */
  z.object({ type: z.literal('unseat'), participantId: z.number().int() }),
  /** 桌內調整順序：這一桌的完整新順序（SEAT-R32）；一桌最多 12 位 */
  z.object({ type: z.literal('reorder'), tableId: normalTable, participantIds: z.array(z.number().int()).max(TABLE_MAX_SEATS) }),
  /** 清空桌次，備註名稱保留（SEAT-R29） */
  z.object({ type: z.literal('clear'), tableId: normalTable }),
  /**
   * 搬動桌子（SEAT-R35、D-027）：to 是位置 1–30 或暫存區。expectedTableId 是畫面上目標位置目前的桌（「未放桌」是 null），
   * 和伺服器不同時回 409 CONFLICT；目標是暫存區時不檢查。目標位置有桌就對調，暫存的桌放到有桌的位置時原本那桌改到暫存區最下面
   */
  z.object({
    type: z.literal('moveTable'),
    tableId: normalTable,
    to: z.union([position, z.literal('staging')]),
    expectedTableId: z.number().int().nullable(),
  }),
  /** 在「未放桌」的位置新增一張空桌（SEAT-R96）；位置已有桌回 409 CONFLICT */
  z.object({ type: z.literal('createTable'), position }),
  /** 刪除桌（SEAT-R97）：桌上的人變成未入座、備註名稱一併刪除；已被刪除回 404 */
  z.object({ type: z.literal('deleteTable'), tableId: normalTable }),
  /** 自動排座（auto-arrange.md） */
  z.object({ type: z.literal('autoArrange'), mode: z.enum(['unseatedOnly', 'rebuild']) }),
  /** 復原最近一次 */
  z.object({ type: z.literal('restore'), snapshot: seatingSnapshotSchema }),
]);
export type SeatingOperation = z.infer<typeof seatingOperationSchema>;

export const autoArrangeSummarySchema = z.object({
  /** 排進桌次的人數 */
  placed: z.number().int(),
  /** 有排進人的桌子編號，依所在位置由小到大；畫面上的桌號由所在位置對應（src/domain/layout.ts，D-019、D-027） */
  tableIds: z.array(z.number().int()),
  /** 空位不夠、留在未入座的人數 */
  left: z.number().int(),
});
export type AutoArrangeSummary = z.infer<typeof autoArrangeSummarySchema>;

export const seatingResultSchema = z.object({
  /** 位置有改變的參與人員（完整資料） */
  participants: z.array(participantSchema),
  /** 有變動或新增的桌（位置、暫存順序或備註名稱；搬動、新增、復原，D-027） */
  tables: z.array(seatTableSchema),
  /** 這次刪除的桌（刪除桌、復原新增桌） */
  deletedTableIds: z.array(z.number().int()),

  undo: seatingSnapshotSchema,
  summary: autoArrangeSummarySchema.optional(),
});
export type SeatingResult = z.infer<typeof seatingResultSchema>;

// 備註名稱上限 20 字、去掉前後空白（SEAT-Q13 的目前假設）
export const tableUpdateSchema = z.object({
  noteName: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .transform((v) => (v ? v : null)),
});
export type TableUpdateInput = z.input<typeof tableUpdateSchema>;

export const tableResultSchema = z.object({ table: seatTableSchema });
export type TableResult = z.infer<typeof tableResultSchema>;
