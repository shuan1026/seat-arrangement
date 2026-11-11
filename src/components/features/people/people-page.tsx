'use client';

// 參與人員頁（docs/spec/participants.md 第 2.1、2.2 節、第 3.3 節、第 4.1 節）。
// 版面依原型 people.html：頁首、工具列（搜尋與四個篩選）、已套用的篩選、表格（手機為堆疊卡片）、分頁。
// 資料都在 store 裡，搜尋、篩選、排序與分頁都在瀏覽器算（docs/architecture.md 第 10.2 節）。
// 待確認依原型做法（D-008）：搜尋也比對組別與稱謂（PPL-Q14）、改了搜尋或篩選回到第 1 頁（PPL-Q15）、
// 同時有搜尋字與篩選而沒有結果時顯示搜尋無結果（PPL-Q16）、手機版頁首按鈕滿版放在標題下方（PPL-Q17，共用 PageHead）、
// 空值顯示「—」且「工作人員」不能按（PPL-Q18）、從員工名單進來時以員工姓名搜尋（PPL-Q19、EMP-Q07）。
// 跨功能的部分：「入座…」「移至其他桌次…」開座位安排的選擇桌次對話框（seating.md 2.4），
// 頁首的「匯出座位表」是共用的 ExportSeatingButton（export.md）。
// 只能檢視時（PPL-R86、D-021）：頁首只有「匯出座位表」，表格沒有列操作欄，空狀態沒有「新增人員」，會修改資料的對話框不顯示；
// 權限在畫面開著時被移除，開著的對話框跟著關閉（AUTH-R13）。
import { IdCard, Plus, Search, Upload, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAppStore, useIsEditor } from '@/client/app-provider';
import { PageHead } from '@/components/shell/page-head';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Select, type SelectOption } from '@/components/ui/select';
import type { Participant, ParticipantKind } from '@/contracts/entities';
import { tableCodeLabel } from '@/domain/layout';
import { placedInListOrder } from '@/domain/tables';
import {
  departmentOptions,
  filterParticipants,
  hasFilters,
  KIND_NAMES,
  NO_FILTERS,
  sortParticipants,
  type ParticipantFilters,
  type SeatState,
} from '@/domain/participants';
import { ExportSeatingButton } from '../export/export-seating-button';
import { TableSelectDialog } from '../seating/table-select-dialog';
import { ImportDialog } from './import-dialog';
import { PeopleTable, type RowCommand } from './people-table';
import { PersonDialog } from './person-dialog';
import { RemovePersonDialog, type RemoveTarget } from './remove-person-dialog';
import { usePersonActions } from './use-person-actions';

const PAGE_SIZE = 20;
const SEARCH_LABEL = '搜尋姓名、分機、部門或單位';
const SEAT_NAMES: Record<SeatState, string> = { seated: '已入座', unseated: '未入座', staff: '工作人員' };
const ANY = '';

type PersonDialogState = { mode: 'create' } | { mode: 'edit'; participantId: number };

export function PeoplePage({ initialEmployeeId }: { initialEmployeeId: number | null }) {
  const data = useAppStore((s) => s.data);
  const dir = useAppStore((s) => s.dir);
  const isEditor = useIsEditor();
  const { unseat } = usePersonActions();

  // 從員工名單的「查看參與資料」進來（/people?employee={id}）：以這位員工的姓名搜尋（PPL-Q19、EMP-Q07）
  const [query, setQuery] = useState(() =>
    initialEmployeeId == null ? '' : (dir.employees.get(initialEmployeeId)?.name ?? ''),
  );
  const [filters, setFilters] = useState<ParticipantFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [personDialog, setPersonDialog] = useState<PersonDialogState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirm, setConfirm] = useState<RemoveTarget | null>(null);
  // 「入座…」「移至其他桌次…」：選擇桌次對話框（座位安排的 TableSelectDialog）。
  // 關閉時保留這個人，讓對話框的關閉動畫照常播放
  const [seatTarget, setSeatTarget] = useState<number | null>(null);
  const [seatOpen, setSeatOpen] = useState(false);

  const sorted = useMemo(() => sortParticipants(data.participants, dir), [data.participants, dir]);
  const visible = useMemo(
    () => filterParticipants(sorted, dir, query, filters, data.tables),
    [sorted, dir, query, filters, data.tables],
  );
  // 桌次篩選的選項：只列場上的桌，依 A1～A15、B1～B15 排列，只寫桌號；value 是桌子 id（PPL-R26、D-019、D-027）
  const tableOptions = useMemo(
    () => placedInListOrder(data.tables).map((t) => ({ value: String(t.id), label: tableCodeLabel(t.position!) })),
    [data.tables],
  );
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const changeQuery = (q: string) => {
    setQuery(q);
    setPage(1);
    // 清空搜尋時一併拿掉網址上的 ?employee=，重新整理後不會再帶入
    if (!q && window.location.search) window.history.replaceState(null, '', window.location.pathname);
  };
  const changeFilter = <K extends keyof ParticipantFilters>(key: K, value: ParticipantFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const clearFilters = () => {
    setFilters(NO_FILTERS);
    setPage(1);
  };

  const onCommand = (command: RowCommand, p: Participant) => {
    switch (command) {
      case 'edit':
        return setPersonDialog({ mode: 'edit', participantId: p.id });
      case 'seat':
      case 'move':
        setSeatTarget(p.id);
        return setSeatOpen(true);
      case 'unseat':
        return unseat(p);
      default:
        return setConfirm({ action: command, participant: p });
    }
  };

  const departments = useMemo(() => departmentOptions(data.employees), [data.employees]);
  const chips = filterChips(filters, tableOptions);
  const empty = data.participants.length === 0;

  return (
    <section className="min-w-0">
      <PageHead
        title="參與人員"
        description="管理報名尾牙的員工、他們的眷屬與外部貴賓。"
        actions={
          <>
            {isEditor ? (
              <>
                <Button variant="primary" leadingIcon={<Plus />} onClick={() => setPersonDialog({ mode: 'create' })}>
                  新增人員
                </Button>
                <Button variant="outline" leadingIcon={<Upload />} onClick={() => setImportOpen(true)}>
                  匯入參與人員
                </Button>
              </>
            ) : null}
            <ExportSeatingButton />
          </>
        }
      />

      {empty ? null : (
        <>
          <div className="mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <SearchInput
              label={SEARCH_LABEL}
              placeholder={SEARCH_LABEL}
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              className="min-w-0 flex-[1_1_260px] max-md:flex-[1_1_100%]"
            />
            <FilterSelect
              label="類別"
              value={filters.kind}
              options={(['EMPLOYEE', 'DEPENDENT', 'GUEST'] as const).map((k) => ({ value: k, label: KIND_NAMES[k] }))}
              onChange={(v) => changeFilter('kind', v as ParticipantKind | null)}
            />
            <FilterSelect
              label="部門"
              value={filters.department}
              options={departments.map((d) => ({ value: d, label: d }))}
              onChange={(v) => changeFilter('department', v)}
              searchPlaceholder="搜尋部門"
            />
            <FilterSelect
              label="入座狀態"
              value={filters.seat}
              options={(Object.keys(SEAT_NAMES) as SeatState[]).map((s) => ({ value: s, label: SEAT_NAMES[s] }))}
              onChange={(v) => changeFilter('seat', v as SeatState | null)}
            />
            <FilterSelect
              label="桌次"
              value={filters.tableId == null ? null : String(filters.tableId)}
              options={tableOptions}
              onChange={(v) => changeFilter('tableId', v == null ? null : Number(v))}
              searchPlaceholder="搜尋桌號"
            />
          </div>

          {chips.length ? (
            <div className="-mt-2 mb-4 flex min-w-0 flex-wrap items-center gap-2">
              {chips.map((c) => (
                <Badge key={c.key} variant="outline" icon={null} asChild>
                  <button type="button" aria-label={`移除篩選 ${c.label}`} onClick={() => changeFilter(c.key, null)}>
                    {c.label}
                    <X aria-hidden />
                  </button>
                </Badge>
              ))}
              <Button variant="link" onClick={clearFilters}>
                清除篩選
              </Button>
            </div>
          ) : null}
        </>
      )}

      {empty ? (
        <EmptyState
          icon={<Users />}
          title="還沒有參與人員。"
          description="到員工名單把報名的員工加入尾牙，或新增貴賓與眷屬後，就可以開始安排座位。"
          action={
            <>
              <Button variant="primary" leadingIcon={<IdCard />} asChild>
                <Link href="/employees">前往員工名單</Link>
              </Button>
              {isEditor ? (
                <Button variant="outline" leadingIcon={<Plus />} onClick={() => setPersonDialog({ mode: 'create' })}>
                  新增人員
                </Button>
              ) : null}
            </>
          }
        />
      ) : visible.length === 0 ? (
        query.trim() ? (
          <EmptyState
            icon={<Search />}
            title={`找不到「${query}」。`}
            action={
              <Button variant="outline" onClick={() => changeQuery('')}>
                清除搜尋
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Search />}
            title="找不到符合條件的人員。"
            action={
              <Button variant="outline" onClick={clearFilters}>
                清除篩選
              </Button>
            }
          />
        )
      ) : (
        <>
          <PeopleTable rows={rows} onCommand={onCommand} readOnly={!isEditor} />
          <Pagination className="mt-3" page={current} pageSize={PAGE_SIZE} total={visible.length} onPageChange={setPage} />
        </>
      )}

      {/* 會修改資料的對話框只給編輯者；權限被移除時跟著關閉（AUTH-R13） */}
      {isEditor ? (
        <>
          <PersonDialog
            open={personDialog !== null}
            onOpenChange={(open) => {
              if (!open) setPersonDialog(null);
            }}
            mode={personDialog?.mode ?? 'create'}
            participantId={personDialog?.mode === 'edit' ? personDialog.participantId : undefined}
          />
          <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
          <RemovePersonDialog target={confirm} onClose={() => setConfirm(null)} />
          {seatTarget !== null ? <TableSelectDialog open={seatOpen} onOpenChange={setSeatOpen} participantId={seatTarget} /> : null}
        </>
      ) : null}
    </section>
  );
}

type Chip = { key: keyof ParticipantFilters; label: string };

/** 已套用的篩選（PPL-R27），依工具列的順序 */
function filterChips(f: ParticipantFilters, tableOptions: readonly { value: string; label: string }[]): Chip[] {
  if (!hasFilters(f)) return [];
  const chips: Chip[] = [];
  if (f.kind) chips.push({ key: 'kind', label: KIND_NAMES[f.kind] });
  if (f.department) chips.push({ key: 'department', label: f.department });
  if (f.seat) chips.push({ key: 'seat', label: SEAT_NAMES[f.seat] });
  if (f.tableId != null) {
    const label = tableOptions.find((o) => o.value === String(f.tableId))?.label;
    if (label) chips.push({ key: 'tableId', label: `桌次：${label}` });
  }
  return chips;
}

/** 工具列的篩選：Dropdown Menu `select`，第一項「不限」；有選時欄位顯示「{篩選}：{選項}」（原型 UI.select 的 prefix） */
function FilterSelect({
  label,
  value,
  options,
  onChange,
  searchPlaceholder,
}: {
  label: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string | null) => void;
  /** 有給時選單可以搜尋 */
  searchPlaceholder?: string;
}) {
  return (
    <Select
      aria-label={label}
      size="sm"
      options={[{ value: ANY, label: '不限' }, ...options]}
      value={value ?? ANY}
      onValueChange={(v) => onChange(v ? v : null)}
      renderValue={(o) => (o.value === ANY ? <span className="text-muted-foreground">{label}</span> : `${label}：${o.label}`)}
      searchable={searchPlaceholder !== undefined}
      searchPlaceholder={searchPlaceholder}
      className="min-w-0 flex-[0_1_164px] max-md:flex-[1_1_100%]"
    />
  );
}
