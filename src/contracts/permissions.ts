// 權限與座位發布的 API 資料形狀（D-021、D-026；docs/architecture.md 第 8 節、第 11.5 節）。
import { z } from 'zod';
import { MEMBER_ROLES } from '@/domain/members';
import type { AppState } from './entities';

/** 權限：編輯者或檢視者 */
export const memberRoleSchema = z.enum(MEMBER_ROLES);

/** 權限名單的一列（GET /api/members、POST /api/members、PATCH /api/members/{id} 的回應）；畫面只依加入順序排列，不回傳加入者與時間 */
export const memberSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  role: memberRoleSchema,
});
export type Member = z.infer<typeof memberSchema>;

/** POST /api/members 的本體；email 的格式與網域由服務層依 domain/members.ts 檢查（錯誤標在 fields.email） */
export const memberCreateSchema = z.object({ email: z.string(), role: memberRoleSchema });

/** PATCH /api/members/{id} 的本體 */
export const memberRoleUpdateSchema = z.object({ role: memberRoleSchema });

/** PUT /api/publish 的本體與回應 */
export const publishUpdateSchema = z.object({ published: z.boolean() });
export type PublishState = z.infer<typeof publishUpdateSchema>;

/** GET /api/state：全部資料，加上目前登入者是否為編輯者（檢視者是 false）與發布狀態；沒有權限的人拿不到（403 NO_ACCESS） */

export type StateResponse = AppState & {
  me: { isEditor: boolean };
  seatsPublished: boolean;
};

/** 發布頁一桌的名單：依桌內順序；group 是部門（眷屬用所屬員工的部門），外部貴賓是「貴賓」，只在搜尋結果同名時顯示（PRM-R32） */
export type PublishedPerson = { displayName: string; group: string };

/** 發布頁的一桌：內部編號 1–30，工作人員桌 0；部門標示由伺服器算好（「研發一部＋貴賓」「空桌」） */
export type PublishedTable = {
  id: number;
  noteName: string | null;
  departmentLabel: string;
  people: PublishedPerson[];
};

/**
 * 發布頁 /seats 與 GET /api/seats 的資料（PRM-R22、PRM-R27）。不重用 /api/state 的型別：
 * 不含分機、素食、兒童椅、備註、稱謂、組別、單位／頭銜、參與人員與員工的 id，也不含未入座的人。
 */
export type PublishedSeating = { published: false } | { published: true; tables: PublishedTable[] };
