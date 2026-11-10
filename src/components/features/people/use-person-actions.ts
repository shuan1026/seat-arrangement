'use client';

// 參與人員頁的列操作：移出桌次與復原、取消報名、刪除（docs/spec/participants.md PPL-R14、R15、R17、R36～R38）。
// 先改畫面、再排進儲存佇列（docs/spec/README.md COM-R01～R03）；成功後用伺服器回應校正桌內順序。
// 「移出桌次」暫時用 PATCH /api/participants/{id} 帶 tableId: null，「復原」用 PATCH 放回原本那一桌（排在名單最後）；
// 階段 3 可能改用座位安排的座位異動指令（docs/architecture.md 第 8.1 節）。
import { useCallback, useEffect, useRef } from 'react';
import { useAppStore, useMutation } from '@/client/app-provider';
import { apiFetch } from '@/client/api';
import { tableFullMessage } from '@/client/conflict-messages';
import { notify } from '@/components/ui/toaster';
import { TABLE_CAPACITY, type AppState, type Participant } from '@/contracts/entities';
import type { ParticipantDeleteResult, ParticipantsResult } from '@/contracts/participants';
import { displayName } from '@/domain/display';
import {
  mergeParticipants,
  moveParticipant,
  removeParticipants,
  seatedCount,
  withDependent,
} from '@/domain/participants';

const patch = (id: number, json: unknown) =>
  apiFetch<ParticipantsResult>(`/api/participants/${id}`, { method: 'PATCH', json });

const withParticipants = (fn: (list: Participant[]) => Participant[]) => (d: AppState): AppState => ({
  ...d,
  participants: fn(d.participants),
});

export function usePersonActions() {
  const mutate = useMutation();
  const data = useAppStore((s) => s.data);
  const dir = useAppStore((s) => s.dir);
  // Sonner 的「復原」在之後才按，要讀那時候的資料
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  }, [data]);

  const seatAt = useCallback(
    (id: number, tableId: number | null, conflict?: string) =>
      mutate<ParticipantsResult>({
        optimistic: withParticipants((list) => moveParticipant(list, id, tableId)),
        send: () => patch(id, { tableId }),
        onSuccess: (r, s) => s.update(withParticipants((list) => mergeParticipants(list, r.participants))),
        conflictMessage: (code) => (code === 'TABLE_FULL' ? conflict : undefined),
      }),
    [mutate],
  );

  /** 復原移出：回到原本的桌次；那一桌已被坐滿時提示，不儲存 */
  const restore = useCallback(
    (id: number, tableId: number) => {
      const now = latest.current.participants;
      const p = now.find((x) => x.id === id);
      if (!p || p.tableId === tableId) return;
      if (seatedCount(now, tableId) >= TABLE_CAPACITY) {
        notify(tableFullMessage(tableId), { type: 'warning' });
        return;
      }
      seatAt(id, tableId, tableFullMessage(tableId));
      notify('已復原。');
    },
    [seatAt],
  );

  /** 移出桌次（PPL-R17、PPL-R36）：變成未入座，Sonner 帶「復原」 */
  const unseat = useCallback(
    (p: Participant) => {
      const from = p.tableId;
      if (from == null) return;
      seatAt(p.id, null);
      notify(`已把 ${displayName(p, dir)} 移出第 ${from} 桌。`, {
        action: { label: '復原', onClick: () => restore(p.id, from) },
      });
    },
    [dir, restore, seatAt],
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
