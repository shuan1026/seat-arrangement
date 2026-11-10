'use client';

// 取消報名與刪除的確認對話框（docs/spec/participants.md 第 2.2 節、第 4.1 節；README 第 9 節「危險或不可復原的操作」）。
// 參與人員頁的列操作與座位安排頁人員面板的「取消報名」「刪除」共用，確認後的結果相同。
import { useAppStore } from '@/client/app-provider';
import { AlertDialog, AlertDialogContent } from '@/components/ui/alert-dialog';
import type { Participant } from '@/contracts/entities';
import { displayName } from '@/domain/display';
import { usePersonActions } from './use-person-actions';

export type RemoveTarget = { action: 'cancelRegistration' | 'delete'; participant: Participant };

export function RemovePersonDialog({ target, onClose }: { target: RemoveTarget | null; onClose: () => void }) {
  const dir = useAppStore((s) => s.dir);
  const { remove } = usePersonActions();
  const cancelRegistration = target?.action === 'cancelRegistration';
  const name = target ? displayName(target.participant, dir) : '';
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {target ? (
        <AlertDialogContent
          destructive
          title={cancelRegistration ? `要取消 ${name} 的報名嗎？` : `要刪除 ${name} 嗎？`}
          description={
            cancelRegistration
              ? `${name} 會從參與人員移除，眷屬一併移除，已安排的座位會空出來；員工名單不受影響，之後可以再加入。`
              : '刪除後無法復原；已安排的座位會空出來。'
          }
          confirmLabel={cancelRegistration ? '確認取消報名' : '刪除人員'}
          cancelLabel={cancelRegistration ? '返回' : '取消'}
          onConfirm={() => remove(target.participant)}
        />
      ) : null}
    </AlertDialog>
  );
}
