// 參與人員 API（docs/spec/participants.md；docs/architecture.md 第 8 節）
//   POST   /api/participants             新增（員工可同時加一位眷屬；可指定桌次或工作人員）→ ParticipantsResult
//   POST   /api/participants/bulk-join   員工名單勾選多位一次加入尾牙 → ParticipantsResult
//   PATCH  /api/participants/{id}        編輯                       → ParticipantsResult
//   DELETE /api/participants/{id}        取消報名（員工，眷屬一併移除）或刪除（眷屬、外部貴賓）→ ParticipantDeleteResult
//   POST   /api/participants/import      匯入 Google 表單報名表 CSV（D-010）→ ImportResult（contracts/imports.ts）
import { z } from 'zod';
import { participantSchema, STAFF_TABLE_ID, TABLE_COUNT } from './entities';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** 一般桌的內部編號 1–30（畫面上的桌號見 src/domain/layout.ts，D-019）；null = 未入座。工作人員桌用 isStaff 指定，不用 tableId */
export const seatChoiceSchema = z.number().int().min(1).max(TABLE_COUNT).nullable();

const common = {
  childSeat: z.boolean().default(false),
  vegetarian: z.boolean().default(false),
  note: optionalText(500),
};

export const dependentInputSchema = z.object({
  relation: optionalText(20),
  childSeat: z.boolean().default(false),
  vegetarian: z.boolean().default(false),
});

export const participantCreateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('EMPLOYEE'),
    employeeId: z.number({ error: '請選擇員工。' }).int(),
    ...common,
    isStaff: z.boolean().default(false),
    tableId: seatChoiceSchema.default(null),
    /** 同時加一位眷屬（PPL-R46）；和員工同桌，桌次只剩 1 位時眷屬留在未入座（PPL-R57） */
    dependent: dependentInputSchema.nullish(),
  }),
  z.object({
    kind: z.literal('DEPENDENT'),
    /** 所屬員工的參與人員 id（必須是已報名的員工） */
    hostId: z.number({ error: '請選擇所屬員工。' }).int(),
    relation: optionalText(20),
    ...common,
    tableId: seatChoiceSchema.default(null),
  }),
  z.object({
    kind: z.literal('GUEST'),
    guestName: z.string({ error: '請輸入姓名。' }).trim().min(1, '請輸入姓名。').max(50),
    /** 單位／頭銜（一個欄位） */
    organization: optionalText(100),
    ...common,
    tableId: seatChoiceSchema.default(null),
  }),
]);
export type ParticipantCreateInput = z.input<typeof participantCreateSchema>;

/**
 * 編輯：只送要改的欄位（docs/spec/participants.md PPL-Q07、PPL-Q08 的目前假設）。
 * - kind：變更類別；有眷屬的員工不能改。改成 EMPLOYEE 時必須同時給 employeeId（還沒報名的員工）。
 * - tableId：改桌或改回未入座（null）；isStaff 為 true 時忽略。
 */
export const participantUpdateSchema = z
  .object({
    kind: z.enum(['EMPLOYEE', 'DEPENDENT', 'GUEST']),
    employeeId: z.number().int(),
    tableId: seatChoiceSchema,
    childSeat: z.boolean(),
    vegetarian: z.boolean(),
    note: optionalText(500),
    /** EMPLOYEE：勾選／取消工作人員（PPL-R53～R55） */
    isStaff: z.boolean(),
    /** DEPENDENT */
    hostId: z.number().int(),
    relation: optionalText(20),
    /** GUEST */
    guestName: z.string().trim().min(1, '請輸入姓名。').max(50),
    organization: optionalText(100),
  })
  .partial();
export type ParticipantUpdateInput = z.input<typeof participantUpdateSchema>;

export const bulkJoinSchema = z.object({
  employeeIds: z.array(z.number().int()).min(1).max(500),
});
export type BulkJoinInput = z.infer<typeof bulkJoinSchema>;

/** 這次新增或改變的參與人員（含因此改變桌內順序的其他人） */
export const participantsResultSchema = z.object({ participants: z.array(participantSchema) });
export type ParticipantsResult = z.infer<typeof participantsResultSchema>;

export const participantDeleteResultSchema = z.object({
  removedIds: z.array(z.number().int()),
  participants: z.array(participantSchema),
});
export type ParticipantDeleteResult = z.infer<typeof participantDeleteResultSchema>;

export { STAFF_TABLE_ID };

// 匯入參與人員用 Google 表單報名表的原檔，和 seed 共用 src/domain/registration-import.ts（D-010；docs/spec/participants.md 第 3.6 節）
