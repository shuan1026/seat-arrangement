import type { Metadata } from 'next';
import { SeatingPage } from '@/components/features/seating/seating-page';
import { parseTableCode } from '@/domain/layout';

// 座位安排（/，docs/spec/seating.md）。放在自己的 route group，載入中的 Skeleton（loading.tsx）只套在這一頁。
export const metadata: Metadata = { title: '座位安排' };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).table;
  const value = Array.isArray(raw) ? raw[0] : raw;
  // 網址 /?table={桌號}：開啟那一桌的桌次詳情並標示那一桌（participants.md PPL-R33、D-019）。
  // 桌號不分大小寫、去掉前後空白；不是 A1～A15、B1～B15（例如舊的數字 12、C1、A16）就忽略，照常開座位安排
  const initialTable = value === undefined ? null : (parseTableCode(value) ?? null);
  return <SeatingPage key={initialTable ?? 'none'} initialTable={initialTable} />;
}
