'use client';

// 人員面板（docs/spec/seating.md 2.2、3.9、4.2；原型 seating.html 的 peoplePanel、peopleEmpty）。
// 「未入座」分頁不含工作人員；「全部」列出所有參與人員，第二行右側顯示桌次、未入座或工作人員。
// 搜尋與篩選兩個分頁共用，切換分頁時保留（SEAT-R55）。
import { IdCard, PanelLeftClose, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAppStore } from '@/client/app-provider';
import { STAFF_TABLE_ID, type Participant } from '@/contracts/entities';
import { departmentOf, displayName } from '@/domain/display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { SearchInput } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dropAttr, useDragState, useSeatingDraggable } from './drag';
import { CATEGORY_LABEL, departmentsInOrder, panelMeta, searchMatch } from './model';
import { NameLine } from './person-parts';
import { PersonMenu, useSeatingUi } from './person-menu';

const ALL = '__all';
type Tab = 'unseated' | 'all';

export interface PeoplePanelProps {
  sorted: readonly Participant[];
  hidden: boolean;
  mobile: boolean;
  draggable: boolean;
  onCollapse: () => void;
}

export function PeoplePanel({ sorted, hidden, mobile, draggable, onCollapse }: PeoplePanelProps) {
  const dir = useAppStore((s) => s.dir);
  const employees = useAppStore((s) => s.data.employees);
  const [tab, setTab] = useState<Tab>('unseated');
  const [q, setQ] = useState('');
  const [dept, setDept] = useState<string | null>(null);
  const [cat, setCat] = useState<Participant['kind'] | null>(null);

  const depts = useMemo(() => departmentsInOrder(employees), [employees]);
  const passFilters = (p: Participant) => (!dept || departmentOf(p, dir) === dept) && (!cat || p.kind === cat);
  const unseatedCount = sorted.filter((p) => p.tableId === null).length;
  const rows = sorted.filter((p) => (tab === 'all' || p.tableId === null) && passFilters(p) && searchMatch(p, dir, q));

  // 從桌次或工作人員桌拖移人員時，清單區上方顯示放置提示（2.2.4、SEAT-R27）
  const fromSeat = useDragState((s) => {
    const src = s.source;
    if (src?.kind !== 'person' || src.origin === 'panel') return false;
    return true;
  });
  const over = useDragState((s) => s.target?.kind === 'panel');

  const empty = (): React.ReactNode => {
    if (!sorted.length) {
      return (
        <EmptyState
          variant="plain"
          icon={<Users />}
          title="還沒有參與人員。"
          description="到員工名單把報名的員工加入尾牙，或新增貴賓與眷屬後，就可以開始安排座位。"
          action={
            <Button asChild variant="primary" leadingIcon={<IdCard />}>
              <Link href="/employees">前往員工名單</Link>
            </Button>
          }
        />
      );
    }
    const query = q.trim();
    const showAll = (
      <Button variant="outline" size="sm" onClick={() => setTab('all')}>
        在全部中查看
      </Button>
    );
    if (query && tab === 'unseated') {
      const found = sorted.filter((p) => passFilters(p) && searchMatch(p, dir, q));
      if (found.length === 1) {
        const p = found[0]!;
        const name = displayName(p, dir);
        const title = p.tableId === STAFF_TABLE_ID ? `${name} 在工作人員桌。` : `${name} 已入座，在第 ${p.tableId} 桌。`;
        return <EmptyState variant="inline" title={title} action={showAll} />;
      }
      if (found.length > 1) {
        return <EmptyState variant="inline" title={`未入座裡找不到「${query}」。`} description={`全部有 ${found.length} 位符合。`} action={showAll} />;
      }
    }
    if (query) {
      return (
        <EmptyState
          variant="inline"
          title={`找不到「${query}」。`}
          action={
            <Button variant="outline" size="sm" onClick={() => setQ('')}>
              清除搜尋
            </Button>
          }
        />
      );
    }
    if (dept || cat) {
      return (
        <EmptyState
          variant="inline"
          title="找不到符合條件的人員。"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDept(null);
                setCat(null);
              }}
            >
              清除篩選
            </Button>
          }
        />
      );
    }
    return <EmptyState variant="plain" icon={<Users />} title="所有人都已入座。" description="新增人員後會出現在這裡。" />;
  };

  return (
    <aside
      aria-label="人員"
      className={cn(
        'flex min-h-0 min-w-0 flex-col rounded-xl border border-border bg-card text-card-foreground edge-card',
        mobile ? 'w-full' : 'w-[280px] shrink-0',
        hidden && 'hidden',
      )}
    >
      <div className="flex items-center justify-between gap-2 pt-3 pr-3 pl-4">
        <h2 className="type-lg-semi-bold">人員</h2>
        {mobile ? null : (
          <IconButton label="隱藏人員面板" size="sm" tooltip onClick={onCollapse}>
            <PanelLeftClose />
          </IconButton>
        )}
      </div>
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <SearchInput label="搜尋姓名、分機、部門或單位" placeholder="搜尋姓名、分機、部門或單位" value={q} onChange={(e) => setQ(e.target.value)} />
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="self-start max-w-full">
          <TabsList aria-label="人員分頁">
            <TabsTrigger value="unseated" count={unseatedCount}>
              未入座
            </TabsTrigger>
            <TabsTrigger value="all" count={sorted.length}>
              全部
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid grid-cols-2 gap-2">
          <Select
            size="sm"
            aria-label="部門"
            placeholder="部門"
            searchable
            searchPlaceholder="搜尋部門"
            value={dept}
            renderValue={(o) => `部門：${o.label}`}
            options={[{ value: ALL, label: '不限' }, ...depts.map((d) => ({ value: d, label: d }))]}
            onValueChange={(v) => setDept(!v || v === ALL ? null : v)}
          />
          <Select
            size="sm"
            aria-label="類別"
            placeholder="類別"
            value={cat}
            renderValue={(o) => `類別：${o.label}`}
            options={[
              { value: ALL, label: '不限' },
              ...(['EMPLOYEE', 'DEPENDENT', 'GUEST'] as const).map((k) => ({ value: k, label: CATEGORY_LABEL[k] })),
            ]}
            onValueChange={(v) => setCat(!v || v === ALL ? null : (v as Participant['kind']))}
          />
        </div>
      </div>
      {fromSeat ? (
        <div className="mx-2 mt-2 rounded-lg border border-dashed border-primary p-3 text-center type-sm-medium text-primary">放開以移出桌次</div>
      ) : null}
      <div
        data-drop={dropAttr.panel}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto rounded-lg p-2 scrollbar-inset',
          mobile && 'max-h-[60dvh]',
          over && 'shadow-[inset_0_0_0_2px_var(--primary)]',
        )}
      >
        {rows.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {rows.map((p) => (
              <PersonRow key={p.id} person={p} showSeat={tab === 'all'} draggable={draggable} />
            ))}
          </ul>
        ) : (
          empty()
        )}
      </div>
    </aside>
  );
}

function PersonRow({ person, showSeat, draggable }: { person: Participant; showSeat: boolean; draggable: boolean }) {
  const dir = useAppStore((s) => s.dir);
  const ui = useSeatingUi();
  const name = displayName(person, dir);
  const meta = panelMeta(person, dir);
  const { setNodeRef, listeners, attributes, isDragging } = useSeatingDraggable(
    `person:${person.id}:panel`,
    { kind: 'person', participantId: person.id, origin: 'panel' },
    { disabled: !draggable, role: 'listitem' },
  );
  return (
    <li
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-md p-2 outline-none hover:bg-hover focus-visible:focus-ring',
        draggable && 'cursor-grab',
        isDragging && 'opacity-50',
      )}
    >
      <div className="min-w-0 flex-1">
        <NameLine person={person} name={name} />
        <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
          <span className="flex min-w-0 flex-1 items-baseline overflow-hidden whitespace-nowrap type-xs-regular text-muted-foreground">
            <span className="min-w-0 truncate">{meta.department}</span>
            {meta.team ? <span className="shrink-0">・{meta.team}</span> : null}
          </span>
          {showSeat ? <SeatStatus person={person} onLocate={ui.locate} /> : null}
        </div>
      </div>
      <PersonMenu person={person} place="panel" />
    </li>
  );
}

/** 「全部」分頁第二行右側（SEAT-R57）：已入座「第 {n} 桌」（可按下標示那一桌）、未入座、工作人員 */
function SeatStatus({ person, onLocate }: { person: Participant; onLocate: (tableId: number) => void }) {
  if (person.tableId === STAFF_TABLE_ID) return <Badge variant="neutral">工作人員</Badge>;
  if (person.tableId === null) return <Badge variant="pending">未入座</Badge>;
  const tableId = person.tableId;
  return (
    <Badge asChild variant="outline">
      <button type="button" onClick={() => onLocate(tableId)}>
        第 {tableId} 桌
      </button>
    </Badge>
  );
}
