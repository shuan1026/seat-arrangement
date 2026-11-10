// 編輯者 email 的規則：docs/spec/permissions.md PRM-R02（INITIAL_EDITOR_EMAILS 以逗號分隔，不是公司網域或格式不對的略過）、
// PRM-R03（去掉前後空白、轉小寫後再比對與儲存）、PRM-R08（空白、格式、非公司網域的欄位錯誤文案）、第 4.1 節文案；
// PRM-AC01、PRM-AC06、PRM-AC07；docs/architecture.md 第 11.5 節（domain/editors.ts：前端欄位驗證、API 的 zod schema 與
// INITIAL_EDITOR_EMAILS 的解析共用）。
//
// 假設的介面（src/domain/editors.ts，純函式，不讀環境變數）：
//   export function normalizeEmail(raw: string): string;
//     去掉前後空白（含全形空白）、英文字母轉小寫。
//   export function editorEmailError(raw: string, domain: string): string | null;
//     依序檢查：空白 →「請輸入 email。」；不是 email 格式 →「請輸入正確的 email。」；網域不是 domain →「只能新增公司帳號（@program.com.tw）。」；
//     都通過回 null。比對前先 normalizeEmail，所以網域不分大小寫。domain 是 ALLOWED_EMAIL_DOMAIN（program.com.tw）。
//   export function parseInitialEditorEmails(raw: string | undefined, domain: string): string[];
//     以逗號分隔，每一個 normalizeEmail 後只留格式正確、網域等於 domain 的；去掉重複，保留第一次出現的順序。
import { describe, expect, it } from 'vitest';
import { editorEmailError, normalizeEmail, parseInitialEditorEmails } from '@/domain/editors';

const DOMAIN = 'program.com.tw';
const REQUIRED = '請輸入 email。';
const FORMAT = '請輸入正確的 email。';
const NOT_COMPANY = '只能新增公司帳號（@program.com.tw）。';

describe('normalizeEmail（PRM-R03）', () => {
  it.each([
    [' Jia@Program.com.tw ', 'jia@program.com.tw'],
    ['A@PROGRAM.COM.TW', 'a@program.com.tw'],
    ['\tyi@program.com.tw\n', 'yi@program.com.tw'],
    ['　bing@program.com.tw　', 'bing@program.com.tw'],
    ['jia@program.com.tw', 'jia@program.com.tw'],
  ])('「%s」→「%s」', (raw, expected) => {
    expect(normalizeEmail(raw)).toBe(expected);
  });

  it('「A@Program.com.tw」和「a@program.com.tw」是同一個人', () => {
    expect(normalizeEmail('A@Program.com.tw')).toBe(normalizeEmail('a@program.com.tw'));
  });
});

describe('editorEmailError：新增編輯者的欄位錯誤（PRM-R08、PRM-AC06）', () => {
  it.each(['', '   ', '　'])('空白「%s」→「請輸入 email。」', (raw) => {
    expect(editorEmailError(raw, DOMAIN)).toBe(REQUIRED);
  });

  it.each(['abc', 'abc@', '@program.com.tw', 'a b@program.com.tw', 'jia@@program.com.tw', 'jia.program.com.tw'])(
    '不是 email 格式「%s」→「請輸入正確的 email。」',
    (raw) => {
      expect(editorEmailError(raw, DOMAIN)).toBe(FORMAT);
    },
  );

  it.each(['c@gmail.com', 'jia@sub.program.com.tw', 'jia@program.com.tw.example.com', 'jia@evilprogram.com.tw'])(
    '網域不是公司網域「%s」→「只能新增公司帳號（@program.com.tw）。」',
    (raw) => {
      expect(editorEmailError(raw, DOMAIN)).toBe(NOT_COMPANY);
    },
  );

  it.each(['jia@program.com.tw', ' Jia@PROGRAM.com.tw ', 'first.last@program.com.tw', 'BING@Program.Com.Tw'])(
    '公司帳號「%s」沒有錯誤（網域不分大小寫，前後空白不算）',
    (raw) => {
      expect(editorEmailError(raw, DOMAIN)).toBeNull();
    },
  );

  it('驗收條件 PRM-AC06 的順序：空白、「abc」、「c@gmail.com」各顯示對應的錯誤', () => {
    expect(['', 'abc', 'c@gmail.com'].map((raw) => editorEmailError(raw, DOMAIN))).toEqual([REQUIRED, FORMAT, NOT_COMPANY]);
  });
});

describe('parseInitialEditorEmails：INITIAL_EDITOR_EMAILS（PRM-R02、PRM-AC01）', () => {
  it('「 Jia@program.com.tw ,yi@program.com.tw,x@gmail.com,abc」→ 只有甲、乙，轉成小寫；另外兩個略過', () => {
    expect(parseInitialEditorEmails(' Jia@program.com.tw ,yi@program.com.tw,x@gmail.com,abc', DOMAIN)).toEqual([
      'jia@program.com.tw',
      'yi@program.com.tw',
    ]);
  });

  it.each<[string, string | undefined]>([
    ['沒有設定', undefined],
    ['空字串', ''],
    ['只有逗號與空白', ' , ,, '],
  ])('%s → 沒有任何 email', (_label, raw) => {
    expect(parseInitialEditorEmails(raw, DOMAIN)).toEqual([]);
  });

  it('全部都不是公司網域或格式不對 → 沒有任何 email', () => {
    expect(parseInitialEditorEmails('x@gmail.com,abc,@program.com.tw', DOMAIN)).toEqual([]);
  });

  it('同一個人寫兩次（大小寫不同）只算一位，保留第一次出現的順序', () => {
    expect(parseInitialEditorEmails('yi@program.com.tw,jia@program.com.tw, JIA@Program.com.tw ,YI@program.com.tw', DOMAIN)).toEqual([
      'yi@program.com.tw',
      'jia@program.com.tw',
    ]);
  });

  it('只有一位時不需要逗號', () => {
    expect(parseInitialEditorEmails('bing@program.com.tw', DOMAIN)).toEqual(['bing@program.com.tw']);
  });
});
