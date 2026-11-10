// GET /api/export/seating：docs/spec/export.md EXP-R01（直接下載 Excel 檔）、EXP-R03（檔名「座位表_{YYYYMMDD}.xlsx」，
// 匯出當天的台灣日期）、EXP-R04（一個工作表「座位表」）、EXP-R02、EXP-AC18（和頁面的搜尋、篩選無關）、
// EXP-Q06（匯出伺服器上已儲存的資料）、EXP-AC01、EXP-AC17、EXP-AC22、EXP-AC23（EXP-R23：有桌次 11、12 位時那一段改為十二列，D-018）；
// docs/spec/README.md AUTH-R08（沒登入回 401、不回傳資料）。
// 版面的每一格在單元測試（seating-sheet.test.ts、excel.test.ts）驗；這裡確認 API 讀資料庫的資料、回傳正確的檔案。
// 資料是 export.md 第 5.1 節的「資料甲」（虛構姓名）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/export/seating/route';
import { prisma, resetData } from '../../helpers/db';
import { createDependent, createGuest, createRegisteredEmployee } from '../../helpers/factory';
import { overflowLayout, tableBlock, TABLE_IDS } from '../../helpers/export-sheet';
import {
  borderSides,
  cellText,
  cellTexts,
  downloadFileName,
  fillRgb,
  loadWorkbook,
  mergeRanges,
  taiwanDateStamp,
  XLSX_CONTENT_TYPE,
} from '../../helpers/export-xlsx';

type User = { id: string; name: string; email: string };
const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn<() => Promise<User | null>>() }));
vi.mock('@/server/auth', () => ({ currentUser }));

const SIGNED_IN: User = { id: 'test-user-1', name: '測試承辦人', email: 'tester@program.com.tw' };

const callExport = (query = '') =>
  GET(new Request(`http://localhost:3000/api/export/seating${query}`), { params: Promise.resolve({}) });

async function exportWorkbook(query = '') {
  const res = await callExport(query);
  expect(res.status).toBe(200);
  const wb = await loadWorkbook(new Uint8Array(await res.arrayBuffer()));
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('檔案裡沒有工作表');
  return { res, wb, ws };
}

/** 資料甲（export.md 第 5.1 節） */
async function seedSampleA() {
  await createRegisteredEmployee({ name: '王大同', department: '總經理室', sortOrder: 1 }, { tableId: 1, seatOrder: 0 });
  await createRegisteredEmployee({ name: '李小華', department: '總經理室', sortOrder: 2 }, { tableId: 1, seatOrder: 1 });
  const chen = await createRegisteredEmployee({ name: '陳志明', department: '業務部', sortOrder: 3 }, { tableId: 5, seatOrder: 0 });
  const lin = await createRegisteredEmployee(
    { name: '林美玲', department: '業務部', sortOrder: 4 },
    { tableId: 5, seatOrder: 2, vegetarian: true },
  );
  await createRegisteredEmployee({ name: '張家豪', department: '研發部', sortOrder: 5 }, { tableId: 0, seatOrder: 0 });
  await createDependent(chen.participant.id, { relation: '子女', childSeat: true, tableId: 5, seatOrder: 1 });
  await createGuest({ guestName: '周董事', childSeat: true, vegetarian: true, tableId: 1, seatOrder: 2 });
  await createGuest({ guestName: '吳協理', tableId: 22, seatOrder: 0 });
  await prisma.seatTable.update({ where: { id: 1 }, data: { noteName: '主桌' } });
  await prisma.seatTable.update({ where: { id: 17 }, data: { noteName: '供應商' } });
  await prisma.seatTable.update({ where: { id: 22 }, data: { noteName: '客戶貴賓' } });
  return { lin };
}

beforeEach(async () => {
  await resetData();
  currentUser.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('沒登入（AUTH-R08）', () => {
  beforeEach(() => {
    currentUser.mockResolvedValue(null);
  });

  it('回 401 UNAUTHENTICATED，不回傳檔案，也不含任何資料', async () => {
    await seedSampleA();
    const res = await callExport();
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type') ?? '').not.toContain(XLSX_CONTENT_TYPE);
    expect(res.headers.get('content-disposition')).toBeNull();
    const text = await res.text();
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['error']);
    expect(body.error).toMatchObject({ code: 'UNAUTHENTICATED' });
    for (const secret of ['王大同', '總經理室', '周董事', '主桌']) expect(text).not.toContain(secret);
  });
});

describe('已登入', () => {
  beforeEach(() => {
    currentUser.mockResolvedValue(SIGNED_IN);
  });

  it('回傳 xlsx 附件：Content-Type 是 Excel，檔名「座位表_{台灣日期}.xlsx」（EXP-R01、EXP-R03）', async () => {
    await seedSampleA();
    const before = taiwanDateStamp();
    const { res } = await exportWorkbook();
    const after = taiwanDateStamp();

    expect(res.headers.get('content-type')).toContain(XLSX_CONTENT_TYPE);
    const disposition = res.headers.get('content-disposition') ?? '';
    expect(disposition.toLowerCase().startsWith('attachment')).toBe(true);
    expect([`座位表_${before}.xlsx`, `座位表_${after}.xlsx`]).toContain(downloadFileName(disposition));
  });

  it.each([
    ['2026-11-10T04:00:00Z', '20261110', '台灣 11/10 中午'],
    ['2026-11-09T16:30:00Z', '20261110', '台灣 11/10 00:30，UTC 還是 11/9'],
    ['2026-11-10T15:59:59Z', '20261110', '台灣 11/10 23:59:59'],
    ['2026-11-10T16:00:00Z', '20261111', '台灣已經是 11/11，UTC 還是 11/10'],
  ])('%s 匯出：檔名是「座位表_%s.xlsx」（%s，EXP-R03）', async (now, stamp) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));

    const res = await callExport();

    expect(res.status).toBe(200);
    expect(downloadFileName(res.headers.get('content-disposition'))).toBe(`座位表_${stamp}.xlsx`);
  });

  it('檔案只有一個工作表「座位表」，內容是資料庫裡的資料甲（EXP-R04、EXP-AC01、EXP-AC04～AC09）', async () => {
    await seedSampleA();
    const { wb, ws } = await exportWorkbook();

    expect(wb.worksheets.map((w) => w.name)).toEqual(['座位表']);
    expect(ws.pageSetup.orientation).toBe('landscape');
    const merges = mergeRanges(ws);
    for (const range of ['G1:G10', 'I61:I70', 'C11:C20', 'B81:B90', 'D21:D30', 'K1:K10']) expect(merges).toContain(range);
    const text = (a: string) => cellText(ws.getCell(a));
    expect(text('G1')).toBe('第 1 桌\n主桌\n總經理室＋貴賓\n(3)');
    expect([text('H1'), text('H2'), text('H3'), text('H4')]).toEqual(['王大同', '李小華', '周董事(+兒童椅)(素食)', '']);
    expect(text('I61')).toBe('第 5 桌\n業務部\n(3)');
    expect([text('J61'), text('J62'), text('J63')]).toEqual(['陳志明', '陳志明_眷屬(+兒童椅)', '林美玲(素食)']);
    expect(text('C11')).toBe('第 22 桌\n客戶貴賓\n貴賓\n(1)');
    expect(text('D11')).toBe('吳協理');
    expect(text('B81')).toBe('第 30 桌\n空桌\n(0)');
    expect(text('D21')).toBe('第 17 桌\n供應商\n空桌\n(0)');
    expect([text('A3'), text('A4'), text('A5')]).toEqual(['貴賓', '兒童椅', '素食']);
    expect(text('K1')).toBe('工作人員\n(1)');
    expect(text('L1')).toBe('張家豪');
    expect(fillRgb(ws.getCell('H3'))).toBe(fillRgb(ws.getCell('A4')));
    expect(fillRgb(ws.getCell('D11'))).toBe(fillRgb(ws.getCell('A3')));
    expect(fillRgb(ws.getCell('J63'))).toBe(fillRgb(ws.getCell('A5')));
    expect([...cellTexts(ws).keys()].filter((a) => Number(a.replace(/^[A-Z]+/, '')) >= 111)).toEqual([]);
  });

  it('和頁面的搜尋、篩選無關：帶網址參數也回傳相同的內容（EXP-R02、EXP-AC18）', async () => {
    await seedSampleA();
    const plain = await exportWorkbook();
    const filtered = await exportWorkbook(`?q=${encodeURIComponent('陳志明')}&table=5&zoom=50`);
    expect(Object.fromEntries(cellTexts(filtered.ws))).toEqual(Object.fromEntries(cellTexts(plain.ws)));
    expect(mergeRanges(filtered.ws)).toEqual(mergeRanges(plain.ws));
  });

  it('匯出伺服器上已儲存的資料：資料庫改了，再匯出就是新的內容（EXP-Q06）', async () => {
    const { lin } = await seedSampleA();
    const first = await exportWorkbook();
    expect(cellText(first.ws.getCell('B112'))).toBe('');

    await prisma.participant.update({ where: { id: lin.participant.id }, data: { tableId: null, seatOrder: null } });

    const second = await exportWorkbook();
    expect(cellText(second.ws.getCell('I61'))).toBe('第 5 桌\n業務部\n(2)');
    expect(cellText(second.ws.getCell('J63'))).toBe('');
    expect(mergeRanges(second.ws)).toContain('B112:B121');
    expect(cellText(second.ws.getCell('B112'))).toBe('未入座\n(1)');
    expect(cellText(second.ws.getCell('C112'))).toBe('林美玲(素食)');
  });

  it('EXP-AC22：資料甲、第 1 桌 11 位、1 位未入座 → 第 1 段改為十二列，下面的段與未入座區塊往下移兩列；人數照實寫、不另加底色（EXP-R23、D-018）', async () => {
    await seedSampleA();
    // 第 1 桌原本 3 位（座號 0–2），再坐 8 位總經理室的員工成為 11 位
    for (let i = 0; i < 8; i++) {
      await createRegisteredEmployee(
        { name: `總${i + 1}`, department: '總經理室', sortOrder: 10 + i },
        { tableId: 1, seatOrder: 3 + i },
      );
    }
    await createRegisteredEmployee({ name: '未甲', department: '業務部', sortOrder: 30 });

    const { ws } = await exportWorkbook();
    const text = (a: string) => cellText(ws.getCell(a));
    const merges = mergeRanges(ws);
    const layout = overflowLayout([1]);

    for (const n of TABLE_IDS) expect(merges, `第 ${n} 桌`).toContain(layout.block(n).range);
    for (const range of ['G1:G12', 'D1:D12', 'C13:C22', 'H13:H22', 'I63:I72', 'G103:G112', 'K1:K10', 'B114:B123']) {
      expect(merges).toContain(range);
    }
    for (const old of ['G1:G10', 'D1:D10', 'C11:C20', 'I61:I70', 'B112:B121']) expect(merges).not.toContain(old);

    expect(text('G1')).toBe('第 1 桌\n主桌\n總經理室＋貴賓\n(11)');
    expect([text('H1'), text('H3'), text('H4'), text('H11'), text('H12')]).toEqual([
      '王大同',
      '周董事(+兒童椅)(素食)',
      '總1',
      '總8',
      '',
    ]);
    expect(borderSides(ws.getCell('H12')).length).toBeGreaterThan(0);
    expect(text('C13')).toBe('第 22 桌\n客戶貴賓\n貴賓\n(1)');
    expect(text('D13')).toBe('吳協理');
    expect(text('I63')).toBe('第 5 桌\n業務部\n(3)');
    expect([text('J63'), text('J64'), text('J65')]).toEqual(['陳志明', '陳志明_眷屬(+兒童椅)', '林美玲(素食)']);
    expect(text('K1')).toBe('工作人員\n(1)');
    expect(text('L1')).toBe('張家豪');

    // 第 113 列空白；未入座從第 114 列開始
    expect([...cellTexts(ws).keys()].filter((a) => Number(a.replace(/^[A-Z]+/, '')) === 113)).toEqual([]);
    expect(text('B114')).toBe('未入座\n(1)');
    expect(text('C114')).toBe('未甲');

    // 標題格不另加底色：超過的第 1 桌和其他桌的標題格同一個底色
    expect(fillRgb(ws.getCell('G1'))).toBe(fillRgb(ws.getCell('D1')));
    expect(fillRgb(ws.getCell('G1'))).toBe(fillRgb(ws.getCell('I63')));
    expect(fillRgb(ws.getCell('G1'))).toBe(fillRgb(ws.getCell('K1')));
  });

  it('EXP-AC23：沒有桌次超過 10 位（第 1 桌剛好 10 位）→ 版面不變，G1:G10、C11:C20、未入座從第 112 列開始（EXP-R23）', async () => {
    await seedSampleA();
    for (let i = 0; i < 7; i++) {
      await createRegisteredEmployee(
        { name: `總${i + 1}`, department: '總經理室', sortOrder: 10 + i },
        { tableId: 1, seatOrder: 3 + i },
      );
    }
    await createRegisteredEmployee({ name: '未甲', department: '業務部', sortOrder: 30 });

    const { ws } = await exportWorkbook();
    const merges = mergeRanges(ws);
    for (const n of TABLE_IDS) expect(merges, `第 ${n} 桌`).toContain(tableBlock(n).range);
    expect(merges).toContain('B112:B121');
    expect(cellText(ws.getCell('G1'))).toBe('第 1 桌\n主桌\n總經理室＋貴賓\n(10)');
    expect(cellText(ws.getCell('C112'))).toBe('未甲');
  });

  it('沒有任何資料也能匯出：30 桌都是「第 n 桌↵空桌↵(0)」，工作人員 (0)，沒有未入座區塊（EXP-AC17）', async () => {
    const { ws } = await exportWorkbook();
    for (const n of TABLE_IDS) {
      const b = tableBlock(n);
      expect([n, cellText(ws.getCell(b.header))]).toEqual([n, `第 ${n} 桌\n空桌\n(0)`]);
    }
    expect(cellText(ws.getCell('K1'))).toBe('工作人員\n(0)');
    expect(mergeRanges(ws).filter((m) => m.startsWith('B112'))).toEqual([]);
  });
});
