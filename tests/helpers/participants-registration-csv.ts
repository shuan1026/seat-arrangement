// 虛構的 Google 表單尾牙報名表（docs/spec/participants.md PPL-R66、PPL-R67、第 5.7 節）。
// 表頭照 PPL-R66 表中「實際表頭」的文字：「尾⽛」用康熙部首的異體字 ⽛（U+2F5B），另有時間戳記、電子郵件地址、
// 不參加理由與「第 {n} 欄」這些不讀的欄位。只用虛構的姓名、部門與電子郵件（example.com）。
// 單元測試（registration-import）、整合測試（匯入 API）與 E2E（匯入對話框）共用，所以不引用任何伺服器程式。

/** ⽛（U+2F5B，康熙部首「牙」）：實際表頭「尾⽛」用的相容字元，正規化（NFKC）後是「牙」 */
export const TOOTH_RADICAL = '⽛';

/** 報名表的表頭（PPL-R66 表中的實際表頭；PPL-R67 不讀的欄位也放進來，模擬原始檔案） */
export const REGISTRATION_HEADERS = {
  timestamp: '時間戳記',
  email: '電子郵件地址',
  name: '您的名字 ( 請填寫本名 )',
  department: '部門',
  attending: `是否會參加本次尾${TOOTH_RADICAL}？`,
  reason: `請填寫不參加尾${TOOTH_RADICAL}理由`,
  dependent: '是否攜帶眷屬 ？',
  childSeat: '是否需要兒童座椅  ？',
  diet: '請問您的飲食習慣',
  meatOrVeg: '請問您是吃葷還是吃素？',
  dependentDiet: '攜帶眷屬的飲食習慣',
  note: '備註',
  extra: '第 13 欄',
} as const;

export type RegistrationColumn = keyof typeof REGISTRATION_HEADERS;
export type RegistrationHeaders = Record<RegistrationColumn, string>;

/** 同一組表頭，半形空白全部換成全形空白（PPL-R66：比對前去掉半形與全形空白） */
export const FULL_WIDTH_HEADERS: RegistrationHeaders = Object.fromEntries(
  Object.entries(REGISTRATION_HEADERS).map(([key, text]) => [key, text.replace(/ /g, '　')]),
) as RegistrationHeaders;

/** PPL-R66 表中必要的欄位（「本人葷素」可以不存在，PPL-R68） */
export const REQUIRED_COLUMNS: readonly RegistrationColumn[] = [
  'name',
  'department',
  'attending',
  'dependent',
  'childSeat',
  'diet',
  'dependentDiet',
  'note',
];

/** 虛構的表單匯出欄位順序（實際順序不影響匯入，PPL-R66） */
export const FORM_COLUMNS: readonly RegistrationColumn[] = [
  'timestamp',
  'email',
  'name',
  'department',
  'attending',
  'reason',
  'dependent',
  'childSeat',
  'diet',
  'meatOrVeg',
  'dependentDiet',
  'note',
  'extra',
];

/** 一列回答；沒給的欄位是空白（時間戳記與電子郵件自動補虛構值） */
export type RegistrationAnswer = { name: string } & Partial<Record<Exclude<RegistrationColumn, 'name'>, string>>;

const SHORTHAND: readonly RegistrationColumn[] = [
  'name',
  'department',
  'attending',
  'dependent',
  'childSeat',
  'diet',
  'dependentDiet',
  'note',
];

/**
 * 規格第 5.7 節的簡寫：「名字／部門／是否參加／是否攜帶眷屬／是否需要兒童座椅／本人飲食習慣／眷屬飲食習慣／備註」，
 * 後面沒寫的欄位是空白。extra 可以再指定其他欄位（例如本人葷素、不參加理由）。
 */
export function answer(shorthand: string, extra: Partial<Record<RegistrationColumn, string>> = {}): RegistrationAnswer {
  const parts = shorthand.split('／');
  const out: Partial<Record<RegistrationColumn, string>> = {};
  SHORTHAND.forEach((column, i) => {
    out[column] = parts[i] ?? '';
  });
  return { ...out, ...extra, name: extra.name ?? out.name ?? '' };
}

/** 第 i 列（從 1 起算）的虛構電子郵件 */
export const fakeEmail = (i: number) => `form-user-${i}@example.com`;
/** 第 i 列（從 1 起算）的虛構時間戳記 */
export const fakeTimestamp = (i: number) => `2026/10/01 上午 9:${String(i % 60).padStart(2, '0')}:17`;

export type RegistrationSheetOptions = {
  /** 欄位與順序，預設 FORM_COLUMNS */
  columns?: readonly RegistrationColumn[];
  /** 表頭文字，預設 REGISTRATION_HEADERS */
  headers?: RegistrationHeaders;
};

/** 表頭加上每一列回答的二維陣列（和 parseCsv 的輸出相同形狀；格子內容原樣保留，不去空白） */
export function registrationRows(
  answers: readonly RegistrationAnswer[],
  { columns = FORM_COLUMNS, headers = REGISTRATION_HEADERS }: RegistrationSheetOptions = {},
): string[][] {
  const header = columns.map((column) => headers[column]);
  const body = answers.map((a, i) =>
    columns.map((column) => {
      const value = (a as Partial<Record<RegistrationColumn, string>>)[column];
      if (value !== undefined) return value;
      if (column === 'timestamp') return fakeTimestamp(i + 1);
      if (column === 'email') return fakeEmail(i + 1);
      return '';
    }),
  );
  return [header, ...body];
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** 二維陣列轉成 CSV 文字（CRLF 換行，和 Google 表單匯出相同） */
export const toCsvText = (rows: readonly (readonly string[])[]): string =>
  rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** 報名表 CSV 文字（UTF-8；要模擬含 BOM 的檔案時在上傳時加上 ﻿） */
export const registrationCsv = (answers: readonly RegistrationAnswer[], options?: RegistrationSheetOptions): string =>
  toCsvText(registrationRows(answers, options));

/** 員工名單的通訊錄 CSV（不是報名表，PPL-AC63） */
export const ROSTER_CSV_ROWS: string[][] = [
  ['分機', '姓名', '英文名', '手機號碼', '部門', '地區', '辦公室', '代接群組', '組別'],
  ['1234', '王小明', 'Ming', '0900-000-000', '研發一部', '台北', '總部', '', '前端組'],
];
export const ROSTER_CSV = toCsvText(ROSTER_CSV_ROWS);

/** 錯誤清單的原因（第 4.4 節，PPL-Q26 的目前假設） */
export const ISSUE_REASON = {
  notFound: (name: string) => `員工名單上找不到 ${name}。`,
  ambiguous: (name: string) => `員工名單上有多位 ${name}，部門也無法判斷是哪一位。`,
  notAttending: (name: string) => `${name} 已報名，但最後一次填寫不參加；要取消請到參與人員手動取消報名。`,
  noDependent: (name: string) => `${name} 已有眷屬，但最後一次填寫沒有攜帶眷屬；要移除請到參與人員手動刪除眷屬。`,
} as const;
