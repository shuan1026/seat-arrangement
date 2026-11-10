'use client';

// 員工名單頁的寫入：先改畫面，再排進儲存佇列依序送出（docs/spec/README.md 第 6、7 節；src/client/app-provider.tsx useMutation）。
// 成功後用伺服器回應校正 store，再以 Sonner 顯示成功訊息（不帶「復原」，EMP-R31）；
// 別人剛改過資料（409／404）時由 AppProvider 重新載入並顯示「資料已被其他人更新，已重新載入。」（COM-R07、COM-R08）。
// 跨線：一次加入多位與取消報名呼叫參與人員 API（src/contracts/participants.ts，B 線實作）。
import { useCallback, useMemo } from 'react';
import { apiFetch } from '@/client/api';
import { useAppStore, useMutation } from '@/client/app-provider';
import type { EmployeeDeleteResult, EmployeeInput, EmployeeResult } from '@/contracts/employees';
import type { Employee } from '@/contracts/entities';
import type { ParticipantDeleteResult, ParticipantsResult } from '@/contracts/participants';
import { notify } from '@/components/ui/toaster';
import {
  addEmployee,
  newTempId,
  pendingParticipant,
  rememberId,
  removeEmployee,
  removeParticipants,
  replaceEmployee,
  resolveId,
  upsertParticipants,
} from './store-updates';

/** 對話框送出的內容：已去掉前後空白，空白的選填欄位是 null */
export type EmployeeFormValues = {
  name: string;
  englishName: string | null;
  department: string;
  team: string | null;
  extension: string | null;
  region: string | null;
  note: string | null;
};

export function useEmployeeActions() {
  const mutate = useMutation();
  const employees = useAppStore((s) => s.data.employees);

  const createEmployee = useCallback(
    (values: EmployeeFormValues) => {
      const tempId = newTempId();
      const sortOrder = Math.max(0, ...employees.map((e) => e.sortOrder)) + 1;
      // 手動新增的員工沒有辦公室（EMP-Q06 第 4 點）
      const input: EmployeeInput = { ...values, office: null };
      mutate<EmployeeResult>({
        optimistic: (d) => addEmployee(d, { id: tempId, ...values, office: null, sortOrder }),
        send: () => apiFetch('/api/employees', { method: 'POST', json: input }),
        onSuccess: ({ employee }, s) => {
          rememberId(tempId, employee.id);
          s.update((d) => replaceEmployee(d, tempId, employee));
          notify(`已新增 ${employee.name}。`);
        },
      });
    },
    [mutate, employees],
  );

  /** 編輯是整筆取代：對話框沒有辦公室欄位，送出時帶上原本的辦公室，匯入的辦公室才不會被清掉 */
  const updateEmployee = useCallback(
    (employee: Employee, values: EmployeeFormValues) => {
      const input: EmployeeInput = { ...values, office: employee.office };
      mutate<EmployeeResult>({
        optimistic: (d) => replaceEmployee(d, employee.id, { ...employee, ...values }),
        send: () => apiFetch(`/api/employees/${resolveId(employee.id)}`, { method: 'PATCH', json: input }),
        onSuccess: (r, s) => {
          s.update((d) => replaceEmployee(d, resolveId(employee.id), r.employee));
          notify('已儲存');
        },
      });
    },
    [mutate],
  );

  const deleteEmployee = useCallback(
    (employee: Employee) => {
      mutate<EmployeeDeleteResult>({
        optimistic: (d) => removeEmployee(d, employee.id),
        send: () => apiFetch(`/api/employees/${resolveId(employee.id)}`, { method: 'DELETE' }),
        onSuccess: (r, s) => {
          s.update((d) => upsertParticipants(removeParticipants(d, r.removedParticipantIds), r.participants));
          notify(`已刪除 ${employee.name}。`);
        },
      });
    },
    [mutate],
  );

  /** 取消報名：員工從參與人員移除，眷屬一併移除，座位空出來（EMP-R30） */
  const cancelRegistration = useCallback(
    (employee: Employee, participantId: number) => {
      mutate<ParticipantDeleteResult>({
        optimistic: (d) => removeParticipants(d, [participantId]),
        send: () => apiFetch(`/api/participants/${resolveId(participantId)}`, { method: 'DELETE' }),
        onSuccess: (r, s) => {
          s.update((d) => upsertParticipants(removeParticipants(d, r.removedIds), r.participants));
          notify(`已取消 ${employee.name} 的報名。`);
        },
      });
    },
    [mutate],
  );

  /** 一次加入多位：只加員工本人、未入座（EMP-R22）；有人已被別人加入時整批不儲存（EMP-R24） */
  const bulkJoin = useCallback(
    (employeeIds: readonly number[]) => {
      const pending = employeeIds.map(pendingParticipant);
      const tempIds = new Set(pending.map((p) => p.id));
      mutate<ParticipantsResult>({
        optimistic: (d) => ({ ...d, participants: [...d.participants, ...pending] }),
        send: () =>
          apiFetch('/api/participants/bulk-join', {
            method: 'POST',
            json: { employeeIds: employeeIds.map(resolveId) },
          }),
        onSuccess: (r, s) => {
          for (const p of pending) {
            const real = r.participants.find((x) => x.kind === 'EMPLOYEE' && x.employeeId === resolveId(p.employeeId!));
            if (real) rememberId(p.id, real.id);
          }
          s.update((d) =>
            upsertParticipants(
              { ...d, participants: d.participants.filter((p) => !tempIds.has(p.id)) },
              r.participants,
            ),
          );
          notify(`已把 ${employeeIds.length} 位員工加入尾牙。`);
        },
      });
    },
    [mutate],
  );

  return useMemo(
    () => ({ createEmployee, updateEmployee, deleteEmployee, cancelRegistration, bulkJoin }),
    [createEmployee, updateEmployee, deleteEmployee, cancelRegistration, bulkJoin],
  );
}
