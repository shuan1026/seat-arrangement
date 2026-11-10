// 下載座位表（已登入）：docs/spec/export.md EXP-R01、EXP-R03（檔名台灣日期）、EXP-R04、EXP-R05、EXP-R09、EXP-R12、EXP-R16、
// EXP-R23 與 EXP-AC22（D-018：有桌次 11、12 位時那一段改為十二列）。
// 頁首的「匯出座位表」按鈕見 export-seating-button.spec.ts；這裡用已登入的 request（帶 signIn 產生的 cookie）直接呼叫 GET /api/export/seating，
// 檢查實際跑起來的伺服器下載的檔案。E2E 的資料庫可能有其他測試留下的資料，所以只檢查和資料無關的部分；
// D-018 起桌次的列位置會因為有沒有桌次超過 10 位而不同，所以先從檔案找出改為十二列的段，再照 EXP-R23 比對。
// 沒登入回 401 在 auth-guard.spec.ts。
// 桌號（D-019、EXP-R11）：標題格第一行寫「{桌號} 桌」；測試資料用內部編號（1 = B1、5 = B10）。
import { expect, test } from '@playwright/test';
import { signIn } from './helpers/auth';
import { requireBaseURL } from './helpers/page-checks';
import { seed } from './helpers/seating-data';
import { dragAndDrop, expectToast, openSeating, personRow, tableButton, waitForOperation } from './helpers/seating-page';
import { headerTitle, overflowLayout, segmentOf, tallSegmentsIn, TABLE_IDS, tableBlock } from '../helpers/export-sheet';
import {
  cellText,
  downloadFileName,
  loadWorkbook,
  mergeRanges,
  taiwanDateStamp,
  XLSX_CONTENT_TYPE,
} from '../helpers/export-xlsx';

test.describe('GET /api/export/seating（已登入）', () => {
  test.skip(({ isMobile }) => isMobile, '下載的檔案和視窗寬度無關，只在桌面跑一次');

  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, requireBaseURL(baseURL));
  });

  test('下載「座位表_{台灣日期}.xlsx」：Excel 格式、只有一個工作表「座位表」、橫向寬度一頁', async ({ context }) => {
    const before = taiwanDateStamp();
    const res = await context.request.get('/api/export/seating');
    const after = taiwanDateStamp();

    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain(XLSX_CONTENT_TYPE);
    const disposition = res.headers()['content-disposition'] ?? '';
    expect(disposition.toLowerCase().startsWith('attachment')).toBe(true);
    expect([`座位表_${before}.xlsx`, `座位表_${after}.xlsx`]).toContain(downloadFileName(disposition));

    const wb = await loadWorkbook(await res.body());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['座位表']);
    const ws = wb.worksheets[0];
    expect(ws?.pageSetup.orientation).toBe('landscape');
    expect(ws?.pageSetup.fitToPage).toBe(true);
    expect(ws?.pageSetup.fitToWidth).toBe(1);
    expect(ws?.pageSetup.fitToHeight).toBe(0);
  });

  test('30 桌的標題格在規格 3.3 節的位置（有段改為十二列時照 EXP-R23 往下移），第一行是「{桌號} 桌」；工作人員區塊在右上角，圖例在 A3–A5', async ({
    context,
  }) => {
    const res = await context.request.get('/api/export/seating');
    expect(res.status()).toBe(200);
    const wb = await loadWorkbook(await res.body());
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('檔案裡沒有工作表');

    const merges = mergeRanges(ws);
    const layout = overflowLayout(tallSegmentsIn(merges));
    for (const n of TABLE_IDS) {
      const b = layout.block(n);
      expect(merges, headerTitle(n)).toContain(b.range);
      expect(cellText(ws.getCell(b.header)), headerTitle(n)).toMatch(new RegExp(`^${headerTitle(n)}\\n[^]*\\n\\(\\d+\\)$`));
    }
    // 十列的段裡每一桌都不超過 10 位；改為十二列的段裡至少有一桌是 11、12 位
    const countOf = (n: number) => Number(/\((\d+)\)$/.exec(cellText(ws.getCell(layout.block(n).header)))?.[1] ?? -1);
    for (const n of TABLE_IDS) {
      if (!layout.tall.includes(segmentOf(n))) expect(countOf(n), `${headerTitle(n)}在十列的段`).toBeLessThanOrEqual(10);
    }
    for (const k of layout.tall) {
      const inSegment = TABLE_IDS.filter((n) => segmentOf(n) === k);
      expect(inSegment.some((n) => countOf(n) > 10), `第 ${k} 段改為十二列`).toBe(true);
    }
    expect(cellText(ws.getCell('K1'))).toMatch(/^工作人員\n\(\d+\)$/);
    expect(['A3', 'A4', 'A5'].map((a) => cellText(ws.getCell(a)))).toEqual(['貴賓', '兒童椅', '素食']);
  });

  test('沒有桌次超過 10 位時，30 桌都在規格 3.3 節的位置（EXP-AC23）', async ({ context }) => {
    await seed(async (s) => {
      await s.fill(1, 10, { department: '總經理室', prefix: '總' });
      await s.fill(5, 3, { department: '業務部', prefix: '業' });
    });
    const res = await context.request.get('/api/export/seating');
    expect(res.status()).toBe(200);
    const ws = (await loadWorkbook(await res.body())).worksheets[0];
    if (!ws) throw new Error('檔案裡沒有工作表');
    const merges = mergeRanges(ws);
    for (const n of TABLE_IDS) expect(merges, headerTitle(n)).toContain(tableBlock(n).range);
    expect(cellText(ws.getCell('G1'))).toBe('B1 桌\n總經理室\n(10)');
    expect(cellText(ws.getCell('I61'))).toBe('B10 桌\n業務部\n(3)');
    // A1 桌（D1:D10）、A15 桌（D101）、B15 桌（G101）的標題格第一行
    expect(cellText(ws.getCell('D1')).split('\n')[0]).toBe('A1 桌');
    expect(cellText(ws.getCell('D101')).split('\n')[0]).toBe('A15 桌');
    expect(cellText(ws.getCell('G101')).split('\n')[0]).toBe('B15 桌');
  });

  test('EXP-AC22：把一位未入座的人拖到 10 位的 B1 桌（B1 桌 11 位）→ 匯出 → 第 1 段十二列、B1 桌「(11)」、第 12 格空白；下面各段與未入座區塊往下移兩列（EXP-R23）', async ({
    page,
    context,
  }) => {
    await seed(async (s) => {
      await s.noteName(1, '主桌');
      await s.fill(1, 10, { department: '總經理室', prefix: '總' });
      await s.fill(5, 3, { department: '業務部', prefix: '業' });
      await s.employee('未甲', { department: '總經理室' });
      await s.employee('未乙', { department: '業務部' });
    });
    await openSeating(page);
    const saved = waitForOperation(page);
    await dragAndDrop(page, personRow(page, '未甲'), tableButton(page, 1));
    await saved;
    await expectToast(page, '已把 未甲 安排到 B1 桌，這一桌已超過 10 位。', { undo: true });

    const res = await context.request.get('/api/export/seating');
    expect(res.status()).toBe(200);
    const ws = (await loadWorkbook(await res.body())).worksheets[0];
    if (!ws) throw new Error('檔案裡沒有工作表');
    const text = (a: string) => cellText(ws.getCell(a));
    const merges = mergeRanges(ws);
    const layout = overflowLayout([1]);

    expect(tallSegmentsIn(merges)).toEqual([1]);
    for (const n of TABLE_IDS) expect(merges, headerTitle(n)).toContain(layout.block(n).range);
    expect(text('G1')).toBe('B1 桌\n主桌\n總經理室\n(11)');
    expect(text('H11')).toBe('未甲');
    expect(text('H12')).toBe('');
    expect(merges).toContain('D1:D12');
    expect(text('I63')).toBe('B10 桌\n業務部\n(3)');
    expect(merges).toContain('K1:K10');
    expect(merges).toContain('B114:B123');
    expect(text('B114')).toBe('未入座\n(1)');
    expect(text('C114')).toBe('未乙');
  });
});
