'use client';

// 人員的顯示片段：第一行的顯示名稱與徽章、座位圖名單列的小標示（docs/spec/README.md 第 11.1 節；seating.md 2.1.8、2.2.2）。
import { Baby, Leaf } from 'lucide-react';
import type { Participant } from '@/contracts/entities';
import { Badge, MarkBadge } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import { Tooltip } from '@/components/ui/tooltip';

/** 第一行：顯示名稱 Text-sm/Medium 加徽章；不換行，過長時姓名截斷（2.2.2） */
export function NameLine({ person, name, className }: { person: Participant; name: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-nowrap items-center gap-1.5 type-sm-medium text-foreground', className)}>
      <span className="min-w-0 truncate">{name}</span>
      {person.kind === 'GUEST' ? <Badge variant="outline">貴賓</Badge> : null}
      {person.childSeat ? <MarkBadge icon={<Baby />} label="兒童椅" /> : null}
      {person.vegetarian ? <MarkBadge icon={<Leaf />} label="素食" /> : null}
    </div>
  );
}

/**
 * 座位圖名單列的小標示（2.1.8）：外部貴賓一個字的「賓」、兒童椅與素食只放圖示，滑過顯示 Tooltip。
 * 名單卡片的欄寬有限，姓名要完整顯示，所以標示不縮小姓名；放不下時標示疊在旁邊（relative 讓它畫在相鄰的列之上）。
 */
export function SeatMarks({ person }: { person: Participant }) {
  if (person.kind !== 'GUEST' && !person.childSeat && !person.vegetarian) return null;
  return (
    <span className="relative flex shrink-0 items-center gap-0.5">
      {person.kind === 'GUEST' ? (
        <Tooltip content="貴賓">
          <span
            tabIndex={-1}
            className="inline-flex h-4 min-w-5 shrink-0 items-center justify-center rounded-full border border-semantic-border px-1 type-xs-medium text-foreground"
          >
            賓
          </span>
        </Tooltip>
      ) : null}
      {person.childSeat ? <MarkBadge icon={<Baby />} label="兒童椅" /> : null}
      {person.vegetarian ? <MarkBadge icon={<Leaf />} label="素食" /> : null}
    </span>
  );
}
