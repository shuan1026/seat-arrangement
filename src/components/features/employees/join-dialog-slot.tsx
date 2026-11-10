'use client';

// 單筆「加入尾牙」的對話框（docs/spec/employees.md EMP-R28、2.6 節）：參與人員的新增人員對話框的 join 模式
// （src/components/features/people/person-dialog.tsx；docs/spec/participants.md 第 2.4 節）。
// 類別固定為員工、員工帶入這一位且不可更改、主要按鈕「加入尾牙」，完成後 Sonner「已把 {姓名} 加入尾牙。」。
import { PersonDialog } from '../people/person-dialog';

export interface JoinDialogSlotProps {
  /** 要加入尾牙的員工；null 是關閉 */
  employeeId: number | null;
  onOpenChange: (open: boolean) => void;
  /** 這位員工已加入尾牙（儲存成功） */
  onJoined?: (employeeId: number) => void;
}

export function JoinDialogSlot({ employeeId, onOpenChange, onJoined }: JoinDialogSlotProps) {
  return (
    <PersonDialog
      open={employeeId !== null}
      onOpenChange={onOpenChange}
      mode="join"
      employeeId={employeeId ?? undefined}
      onSaved={() => {
        if (employeeId !== null) onJoined?.(employeeId);
      }}
    />
  );
}
