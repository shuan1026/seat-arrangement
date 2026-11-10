'use client';

// 單筆「加入尾牙」的對話框位置（docs/spec/employees.md EMP-R28、2.6 節）。
// 對話框是參與人員的新增人員對話框（docs/spec/participants.md），由 B 線實作，階段 3 才接上：
//   <PersonDialog open={employeeId != null} onOpenChange={onOpenChange} mode="join" employeeId={employeeId} />
//   （src/components/features/people/person-dialog.tsx；類別固定為員工、員工不可更改、主要按鈕「加入尾牙」，
//    完成後 Sonner「已把 {姓名} 加入尾牙。」）
// 開啟的狀態集中在員工名單頁的 joinEmployeeId；接上之前這裡不顯示任何東西，也不自行做替代的對話框。
export interface JoinDialogSlotProps {
  /** 要加入尾牙的員工；null 是關閉 */
  employeeId: number | null;
  onOpenChange: (open: boolean) => void;
}

export function JoinDialogSlot(props: JoinDialogSlotProps) {
  void props;
  return null;
}
