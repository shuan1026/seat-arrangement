// 下載座位表（已登入）：docs/spec/export.md EXP-R01、EXP-R03（檔名台灣日期）、EXP-R04、EXP-R05、EXP-R09、EXP-R12、EXP-R16。
// 頁首的「匯出座位表」按鈕見 export-seating-button.spec.ts；這裡用已登入的 request（帶 signIn 產生的 cookie）直接呼叫 GET /api/export/seating，
// 檢查實際跑起來的伺服器下載的檔案。E2E 的資料庫可能有其他測試留下的資料，所以只檢查和資料無關的部分。
// 沒登入回 401 在 auth-guard.spec.ts。
import { expect, test } from '@playwright/test';
import { signIn } from './helpers/auth';
import { requireBaseURL } from './helpers/page-checks';
import { TABLE_IDS, tableBlock } from '../helpers/export-sheet';
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

  test('30 桌的標題格在規格 3.3 節的位置，工作人員區塊在右上角，圖例在 A3–A5', async ({ context }) => {
    const res = await context.request.get('/api/export/seating');
    expect(res.status()).toBe(200);
    const wb = await loadWorkbook(await res.body());
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('檔案裡沒有工作表');

    const merges = mergeRanges(ws);
    for (const n of TABLE_IDS) {
      const b = tableBlock(n);
      expect(merges, `第 ${n} 桌`).toContain(b.range);
      expect(cellText(ws.getCell(b.header)), `第 ${n} 桌`).toMatch(new RegExp(`^第 ${n} 桌\\n[^]*\\n\\(\\d+\\)$`));
    }
    expect(cellText(ws.getCell('K1'))).toMatch(/^工作人員\n\(\d+\)$/);
    expect(['A3', 'A4', 'A5'].map((a) => cellText(ws.getCell(a)))).toEqual(['貴賓', '兒童椅', '素食']);
  });
});
