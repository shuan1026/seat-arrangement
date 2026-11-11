'use client';

// 參與人員的列操作：移出桌次與復原、取消報名、刪除（docs/spec/participants.md PPL-R14、R15、R17、R36～R38）。
// 參與人員頁與座位安排頁（人員面板的「取消報名」「刪除」）共用。
// 先改畫面、再排進儲存佇列（docs/spec/README.md COM-R01～R03）；成功後用伺服器回應校正桌內順序。
// 「移出桌次」用座位安排的座位異動指令（unseat），Sonner 的「復原」送回應帶回的 undo（restore），
// 回到原本那一桌的原本座號（seating.md SEAT-R76～R79；docs/architecture.md 第 8.1 節）。
import { useCallback, useEffect, useRef } from 'react';
import { useAppStore, useMutation } from '@/client/app-provider';
import { apiFetch } from '@/client/api';
import { notify } from '@/components/ui/toaster';
import { STAFF_TABLE_ID, type AppState, type Participant } from '@/contracts/entities';
import type { ParticipantDeleteResult } from '@/contracts/participants';
import { displayName } from '@/domain/display';
import { mergeParticipants, removeParticipants, withDependent } from '@/domain/participants';
import { msg, tableName } from '../seating/model';
import { useSeatingOps } from '../seating/use-seating-ops';

const withParticipants = (fn: (list: Participant[]) => Participant[]) => (d: AppState): AppState => ({
  ...d,
  participants: fn(d.participants),
});

export function usePersonActions() {
  const mutate = useMutation();
  const ops = useSeatingOps();
  const data = useAppStore((s) => s.data);
  const dir = useAppStore((s) => s.dir);
  // 確認對話框在之後才按，要讀那時候的資料
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  }, [data]);

  /** 移出桌次（PPL-R17、PPL-R36）：變成未入座，Sonner 帶「復原」 */
  const unseat = useCallback(
    (p: Participant) => {
      const from = p.tableId;
      if (from == null || from === STAFF_TABLE_ID) return;
      // 暫存的桌上的人：「已把 {顯示名稱} 移出暫存區的桌。」（第 2.2 節、D-027）
      const tables = latest.current.tables;
      const staged = tables.find((t) => t.id === from)?.position === null;
      const name = displayName(p, dir);
      ops.run({ type: 'unseat', participantId: p.id }, staged ? msg.leftStaged(name) : msg.unseated(name, tableName(tables, from)));
    },
    [dir, ops],
  );

  /** 取消報名（員工，眷屬一併移除）或刪除（眷屬、外部貴賓）；不能復原（PPL-R18） */
  const remove = useCallback(
    (p: Participant) => {
      const ids = withDependent(latest.current.participants, p);
      const name = displayName(p, dir);
      mutate<ParticipantDeleteResult>({
        optimistic: withParticipants((list) => removeParticipants(list, ids)),
        send: () => apiFetch<ParticipantDeleteResult>(`/api/participants/${p.id}`, { method: 'DELETE' }),
        onSuccess: (r, s) =>
          s.update(withParticipants((list) => mergeParticipants(removeParticipants(list, r.removedIds), r.participants))),
      });
      notify(p.kind === 'EMPLOYEE' ? `已取消 ${name} 的報名。` : `已刪除 ${name}。`);
    },
    [dir, mutate],
  );

  return { unseat, remove };
}
