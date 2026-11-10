'use client';

// 座位圖（docs/spec/seating.md 2.1.3、2.1.4、3.11；原型 seating.html 的 geometry、fit、applyZoom、bindPan）。
// 場地圖以 CSS transform: scale() 縮放，只在座位圖區內捲動與平移；「適合視窗」讓 30 桌全部可見，
// 打開桌次詳情時只用沒被詳情蓋住的寬度（低於 35% 時改用整個座位圖區），場地圖在沒被蓋住的區域水平置中。
// 發布頁 /seats 也用這個元件（docs/spec/permissions.md 第 2.3 節、D-025）：工具列多了搜尋框（toolbarSearch，桌面在「適合視窗」右邊、
// 767 px 以下自成一列滿版）與下方的搜尋結果（belowToolbar）；hideCounts 時桌次不顯示人數；centerNonce 改變時場地圖水平置中、捲到最上方。
// 「全部展開」「自動排座」沒有傳入處理函式時不顯示（只能檢視時也沒有「自動排座」，SEAT-R90）。
import { FoldVertical, Maximize, PanelLeftOpen, UnfoldVertical, WandSparkles, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import { STAFF_TABLE_PLACEMENT, TABLE_LAYOUT } from '@/domain/layout';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { IconButton } from '@/components/ui/icon-button';
import { MapTable, type TableMode } from './map-table';
import { CAPACITY, type TableFace } from './model';

const PAD = 24;
const BAND = 56;
const GAP = 32;
export const MIN_ZOOM = 25;
export const MAX_ZOOM = 200;
/** 收合狀態下比例低於 80% 時改為精簡顯示（SEAT-R68） */
const COMPACT_BELOW = 0.8;
/** 桌次詳情的寬度（2.3.1） */
export const DETAIL_WIDTH = 360;

const LANDMARKS = [
  { label: '領獎區', cols: [0, 1] },
  { label: '舞台', cols: [2, 3] },
  { label: '控台', cols: [4, 5] },
  { label: '出入口', cols: [1, 4], bottom: true },
] as const;

/**
 * 收合是 88 px 圓形，展開是 256 px 卡片；卡片之間左右、上下各空 12 px：欄距 268 px、同一欄的列距 232 px（2.1.5、2.1.7、D-022）。
 * 有桌次超過 10 位時那一桌的卡片是 12 列、高 246 px，所有卡片的列距加大為 258 px，仍不會互相重疊（D-018、D-022）。
 */
export function geometry(expanded: boolean, anyOver = false) {
  const u = expanded
    ? anyOver
      ? { w: 268, h: 258, item: 256, itemH: 246 }
      : { w: 268, h: 232, item: 256, itemH: 220 }
    : { w: 112, h: 104, item: 88, itemH: 88 };
  const y0 = PAD + BAND + GAP;
  return { u, y0, W: PAD * 2 + 5 * u.w + u.item, H: y0 + 5 * u.h + u.itemH + GAP + BAND + PAD };
}
type Geometry = ReturnType<typeof geometry>;

export const clampPct = (pct: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(pct)));

type Size = { ow: number; oh: number; cw: number; ch: number };

/** 適合視窗的比例：用外框尺寸（扣掉 1 px 邊框）計算，不受捲軸出現或消失影響 */
function fitZoom(size: Size, g: Geometry, cover: number): number {
  const W = size.ow - 2;
  const H = size.oh - 2;
  const byH = (H - 16) / g.H;
  const zFor = (w: number) => Math.min((w - 16) / g.W, byH);
  let z = zFor(W - cover);
  if (z < 0.35) z = zFor(W);
  return Math.min(MAX_ZOOM / 100, Math.max(MIN_ZOOM / 100, z));
}

export interface SeatMapProps {
  /** 展開模式要傳 TableInfo（有名單）；發布頁傳 PublicTableFace（只有顯示名稱） */
  tables: ReadonlyMap<number, TableFace>;
  expanded: boolean;
  /** 手動縮放的比例（百分比）；null 是適合視窗 */
  manualPct: number | null;
  onManualPct: (pct: number | null) => void;
  /** 「全部展開／全部收合」；沒有時不顯示（發布頁） */
  onToggleExpanded?: () => void;
  /** 「自動排座」；沒有時不顯示（只能檢視、發布頁） */
  onAutoArrange?: () => void;
  /** 人員面板收合時，工具列的「顯示人員面板」 */
  onShowPanel?: () => void;
  /** 被桌次詳情蓋住的寬度（桌面打開詳情時） */
  covered: boolean;
  selected: number | 'staff' | null;
  /** 搜尋標示的桌次（2 px --accent）；nonce 改變時把第一桌捲到看得到的位置（SEAT-R62、PRM-R31） */
  hit: { tableIds: readonly number[]; nonce: number } | null;
  onOpen: (target: number | 'staff') => void;
  draggable: boolean;
  mobile: boolean;
  /** 浮在座位圖區右側的桌次詳情 */
  detail?: ReactNode;
  /** 發布頁：桌次不顯示人數與「已滿」「超過」（PRM-R24、D-025） */
  hideCounts?: boolean;
  /** 發布頁的搜尋框：桌面放在「適合視窗」右邊，767 px 以下排到工具列最後、自成一列滿版（D-025） */
  toolbarSearch?: ReactNode;
  /** 工具列下方、座位圖區上方的內容（發布頁的搜尋結果，D-025） */
  belowToolbar?: ReactNode;
  /** 改變時（以及第一次量到座位圖區大小時）把場地圖水平置中、捲到最上方（發布頁開啟與「全部展開」，PRM-R25） */
  centerNonce?: number;
}

export function SeatMap(props: SeatMapProps) {
  const { tables, expanded, manualPct, onManualPct, covered, hit, mobile } = props;
  const vpRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ ow: 0, oh: 0, cw: 0, ch: 0 });
  const anyOver = useMemo(() => [...tables.values()].some((t) => t.count > CAPACITY), [tables]);
  const g = useMemo(() => geometry(expanded, anyOver), [expanded, anyOver]);
  const cover = covered ? Math.min(DETAIL_WIDTH, size.ow) : 0;
  const z = manualPct != null ? manualPct / 100 : fitZoom(size, g, cover);
  const measured = size.ow > 0;

  const free = size.cw - cover - g.W * z;
  const offset = Math.max(0, Math.floor(free / 2));
  const stageW = offset + g.W * z + (free < 0 ? cover : 0);
  const stageH = g.H * z;
  const mode: TableMode = expanded ? 'expanded' : z < COMPACT_BELOW ? 'compact' : 'collapsed';

  // 座位圖區大小改變（視窗、Sidebar、人員面板）時：適合視窗重新計算，手動縮放只重新置中（SEAT-R64、SEAT-R71）
  useLayoutEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const read = () =>
      setSize((cur) => {
        const next = { ow: vp.offsetWidth, oh: vp.offsetHeight, cw: vp.clientWidth, ch: vp.clientHeight };
        return cur.ow === next.ow && cur.oh === next.oh && cur.cw === next.cw && cur.ch === next.ch ? cur : next;
      });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(vp);
    ro.observe(vp, { box: 'border-box' });
    return () => ro.disconnect();
  }, []);

  // 縮放後維持錨點（工具列以座位圖區中心、滾輪以游標位置為中心）
  const anchor = useRef<{ cx: number; cy: number; mx: number; my: number } | null>(null);
  const layout = useRef({ z, offset });
  useLayoutEffect(() => {
    layout.current = { z, offset };
    const vp = vpRef.current;
    const a = anchor.current;
    if (!vp || !a) return;
    anchor.current = null;
    vp.scrollLeft = a.cx * z + offset - a.mx;
    vp.scrollTop = a.cy * z - a.my;
  }, [z, offset]);

  const zoomTo = useCallback(
    (pct: number, at?: { clientX: number; clientY: number }) => {
      const vp = vpRef.current;
      if (vp) {
        const r = vp.getBoundingClientRect();
        const mx = at ? at.clientX - r.left - vp.clientLeft : vp.clientWidth / 2;
        const my = at ? at.clientY - r.top - vp.clientTop : vp.clientHeight / 2;
        const { z: cz, offset: co } = layout.current;
        anchor.current = { cx: (vp.scrollLeft + mx - co) / cz, cy: (vp.scrollTop + my) / cz, mx, my };
      }
      onManualPct(clampPct(pct));
    },
    [onManualPct],
  );

  const pct = Math.round(z * 100);

  // 按住 Ctrl（Mac 為 ⌘）加滾輪縮放，每一格乘 1.1 或 0.9，以游標位置為中心（SEAT-R66、SEAT-Q07）
  const pctRef = useRef(pct);
  useLayoutEffect(() => {
    pctRef.current = pct;
  }, [pct]);
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(pctRef.current * (e.deltaY < 0 ? 1.1 : 0.9), e);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  // 在空白處按住拖曳平移（滑鼠）；觸控的平移與雙指縮放交給瀏覽器
  const pan = useRef<{ x: number; y: number; left: number; top: number; id: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType !== 'mouse') return;
    const target = e.target as Element;
    if (target.closest('[role="group"],button,a,input,li,[data-no-pan]')) return;
    const vp = e.currentTarget;
    pan.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop, id: e.pointerId };
    vp.setPointerCapture(e.pointerId);
    setPanning(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pan.current;
    if (!p || p.id !== e.pointerId) return;
    e.currentTarget.scrollLeft = p.left - (e.clientX - p.x);
    e.currentTarget.scrollTop = p.top - (e.clientY - p.y);
  };
  const endPan = () => {
    pan.current = null;
    setPanning(false);
  };

  // 找人：把（第一個）標示的桌次捲到看得到、沒被詳情蓋住的位置（SEAT-R62、PRM-R31）
  useLayoutEffect(() => {
    const vp = vpRef.current;
    const first = hit?.tableIds[0];
    if (first === undefined || !vp || !measured) return;
    const place = first === STAFF_TABLE_ID ? STAFF_TABLE_PLACEMENT : TABLE_LAYOUT.find((t) => t.id === first);
    if (!place) return;
    const { z: cz, offset: co } = layout.current;
    const visible = vp.clientWidth - cover;
    const cx = PAD + place.col * g.u.w + g.u.item / 2;
    const cy = g.y0 + place.row * g.u.h + g.u.itemH / 2;
    vp.scrollTo({ left: co + cx * cz - visible / 2, top: cy * cz - vp.clientHeight / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在每次按下「{桌號}」時捲動一次
  }, [hit?.nonce, measured]);

  // 發布頁：開啟與按「全部展開」時水平置中、從最上方（舞台）開始（PRM-R25、D-025）
  useLayoutEffect(() => {
    const vp = vpRef.current;
    if (props.centerNonce === undefined || !vp || !measured) return;
    vp.scrollTo({ left: Math.max(0, (vp.scrollWidth - vp.clientWidth) / 2), top: 0 });
    // 只在開啟與每次按「全部展開」時置中一次
  }, [props.centerNonce, measured]);

  const landmarkTop = (bottom: boolean) => (bottom ? g.y0 + 5 * g.u.h + g.u.itemH + GAP : PAD);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
        {props.onShowPanel ? (
          <Button variant="outline" leadingIcon={<PanelLeftOpen />} onClick={props.onShowPanel} className={cn(mobile && 'flex-auto')}>
            顯示人員面板
          </Button>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <IconButton label="縮小" variant="outline" tooltip onClick={() => zoomTo(pct - 10)}>
            <ZoomOut />
          </IconButton>
          <span className="min-w-12 text-center type-sm-regular text-muted-foreground tabular-nums">{measured ? `${pct}%` : null}</span>
          <IconButton label="放大" variant="outline" tooltip onClick={() => zoomTo(pct + 10)}>
            <ZoomIn />
          </IconButton>
          <IconButton label="適合視窗" variant="outline" tooltip onClick={() => onManualPct(null)}>
            <Maximize />
          </IconButton>
        </span>
        {props.toolbarSearch ? <div className="min-w-0 max-md:order-last max-md:basis-full">{props.toolbarSearch}</div> : null}
        {props.onToggleExpanded ? (
          <Button
            variant="outline"
            leadingIcon={expanded ? <FoldVertical /> : <UnfoldVertical />}
            onClick={props.onToggleExpanded}
            className={cn(mobile && 'flex-auto')}
          >
            {expanded ? '全部收合' : '全部展開'}
          </Button>
        ) : null}
        {props.onAutoArrange ? (
          <span className="ml-auto">
            <Button variant="outline" leadingIcon={<WandSparkles />} onClick={props.onAutoArrange}>
              自動排座
            </Button>
          </span>
        ) : null}
      </div>
      {props.belowToolbar}
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={vpRef}
          role="region"
          aria-label="座位圖"
          tabIndex={-1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          className={cn(
            'relative min-h-0 min-w-0 flex-1 overflow-auto rounded-xl border border-border bg-background outline-none scrollbar-inset',
            '[touch-action:pan-x_pan-y_pinch-zoom]',
            mobile ? 'h-[62dvh] flex-none w-full' : '',
            panning ? 'cursor-grabbing select-none' : 'cursor-grab',
          )}
        >
          {/* 量到座位圖區大小之前也先畫（量測在繪製前完成，畫面上不會閃）；量不到大小的環境（測試）照樣有桌次 */}
          <div className="relative" style={{ width: stageW, height: stageH }}>
            <div
              className="absolute top-0 origin-top-left"
              style={{ left: offset, width: g.W, height: g.H, transform: `scale(${z})` }}
            >
              {LANDMARKS.map((l) => (
                <div
                  key={l.label}
                  className="absolute grid place-items-center rounded-lg bg-muted type-sm-medium text-muted-foreground"
                  style={{
                    left: PAD + l.cols[0] * g.u.w,
                    top: landmarkTop('bottom' in l && l.bottom),
                    width: (l.cols[1] - l.cols[0]) * g.u.w + g.u.item,
                    height: BAND,
                  }}
                >
                  {l.label}
                </div>
              ))}
              {[STAFF_TABLE_PLACEMENT, ...TABLE_LAYOUT].map((place) => {
                const info = tables.get(place.id);
                if (!info) return null;
                const key = place.id === STAFF_TABLE_ID ? 'staff' : place.id;
                return (
                  <MapTable
                    key={key}
                    info={info}
                    x={PAD + place.col * g.u.w}
                    y={g.y0 + place.row * g.u.h}
                    mode={mode}
                    scale={z}
                    selected={props.selected === key}
                    hit={hit?.tableIds.includes(place.id) ?? false}
                    draggable={props.draggable}
                    hideCounts={props.hideCounts}
                    onOpen={() => props.onOpen(key)}
                  />
                );
              })}
            </div>
          </div>
        </div>
        {props.detail}
      </div>
    </div>
  );
}
