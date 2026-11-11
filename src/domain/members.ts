// 權限名單的規則（D-021、D-026；docs/spec/permissions.md PRM-R02、PRM-R03、PRM-R08；docs/architecture.md 第 11.5 節）。
// 前端的欄位驗證、API 的檢查與 INITIAL_EDITOR_EMAILS 的解析共用這一份。純函式，不讀環境變數；公司網域由呼叫端傳入。

/** 規格寫明的公司網域（README AUTH-R02）；伺服器以環境變數 ALLOWED_EMAIL_DOMAIN 為準，前端預設用這個 */
export const COMPANY_EMAIL_DOMAIN = 'program.com.tw';

/** 權限名單上的兩種權限（D-026）；選單的選項依這個順序，新增時預設檢視者 */
export const MEMBER_ROLES = ['VIEWER', 'EDITOR'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export const DEFAULT_MEMBER_ROLE: MemberRole = 'VIEWER';

/** 畫面上的權限名稱（permissions.md 第 4.1 節） */
export const roleLabel = (role: MemberRole): string => (role === 'EDITOR' ? '編輯者' : '檢視者');

/** 去掉前後空白（含全形空白、換行）、英文字母轉小寫後再比對與儲存（PRM-R03） */
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

/** 一個 @、前後都有內容、網域至少有一個點，中間沒有空白 */
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const domainOf = (email: string): string => email.slice(email.lastIndexOf('@') + 1);

/** 網域等於公司網域的 email（不含子網域）；比對前先正規化 */
export function isCompanyEmail(raw: string, domain: string): boolean {
  const email = normalizeEmail(raw);
  return EMAIL_FORMAT.test(email) && domainOf(email) === normalizeEmail(domain);
}

/** 新增帳號時 email 欄位的錯誤（PRM-R08、第 4.1 節文案）；沒有錯誤時是 null。「已經在名單上」要看名單，由呼叫端判斷 */
export function memberEmailError(raw: string, domain: string): string | null {
  const email = normalizeEmail(raw);
  if (!email) return '請輸入 email。';
  if (!EMAIL_FORMAT.test(email)) return '請輸入正確的 email。';
  if (domainOf(email) !== normalizeEmail(domain)) return `只能新增公司帳號（@${normalizeEmail(domain)}）。`;
  return null;
}

/** 「{email} 已經是編輯者。」或「{email} 已經是檢視者。」，依名單上的權限（PRM-R08、PRM-R10） */
export const alreadyMemberMessage = (email: string, role: MemberRole): string => `${normalizeEmail(email)} 已經是${roleLabel(role)}。`;

/**
 * INITIAL_EDITOR_EMAILS（以逗號分隔）：每一個正規化後只留格式正確、網域等於公司網域的；
 * 去掉重複，保留第一次出現的順序（PRM-R02）。
 */
export function parseInitialEditorEmails(raw: string | undefined, domain: string): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const email = normalizeEmail(part);
    if (email && isCompanyEmail(email, domain) && !out.includes(email)) out.push(email);
  }
  return out;
}
