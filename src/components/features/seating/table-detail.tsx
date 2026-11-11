'use client';

// 桌次詳情與工作人員桌詳情（docs/spec/seating.md 2.3、2.5.2、3.12；原型 seating.html 的 tablePanel、staffPanel）。
// 桌面從座位圖區右側浮出（360 px，不是 modal，座位圖與人員面板仍可操作）；手機改為 Dialog（2.3.6、2.5.4）。
// 名單固定 10 列，11、12 位時 12 列；有 12 位時「加入人員」停用（SEAT-R30、SEAT-R42、D-018）。
// 只能檢視（readOnly，SEAT-R90）：沒有備註名稱欄位與常用選項、名單說明、列操作、拖移與底部按鈕；
// 備註名稱改以文字顯示在副標下方。外框（DetailShell）發布頁的桌次名單也用（docs/spec/permissions.md 第 2.3 節）。
// 桌子與位置分開（D-027）：場上的桌另有「移到暫存區」「刪除桌」；暫存的桌（2.3.7）標題「暫存區的桌」，只有「放到…」「刪除桌」，
// 人不能拖進來、桌內不能調整順序，名單說明不顯示；EmptySlotPanel 是「未放桌」的位置面板（2.3.8），只有「新增桌」。
import { Archive, ArrowRightLeft, Eraser, GripVertical, MapPin, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useAppStore } from '@/client/app-provider';
import type { Participant } from '@/contracts/entities';
import { displayName } from '@/domain/display';
import { tableCodeLabel, tableTitle } from '@/domain/layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { DialogBody, DialogFooter, overlayClasses, panelClasses } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { dropAttr, useDragState, useSeatingDraggable } from './drag';
import { CAPACITY, detailMeta, NOTE_SUGGESTIONS, rosterRows, type TableInfo } from './model';
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
  /** 只能檢視：隱藏所有會修改資料的入口（SEAT-R90） */
  readOnly?: boolean;
  onClose: () => void;
  onAddPeople: () => void;
  onSwap: () => void;
  onClear: () => void;
  /** 「移到暫存區」（SEAT-R91） */
  onMoveToStaging?: () => void;
  /** 暫存的桌的「放到…」（SEAT-R93） */
  onPlace?: () => void;
  /** 「刪除桌」（SEAT-R97） */
  onDelete?: () => void;
}

/** 詳情的標題（2.3.1、2.3.7）：「{桌號} 桌」、「暫存區的桌（{備註名稱}）」或「工作人員桌」 */
export function detailTitle(info: Pick<TableInfo, 'isStaff' | 'position' | 'noteName'>): string {
  if (info.isStaff) return '工作人員桌';
  if (info.position === null) return info.noteName ? `暫存區的桌（${info.noteName}）` : '暫存區的桌';
  return tableTitle(info.position);
}

export function TableDetail(props: TableDetailProps) {
  const { info, readOnly = false } = props;
  const staged = !info.isStaff && info.position === null;
  const title = detailTitle(info);
  // 副標照實寫人數，例如「11/10 人」（SEAT-R11）
  const subtitle = `${info.count}/${CAPACITY} 人`;
  const body = info.isStaff ? <StaffBody {...props} /> : <TableBody {...props} />;
  const add: Action = { key: 'add', label: '加入人員', variant: 'primary', icon: <UserPlus />, disabled: info.max, onClick: props.onAddPeople };
  const remove: Action = { key: 'delete', label: '刪除桌', variant: 'destructive-outline', icon: <Trash2 />, onClick: () => props.onDelete?.() };
  const actions: Action[] = readOnly
    ? []
    : info.isStaff
      ? [add]
      : staged
        ? [{ key: 'place', label: '放到…', variant: 'primary', icon: <MapPin />, onClick: () => props.onPlace?.() }, remove]
        : [
            add,
            { key: 'swap', label: '調換桌次…', variant: 'outline', icon: <ArrowRightLeft />, onClick: props.onSwap },
            { key: 'stage', label: '移到暫存區', variant: 'outline', icon: <Archive />, onClick: () => props.onMoveToStaging?.() },
            // 空桌時停用（SEAT-Q06 的目前假設）
            { key: 'clear', label: '清空桌次', variant: 'destructive-outline', icon: <Eraser />, disabled: info.count === 0, onClick: props.onClear },
            remove,
          ];
  const button = (a: Action, className?: string) => (
    <Button key={a.key} variant={a.variant} size={props.mobile ? 'md' : 'sm'} leadingIcon={a.icon} disabled={a.disabled} onClick={a.onClick} className={className}>
      {a.label}
    </Button>
  );
  return (
    <DetailShell
      title={title}
      subtitle={subtitle}
      // 只能檢視：備註名稱以文字顯示在副標下方，沒有時不顯示這一行（SEAT-R90）
      noteName={readOnly ? info.noteName : null}
      mobile={props.mobile}
      onClose={props.onClose}
      footer={
        actions.length === 0
          ? null
          : props.mobile
            ? // 手機按鈕滿版堆疊、主要按鈕在上（DOM 順序次要在前）
              [...actions].reverse().map((a) => button(a))
            : actions.map((a) => button(a, 'flex-auto'))
      }
    >
      {body}
    </DetailShell>
  );
}

export interface DetailShellProps {
  /** 「{桌號} 桌」或「工作人員桌」；也是面板與對話框的無障礙名稱 */
  title: string;
  /** 「{人數}/10 人」 */
  /** 「{已入座}/10 人」；發布頁不顯示人數，沒有副標（D-025） */
  subtitle?: string;
  /** 副標下方的備註名稱文字（Text-sm/Medium）；沒有時不顯示 */
  noteName?: string | null;
  mobile: boolean;
  onClose: () => void;
  /** 底部按鈕；沒有時不顯示按鈕列 */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * 桌次詳情的外框（2.3.1、2.3.6）：桌面從座位圖區右側浮出（360 px，不是 modal），手機改為 Dialog。
 * 標題、關閉鈕與副標在上方，內容可捲動，底部按鈕列可省略。
 */
export function DetailShell({ title, subtitle, noteName, mobile, onClose, footer, children }: DetailShellProps) {
  const note = noteName ? <p className="mt-1 type-sm-medium text-foreground [overflow-wrap:anywhere]">{noteName}</p> : null;
  if (mobile) {
    // 手機改為 Dialog（2.3.6）。和桌面的浮出面板一樣不是 modal：頁面其他部分不會被設為 aria-hidden，
    // 按背景、Esc 或關閉鈕關閉；按 Sonner（例如「復原」）或焦點移到其他對話框時不關閉。外觀沿用 Dialog 的遮罩與面板。
    return (
      <DialogPrimitive.Root open modal={false} onOpenChange={(open) => !open && onClose()}>
        <DialogPrimitive.Portal>
          <div className={overlayClasses}>
            <DialogPrimitive.Content
              className={cn(panelClasses, 'max-w-[560px]')}
              // 沒有副標時沒有 Description，不指向它
              {...(subtitle ? {} : { 'aria-describedby': undefined })}
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
                {subtitle ? (
                  <DialogPrimitive.Description className="mt-1 type-xs-regular text-muted-foreground">{subtitle}</DialogPrimitive.Description>
                ) : null}
                {note}
              </div>
              <DialogBody className={cn(!footer && 'pb-6')}>{children}</DialogBody>
              {footer ? <DialogFooter>{footer}</DialogFooter> : null}
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
          {subtitle ? <p className="type-xs-regular text-muted-foreground">{subtitle}</p> : null}
          {note}
        </div>
        <IconButton label="關閉" size="sm" tooltip onClick={onClose}>
          <X />
        </IconButton>
      </div>
      {/* 底部按鈕跟著內容捲動：內容短時停在面板底部，名單長時排在名單後面，不佔名單的高度（桌次詳情的按鈕有兩列，D-027） */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-inset">
        <div className="flex flex-col gap-4 p-4">{children}</div>
        {footer ? <div className="mt-auto flex flex-wrap gap-2 border-t border-border px-4 pt-3 pb-4">{footer}</div> : null}
      </div>
    </section>
  );
}

export function Meta({ items }: { items: ReactNode[] }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 type-sm-regular text-muted-foreground">{items}</div>;
}

/**
 * 「部門：{部門}」「兒童椅 {n} 張」這類一項資訊：數值用 Text-sm/Medium 強調（原型 .tp-meta b）。
 * 輔助技術讀同一句完整的文字，不會把標籤和數值拆成兩段。
 */
export function MetaItem({ before, value, after = '' }: { before: string; value: string | number; after?: string }) {
  return (
    <span>
      <span aria-hidden="true">
        {before}
        <b className="type-sm-medium text-foreground">{value}</b>
        {after}
      </span>
      <span className="sr-only">{`${before}${value}${after}`}</span>
    </span>
  );
}

function TableBody({ info, mobile, draggable, readOnly = false }: TableDetailProps) {
  return (
    <div className="flex flex-col gap-4">
      {readOnly ? null : <NoteField key={`${info.id}:${info.noteName ?? ''}`} tableId={info.id} noteName={info.noteName} />}
      <Meta
        items={[
          <MetaItem key="d" before="部門：" value={info.labels.join('＋') || '—'} />,
          <MetaItem key="c" before="兒童椅 " value={info.childSeats} after=" 張" />,
          <MetaItem key="v" before="素食 " value={info.vegetarians} after=" 位" />,
        ]}
      />
      <Roster
        info={info}
        draggable={draggable && !readOnly}
        readOnly={readOnly}
        // 手機不能拖移（SEAT-R82），名單說明不顯示（2.3.6、D-023）；只能檢視時也不顯示（SEAT-R90）；暫存的桌不能拖進來也不能調整順序，沒有說明（2.3.7）
        hint={readOnly || mobile || info.position === null ? null : '拖移可以調整順序，也可以從人員面板直接拖進來。'}
      />
    </div>
  );
}

function StaffBody({ info, draggable, readOnly = false }: TableDetailProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="type-xs-regular text-muted-foreground">活動當天值勤的員工，不算入座統計；匯出時列在座位表右上角。</p>
      <Meta items={[<MetaItem key="d" before="部門：" value={info.labels.join('＋') || '—'} />]} />
      <Roster
        info={info}
        draggable={draggable && !readOnly}
        readOnly={readOnly}
        hint={readOnly ? null : '從人員面板或其他桌次拖進來，或按「加入人員」。只有員工可以放進來。'}
      />
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

/** 名單：固定 10 列（11、12 位時 12 列）；一般桌可以拖移調整順序，也接受從人員面板拖進來（2.3.2、2.5.2） */
function Roster({ info, draggable, readOnly, hint }: { info: TableInfo; draggable: boolean; readOnly: boolean; hint: string | null }) {
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
      {hint ? <p className="mb-2 type-xs-regular text-muted-foreground">{hint}</p> : null}
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
        {Array.from({ length: rosterRows(info.count) }, (_, i) => (
          <DetailRow
            key={info.roster[i]?.id ?? `empty-${i}`}
            info={info}
            index={i}
            person={info.roster[i]}
            over={overRow === i && !blocked}
            draggable={draggable}
            readOnly={readOnly}
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
  readOnly,
}: {
  info: TableInfo;
  index: number;
  person: Participant | undefined;
  over: boolean;
  draggable: boolean;
  readOnly: boolean;
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
      {readOnly ? null : <PersonMenu person={person} place={info.isStaff ? 'staffDetail' : 'detail'} />}
    </li>
  );
}

/** 「未放桌」的位置面板（2.3.8、SEAT-R95、SEAT-R96）：標題是位置代碼，內文「這個位置沒有擺桌。」，按鈕「新增桌」 */
export function EmptySlotPanel({
  position,
  mobile,
  onClose,
  onCreate,
}: {
  position: number;
  mobile: boolean;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <DetailShell
      title={tableCodeLabel(position)}
      mobile={mobile}
      onClose={onClose}
      footer={
        <Button variant="primary" size={mobile ? 'md' : 'sm'} leadingIcon={<Plus />} onClick={onCreate} className={mobile ? undefined : 'flex-auto'}>
          新增桌
        </Button>
      }
    >
      <p className="type-sm-regular text-muted-foreground">這個位置沒有擺桌。</p>
    </DetailShell>
  );
}
