// 自動排座套用後的 Sonner 文字：docs/spec/auto-arrange.md ARR-R14、第 4 節文案、ARR-Q02、ARR-Q03（目前假設），
// 驗收條件 ARR-AC02、AC08、AC13、AC15、AC19 的 Sonner；D-019（桌號改為 A1～B15 後，提示改寫成桌數）。
// - 全部排進去：「已把 {n} 位安排到 {k} 桌。」
// - 有人排不下：「已把 {n} 位安排到 {k} 桌，還有 {m} 位排不下，留在未入座。」
// - {n} 是 summary.placed，{k} 是這一次有排進人的桌數（summary.tableIds 的個數，不是桌號範圍），{m} 是 summary.left。
// - 只排進一桌：寫「1 桌」（ARR-Q03）；一位都沒排進去：「沒有可以排的員工與眷屬。」（ARR-Q02，畫面用警告樣式、不帶「復原」）。
//
// 假設的介面（src/domain/auto-arrange.ts，目前文字寫在 use-seating-ops.ts 裡，抽成純函式）：
//   export function autoArrangeMessage(summary: AutoArrangeSummary): string;
import { describe, expect, it } from 'vitest';
import type { AutoArrangeSummary } from '@/contracts/seating';
import { autoArrangeMessage } from '@/domain/auto-arrange';

const summary = (placed: number, tableIds: number[], left: number): AutoArrangeSummary => ({ placed, tableIds, left });

describe('全部排進去：「已把 {n} 位安排到 {k} 桌。」（ARR-R14）', () => {
  it.each<[string, AutoArrangeSummary, string]>([
    // ARR-AC02：B1、A1 兩桌（內部編號 1、2）
    ['ARR-AC02', summary(14, [1, 2], 0), '已把 14 位安排到 2 桌。'],
    // ARR-AC08：A1、B7 桌（內部編號 2、4），中間的 B4 桌（3）坐滿沒有排進人，不算
    ['ARR-AC08', summary(3, [2, 4], 0), '已把 3 位安排到 2 桌。'],
    // ARR-AC09：A1、B7 桌
    ['ARR-AC09', summary(11, [2, 4], 0), '已把 11 位安排到 2 桌。'],
    // ARR-AC19、AC20：B4 到 A4 之間沒有備註名稱的 22 桌
    [
      'ARR-AC19',
      summary(211, [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 18, 19, 20, 21, 23, 24, 25, 26, 27], 0),
      '已把 211 位安排到 22 桌。',
    ],
  ])('%s', (_ac, s, text) => {
    expect(autoArrangeMessage(s)).toBe(text);
  });

  it('{k} 是有排進人的桌數，不是桌號範圍：內部編號 3、5、9 三桌 →「3 桌」（不是 7 桌）', () => {
    expect(autoArrangeMessage(summary(25, [3, 5, 9], 0))).toBe('已把 25 位安排到 3 桌。');
  });

  it('只排進一桌：「已把 7 位安排到 1 桌。」（ARR-AC15、ARR-Q03）', () => {
    expect(autoArrangeMessage(summary(7, [1], 0))).toBe('已把 7 位安排到 1 桌。');
  });

  it('30 桌都有排進人：「已把 300 位安排到 30 桌。」', () => {
    expect(autoArrangeMessage(summary(300, Array.from({ length: 30 }, (_, i) => i + 1), 0))).toBe('已把 300 位安排到 30 桌。');
  });
});

describe('有人排不下：「已把 {n} 位安排到 {k} 桌，還有 {m} 位排不下，留在未入座。」（ARR-R14、ARR-R11）', () => {
  it('ARR-AC13：A10、A13 兩桌（內部編號 29、30），排不下 4 位', () => {
    expect(autoArrangeMessage(summary(3, [29, 30], 4))).toBe('已把 3 位安排到 2 桌，還有 4 位排不下，留在未入座。');
  });

  it('只排進一桌也寫「1 桌」（ARR-Q03）', () => {
    expect(autoArrangeMessage(summary(10, [1], 4))).toBe('已把 10 位安排到 1 桌，還有 4 位排不下，留在未入座。');
  });
});

describe('一位都沒排進去（ARR-Q02 的目前假設、ARR-AC14）', () => {
  it.each<[string, AutoArrangeSummary]>([
    ['30 桌都坐滿', summary(0, [], 1)],
    ['沒有任何候選人', summary(0, [], 0)],
  ])('%s：「沒有可以排的員工與眷屬。」', (_case, s) => {
    expect(autoArrangeMessage(s)).toBe('沒有可以排的員工與眷屬。');
  });
});

describe('文字不寫桌號，也不用「第 n 桌」（D-019：代碼範圍沒有意義，改寫桌數）', () => {
  it.each<AutoArrangeSummary>([
    summary(14, [1, 2], 0),
    summary(3, [29, 30], 4),
    summary(7, [1], 0),
  ])('%o', (s) => {
    const text = autoArrangeMessage(s);
    expect(text).not.toMatch(/第\s*\d+/);
    expect(text).not.toMatch(/[AB]\d{1,2}/);
    expect(text).not.toContain('–');
  });
});
