'use client';

// 人員的列操作（docs/spec/seating.md 2.2.3、2.3.2、2.5.2；SEAT-R22、SEAT-R58）。
// 人員面板、桌次詳情與工作人員桌詳情共用；不顯示勾選狀態，危險項目放在分隔線之後。
// 項目全都會修改資料，只能檢視時整個列操作按鈕不顯示（SEAT-R90、COM-R19）。
import { ArrowRightLeft, Armchair, Pencil, Trash2, UserMinus, UserX } from 'lucide-react';
import { createContext, useContext } from 'react';
import { useIsEditor } from '@/client/app-provider';
import { STAFF_TABLE_ID, type Participant } from '@/contracts/entities';
import { ActionMenu, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { usePersonActions } from './person-actions';

export type SeatingUi = {
  /** 選擇桌次對話框（入座…、移至其他桌次…） */
  openSeatDialog: (participantId: number) => void;
  /** 移出桌次、移出工作人員桌 */
  unseat: (person: Participant) => void;
  /** 在座位圖標示那一桌（SEAT-R62） */
  locate: (tableId: number) => void;
};

export const SeatingUiContext = createContext<SeatingUi>({ openSeatDialog: () => {}, unseat: () => {}, locate: () => {} });
export const useSeatingUi = () => useContext(SeatingUiContext);

export function PersonMenu({ person, place }: { person: Participant; place: 'panel' | 'detail' | 'staffDetail' }) {
  const ui = useSeatingUi();
  const actions = usePersonActions();
  const isEditor = useIsEditor();
  const staff = person.tableId === STAFF_TABLE_ID;
  const seated = person.tableId !== null && !staff;
  const withRemoval = place === 'panel';
  if (!isEditor) return null;
  return (
    <ActionMenu>
      {staff ? (
        <DropdownMenuItem icon={<UserMinus />} onSelect={() => ui.unseat(person)}>
          移出工作人員桌
        </DropdownMenuItem>
      ) : (
        <>
          <DropdownMenuItem icon={seated ? <ArrowRightLeft /> : <Armchair />} onSelect={() => ui.openSeatDialog(person.id)}>
            {seated ? '移至其他桌次…' : '入座…'}
          </DropdownMenuItem>
          {seated ? (
            <DropdownMenuItem icon={<UserMinus />} onSelect={() => ui.unseat(person)}>
              移出桌次
            </DropdownMenuItem>
          ) : null}
        </>
      )}
      <DropdownMenuItem icon={<Pencil />} onSelect={() => actions.onEdit?.(person)}>
        編輯
      </DropdownMenuItem>
      {withRemoval ? (
        <>
          <DropdownMenuSeparator />
          {person.kind === 'EMPLOYEE' ? (
            <DropdownMenuItem destructive icon={<UserX />} onSelect={() => actions.onCancelRegistration?.(person)}>
              取消報名
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem destructive icon={<Trash2 />} onSelect={() => actions.onDelete?.(person)}>
              刪除
            </DropdownMenuItem>
          )}
        </>
      ) : null}
    </ActionMenu>
  );
}
