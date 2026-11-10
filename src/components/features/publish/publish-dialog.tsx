'use client';

// 發布座位表的對話框（docs/spec/permissions.md 第 2.2 節、PRM-R16～R20、第 4.2 節文案；PRM-Q02 的目前假設）。
// 座位安排頁頁首的「發布」開啟，只有編輯者看得到（SEAT-R90）。
// 設計系統：Dialog（03-components.md Dialog）、Checkbox（沒有 Switch，發布開關沿用 Checkbox）、狀態 Badge（正向「已發布」、中性「未發布」，
// README 第 11.1 節）、唯讀 Input（vertical）加 Button outline「複製連結」（Input `with-button`：桌面同一列，手機上下堆疊）。
// 切換立即儲存、不需確認，經過儲存佇列（Header 的儲存狀態跟著更新，README 第 6 節）；兩位編輯者先後切換以後切換的為準。
// 連結在前端用 window.location.origin 加 /seats 組成，複製用 navigator.clipboard.writeText（docs/architecture.md 第 11.5 節）。
import { Copy } from 'lucide-react';
import { apiFetch } from '@/client/api';
import { useAppStore, useMutation } from '@/client/app-provider';
import type { PublishState } from '@/contracts/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { controlClasses, Field, useFieldIds } from '@/components/ui/input';
import { notify } from '@/components/ui/toaster';

const TITLE = '發布座位表';
const DESCRIPTION = '同仁用公司帳號登入後，可以在這個連結查自己的座位。';

export interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PublishDialog({ open, onOpenChange }: PublishDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 底部已有「關閉」，標題列不另放關閉鈕（第 2.2 節）；Esc 與點遮罩照樣關閉 */}
      <DialogContent title={TITLE} description={DESCRIPTION} hideClose>
        <PublishDialogBody />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">關閉</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 對話框開著時才掛上：連結要用瀏覽器的網址 */
function PublishDialogBody() {
  const published = useAppStore((s) => s.seatsPublished);
  const setPublished = useAppStore((s) => s.setSeatsPublished);
  const mutate = useMutation();
  const linkIds = useFieldIds();
  // 發布頁的完整網址：目前網站的網址加上 /seats，未發布時也顯示（PRM-R18）
  const url = `${window.location.origin}/seats`;

  const toggle = (next: boolean) => {
    // 立即反映在勾選框與徽章上，再依序儲存（PRM-R19、COM-R02）
    setPublished(next);
    mutate<PublishState>({
      send: () => apiFetch<PublishState>('/api/publish', { method: 'PUT', json: { published: next } }),
      onSuccess: (result, s) => {
        s.setSeatsPublished(result.published);
        notify(result.published ? '已發布座位表。' : '已停止發布座位表。');
      },
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      notify('已複製連結。');
    } catch {
      // 瀏覽器不允許存取剪貼簿：請使用者手動選取（PRM-Q02 的目前假設）
      notify('無法複製，請手動選取連結。', { type: 'warning' });
    }
  };

  return (
    <DialogBody>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Checkbox label={TITLE} checked={published} onCheckedChange={(v) => toggle(v === true)} />
        {published ? <Badge variant="positive">已發布</Badge> : <Badge variant="neutral">未發布</Badge>}
      </div>
      <Field ids={linkIds} label="連結">
        <div className="flex min-w-0 gap-2 max-md:flex-col">
          <input
            id={linkIds.id}
            type="text"
            readOnly
            value={url}
            // 唯讀但可以選取；聚焦時整段選起來，方便手動複製
            onFocus={(e) => e.currentTarget.select()}
            // 高度 36 px，和按鈕相同（Input `md`、`with-button`）
            className={cn(controlClasses({ size: 'md' }), 'h-9')}
          />
          <Button variant="outline" leadingIcon={<Copy />} onClick={() => void copy()} className="shrink-0 max-md:w-full">
            複製連結
          </Button>
        </div>
      </Field>
    </DialogBody>
  );
}
