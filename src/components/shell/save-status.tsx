'use client';

// Header 右側的儲存狀態（docs/spec/README.md 第 6 節 COM-R02、COM-R04）
import { useAppStore, useSaveQueue } from '@/client/app-provider';
import { saveStatusText } from '@/client/save-time';
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
