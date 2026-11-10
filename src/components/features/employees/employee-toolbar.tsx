'use client';

// Tabs 之下的工具列與已套用的篩選（docs/spec/employees.md 2.2、3.3 節；原型 employees.html toolbar／chips）。
// 依序為搜尋、部門、組別、地區篩選；勾選後右側出現「加入尾牙（{n} 位）」。手機（767 px 以下）依序堆疊。
// 搜尋用 Input `sm`，篩選用 Dropdown Menu `select`（同一個工具列一致用 sm，04-patterns-and-ux.md Toolbar Rules）。
import { UserPlus, X } from 'lucide-react';
import { useMemo } from 'react';
import type { EmployeeFilters } from '@/domain/employees';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';

const ANY = '';

/** 篩選的觸發元件：沒選時顯示欄位名稱，選了顯示「部門：研發部」（原型 UI.select prefix） */
const withPrefix = (prefix: string) => (o: SelectOption) => `${prefix}：${o.label}`;

export interface EmployeeToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  filters: EmployeeFilters;
  departments: readonly string[];
  /** 組別清單；不同部門的同名組別各列一次（EMP-Q11），所以可能重複 */
  teams: readonly string[];
  regions: readonly string[];
  onDepartmentChange: (department: string | null) => void;
  onTeamChange: (team: string | null) => void;
  onRegionChange: (region: string | null) => void;
  /** 勾選的員工數；0 時不顯示批次按鈕 */
  picked: number;
  onBulkJoin: () => void;
}

export function EmployeeToolbar({
  query,
  onQueryChange,
  filters,
  departments,
  teams,
  regions,
  onDepartmentChange,
  onTeamChange,
  onRegionChange,
  picked,
  onBulkJoin,
}: EmployeeToolbarProps) {
  const departmentOpts = useMemo<SelectOption[]>(
    () => [{ value: ANY, label: '不限' }, ...departments.map((d) => ({ value: d, label: d }))],
    [departments],
  );
  // 同名組別各列一次，選項值要不重複（React key 與選項 id 用得到）；篩選本身只比對組別名稱
  const teamOpts = useMemo<SelectOption[]>(
    () => [{ value: ANY, label: '不限' }, ...teams.map((t, i) => ({ value: `${i}:${t}`, label: t }))],
    [teams],
  );
  const regionOpts = useMemo<SelectOption[]>(
    () => [{ value: ANY, label: '不限' }, ...regions.map((r) => ({ value: r, label: r }))],
    [regions],
  );
  const teamValue =
    filters.team == null ? null : (teamOpts.find((o) => o.value !== ANY && o.label === filters.team)?.value ?? null);
  const labelOf = (v: string | null, opts: SelectOption[]) =>
    v == null || v === ANY ? null : (opts.find((o) => o.value === v)?.label ?? null);

  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <SearchInput
        label="搜尋姓名、英文名、分機、部門或組別"
        placeholder="搜尋姓名、分機、部門或組別"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="min-w-0 flex-[1_1_260px] max-md:basis-full"
      />
      <Select
        aria-label="部門"
        size="sm"
        placeholder="部門"
        searchable
        searchPlaceholder="搜尋部門"
        options={departmentOpts}
        value={filters.department}
        renderValue={withPrefix('部門')}
        onValueChange={(v) => onDepartmentChange(v == null || v === ANY ? null : v)}
        className="min-w-0 flex-[0_1_164px] max-md:basis-full"
      />
      <Select
        aria-label="組別"
        size="sm"
        placeholder="組別"
        searchable
        searchPlaceholder="搜尋組別"
        options={teamOpts}
        value={teamValue}
        renderValue={withPrefix('組別')}
        onValueChange={(v) => onTeamChange(labelOf(v, teamOpts))}
        className="min-w-0 flex-[0_1_164px] max-md:basis-full"
      />
      <Select
        aria-label="地區"
        size="sm"
        placeholder="地區"
        options={regionOpts}
        value={filters.region}
        renderValue={withPrefix('地區')}
        onValueChange={(v) => onRegionChange(v == null || v === ANY ? null : v)}
        className="min-w-0 flex-[0_1_164px] max-md:basis-full"
      />
      {picked > 0 ? (
        <div className="ml-auto flex flex-wrap gap-2 max-md:ml-0 max-md:basis-full max-md:*:flex-1">
          <Button variant="primary" leadingIcon={<UserPlus />} onClick={onBulkJoin}>
            加入尾牙（{picked} 位）
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export interface FilterChipsProps {
  filters: EmployeeFilters;
  onRemove: (key: keyof EmployeeFilters) => void;
  onClear: () => void;
}

/** 已套用的篩選：每一項一個徽章，按下移除那一項；後面接「清除篩選」（EMP-R16） */
export function FilterChips({ filters, onRemove, onClear }: FilterChipsProps) {
  const chips = (['department', 'team', 'region'] as const).filter((k) => filters[k] != null);
  if (chips.length === 0) return null;
  return (
    <div className="-mt-2 mb-4 flex min-w-0 flex-wrap items-center gap-2">
      {chips.map((key) => (
        <Badge key={key} asChild variant="outline" icon={null}>
          <button type="button" aria-label={`移除篩選 ${filters[key]}`} onClick={() => onRemove(key)}>
            {filters[key]}
            <X aria-hidden />
          </button>
        </Badge>
      ))}
      <Button variant="link" onClick={onClear}>
        清除篩選
      </Button>
    </div>
  );
}
