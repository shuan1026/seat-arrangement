import { Armchair, IdCard, KeyRound, Users, type LucideIcon } from 'lucide-react';

// 左側導覽的順序與名稱固定（docs/spec/README.md 第 4、5 節）：編輯者四項，只能檢視的人沒有「權限」（D-021）
export type NavItem = { href: string; label: string; icon: LucideIcon; editorOnly?: boolean };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: '座位安排', icon: Armchair },
  { href: '/people', label: '參與人員', icon: Users },
  { href: '/employees', label: '員工名單', icon: IdCard },
  { href: '/permissions', label: '權限', icon: KeyRound, editorOnly: true },
];

/** 這個權限看得到的導覽項目 */
export const navItemsFor = (isEditor: boolean) => NAV_ITEMS.filter((item) => isEditor || !item.editorOnly);

export const isCurrent = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
