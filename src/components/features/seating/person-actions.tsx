'use client';

// 人員的「編輯」「取消報名」「刪除」與頁首的「新增人員」屬於參與人員功能（docs/spec/participants.md）。
// 座位安排只負責把入口放在列操作與頁首；座位安排頁（seating-page.tsx）用這個 context 接到參與人員的對話框。
import { createContext, useContext } from 'react';
import type { Participant } from '@/contracts/entities';

export type PersonActions = {
  onAddPerson?: () => void;
  onEdit?: (person: Participant) => void;
  /** 員工：取消報名 */
  onCancelRegistration?: (person: Participant) => void;
  /** 眷屬、外部貴賓：刪除 */
  onDelete?: (person: Participant) => void;
};

export const PersonActionsContext = createContext<PersonActions>({});
export const usePersonActions = () => useContext(PersonActionsContext);
