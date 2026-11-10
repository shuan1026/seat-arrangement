// @vitest-environment node
// 座位表的 Excel 輸出：docs/spec/export.md EXP-R04（只有一個工作表「座位表」）、EXP-R05（橫向、寬度縮成一頁、高度不限頁數）、
// EXP-R21（底色由設計系統 token 調淡而來，同一種用途同一個色碼）、EXP-R22（框線 --semantic-border）；
// 驗收條件 EXP-AC01（工作表）、EXP-AC03（列印設定）、EXP-AC04～AC09 在 Excel 裡的樣子、EXP-AC20（底色互不相同）；
// 待確認依 D-008 照目前假設：EXP-Q04（貴賓 24% --chart-cat-2、兒童椅 34% --chart-cat-4、素食 26% --chart-cat-5 與白色混合，
// 標題格 --muted、框線 --semantic-border 不調淡）、EXP-Q05 ⑤ 標題格粗體、文字靠上、自動換行，⑥ 欄寬 A 欄 8、B–L 欄 15，⑦ A4。
// 用 ExcelJS 讀回產生的檔案檢查；每一格的位置與內容在 tests/unit/domain/seating-sheet.test.ts。
//
// 假設的介面（src/server/excel.ts）：
//   export async function seatingSheetToXlsx(sheet: SeatingSheet): Promise<Uint8Array | ArrayBuffer>
//   - 依 src/domain/seating-sheet.ts 的版面模型產生 .xlsx（Buffer 也可以，它是 Uint8Array）。
//   - 底色類別換成固定色碼的常數，註明對應的 token（docs/architecture.md 第 11.4 節）；色碼由測試從 tokens.css 算出比對。
import type { Workbook, Worksheet } from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildSeatingSheet } from '@/domain/seating-sheet';
import { seatingSheetToXlsx } from '@/server/excel';
import { colorClose, expectedSheetColors, toHex, type Rgb } from '../../helpers/export-colors';
import { column, LAST_COLUMN, parseAddress, rangeOf, SheetReader, TABLE_IDS, tableBlock, toAddress } from '../../helpers/export-sheet';
import { sampleA, SheetData } from '../../helpers/export-state';
import {
  BORDER_SIDES,
  borderRgb,
  borderSides,
  cellText,
  cellTexts,
  fillRgb,
  loadWorkbook,
  mergeRanges,
} from '../../helpers/export-xlsx';

type Rendered = { sheet: SheetReader; wb: Workbook; ws: Worksheet };

async function render(data: SheetData): Promise<Rendered> {
  const model = buildSeatingSheet(data.state());
  const wb = await loadWorkbook(await seatingSheetToXlsx(model));
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('檔案裡沒有工作表');
  return { sheet: new SheetReader(model), wb, ws };
}

const cache = new Map<string, Promise<Rendered>>();
const renderOnce = (key: string, make: () => SheetData) => {
  let p = cache.get(key);
  if (!p) {
    p = render(make());
    cache.set(key, p);
  }
  return p;
};

const sampleAWorkbook = () => renderOnce('資料甲', sampleA);

/** 資料甲再加上未入座的人：未入座區塊（EXP-AC15 的資料加上資料甲） */
const withUnseated = () =>
  renderOnce('資料甲＋未入座', () => {
    const data = sampleA();
    for (let i = 1; i <= 9; i++) data.employee(`業${i}`, '業務部');
    return data.dependent('業1').guest('賓甲', { vegetarian: true });
  });

const COLORS = expectedSheetColors();

const expectColor = (actual: string | null, expected: Rgb, what: string) => {
  expect(colorClose(actual, expected), `${what}：實際 ${actual ?? '沒有'}，預期約 ${toHex(expected)}`).toBe(true);
};

describe('檔案與列印設定', () => {
  it('只有一個工作表，名稱「座位表」（EXP-R04、EXP-AC01）', async () => {
    const { wb } = await sampleAWorkbook();
    expect(wb.worksheets.map((w) => w.name)).toEqual(['座位表']);
  });

  it('列印設定：橫向、寬度縮成一頁、高度不限頁數、A4 紙（EXP-R05、EXP-AC03、EXP-Q05 ⑦）', async () => {
    const { ws } = await sampleAWorkbook();
    expect(ws.pageSetup.orientation).toBe('landscape');
    expect(ws.pageSetup.fitToPage).toBe(true);
    expect(ws.pageSetup.fitToWidth).toBe(1);
    expect(ws.pageSetup.fitToHeight).toBe(0);
    expect(ws.pageSetup.paperSize).toBe(9);
  });

  it('欄寬：A 欄 8、B–L 欄 15（EXP-Q05 ⑥）', async () => {
    const { ws } = await sampleAWorkbook();
    expect(ws.getColumn(1).width).toBe(8);
    for (let c = 2; c <= LAST_COLUMN; c++) expect([c, ws.getColumn(c).width]).toEqual([c, 15]);
  });
});

describe.each([
  ['資料甲', sampleAWorkbook],
  ['資料甲＋未入座', withUnseated],
] as const)('版面模型照樣寫進工作表（%s）', (_name, load) => {
  it('每一格的文字（換行保留）、合併範圍與模型相同；模型以外的格沒有內容', async () => {
    const { sheet, ws } = await load();
    expect(mergeRanges(ws)).toEqual(sheet.model.merges.map(rangeOf).sort());
    const expected = new Map(sheet.model.cells.filter((c) => c.text !== '').map((c) => [toAddress(c.row, c.col), c.text]));
    expect(Object.fromEntries(cellTexts(ws))).toEqual(Object.fromEntries(expected));
    for (const a of cellTexts(ws).keys()) expect(parseAddress(a).col, `${a} 超出 L 欄`).toBeLessThanOrEqual(LAST_COLUMN);
  });

  it('每一格的底色依類別換成固定色碼；沒有底色類別的格沒有底色', async () => {
    const { sheet, ws } = await load();
    for (const c of sheet.model.cells) {
      const a = toAddress(c.row, c.col);
      const actual = fillRgb(ws.getCell(a));
      const fill = c.fill ?? null;
      if (fill === null) expect([a, actual]).toEqual([a, null]);
      else expectColor(actual, COLORS[fill], `${a} 的底色（${fill}）`);
    }
  });

  it('模型要畫框線的格四邊都有框線，顏色是 --semantic-border；不畫的格沒有框線', async () => {
    const { sheet, ws } = await load();
    for (const c of sheet.model.cells) {
      const a = toAddress(c.row, c.col);
      const cell = ws.getCell(a);
      if (c.border ?? false) {
        expect([a, borderSides(cell)]).toEqual([a, [...BORDER_SIDES]]);
        for (const side of BORDER_SIDES) expectColor(borderRgb(cell, side), COLORS.border, `${a} 的${side}框線`);
      } else {
        expect([a, borderSides(cell)]).toEqual([a, []]);
      }
    }
  });
});

describe('資料甲在 Excel 裡的樣子', () => {
  it('EXP-AC04 G1:G10 合併，內容「第 1 桌↵主桌↵總經理室＋貴賓↵(3)」；H3 兒童椅底色；H1、H2 沒有底色；H4–H10 空白有框線', async () => {
    const { ws } = await sampleAWorkbook();
    expect(mergeRanges(ws)).toContain('G1:G10');
    expect(cellText(ws.getCell('G1'))).toBe('第 1 桌\n主桌\n總經理室＋貴賓\n(3)');
    expect(cellText(ws.getCell('H3'))).toBe('周董事(+兒童椅)(素食)');
    expectColor(fillRgb(ws.getCell('H3')), COLORS.childSeat, 'H3');
    expect([fillRgb(ws.getCell('H1')), fillRgb(ws.getCell('H2'))]).toEqual([null, null]);
    for (const a of column('H', 4, 10)) {
      expect([a, cellText(ws.getCell(a)), borderSides(ws.getCell(a))]).toEqual([a, '', [...BORDER_SIDES]]);
    }
  });

  it('EXP-AC05、AC06 J62 兒童椅、J63 素食、D11 貴賓的底色', async () => {
    const { ws } = await sampleAWorkbook();
    expectColor(fillRgb(ws.getCell('J62')), COLORS.childSeat, 'J62');
    expectColor(fillRgb(ws.getCell('J63')), COLORS.vegetarian, 'J63');
    expectColor(fillRgb(ws.getCell('D11')), COLORS.guest, 'D11');
    expect(fillRgb(ws.getCell('J61'))).toBeNull();
  });

  it('EXP-AC08 圖例 A3「貴賓」、A4「兒童椅」、A5「素食」，底色分別與 D11、H3、J63 相同（EXP-R15）', async () => {
    const { ws } = await sampleAWorkbook();
    expect(['A3', 'A4', 'A5'].map((a) => cellText(ws.getCell(a)))).toEqual(['貴賓', '兒童椅', '素食']);
    expect(fillRgb(ws.getCell('A3'))).toBe(fillRgb(ws.getCell('D11')));
    expect(fillRgb(ws.getCell('A4'))).toBe(fillRgb(ws.getCell('H3')));
    expect(fillRgb(ws.getCell('A5'))).toBe(fillRgb(ws.getCell('J63')));
  });

  it('EXP-AC09 K1:K10 合併「工作人員↵(1)」；L1「張家豪」', async () => {
    const { ws } = await sampleAWorkbook();
    expect(mergeRanges(ws)).toContain('K1:K10');
    expect(cellText(ws.getCell('K1'))).toBe('工作人員\n(1)');
    expect(cellText(ws.getCell('L1'))).toBe('張家豪');
  });

  it('EXP-AC10 F 欄、第 111 列以下沒有任何內容與樣式', async () => {
    const { ws } = await sampleAWorkbook();
    for (const a of [...column('F', 1, 120), ...column('B', 111, 120), ...column('C', 111, 120), ...column('L', 111, 120)]) {
      const cell = ws.getCell(a);
      expect([a, cellText(cell), fillRgb(cell), borderSides(cell)]).toEqual([a, '', null, []]);
    }
  });
});

describe('底色與框線的色碼（EXP-R21、EXP-R22、EXP-Q04）', () => {
  it('貴賓、兒童椅、素食的底色是對應的圖表類別色與白色混合；標題格是 --muted', async () => {
    const { ws } = await withUnseated();
    expectColor(fillRgb(ws.getCell('D11')), COLORS.guest, '貴賓（--chart-cat-2 的 24%）');
    expectColor(fillRgb(ws.getCell('H3')), COLORS.childSeat, '兒童椅（--chart-cat-4 的 34%）');
    expectColor(fillRgb(ws.getCell('J63')), COLORS.vegetarian, '素食（--chart-cat-5 的 26%）');
    expectColor(fillRgb(ws.getCell('G1')), COLORS.header, '桌次標題格（--muted）');
    expectColor(fillRgb(ws.getCell('K1')), COLORS.header, '工作人員標題格（--muted）');
    expectColor(fillRgb(ws.getCell('B112')), COLORS.header, '未入座標題格（--muted）');
  });

  it('EXP-AC20 所有標題格（桌次、工作人員、未入座）的底色相同；貴賓、兒童椅、素食三種底色互不相同，也和標題格不同', async () => {
    const { ws } = await withUnseated();
    const headers = [...TABLE_IDS.map((n) => tableBlock(n).header), 'K1', 'B112'].map((a) => fillRgb(ws.getCell(a)));
    expect(new Set(headers).size).toBe(1);
    const [header] = headers;
    const fills = [fillRgb(ws.getCell('D11')), fillRgb(ws.getCell('H3')), fillRgb(ws.getCell('J63'))];
    expect(fills.every((f) => f !== null)).toBe(true);
    expect(new Set([...fills, header]).size).toBe(4);
  });

  it('同一種用途在整個工作表用同一個色碼：名單格、圖例、工作人員與未入座區塊的同類底色都相同', async () => {
    const { sheet, ws } = await withUnseated();
    const byCategory = new Map<string, Set<string | null>>();
    for (const c of sheet.model.cells) {
      const fill = c.fill ?? null;
      if (fill === null) continue;
      const set = byCategory.get(fill) ?? new Set<string | null>();
      set.add(fillRgb(ws.getCell(toAddress(c.row, c.col))));
      byCategory.set(fill, set);
    }
    expect([...byCategory.keys()].sort()).toEqual(['childSeat', 'guest', 'header', 'vegetarian']);
    for (const [fill, set] of byCategory) expect([fill, set.size]).toEqual([fill, 1]);
  });
});

describe('標題格的樣式與合併格的框線（EXP-R22、EXP-Q05 ⑤）', () => {
  it('標題格（桌次、工作人員、未入座）粗體、文字靠上、自動換行', async () => {
    const { ws } = await withUnseated();
    for (const a of [...TABLE_IDS.map((n) => tableBlock(n).header), 'K1', 'B112']) {
      const cell = ws.getCell(a);
      expect([a, cell.font?.bold, cell.alignment?.vertical, cell.alignment?.wrapText]).toEqual([a, true, 'top', true]);
    }
  });

  it('合併的標題格外圍都有框線：最上一列有上框線、最下一列有下框線、每一列都有左右框線', async () => {
    const { ws } = await withUnseated();
    for (const range of mergeRanges(ws)) {
      const [top = '', bottom = ''] = range.split(':');
      const { row: r1, col } = parseAddress(top);
      const { row: r2 } = parseAddress(bottom);
      expect([range, borderSides(ws.getCell(top)).includes('top')]).toEqual([range, true]);
      expect([range, borderSides(ws.getCell(r2, col)).includes('bottom')]).toEqual([range, true]);
      for (let r = r1; r <= r2; r++) {
        const sides = borderSides(ws.getCell(r, col));
        expect([range, r, sides.includes('left') && sides.includes('right')]).toEqual([range, r, true]);
      }
    }
  });
});
