// 通訊錄 CSV 的虛構測試資料（docs/spec/employees.md 第 3.8 節、EMP-R45 的範本欄位）。
// - rosterRow：組出 src/server/csv.ts parseCsv 之後的一列（字串陣列），給 roster-import 的單元測試。
// - rosterCsv：組出上傳用的 CSV 文字（CRLF，和目前通訊錄匯出檔相同，EMP-Q02），給整合測試與 E2E。
// 只用虛構的姓名、分機與電話。用相對路徑引用，E2E（Playwright）也能載入。
import { ROSTER_TEMPLATE_HEADER } from '../../src/contracts/employees';

export type RosterColumn = (typeof ROSTER_TEMPLATE_HEADER)[number];
/** 一列的內容，以表頭文字為鍵；也可以放範本以外的欄名（例如「單位」） */
export type RosterRecord = { [K in RosterColumn]?: string } & { [column: string]: string | undefined };

/** 範本表頭：分機、姓名、英文名、手機號碼、部門、地區、辦公室、代接群組、組別 */
export const TEMPLATE_HEADER: readonly string[] = [...ROSTER_TEMPLATE_HEADER];

/** 虛構的手機號碼與代接群組：匯入後不能出現在任何地方（EMP-R56、EMP-AC73） */
export const FAKE_MOBILE = '0900-000-111';
export const FAKE_PICKUP_GROUP = '測試代接一組';

/**
 * 一位員工的列。人員列一定帶英文名：英文名空白的列會被當成一般部門裡的設備列略過（EMP-R51、D-012）。
 */
export const rosterPerson = (name: string, department: string, extra: RosterRecord = {}): RosterRecord => ({
  分機: '1000',
  姓名: name,
  英文名: 'Tester',
  手機號碼: FAKE_MOBILE,
  部門: department,
  地區: '台北',
  辦公室: '測試辦公室',
  代接群組: FAKE_PICKUP_GROUP,
  組別: '',
  ...extra,
});

/** 總機資訊列：姓名空白，分機欄寫了多行的總機名稱與電話（EMP-R46、EMP-R49、EMP-AC62） */
export const SWITCHBOARD_ROW: RosterRecord = {
  分機: '測試總機\n台北 02-0000-0000\n台中 04-0000-0000',
};

/** 依表頭排出一列；表頭沒有的欄位不輸出，記錄沒有的欄位是空字串 */
export function rosterRow(record: RosterRecord, header: readonly string[] = TEMPLATE_HEADER): string[] {
  return header.map((h) => record[h.trim()] ?? '');
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** 組出 CSV 文字：第一列是表頭，換行用 CRLF */
export function rosterCsv(records: readonly RosterRecord[], header: readonly string[] = TEMPLATE_HEADER): string {
  const lines = [header.map(csvCell).join(','), ...records.map((r) => rosterRow(r, header).map(csvCell).join(','))];
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * 目前公司通訊錄匯出檔的表頭（EMP-R62、EMP-Q02）：第一欄沒有欄名（序號）、「姓名」欄名前有一個空白、沒有「組別」欄。
 * 序號欄在記錄裡的鍵是空字串 ''（見 withSerial）。
 */
export const ADDRESS_BOOK_HEADER: readonly string[] = ['', '分機', ' 姓名', '英文名', '手機號碼', '部門', '地區', '辦公室', '代接群組'];

/** 給每一列加上序號欄的值（從 start 起算），模擬通訊錄匯出檔的第一欄 */
export const withSerial = (records: readonly RosterRecord[], start = 901): RosterRecord[] =>
  records.map((r, i) => ({ ...r, '': String(start + i) }));

/** 範本的欄位順序打亂（EMP-R62：欄位順序不限） */
export const SHUFFLED_HEADER: readonly string[] = ['組別', '部門', '姓名', '代接群組', '分機', '辦公室', '英文名', '地區', '手機號碼'];

/** 範本表頭少了某一欄（EMP-AC60） */
export const headerWithout = (column: RosterColumn): string[] => TEMPLATE_HEADER.filter((h) => h !== column);

/** 範本表頭把某一欄改名（EMP-AC60：「部門」改成「單位」） */
export const headerRenamed = (column: RosterColumn, to: string): string[] =>
  TEMPLATE_HEADER.map((h) => (h === column ? to : h));
