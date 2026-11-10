// Header 的介面配色鈕：docs/spec/README.md COM-R17（Icon Button、palette 圖示、無障礙名稱「介面配色」；Dropdown Menu 最上面是標題「介面配色」，
// 下面是「淺色」「深色」兩個單選項目，目前的配色打勾；選了立即套用、選單關閉、焦點回到按鈕、Sonner「已切換為淺色。」「已切換為深色。」；
// 選了目前的配色時只關閉選單，不顯示 Sonner）、
// 第 14 節「介面配色」文案、COM-R18（記在這個瀏覽器，不存資料庫）、COM-AC16；設計系統 03-components.md「Palette Switch」
// （單選項目是 menuitemradio，Sonner 用 info）；決策 D-020。
// Tooltip、色塊的實際樣子、選單位置與 Header 裡的位置在 tests/e2e/theme-switch.spec.ts；這裡只測元件本身。Sonner 用真的 Toaster 顯示。
//
// 假設的介面（src/components/shell/theme-switch.tsx）：
//   export function ThemeSwitch(): JSX.Element
//   - 不需要 props，也不需要放在 AppProvider 裡；掛上時從 <html data-theme>（或 src/client/theme.ts 的 readTheme()）得知目前的配色。
//   - 選了配色用 src/client/theme.ts 的 setTheme 寫入並套用，Sonner 用 src/components/ui/toaster.tsx 的 notify(…, { type: 'info' })。
//   - 選單用 src/components/ui/dropdown-menu.tsx 的 Radix Dropdown Menu，兩個項目用 RadioGroup／RadioItem（role menuitemradio、aria-checked）。
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { readTheme, THEME_STORAGE_KEY } from '@/client/theme';
import { ThemeSwitch } from '@/components/shell/theme-switch';
import { Toaster } from '@/components/ui/toaster';

const LABEL = '介面配色';
const SWITCHED = { light: '已切換為淺色。', dark: '已切換為深色。' } as const;
/** lucide 的 palette 圖示特有的 path（COM-R17：palette 圖示） */
const PALETTE_PATH = 'M12 22a1 1 0 0 1 0-20';

// jsdom 沒有的瀏覽器 API（Radix 的 Popper 與 Sonner 會用到）
beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const w = window as unknown as Record<string, unknown>;
  w.matchMedia ??= (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.scrollIntoView ??= () => {};
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
});

let fetchMock: Mock<typeof fetch>;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  // 切換配色不該呼叫任何 API（COM-R18：記在這個瀏覽器）
  fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 500 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  // Sonner 的提示存在模組層級：不清掉的話，下一個測試掛上 Toaster 時會重放
  toast.dismiss();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

/** 這個瀏覽器先前選過深色：根版面的 inline script 已經把 data-theme 設好（tests/unit/client/theme.test.ts） */
function presetDark() {
  localStorage.setItem(THEME_STORAGE_KEY, 'dark');
  document.documentElement.setAttribute('data-theme', 'dark');
}

function renderSwitch() {
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  render(
    <>
      <ThemeSwitch />
      <Toaster />
    </>,
  );
  const trigger = screen.getByRole('button', { name: LABEL });
  return { user, trigger };
}

type User = ReturnType<typeof userEvent.setup>;

/** 用鍵盤開啟選單（Radix 的觸發鈕在 jsdom 用鍵盤開最穩定，同 tests/unit/components/employees-page.test.tsx） */
async function openMenu(user: User, trigger: HTMLElement): Promise<HTMLElement> {
  trigger.focus();
  await user.keyboard('{Enter}');
  return screen.findByRole('menu');
}

const item = (menu: HTMLElement, name: '淺色' | '深色') => within(menu).getByRole('menuitemradio', { name });
const checkedOf = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitemradio')
    .map((el) => [el.textContent?.trim(), el.getAttribute('aria-checked')]);

/** Sonner 顯示這段文字；回傳那一則通知的類型（data-type） */
async function toastType(text: string): Promise<string | null | undefined> {
  const el = await screen.findByText(text);
  return el.closest('[data-sonner-toast]')?.getAttribute('data-type');
}

const htmlTheme = () => document.documentElement.getAttribute('data-theme');

describe('介面配色鈕（COM-R17）', () => {
  it('Icon Button：無障礙名稱「介面配色」、palette 圖示；一開始選單沒有打開', () => {
    const { trigger } = renderSwitch();
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.querySelector(`svg path[d^="${PALETTE_PATH}"]`)).not.toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('開啟選單：最上面是標題「介面配色」，下面依序是「淺色」「深色」兩個單選項目；第一次開啟是淺色打勾（COM-AC16、第 14 節）', async () => {
    const { user, trigger } = renderSwitch();
    const menu = await openMenu(user, trigger);

    const heading = within(menu).getByText(LABEL);
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items.map((el) => el.textContent?.trim())).toEqual(['淺色', '深色']);
    // 標題在兩個項目上面，而且不是可以選的項目
    expect(heading.compareDocumentPosition(items[0] as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.closest('[role="menuitemradio"]')).toBeNull();
    expect(within(menu).queryAllByRole('menuitem')).toEqual([]);
    expect(checkedOf(menu)).toEqual([
      ['淺色', 'true'],
      ['深色', 'false'],
    ]);
    expect(htmlTheme()).toBeNull();
  });

  it('選「深色」→ <html data-theme="dark">、記在這個瀏覽器；選單關閉、焦點回到按鈕；Sonner（info）「已切換為深色。」；沒有呼叫 API（COM-AC16）', async () => {
    const { user, trigger } = renderSwitch();
    const menu = await openMenu(user, trigger);

    await user.click(item(menu, '深色'));

    expect(htmlTheme()).toBe('dark');
    expect(readTheme()).toBe('dark');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(await toastType(SWITCHED.dark)).toBe('info');
    expect(screen.queryByText(SWITCHED.light)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('切成深色後再開選單 →「深色」打勾；選「淺色」→ 移除 data-theme、記成淺色；選單關閉、焦點回到按鈕；Sonner「已切換為淺色。」', async () => {
    const { user, trigger } = renderSwitch();
    await user.click(item(await openMenu(user, trigger), '深色'));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    const menu = await openMenu(user, trigger);
    expect(checkedOf(menu)).toEqual([
      ['淺色', 'false'],
      ['深色', 'true'],
    ]);
    await user.click(item(menu, '淺色'));

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(readTheme()).toBe('light');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(await toastType(SWITCHED.light)).toBe('info');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('鍵盤：Enter 開啟選單，方向鍵移到「深色」再按 Enter → 換成深色、選單關閉、焦點回到按鈕', async () => {
    const { user, trigger } = renderSwitch();
    const menu = await openMenu(user, trigger);
    const dark = item(menu, '深色');
    for (let i = 0; i < 3 && document.activeElement !== dark; i++) await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(dark);

    await user.keyboard('{Enter}');

    expect(htmlTheme()).toBe('dark');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(await toastType(SWITCHED.dark)).toBe('info');
  });

  it('按 Esc 關閉選單 → 配色不變、沒有 Sonner，焦點回到按鈕', async () => {
    const { user, trigger } = renderSwitch();
    await openMenu(user, trigger);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(htmlTheme()).toBeNull();
    expect(readTheme()).toBe('light');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(SWITCHED.dark)).toBeNull();
    expect(screen.queryByText(SWITCHED.light)).toBeNull();
  });

  it.each([
    ['淺色', false],
    ['深色', true],
  ] as const)('目前的配色是「%s」時再選它 → 只關閉選單：配色不變、不顯示 Sonner，焦點回到按鈕（COM-R17）', async (name, presetIsDark) => {
    if (presetIsDark) presetDark();
    const { user, trigger } = renderSwitch();
    const menu = await openMenu(user, trigger);
    expect(item(menu, name).getAttribute('aria-checked')).toBe('true');

    await user.click(item(menu, name));

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(htmlTheme()).toBe(presetIsDark ? 'dark' : null);
    expect(readTheme()).toBe(presetIsDark ? 'dark' : 'light');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(SWITCHED.dark)).toBeNull();
    expect(screen.queryByText(SWITCHED.light)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('切成深色後再選一次「深色」→ 只關閉選單，不再顯示第二則「已切換為深色。」', async () => {
    const { user, trigger } = renderSwitch();
    await user.click(item(await openMenu(user, trigger), '深色'));
    expect(await screen.findAllByText(SWITCHED.dark)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    await user.click(item(await openMenu(user, trigger), '深色'));

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getAllByText(SWITCHED.dark)).toHaveLength(1);
    expect(htmlTheme()).toBe('dark');
  });

  it('這個瀏覽器先前選過深色 → 開啟選單是「深色」打勾', async () => {
    presetDark();
    const { user, trigger } = renderSwitch();
    const menu = await openMenu(user, trigger);
    expect(checkedOf(menu)).toEqual([
      ['淺色', 'false'],
      ['深色', 'true'],
    ]);
  });

  it('讀取 localStorage 丟例外（瀏覽器封鎖儲存空間）→ 元件照常顯示，當淺色（「淺色」打勾）', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    const { user, trigger } = renderSwitch();
    const menu = await openMenu(user, trigger);
    expect(checkedOf(menu)).toEqual([
      ['淺色', 'true'],
      ['深色', 'false'],
    ]);
  });

  it('寫入 localStorage 失敗 → 畫面照樣換成深色，Sonner「已切換為深色。」，元件不壞', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const { user, trigger } = renderSwitch();
    await user.click(item(await openMenu(user, trigger), '深色'));

    expect(htmlTheme()).toBe('dark');
    expect(await toastType(SWITCHED.dark)).toBe('info');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
