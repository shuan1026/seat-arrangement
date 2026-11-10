'use client';
// Dropdown Menu 的 select 變體（03-components.md Dropdown Menu：Select Menu、Shared Overlay Surface、Accessibility；
// 04-patterns-and-ux.md Dropdown Menu / Picker）。欄位外觀沿用 Input（label 在上、說明、錯誤）。
// - 觸發元件 36px（sm 32px）、右側 16px chevron；選單與觸發元件同寬，透過 portal 畫在 body 底下，不靠 z-index 逃出裁切。
// - 選項列 36px、文字靠左、勾號靠右；選中用 --primary 底。選項可有第二行說明；停用的選項顯示原因、不能選。
// - searchable：選單頂端有搜尋欄，可比對名稱、說明與 keywords（例如分機，docs/spec/README.md COM-R14）。
// - clearable：有值時在 chevron 左側顯示清除鈕。
// 觸發元件用 combobox 角色（同 Radix Select），開啟後焦點移到清單或搜尋欄。
// 鍵盤：方向鍵移動、Enter 選取、Esc 關閉、Tab 關閉；關閉後焦點回到觸發元件。中文輸入法組字時不攔截按鍵。
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from './cn';
import { overlaySurface } from './dropdown-menu';
import { controlClasses, Field, fieldAria, useFieldIds, type InputSize } from './input';

export interface SelectOption {
  value: string;
  label: string;
  /** 第二行說明，例如「人資部・分機 1234」 */
  description?: ReactNode;
  disabled?: boolean;
  /** 停用原因，顯示在選項右側，例如「已滿」「已報名」 */
  disabledReason?: string;
  /** 搜尋時額外比對的文字（例如分機、英文名） */
  keywords?: string[];
}

export interface SelectProps {
  options: SelectOption[];
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  /** 沒選時的提示，預設「請選擇」 */
  placeholder?: string;
  label?: ReactNode;
  /** 沒有可見 label 時的無障礙名稱（工具列篩選） */
  'aria-label'?: string;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  size?: InputSize;
  searchable?: boolean;
  /** 搜尋欄提示，預設「搜尋」 */
  searchPlaceholder?: string;
  /** 搜尋沒有結果時的文字，預設「找不到符合的項目。」 */
  emptyText?: string;
  clearable?: boolean;
  /** 清除鈕的 aria-label，預設「清除選擇」 */
  clearLabel?: string;
  /** 觸發元件顯示的文字，預設是選項名稱 */
  renderValue?: (option: SelectOption) => ReactNode;
  /** 自訂搜尋比對 */
  filter?: (option: SelectOption, query: string) => boolean;
  /** 選單寬度，預設與觸發元件同寬（窄欄位需要較寬選單時使用） */
  contentWidth?: number | string;
  /** 表單送出用的 hidden input 名稱 */
  name?: string;
  id?: string;
  /** 套在欄位外框上 */
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const defaultFilter = (option: SelectOption, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const text = [option.label, typeof option.description === 'string' ? option.description : '', ...(option.keywords ?? [])];
  return text.join(' ').toLowerCase().includes(q);
};

export function Select({
  options,
  value,
  defaultValue = null,
  onValueChange,
  placeholder = '請選擇',
  label,
  'aria-label': ariaLabel,
  description,
  error,
  required,
  disabled = false,
  size = 'md',
  searchable = false,
  searchPlaceholder = '搜尋',
  emptyText = '找不到符合的項目。',
  clearable = false,
  clearLabel = '清除選擇',
  renderValue,
  filter = defaultFilter,
  contentWidth,
  name,
  id,
  className,
  open: openProp,
  onOpenChange,
}: SelectProps) {
  const ids = useFieldIds(id);
  const uid = useId();
  const listId = `${uid}-listbox`;
  const [innerValue, setInnerValue] = useState<string | null>(defaultValue);
  const current = value !== undefined ? value : innerValue;
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const indexOf = useMemo(() => new Map(options.map((o, i) => [o.value, i])), [options]);
  const optionId = (v: string) => `${uid}-option-${indexOf.get(v) ?? 0}`;
  const visible = useMemo(() => (searchable && query ? options.filter((o) => filter(o, query)) : options), [options, filter, query, searchable]);
  const enabled = visible.filter((o) => !o.disabled);
  const selected = current == null ? undefined : options.find((o) => o.value === current);

  const setOpen = (next: boolean) => {
    if (next) {
      setQuery('');
      const cur = current == null ? undefined : options.find((o) => o.value === current && !o.disabled);
      setActive(cur?.value ?? options.find((o) => !o.disabled)?.value ?? null);
    }
    if (openProp === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };

  const choose = (next: string | null) => {
    if (value === undefined) setInnerValue(next);
    onValueChange?.(next);
  };

  // 移動到的選項要保持在清單可視範圍內（不用 scrollIntoView，避免定位前捲動整頁）
  useEffect(() => {
    const list = listRef.current;
    if (!open || !list || active == null) return;
    const el = list.querySelector<HTMLElement>(`[data-value="${CSS.escape(active)}"]`);
    if (!el) return;
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
    }
  }, [active, open]);

  const move = (step: 1 | -1 | 'first' | 'last') => {
    if (!enabled.length) return;
    const i = enabled.findIndex((o) => o.value === active);
    let next: number;
    if (step === 'first') next = 0;
    else if (step === 'last') next = enabled.length - 1;
    else if (i < 0) next = step === 1 ? 0 : enabled.length - 1;
    else next = Math.min(Math.max(i + step, 0), enabled.length - 1);
    setActive(enabled[next]?.value ?? null);
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.nativeEvent.isComposing) return;
    const inSearch = e.currentTarget === searchRef.current;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
      case 'End':
        if (inSearch) return;
        e.preventDefault();
        move(e.key === 'Home' ? 'first' : 'last');
        break;
      case 'Enter':
      case ' ':
        if (e.key === ' ' && inSearch) return;
        e.preventDefault();
        if (active != null && enabled.some((o) => o.value === active)) {
          choose(active);
          setOpen(false);
        }
        break;
      case 'Tab':
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  const display = selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder;
  const showClear = clearable && !disabled && selected != null;
  const aria = fieldAria(ids, { description, error });
  const activeId = open && active != null ? optionId(active) : undefined;

  return (
    <Field ids={ids} label={label} description={description} error={error} required={required} className={className}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <div className="relative min-w-0">
          <Popover.Trigger asChild>
            <button
              ref={triggerRef}
              id={ids.id}
              type="button"
              disabled={disabled}
              role="combobox"
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-autocomplete="none"
              aria-labelledby={label ? ids.labelId : undefined}
              aria-label={label ? undefined : ariaLabel}
              aria-required={required || undefined}
              {...aria}
              onKeyDown={(e) => {
                if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
                  e.preventDefault();
                  setOpen(true);
                }
              }}
              className={cn(
                controlClasses({ size, error: !!error, disabled }),
                size === 'md' ? 'h-9' : 'h-8',
                'relative flex items-center text-left',
                showClear ? 'pr-[60px]' : 'pr-9',
                !disabled && 'cursor-pointer',
              )}
            >
              <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted-foreground')}>
                {display}
              </span>
              <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2" />
            </button>
          </Popover.Trigger>
          {showClear ? (
            <button
              type="button"
              aria-label={clearLabel}
              onClick={() => {
                choose(null);
                triggerRef.current?.focus();
              }}
              className="absolute top-1/2 right-8 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:focus-ring [&_svg]:size-3"
            >
              <X aria-hidden />
            </button>
          ) : null}
        </div>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            collisionPadding={16}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              (searchable ? searchRef.current : listRef.current)?.focus({ preventScroll: true });
            }}
            style={contentWidth !== undefined ? { width: contentWidth } : undefined}
            className={cn(
              // z-60：浮層的層級順序；裁切靠 portal 解決
              'z-60 flex w-(--radix-popover-trigger-width) max-w-[calc(100dvw-32px)] flex-col p-2',
              'max-h-[min(360px,var(--radix-popover-content-available-height))]',
              overlaySurface,
            )}
          >
            {searchable ? (
              <div className="relative shrink-0 pb-2">
                <Search aria-hidden className="pointer-events-none absolute top-4 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchRef}
                  type="text"
                  role="combobox"
                  aria-expanded
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeId}
                  aria-label={searchPlaceholder}
                  placeholder={searchPlaceholder}
                  autoComplete="off"
                  value={query}
                  onChange={(e) => {
                    const q = e.target.value;
                    setQuery(q);
                    setActive(options.find((o) => !o.disabled && filter(o, q))?.value ?? null);
                  }}
                  onKeyDown={onListKeyDown}
                  className={cn(controlClasses({ size: 'sm' }), 'h-8 pl-9')}
                />
              </div>
            ) : null}
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-labelledby={label ? ids.labelId : undefined}
              aria-label={label ? undefined : ariaLabel}
              aria-activedescendant={searchable ? undefined : activeId}
              onKeyDown={searchable ? undefined : onListKeyDown}
              className="relative min-h-0 flex-1 overflow-y-auto outline-none scrollbar-inset focus-visible:shadow-none"
            >
              {visible.length === 0 ? (
                <div className="px-2 py-3 type-sm-regular text-muted-foreground">{emptyText}</div>
              ) : (
                visible.map((o) => {
                  const isSelected = o.value === current;
                  const isActive = o.value === active;
                  return (
                    <div
                      key={o.value}
                      id={optionId(o.value)}
                      data-value={o.value}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={o.disabled || undefined}
                      onPointerMove={() => {
                        if (!o.disabled && !isActive) setActive(o.value);
                      }}
                      onClick={() => {
                        if (o.disabled) return;
                        choose(o.value);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-left type-sm-regular select-none',
                        o.disabled
                          ? 'cursor-not-allowed text-muted-foreground'
                          : [
                              'cursor-pointer',
                              isSelected
                                ? isActive
                                  ? 'bg-primary-hover text-primary-foreground'
                                  : 'bg-primary text-primary-foreground'
                                : isActive && 'bg-hover',
                            ],
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="[overflow-wrap:anywhere]">{o.label}</span>
                        {o.description ? (
                          <span
                            className={cn(
                              'type-xs-regular [overflow-wrap:anywhere]',
                              isSelected && !o.disabled ? 'text-primary-foreground' : 'text-muted-foreground',
                            )}
                          >
                            {o.description}
                          </span>
                        ) : null}
                      </span>
                      {o.disabled && o.disabledReason ? <span className="shrink-0 type-xs-regular">{o.disabledReason}</span> : null}
                      {isSelected ? <Check aria-hidden className="size-4 shrink-0" /> : null}
                    </div>
                  );
                })
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {name ? <input type="hidden" name={name} value={current ?? ''} /> : null}
    </Field>
  );
}
