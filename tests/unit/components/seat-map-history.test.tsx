// 座位圖工具列的「復原」「重做」（元件層級，D-028）：docs/spec/seating.md 2.1.3（Icon Button、在「縮小」前面，人員面板收合時在
// 「顯示人員面板」後面；沒有步驟時停用；Tooltip「復原：{那一步的提示}」「重做：{那一步的提示}」，停用時「復原」「重做」；只有編輯者看得到）、
// 2.1.11（手機也有）、4.1 文案；SEAT-R77、SEAT-R90、SEAT-R99；SEAT-AC129、SEAT-AC138。
//
// 介面（src/components/features/seating/seat-map.tsx）：SeatMap 多了
//   onUndo?: () => void; onRedo?: () => void;        // 沒傳時不顯示這兩個按鈕（檢視者、發布頁）
//   undoLabel: string | null; redoLabel: string | null;  // 那一步的 Sonner 文字；null 時停用
// 無障礙名稱正好是「復原」「重做」，那一步的提示只放在 Tooltip。
// Tooltip 在這裡用鍵盤聚焦（Tab）打開：停用的按鈕也要聚焦得到提示（滑鼠滑過的情況在 tests/e2e/seating-undo-redo.spec.ts）。
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SeatMap, type SeatMapProps } from '@/components/features/seating/seat-map';
import { installDomPolyfills } from '../../helpers/seating-dom';

beforeAll(() => {
  installDomPolyfills();
});

const SEAT_WANG = '已把 王小明 安排到 B4 桌。';
const UNSEAT_LEE = '已把 李大華 移出 B2 桌。';

function renderMap(props: Partial<SeatMapProps> = {}) {
  const base: SeatMapProps = {
    tables: new Map(),
    expanded: false,
    manualPct: null,
    onManualPct: () => {},
    covered: false,
    selected: null,
    hit: null,
    onOpen: () => {},
    draggable: false,
    mobile: false,
    undoLabel: null,
    redoLabel: null,
  };
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  const view = render(<SeatMap {...base} {...props} />);
  return { user, rerender: (next: Partial<SeatMapProps>) => view.rerender(<SeatMap {...base} {...props} {...next} />) };
}

const undoButton = () => screen.getByRole('button', { name: '復原' });
const redoButton = () => screen.getByRole('button', { name: '重做' });
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;
const precedes = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/** 目前打開的 Tooltip 文字正好是 text */
async function expectTooltip(text: string) {
  await waitFor(() => expect(screen.getByRole('tooltip').textContent?.trim()).toBe(text));
}

describe('沒有傳 onUndo、onRedo（檢視者、發布頁，SEAT-R90）', () => {
  it('不顯示「復原」「重做」（隱藏，不是停用）；縮小、放大、適合視窗照常', () => {
    renderMap();
    expect(screen.queryAllByRole('button', { name: '復原', hidden: true })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: '重做', hidden: true })).toHaveLength(0);
    for (const name of ['縮小', '放大', '適合視窗']) expect(screen.getByRole('button', { name }), name).toBeTruthy();
  });
});

describe('編輯者：按鈕與位置（2.1.3、SEAT-AC129）', () => {
  it('沒有步驟（undoLabel、redoLabel 都是 null）：兩個按鈕都在、都停用；無障礙名稱正好是「復原」「重做」', () => {
    renderMap({ onUndo: vi.fn(), onRedo: vi.fn() });
    expect(isDisabled(undoButton())).toBe(true);
    expect(isDisabled(redoButton())).toBe(true);
  });

  it('依序是「復原」「重做」「縮小」「放大」「適合視窗」「全部展開」「自動排座」', () => {
    renderMap({ onUndo: vi.fn(), onRedo: vi.fn(), onToggleExpanded: vi.fn(), onAutoArrange: vi.fn() });
    const names = ['復原', '重做', '縮小', '放大', '適合視窗', '全部展開', '自動排座'];
    const buttons = names.map((name) => screen.getByRole('button', { name }));
    for (let i = 1; i < buttons.length; i++) {
      expect(precedes(buttons[i - 1]!, buttons[i]!), `「${names[i - 1]}」在「${names[i]}」前面`).toBe(true);
    }
  });

  it('人員面板收合時：「顯示人員面板」在「復原」前面，「重做」在「縮小」前面', () => {
    renderMap({ onUndo: vi.fn(), onRedo: vi.fn(), onShowPanel: vi.fn() });
    const panel = screen.getByRole('button', { name: '顯示人員面板' });
    expect(precedes(panel, undoButton())).toBe(true);
    expect(precedes(undoButton(), redoButton())).toBe(true);
    expect(precedes(redoButton(), screen.getByRole('button', { name: '縮小' }))).toBe(true);
  });

  it('手機（767 px 以下）也有「復原」「重做」（2.1.11）', () => {
    renderMap({ onUndo: vi.fn(), onRedo: vi.fn(), mobile: true, undoLabel: SEAT_WANG });
    expect(isDisabled(undoButton())).toBe(false);
    expect(isDisabled(redoButton())).toBe(true);
  });

  it('無障礙名稱不含那一步的提示：有步驟時名稱仍正好是「復原」「重做」', () => {
    renderMap({ onUndo: vi.fn(), onRedo: vi.fn(), undoLabel: SEAT_WANG, redoLabel: UNSEAT_LEE });
    // ByRole 的字串名稱是完全相符
    expect(undoButton()).toBeTruthy();
    expect(redoButton()).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /已把/ })).toHaveLength(0);
  });
});

describe('編輯者：停用與按下（SEAT-R77、SEAT-R99）', () => {
  it('有可以復原的步驟：「復原」可以按，按一下呼叫 onUndo 一次；沒有可以重做的步驟：「重做」停用，按了不呼叫 onRedo', async () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const { user } = renderMap({ onUndo, onRedo, undoLabel: SEAT_WANG });
    expect(isDisabled(undoButton())).toBe(false);
    expect(isDisabled(redoButton())).toBe(true);

    await user.click(undoButton());
    expect(onUndo).toHaveBeenCalledTimes(1);
    await user.click(redoButton());
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('有可以重做的步驟、沒有可以復原的步驟：「重做」可以按，呼叫 onRedo；「復原」停用，按了不呼叫 onUndo', async () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const { user } = renderMap({ onUndo, onRedo, redoLabel: UNSEAT_LEE });
    expect(isDisabled(undoButton())).toBe(true);
    expect(isDisabled(redoButton())).toBe(false);

    await user.click(redoButton());
    expect(onRedo).toHaveBeenCalledTimes(1);
    await user.click(undoButton());
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('label 從 null 變成有值：按鈕從停用變成可以按（儲存完成、記進紀錄後）', () => {
    const { rerender } = renderMap({ onUndo: vi.fn(), onRedo: vi.fn() });
    expect(isDisabled(undoButton())).toBe(true);
    rerender({ undoLabel: SEAT_WANG });
    expect(isDisabled(undoButton())).toBe(false);
    rerender({ undoLabel: null, redoLabel: SEAT_WANG });
    expect(isDisabled(undoButton())).toBe(true);
    expect(isDisabled(redoButton())).toBe(false);
  });
});

describe('Tooltip（2.1.3、4.1、SEAT-AC129）', () => {
  it('停用時：聚焦「復原」的 Tooltip 是「復原」，聚焦「重做」的是「重做」', async () => {
    const { user } = renderMap({ onUndo: vi.fn(), onRedo: vi.fn() });
    await user.tab();
    await expectTooltip('復原');
    await user.tab();
    await expectTooltip('重做');
  });

  it('有步驟時：「復原：{那一步的提示}」「重做：{那一步的提示}」', async () => {
    const { user } = renderMap({ onUndo: vi.fn(), onRedo: vi.fn(), undoLabel: SEAT_WANG, redoLabel: UNSEAT_LEE });
    await user.tab();
    expect(document.activeElement).toBe(undoButton());
    await expectTooltip(`復原：${SEAT_WANG}`);
    await user.tab();
    expect(document.activeElement).toBe(redoButton());
    await expectTooltip(`重做：${UNSEAT_LEE}`);
  });

  it('只有「復原」有步驟：「復原：{提示}」，「重做」仍是「重做」', async () => {
    const { user } = renderMap({ onUndo: vi.fn(), onRedo: vi.fn(), undoLabel: SEAT_WANG });
    await user.tab();
    await expectTooltip(`復原：${SEAT_WANG}`);
    await user.tab();
    await expectTooltip('重做');
  });

  it('聚焦著「復原」時那一步換了（例如又做了一步）：Tooltip 換成新的提示', async () => {
    const { rerender } = renderMap({ onUndo: vi.fn(), onRedo: vi.fn(), undoLabel: SEAT_WANG });
    act(() => undoButton().focus());
    await expectTooltip(`復原：${SEAT_WANG}`);
    rerender({ undoLabel: UNSEAT_LEE });
    await expectTooltip(`復原：${UNSEAT_LEE}`);
  });
});
