'use client';

// 員工名單頁（docs/spec/employees.md；版面依 ui-design-system/source-reference/html/employees.html）。
// Data Management 版型、內容全寬：頁面標題列、Tabs、工具列、已套用的篩選、表格、分頁導覽。人數只放在 Tabs 上。
// 資料從 store 讀（src/client/app-provider.tsx），搜尋、篩選、分頁都在瀏覽器算（docs/architecture.md 第 10.2 節）。
// 待確認 EMP-Q07、Q08 依 D-008 照原型：換頁、換分頁、改搜尋或篩選後勾選保留且計入；換分頁、改搜尋或篩選後回到第 1 頁；
// 沒有任何員工時不顯示 Tabs 與工具列，只有空狀態。
import { Check, IdCard, Plus, Search, Upload, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAppStore } from '@/client/app-provider';
import type { Employee } from '@/contracts/entities';
import {
  changeDepartmentFilter,
  departmentOptions,
  emptyStateOf,
  filterEmployees,
  NO_FILTERS,
  regionOptions,
  registeredEmployeeIds,
  selectedToJoin,
  tabCounts,
  teamOptions,
  toggleAllOnPage,
  type EmployeeEmptyState,
  type EmployeeFilters,
  type RegistrationTab,
} from '@/domain/employees';
import { PageHead } from '@/components/shell/page-head';
import { AlertDialog, AlertDialogContent } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmployeeDialog, type EmployeeDialogTarget } from './employee-dialog';
import { EmployeeTable, PAGE_SIZE, type RowAction } from './employee-table';
import { EmployeeToolbar, FilterChips } from './employee-toolbar';
import { ImportDialog } from './import-dialog';
import { JoinDialogSlot } from './join-dialog-slot';
import { useEmployeeActions } from './use-employee-actions';

const DESCRIPTION = '公司全部員工。把報名尾牙的人加入，參與人員就會出現在座位安排。';

type Confirm =
  | { kind: 'delete'; employee: Employee; registered: boolean }
  | { kind: 'cancel'; employee: Employee; participantId: number }
  | { kind: 'bulk'; employeeIds: number[] };

export function EmployeesView() {
  const router = useRouter();
  const employees = useAppStore((s) => s.data.employees);
  const participants = useAppStore((s) => s.data.participants);
  const actions = useEmployeeActions();

  const [tab, setTab] = useState<RegistrationTab>('all');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<EmployeeFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const [editor, setEditor] = useState<EmployeeDialogTarget | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // 單筆「加入尾牙」開啟的對話框（EMP-R28），階段 3 接上參與人員的新增人員對話框
  const [joinEmployeeId, setJoinEmployeeId] = useState<number | null>(null);

  const registered = useMemo(() => registeredEmployeeIds(participants), [participants]);
  const counts = useMemo(() => tabCounts(employees, registered), [employees, registered]);
  const departments = useMemo(() => departmentOptions(employees), [employees]);
  const teams = useMemo(() => teamOptions(employees, filters.department), [employees, filters.department]);
  const regions = useMemo(() => regionOptions(employees), [employees]);
  const rows = useMemo(
    () => filterEmployees(employees, registered, { tab, query, filters }),
    [employees, registered, tab, query, filters],
  );
  const picked = useMemo(() => selectedToJoin(employees, registered, selected), [employees, registered, selected]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const empty = emptyStateOf({ total: employees.length, visible: rows.length, tab, query, filters });

  // 換分頁、改搜尋或篩選後回到第 1 頁（EMP-Q08 第 3 點）
  const changeTab = (next: string) => {
    setTab(next as RegistrationTab);
    setPage(1);
  };
  const changeQuery = (next: string) => {
    setQuery(next);
    setPage(1);
  };
  const changeFilters = (next: EmployeeFilters) => {
    setFilters(next);
    setPage(1);
  };
  const clearFilters = () => changeFilters(NO_FILTERS);

  const toggle = (id: number, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  const unselect = (ids: readonly number[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });

  const onAction = (action: RowAction, employee: Employee) => {
    switch (action) {
      case 'join':
        setJoinEmployeeId(employee.id);
        break;
      case 'view':
        // 開啟參與人員頁，顯示這位員工的參與資料（EMP-R29；EMP-Q07）
        router.push(`/people?employee=${employee.id}`);
        break;
      case 'cancel': {
        const p = participants.find((x) => x.kind === 'EMPLOYEE' && x.employeeId === employee.id);
        if (p) setConfirm({ kind: 'cancel', employee, participantId: p.id });
        break;
      }
      case 'edit':
        setEditor({ mode: 'edit', employee });
        break;
      case 'delete':
        setConfirm({ kind: 'delete', employee, registered: registered.has(employee.id) });
        break;
    }
  };

  const openCreate = () => setEditor({ mode: 'create' });
  const openImport = () => setImportOpen(true);

  return (
    <section className="min-w-0">
      <PageHead
        title="員工名單"
        description={DESCRIPTION}
        actions={
          <>
            <Button variant="primary" leadingIcon={<Plus />} onClick={openCreate}>
              新增員工
            </Button>
            <Button variant="outline" leadingIcon={<Upload />} onClick={openImport}>
              匯入員工名單
            </Button>
          </>
        }
      />

      {employees.length === 0 ? (
        <EmptyState
          icon={<IdCard />}
          title="還沒有員工名單。"
          description="匯入公司員工名單，或先新增幾位員工。"
          action={
            <>
              <Button variant="primary" leadingIcon={<Upload />} onClick={openImport}>
                匯入員工名單
              </Button>
              <Button variant="outline" leadingIcon={<Plus />} onClick={openCreate}>
                新增員工
              </Button>
            </>
          }
        />
      ) : (
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList aria-label="報名狀態" className="mb-4">
            <TabsTrigger value="all" count={counts.all}>
              全部
            </TabsTrigger>
            <TabsTrigger value="unregistered" count={counts.unregistered}>
              未報名
            </TabsTrigger>
            <TabsTrigger value="registered" count={counts.registered}>
              已報名
            </TabsTrigger>
          </TabsList>
          <TabsContent value={tab}>
            <EmployeeToolbar
              query={query}
              onQueryChange={changeQuery}
              filters={filters}
              departments={departments}
              teams={teams}
              regions={regions}
              onDepartmentChange={(d) => changeFilters(changeDepartmentFilter(employees, filters, d))}
              onTeamChange={(team) => changeFilters({ ...filters, team })}
              onRegionChange={(region) => changeFilters({ ...filters, region })}
              picked={picked.length}
              onBulkJoin={() => setConfirm({ kind: 'bulk', employeeIds: picked })}
            />
            <FilterChips
              filters={filters}
              onRemove={(key) => changeFilters({ ...filters, [key]: null })}
              onClear={clearFilters}
            />
            {empty ? (
              <ListEmptyState
                state={empty}
                query={query}
                onClearSearch={() => changeQuery('')}
                onClearFilters={clearFilters}
              />
            ) : (
              <EmployeeTable
                rows={pageRows}
                total={rows.length}
                page={current}
                onPageChange={setPage}
                registered={registered}
                selected={selected}
                onToggle={toggle}
                onToggleAll={(checked) => setSelected((prev) => toggleAllOnPage(pageRows, registered, prev, checked))}
                onAction={onAction}
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      <EmployeeDialog
        target={editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onSubmit={(target, values) =>
          target.mode === 'edit' ? actions.updateEmployee(target.employee, values) : actions.createEmployee(values)
        }
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ConfirmDialog
        confirm={confirm}
        onClose={() => setConfirm(null)}
        onConfirm={(c) => {
          if (c.kind === 'delete') {
            unselect([c.employee.id]);
            actions.deleteEmployee(c.employee);
          } else if (c.kind === 'cancel') {
            unselect([c.employee.id]);
            actions.cancelRegistration(c.employee, c.participantId);
          } else {
            unselect(c.employeeIds);
            actions.bulkJoin(c.employeeIds);
          }
        }}
      />
      <JoinDialogSlot
        employeeId={joinEmployeeId}
        onOpenChange={(open) => {
          if (!open) setJoinEmployeeId(null);
        }}
      />
    </section>
  );
}

/** 刪除、取消報名與一次加入多位的確認（第 4.1 節文案；README 第 9 節「危險或不可復原的操作」） */
function ConfirmDialog({
  confirm,
  onClose,
  onConfirm,
}: {
  confirm: Confirm | null;
  onClose: () => void;
  onConfirm: (c: Confirm) => void;
}) {
  return (
    <AlertDialog
      open={confirm != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {confirm?.kind === 'delete' ? (
        <AlertDialogContent
          title={`要刪除 ${confirm.employee.name} 嗎？`}
          description={
            confirm.registered
              ? `${confirm.employee.name} 已報名尾牙，刪除後會一併取消報名、移除眷屬並空出座位。刪除後無法復原。`
              : '刪除後無法復原。'
          }
          confirmLabel="刪除員工"
          destructive
          onConfirm={() => onConfirm(confirm)}
        />
      ) : confirm?.kind === 'cancel' ? (
        <AlertDialogContent
          title={`要取消 ${confirm.employee.name} 的報名嗎？`}
          description={`${confirm.employee.name} 會從參與人員移除，眷屬一併移除，已安排的座位會空出來；員工名單不受影響，之後可以再加入。`}
          confirmLabel="確認取消報名"
          cancelLabel="返回"
          destructive
          onConfirm={() => onConfirm(confirm)}
        />
      ) : confirm?.kind === 'bulk' ? (
        <AlertDialogContent
          title={`要把 ${confirm.employeeIds.length} 位員工加入尾牙嗎？`}
          description="只加入員工本人，眷屬請之後在參與人員補上。"
          confirmLabel="加入尾牙"
          onConfirm={() => onConfirm(confirm)}
        />
      ) : null}
    </AlertDialog>
  );
}

/** 表格位置的空狀態（EMP-R17 的 2～5；沒有任何員工的空狀態在頁面上方處理） */
function ListEmptyState({
  state,
  query,
  onClearSearch,
  onClearFilters,
}: {
  state: EmployeeEmptyState;
  query: string;
  onClearSearch: () => void;
  onClearFilters: () => void;
}) {
  switch (state) {
    case 'no-search-results':
      return (
        <EmptyState
          icon={<Search />}
          title={`找不到「${query.trim()}」。`}
          action={
            <Button variant="outline" onClick={onClearSearch}>
              清除搜尋
            </Button>
          }
        />
      );
    case 'no-filter-results':
      return (
        <EmptyState
          icon={<Search />}
          title="找不到符合條件的員工。"
          action={
            <Button variant="outline" onClick={onClearFilters}>
              清除篩選
            </Button>
          }
        />
      );
    case 'all-registered':
      return <EmptyState icon={<Check />} title="所有員工都已報名。" />;
    case 'none-registered':
      return (
        <EmptyState icon={<Users />} title="還沒有員工報名。" description="在「全部」分頁把報名的員工加入尾牙。" />
      );
    default:
      return null;
  }
}
