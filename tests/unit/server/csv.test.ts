// @vitest-environment node
// CSV 匯入的共用處理：docs/architecture.md 第 4 節（UTF-8 含 BOM 或 Big5）、第 11.1 節（上限 1 MB）；
// docs/spec/employees.md EMP-R46（儲存格內換行）、EMP-R47（沒選檔案）、EMP-R49（整列空白的分隔列）、EMP-Q02（表頭空白）；
// participants.md PPL-R65、PPL-AC62（報名表也是 CSV、沒選檔案的文案相同）、PPL-Q01（報名表是 UTF-8，可以有 BOM）。
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

  it('略過完全空白的列：空行、只有逗號、只有空白（EMP-R49）', () => {
    const text = '分機,姓名,部門\n\n1234,王小明,研發一部\n,,\n  ,  ,  \n5678,李美華,業務部\n\n';
    expect(parseCsv(text)).toEqual(SAMPLE_ROWS);
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
