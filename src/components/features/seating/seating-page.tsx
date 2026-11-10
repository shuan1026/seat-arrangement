'use client';

// 座位安排頁（docs/spec/seating.md；版面依 ui-design-system/source-reference/html/seating.html）：
// 頁首（H1、統計列、新增人員、匯出座位表）、工作區（人員面板 280 px ＋ 座位圖，桌次詳情浮在座位圖區右側）。
// 手機（767 px 以下）用分頁切換座位圖與人員，不提供拖移，桌次詳情改為 Dialog。
// 人員的新增、編輯、取消報名與刪除用參與人員的對話框（participants.md 第 2.2、2.3 節），經 PersonActionsContext 接到列操作；
// 頁首的「匯出座位表」是共用的 ExportSeatingButton（export.md）；「發布」開啟發布對話框（permissions.md 第 2.2 節）。
// 只能檢視時（SEAT-R90、D-021）：沒有「新增人員」「發布」「自動排座」、拖移、列操作，桌次詳情沒有修改的入口；
// 權限在畫面開著時被移除，開著的對話框跟著關閉，畫面切換成只能檢視（AUTH-R13）。
import { GripVertical, Plus, Share2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAppStore, useIsEditor } from '@/client/app-provider';
import { STAFF_TABLE_ID, type Participant } from '@/contracts/entities';
import { displayName } from '@/domain/display';
import { seatingStats } from '@/domain/seating-rules';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExportSeatingButton } from '../export/export-seating-button';
import { PersonDialog } from '../people/person-dialog';
import { PublishDialog } from '../publish/publish-dialog';
import { RemovePersonDialog, type RemoveTarget } from '../people/remove-person-dialog';
import { SeatingDnd, type DragSource, type DropTarget, type ResolveDrop } from './drag';
import { buildTables, msg, seatMessage, sortPeople } from './model';
import { PeoplePanel } from './people-panel';
import { PersonActionsContext, type PersonActions } from './person-actions';
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
type PersonDialogState = { mode: 'create' } | { mode: 'edit'; participantId: number };
type Hit = { tableIds: number[]; nonce: number } | null;

function Seating({ initialTable }: { initialTable: number | null }) {
  const data = useAppStore((s) => s.data);
  const dir = useAppStore((s) => s.dir);
  const isEditor = useIsEditor();
  const ops = useSeatingOps();
  const mobile = useIsMobile();
  const wide = useWideDesktop();
  const [prefs, setPrefs] = useViewPrefs();

  const sorted = useMemo(() => sortPeople(data, dir), [data, dir]);
  const tables = useMemo(() => buildTables(data, dir, sorted), [data, dir, sorted]);
  const stats = useMemo(() => seatingStats(data.participants), [data.participants]);
  const byId = useMemo(() => new Map(data.participants.map((p) => [p.id, p])), [data.participants]);

  // 網址 /?table={桌號}：顯示那一桌的詳情並標示那一桌（PPL-R33、SEAT-R62）；initialTable 是內部編號
  const [selected, setSelected] = useState<Selected>(initialTable);
  const [hit, setHit] = useState<Hit>(initialTable ? { tableIds: [initialTable], nonce: 1 } : null);
  const [mobileTab, setMobileTab] = useState<'map' | 'people'>('map');
  const [seatFor, setSeatFor] = useState<number | null>(null);
  const [seatOpen, setSeatOpen] = useState(false);
  const [dialog, setDialog] = useState<'add' | 'swap' | 'clear' | 'auto' | null>(null);
  // 新增、編輯人員對話框與取消報名、刪除的確認（參與人員的元件）
  const [personDialog, setPersonDialog] = useState<PersonDialogState | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  // 搜尋標示 4 秒後恢復（SEAT-R62）
  useEffect(() => {
    if (!hit) return;
    const t = setTimeout(() => setHit(null), 4000);
    return () => clearTimeout(t);
  }, [hit]);

  // 拖移只在桌面、而且是編輯者（SEAT-R82、SEAT-R90）
  const draggable = !mobile && isEditor;
  const panelOpen = mobile ? true : (prefs.panel ?? wide);
  const manualPct = mobile ? prefs.zoomMobile : prefs.zoomDesktop;
  const setManualPct = useCallback(
    (pct: number | null) => setPrefs(mobile ? { zoomMobile: pct } : { zoomDesktop: pct }),
    [mobile, setPrefs],
  );

  const locate = useCallback(
    (tableId: number) => {
      setHit({ tableIds: [tableId], nonce: Date.now() });
      // 手機在「人員」分頁按「{桌號}」時切到「座位圖」（SEAT-Q10 的目前假設）
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

  // 人員面板、桌次詳情與工作人員桌詳情的列操作「編輯」「取消報名」「刪除」（person-menu.tsx）
  const personActions = useMemo<PersonActions>(
    () => ({
      onAddPerson: () => setPersonDialog({ mode: 'create' }),
      onEdit: (p) => setPersonDialog({ mode: 'edit', participantId: p.id }),
      onCancelRegistration: (p) => setRemoveTarget({ action: 'cancelRegistration', participant: p }),
      onDelete: (p) => setRemoveTarget({ action: 'delete', participant: p }),
    }),
    [],
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
      // 拖移可以放到 12 位：已滿或超過、但還不到 12 位的桌照常可以放（SEAT-R20、2.1.9）
      return { target, blocked: info.max && p.tableId !== target.tableId };
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
    // 拖移帶 allowOverflow：一般桌與工作人員桌都可以放到 12 位（SEAT-R20、SEAT-R42、SEAT-R88）
    if (target.kind === 'staff') {
      ops.run(
        { type: 'seat', participantId: p.id, tableId: STAFF_TABLE_ID, allowOverflow: true },
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
      {
        type: 'seat',
        participantId: p.id,
        tableId: t,
        ...(target.index === undefined ? {} : { index: target.index }),
        allowOverflow: true,
      },
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
        readOnly={!isEditor}
        onClose={() => setSelected(null)}
        onAddPeople={() => setDialog('add')}
        onSwap={() => setDialog('swap')}
        onClear={() => setDialog('clear')}
      />
    ) : null;

  const noted = data.tables.filter((t) => t.id !== STAFF_TABLE_ID && t.noteName).length;

  return (
    <PersonActionsContext.Provider value={personActions}>
    <SeatingUiContext.Provider value={ui}>
      {/* 工作區底部離視窗 16 px（原型的做法）；抵掉 App Shell 內容區多出來的底部留白，整頁才不會上下捲動 */}
      <section className="min-w-0 md:-mb-4">
        <header className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-[1_1_280px] flex-wrap items-baseline gap-x-5 gap-y-2">
            <h1 className="type-2xl-bold text-foreground">座位安排</h1>
            <StatsLine stats={stats} />
          </div>
          {/* 手機：頁首按鈕滿版（原型 prototype.css 的 .page-actions） */}
          {/* 依序是「新增人員」「匯出座位表」「發布」；只能檢視時只有「匯出座位表」（2.1.1、SEAT-R90） */}
          <div className="flex flex-wrap items-center gap-2 max-md:w-full max-md:*:flex-[1_1_100%]">
            {isEditor ? (
              <Button variant="primary" leadingIcon={<Plus />} onClick={() => setPersonDialog({ mode: 'create' })}>
                新增人員
              </Button>
            ) : null}
            <ExportSeatingButton />
            {isEditor ? (
              <Button variant="outline" leadingIcon={<Share2 />} onClick={() => setPublishOpen(true)}>
                發布
              </Button>
            ) : null}
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
                onAutoArrange={isEditor ? () => setDialog('auto') : undefined}
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

        {/* 會修改資料的對話框只給編輯者；權限被移除時跟著關閉（AUTH-R13） */}
        {isEditor ? (
          <>
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
            <PersonDialog
              open={personDialog !== null}
              onOpenChange={(open) => {
                if (!open) setPersonDialog(null);
              }}
              mode={personDialog?.mode ?? 'create'}
              participantId={personDialog?.mode === 'edit' ? personDialog.participantId : undefined}
            />
            <RemovePersonDialog target={removeTarget} onClose={() => setRemoveTarget(null)} />
            <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} />
          </>
        ) : null}
      </section>
    </SeatingUiContext.Provider>
    </PersonActionsContext.Provider>
  );
}

/** 統計列（SEAT-R75）：「已入座 {n}／{總人數}・未入座 {m}・空位 {k}・已滿 {t} 桌」，有桌次超過 10 位時最後加「・超過 {u} 桌」 */
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
      {stats.overflowTables > 0 ? (
        <>
          <span aria-hidden>・</span>
          <span>
            超過 <B>{stats.overflowTables}</B> 桌
          </span>
        </>
      ) : null}
    </div>
  );
}
