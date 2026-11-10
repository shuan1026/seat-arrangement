// 載入中的旋轉圖示，顏色跟隨文字色（03-components.md Button States `loading`、Sonner `loading`）。
import { LoaderCircle } from 'lucide-react';
import { cn } from './cn';

const SIZE = { 12: 'size-3', 16: 'size-4', 20: 'size-5', 24: 'size-6' } as const;

export interface SpinnerProps {
  /** 圖示尺寸（px），預設 16 */
  size?: keyof typeof SIZE;
  /** 有填時以 role="status" 讀出；沒填時只是裝飾（例如放在已有 aria-busy 的按鈕裡） */
  label?: string;
  className?: string;
}

export function Spinner({ size = 16, label, className }: SpinnerProps) {
  const icon = <LoaderCircle aria-hidden className={cn('shrink-0 animate-spin', SIZE[size], className)} />;
  if (!label) return icon;
  return (
    <span role="status" className="inline-flex items-center">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}
