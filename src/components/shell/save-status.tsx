'use client';

// Header 右側的儲存狀態（docs/spec/README.md 第 6 節 COM-R02、COM-R04）。
// 只能檢視的人不會儲存任何資料，同一個位置改為中性徽章「只能檢視」（COM-R20、第 11.1 節狀態徽章，D-021）。
import { useAppStore, useIsEditor, useSaveQueue } from '@/client/app-provider';
import { saveStatusText } from '@/client/save-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function SaveStatus() {
  const save = useAppStore((s) => s.save);
  const queue = useSaveQueue();
  return (
    <div className="flex min-w-0 items-center gap-2" aria-live="polite">
      <span
        className={
          save.state === 'failed'
            ? 'truncate type-xs-regular text-destructive-text'
            : 'whitespace-nowrap pr-2 type-xs-regular text-muted-foreground tabular-nums'
        }
      >
        {saveStatusText(save)}
      </span>
      {save.state === 'failed' ? (
        <Button variant="outline" size="sm" onClick={() => queue.retry()}>
          重試
        </Button>
      ) : null}
    </div>
  );
}

/** 編輯者看到儲存狀態，只能檢視時是「只能檢視」徽章 */
export function HeaderStatus() {
  const isEditor = useIsEditor();
  if (isEditor) return <SaveStatus />;
  return (
    <Badge variant="neutral" className="mr-2">
      只能檢視
    </Badge>
  );
}
