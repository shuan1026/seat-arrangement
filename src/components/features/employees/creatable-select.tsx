'use client';

// 可輸入新值的 Dropdown Menu `select`：新增、編輯員工對話框的部門、組別、地區（docs/spec/employees.md 2.5、EMP-R34～R36、EMP-Q10）。
// 共用的 src/components/ui/select.tsx 沒有「新增○○「{輸入文字}」」選項，所以在這裡自建；形狀照
// 03-components.md Dropdown Menu「Select Menu」「Shared Overlay Surface」，外觀與鍵盤操作沿用共用 Select：
// - 觸發元件 36px、右側 16px chevron；選單與觸發元件同寬，透過 portal 畫在 body 底下，不靠 z-index 逃出裁切。
// - 頂端是搜尋欄；比對選項名稱，不分大小寫。輸入的文字和既有選項都不同時，清單最後出現「新增○○「{輸入文字}」」（原型 UI.select allowNew）。
// - 選項列 36px、文字靠左、勾號靠右；選中用 --primary 底；新增選項用 --primary 字與 Text-sm/Medium（原型 .option--new）。
// - 滑鼠在按下時就開關選單（同 Radix Select）；觸控與鍵盤在 click 時開關。
// - 鍵盤：方向鍵移動、Enter 選取、Esc 關閉、Tab 關閉；中文輸入法組字時不攔截按鍵。
// - 離開欄位時驗證（docs/spec/README.md 第 9 節）：觸發元件在選單關閉時失去焦點才呼叫 onBlur，打開選單不算離開。
import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Popover } from 'radix-ui';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { overlaySurface } from '@/components/ui/dropdown-menu';
import { controlClasses, Field, fieldAria, useFieldIds } from '@/components/ui/input';

export interface CreatableSelectProps {
  label: ReactNode;
  /** 既有的選項（員工名單產生的部門、組別或地區） */
  options: readonly string[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder: string;
  searchPlaceholder: string;
  /** 找不到時的新增選項文字，例如 (q) => `新增部門「${q}」` */
  createLabel: (query: string) => string;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** 離開欄位（選單關閉時觸發元件失去焦點） */
  onBlur?: () => void;
}

export interface CreatableSelectHandle {
  focus: () => void;
}

const CREATE = '\u0000create';

type Item = { value: string; label: string; create?: boolean };

export const CreatableSelect = forwardRef<CreatableSelectHandle, CreatableSelectProps>(function CreatableSelect(
  {
    label,
    options,
    value,
    onValueChange,
    placeholder,
    searchPlaceholder,
    createLabel,
    description,
    error,
    required,
    onBlur,
  },
  ref,
) {
  const ids = useFieldIds();
  const uid = useId();
  const listId = `${uid}-listbox`;
  const [open, setOpenState] = useState(false);
  const openRef = useRef(false);
  const pointerOpenedRef = useRef(false);
  const pointerOutsideRef = useRef(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({ focus: () => triggerRef.current?.focus() }), []);

  const typed = query.trim();
  const items = useMemo<Item[]>(() => {
    const k = typed.toLowerCase();
    const list: Item[] = options.filter((o) => !k || o.toLowerCase().includes(k)).map((o) => ({ value: o, label: o }));
    if (typed && !options.includes(typed)) list.push({ value: CREATE, label: createLabel(typed), create: true });
    return list;
  }, [options, typed, createLabel]);
  const indexOf = useMemo(() => new Map(items.map((o, i) => [o.value, i])), [items]);
  const optionId = (v: string) => `${uid}-option-${indexOf.get(v) ?? 0}`;

  const setOpen = (next: boolean) => {
    if (next) {
      setQuery('');
      setActive(value != null && options.includes(value) ? value : (options[0] ?? null));
    }
    openRef.current = next;
    setOpenState(next);
  };

  const choose = (item: Item) => {
    onValueChange(item.create ? typed : item.value);
    setOpen(false);
  };

  // 移動到的選項要保持在清單可視範圍內（不用 scrollIntoView，避免定位前捲動整頁）
  useEffect(() => {
    const list = listRef.current;
    if (!open || !list || active == null) return;
    const el = list.querySelector<HTMLElement>(`[data-index="${indexOf.get(active) ?? -1}"]`);
    if (!el) return;
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
    }
  }, [active, open, indexOf]);

  const move = (step: 1 | -1) => {
    if (!items.length) return;
    const i = items.findIndex((o) => o.value === active);
    const next = i < 0 ? (step === 1 ? 0 : items.length - 1) : Math.min(Math.max(i + step, 0), items.length - 1);
    setActive(items[next]?.value ?? null);
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Enter': {
        e.preventDefault();
        const item = items.find((o) => o.value === active);
        if (item) choose(item);
        break;
      }
      case 'Tab':
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  const activeId = open && active != null && indexOf.has(active) ? optionId(active) : undefined;

  return (
    <Field ids={ids} label={label} description={description} error={error} required={required}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Anchor asChild>
          <button
            ref={triggerRef}
            id={ids.id}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="none"
            aria-labelledby={ids.labelId}
            aria-required={required || undefined}
            {...fieldAria(ids, { description, error })}
            onPointerDown={(e) => {
              // 滑鼠在按下時就開關選單、不先把焦點移到觸發元件（同 Radix Select）：
              // 前一個欄位離開時顯示的錯誤會把版面往下推，等到放開滑鼠才開，點擊會落空
              if (e.button !== 0 || e.ctrlKey || e.pointerType !== 'mouse') return;
              e.preventDefault();
              pointerOpenedRef.current = true;
              setOpen(!openRef.current);
            }}
            onClick={() => {
              // 觸控與鍵盤（Enter、空白鍵）在 click 時開關；滑鼠已在按下時處理
              if (pointerOpenedRef.current) {
                pointerOpenedRef.current = false;
                return;
              }
              setOpen(!openRef.current);
            }}
            onKeyDown={(e) => {
              if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
                e.preventDefault();
                setOpen(true);
              }
            }}
            onBlur={(e) => {
              // 打開選單時焦點移到搜尋欄，不算離開欄位
              if (openRef.current) return;
              if (e.relatedTarget instanceof Node && listRef.current?.parentElement?.contains(e.relatedTarget)) return;
              onBlur?.();
            }}
            className={cn(
              controlClasses({ size: 'md', error: !!error }),
              'relative flex h-9 cursor-pointer items-center pr-9 text-left',
            )}
          >
            <span className={cn('min-w-0 flex-1 truncate', value == null && 'text-muted-foreground')}>
              {value ?? placeholder}
            </span>
            <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2" />
          </button>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            collisionPadding={16}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              searchRef.current?.focus({ preventScroll: true });
            }}
            // 按觸發元件由觸發元件自己開關，不算點在選單外
            onInteractOutside={(e) => {
              if (e.target instanceof Node && triggerRef.current?.contains(e.target)) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              if (!(e.target instanceof Node && triggerRef.current?.contains(e.target)))
                pointerOutsideRef.current = true;
            }}
            // 關閉後焦點回到觸發元件；點在選單外關閉時焦點留在點到的地方
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              if (!pointerOutsideRef.current) triggerRef.current?.focus({ preventScroll: true });
              pointerOutsideRef.current = false;
            }}
            className={cn(
              // z-60：浮層的層級順序；裁切靠 portal 解決
              'z-60 flex w-(--radix-popover-trigger-width) max-w-[calc(100dvw-32px)] flex-col p-2',
              'max-h-[min(360px,var(--radix-popover-content-available-height))]',
              overlaySurface,
            )}
          >
            <div className="relative shrink-0 pb-2">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-4 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
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
                  const k = q.trim().toLowerCase();
                  const first = options.find((o) => !k || o.toLowerCase().includes(k));
                  setActive(first ?? (q.trim() ? CREATE : null));
                }}
                onKeyDown={onSearchKeyDown}
                className={cn(controlClasses({ size: 'sm' }), 'h-8 pl-9')}
              />
            </div>
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-labelledby={ids.labelId}
              className="relative min-h-0 flex-1 overflow-y-auto outline-none scrollbar-inset focus-visible:shadow-none"
            >
              {items.map((o, i) => {
                const isSelected = !o.create && o.value === value;
                const isActive = o.value === active;
                return (
                  <div
                    key={o.value}
                    id={optionId(o.value)}
                    data-index={i}
                    role="option"
                    aria-selected={isSelected}
                    onPointerMove={() => {
                      if (!isActive) setActive(o.value);
                    }}
                    onClick={() => choose(o)}
                    className={cn(
                      'flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left select-none',
                      o.create ? 'type-sm-medium text-primary' : 'type-sm-regular',
                      isSelected
                        ? isActive
                          ? 'bg-primary-hover text-primary-foreground'
                          : 'bg-primary text-primary-foreground'
                        : isActive && 'bg-hover',
                    )}
                  >
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{o.label}</span>
                    {isSelected ? <Check aria-hidden className="size-4 shrink-0" /> : null}
                  </div>
                );
              })}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </Field>
  );
});
