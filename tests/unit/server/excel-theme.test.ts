// @vitest-environment node
// 匯出不受介面配色影響：docs/spec/export.md EXP-R21（一律用淺色主題的色碼，D-020）、EXP-R22（框線 --semantic-border）；
// docs/spec/README.md COM-R18、COM-AC20；docs/architecture.md 第 11.3 節（匯出 Excel 的色碼固定用淺色主題換算）。
// 底色的調淡比例照 EXP-Q04 的目前假設（tests/helpers/export-colors.ts）。各格位置與色碼的完整檢查在 tests/unit/server/excel.test.ts；
// 這裡確認：在「瀏覽器選了深色」的環境下產生的檔案和沒有選時完全相同，而且每一個色碼都是淺色主題的、不是深色主題的。
// 實際在深色畫面按「匯出座位表」下載的檔案在 tests/e2e/theme-dark-pages.spec.ts（COM-AC20）。
//
// 「選了深色」的環境：伺服器沒有 <html> 與 localStorage，這裡用假的 document（<html data-theme="dark">）與 localStorage（存「dark」）
// 模擬，確認產生檔案的程式不會讀到使用者的配色。
import type { Worksheet } from 'exceljs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSeatingSheet } from '@/domain/seating-sheet';
import { seatingSheetToXlsx } from '@/server/excel';
import { colorClose, expectedSheetColors, tintWithWhite, toHex, type Rgb } from '../../helpers/export-colors';
import { LAST_COLUMN, toAddress } from '../../helpers/export-sheet';
import { sampleA } from '../../helpers/export-state';
import { BORDER_SIDES, borderRgb, fillRgb, loadWorkbook } from '../../helpers/export-xlsx';
import { themeTokenRgb } from '../../helpers/theme-tokens';

type Category = 'guest' | 'childSeat' | 'vegetarian' | 'header';
const CATEGORIES: readonly Category[] = ['guest', 'childSeat', 'vegetarian', 'header'];

/** 淺色主題換算的色碼（EXP-R21、EXP-Q04） */
const LIGHT = expectedSheetColors();

/** 同樣的換算方式套在深色主題的 token 上：匯出不能用到這些色碼 */
const DARK: Record<Category | 'border', Rgb> = {
  guest: tintWithWhite(themeTokenRgb('dark', '--chart-cat-2'), 24),
  childSeat: tintWithWhite(themeTokenRgb('dark', '--chart-cat-4'), 34),
  vegetarian: tintWithWhite(themeTokenRgb('dark', '--chart-cat-5'), 26),
  header: themeTokenRgb('dark', '--muted'),
  border: themeTokenRgb('dark', '--semantic-border'),
};

/** 資料甲加上未入座的人：貴賓、兒童椅、素食、標題格四種底色都會出現 */
const data = () => {
  const d = sampleA();
  for (let i = 1; i <= 3; i++) d.employee(`業${i}`, '業務部');
  return d.guest('賓甲', { vegetarian: true });
};

type CellStyle = { fill: string | null; borders: (string | null)[] };

/** 工作表每一格（A 到 L 欄、到最後一列）的底色與四邊框線色碼 */
function stylesOf(ws: Worksheet): Map<string, CellStyle> {
  const out = new Map<string, CellStyle>();
  for (let r = 1; r <= ws.rowCount; r++) {
    for (let c = 1; c <= LAST_COLUMN; c++) {
      const cell = ws.getCell(r, c);
      out.set(toAddress(r, c), { fill: fillRgb(cell), borders: BORDER_SIDES.map((side) => borderRgb(cell, side)) });
    }
  }
  return out;
}

async function renderStyles(): Promise<Map<string, CellStyle>> {
  const wb = await loadWorkbook(await seatingSheetToXlsx(buildSeatingSheet(data().state())));
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('檔案裡沒有工作表');
  return stylesOf(ws);
}

/** 模擬這個瀏覽器選了深色：<html data-theme="dark">、localStorage 存「dark」 */
function stubDarkBrowser() {
  const html = {
    dataset: { theme: 'dark' } as Record<string, string>,
    getAttribute: (name: string) => (name === 'data-theme' ? 'dark' : null),
    hasAttribute: (name: string) => name === 'data-theme',
  };
  vi.stubGlobal('document', { documentElement: html });
  vi.stubGlobal('localStorage', {
    getItem: () => 'dark',
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 1,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const fillsIn = (styles: Map<string, CellStyle>) =>
  new Set([...styles.values()].map((s) => s.fill).filter((f): f is string => f !== null));
const bordersIn = (styles: Map<string, CellStyle>) =>
  new Set([...styles.values()].flatMap((s) => s.borders).filter((b): b is string => b !== null));

describe('匯出的色碼不受介面配色影響（EXP-R21、COM-AC20）', () => {
  it('前提：深色主題換算出來的色碼和淺色主題的都不同（否則下面的檢查沒有意義）', () => {
    for (const k of [...CATEGORIES, 'border'] as const) {
      expect(colorClose(toHex(LIGHT[k]), DARK[k], 8), `${k}：淺色 ${toHex(LIGHT[k])}、深色 ${toHex(DARK[k])}`).toBe(false);
    }
  });

  it('瀏覽器選了深色時產生的座位表，每一格的底色與框線和沒有選時完全相同', async () => {
    const plain = await renderStyles();
    stubDarkBrowser();
    const underDark = await renderStyles();
    vi.unstubAllGlobals();

    expect(underDark.size).toBe(plain.size);
    expect(Object.fromEntries(underDark)).toEqual(Object.fromEntries(plain));
  });

  it('瀏覽器選了深色時，底色只有淺色主題的四種（貴賓、兒童椅、素食、標題格），沒有任何一格用深色主題換算的色碼', async () => {
    stubDarkBrowser();
    const fills = fillsIn(await renderStyles());
    vi.unstubAllGlobals();

    expect(fills.size).toBe(4);
    for (const fill of fills) {
      const light = CATEGORIES.filter((k) => colorClose(fill, LIGHT[k]));
      expect(light, `${fill} 不是淺色主題的底色`).toHaveLength(1);
      const dark = CATEGORIES.filter((k) => colorClose(fill, DARK[k], 3));
      expect(dark, `${fill} 是深色主題換算的底色`).toEqual([]);
    }
    for (const k of CATEGORIES) {
      expect([...fills].some((f) => colorClose(f, LIGHT[k])), `沒有${k}的底色`).toBe(true);
    }
  });

  it('瀏覽器選了深色時，框線都是淺色主題的 --semantic-border，不是深色主題的', async () => {
    stubDarkBrowser();
    const borders = bordersIn(await renderStyles());
    vi.unstubAllGlobals();

    expect(borders.size).toBeGreaterThan(0);
    for (const b of borders) {
      expect(colorClose(b, LIGHT.border), `${b} 不是淺色主題的框線色`).toBe(true);
      expect(colorClose(b, DARK.border, 3), `${b} 是深色主題的框線色`).toBe(false);
    }
  });
});
