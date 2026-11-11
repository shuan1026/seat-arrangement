'use client';

// 桌次詳情開出的對話框：調換桌次（2.3.3、SEAT-R39）、加入人員到桌次（2.3.4、SEAT-R30、R31）、
// 加入人員到工作人員桌（2.5.3、SEAT-R50）、清空確認（2.3.5、SEAT-R29）、暫存的桌的「放到…」（2.3.9、SEAT-R93）、
// 刪除確認（2.3.10、SEAT-R97），以及自動排座的範圍（auto-arrange.md 2.2）。
import { useId, useMemo, useState } from 'react';
import { useAppStore } from '@/client/app-provider';
import { STAFF_TABLE_ID, type Participant } from '@/contracts/entities';
import { departmentOf, displayName, teamOf } from '@/domain/display';
import { TABLE_IDS_IN_ORDER } from '@/domain/layout';
import { AlertDialog, AlertDialogContent } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CAPACITY, detailMeta, faceName, isUnseatedIn, MAX_SEATS, msg, positionCode, searchMatch, tableDesc, type TableInfo } from './model';
import { NameLine } from './person-parts';
import { useSeatingOps } from './use-seating-ops';

type OpenProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** 依 A1～A15、B1～B15 列出位置的選項：有桌的位置「{桌號} 桌（{人數}/10）・{備註名稱或部門}」，「未放桌」的位置「{代碼}（未放桌）」 */
function positionOptions(tables: Map<number, TableInfo>, skip: number | null) {
  const byPosition = new Map([...tables.values()].filter((t) => t.position !== null).map((t) => [t.position!, t]));
  const out: { value: string; label: string }[] = [];
  for (const position of TABLE_IDS_IN_ORDER) {
    if (position === skip) continue;
    const t = byPosition.get(position);
    if (!t) {
      out.push({ value: String(position), label: `${positionCode(position)}（未放桌）` });
      continue;
    }
    const desc = tableDesc(t);
    out.push({ value: String(position), label: `${faceName(t)}（${t.count}/${CAPACITY}）${desc ? `・${desc}` : ''}` });
  }
  return { out, byPosition };
}

/** 選一個位置的對話框（調換桌次、放到…）：沒選就按確認時顯示「請選擇{noun}。」 */
function PositionDialog({
  open,
  onOpenChange,
  title,
  label,
  confirmLabel,
  options,
  onConfirm,
}: OpenProps & {
  title: string;
  label: string;
  confirmLabel: string;
  options: { value: string; label: string }[];
  onConfirm: (position: number) => void;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = (next: boolean) => {
    if (!next) {
      setValue(null);
      setError(null);
    }
    onOpenChange(next);
  };
  const confirm = () => {
    if (!value) {
      setError(`請選擇${label}。`);
      return;
    }
    onConfirm(Number(value));
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
              label={label}
              placeholder={`選擇${label}`}
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
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 調換桌次：依 A1～A15、B1～B15 列出自己以外的 29 個位置；已滿與超過的桌也能選（SEAT-R39、SEAT-R88）。
 * 選「未放桌」的位置就是把整桌搬過去（D-027）
 */
export function SwapDialog({ open, onOpenChange, tableId, tables }: OpenProps & { tableId: number; tables: Map<number, TableInfo> }) {
  const ops = useSeatingOps();
  const self = tables.get(tableId)!;
  const { out: options, byPosition } = useMemo(() => positionOptions(tables, self.position), [tables, self.position]);
  return (
    <PositionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`把 ${faceName(self)}和哪一桌對調？`}
      label="桌次"
      confirmLabel="確認對調"
      options={options}
      onConfirm={(position) => {
        const occupant = byPosition.get(position) ?? null;
        ops.run(
          { type: 'moveTable', tableId, to: position, expectedTableId: occupant?.id ?? null },
          occupant ? msg.swapped(faceName(self), faceName(occupant)) : msg.movedToEmpty(positionCode(self.position!), positionCode(position)),
        );
      }}
    />
  );
}

/** 暫存的桌的「放到…」（2.3.9、SEAT-R93）：依 A1～A15、B1～B15 列出 30 個位置；選有桌的位置就是交換 */
export function PlaceDialog({
  open,
  onOpenChange,
  tableId,
  tables,
  onPlaced,
}: OpenProps & { tableId: number; tables: Map<number, TableInfo>; onPlaced?: () => void }) {
  const ops = useSeatingOps();
  const self = tables.get(tableId)!;
  const { out: options, byPosition } = useMemo(() => positionOptions(tables, null), [tables]);
  return (
    <PositionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="把暫存區的桌放到哪裡？"
      label="位置"
      confirmLabel="確認放置"
      options={options}
      onConfirm={(position) => {
        const occupant = byPosition.get(position) ?? null;
        const code = positionCode(position);
        const sent = ops.run(
          { type: 'moveTable', tableId, to: position, expectedTableId: occupant?.id ?? null },
          occupant ? msg.placedSwap(self.noteName, code) : msg.placed(self.noteName, code),
        );
        if (sent) onPlaced?.();
      }}
    />
  );
}

/** 刪除確認（2.3.10、SEAT-R97）：桌上的人回到未入座，備註名稱一併刪除；場上的桌刪除後那個位置變「未放桌」 */
export function DeleteTableDialog({ open, onOpenChange, info, onDeleted }: OpenProps & { info: TableInfo; onDeleted?: () => void }) {
  const ops = useSeatingOps();
  const staged = info.position === null;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        title={staged ? '要刪除暫存區的這一桌嗎？' : `要刪除 ${faceName(info)}嗎？`}
        description={info.count ? `桌上的 ${info.count} 位會回到未入座，備註名稱也會一併刪除。` : '這一桌沒有人。'}
        confirmLabel="刪除桌"
        destructive
        onConfirm={() => {
          const sent = ops.run(
            { type: 'deleteTable', tableId: info.id },
            staged ? msg.deletedStaged : msg.deleted(positionCode(info.position!)),
          );
          if (sent) onDeleted?.();
        }}
      />
    </AlertDialog>
  );
}

/**
 * 加入人員：桌次只列未入座的人（SEAT-R30）；工作人員桌列還不是工作人員的已報名員工（SEAT-R50）。
 * 最多只能勾到這一桌 12 位為止（{k} 是 12 減人數）；說明的空位只算到 10 位，已有 10、11 位時改為
 * 「已滿，最多還可以加入 {k} 位。」（D-018）。依勾選順序排入（SEAT-Q06 的目前假設）；送出時帶 allowOverflow（上限 12 位）。
 */
export function AddPeopleDialog({
  open,
  onOpenChange,
  target,
  tables,
  sorted,
}: OpenProps & { target: number; tables: Map<number, TableInfo>; sorted: readonly Participant[] }) {
  const dir = useAppStore((s) => s.dir);
  const ops = useSeatingOps();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [limitHit, setLimitHit] = useState(false);
  const noteId = useId();
  const isStaff = target === STAFF_TABLE_ID;
  const info = tables.get(target)!;
  // 最多還能勾幾位（到 12 位為止）與說明裡的空位數（只算到 10 位）
  const left = Math.max(0, MAX_SEATS - info.count);
  const free = Math.max(0, CAPACITY - info.count);
  const all = isStaff
    ? sorted.filter((p) => p.kind === 'EMPLOYEE' && p.tableId !== STAFF_TABLE_ID)
    : sorted.filter((p) => isUnseatedIn(tables, p));
  const rows = all.filter((p) => searchMatch(p, dir, q));
  const title = isStaff ? '加入人員到工作人員桌' : `加入人員到 ${faceName(info)}`;

  const close = (next: boolean) => {
    if (!next) {
      setQ('');
      setPicked([]);
      setLimitHit(false);
    }
    onOpenChange(next);
  };
  const toggle = (id: number, checked: boolean) => {
    if (!checked) {
      setPicked((cur) => cur.filter((x) => x !== id));
      setLimitHit(false);
      return;
    }
    if (picked.length >= left) {
      setLimitHit(true);
      return;
    }
    setPicked((cur) => [...cur, id]);
  };
  const meta = (p: Participant) => {
    if (!isStaff) return detailMeta(p, dir);
    const team = teamOf(p, dir);
    const at = p.tableId !== null ? tables.get(p.tableId) : undefined;
    return `${departmentOf(p, dir) ?? ''}${team ? `・${team}` : ''}${at ? `・${faceName(at)}` : ''}`;
  };
  const confirm = () => {
    if (!picked.length) return;
    ops.run(
      { type: 'seatMany', tableId: target, participantIds: picked, allowOverflow: true },
      isStaff ? msg.addedStaff(picked.length) : msg.added(picked.length, faceName(info)),
    );
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={title}
        description={all.length ? (free > 0 ? `還有 ${free} 個空位。` : `已滿，最多還可以加入 ${left} 位。`) : undefined}
      >
        {all.length ? (
          <>
            <DialogBody className="gap-3">
              <SearchInput label="搜尋姓名、分機、部門或單位" placeholder="搜尋姓名、分機、部門或單位" value={q} onChange={(e) => setQ(e.target.value)} />
              {limitHit ? (
                <p id={noteId} role="status" className="type-sm-regular text-destructive-text">
                  最多只能再加入 {left} 位。
                </p>
              ) : null}
              {rows.length ? (
                <ul className="m-0 flex list-none flex-col p-0">
                  {rows.map((p) => (
                    <li key={p.id} className="flex min-h-11 items-center rounded-md px-2 py-1 hover:bg-hover">
                      <Checkbox
                        className="w-full"
                        checked={picked.includes(p.id)}
                        onCheckedChange={(v) => toggle(p.id, v === true)}
                        label={<NameLine person={p} name={displayName(p, dir)} />}
                        description={meta(p) || '—'}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState variant="inline" title={`找不到「${q.trim()}」。`} />
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                取消
              </Button>
              <Button variant="primary" disabled={!picked.length} onClick={confirm}>
                加入 {picked.length} 位
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogBody>
              <EmptyState variant="inline" title={isStaff ? '已報名的員工都在工作人員桌。' : '所有人都已入座。'} />
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                關閉
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 清空確認（SEAT-R29）：這一桌的人全部變成未入座，備註名稱保留 */
export function ClearDialog({ open, onOpenChange, info }: OpenProps & { info: TableInfo }) {
  const ops = useSeatingOps();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        title={`要清空 ${faceName(info)}嗎？`}
        description={`${info.count} 位人員會變成未入座，名單不會刪除。`}
        confirmLabel="清空桌次"
        destructive
        onConfirm={() => ops.run({ type: 'clear', tableId: info.id }, msg.cleared(faceName(info)))}
      />
    </AlertDialog>
  );
}

/** 自動排座的範圍（auto-arrange.md 2.2、ARR-R15、ARR-Q04） */
export function AutoArrangeDialog({ open, onOpenChange, data }: OpenProps & { data: { participants: Participant[]; noted: number } }) {
  const ops = useSeatingOps();
  const n = data.participants.filter((p) => p.tableId === null && p.kind !== 'GUEST').length;
  const [mode, setMode] = useState<'unseatedOnly' | 'rebuild' | null>(null);
  const current = mode ?? (n > 0 ? 'unseatedOnly' : 'rebuild');
  const name = useId();
  const close = (next: boolean) => {
    if (!next) setMode(null);
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title="自動排座"
        description="依員工名單的部門與組別順序排進沒有備註名稱的桌，同組的人盡量排在一起，眷屬跟著員工，外部貴賓與工作人員不排。"
      >
        <DialogBody>
          <div role="radiogroup" aria-label="自動排座範圍" className="flex flex-col gap-3">
            <Radio
              name={name}
              checked={current === 'unseatedOnly'}
              disabled={n === 0}
              onChange={() => setMode('unseatedOnly')}
              label={
                <>
                  只排未入座的 {n} 位
                  {n === 0 ? <span className="text-muted-foreground">（沒有未入座的員工與眷屬）</span> : null}
                </>
              }
            />
            <Radio
              name={name}
              checked={current === 'rebuild'}
              onChange={() => setMode('rebuild')}
              label={`清空後重排（有備註名稱的 ${data.noted} 桌不動）`}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              ops.autoArrange(current);
              close(false);
            }}
          >
            開始排座
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 單選項：設計系統沒有 Radio 元件，沿用 Checkbox 的 16 px 外框與狀態，外形改為圓形（原型 prototype.css 的 .checkbox.radio）。
 * 用原生 radio，方向鍵與無障礙行為由瀏覽器處理。
 */
function Radio({
  name,
  checked,
  disabled,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: React.ReactNode;
}) {
  return (
    <label className={cn('relative flex min-w-0 items-start gap-2 type-sm-regular', disabled ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer text-foreground')}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="peer absolute mt-0.5 size-4 opacity-0" />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none mt-0.5 size-4 shrink-0 rounded-full border transition-[box-shadow,border-color] duration-150 peer-focus-visible:focus-ring',
          disabled ? 'border-muted-foreground opacity-60' : 'border-foreground',
          checked && 'bg-background shadow-[inset_0_0_0_4px_var(--foreground)]',
        )}
      />
      <span className="min-w-0">{label}</span>
    </label>
  );
}
