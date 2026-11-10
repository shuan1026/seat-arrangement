'use client';

// 員工名單表格與分頁導覽（docs/spec/employees.md 2.3、2.4、3.2、3.4、3.5 節；原型 employees.html UI.table）。
// 欄位依序為勾選、姓名、部門、組別、分機、地區、報名狀態、備註、列操作；每頁 20 列。
// 手機（767 px 以下）改成堆疊卡片：勾選框在左上角、不顯示備註、沒有全選（EMP-R26）。
import { Pencil, Trash2, UserPlus, UserX, Users } from 'lucide-react';
import type { Employee } from '@/contracts/entities';
import { headerCheckState } from '@/domain/employees';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ActionMenu, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const PAGE_SIZE = 20;

export type RowAction = 'join' | 'view' | 'cancel' | 'edit' | 'delete';

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
}

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
}: EmployeeTableProps) {
  const header = headerCheckState(rows, registered, selected);
  return (
    <div className="min-w-0">
      <Table label="員工名單" stackOnMobile>
        <TableHeader>
          <TableRow>
            <TableHead kind="check">
              <Checkbox
                aria-label="全選這一頁未報名的員工"
                checked={header.checked}
                disabled={header.disabled}
                onCheckedChange={(v) => onToggleAll(v === true)}
              />
            </TableHead>
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
            const isRegistered = registered.has(e.id);
            return (
              <TableRow key={e.id}>
                <TableCell kind="check">
                  {isRegistered ? (
                    <Checkbox aria-label={`${e.name} 已報名`} checked={false} disabled />
                  ) : (
                    <Checkbox
                      aria-label={`勾選 ${e.name}`}
                      checked={selected.has(e.id)}
                      onCheckedChange={(v) => onToggle(e.id, v === true)}
                    />
                  )}
                </TableCell>
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
                  <Badge variant={isRegistered ? 'positive' : 'pending'}>{isRegistered ? '已報名' : '未報名'}</Badge>
                </TableCell>
                <TableCell label="備註" hideOnMobile>
                  {e.note ? <span className="[overflow-wrap:anywhere]">{e.note}</span> : <Dash />}
                </TableCell>
                <TableCell kind="actions">
                  <RowMenu registered={isRegistered} onAction={(a) => onAction(a, e)} />
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

/** 列操作（EMP-R27）：未報名「加入尾牙」「編輯」「刪除」；已報名「查看參與資料」「取消報名」「編輯」「刪除」 */
function RowMenu({ registered, onAction }: { registered: boolean; onAction: (action: RowAction) => void }) {
  return (
    <ActionMenu>
      {registered ? (
        <>
          <DropdownMenuItem icon={<Users />} onSelect={() => onAction('view')}>
            查看參與資料
          </DropdownMenuItem>
          <DropdownMenuItem icon={<UserX />} destructive onSelect={() => onAction('cancel')}>
            取消報名
          </DropdownMenuItem>
        </>
      ) : (
        <DropdownMenuItem icon={<UserPlus />} onSelect={() => onAction('join')}>
          加入尾牙
        </DropdownMenuItem>
      )}
      <DropdownMenuItem icon={<Pencil />} onSelect={() => onAction('edit')}>
        編輯
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => onAction('delete')}>
        刪除
      </DropdownMenuItem>
    </ActionMenu>
  );
}
