'use client';

// 座位圖上的一桌與工作人員桌（docs/spec/seating.md 2.1.5～2.1.9、2.5.1；原型 seating.html 的 tableHTML、staffTableHTML）。
// 收合：88 px 圓形；精簡（縮放低於 80%）：只有大號桌號與人數；展開：256 px 名單卡片（D-022），固定 10 列、兩欄各 5 列，
// 這一桌有 11、12 位時 12 列、兩欄各 6 列，卡片跟著變高（D-018）。
// 人數：0–9 位「{n}/10」，10 位正向徽章「已滿」，11、12 位待處理徽章「超過」（triangle-alert 圖示，SEAT-R11、2.1.9）。
// 發布頁 /seats 也用這個元件（docs/spec/permissions.md 第 2.3 節、D-025）：沒有拖移把手，hideCounts 時不顯示人數與「已滿」「超過」，
// 無障礙名稱也不含人數；展開時用 PublicCard（名單只有座號與顯示名稱）。收合時只讀 TableFace。
import { GripVertical, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAppStore } from '@/client/app-provider';
import type { Participant } from '@/contracts/entities';
import { displayName } from '@/domain/display';
import { tableCodeLabel, tableTitle } from '@/domain/layout';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import { dropAttr, useDragState, useIsDragging, useSeatingDraggable } from './drag';
import {
  CAPACITY,
  isPublicTableFace,
  isTableInfo,
  rosterRows,
  tableTooltip,
  type PublicTableFace,
  type TableFace,
  type TableInfo,
} from './model';
import { SeatMarks } from './person-parts';

export type TableMode = 'collapsed' | 'compact' | 'expanded';

export interface MapTableProps {
  /** 展開模式要有名單（TableInfo）；收合與精簡顯示只要 TableFace */
  info: TableFace;
  x: number;
  y: number;
  mode: TableMode;
  selected: boolean;
  hit: boolean;
  /** 座位圖目前的縮放比例（拖曳影像照同樣大小畫） */
  scale: number;
  /** 桌面才能拖移（SEAT-R82） */
  draggable: boolean;
  onOpen: () => void;
  /** 發布頁：不顯示人數與「已滿」「超過」，無障礙名稱也不含人數（PRM-R24、D-025） */
  hideCounts?: boolean;
}

/** 收合時的 Tooltip；拖移中不顯示，避免擋到放置目標 */
function MapTooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dragging = useIsDragging();
  return (
    <Tooltip content={content} open={open && !dragging} onOpenChange={setOpen}>
      {children}
    </Tooltip>
  );
}

function useDropState(info: TableFace) {
  return useDragState((s) => {
    const t = s.target;
    const over = info.isStaff ? t?.kind === 'staff' && t.area === 'map' : t?.kind === 'table' && t.tableId === info.id && t.area === 'map';
    return {
      over: over && !s.blocked,
      blocked: over && s.blocked,
      overRow: !info.isStaff && t?.kind === 'table' && t.tableId === info.id && t.area === 'map' ? (t.index ?? null) : null,
      swapSource: s.source?.kind === 'table' && s.source.tableId === info.id,
    };
  });
}

/**
 * 圓形或卡片的外框：空桌虛線、已選取與可放置用 --primary、搜尋標示 2 px --accent（2.1.9）。
 * 搜尋標示的邊框多 1 px，呼叫端的內距要同步少 1 px（circlePadding、cardPadding），內容的位置與寬度才不變，
 * 精簡顯示的「已滿」「超過」徽章也不會被擠到截斷
 */
function frameClasses(info: TableFace, { over, selected, hit }: { over: boolean; selected: boolean; hit: boolean }) {
  const empty = info.count === 0;
  return cn(
    'bg-card text-card-foreground transition-[border-color,box-shadow] duration-150 outline-none',
    hit
      ? 'border-2 border-accent'
      : over
        ? 'border border-primary'
        : selected
          ? 'border border-primary'
          : cn('border border-border hover:border-border-hover', empty && 'border-dashed'),
    over ? '[box-shadow:var(--edge-highlight),var(--shadow-md)]' : 'edge-card',
    'focus-visible:[box-shadow:var(--edge-highlight),var(--shadow-xs),var(--shadow-focus-ring)]',
  );
}

/** 圓形左右內距 8 px；搜尋標示（邊框 2 px）時 7 px */
const circlePadding = (hit: boolean) => (hit ? 'px-[7px]' : 'px-2');
/** 卡片內距 12 px；搜尋標示（邊框 2 px）時 11 px */
const cardPadding = (hit: boolean) => (hit ? 'p-[11px]' : 'p-3');

function CountOrFull({ info, mode }: { info: TableFace; mode: TableMode }) {
  // 精簡顯示時徽章放大：高 28 px、Text-base/Medium（2.1.6）
  const large = mode === 'compact' && 'h-7! px-2! type-base-medium! [&_svg]:size-4!';
  if (info.status === 'over') {
    return (
      <Badge variant="pending" icon={<TriangleAlert />} className={cn(large)}>
        超過
      </Badge>
    );
  }
  if (info.status === 'full') {
    return (
      <Badge variant="positive" className={cn(large)}>
        已滿
      </Badge>
    );
  }
  return (
    <span className={cn('whitespace-nowrap tabular-nums', mode === 'compact' ? 'type-lg-medium' : 'type-xs-medium')}>
      {info.count}/{CAPACITY}
    </span>
  );
}

/**
 * 收合時桌號的字級：一般收合 Text-xl（2.1.5）；精簡顯示 Text-4xl（2.1.6）。
 * 有拖移把手（桌面）時，三個字元的桌號（A10～A15、B10～B15）改用 Text-3xl，不然最後一個字會被右上角 36 px 的把手蓋住（D-019）
 */
function codeFont(code: string, mode: TableMode, withHandle: boolean): string {
  if (mode !== 'compact') return 'type-xl-semi-bold leading-6';
  return withHandle && code.length > 2
    ? '[font:var(--text-3xl-semi-bold)] [font-family:var(--font-sans)]'
    : '[font:var(--text-4xl-semi-bold)] [font-family:var(--font-sans)]';
}

/** 拖移把手：只能從這裡拖整桌去對調（SEAT-R35、SEAT-R37）；Tooltip 與無障礙名稱「拖移調換桌次」 */
function Handle({ info, mode, scale }: { info: TableFace; mode: TableMode; scale: number }) {
  const { setNodeRef, listeners, attributes } = useSeatingDraggable(`table:${info.id}`, { kind: 'table', tableId: info.id }, { scale });
  return (
    <MapTooltip content="拖移調換桌次">
      <IconButton
        ref={setNodeRef}
        label="拖移調換桌次"
        variant="outline"
        size="xs"
        className={cn(
          'cursor-grab!',
          mode === 'compact' ? 'absolute! -top-2.5 -right-2.5 size-9! rounded-md!' : mode === 'collapsed' ? 'absolute! -top-1.5 -right-1.5 size-6!' : 'size-6!',
        )}
        {...listeners}
        {...attributes}
      >
        <GripVertical />
      </IconButton>
    </MapTooltip>
  );
}

export function MapTable(props: MapTableProps) {
  const { info, x, y, mode, scale, draggable } = props;
  const drop = useDropState(info);
  // 收合時只顯示桌號「A1」，展開與無障礙名稱寫「A1 桌」（SEAT-R04、D-019）
  const code = tableCodeLabel(info.id);
  const name = info.isStaff ? '工作人員桌' : tableTitle(info.id);
  const tooltip = info.isStaff ? `工作人員桌・${info.label}` : tableTooltip(info);
  const ariaLabel = info.isStaff
    ? tooltip
    : props.hideCounts
      ? [name, info.noteName, info.label].filter(Boolean).join('，')
      : `${name}，${info.noteName ? `${info.noteName}，` : ''}${info.label}，${info.count}/${CAPACITY}`;

  return (
    <div
      role="group"
      aria-label={name}
      data-drop={info.isStaff ? dropAttr.staff : dropAttr.table(info.id)}
      className={cn('absolute', drop.swapSource && 'opacity-60')}
      style={{ left: x, top: y }}
    >
      {mode === 'expanded' && isTableInfo(info) ? (
        <ExpandedCard {...props} info={info} name={name} ariaLabel={ariaLabel} drop={drop} />
      ) : mode === 'expanded' && isPublicTableFace(info) ? (
        <PublicCard info={info} selected={props.selected} hit={props.hit} onOpen={props.onOpen} name={name} ariaLabel={ariaLabel} />
      ) : (
        <>
          <MapTooltip content={tooltip}>
            <button
              type="button"
              aria-label={ariaLabel}
              onClick={props.onOpen}
              className={cn(
                'flex size-[88px] flex-col items-center justify-center gap-px rounded-full text-center',
                circlePadding(props.hit),
                frameClasses(info, { over: drop.over, selected: props.selected, hit: props.hit }),
                drop.blocked ? 'cursor-not-allowed' : 'cursor-pointer',
                mode === 'compact' && 'gap-0',
              )}
            >
              {info.isStaff ? (
                <span className={cn('whitespace-nowrap', mode === 'compact' ? 'type-lg-semi-bold' : 'type-sm-semi-bold')}>工作人員</span>
              ) : (
                <span className={cn('whitespace-nowrap', codeFont(code, mode, draggable), info.count === 0 && 'text-muted-foreground')}>{code}</span>
              )}
              {!info.isStaff && mode !== 'compact' ? (
                <span className="max-w-full truncate type-xs-regular text-muted-foreground">{info.noteName || info.label}</span>
              ) : null}
              {props.hideCounts ? null : <CountOrFull info={info} mode={mode} />}
            </button>
          </MapTooltip>
          {draggable && !info.isStaff ? <Handle info={info} mode={mode} scale={scale} /> : null}
        </>
      )}
    </div>
  );
}

function ExpandedCard({
  info,
  selected,
  hit,
  scale,
  draggable,
  onOpen,
  name,
  ariaLabel,
  drop,
}: MapTableProps & { info: TableInfo; name: string; ariaLabel: string; drop: ReturnType<typeof useDropState> }) {
  const dir = useAppStore((s) => s.dir);
  const rows = rosterRows(info.count);
  return (
    // 整張卡片（把手以外）都能點開詳情（SEAT-R72）；鍵盤用標頭的按鈕。12 列時卡片從 220 px 加高到 246 px（多一列 24 px 與列距 2 px）
    <div
      onClick={onOpen}
      className={cn(
        'flex w-[256px] flex-col rounded-xl',
        cardPadding(hit),
        rows > CAPACITY ? 'h-[246px]' : 'h-[220px]',
        frameClasses(info, { over: drop.over, selected, hit }),
        drop.blocked ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      <div className="flex min-h-6 min-w-0 items-start gap-2">
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className={cn(
            'min-w-0 flex-1 truncate rounded-sm text-left type-xl-semi-bold leading-6 outline-none focus-visible:focus-ring',
            info.count === 0 && 'text-muted-foreground',
            drop.blocked ? 'cursor-not-allowed' : 'cursor-pointer',
          )}
        >
          {name}
        </button>
        <CountOrFull info={info} mode="expanded" />
        {draggable && !info.isStaff ? <Handle info={info} mode="expanded" scale={scale} /> : null}
      </div>
      {info.noteName ? <div className="truncate type-sm-medium">{info.noteName}</div> : null}
      <div className="mb-2 truncate type-xs-regular text-muted-foreground">{info.label}</div>
      <ol
        className={cn(
          'm-0 grid list-none grid-flow-col grid-cols-2 gap-x-2 gap-y-0.5 p-0',
          rows > CAPACITY ? 'grid-rows-6' : 'grid-rows-5',
        )}
      >
        {Array.from({ length: rows }, (_, i) => (
          <CardRow
            key={info.roster[i]?.id ?? `empty-${i}`}
            tableId={info.id}
            isStaff={info.isStaff}
            index={i}
            person={info.roster[i]}
            name={info.roster[i] ? displayName(info.roster[i]!, dir) : ''}
            over={drop.overRow === i}
            scale={scale}
            draggable={draggable}
          />
        ))}
      </ol>
    </div>
  );
}

/**
 * 發布頁的展開卡片（docs/spec/permissions.md 第 2.3 節、D-025）：外形、尺寸同 ExpandedCard（D-022），
 * 標頭只有「{桌號} 桌」（不顯示人數與「已滿」「超過」），名單列只有座號與顯示名稱（不放「賓」、兒童椅、素食徽章），
 * 空位列照樣是「空位」；不能拖移，整張卡片都能點開那一桌的名單（PRM-R26）
 */
function PublicCard({
  info,
  selected,
  hit,
  onOpen,
  name,
  ariaLabel,
}: Pick<MapTableProps, 'selected' | 'hit' | 'onOpen'> & { info: PublicTableFace; name: string; ariaLabel: string }) {
  const rows = rosterRows(info.count);
  return (
    <div
      onClick={onOpen}
      className={cn(
        'flex w-[256px] cursor-pointer flex-col rounded-xl',
        cardPadding(hit),
        rows > CAPACITY ? 'h-[246px]' : 'h-[220px]',
        frameClasses(info, { over: false, selected, hit }),
      )}
    >
      <div className="flex min-h-6 min-w-0 items-start gap-2">
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className={cn(
            'min-w-0 flex-1 cursor-pointer truncate rounded-sm text-left type-xl-semi-bold leading-6 outline-none focus-visible:focus-ring',
            info.count === 0 && 'text-muted-foreground',
          )}
        >
          {name}
        </button>
      </div>
      {info.noteName ? <div className="truncate type-sm-medium">{info.noteName}</div> : null}
      <div className="mb-2 truncate type-xs-regular text-muted-foreground">{info.label}</div>
      <ol
        className={cn(
          'm-0 grid list-none grid-flow-col grid-cols-2 gap-x-2 gap-y-0.5 p-0',
          rows > CAPACITY ? 'grid-rows-6' : 'grid-rows-5',
        )}
      >
        {Array.from({ length: rows }, (_, i) => {
          const person = info.names[i];
          const idx = <span className="w-3.5 shrink-0 text-muted-foreground tabular-nums">{i + 1}</span>;
          return person === undefined ? (
            <li key={i} className="flex h-6 min-w-0 items-center gap-1 rounded-sm bg-muted px-1 type-xs-regular text-muted-foreground">
              {idx}空位
            </li>
          ) : (
            <li key={i} className="flex h-6 min-w-0 items-center gap-1 rounded-sm px-1 type-xs-regular">
              {idx}
              <span className="shrink-0 whitespace-nowrap">{person}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** 展開卡片的名單列（2.1.8）：24 px 高；姓名完整顯示；空位列底色 --muted */
function CardRow({
  tableId,
  isStaff,
  index,
  person,
  name,
  over,
  scale,
  draggable,
}: {
  tableId: number;
  isStaff: boolean;
  index: number;
  person: Participant | undefined;
  name: string;
  over: boolean;
  scale: number;
  draggable: boolean;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useSeatingDraggable(
    `person:${person?.id ?? `empty-${tableId}-${index}`}:card`,
    { kind: 'person', participantId: person?.id ?? -1, origin: isStaff ? 'staffCard' : 'card' },
    { disabled: !draggable || !person, scale, role: 'listitem' },
  );
  const idx = <span className="w-3.5 shrink-0 text-muted-foreground tabular-nums">{index + 1}</span>;
  // 工作人員桌的名單不能調整順序（SEAT-R34），名單列不是放置位置，放在卡片上就是放進工作人員桌
  const dropProps = isStaff ? {} : { 'data-drop': dropAttr.row(tableId, index) };
  if (!person) {
    return (
      <li
        {...dropProps}
        className={cn(
          'flex h-6 min-w-0 items-center gap-1 rounded-sm bg-muted px-1 type-xs-regular text-muted-foreground',
          over && 'shadow-[inset_0_0_0_1px_var(--primary)]',
        )}
      >
        {idx}空位
      </li>
    );
  }
  return (
    <li
      ref={setNodeRef}
      {...dropProps}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      className={cn(
        'flex h-6 min-w-0 items-center gap-1 rounded-sm px-1 type-xs-regular outline-none focus-visible:focus-ring',
        draggable && 'cursor-grab',
        isDragging && 'opacity-50',
        over && 'shadow-[inset_0_0_0_1px_var(--primary)]',
      )}
    >
      {idx}
      <span className="shrink-0 whitespace-nowrap">{name}</span>
      <SeatMarks person={person} />
    </li>
  );
}
