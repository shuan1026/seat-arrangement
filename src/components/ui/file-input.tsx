'use client';

// 檔案欄位（03-components.md Input：type `file`；原型 prototype.css 的 .file-control）。
// --background 底的輸入外框，左邊是檔名、右邊是內建的「選擇檔案」按鈕；不用瀏覽器預設的檔案欄位樣式。
// 兩種匯入對話框共用（docs/spec/employees.md、participants.md）。
import { useRef } from 'react';
import { Button } from './button';
import { cn } from './cn';
import { Field, fieldAria, useFieldIds } from './input';

export interface FileInputProps {
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** 例如 ".csv" */
  accept?: string;
  /** 目前選的檔案；沒有時顯示 placeholder */
  file: File | null;
  onFileChange: (file: File | null) => void;
  placeholder?: string;
  buttonLabel?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function FileInput({
  label,
  description,
  error,
  required,
  accept,
  file,
  onFileChange,
  placeholder = '尚未選擇檔案',
  buttonLabel = '選擇檔案',
  disabled,
  id,
  className,
}: FileInputProps) {
  const ids = useFieldIds(id);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Field ids={ids} label={label} description={description} error={error} required={required} className={className}>
      <div
        className={cn(
          'flex min-h-9 min-w-0 items-center gap-2 rounded-md border bg-background py-1 pr-1 pl-3',
          error ? 'border-destructive' : 'border-border',
          disabled && 'cursor-not-allowed bg-muted',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate type-sm-regular', file ? 'text-foreground' : 'text-muted-foreground')}>
          {file ? file.name : placeholder}
        </span>
        <input
          ref={inputRef}
          id={ids.id}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          {...fieldAria(ids, { description, error })}
          onChange={(e) => {
            onFileChange(e.target.files?.[0] ?? null);
            // 同一個檔案再選一次也要觸發 onChange
            e.target.value = '';
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
          {buttonLabel}
        </Button>
      </div>
    </Field>
  );
}
