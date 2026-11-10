// 員工名單 API（docs/spec/employees.md；docs/architecture.md 第 8 節）
//   POST   /api/employees            新增員工          → EmployeeResult
//   PATCH  /api/employees/{id}       編輯員工          → EmployeeResult
//   DELETE /api/employees/{id}       刪除員工（已報名者連動取消報名）→ EmployeeDeleteResult
//   PUT    /api/employees/{id}/declined  標記為不參加或改回未報名（D-014）→ EmployeeResult；已報名時 409 CONFLICT
//   POST   /api/employees/import     匯入通訊錄 CSV    → ImportResult（contracts/imports.ts）
import { z } from 'zod';
import { employeeSchema, participantSchema } from './entities';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const employeeInputSchema = z.object({
  name: z.string({ error: '請輸入姓名。' }).trim().min(1, '請輸入姓名。').max(50),
  englishName: optionalText(100),
  department: z.string({ error: '請選擇部門。' }).trim().min(1, '請選擇部門。').max(50),
  team: optionalText(50),
  extension: optionalText(50),
  region: optionalText(20),
  office: optionalText(50),
  note: optionalText(500),
});
export type EmployeeInput = z.input<typeof employeeInputSchema>;

/** PUT /api/employees/{id}/declined 的本體：true 是標記為不參加，false 是改回未報名（EMP-R63） */
export const employeeDeclinedInputSchema = z.object({ declined: z.boolean() });
export type EmployeeDeclinedInput = z.infer<typeof employeeDeclinedInputSchema>;

export const employeeResultSchema = z.object({ employee: employeeSchema });
export type EmployeeResult = z.infer<typeof employeeResultSchema>;

export const employeeDeleteResultSchema = z.object({
  deletedEmployeeId: z.number().int(),
  /** 一併取消報名而移除的參與人員（員工本人與眷屬） */
  removedParticipantIds: z.array(z.number().int()),
  /** 因為有人離開而改變桌內順序的其他人 */
  participants: z.array(participantSchema),
});
export type EmployeeDeleteResult = z.infer<typeof employeeDeleteResultSchema>;

/** 匯入範本的表頭（EMP-R45） */
export const ROSTER_TEMPLATE_HEADER = ['分機', '姓名', '英文名', '手機號碼', '部門', '地區', '辦公室', '代接群組', '組別'] as const;
