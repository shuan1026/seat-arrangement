'use client';

// 發布頁 /seats（docs/spec/permissions.md 第 2.3 節、PRM-R21～R34、第 4.3 節文案）。沒有原型 HTML，組合方式依規格：
// 不套 App Shell（沒有 Sidebar、Header、導覽、使用者選單、介面配色鈕與儲存狀態），整頁 --background、不加光暈，
// 內容全寬、左右 24 px（767 px 以下 16 px）；由上而下 H1、工具列（含搜尋框）、搜尋結果、座位圖（D-025）。
// 座位圖重用座位安排的 SeatMap／MapTable（排列、桌次的樣子、縮放與平移），只用來顯示：沒有拖移與把手，不顯示人數與「已滿」「超過」。
// 工具列是縮小、比例、放大、適合視窗、搜尋框、全部展開／全部收合；開啟時全部展開、100%、水平置中、從最上方開始，
// 展開狀態與比例都不記住（PRM-R25）。
// 桌次名單沿用桌次詳情的外框（DetailShell），沒有副標（不顯示人數）：桌面從座位圖區右側浮出，手機是 Dialog；
// 每列只有座號與顯示名稱（PRM-R26、PRM-R27）。
// 搜尋、同名區分與桌次標示都在瀏覽器用 PublishedSeating 計算（domain/published-seating.ts）；標示一直留著，直到關鍵字改變或清空（PRM-R31）。
import { Armchair } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import type { PublishedSeating, PublishedTable } from '@/contracts/permissions';
import { tableTitle } from '@/domain/layout';
import { searchPublishedSeats, seatNotFoundMessage } from '@/domain/published-seating';
import { tableStatus } from '@/domain/seating-rules';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { rosterRows, type PublicTableFace } from '../seating/model';
import { clampPct, SeatMap } from '../seating/seat-map';
import { DetailShell, Meta, MetaItem } from '../seating/table-detail';
import { useIsMobile } from '../seating/view-prefs';

const TITLE = '尾牙座位表';
const SEARCH_LABEL = '輸入姓名找座位';

export function PublishedSeats({ seating }: { seating: PublishedSeating }) {
  return (
    <main className="min-h-dvh min-w-0 bg-background px-6 pt-6 pb-6 text-foreground max-md:px-4 max-md:pt-4 max-md:pb-4">
      <h1 className="type-2xl-bold text-foreground">{TITLE}</h1>
      {seating.published ? (
        <PublishedMap tables={seating.tables} />
      ) : (
        // 未發布：只有標題與空狀態，沒有搜尋框與座位圖（PRM-R22）
        <EmptyState className="mt-4" icon={<Armchair />} title="座位表還沒有發布，請稍後再看。" />
      )}
    </main>
  );
}

const subscribeNothing = () => () => {};

/** 伺服器端與水合前是 false：座位圖依視窗大小繪製，掛載後才畫 */
function useMounted() {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

const toFace = (t: PublishedTable): PublicTableFace => ({
  id: t.id,
  isStaff: t.id === STAFF_TABLE_ID,
  position: t.position,
  noteName: t.noteName,
  label: t.departmentLabel,
  count: t.people.length,
  status: tableStatus(t.people.length),
  names: t.people.map((p) => p.displayName),
});

type Selected = number | 'staff' | null;

function PublishedMap({ tables }: { tables: PublishedTable[] }) {
  const mounted = useMounted();
  const mobile = useIsMobile();
  const faces = useMemo(() => new Map(tables.map((t) => [t.id, toFace(t)])), [tables]);
  const byId = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);

  const [keyword, setKeyword] = useState('');
  // 每次改關鍵字都把第一個結果的桌次捲到看得到的位置
  const [searchNonce, setSearchNonce] = useState(0);
  const results = useMemo(() => searchPublishedSeats(tables, keyword), [tables, keyword]);
  const hit = useMemo(
    () => (results.length ? { tableIds: [...new Set(results.map((r) => r.tableId))], nonce: searchNonce } : null),
    [results, searchNonce],
  );
  const [selected, setSelected] = useState<Selected>(null);
  // 開啟時全部展開、100%、水平置中（PRM-R25、D-025）；不記住，重新整理就回到這個狀態
  const [expanded, setExpanded] = useState(true);
  const [manualPct, setManualPct] = useState<number | null>(100);
  const [centerNonce, setCenterNonce] = useState(0);
  const toggleExpanded = () => {
    if (expanded) {
      // 全部收合：換回圓形並回到適合視窗
      setExpanded(false);
      setManualPct(null);
    } else {
      // 全部展開：回到開啟時的樣子
      setExpanded(true);
      setManualPct(100);
      setCenterNonce((n) => n + 1);
    }
  };

  // 座位圖區填滿視窗剩下的高度，只在區內捲動與平移；搜尋結果（在工具列與座位圖區之間）多時頁面往下延伸，
  // 座位圖不跟著變矮（PRM-R34）
  const areaRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const area = areaRef.current;
      if (!area) return;
      const top = area.getBoundingClientRect().top + window.scrollY;
      const bottom = mobile ? 16 : 24;
      const results = resultsRef.current?.offsetHeight ?? 0;
      setHeight(Math.max(mobile ? 360 : 480, Math.floor(window.innerHeight - top - bottom)) + results);
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    if (resultsRef.current) ro.observe(resultsRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [mobile, mounted]);

  const query = keyword.trim();
  const selectedTable = selected === null ? undefined : byId.get(selected === 'staff' ? STAFF_TABLE_ID : selected);
  const detail = selectedTable ? (
    <PublishedTableDetail key={selectedTable.id} table={selectedTable} mobile={mobile} onClose={() => setSelected(null)} />
  ) : null;

  const search = (
    <SearchInput
      label={SEARCH_LABEL}
      placeholder={SEARCH_LABEL}
      value={keyword}
      onChange={(e) => {
        setKeyword(e.target.value);
        setSearchNonce((n) => n + 1);
      }}
      className="w-[320px] max-md:w-full"
    />
  );
  // 搜尋結果每位一行；找不到時在同一位置顯示提示（PRM-R31、PRM-R33）；關鍵字空白時不顯示。
  // 外層一直存在（aria-live 與高度量測），有內容時才佔高度
  const resultList = (
    <div ref={resultsRef} aria-live="polite" className="min-w-0">
      {!query ? null : results.length ? (
        <ul aria-label="搜尋結果" className="m-0 flex list-none flex-col gap-1 p-0 pb-2">
          {results.map((r, i) => (
            <li key={`${r.tableId}-${i}`} className="type-sm-regular text-foreground [overflow-wrap:anywhere]">
              {r.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pb-2 type-sm-regular text-muted-foreground [overflow-wrap:anywhere]">{seatNotFoundMessage(keyword)}</p>
      )}
    </div>
  );

  return (
    <>
      <div ref={areaRef} className="mt-4 flex min-h-0 min-w-0 flex-col" style={height === null ? undefined : { height }}>
        {mounted ? (
          <SeatMap
            tables={faces}
            expanded={expanded}
            manualPct={manualPct}
            onManualPct={(pct) => setManualPct(pct === null ? null : clampPct(pct))}
            onToggleExpanded={toggleExpanded}
            covered={!mobile && selected !== null}
            selected={selected}
            hit={hit}
            onOpen={(target) => setSelected(target)}
            draggable={false}
            // 手機版座位圖區的高度由這裡決定（填滿視窗剩下的高度），不用座位安排頁手機的固定高度
            mobile={false}
            detail={mobile ? null : detail}
            hideCounts
            toolbarSearch={search}
            belowToolbar={resultList}
            centerNonce={centerNonce}
          />
        ) : (
          <SeatsMapSkeleton />
        )}
      </div>
      {mobile ? detail : null}
    </>
  );
}

/** 桌次名單（第 2.3 節）：標題、備註名稱、部門與名單；沒有副標（不顯示人數，D-025）；每列只有座號與顯示名稱，沒有第二行、徽章、列操作與底部按鈕 */
function PublishedTableDetail({ table, mobile, onClose }: { table: PublishedTable; mobile: boolean; onClose: () => void }) {
  const isStaff = table.id === STAFF_TABLE_ID;
  const count = table.people.length;
  return (
    <DetailShell
      title={isStaff || table.position === null ? '工作人員桌' : tableTitle(table.position)}
      noteName={table.noteName}
      mobile={mobile}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <Meta items={[<MetaItem key="d" before="部門：" value={count ? table.departmentLabel : '—'} />]} />
        <ol aria-label="名單" className="m-0 flex list-none flex-col gap-1 p-0">
          {Array.from({ length: rosterRows(count) }, (_, i) => {
            const person = table.people[i];
            const idx = <span className="w-4 shrink-0 text-muted-foreground tabular-nums">{i + 1}</span>;
            return person ? (
              <li key={`p-${i}`} className="flex min-h-10 min-w-0 items-center gap-2 rounded-md py-0.5 pr-1 pl-2">
                {idx}
                <span className="min-w-0 type-sm-medium text-foreground [overflow-wrap:anywhere]">{person.displayName}</span>
              </li>
            ) : (
              <li
                key={`e-${i}`}
                className="flex min-h-10 items-center gap-2 rounded-md bg-muted py-0.5 pr-1 pl-2 type-sm-regular text-muted-foreground"
              >
                {idx}空位
              </li>
            );
          })}
        </ol>
      </div>
    </DetailShell>
  );
}

/** 載入中：座位圖顯示 30 張展開卡片形狀（256 × 220 px）的 Skeleton，不顯示文字（第 2.3 節「狀態」、D-025） */
export function SeatsMapSkeleton() {
  return (
    <div
      role="status"
      aria-label="載入中"
      aria-busy
      className="grid min-h-0 min-w-0 flex-1 grid-cols-[repeat(auto-fill,256px)] content-start justify-center gap-3 overflow-hidden rounded-xl border border-border bg-background p-6 max-md:p-4"
    >
      {Array.from({ length: 30 }, (_, i) => (
        <Skeleton key={i} shape="block" className="rounded-xl" style={{ width: 256, height: 220 }} />
      ))}
    </div>
  );
}
