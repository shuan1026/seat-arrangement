'use client';

// 參與人員表格（docs/spec/participants.md 第 2.1 節的表格欄位、第 2.2 節的列操作、PPL-R29～R34、PPL-R75）。
// Data Management 的 Table Rules：桌面是表格，767 px 以下改成堆疊卡片（不顯示備註，保留列操作）。
// 只能檢視（readOnly，PPL-R86）：列操作的項目全都會修改資料，所以表格不顯示列操作欄，手機卡片也沒有列操作按鈕。
import { ArrowRightLeft, Armchair, Baby, Leaf, Pencil, Trash2, UserMinus, UserX } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAppStore } from '@/client/app-provider';
import { Badge } from '@/components/ui/badge';
import { ActionMenu, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Participant } from '@/contracts/entities';
import { displayName, extensionOf } from '@/domain/display';
import { tableCodeLabel } from '@/domain/layout';
import { kindLabel, rowActions, seatState, unitLabel, type RowAction } from '@/domain/participants';

export type RowCommand = RowAction;

const COMMANDS: Record<RowAction, { label: string; icon: ReactNode; destructive?: boolean }> = {
  edit: { label: '編輯', icon: <Pencil /> },
  seat: { label: '入座…', icon: <Armchair /> },
  move: { label: '移至其他桌次…', icon: <ArrowRightLeft /> },
  unseat: { label: '移出桌次', icon: <UserMinus /> },
  cancelRegistration: { label: '取消報名', icon: <UserX />, destructive: true },
  delete: { label: '刪除', icon: <Trash2 />, destructive: true },
};

const Empty = () => <span className="text-muted-foreground">—</span>;

/** 桌次欄（PPL-R33）：「{桌號}」連到座位安排（/?table={桌號}）並標示那一桌；未入座是待處理徽章；工作人員是中性徽章、不能按（PPL-Q18） */
function SeatBadge({ p }: { p: Participant }) {
  const state = seatState(p);
  if (state === 'staff') return <Badge variant="neutral">工作人員</Badge>;
  if (state === 'unseated') return <Badge variant="pending">未入座</Badge>;
  const code = tableCodeLabel(p.tableId ?? 0);
  return (
    <Badge variant="outline" asChild>
      <Link href={`/?table=${code}`}>{code}</Link>
    </Badge>
  );
}

/** 標示欄（PPL-R32）：兒童椅、素食的 `third` 徽章並排；都沒有時「—」 */
function Marks({ p }: { p: Participant }) {
  if (!p.childSeat && !p.vegetarian) return <Empty />;
  return (
    <span className="inline-flex min-w-0 flex-wrap justify-end gap-1.5 md:justify-start">
      {p.childSeat ? (
        <Badge variant="third" icon={<Baby />}>
          兒童椅
        </Badge>
      ) : null}
      {p.vegetarian ? (
        <Badge variant="third" icon={<Leaf />}>
          素食
        </Badge>
      ) : null}
    </span>
  );
}

export function PeopleTable({
  rows,
  onCommand,
  readOnly = false,
}: {
  rows: Participant[];
  onCommand: (command: RowCommand, p: Participant) => void;
  /** 只能檢視：沒有列操作欄 */
  readOnly?: boolean;
}) {
  const dir = useAppStore((s) => s.dir);
  return (
    <Table label="參與人員" stackOnMobile>
      <TableHeader>
        <TableRow>
          <TableHead>顯示名稱</TableHead>
          <TableHead>類別</TableHead>
          <TableHead>部門或單位</TableHead>
          <TableHead>分機</TableHead>
          <TableHead>標示</TableHead>
          <TableHead>桌次</TableHead>
          <TableHead>備註</TableHead>
          {readOnly ? null : (
            <TableHead kind="actions">
              <span className="sr-only">操作</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => {
          const unit = unitLabel(p, dir);
          const extension = extensionOf(p, dir);
          const actions = rowActions(p);
          return (
            <TableRow key={p.id}>
              <TableCell kind="primary" label="顯示名稱">
                {/* 一行顯示、不換行；外部貴賓加「貴賓」徽章，兒童椅與素食看標示欄（PPL-R32） */}
                <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap type-sm-medium">
                  <span className="min-w-0 truncate">{displayName(p, dir)}</span>
                  {p.kind === 'GUEST' ? <Badge variant="outline">貴賓</Badge> : null}
                </div>
              </TableCell>
              <TableCell label="類別">
                <span className="min-w-0">{kindLabel(p)}</span>
              </TableCell>
              <TableCell label="部門或單位">
                {unit ? <span className="min-w-0 [overflow-wrap:anywhere]">{unit}</span> : <Empty />}
              </TableCell>
              <TableCell label="分機">
                {extension ? <span className="tabular-nums">{extension}</span> : <Empty />}
              </TableCell>
              <TableCell label="標示">
                <Marks p={p} />
              </TableCell>
              <TableCell label="桌次">
                <SeatBadge p={p} />
              </TableCell>
              <TableCell label="備註" hideOnMobile>
                {p.note ? <span className="min-w-0 [overflow-wrap:anywhere]">{p.note}</span> : <Empty />}
              </TableCell>
              {readOnly ? null : (
                <TableCell kind="actions">
                  <ActionMenu>
                    {actions.map((a) => {
                      const c = COMMANDS[a];
                      return [
                        c.destructive ? <DropdownMenuSeparator key={`${a}-sep`} /> : null,
                        <DropdownMenuItem key={a} icon={c.icon} destructive={c.destructive} onSelect={() => onCommand(a, p)}>
                          {c.label}
                        </DropdownMenuItem>,
                      ];
                    })}
                  </ActionMenu>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
