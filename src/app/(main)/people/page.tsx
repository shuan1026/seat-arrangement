import type { Metadata } from 'next';
import { PeoplePage } from '@/components/features/people/people-page';

// 參與人員（docs/spec/participants.md）。資料由 (main)/layout.tsx 載入到 store。
export const metadata: Metadata = { title: '參與人員' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Props) {
  // /people?employee={員工 id}：員工名單的「查看參與資料」（PPL-Q19、EMP-Q07）
  const { employee } = await searchParams;
  const id = Number(Array.isArray(employee) ? employee[0] : employee);
  const employeeId = Number.isInteger(id) && id > 0 ? id : null;
  return <PeoplePage key={employeeId ?? 'all'} initialEmployeeId={employeeId} />;
}
