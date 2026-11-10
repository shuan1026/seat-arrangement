// 座位安排 E2E 的定位與操作。一律用使用者看得到的角色、無障礙名稱與文字定位，不依賴 class 或 test id。
//
// 假設的無障礙結構（實作請照做）：
// - 座位圖區（場地圖、可捲動與平移的區域，不含工具列）：region「座位圖」。
// - 每一桌：座位圖區裡的 group，名稱正好是「第 {n} 桌」；裡面有
//   - 開啟桌次詳情的 button，名稱以「第 {n} 桌」開頭（例如「第 3 桌，主桌，研發一部，4/10」）；
//   - 拖移把手 button「拖移調換桌次」（桌面才有）；
//   - 展開時的名單列是 listitem（固定 10 列，這一桌有 11、12 位時 12 列；空位列文字「空位」）。
//   收合時畫面上的文字是桌號數字、備註名稱或部門、人數（或「已滿」，11、12 位時「超過」，D-018）。
// - 工作人員桌：座位圖區裡的 group「工作人員桌」，裡面開啟詳情的 button 名稱以「工作人員桌」開頭（2.5.1：「工作人員桌・{部門}」）。
// - 桌次詳情：桌面是 region（或非 modal 的 dialog）、手機是 dialog，名稱正好是「第 {n} 桌」；工作人員桌詳情名稱「工作人員桌」。
//   詳情的名單是 list「名單」，每列是 listitem；名單列的列操作是 button「更多操作」（README 第 14 節）。
// - 人員面板：complementary「人員」；人員列是 listitem，顯示名稱在自己的元素裡（文字正好是顯示名稱）；
//   列操作 button「更多操作」；「全部」分頁已入座的人有 button「第 {n} 桌」。
// - 名單列的小徽章：貴賓「賓」是文字；兒童椅、素食的圖示徽章有 aria-label「兒童椅」「素食」；滑過都顯示 Tooltip（role tooltip）。
// - Sonner 依 src/components/ui/toaster.tsx：region「通知 …」裡的 listitem，「復原」是 button。
import { expect, type Locator, type Page } from '@playwright/test';
import { isMobileWidth } from './page-checks';

// ---- 座位圖

export const seatMap = (page: Page) => page.getByRole('region', { name: '座位圖', exact: true });
export const mapTable = (page: Page, n: number) => seatMap(page).getByRole('group', { name: `第 ${n} 桌`, exact: true });
export const tableButton = (page: Page, n: number) =>
  mapTable(page, n).getByRole('button', { name: new RegExp(`^第 ${n} 桌`) });
export const tableHandle = (page: Page, n: number) => mapTable(page, n).getByRole('button', { name: '拖移調換桌次' });
export const staffTable = (page: Page) => seatMap(page).getByRole('group', { name: '工作人員桌', exact: true });
export const staffTableButton = (page: Page) => staffTable(page).getByRole('button', { name: /^工作人員桌/ });
/** 展開卡片的名單列 */
export const cardRows = (page: Page, n: number) => mapTable(page, n).getByRole('listitem');
export const landmark = (page: Page, name: '舞台' | '領獎區' | '控台' | '出入口') =>
  seatMap(page).getByText(name, { exact: true });

// ---- 桌次詳情與工作人員桌詳情

export const tableDetail = (page: Page, n: number) =>
  page
    .getByRole('region', { name: `第 ${n} 桌`, exact: true })
    .or(page.getByRole('dialog', { name: `第 ${n} 桌`, exact: true }));
export const staffDetail = (page: Page) =>
  page
    .getByRole('region', { name: '工作人員桌', exact: true })
    .or(page.getByRole('dialog', { name: '工作人員桌', exact: true }));
export const detailRows = (detail: Locator) => detail.getByRole('list', { name: '名單' }).getByRole('listitem');
export const rowWithName = (rows: Locator, page: Page, name: string) =>
  rows.filter({ has: page.getByText(name, { exact: true }) });

export async function openTableDetail(page: Page, n: number): Promise<Locator> {
  await tableButton(page, n).click();
  const detail = tableDetail(page, n);
  await expect(detail).toBeVisible();
  return detail;
}

export async function openStaffDetail(page: Page): Promise<Locator> {
  await staffTableButton(page).click();
  const detail = staffDetail(page);
  await expect(detail).toBeVisible();
  return detail;
}

/** 名單列依序含有這些名字，其餘是「空位」，共 rowCount 列（預設 10 列；11、12 位的展開卡片是 12 列，D-018） */
export async function expectRoster(rows: Locator, names: string[], rowCount = 10) {
  await expect(rows).toHaveCount(rowCount);
  for (let i = 0; i < rowCount; i++) {
    const name = names[i];
    if (name) await expect(rows.nth(i), `第 ${i + 1} 列`).toContainText(name);
    else await expect(rows.nth(i), `第 ${i + 1} 列`).toContainText('空位');
  }
}

// ---- 人員面板

export const peoplePanel = (page: Page) => page.getByRole('complementary', { name: '人員', exact: true });
export const personRow = (page: Page, name: string) =>
  peoplePanel(page).getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) });
export const panelTab = (page: Page, label: '未入座' | '全部') =>
  peoplePanel(page).getByRole('tab', { name: new RegExp(`^${label}`) });
export const panelSearch = (page: Page) => peoplePanel(page).getByPlaceholder('搜尋姓名、分機、部門或單位');

/** 手機先切到「人員」分頁；桌面不用 */
export async function showPeople(page: Page) {
  if (isMobileWidth(page)) await page.getByRole('tab', { name: '人員', exact: true }).click();
  await expect(peoplePanel(page)).toBeVisible();
}

/** 手機先切到「座位圖」分頁；桌面不用 */
export async function showMap(page: Page) {
  if (isMobileWidth(page)) await page.getByRole('tab', { name: '座位圖', exact: true }).click();
  await expect(seatMap(page)).toBeVisible();
}

// ---- 列操作選單、對話框

export async function rowAction(page: Page, row: Locator, action: string) {
  await row.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

export async function menuItemsOf(page: Page, row: Locator): Promise<string[]> {
  await row.getByRole('button', { name: '更多操作' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const items = (await menu.getByRole('menuitem').allInnerTexts()).map((t) => t.trim());
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  return items;
}

/** 在對話框的 Select 欄位選一個選項 */
export async function chooseOption(page: Page, scope: Locator, field: string | RegExp, option: RegExp) {
  await scope.getByRole('combobox', { name: field }).click();
  await page.getByRole('option', { name: option }).click();
}

export async function optionLabels(page: Page, scope: Locator, field: string | RegExp): Promise<string[]> {
  await scope.getByRole('combobox', { name: field }).click();
  await expect(page.getByRole('option').first()).toBeVisible();
  return (await page.getByRole('option').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
}

// ---- 工具列、統計列

export const toolbarButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
export const zoomText = (page: Page) => page.getByText(/^\d+%$/).filter({ visible: true }).first();
export async function zoomValue(page: Page): Promise<number> {
  return Number(((await zoomText(page).textContent()) ?? '').replace('%', '').trim());
}

/**
 * 放大到收合的一般顯示（80% 以上，SEAT-R68）。適合視窗的比例常低於 80%，那時桌次是精簡顯示，
 * 只有桌號與人數，備註名稱與部門只在 Tooltip（2.1.6）。
 */
export async function zoomToRegular(page: Page) {
  for (let i = 0; i < 25 && (await zoomValue(page)) < 80; i++) await toolbarButton(page, '放大').click();
  expect(await zoomValue(page)).toBeGreaterThanOrEqual(80);
}

/** 全部展開：每一桌換成名單卡片，卡片上有備註名稱與部門（SEAT-R69、2.1.7） */
export async function expandAll(page: Page) {
  await toolbarButton(page, '全部展開').click();
  await expect(toolbarButton(page, '全部收合')).toBeVisible();
}

/**
 * 統計列（SEAT-R75）：「已入座 {n}／{總人數}・未入座 {m}・空位 {k}・已滿 {t} 桌」，
 * 有桌次超過 10 位時最後加「・超過 {u} 桌」（D-018）。over 省略或 0 時統計列不能有「超過」。
 */
export const statsLine = (page: Page) => page.getByText(/已入座[\s\S]*已滿[\s\S]*桌/).filter({ visible: true }).first();
export async function expectStats(
  page: Page,
  s: { seated: number; total: number; unseated: number; empty: number; full: number; over?: number },
) {
  const over = s.over ?? 0;
  const tail = over > 0 ? `[\\s・]*超過\\s*${over}\\s*桌` : '';
  await expect(statsLine(page)).toHaveText(
    new RegExp(
      `已入座\\s*${s.seated}\\s*／\\s*${s.total}[\\s・]*未入座\\s*${s.unseated}[\\s・]*空位\\s*${s.empty}[\\s・]*已滿\\s*${s.full}\\s*桌${tail}`,
    ),
  );
  if (over === 0) await expect(statsLine(page)).not.toContainText('超過');
}

// ---- Sonner

export const toasts = (page: Page) => page.getByRole('region', { name: /^通知/ }).getByRole('listitem');
export const toast = (page: Page, text: string) => toasts(page).filter({ hasText: text });

export async function expectToast(page: Page, text: string, opts: { undo: boolean }) {
  const t = toast(page, text).first();
  await expect(t).toBeVisible();
  await expect(t.getByRole('button', { name: '復原' })).toHaveCount(opts.undo ? 1 : 0);
}

export async function clickUndo(page: Page, text: string) {
  await toast(page, text).first().getByRole('button', { name: '復原' }).click();
}

export async function expectNoToast(page: Page) {
  await expect(toasts(page)).toHaveCount(0);
}

/** 等這次的座位指令送到伺服器並回應 */
export function waitForOperation(page: Page) {
  return page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/seating/operations' && r.request().method() === 'POST',
  );
}

// ---- 開啟頁面

export async function openSeating(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
  await expect(tableButton(page, 1)).toBeVisible();
}

// ---- 拖移（dnd-kit：要分多步移動才會觸發）

async function centerOf(loc: Locator, pos?: { x: number; y: number }) {
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  if (!box) throw new Error('量不到元素的位置');
  return { x: box.x + (pos?.x ?? box.width / 2), y: box.y + (pos?.y ?? box.height / 2) };
}

export async function startDrag(page: Page, source: Locator) {
  const { x, y } = await centerOf(source);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 6, y + 6, { steps: 4 });
  await page.mouse.move(x + 14, y + 14, { steps: 4 });
}

/** 拖到目標上方（不放開），回傳游標位置 */
export async function dragOver(page: Page, target: Locator, pos?: { x: number; y: number }) {
  const box = await target.boundingBox();
  if (!box) throw new Error('量不到目標的位置');
  const x = box.x + (pos?.x ?? box.width / 2);
  const y = box.y + (pos?.y ?? box.height / 2);
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.move(x + 1, y + 1, { steps: 2 });
  return { x: x + 1, y: y + 1 };
}

/** 拖到某個座標上方（不放開） */
export async function dragOverPoint(page: Page, point: { x: number; y: number }) {
  await page.mouse.move(point.x, point.y, { steps: 12 });
  await page.mouse.move(point.x + 1, point.y + 1, { steps: 2 });
}

export async function drop(page: Page) {
  await page.mouse.up();
}

/** 先把目標捲到看得到的地方，再從 source 拖到 target 放開 */
export async function dragAndDrop(page: Page, source: Locator, target: Locator, pos?: { x: number; y: number }) {
  await target.scrollIntoViewIfNeeded();
  await startDrag(page, source);
  await dragOver(page, target, pos);
  await drop(page);
}

/** 收合側選單與人員面板，讓座位圖區變寬（桌面）；只在座位圖內拖移時使用 */
export async function widenMap(page: Page) {
  await page.getByRole('button', { name: '收合或展開側選單' }).click();
  await peoplePanel(page).getByRole('button', { name: '隱藏人員面板' }).click();
  await expect(peoplePanel(page)).toBeHidden();
}

// ---- 樣式（依語意 token 比對計算後的值）

type Computed = {
  borderTopColor: string;
  borderTopStyle: string;
  borderTopWidth: string;
  boxShadow: string;
  opacity: string;
  color: string;
  fontSize: string;
  width: string;
  height: string;
  text: string;
};

/** 元素本身與所有子孫的計算樣式 */
export async function subtreeStyles(loc: Locator): Promise<Computed[]> {
  return loc.first().evaluate((root) =>
    [root, ...Array.from(root.querySelectorAll('*'))].slice(0, 600).map((el) => {
      const s = getComputedStyle(el);
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      return {
        borderTopColor: s.borderTopColor,
        borderTopStyle: s.borderTopStyle,
        borderTopWidth: s.borderTopWidth,
        boxShadow: s.boxShadow,
        opacity: s.opacity,
        color: s.color,
        fontSize: s.fontSize,
        width: s.width,
        height: s.height,
        text: own,
      };
    }),
  );
}

/** 語意 token 計算後的顏色（例如 --primary） */
export async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((t) => {
    const d = document.createElement('div');
    d.style.color = `var(${t})`;
    document.body.appendChild(d);
    const v = getComputedStyle(d).color;
    d.remove();
    return v;
  }, token);
}

/** 語意 token 計算後的底色（例如 --status-pending-bg） */
export async function tokenBackground(page: Page, token: string): Promise<string> {
  return page.evaluate((t) => {
    const d = document.createElement('div');
    d.style.backgroundColor = `var(${t})`;
    document.body.appendChild(d);
    const v = getComputedStyle(d).backgroundColor;
    d.remove();
    return v;
  }, token);
}

/**
 * 徽章（文字正好是 text 的元素）的樣子：底色取文字往上四層內第一個有底色的元素，文字顏色取文字本身；
 * icons 是徽章裡 svg 的 path（d 屬性），用來辨認圖示；height 是有底色那一層的計算後高度。找不到這段文字時是 null。
 */
export async function badgeLook(
  loc: Locator,
  text: string,
): Promise<{ background: string; color: string; height: string; icons: string[] } | null> {
  return loc.first().evaluate((root, t) => {
    const all = [root, ...Array.from(root.querySelectorAll('*'))];
    const el = all.find((e) =>
      Array.from(e.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() === t),
    );
    if (!el) return null;
    let box: Element = el;
    let node: Element | null = el;
    for (let i = 0; i < 4 && node; i++) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        box = node;
        break;
      }
      node = node.parentElement;
    }
    return {
      background: getComputedStyle(box).backgroundColor,
      color: getComputedStyle(el).color,
      height: getComputedStyle(box).height,
      icons: Array.from(box.querySelectorAll('svg path')).map((p) => p.getAttribute('d') ?? ''),
    };
  }, text);
}

/** lucide 的 triangle-alert（docs/spec/README.md 狀態徽章「超過」的圖示）特有的 path */
export const TRIANGLE_ALERT_PATH = 'M12 9v4';

/** 語意 token 計算後的陰影（例如 --shadow-md） */
export async function tokenShadow(page: Page, token: string): Promise<string> {
  return page.evaluate((t) => {
    const d = document.createElement('div');
    d.style.boxShadow = `var(${t})`;
    document.body.appendChild(d);
    const v = getComputedStyle(d).boxShadow;
    d.remove();
    return v;
  }, token);
}

export async function hasBorderColor(page: Page, loc: Locator, token: string, width?: string): Promise<boolean> {
  const color = await tokenColor(page, token);
  return (await subtreeStyles(loc)).some(
    (s) => s.borderTopColor === color && s.borderTopStyle !== 'none' && (width ? s.borderTopWidth === width : s.borderTopWidth !== '0px'),
  );
}

export async function hasShadow(page: Page, loc: Locator, token: string): Promise<boolean> {
  const shadow = await tokenShadow(page, token);
  return (await subtreeStyles(loc)).some((s) => s.boxShadow !== 'none' && s.boxShadow.includes(shadow));
}

export async function hasDashedBorder(loc: Locator): Promise<boolean> {
  return (await subtreeStyles(loc)).some((s) => s.borderTopStyle === 'dashed');
}

export async function hasOpacity(loc: Locator, value: number): Promise<boolean> {
  return (await subtreeStyles(loc)).some((s) => Math.abs(Number(s.opacity) - value) < 0.01);
}

/** 文字正好是 text 的元素的計算樣式 */
export async function styleOfText(loc: Locator, text: string): Promise<Computed | undefined> {
  return (await subtreeStyles(loc)).find((s) => s.text === text);
}

/** 游標位置上看到的游標樣式 */
export async function cursorAt(page: Page, point: { x: number; y: number }): Promise<string> {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? getComputedStyle(el).cursor : '';
  }, point);
}

/** a 完全在 b 裡面（容許 1 px 誤差） */
export async function isInside(a: Locator, b: Locator | { x: number; y: number; width: number; height: number }): Promise<boolean> {
  const ab = await a.boundingBox();
  const bb = 'boundingBox' in b ? await b.boundingBox() : b;
  if (!ab || !bb) return false;
  return ab.x >= bb.x - 1 && ab.y >= bb.y - 1 && ab.x + ab.width <= bb.x + bb.width + 1 && ab.y + ab.height <= bb.y + bb.height + 1;
}

/** 座位圖區裡沒有桌次、地標、按鈕的空白點 */
export async function blankPointIn(area: Locator): Promise<{ x: number; y: number }> {
  const point = await area.evaluate((root) => {
    const r = root.getBoundingClientRect();
    for (let fy = 0.08; fy < 0.95; fy += 0.04) {
      for (let fx = 0.04; fx < 0.97; fx += 0.03) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        const el = document.elementFromPoint(x, y);
        if (!el || !root.contains(el)) continue;
        if (el.closest('[role="group"],button,[role="button"],a,input,li,[role="listitem"]')) continue;
        const ownText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join('')
          .trim();
        if (ownText) continue;
        return { x, y };
      }
    }
    return null;
  });
  if (!point) throw new Error('座位圖區找不到空白處');
  return point;
}

/** 依序按 Tab，直到 target 取得焦點 */
export async function tabUntilFocused(page: Page, target: Locator, max = 250) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('按 Tab 一直到不了目標');
}

/** Select 開著時，依序按方向鍵到名稱以 prefix 開頭的選項 */
export async function arrowToOption(page: Page, prefix: string, max = 40) {
  for (let i = 0; i < max; i++) {
    const label = await page.evaluate(() => {
      const id = document.activeElement?.getAttribute('aria-activedescendant');
      return id ? (document.getElementById(id)?.textContent ?? '') : '';
    });
    if (label.startsWith(prefix)) return;
    await page.keyboard.press('ArrowDown');
  }
  throw new Error(`方向鍵到不了「${prefix}」`);
}
