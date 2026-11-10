// Header 的儲存狀態文案：docs/spec/README.md 第 14 節「儲存狀態」、COM-R02、COM-R04。
// {時:分} 依原型（ui-design-system/source-reference/html/prototype/core.js）為 24 小時制、補零的「HH:mm」。
import { describe, expect, it } from 'vitest';
import { saveStatusText } from '@/client/save-time';

const at = (h: number, m: number) => new Date(2026, 10, 10, h, m);

describe('saveStatusText', () => {
  it('儲存中顯示「儲存中…」', () => {
    expect(saveStatusText({ state: 'saving', savedAt: null })).toBe('儲存中…');
    expect(saveStatusText({ state: 'saving', savedAt: at(9, 5) })).toBe('儲存中…');
  });

  it('儲存失敗顯示「儲存失敗，請檢查網路後再試一次。」，即使之前存過', () => {
    expect(saveStatusText({ state: 'failed', savedAt: null })).toBe('儲存失敗，請檢查網路後再試一次。');
    expect(saveStatusText({ state: 'failed', savedAt: at(9, 5) })).toBe('儲存失敗，請檢查網路後再試一次。');
  });

  it('完成後顯示「已儲存 {時:分}」', () => {
    expect(saveStatusText({ state: 'idle', savedAt: at(9, 5) })).toBe('已儲存 09:05');
  });

  it('用 24 小時制', () => {
    expect(saveStatusText({ state: 'idle', savedAt: at(14, 30) })).toBe('已儲存 14:30');
    expect(saveStatusText({ state: 'idle', savedAt: at(0, 0) })).toBe('已儲存 00:00');
    expect(saveStatusText({ state: 'idle', savedAt: at(23, 59) })).toBe('已儲存 23:59');
  });
});
