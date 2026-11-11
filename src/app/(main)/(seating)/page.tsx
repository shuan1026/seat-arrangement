import type { Metadata } from 'next';
import { SeatingPage } from '@/components/features/seating/seating-page';
import { parseTableCode } from '@/domain/layout';

// 座位安排（/，docs/spec/seating.md）。放在自己的 route group，載入中的 Skeleton（loading.tsx）只套在這一頁。
export const metadata: Metadata = { title: '座位安排' };

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const table = first(sp.table);
  const staged = first(sp.staged)?.trim();
  // 網址 /?table={桌號}：開啟那個位置上的桌的詳情並標示（participants.md PPL-R33、D-019）。
  // 桌號不分大小寫、去掉前後空白；不是 A1～A15、B1～B15（例如舊的數字 12、C1、A16）就忽略，照常開座位安排
  const initialPosition = table === undefined ? null : (parseTableCode(table) ?? null);
  // 網址 /?staged={桌子 id}：開啟那張暫存的桌的詳情（參與人員頁的「暫存」徽章，PPL-R33、D-027）；不是數字就忽略
  const initialStaged = staged && /^\d+$/.test(staged) ? Number(staged) : null;
  return (
    <SeatingPage
      key={`${initialPosition ?? 'none'}:${initialStaged ?? 'none'}`}
      initialTable={initialPosition}
      initialStaged={initialStaged}
    />
  );
}
