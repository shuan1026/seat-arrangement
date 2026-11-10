// 自動排座 5.2 節的測試資料：保留 2026 年尾牙報名表的部門與組別結構（docs/spec/auto-arrange.md 第 5.2 節），姓名全部虛構。
// - 員工名單 14 個部門、20 組；參與人員：員工 167 位、眷屬 44 位、外部貴賓 12 位；沒有工作人員。
// - 部門、組別與人員依規格表的順序加入員工名單。規格表的符號：「員」是沒有眷屬的員工，「員眷」是員工與緊接在後的眷屬，
//   「×n」是連續 n 個相同的項目。
// - 員工姓名「{部門}-{組別}-員工NN」，沒有組別時「{部門}-員工NN」；眷屬「{員工姓名}_眷屬」；外部貴賓「外部貴賓NN」。
// - 規格說未報名的 15 位員工不影響結果、可以省略。這裡仍放 15 位未報名的員工（姓名「…-未報名NN」），都排在同部門同組別
//   第一位已報名的員工後面（另一位是軟體開發部沒有組別的員工），不改變部門與組別第一次出現的先後，用來確認沒報名的人不會被排。
// - 30 桌一開始都是空桌；A1、B1 桌「主桌」，A3、B3 桌「供應商」，A2 桌「客戶貴賓」，這 5 桌都沒有人（D-019 的桌號；
//   內部編號分別是 2、1、17、12、22，對應見 tests/helpers/table-codes.ts）。
// - 223 位參與人員全部未入座。
import { dep, Scenario } from './auto-arrange-scenario';
import { idOfCode } from './table-codes';

export type Group2026 = { department: string; team: string | null; pattern: string };

/** 規格 5.2 節「部門與組別」表，依表中順序（員工名單順序） */
export const GROUPS_2026: readonly Group2026[] = [
  { department: '總經理室', team: null, pattern: '員×2' },
  { department: '稽核室', team: null, pattern: '員' },
  { department: '財務會計部', team: null, pattern: '員×4' },
  { department: '經營企劃室', team: null, pattern: '員、員眷、員×2、員眷、員×2' },
  { department: '工程服務部', team: '系統維運組', pattern: '員×3、員眷、員×7' },
  { department: '工程服務部', team: '中南區工服組', pattern: '員眷×3' },
  { department: '工程服務部', team: 'MIS', pattern: '員眷、員、員眷' },
  { department: '工程服務部', team: '北區工服組', pattern: '員×5' },
  { department: '工程服務部', team: null, pattern: '員眷、員' },
  { department: '資材運籌部', team: null, pattern: '員×3、員眷、員、員眷×3' },
  { department: '公共自行車事業部', team: null, pattern: '員、員眷、員×7、員眷、員×2' },
  { department: '智慧自行車事業部', team: null, pattern: '員眷×3、員、員眷、員' },
  { department: '軟體開發部', team: '嵌入式軟體開發組', pattern: '員、員眷、員×3' },
  { department: '軟體開發部', team: '前端', pattern: '員眷×2、員×4' },
  { department: '軟體開發部', team: '後端一組', pattern: '員×7、員眷、員' },
  { department: '軟體開發部', team: '手機軟體開發組', pattern: '員×2、員眷、員' },
  { department: '軟體開發部', team: '後端二組', pattern: '員、員眷、員' },
  { department: '智慧駐車事業部', team: null, pattern: '員×9' },
  { department: '半導體事業部', team: null, pattern: '員×3、員眷×4、員×2' },
  { department: '硬體開發部', team: '韌體設計組', pattern: '員×7' },
  { department: '硬體開發部', team: '硬體設計組', pattern: '員、員眷×3、員、員眷、員×2' },
  { department: '硬體開發部', team: '機構設計組', pattern: '員眷、員' },
  { department: '硬體開發部', team: null, pattern: '員' },
  { department: 'AI跨域市場中心', team: 'devops', pattern: '員×4' },
  { department: 'AI跨域市場中心', team: 'AI發展中心', pattern: '員×2' },
  { department: 'AI跨域市場中心', team: '服務設計組', pattern: '員×3、員眷' },
  { department: 'AI跨域市場中心', team: '數據組', pattern: '員、員眷、員×2' },
  { department: 'AI跨域市場中心', team: '行銷', pattern: '員、員眷' },
  { department: 'AI跨域市場中心', team: null, pattern: '員眷×3、員' },
  { department: '測試工程部', team: '整合測試組', pattern: '員×2、員眷、員×4' },
  { department: '測試工程部', team: '自動化測試組', pattern: '員×7' },
  { department: '測試工程部', team: '維修', pattern: '員眷×2、員×2、員眷' },
  { department: '測試工程部', team: null, pattern: '員' },
];

/** 有備註名稱的桌（5 桌，都沒有人）：規格寫桌號，這裡是內部編號（D-019） */
export const NOTE_TABLES_2026: Readonly<Record<number, string>> = {
  [idOfCode('B1')]: '主桌', // 1
  [idOfCode('A1')]: '主桌', // 2
  [idOfCode('B3')]: '供應商', // 12
  [idOfCode('A3')]: '供應商', // 17
  [idOfCode('A2')]: '客戶貴賓', // 22
};

export const GUEST_COUNT_2026 = 12;
export const UNREGISTERED_COUNT_2026 = 15;

/** 規格表的寫法：「工程服務部／中南區工服組」；沒有組別時「工程服務部（無組別）」 */
export const groupLabel = (department: string, team: string | null): string =>
  team ? `${department}／${team}` : `${department}（無組別）`;

/** 「員×3、員眷、員×7」→ 每位員工是否帶眷屬：[false, false, false, true, false × 7] */
export function expandPattern(pattern: string): boolean[] {
  return pattern.split('、').flatMap((token) => {
    const m = /^(員眷|員)(?:×(\d+))?$/.exec(token.trim());
    if (!m) throw new Error(`看不懂的人員寫法：${token}`);
    return Array<boolean>(Number(m[2] ?? 1)).fill(m[1] === '員眷');
  });
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 員工姓名的開頭：「{部門}-{組別}」或「{部門}」 */
const nameBase = (g: Pick<Group2026, 'department' | 'team'>) => (g.team ? `${g.department}-${g.team}` : g.department);

/** 第 n 位員工（1 起算）的虛構姓名 */
export const memberName2026 = (department: string, team: string | null, n: number): string =>
  `${nameBase({ department, team })}-員工${pad(n)}`;

export type Fixture2026 = {
  scenario: Scenario;
  /** 參與人員的顯示名稱 → 規格表的「部門／組別」或「部門（無組別）」；眷屬跟著所屬員工 */
  groupOf: ReadonlyMap<string, string>;
  /** 每一組（含無組別）依順序的人員顯示名稱 */
  members: ReadonlyMap<string, readonly string[]>;
  /** 外部貴賓的顯示名稱 */
  guests: readonly string[];
};

export function buildFixture2026(): Fixture2026 {
  const s = new Scenario();
  const groupOf = new Map<string, string>();
  const members = new Map<string, string[]>();
  let unregistered = 0;

  GROUPS_2026.forEach((g, index) => {
    const label = groupLabel(g.department, g.team);
    const names: string[] = [];
    expandPattern(g.pattern).forEach((withDependent, i) => {
      const name = memberName2026(g.department, g.team, i + 1);
      s.addEmployee(name, g.department, g.team, { dependent: withDependent });
      names.push(name);
      if (withDependent) names.push(dep(name));
      // 前 14 組各放一位未報名的員工，排在這一組第一位員工後面
      if (i === 0 && index < UNREGISTERED_COUNT_2026 - 1) {
        unregistered += 1;
        s.addEmployee(`${nameBase(g)}-未報名${pad(unregistered)}`, g.department, g.team, { registered: false });
      }
    });
    // 軟體開發部沒有組別的員工都沒報名（規格表沒有列出這個組合）
    if (g.department === '軟體開發部' && g.team === '後端二組') {
      unregistered += 1;
      s.addEmployee(`軟體開發部-未報名${pad(unregistered)}`, '軟體開發部', null, { registered: false });
    }
    for (const name of names) groupOf.set(name, label);
    members.set(label, names);
  });

  const guests = Array.from({ length: GUEST_COUNT_2026 }, (_, i) => `外部貴賓${pad(i + 1)}`);
  for (const name of guests) s.addGuest(name);
  for (const [id, noteName] of Object.entries(NOTE_TABLES_2026)) s.note(Number(id), noteName);

  return { scenario: s, groupOf, members, guests };
}
