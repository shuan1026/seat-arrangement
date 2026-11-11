// 前後端共用的資料形狀（GET /api/state 與各 API 的回應）。改這個檔案要由主 agent 處理（docs/plan/implementation-plan.md 第 4.2 節）。
import { z } from 'zod';

export const STAFF_TABLE_ID = 0;
/** 場地的固定位置數（A1～A15、B1～B15，D-019、D-027）；位置編號 1–30 */
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
  /** 承辦人標記為不參加（D-014）；有參與人員時一律視為已報名（domain/employees.ts registrationStatusOf） */
  declined: z.boolean(),
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
  /** 桌子的編號：既有 30 桌是 1–30，工作人員桌 0，新增的桌從 31 起（D-027） */
  id: z.number().int(),
  kind: z.enum(['NORMAL', 'STAFF']),
  /** 所在位置 1–30（桌號由 src/domain/layout.ts 對應）；null 是暫存區，工作人員桌也是 null（D-027） */
  position: z.number().int().nullable(),
  /** 移到暫存區的時間（ISO 字串），暫存區依這個由上往下排；在位置上時是 null */
  stagedAt: z.string().nullable(),
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
