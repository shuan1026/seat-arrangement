'use client';

// 桌次詳情與工作人員桌詳情（docs/spec/seating.md 2.3、2.5.2、3.12；原型 seating.html 的 tablePanel、staffPanel）。
// 桌面從座位圖區右側浮出（360 px，不是 modal，座位圖與人員面板仍可操作）；手機改為 Dialog（2.3.6、2.5.4）。
import { ArrowRightLeft, Eraser, GripVertical, UserPlus, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useAppStore } from '@/client/app-provider';
import { STAFF_TABLE_CAPACITY, type Participant } from '@/contracts/entities';
import { displayName } from '@/domain/display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { DialogBody, DialogFooter, overlayClasses, panelClasses } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { dropAttr, useDragState, useSeatingDraggable } from './drag';
import { CAPACITY, detailMeta, NOTE_SUGGESTIONS, type TableInfo } from './model';
import { NameLine } from './person-parts';
import { PersonMenu } from './person-menu';
import { useSeatingOps } from './use-seating-ops';

type Action = {
  key: string;
  label: string;
  variant: 'primary' | 'outline' | 'destructive-outline';
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

export interface TableDetailProps {
  info: TableInfo;
  mobile: boolean;
  draggable: boolean;
  onClose: () => void;
  onAddPeople: () => void;
  onSwap: () => void;
  onClear: () => void;
}

export function TableDetail(props: TableDetailProps) {
  const { info } = props;
  const title = info.isStaff ? '工作人員桌' : `第 ${info.id} 桌`;
  const subtitle = `${info.count}/${info.isStaff ? STAFF_TABLE_CAPACITY : CAPACITY} 人`;
  const body = info.isStaff ? <StaffBody {...props} /> : <TableBody {...props} />;
  const actions: Action[] = info.isStaff
    ? [{ key: 'add', label: '加入人員', variant: 'primary', icon: <UserPlus />, disabled: info.full, onClick: props.onAddPeople }]
    : [
        { key: 'add', label: '加入人員', variant: 'primary', icon: <UserPlus />, onClick: props.onAddPeople },
        { key: 'swap', label: '調換桌次…', variant: 'outline', icon: <ArrowRightLeft />, onClick: props.onSwap },
        // 空桌時停用（SEAT-Q06 的目前假設）
        { key: 'clear', label: '清空桌次', variant: 'destructive-outline', icon: <Eraser />, disabled: info.count === 0, onClick: props.onClear },
      ];
  const button = (a: Action, className?: string) => (
    <Button key={a.key} variant={a.variant} size={props.mobile ? 'md' : 'sm'} leadingIcon={a.icon} disabled={a.disabled} onClick={a.onClick} className={className}>
      {a.label}
    </Button>
  );

  if (props.mobile) {
    // 手機改為 Dialog（2.3.6）。和桌面的浮出面板一樣不是 modal：頁面其他部分不會被設為 aria-hidden，
    // 按背景、Esc 或關閉鈕關閉；按 Sonner（例如「復原」）或焦點移到其他對話框時不關閉。外觀沿用 Dialog 的遮罩與面板。
    return (
      <DialogPrimitive.Root open modal={false} onOpenChange={(open) => !open && props.onClose()}>
        <DialogPrimitive.Portal>
          <div className={overlayClasses}>
            <DialogPrimitive.Content
              className={cn(panelClasses, 'max-w-[560px]')}
              // 打開時不把焦點放進備註名稱欄位，避免手機一打開就跳出鍵盤（原型的做法）；焦點放在對話框本身
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
              }}
              // 開啟加入人員、調換桌次等對話框時焦點會移出詳情，不能因此關閉
              onFocusOutside={(e) => e.preventDefault()}
              onPointerDownOutside={(e) => {
                const target = e.target as Element | null;
                if (target?.closest?.('[data-sonner-toaster]')) e.preventDefault();
              }}
            >
              <div className="shrink-0 px-6 pt-6 pr-12">
                <DialogPrimitive.Title className="type-xl-semi-bold text-foreground">{title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 type-xs-regular text-muted-foreground">{subtitle}</DialogPrimitive.Description>
              </div>
              <DialogBody>{body}</DialogBody>
              {/* 手機按鈕滿版堆疊、主要按鈕在上（DOM 順序次要在前） */}
              <DialogFooter>{[...actions].reverse().map((a) => button(a))}</DialogFooter>
              <DialogPrimitive.Close
                aria-label="關閉"
                className="absolute top-3 right-3 inline-flex size-7 cursor-pointer items-center justify-center rounded-sm text-foreground outline-none transition-[background-color,box-shadow] duration-150 hover:bg-hover focus-visible:focus-ring [&_svg]:size-4"
              >
                <X aria-hidden />
              </DialogPrimitive.Close>
            </DialogPrimitive.Content>
          </div>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <section
      aria-label={title}
      className="absolute inset-y-0 right-0 flex w-[min(360px,100%)] flex-col rounded-xl border border-border bg-card text-card-foreground edge-popover"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border pt-4 pr-3 pb-3 pl-4">
        <div className="min-w-0">
          <h2 className="type-xl-semi-bold">{title}</h2>
          <p className="type-xs-regular text-muted-foreground">{subtitle}</p>
        </div>
        <IconButton label="關閉" size="sm" tooltip onClick={props.onClose}>
          <X />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 scrollbar-inset">{body}</div>
      <div className="flex flex-wrap gap-2 border-t border-border px-4 pt-3 pb-4">{actions.map((a) => button(a, 'flex-auto'))}</div>
    </section>
  );
}

function Meta({ items }: { items: ReactNode[] }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 type-sm-regular text-muted-foreground">{items}</div>;
}

const Strong = ({ children }: { children: ReactNode }) => <b className="type-sm-medium text-foreground">{children}</b>;

function TableBody({ info, draggable }: TableDetailProps) {
  return (
    <div className="flex flex-col gap-4">
      <NoteField key={`${info.id}:${info.noteName ?? ''}`} tableId={info.id} noteName={info.noteName} />
      <Meta
        items={[
          <span key="d">
            部門：<Strong>{info.labels.join('＋') || '—'}</Strong>
          </span>,
          <span key="c">
            兒童椅 <Strong>{info.childSeats}</Strong> 張
          </span>,
          <span key="v">
            素食 <Strong>{info.vegetarians}</Strong> 位
          </span>,
        ]}
      />
      <Roster info={info} draggable={draggable} hint="拖移可以調整順序，也可以從人員面板直接拖進來。" />
    </div>
  );
}

function StaffBody({ info, draggable }: TableDetailProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="type-xs-regular text-muted-foreground">活動當天值勤的員工，不算入座統計；匯出時列在座位表右上角。</p>
      <Meta
        items={[
          <span key="d">
            部門：<Strong>{info.labels.join('＋') || '—'}</Strong>
          </span>,
        ]}
      />
      <Roster info={info} draggable={draggable} hint="從人員面板或其他桌次拖進來，或按「加入人員」。只有員工可以放進來。" />
    </div>
  );
}

/** 備註名稱（SEAT-R12、SEAT-Q13）：離開欄位就儲存；按常用選項就取代欄位文字並立即儲存 */
function NoteField({ tableId, noteName }: { tableId: number; noteName: string | null }) {
  const ops = useSeatingOps();
  const [value, setValue] = useState(noteName ?? '');
  return (
    <div className="flex flex-col gap-2">
      <Input
        label="備註名稱"
        placeholder="例如主桌、董事貴賓、供應商"
        maxLength={20}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => ops.setNoteName(tableId, value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      <div className="flex flex-wrap gap-1.5">
        {NOTE_SUGGESTIONS.map((s) => (
          <Badge key={s} asChild variant="outline">
            <button
              type="button"
              // 按下時不讓欄位失去焦點，避免先存一次欄位裡的舊文字
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setValue(s);
                ops.setNoteName(tableId, s);
              }}
            >
              {s}
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

/** 名單：固定 10 列；一般桌可以拖移調整順序，也接受從人員面板拖進來（2.3.2、2.5.2） */
function Roster({ info, draggable, hint }: { info: TableInfo; draggable: boolean; hint: string }) {
  const headingId = useId();
  const listOver = useDragState((s) =>
    info.isStaff ? s.target?.kind === 'staff' && s.target.area === 'detail' : s.target?.kind === 'table' && s.target.tableId === info.id && s.target.area === 'detail',
  );
  const blocked = useDragState((s) => s.blocked);
  const overRow = useDragState((s) =>
    !info.isStaff && s.target?.kind === 'table' && s.target.tableId === info.id && s.target.area === 'detail' ? (s.target.index ?? null) : null,
  );
  return (
    <div>
      <h3 id={headingId} className="mb-1 type-sm-medium">
        名單
      </h3>
      <p className="mb-2 type-xs-regular text-muted-foreground">{hint}</p>
      <ol
        aria-labelledby={headingId}
        data-drop={info.isStaff ? dropAttr.staff : dropAttr.detail(info.id)}
        data-drop-area="detail"
        className={cn(
          'm-0 flex list-none flex-col gap-1 rounded-md p-0',
          listOver && !blocked && 'shadow-[inset_0_0_0_1px_var(--primary)]',
          listOver && blocked && 'cursor-not-allowed',
        )}
      >
        {Array.from({ length: CAPACITY }, (_, i) => (
          <DetailRow
            key={info.roster[i]?.id ?? `empty-${i}`}
            info={info}
            index={i}
            person={info.roster[i]}
            over={overRow === i && !blocked}
            draggable={draggable}
          />
        ))}
      </ol>
    </div>
  );
}

function DetailRow({
  info,
  index,
  person,
  over,
  draggable,
}: {
  info: TableInfo;
  index: number;
  person: Participant | undefined;
  over: boolean;
  draggable: boolean;
}) {
  const dir = useAppStore((s) => s.dir);
  const { setNodeRef, listeners, attributes, isDragging } = useSeatingDraggable(
    `person:${person?.id ?? `empty-${info.id}-${index}`}:detail`,
    { kind: 'person', participantId: person?.id ?? -1, origin: info.isStaff ? 'staffDetail' : 'detail' },
    { disabled: !draggable || !person, role: 'listitem' },
  );
  // 工作人員桌的名單不能調整順序（SEAT-R34），名單列不是放置位置
  const dropProps = info.isStaff ? {} : { 'data-drop': dropAttr.row(info.id, index), 'data-drop-area': 'detail' };
  const idx = <span className="w-4 shrink-0 text-muted-foreground tabular-nums">{index + 1}</span>;
  if (!person) {
    return (
      <li
        {...dropProps}
        className={cn(
          'flex min-h-10 items-center gap-2 rounded-md bg-muted py-0.5 pr-1 pl-2 type-sm-regular text-muted-foreground',
          over && 'shadow-[inset_0_0_0_1px_var(--primary)]',
        )}
      >
        {draggable ? <span aria-hidden className="size-4 shrink-0" /> : null}
        {idx}空位
      </li>
    );
  }
  const active = draggable;
  return (
    <li
      ref={setNodeRef}
      {...dropProps}
      {...(active ? { ...attributes, ...listeners } : {})}
      className={cn(
        'flex min-h-10 min-w-0 items-center gap-2 rounded-md py-0.5 pr-1 pl-2 outline-none hover:bg-hover focus-visible:focus-ring',
        active && 'cursor-grab',
        isDragging && 'opacity-50',
        over && 'shadow-[inset_0_0_0_1px_var(--primary)]',
      )}
    >
      {active ? <GripVertical aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : null}
      {idx}
      <div className="min-w-0 flex-1">
        <NameLine person={person} name={displayName(person, dir)} />
        <div className="type-xs-regular text-muted-foreground [overflow-wrap:anywhere]">{detailMeta(person, dir)}</div>
      </div>
      <PersonMenu person={person} place={info.isStaff ? 'staffDetail' : 'detail'} />
    </li>
  );
}
