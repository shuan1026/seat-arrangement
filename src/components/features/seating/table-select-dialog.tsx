'use client';

// 選擇桌次對話框（docs/spec/seating.md 2.4、3.4、4.4；SEAT-R22～R25）：拖移的替代操作，支援鍵盤與觸控。
// 人員面板、桌次詳情與參與人員頁（B 線）的列操作「入座…」「移至其他桌次…」都用這個元件。
// 放在 AppProvider 裡即可使用：資料從 store 讀，送出後自己顯示 Sonner 與「復原」。
// 選單類入口仍到 10 位為止（SEAT-R88、D-018）：10 位以上的桌停用並標示「已滿」，送出的指令不帶 allowOverflow。
import { useMemo, useState } from 'react';
import { useAppStore } from '@/client/app-provider';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import { displayName } from '@/domain/display';
import { placedInListOrder } from '@/domain/tables';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { buildTables, CAPACITY, faceName, seatMessage, sortPeople, tableDesc } from './model';
import { useSeatingOps } from './use-seating-ops';

export interface TableSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participantId: number;
}

export function TableSelectDialog({ open, onOpenChange, participantId }: TableSelectDialogProps) {
  const data = useAppStore((s) => s.data);
  const dir = useAppStore((s) => s.dir);
  const ops = useSeatingOps();
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const person = data.participants.find((p) => p.id === participantId);
  const tables = useMemo(() => buildTables(data, dir, sortPeople(data, dir)), [data, dir]);
  // 暫存的桌上的人算未入座：標題是「安排 {顯示名稱} 入座」（SEAT-R94、D-027）
  const seated = person?.tableId != null && person.tableId !== STAFF_TABLE_ID && !tables.get(person.tableId)?.staged;

  const options = useMemo(() => {
    const out = [];
    // 只列場上的桌，依 A1～A15、B1～B15 排列（SEAT-R04、SEAT-R23）；不列「未放桌」的位置與暫存的桌（D-027）。value 是桌子 id
    for (const placed of placedInListOrder(data.tables)) {
      const n = placed.id;
      if (n === person?.tableId) continue;
      const t = tables.get(n)!;
      const desc = tableDesc(t);
      out.push({
        value: String(n),
        // 剩餘位數最少 0：拖移或「加入人員」可以讓一桌有 11、12 位
        label: `${faceName(t)}（剩 ${Math.max(0, CAPACITY - t.count)} 位）${desc ? `・${desc}` : ''}`,
        disabled: t.full,
        disabledReason: t.full ? '已滿' : undefined,
      });
    }
    return out;
  }, [tables, data.tables, person?.tableId]);

  const close = (next: boolean) => {
    if (!next) {
      setValue(null);
      setError(null);
    }
    onOpenChange(next);
  };

  if (!person) return null;
  const name = displayName(person, dir);
  const title = seated ? `把 ${name} 移到其他桌次` : `安排 ${name} 入座`;

  const confirm = () => {
    const tableId = Number(value);
    if (!value || !tables.get(tableId) || tables.get(tableId)!.full || tables.get(tableId)!.staged) {
      setError('請選擇桌次。');
      return;
    }
    // 排到該桌名單最後（SEAT-R25）
    ops.run({ type: 'seat', participantId: person.id, tableId }, seatMessage(data.tables, person, name, tableId));
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title={title}>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <DialogBody>
            <Select
              label="桌次"
              placeholder="選擇桌次"
              options={options}
              value={value}
              onValueChange={(v) => {
                setValue(v);
                if (v) setError(null);
              }}
              error={error}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              取消
            </Button>
            <Button type="submit" variant="primary">
              {seated ? '確認移動' : '確認入座'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
