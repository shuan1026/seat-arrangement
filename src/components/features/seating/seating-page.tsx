'use client';

// 座位安排頁（docs/spec/seating.md；版面依 ui-design-system/source-reference/html/seating.html）：
// 頁首（H1、統計列、新增人員、匯出座位表）、工作區（人員面板 280 px ＋ 座位圖，桌次詳情浮在座位圖區右側）。
// 手機（767 px 以下）用分頁切換座位圖與人員，不提供拖移，桌次詳情改為 Dialog。
import { Download, GripVertical, Plus } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAppStore } from '@/client/app-provider';
import { downloadBlob } from '@/client/download';
import { STAFF_TABLE_ID, type Participant } from '@/contracts/entities';
import { displayName } from '@/domain/display';
import { seatingStats } from '@/domain/seating-rules';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notify } from '@/components/ui/toaster';
import { SeatingDnd, type DragSource, type DropTarget, type ResolveDrop } from './drag';
import { buildTables, msg, seatMessage, sortPeople } from './model';
import { PeoplePanel } from './people-panel';
import { usePersonActions } from './person-actions';
import { SeatingUiContext, type SeatingUi } from './person-menu';
import { AddPeopleDialog, AutoArrangeDialog, ClearDialog, SwapDialog } from './seating-dialogs';
import { SeatingSkeleton } from './seating-skeleton';
import { clampPct, SeatMap } from './seat-map';
import { TableDetail } from './table-detail';
import { TableSelectDialog } from './table-select-dialog';
import { useSeatingOps } from './use-seating-ops';
import { useIsMobile, useViewPrefs, useWideDesktop } from './view-prefs';

const subscribeNothing = () => () => {};

/** 伺服器端與水合前都是 false：座位圖依視窗大小與瀏覽器裡記住的檢視繪製，掛載後才畫 */
function useMounted() {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

export function SeatingPage({ initialTable }: { initialTable: number | null }) {
  const mounted = useMounted();
  if (!mounted) return <SeatingSkeleton />;
  return <Seating initialTable={initialTable} />;
}

type Selected = number | 'staff' | null;
type Hit = { tableId: number; nonce: number } | null;

function Seating({ initialTable }: { initialTable: number | null }) {
  const data = useAppStore((s) => s.data);
  const dir = useAppStore((s) => s.dir);
  const ops = useSeatingOps();
  const personActions = usePersonActions();
  const mobile = useIsMobile();
  const wide = useWideDesktop();
  const [prefs, setPrefs] = useViewPrefs();

  const sorted = useMemo(() => sortPeople(data, dir), [data, dir]);
  const tables = useMemo(() => buildTables(data, dir, sorted), [data, dir, sorted]);
  const stats = useMemo(() => seatingStats(data.participants), [data.participants]);
  const byId = useMemo(() => new Map(data.participants.map((p) => [p.id, p])), [data.participants]);

  // 網址 /?table={n}：顯示那一桌的詳情並標示那一桌（PPL-R33、SEAT-R62）
  const [selected, setSelected] = useState<Selected>(initialTable);
  const [hit, setHit] = useState<Hit>(initialTable ? { tableId: initialTable, nonce: 1 } : null);
  const [mobileTab, setMobileTab] = useState<'map' | 'people'>('map');
  const [seatFor, setSeatFor] = useState<number | null>(null);
  const [seatOpen, setSeatOpen] = useState(false);
  const [dialog, setDialog] = useState<'add' | 'swap' | 'clear' | 'auto' | null>(null);

  // 搜尋標示 4 秒後恢復（SEAT-R62）
  useEffect(() => {
    if (!hit) return;
    const t = setTimeout(() => setHit(null), 4000);
    return () => clearTimeout(t);
  }, [hit]);

  const draggable = !mobile;
  const panelOpen = mobile ? true : (prefs.panel ?? wide);
  const manualPct = mobile ? prefs.zoomMobile : prefs.zoomDesktop;
  const setManualPct = useCallback(
    (pct: number | null) => setPrefs(mobile ? { zoomMobile: pct } : { zoomDesktop: pct }),
    [mobile, setPrefs],
  );

  const locate = useCallback(
    (tableId: number) => {
      setHit({ tableId, nonce: Date.now() });
      // 手機在「人員」分頁按「第 {n} 桌」時切到「座位圖」（SEAT-Q10 的目前假設）
      if (mobile) setMobileTab('map');
    },
    [mobile],
  );

  const unseat = useCallback(
    (p: Participant) => {
      const name = displayName(p, dir);
      if (p.tableId === null) return;
      ops.run({ type: 'unseat', participantId: p.id }, p.tableId === STAFF_TABLE_ID ? msg.unstaffed(name) : msg.unseated(name, p.tableId));
    },
    [dir, ops],
  );

  const ui = useMemo<SeatingUi>(
    () => ({
      openSeatDialog: (id) => {
        setSeatFor(id);
        setSeatOpen(true);
      },
      unseat,
      locate,
    }),
    [unseat, locate],
  );

  // ---- 拖移（docs/spec/seating.md 3.3～3.8）
  const resolve: ResolveDrop = (source, target) => {
    if (source.kind === 'table') {
      // 把手只能放到另一桌；放到自己、工作人員桌、地標、空白處或人員面板都沒有作用（SEAT-R38）
      if (target.kind !== 'table' || target.area !== 'map' || target.tableId === source.tableId) return null;
      return { target: { kind: 'table', tableId: target.tableId, area: 'map' }, blocked: false };
    }
    const p = byId.get(source.participantId);
    if (!p) return null;
    if (target.kind === 'table') {
      const info = tables.get(target.tableId);
      if (!info) return null;
      return { target, blocked: info.full && p.tableId !== target.tableId };
    }
    if (target.kind === 'staff') return p.tableId === STAFF_TABLE_ID ? null : { target, blocked: false };
    // 拖回人員面板：只有從桌次或工作人員桌拖出來的人才是移出（SEAT-R26、SEAT-R46）
    if (source.origin === 'panel' || p.tableId === null) return null;
    return { target, blocked: false };
  };

  const onDrop = (source: DragSource, target: DropTarget) => {
    if (source.kind === 'table') {
      if (target.kind !== 'table') return;
      ops.run({ type: 'swap', tableA: source.tableId, tableB: target.tableId }, msg.swapped(source.tableId, target.tableId));
      return;
    }
    const p = byId.get(source.participantId);
    if (!p) return;
    const name = displayName(p, dir);
    if (target.kind === 'panel') return unseat(p);
    if (target.kind === 'staff') {
      ops.run(
        { type: 'seat', participantId: p.id, tableId: STAFF_TABLE_ID },
        p.tableId === null ? msg.toStaff(name) : msg.tableToStaff(name, p.tableId),
      );
      return;
    }
    const t = target.tableId;
    if (p.tableId === t) {
      // 同一桌內：放在某一列就是調整順序（SEAT-R32）；放在圓形上沒有作用（SEAT-Q03）
      if (target.index === undefined) return;
      const roster = tables.get(t)!.roster.map((x) => x.id);
      const next = roster.filter((id) => id !== p.id);
      next.splice(Math.min(target.index, next.length), 0, p.id);
      if (next.every((id, i) => id === roster[i])) return;
      ops.run({ type: 'reorder', tableId: t, participantIds: next }, msg.reordered(t));
      return;
    }
    ops.run(
      { type: 'seat', participantId: p.id, tableId: t, ...(target.index === undefined ? {} : { index: target.index }) },
      seatMessage(p, name, t),
    );
  };

  const renderOverlay = (source: DragSource) => {
    if (source.kind === 'table') {
      return (
        <div className="grid size-full place-items-center rounded-sm border border-border bg-card text-foreground edge-popover [&_svg]:size-4">
          <GripVertical aria-hidden />
        </div>
      );
    }
    const p = byId.get(source.participantId);
    return (
      <div className="flex size-full min-w-0 items-center overflow-hidden rounded-md border border-border bg-card px-2 text-foreground edge-popover">
        <span className="truncate type-sm-medium">{p ? displayName(p, dir) : ''}</span>
      </div>
    );
  };

  // 工作區填滿視窗剩餘的高度，座位圖的捲軸才不會落到畫面外（2.1.2）
  const wsRef = useRef<HTMLDivElement>(null);
  const [wsHeight, setWsHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (mobile) return;
    const measure = () => {
      const el = wsRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setWsHeight(Math.max(480, Math.floor(window.innerHeight - top - 16)));
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    if (wsRef.current?.parentElement) ro.observe(wsRef.current.parentElement);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [mobile]);

  const detailInfo = selected === null ? null : tables.get(selected === 'staff' ? STAFF_TABLE_ID : selected);
  const detail =
    detailInfo && selected !== null ? (
      <TableDetail
        key={String(selected)}
        info={detailInfo}
        mobile={mobile}
        draggable={draggable}
        onClose={() => setSelected(null)}
        onAddPeople={() => setDialog('add')}
        onSwap={() => setDialog('swap')}
        onClear={() => setDialog('clear')}
      />
    ) : null;

  const noted = data.tables.filter((t) => t.id !== STAFF_TABLE_ID && t.noteName).length;

  return (
    <SeatingUiContext.Provider value={ui}>
      {/* 工作區底部離視窗 16 px（原型的做法）；抵掉 App Shell 內容區多出來的底部留白，整頁才不會上下捲動 */}
      <section className="min-w-0 md:-mb-4">
        <header className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-[1_1_280px] flex-wrap items-baseline gap-x-5 gap-y-2">
            <h1 className="type-2xl-bold text-foreground">座位安排</h1>
            <StatsLine stats={stats} />
          </div>
          {/* 手機：頁首按鈕滿版（原型 prototype.css 的 .page-actions） */}
          <div className="flex flex-wrap items-center gap-2 max-md:w-full max-md:*:flex-[1_1_100%]">
            <Button variant="primary" leadingIcon={<Plus />} onClick={() => personActions.onAddPerson?.()}>
              新增人員
            </Button>
            <Button variant="outline" leadingIcon={<Download />} onClick={exportSeating}>
              匯出座位表
            </Button>
          </div>
        </header>

        {mobile ? (
          <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as 'map' | 'people')} className="mb-3">
            <TabsList aria-label="座位安排檢視">
              <TabsTrigger value="map">座位圖</TabsTrigger>
              <TabsTrigger value="people">人員</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}

        <SeatingDnd resolve={resolve} onDrop={onDrop} renderOverlay={renderOverlay}>
          <div
            ref={wsRef}
            className={mobile ? 'flex min-w-0 flex-col gap-4' : 'flex min-w-0 gap-4'}
            style={mobile || wsHeight === null ? undefined : { height: wsHeight }}
          >
            <PeoplePanel
              sorted={sorted}
              hidden={mobile ? mobileTab !== 'people' : !panelOpen}
              mobile={mobile}
              draggable={draggable}
              onCollapse={() => setPrefs({ panel: false })}
            />
            {!mobile || mobileTab === 'map' ? (
              <SeatMap
                tables={tables}
                expanded={prefs.expanded}
                manualPct={manualPct}
                onManualPct={(pct) => setManualPct(pct === null ? null : clampPct(pct))}
                onToggleExpanded={() => {
                  // 全部展開時放大到 100%，全部收合時回到適合視窗（SEAT-R69）；只記這種裝置的比例（SEAT-R70）
                  const expanded = !prefs.expanded;
                  setPrefs({ expanded, ...(mobile ? { zoomMobile: expanded ? 100 : null } : { zoomDesktop: expanded ? 100 : null }) });
                }}
                onAutoArrange={() => setDialog('auto')}
                onShowPanel={!mobile && !panelOpen ? () => setPrefs({ panel: true }) : undefined}
                covered={!mobile && selected !== null}
                selected={selected}
                hit={hit}
                onOpen={(target) => setSelected(target)}
                draggable={draggable}
                mobile={mobile}
                detail={mobile ? null : detail}
              />
            ) : null}
          </div>
          {mobile ? detail : null}
        </SeatingDnd>

        {seatFor !== null ? <TableSelectDialog open={seatOpen} onOpenChange={setSeatOpen} participantId={seatFor} /> : null}
        {detailInfo && typeof selected === 'number' ? (
          <>
            <SwapDialog open={dialog === 'swap'} onOpenChange={(o) => setDialog(o ? 'swap' : null)} tableId={selected} tables={tables} />
            <ClearDialog open={dialog === 'clear'} onOpenChange={(o) => setDialog(o ? 'clear' : null)} info={detailInfo} />
          </>
        ) : null}
        {detailInfo ? (
          <AddPeopleDialog
            key={`add-${String(selected)}`}
            open={dialog === 'add'}
            onOpenChange={(o) => setDialog(o ? 'add' : null)}
            target={detailInfo.id}
            tables={tables}
            sorted={sorted}
          />
        ) : null}
        <AutoArrangeDialog
          open={dialog === 'auto'}
          onOpenChange={(o) => setDialog(o ? 'auto' : null)}
          data={{ participants: data.participants, noted }}
        />
      </section>
    </SeatingUiContext.Provider>
  );
}

/** 統計列（SEAT-R75）：「已入座 {n}／{總人數}・未入座 {m}・空位 {k}・已滿 {t} 桌」 */
const B = ({ children }: { children: React.ReactNode }) => <b className="type-sm-medium text-foreground tabular-nums">{children}</b>;

function StatsLine({ stats }: { stats: ReturnType<typeof seatingStats> }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1 gap-y-1 type-xs-regular text-muted-foreground">
      <span>
        已入座 <B>{stats.seated}</B>／<B>{stats.total}</B>
      </span>
      <span aria-hidden>・</span>
      <span>
        未入座 <B>{stats.unseated}</B>
      </span>
      <span aria-hidden>・</span>
      <span>
        空位 <B>{stats.emptySeats}</B>
      </span>
      <span aria-hidden>・</span>
      <span>
        已滿 <B>{stats.fullTables}</B> 桌
      </span>
    </div>
  );
}

/** 匯出座位表（docs/spec/export.md EXP-R01、EXP-R06、EXP-R07）：直接下載，不開對話框 */
async function exportSeating() {
  try {
    const res = await fetch('/api/export/seating', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') ?? '';
    const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1];
    const plain = /filename="?([^";]+)"?/i.exec(cd)?.[1];
    downloadBlob(star ? decodeURIComponent(star) : (plain ?? '座位表.xlsx'), blob);
    notify('已匯出座位表。');
  } catch {
    notify('匯出座位表失敗，請確認網路連線後再試一次。', { type: 'destructive' });
  }
}
