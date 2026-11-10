// 座位安排 API（docs/spec/seating.md、auto-arrange.md；docs/architecture.md 第 8.1 節）
//   POST  /api/seating/operations   座位異動指令（可復原的操作都走這裡）→ SeatingResult
//   PATCH /api/tables/{id}          修改備註名稱（不可復原）              → TableResult
//   GET   /api/export/seating       下載座位表 Excel（docs/spec/export.md）
import { z } from 'zod';
import { participantSchema, seatTableSchema, STAFF_TABLE_ID, TABLE_COUNT } from './entities';

/** 0 = 工作人員桌，1–30 = 一般桌 */
const anyTable = z.number().int().min(STAFF_TABLE_ID).max(TABLE_COUNT);
const normalTable = z.number().int().min(1).max(TABLE_COUNT);

/** 指令之前的狀態，送回 restore 就能復原 */
export const seatingSnapshotSchema = z.object({
  participants: z.array(
    z.object({ id: z.number().int(), tableId: z.number().int().nullable(), seatOrder: z.number().int().nullable() }),
  ),
  tables: z.array(z.object({ id: z.number().int(), noteName: z.string().nullable() })),
});
export type SeatingSnapshot = z.infer<typeof seatingSnapshotSchema>;

export const seatingOperationSchema = z.discriminatedUnion('type', [
  /** 入座、搬移、放進工作人員桌、工作人員入座；index 省略時排到名單最後（SEAT-R16～R19、R40～R45） */
  z.object({ type: z.literal('seat'), participantId: z.number().int(), tableId: anyTable, index: z.number().int().min(0).optional() }),
  /** 桌次詳情或工作人員桌詳情的「加入人員」，依陣列順序排到名單最後（SEAT-R30、R31、R50） */
  z.object({ type: z.literal('seatMany'), tableId: anyTable, participantIds: z.array(z.number().int()).min(1).max(10) }),
  /** 移出桌次或工作人員桌，變成未入座（SEAT-R26、R46） */
  z.object({ type: z.literal('unseat'), participantId: z.number().int() }),
  /** 桌內調整順序：這一桌的完整新順序（SEAT-R32） */
  z.object({ type: z.literal('reorder'), tableId: normalTable, participantIds: z.array(z.number().int()).max(10) }),
  /** 清空桌次，備註名稱保留（SEAT-R29） */
  z.object({ type: z.literal('clear'), tableId: normalTable }),
  /** 整桌對調名單與備註名稱（SEAT-R35、R36） */
  z.object({ type: z.literal('swap'), tableA: normalTable, tableB: normalTable }),
  /** 自動排座（auto-arrange.md） */
  z.object({ type: z.literal('autoArrange'), mode: z.enum(['unseatedOnly', 'rebuild']) }),
  /** 復原最近一次 */
  z.object({ type: z.literal('restore'), snapshot: seatingSnapshotSchema }),
]);
export type SeatingOperation = z.infer<typeof seatingOperationSchema>;

export const autoArrangeSummarySchema = z.object({
  /** 排進桌次的人數 */
  placed: z.number().int(),
  /** 有排進人的桌號，由小到大 */
  tableIds: z.array(z.number().int()),
  /** 空位不夠、留在未入座的人數 */
  left: z.number().int(),
});
export type AutoArrangeSummary = z.infer<typeof autoArrangeSummarySchema>;

export const seatingResultSchema = z.object({
  /** 位置有改變的參與人員（完整資料） */
  participants: z.array(participantSchema),
  /** 備註名稱有改變的桌次（對調、復原） */
  tables: z.array(seatTableSchema),
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
