// 儲存狀態文案（docs/spec/README.md 第 14 節）
import type { SaveStatus } from './save-queue';

const pad = (n: number) => String(n).padStart(2, '0');

export function saveStatusText(status: SaveStatus): string {
  if (status.state === 'saving') return '儲存中…';
  if (status.state === 'failed') return '儲存失敗，請檢查網路後再試一次。';
  if (!status.savedAt) return '已儲存';
  return `已儲存 ${pad(status.savedAt.getHours())}:${pad(status.savedAt.getMinutes())}`;
}
