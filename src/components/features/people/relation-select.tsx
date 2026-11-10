'use client';

// 稱謂欄位（docs/spec/participants.md PPL-R50）：可搜尋的 Dropdown Menu `select`，常見選項是配偶、子女、父母、兄弟姊妹；
// 輸入的文字不在選項中時多一個「新增稱謂「{輸入文字}」」，按下即以輸入的文字作為稱謂。
// 共用的 Select 沒有「找不到就新增」的選項，這裡讀選單搜尋欄的輸入（React 事件會沿著元件樹穿過 portal 冒泡上來），
// 把輸入的文字當成一個選項加進去。
import { useState, type ChangeEvent } from 'react';
import { Select, type SelectOption } from '@/components/ui/select';

export const COMMON_RELATIONS = ['配偶', '子女', '父母', '兄弟姊妹'] as const;

export interface RelationSelectProps {
  id?: string;
  label: string;
  value: string | null;
  onValueChange: (value: string | null) => void;
}

export function RelationSelect({ id, label, value, onValueChange }: RelationSelectProps) {
  const [typed, setTyped] = useState('');
  const known: string[] = [...COMMON_RELATIONS];
  if (value && !known.includes(value)) known.push(value);
  const options: SelectOption[] = known.map((r) => ({ value: r, label: r }));
  const text = typed.trim().slice(0, 20);
  if (text && !known.includes(text)) options.push({ value: text, label: `新增稱謂「${text}」` });

  // 只聽 Select 選單裡的搜尋欄（role=combobox 的 input）
  const onSearchInput = (e: ChangeEvent<HTMLElement>) => {
    const target = e.target;
    if (target instanceof HTMLInputElement && target.getAttribute('role') === 'combobox') setTyped(target.value);
  };

  return (
    <div className="min-w-0" onChange={onSearchInput}>
      <Select
        id={id}
        label={label}
        options={options}
        value={value}
        onValueChange={onValueChange}
        placeholder="選擇或輸入稱謂"
        searchable
        searchPlaceholder="選擇或輸入稱謂"
        clearable
        clearLabel="清除稱謂"
        onOpenChange={(open) => {
          if (!open) setTyped('');
        }}
      />
    </div>
  );
}
