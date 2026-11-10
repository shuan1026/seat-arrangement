// 前後端共用的資料形狀（GET /api/state 與各 API 的回應）。改這個檔案要由主 agent 處理（docs/plan/implementation-plan.md 第 4.2 節）。
import { z } from 'zod';

export const STAFF_TABLE_ID = 0;
export const TABLE_COUNT = 30;
export const TABLE_CAPACITY = 10;
export const STAFF_TABLE_CAPACITY = 10;

export const participantKindSchema = z.enum(['EMPLOYEE', 'DEPENDENT', 'GUEST']);
export type ParticipantKind = z.infer<typeof participantKindSchema>;

export const employeeSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  englishName: z.string().nullable(),
  department: z.string(),
  team: z.string().nullable(),
  extension: z.string().nullable(),
  region: z.string().nullable(),
  office: z.string().nullable(),
  note: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type Employee = z.infer<typeof employeeSchema>;

export const participantSchema = z.object({
  id: z.number().int(),
  kind: participantKindSchema,
  /** EMPLOYEE：對應的員工 */
  employeeId: z.number().int().nullable(),
  /** DEPENDENT：所屬員工的參與人員 id */
  hostId: z.number().int().nullable(),
  /** DEPENDENT：稱謂，只給承辦人看 */
  relation: z.string().nullable(),
  /** GUEST：姓名、單位、頭銜 */
  guestName: z.string().nullable(),
  organization: z.string().nullable(),
  title: z.string().nullable(),
  childSeat: z.boolean(),
  vegetarian: z.boolean(),
  note: z.string().nullable(),
  /** null = 未入座；0 = 工作人員桌 */
  tableId: z.number().int().nullable(),
  seatOrder: z.number().int().nullable(),
  /** ISO 8601；同類排序的最後依據 */
  createdAt: z.string(),
});
export type Participant = z.infer<typeof participantSchema>;

export const seatTableSchema = z.object({
  id: z.number().int(),
  kind: z.enum(['NORMAL', 'STAFF']),
  noteName: z.string().nullable(),
});
export type SeatTable = z.infer<typeof seatTableSchema>;

export const appStateSchema = z.object({
  employees: z.array(employeeSchema),
  participants: z.array(participantSchema),
  tables: z.array(seatTableSchema),
});
export type AppState = z.infer<typeof appStateSchema>;

/** 登入者（Google 帳號） */
export const sessionUserSchema = z.object({
  name: z.string(),
  email: z.string(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;
