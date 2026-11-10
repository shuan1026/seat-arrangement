// @vitest-environment node
// CSV 匯入的共用處理：docs/architecture.md 第 4 節（UTF-8 含 BOM 或 Big5）、第 11.1 節（上限 1 MB）；
// docs/spec/employees.md EMP-R46（儲存格內換行）、EMP-R47（沒選檔案）、EMP-R49（整列空白的分隔列）、EMP-Q02（表頭空白）；
// participants.md PPL-R65、PPL-AC62（報名表也是 CSV、沒選檔案的文案相同）、PPL-Q01（報名表是 UTF-8，可以有 BOM）。
// 錯誤清單的列號（階段 3 決定）：列號是這一列在檔案中的列號，和用 Excel 開啟時看到的一致——表頭是第 1 列，
// 空白列也算一列，儲存格內的換行不另算一列。所以 parseCsv 要保留空白列：回傳的第 i 個元素（0 起算）就是檔案的第 i+1 列。
// 空白列本身由各自的匯入規則略過（EMP-R49；報名表沒有名字的列），不算需要處理。
// 用 node 環境：Request／FormData／File 要用 Node 內建的實作，jsdom 的 FormData 不能當 Request 的本體。
import iconv from 'iconv-lite';
import { describe, expect, it, vi } from 'vitest';
import { errorStatus } from '@/contracts/errors';
import { IMPORT_MAX_BYTES } from '@/contracts/imports';
import { decodeCsv, normalizeHeader, parseCsv, readUploadedCsv } from '@/server/csv';
import { AppError } from '@/server/http';

// http.ts 會載入登入設定；這裡只用 AppError，不需要真的 Auth.js
vi.mock('@/server/auth', () => ({ currentUser: vi.fn() }));

const utf8 = (text: string) => Uint8Array.from(new TextEncoder().encode(text));
const withBom = (bytes: Uint8Array) => Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes]);
const big5 = (text: string) => Uint8Array.from(iconv.encode(text, 'big5'));

const SAMPLE = '分機,姓名,部門\r\n1234,王小明,研發一部\r\n5678,李美華,業務部\r\n';
const SAMPLE_ROWS = [
  ['分機', '姓名', '部門'],
  ['1234', '王小明', '研發一部'],
  ['5678', '李美華', '業務部'],
];

/** 空白列：每一格都是空字串（空行可以是 [] 或 ['']，只有逗號時是好幾個 ''） */
const isBlank = (row: readonly string[] | undefined): boolean => row !== undefined && row.every((cell) => cell === '');

/** 檔案的第 n 列（表頭是第 1 列） */
const lineOf = (rows: readonly (readonly string[])[], n: number) => rows[n - 1];

describe('decodeCsv（文字編碼）', () => {
  it('UTF-8（沒有 BOM）', () => {
    expect(decodeCsv(utf8(SAMPLE))).toBe(SAMPLE);
  });

  it('UTF-8 含 BOM：BOM 不會黏在第一個表頭上', () => {
    const rows = parseCsv(decodeCsv(withBom(utf8(SAMPLE))));
    expect(rows[0]?.[0]).toBe('分機');
    expect(rows).toEqual(SAMPLE_ROWS);
  });

  it('Big5（Excel 另存的 CSV）', () => {
    const bytes = big5(SAMPLE);
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toThrow();
    expect(decodeCsv(bytes)).toBe(SAMPLE);
  });

  it('只有英數字時兩種編碼結果相同', () => {
    expect(decodeCsv(utf8('a,b\n1,2\n'))).toBe('a,b\n1,2\n');
  });
});

describe('parseCsv', () => {
  it('解析成每列每格的文字', () => {
    expect(parseCsv(SAMPLE)).toEqual(SAMPLE_ROWS);
  });

  it('引號內的換行屬於同一格（EMP-R46）', () => {
    const text = '分機,姓名,部門\n"測試總機\n台北 02-0000-0000\n台中 04-0000-0000",,\n1234,王小明,研發一部\n';
    expect(parseCsv(text)).toEqual([
      ['分機', '姓名', '部門'],
      ['測試總機\n台北 02-0000-0000\n台中 04-0000-0000', '', ''],
      ['1234', '王小明', '研發一部'],
    ]);
  });

  it('CRLF 換行的檔案，引號內的換行也屬於同一格（EMP-R46、EMP-Q02：通訊錄檔為 CRLF）', () => {
    const text = '分機,姓名,部門\r\n"測試總機\r\n台北 02-0000-0000",,\r\n1234,王小明,研發一部\r\n';
    const rows = parseCsv(text);
    expect(rows).toHaveLength(3);
    expect(rows[1]?.[0]).toContain('測試總機');
    expect(rows[1]?.[0]).toContain('台北 02-0000-0000');
    expect(rows[2]).toEqual(['1234', '王小明', '研發一部']);
  });

  it('引號內的逗號與雙引號', () => {
    expect(parseCsv('備註,姓名\n"甲,乙",王小明\n"他說""好""",李美華\n')).toEqual([
      ['備註', '姓名'],
      ['甲,乙', '王小明'],
      ['他說"好"', '李美華'],
    ]);
  });

  it('完全空白的列（空行、只有逗號、只有空白）保留在原本的位置，每格都是空字串；後面的列號不會往前移', () => {
    const text = '分機,姓名,部門\n\n1234,王小明,研發一部\n,,\n  ,  ,  \n5678,李美華,業務部\n';
    const rows = parseCsv(text);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual(['分機', '姓名', '部門']);
    expect(isBlank(rows[1]), '第 2 列是空行').toBe(true);
    expect(rows[2]).toEqual(['1234', '王小明', '研發一部']);
    expect(isBlank(rows[3]), '第 4 列只有逗號').toBe(true);
    expect(isBlank(rows[4]), '第 5 列只有空白').toBe(true);
    expect(rows[5]).toEqual(['5678', '李美華', '業務部']);
  });

  it('去掉每一格前後的空白', () => {
    expect(parseCsv(' 分機 , 姓名 ,部門\n 1234 ,  王小明,研發一部  \n')).toEqual([
      ['分機', '姓名', '部門'],
      ['1234', '王小明', '研發一部'],
    ]);
  });

  it('姓名空白的列仍然保留，交給匯入規則判斷', () => {
    expect(parseCsv('分機,姓名,部門\n1234,,研發一部\n')).toEqual([
      ['分機', '姓名', '部門'],
      ['1234', '', '研發一部'],
    ]);
  });
});

describe('parseCsv 的列號：和用 Excel 開啟時看到的一致（表頭第 1 列、空白列也算一列、儲存格內的換行不另算）', () => {
  it('檔案中間有空白分隔列：後面每一列的位置就是它在檔案中的列號', () => {
    const text = '分機,姓名,部門\r\n1234,王小明,研發一部\r\n\r\n5678,李美華,業務部\r\n,,\r\n2001,張三,業務部\r\n';
    const rows = parseCsv(text);
    expect(lineOf(rows, 1)).toEqual(['分機', '姓名', '部門']);
    expect(lineOf(rows, 2)).toEqual(['1234', '王小明', '研發一部']);
    expect(isBlank(lineOf(rows, 3))).toBe(true);
    expect(lineOf(rows, 4)).toEqual(['5678', '李美華', '業務部']);
    expect(isBlank(lineOf(rows, 5))).toBe(true);
    expect(lineOf(rows, 6)).toEqual(['2001', '張三', '業務部']);
    expect(rows).toHaveLength(6);
  });

  it('連續好幾列空白：每一列都算', () => {
    const text = '姓名,部門\n王小明,研發一部\n\n\n\n李美華,業務部\n';
    const rows = parseCsv(text);
    expect(lineOf(rows, 2)).toEqual(['王小明', '研發一部']);
    for (const n of [3, 4, 5]) expect(isBlank(lineOf(rows, n)), `第 ${n} 列`).toBe(true);
    expect(lineOf(rows, 6)).toEqual(['李美華', '業務部']);
  });

  it('表頭下面第一列就是空白：資料從第 3 列開始', () => {
    const rows = parseCsv('姓名,部門\n\n王小明,研發一部\n');
    expect(isBlank(lineOf(rows, 2))).toBe(true);
    expect(lineOf(rows, 3)).toEqual(['王小明', '研發一部']);
  });

  it('儲存格內的換行不另算一列：多行的總機資訊只佔一列（EMP-R46）', () => {
    const text =
      '分機,姓名,部門\r\n"測試總機\r\n台北 02-0000-0000\r\n台中 04-0000-0000",,\r\n1234,王小明,研發一部\r\n\r\n5678,李美華,業務部\r\n';
    const rows = parseCsv(text);
    expect(lineOf(rows, 2)?.[0]).toContain('測試總機');
    expect(lineOf(rows, 2)?.[0]).toContain('台中 04-0000-0000');
    expect(lineOf(rows, 3)).toEqual(['1234', '王小明', '研發一部']);
    expect(isBlank(lineOf(rows, 4))).toBe(true);
    expect(lineOf(rows, 5)).toEqual(['5678', '李美華', '業務部']);
    expect(rows).toHaveLength(5);
  });

  it('引號內有換行、又有空白列（LF 換行）：列號照樣是檔案中的列號', () => {
    const text = '備註,姓名\n"第一行\n第二行",王小明\n\n,李美華\n';
    const rows = parseCsv(text);
    expect(lineOf(rows, 2)).toEqual(['第一行\n第二行', '王小明']);
    expect(isBlank(lineOf(rows, 3))).toBe(true);
    expect(lineOf(rows, 4)).toEqual(['', '李美華']);
  });

  it('檔案最後的換行不會多出一列（LF 與 CRLF）', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('檔案最後有好幾個空行：前面的列號不變，多出來的列都是空白', () => {
    const rows = parseCsv('姓名,部門\n王小明,研發一部\n\n\n');
    expect(lineOf(rows, 2)).toEqual(['王小明', '研發一部']);
    for (const row of rows.slice(2)) expect(isBlank(row)).toBe(true);
  });

  it('UTF-8 含 BOM、中間有空白列：BOM 不影響列號', () => {
    const rows = parseCsv(decodeCsv(withBom(utf8('分機,姓名,部門\r\n\r\n1234,王小明,研發一部\r\n'))));
    expect(lineOf(rows, 1)).toEqual(['分機', '姓名', '部門']);
    expect(isBlank(lineOf(rows, 2))).toBe(true);
    expect(lineOf(rows, 3)).toEqual(['1234', '王小明', '研發一部']);
  });

  it('上傳的檔案（readUploadedCsv）也保留空白列', async () => {
    const form = new FormData();
    form.append('file', new File([utf8('姓名,部門\r\n王小明,研發一部\r\n,\r\n李美華,業務部\r\n')], 'roster.csv', { type: 'text/csv' }));
    const rows = await readUploadedCsv(new Request('http://localhost:3000/api/employees/import', { method: 'POST', body: form }));
    expect(lineOf(rows, 2)).toEqual(['王小明', '研發一部']);
    expect(isBlank(lineOf(rows, 3))).toBe(true);
    expect(lineOf(rows, 4)).toEqual(['李美華', '業務部']);
  });
});

describe('normalizeHeader（表頭比對）', () => {
  it('去掉前後空白（通訊錄的「姓名」欄名前有一個空白，EMP-Q02）', () => {
    expect(normalizeHeader(' 姓名')).toBe('姓名');
    expect(normalizeHeader('部門 ')).toBe('部門');
  });

  it('去掉全形空白', () => {
    expect(normalizeHeader('　姓名　')).toBe('姓名');
    expect(normalizeHeader('部　門')).toBe('部門');
  });

  it('去掉 BOM', () => {
    expect(normalizeHeader('﻿分機')).toBe('分機');
  });

  it('其他字元不變', () => {
    expect(normalizeHeader('單位／頭銜')).toBe('單位／頭銜');
    expect(normalizeHeader('組別')).toBe('組別');
  });
});

describe('readUploadedCsv（上傳檔案）', () => {
  const upload = (file?: File) => {
    const form = new FormData();
    if (file) form.append('file', file);
    return new Request('http://localhost:3000/api/employees/import', { method: 'POST', body: form });
  };
  const csvFile = (bytes: Uint8Array<ArrayBuffer>, name = 'roster.csv') => new File([bytes], name, { type: 'text/csv' });

  it('讀出 UTF-8 含 BOM 的檔案', async () => {
    await expect(readUploadedCsv(upload(csvFile(withBom(utf8(SAMPLE)))))).resolves.toEqual(SAMPLE_ROWS);
  });

  it('讀出 Big5 的檔案', async () => {
    await expect(readUploadedCsv(upload(csvFile(big5(SAMPLE))))).resolves.toEqual(SAMPLE_ROWS);
  });

  it('沒選檔案：「請選擇要匯入的檔案。」（EMP-R47、EMP-AC59）', async () => {
    const error = await readUploadedCsv(upload()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', fields: { file: '請選擇要匯入的檔案。' } });
  });

  it('超過 1 MB：拒絕（回 400，不是系統錯誤）', async () => {
    const tooLarge = new Uint8Array(IMPORT_MAX_BYTES + 1).fill(0x61);
    const error = await readUploadedCsv(upload(csvFile(tooLarge))).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(errorStatus[(error as AppError).code]).toBe(400);
  });

  it('剛好 1 MB 可以讀', async () => {
    expect(IMPORT_MAX_BYTES).toBeGreaterThanOrEqual(1_000_000);
    const exact = utf8('a,b\n'.repeat(Math.floor(IMPORT_MAX_BYTES / 4)) + 'c'.repeat(IMPORT_MAX_BYTES % 4));
    expect(exact.byteLength).toBe(IMPORT_MAX_BYTES);
    const rows = await readUploadedCsv(upload(csvFile(exact)));
    expect(rows[0]).toEqual(['a', 'b']);
  });

  it.each(['roster.xlsx', 'roster.txt', 'roster'])('副檔名不是 .csv（%s）：拒絕（回 400，不是系統錯誤）', async (name) => {
    const error = await readUploadedCsv(upload(csvFile(utf8(SAMPLE), name))).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(errorStatus[(error as AppError).code]).toBe(400);
  });
});
