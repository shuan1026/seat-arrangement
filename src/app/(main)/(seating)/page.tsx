import type { Metadata } from 'next';
import { SeatingPage } from '@/components/features/seating/seating-page';
import { TABLE_COUNT } from '@/contracts/entities';

// 座位安排（/，docs/spec/seating.md）。放在自己的 route group，載入中的 Skeleton（loading.tsx）只套在這一頁。
export const metadata: Metadata = { title: '座位安排' };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).table;
  const table = Number(Array.isArray(raw) ? raw[0] : raw);
  // 網址 /?table={n}：開啟那一桌的桌次詳情並標示那一桌（participants.md PPL-R33）
  const initialTable = Number.isInteger(table) && table >= 1 && table <= TABLE_COUNT ? table : null;
  return <SeatingPage key={initialTable ?? 'none'} initialTable={initialTable} />;
}
