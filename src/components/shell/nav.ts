import { Armchair, IdCard, Users, type LucideIcon } from 'lucide-react';

// 左側導覽固定三項，順序與名稱固定（docs/spec/README.md 第 4、5 節）
export const NAV_ITEMS: readonly { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/', label: '座位安排', icon: Armchair },
  { href: '/people', label: '參與人員', icon: Users },
  { href: '/employees', label: '員工名單', icon: IdCard },
];

export const isCurrent = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
