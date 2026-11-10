'use client';

// 員工名單表格與分頁導覽（docs/spec/employees.md 2.3、2.4、3.2、3.4、3.5 節；原型 employees.html UI.table）。
// 欄位依序為勾選、姓名、部門、組別、分機、地區、報名狀態、備註、列操作；每頁 20 列。
// 手機（767 px 以下）改成堆疊卡片：勾選框在左上角、不顯示備註、沒有全選（EMP-R26）。
// 報名狀態有三種（EMP-R03、D-014）：已報名 positive、未報名 pending、不參加 neutral（沒有圖示，README 第 11.1 節）；
// 只有未報名的列能勾（EMP-R18）。
// 只能檢視（readOnly，EMP-R67）：沒有勾選欄；列操作只留不修改資料的「查看參與資料」，一個項目都沒有時不顯示列操作按鈕。
import { Fragment, type ReactNode } from 'react';
import { Ban, Pencil, Trash2, Undo2, UserPlus, UserX, Users } from 'lucide-react';
import type { Employee } from '@/contracts/entities';
import {
  employeeRowActions,
  headerCheckState,
  registrationStatusOf,
  type EmployeeRowAction,
  type RegistrationStatus,
} from '@/domain/employees';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ActionMenu, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const PAGE_SIZE = 20;

export type RowAction = EmployeeRowAction;

/** 報名狀態的徽章（README 第 11.1 節狀態徽章） */
const STATUS_BADGE: Record<RegistrationStatus, { variant: BadgeVariant; label: string }> = {
  registered: { variant: 'positive', label: '已報名' },
  unregistered: { variant: 'pending', label: '未報名' },
  declined: { variant: 'neutral', label: '不參加' },
};

/** 不能勾的列：停用的勾選框，無障礙名稱「{姓名} 已報名」「{姓名} 不參加」（EMP-R25） */
const DISABLED_CHECK_LABEL: Record<Exclude<RegistrationStatus, 'unregistered'>, string> = {
  registered: '已報名',
  declined: '不參加',
};

export interface EmployeeTableProps {
  /** 這一頁的列 */
  rows: readonly Employee[];
  /** 符合條件的全部列數（分頁摘要用） */
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  registered: ReadonlySet<number>;
  selected: ReadonlySet<number>;
  onToggle: (id: number, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onAction: (action: RowAction, employee: Employee) => void;
  /** 只能檢視：沒有勾選欄，列操作只留「查看參與資料」 */
  readOnly?: boolean;
}

/** 只能檢視時仍可用的列操作（不修改資料，EMP-R67） */
const READ_ONLY_ACTIONS: ReadonlySet<RowAction> = new Set(['view']);

const Dash = () => <span className="text-muted-foreground">—</span>;

export function EmployeeTable({
  rows,
  total,
  page,
  onPageChange,
  registered,
  selected,
  onToggle,
  onToggleAll,
  onAction,
  readOnly = false,
}: EmployeeTableProps) {
  const header = headerCheckState(rows, registered, selected);
  return (
    <div className="min-w-0">
      <Table label="員工名單" stackOnMobile>
        <TableHeader>
          <TableRow>
            {readOnly ? null : (
              <TableHead kind="check">
                <Checkbox
                  aria-label="全選這一頁未報名的員工"
                  checked={header.checked}
                  disabled={header.disabled}
                  onCheckedChange={(v) => onToggleAll(v === true)}
                />
              </TableHead>
            )}
            <TableHead>姓名</TableHead>
            <TableHead>部門</TableHead>
            <TableHead>組別</TableHead>
            <TableHead>分機</TableHead>
            <TableHead>地區</TableHead>
            <TableHead>報名狀態</TableHead>
            <TableHead>備註</TableHead>
            <TableHead kind="actions">
              <span className="sr-only">操作</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => {
            const status = registrationStatusOf(e, registered);
            const badge = STATUS_BADGE[status];
            return (
              <TableRow key={e.id}>
                {readOnly ? null : (
                  <TableCell kind="check">
                    {status !== 'unregistered' ? (
                      <Checkbox aria-label={`${e.name} ${DISABLED_CHECK_LABEL[status]}`} checked={false} disabled />
                    ) : (
                      <Checkbox
                        aria-label={`勾選 ${e.name}`}
                        checked={selected.has(e.id)}
                        onCheckedChange={(v) => onToggle(e.id, v === true)}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell kind="primary">
                  <div className="type-sm-medium text-foreground [overflow-wrap:anywhere]">{e.name}</div>
                  {e.englishName ? (
                    <div className="type-xs-regular text-muted-foreground [overflow-wrap:anywhere]">
                      {e.englishName}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell label="部門">{e.department}</TableCell>
                <TableCell label="組別">{e.team ?? <Dash />}</TableCell>
                <TableCell label="分機">
                  {e.extension ? <span className="tabular-nums">{e.extension}</span> : <Dash />}
                </TableCell>
                <TableCell label="地區">{e.region ?? <Dash />}</TableCell>
                <TableCell label="報名狀態">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </TableCell>
                <TableCell label="備註" hideOnMobile>
                  {e.note ? <span className="[overflow-wrap:anywhere]">{e.note}</span> : <Dash />}
                </TableCell>
                <TableCell kind="actions">
                  <RowMenu status={status} readOnly={readOnly} onAction={(a) => onAction(a, e)} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Pagination className="mt-3" page={page} pageSize={PAGE_SIZE} total={total} onPageChange={onPageChange} />
    </div>
  );
}

/** 選單項目的文案與圖示；「取消報名」「刪除」是危險樣式（EMP-R27） */
const MENU_ITEMS: Record<RowAction, { label: string; icon: ReactNode; destructive?: boolean }> = {
  join: { label: '加入尾牙', icon: <UserPlus /> },
  decline: { label: '標記為不參加', icon: <Ban /> },
  undecline: { label: '改回未報名', icon: <Undo2 /> },
  view: { label: '查看參與資料', icon: <Users /> },
  cancel: { label: '取消報名', icon: <UserX />, destructive: true },
  edit: { label: '編輯', icon: <Pencil /> },
  delete: { label: '刪除', icon: <Trash2 />, destructive: true },
};

/**
 * 列操作（EMP-R27）：未報名「加入尾牙」「標記為不參加」「編輯」「刪除」；不參加「加入尾牙」「改回未報名」「編輯」「刪除」；
 * 已報名「查看參與資料」「取消報名」「編輯」「刪除」。「刪除」前有分隔線。
 */
function RowMenu({
  status,
  readOnly,
  onAction,
}: {
  status: RegistrationStatus;
  readOnly: boolean;
  onAction: (action: RowAction) => void;
}) {
  const actions = employeeRowActions(status).filter((a) => !readOnly || READ_ONLY_ACTIONS.has(a));
  if (!actions.length) return null;
  return (
    <ActionMenu>
      {actions.map((action) => {
        const item = MENU_ITEMS[action];
        return (
          <Fragment key={action}>
            {action === 'delete' ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem icon={item.icon} destructive={item.destructive} onSelect={() => onAction(action)}>
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        );
      })}
    </ActionMenu>
  );
}
