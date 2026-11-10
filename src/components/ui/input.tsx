// Input（03-components.md Input：Sizes、Base Anatomy、Layouts `vertical`、Colors、States、Implementation Notes）。
// 版面 vertical：label 在上、控制項、說明、錯誤訊息，間距 8px。錯誤時 label 與錯誤文字用 --destructive-text、
// 邊框用 --destructive，不只靠邊框顏色表示錯誤。說明與錯誤用 aria-describedby 關聯，錯誤另設 aria-invalid。
// Textarea 沿用 Input 的底色、邊框與圓角（docs/spec/README.md 第 11.3 節）；SearchInput 是 Input sm 加 search 圖示。
import { useId, type ComponentProps, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn } from './cn';

export type InputSize = 'md' | 'sm';

export interface FieldIds {
  id: string;
  labelId: string;
  descriptionId: string;
  errorId: string;
}

/** 欄位需要的 id；有傳 id 時沿用 */
export function useFieldIds(id?: string): FieldIds {
  const auto = useId();
  const base = id ?? auto;
  return { id: base, labelId: `${base}-label`, descriptionId: `${base}-description`, errorId: `${base}-error` };
}

/** 控制項的 aria-describedby／aria-invalid */
export function fieldAria(ids: FieldIds, { description, error }: { description?: ReactNode; error?: ReactNode }) {
  const describedBy = [description ? ids.descriptionId : null, error ? ids.errorId : null].filter(Boolean).join(' ');
  return {
    'aria-describedby': describedBy || undefined,
    'aria-invalid': error ? (true as const) : undefined,
  };
}

export interface FieldProps {
  ids: FieldIds;
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** label 用 <label htmlFor>；觸發元件不是表單控制項時可改成 false，改用 aria-labelledby */
  htmlFor?: boolean;
  className?: string;
  children: ReactNode;
}

/** 欄位外框：label、控制項、說明、錯誤（Input Layouts `vertical`）。Select 等自訂控制項共用 */
export function Field({ ids, label, description, error, required, htmlFor = true, className, children }: FieldProps) {
  const labelClass = cn('type-sm-medium', error ? 'text-destructive-text' : 'text-foreground');
  return (
    <div className={cn('flex min-w-0 max-w-full flex-col gap-2', className)}>
      {label ? (
        htmlFor ? (
          <label id={ids.labelId} htmlFor={ids.id} className={labelClass}>
            {label}
            {required ? <RequiredMark /> : null}
          </label>
        ) : (
          <span id={ids.labelId} className={labelClass}>
            {label}
            {required ? <RequiredMark /> : null}
          </span>
        )
      ) : null}
      {children}
      {description ? (
        <p id={ids.descriptionId} className="type-xs-regular text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={ids.errorId} className="type-xs-regular text-destructive-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RequiredMark() {
  return (
    <span aria-hidden className="ml-0.5">
      *
    </span>
  );
}

/** 文字欄位的外觀；Select 觸發元件沿用同一組邊框與狀態 */
export function controlClasses({ size = 'md', error, disabled }: { size?: InputSize; error?: boolean; disabled?: boolean }) {
  return cn(
    'w-full min-w-0 max-w-full border bg-background text-card-foreground outline-none',
    'transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground',
    size === 'md' ? 'rounded-md px-3 type-sm-regular' : 'rounded-sm px-2.5 type-sm-regular',
    error ? 'border-destructive' : 'border-border focus:border-foreground focus-visible:border-foreground',
    'focus:focus-ring focus-visible:focus-ring',
    disabled
      ? 'cursor-not-allowed bg-muted text-muted-foreground'
      : !error && 'hover:not-focus:not-focus-visible:border-border-hover',
  );
}

const HEIGHT: Record<InputSize, string> = { md: 'h-9', sm: 'h-8' };

interface FieldTextProps {
  /** 可見的欄位名稱；沒有時要另給 aria-label */
  label?: ReactNode;
  /** 欄位說明，顯示在控制項下方 */
  description?: ReactNode;
  /** 錯誤訊息；有值時欄位顯示錯誤狀態 */
  error?: ReactNode;
  size?: InputSize;
  /** 套在欄位外框上 */
  className?: string;
  /** 套在控制項上 */
  inputClassName?: string;
}

export interface InputProps extends Omit<ComponentProps<'input'>, 'size'>, FieldTextProps {}

export function Input({ label, description, error, size = 'md', className, inputClassName, id, required, disabled, ...props }: InputProps) {
  const ids = useFieldIds(id);
  return (
    <Field ids={ids} label={label} description={description} error={error} required={required} className={className}>
      <input
        id={ids.id}
        required={required}
        disabled={disabled}
        className={cn(controlClasses({ size, error: !!error, disabled }), HEIGHT[size], inputClassName)}
        {...fieldAria(ids, { description, error })}
        {...props}
      />
    </Field>
  );
}

export interface TextareaProps extends ComponentProps<'textarea'>, Omit<FieldTextProps, 'size'> {}

export function Textarea({ label, description, error, className, inputClassName, id, required, disabled, rows = 3, ...props }: TextareaProps) {
  const ids = useFieldIds(id);
  return (
    <Field ids={ids} label={label} description={description} error={error} required={required} className={className}>
      <textarea
        id={ids.id}
        rows={rows}
        required={required}
        disabled={disabled}
        className={cn(controlClasses({ size: 'md', error: !!error, disabled }), 'block min-h-[72px] resize-y py-2', inputClassName)}
        {...fieldAria(ids, { description, error })}
        {...props}
      />
    </Field>
  );
}

export interface SearchInputProps extends Omit<InputProps, 'type' | 'label' | 'aria-label'> {
  /** 搜尋欄沒有可見標籤，這段文字當 aria-label（不要只靠 placeholder） */
  label: string;
}

export function SearchInput({ label, size = 'sm', className, inputClassName, id, disabled, description, error, ...props }: SearchInputProps) {
  const ids = useFieldIds(id);
  return (
    <Field ids={ids} description={description} error={error} className={className}>
      <div className="relative min-w-0">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={ids.id}
          type="search"
          aria-label={label}
          autoComplete="off"
          disabled={disabled}
          className={cn(
            controlClasses({ size, error: !!error, disabled }),
            HEIGHT[size],
            'pl-9 [&::-webkit-search-cancel-button]:hidden',
            inputClassName,
          )}
          {...fieldAria(ids, { description, error })}
          {...props}
        />
      </div>
    </Field>
  );
}
