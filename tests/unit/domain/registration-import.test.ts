// 報名表匯入：解析 Google 表單尾牙報名表的原檔，對應員工名單，產生新增／更新計畫與需要處理的人。
// 依據：D-010；docs/spec/participants.md 第 3.6 節（PPL-R64～R74、PPL-R79～R85）、第 4.4 節（錯誤清單的原因）、
// 第 5.7 節（PPL-AC63～AC70、PPL-AC78～AC83）；待確認 PPL-Q01、Q03、Q20、Q22～Q26 依「目前已知」欄的假設（D-008）；
// docs/architecture.md 第 11.2 節（seed 與參與人員頁的匯入共用 registration-import.ts）。
// 報名表都是虛構資料（tests/helpers/participants-registration-csv.ts），表頭含異體字 ⽛ 與空白。
//
// 假設的介面（src/domain/registration-import.ts，純函式）：
//
//   parseRegistrations(
//     rows: string[][],                       // CSV 解析後的二維陣列，第一列是表頭；列號從 1 起算（表頭是第 1 列）
//     employees: readonly Employee[],         // 員工名單
//     participants?: readonly Participant[],  // 目前的參與人員；省略時視為還沒有人報名（seed）
//   ): RegistrationPlan
//
//   type RegistrationPlan =
//     | { ok: false; error: 'FORMAT' }        // 表頭缺少必要的欄位，整份不匯入（PPL-R68）
//     | { ok: true; create: RegistrationCreate[]; update: RegistrationUpdate[]; issues: RegistrationIssue[] };
//
//   type RegistrationDependent = { childSeat: boolean; vegetarian: boolean };
//   // 還沒報名的員工：新增一位員工（PPL-R72），攜帶眷屬時同時新增一位眷屬（PPL-R73）
//   type RegistrationCreate = {
//     row: number; employeeId: number; vegetarian: boolean; note: string | null;
//     dependent: RegistrationDependent | null;
//   };
//   // 已報名的員工：依表單更新（PPL-R80、R81、R83）
//   type RegistrationUpdate = {
//     row: number; participantId: number; vegetarian: boolean;
//     note: string | null;                    // 匯入後的備註：系統已有備註時保留，沒有時才用表單的備註
//     dependent: (RegistrationDependent & { participantId: number | null }) | null;
//                                             // null：不動眷屬；participantId 是 null：補一位；否則更新那位眷屬
//   };
//   // 需要處理的人（PPL-R71、R82、R83）；reason 是第 4.4 節的文案
//   type RegistrationIssue = { row: number; name: string; department: string; reason: string };
//
//   - row 是採用的那一列（同一人填好幾次時是最後一列）；create、update、issues 都依 row 由小到大。
//   - name、department 是表單上填的文字（去掉前後空白）。
//   - 「已匯入 {n} 位」的 n = create.length + update.length（PPL-R74，眷屬不另外計算）；「{m} 筆需要處理」的 m = issues.length。
import { describe, expect, it } from 'vitest';
import type { Employee, Participant } from '@/contracts/entities';
import {
  parseRegistrations,
  type RegistrationCreate,
  type RegistrationPlan,
  type RegistrationUpdate,
} from '@/domain/registration-import';
import {
  answer,
  fakeEmail,
  fakeTimestamp,
  FORM_COLUMNS,
  FULL_WIDTH_HEADERS,
  ISSUE_REASON,
  REGISTRATION_HEADERS,
  registrationRows,
  REQUIRED_COLUMNS,
  ROSTER_CSV_ROWS,
  TOOTH_RADICAL,
  type RegistrationAnswer,
  type RegistrationSheetOptions,
} from '../../helpers/participants-registration-csv';

const employee = (id: number, name: string, department: string, extension: string | null = null): Employee => ({
  id,
  name,
  englishName: null,
  department,
  team: null,
  extension,
  region: null,
  office: null,
  note: null,
  declined: false,
  sortOrder: id,
});

// 規格驗收條件的示範資料：王小明（研發一部，1234）、李美華（業務部，5678）、陳大文（研發一部，沒有分機）
const WANG = employee(1, '王小明', '研發一部', '1234');
const LEE = employee(2, '李美華', '業務部', '5678');
const CHEN = employee(3, '陳大文', '研發一部');
/** 員工名單另有一位同名的王小明（PPL-AC39、PPL-AC69） */
const WANG_BIZ = employee(4, '王小明', '業務部', '9999');
const ROSTER = [WANG, LEE, CHEN];

const blank: Omit<Participant, 'id' | 'kind'> = {
  employeeId: null,
  hostId: null,
  relation: null,
  guestName: null,
  organization: null,
  title: null,
  childSeat: false,
  vegetarian: false,
  note: null,
  tableId: null,
  seatOrder: null,
  createdAt: '2026-11-10T00:00:00.000Z',
};
const registered = (id: number, e: Employee, data: Partial<Participant> = {}): Participant => ({
  ...blank,
  id,
  kind: 'EMPLOYEE',
  employeeId: e.id,
  ...data,
});
const dependentOf = (id: number, hostId: number, data: Partial<Participant> = {}): Participant => ({
  ...blank,
  id,
  kind: 'DEPENDENT',
  hostId,
  ...data,
});
const guest = (id: number, guestName: string, data: Partial<Participant> = {}): Participant => ({
  ...blank,
  id,
  kind: 'GUEST',
  guestName,
  ...data,
});

type PlanOptions = { employees?: Employee[]; participants?: Participant[]; sheet?: RegistrationSheetOptions };

const plan = (answers: RegistrationAnswer[], { employees = ROSTER, participants, sheet }: PlanOptions = {}) =>
  participants === undefined
    ? parseRegistrations(registrationRows(answers, sheet), employees)
    : parseRegistrations(registrationRows(answers, sheet), employees, participants);

/** 可以匯入的結果；格式錯誤時讓測試失敗 */
function ok(result: RegistrationPlan) {
  if (!result.ok) throw new Error('應該可以匯入，結果卻是格式錯誤');
  return result;
}

const created = (row: number, employeeId: number, data: Partial<RegistrationCreate> = {}): RegistrationCreate => ({
  row,
  employeeId,
  vegetarian: false,
  note: null,
  dependent: null,
  ...data,
});

const FORMAT_ERROR = { ok: false, error: 'FORMAT' } as const;

describe('表頭辨認（PPL-R66、PPL-R68、PPL-Q22）', () => {
  it('認得實際表頭：含空白與「尾⽛」的異體字 ⽛，另有時間戳記、電子郵件等不讀的欄位', () => {
    expect(REGISTRATION_HEADERS.attending).toContain(TOOTH_RADICAL);
    expect(REGISTRATION_HEADERS.attending).not.toContain('牙');
    const result = ok(plan([answer('陳大文／研發一部／是')]));
    expect(result.create).toEqual([created(2, CHEN.id)]);
    expect(result.update).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('表頭的半形空白換成全形空白也認得', () => {
    expect(FULL_WIDTH_HEADERS.dependent).toContain('　');
    const result = ok(plan([answer('陳大文／研發一部／是／是')], { sheet: { headers: FULL_WIDTH_HEADERS } }));
    expect(result.create).toEqual([created(2, CHEN.id, { dependent: { childSeat: false, vegetarian: false } })]);
  });

  it('表頭的「尾⽛」寫成一般的「牙」也認得', () => {
    const headers = { ...REGISTRATION_HEADERS, attending: '是否會參加本次尾牙？', reason: '請填寫不參加尾牙理由' };
    expect(ok(plan([answer('陳大文／研發一部／是')], { sheet: { headers } })).create).toEqual([created(2, CHEN.id)]);
  });

  it('第一個表頭前有 BOM 也認得（PPL-Q01：UTF-8 可以有 BOM）', () => {
    const columns = FORM_COLUMNS.filter((c) => c !== 'timestamp' && c !== 'email');
    const headers = { ...REGISTRATION_HEADERS, name: `﻿${REGISTRATION_HEADERS.name}` };
    expect(columns[0]).toBe('name');
    expect(ok(plan([answer('陳大文／研發一部／是')], { sheet: { columns, headers } })).create).toEqual([
      created(2, CHEN.id),
    ]);
  });

  it('欄位順序和表單不同，也照表頭讀（PPL-AC64）', () => {
    const columns = [...FORM_COLUMNS].reverse();
    const result = ok(plan([answer('陳大文／研發一部／是／否／否／葷食')], { sheet: { columns } }));
    expect(result.create).toEqual([created(2, CHEN.id)]);
  });

  it('沒有「本人葷素」欄也可以匯入（PPL-R68）', () => {
    const columns = FORM_COLUMNS.filter((c) => c !== 'meatOrVeg');
    expect(ok(plan([answer('陳大文／研發一部／是／否／否／素食')], { sheet: { columns } })).create).toEqual([
      created(2, CHEN.id, { vegetarian: true }),
    ]);
  });

  it.each(REQUIRED_COLUMNS.map((c) => [REGISTRATION_HEADERS[c], c] as const))(
    '缺少「%s」欄：整份檔案格式錯誤，不匯入任何人（PPL-R68、PPL-AC63）',
    (_header, missing) => {
      const columns = FORM_COLUMNS.filter((c) => c !== missing);
      expect(plan([answer('陳大文／研發一部／是')], { sheet: { columns } })).toEqual(FORMAT_ERROR);
    },
  );

  it('員工名單的通訊錄不是報名表：格式錯誤（PPL-AC63）', () => {
    expect(parseRegistrations(ROSTER_CSV_ROWS, ROSTER)).toEqual(FORMAT_ERROR);
  });

  it('空檔案：格式錯誤', () => {
    expect(parseRegistrations([], ROSTER)).toEqual(FORMAT_ERROR);
  });

  it('只有表頭、沒有任何回答：可以匯入，什麼都不做', () => {
    expect(plan([])).toEqual({ ok: true, create: [], update: [], issues: [] });
  });

  it('不讀時間戳記、電子郵件、不參加理由與「第 {n} 欄」，計畫裡沒有這些內容（PPL-R67）', () => {
    const result = ok(plan([answer('陳大文／研發一部／是', { reason: '出差', extra: '其他欄位的內容' })]));
    expect(result.create).toEqual([created(2, CHEN.id)]);
    const text = JSON.stringify(result);
    for (const secret of [fakeEmail(1), fakeTimestamp(1), '出差', '其他欄位的內容']) {
      expect(text).not.toContain(secret);
    }
  });

  it('列的格子比表頭少時，缺的格子當作空白', () => {
    const rows = registrationRows([answer('陳大文／研發一部／是')]);
    const nameAt = FORM_COLUMNS.indexOf('name');
    const attendingAt = FORM_COLUMNS.indexOf('attending');
    const short = rows.map((row, i) => (i === 0 ? row : row.slice(0, Math.max(nameAt, attendingAt) + 1)));
    expect(ok(parseRegistrations(short, ROSTER)).create).toEqual([created(2, CHEN.id)]);
  });
});

describe('是否參加（PPL-R70、PPL-Q01）', () => {
  it.each(['是', '是，會參加', ' 是 ', '　是'])('回答「%s」算參加：新增這位員工', (reply) => {
    const result = ok(plan([answer(`陳大文／研發一部／${reply}`)]));
    expect(result.create).toEqual([created(2, CHEN.id)]);
  });

  it.each(['否', '', '不確定', '不是'])(
    '回答「%s」不算參加：還沒報名的人不新增，也不算需要處理',
    (reply) => {
      const result = ok(plan([answer(`陳大文／研發一部／${reply}`)]));
      expect(result).toEqual({ ok: true, create: [], update: [], issues: [] });
    },
  );

  it('對不到員工名單的人沒有參加：不算需要處理', () => {
    expect(ok(plan([answer('趙六／行政部／否')])).issues).toEqual([]);
  });
});

describe('對應員工名單（PPL-R71、PPL-Q03）', () => {
  it('員工名單上只有一位這個名字：直接對應，部門寫法不同或空白也一樣', () => {
    const result = ok(plan([answer('陳大文／研發部／是'), answer('李美華／／是')]));
    expect(result.create).toEqual([created(2, CHEN.id), created(3, LEE.id)]);
  });

  it('員工名單上有同名的人：用部門判斷是哪一位（PPL-AC69）', () => {
    const result = ok(plan([answer('王小明／業務部／是')], { employees: [WANG, LEE, CHEN, WANG_BIZ] }));
    expect(result.create).toEqual([created(2, WANG_BIZ.id)]);
    expect(result.issues).toEqual([]);
  });

  it('同名而部門對不到任何一位：不匯入，列為需要處理（PPL-AC69）', () => {
    const result = ok(plan([answer('王小明／行政部／是')], { employees: [WANG, LEE, CHEN, WANG_BIZ] }));
    expect(result.create).toEqual([]);
    expect(result.issues).toEqual([
      { row: 2, name: '王小明', department: '行政部', reason: ISSUE_REASON.ambiguous('王小明') },
    ]);
  });

  it('同名而且部門也相同：判斷不出是哪一位，列為需要處理（PPL-Q03）', () => {
    const twin = employee(5, '王小明', '研發一部', '4321');
    const result = ok(plan([answer('王小明／研發一部／是')], { employees: [WANG, LEE, CHEN, twin] }));
    expect(result.create).toEqual([]);
    expect(result.issues).toEqual([
      { row: 2, name: '王小明', department: '研發一部', reason: ISSUE_REASON.ambiguous('王小明') },
    ]);
  });

  it('員工名單上找不到：不匯入，列為需要處理，原因「員工名單上找不到 {名字}。」（PPL-AC68）', () => {
    const result = ok(plan([answer('趙六／行政部／是')]));
    expect(result.create).toEqual([]);
    expect(result.update).toEqual([]);
    expect(result.issues).toEqual([
      { row: 2, name: '趙六', department: '行政部', reason: ISSUE_REASON.notFound('趙六') },
    ]);
  });

  it('名字後面有全形空白也對應得到（PPL-AC70）', () => {
    expect(ok(plan([answer('陳大文　／研發一部／是')])).create).toEqual([created(2, CHEN.id)]);
  });

  it('名字與部門的前後與中間空白去掉後比對', () => {
    const result = ok(
      plan([answer(' 陳 大文 ／研發一部／是'), answer('王小明／ 業務 部 ／是')], {
        employees: [WANG, LEE, CHEN, WANG_BIZ],
      }),
    );
    expect(result.create).toEqual([created(2, CHEN.id), created(3, WANG_BIZ.id)]);
  });

  it('相容字元轉成一般字後比對：部門寫成「研發⼀部」（⼀ 是 U+2F00）也對應到研發一部', () => {
    const result = ok(plan([answer('王小明／研發⼀部／是')], { employees: [WANG, LEE, CHEN, WANG_BIZ] }));
    expect(result.create).toEqual([created(2, WANG.id)]);
  });

  it('外部貴賓不在員工名單：名字和外部貴賓相同仍是找不到（PPL-R79）', () => {
    const result = ok(plan([answer('趙六／行政部／是')], { participants: [guest(31, '趙六')] }));
    expect(result.create).toEqual([]);
    expect(result.update).toEqual([]);
    expect(result.issues).toEqual([
      { row: 2, name: '趙六', department: '行政部', reason: ISSUE_REASON.notFound('趙六') },
    ]);
  });
});

describe('同一人填好幾次：以最後一列為準（PPL-R69、PPL-Q24）', () => {
  it('先填攜帶眷屬、後來改成不攜帶：只新增員工，不新增眷屬（PPL-AC66）', () => {
    const result = ok(plan([answer('李美華／業務部／是／是'), answer('李美華／業務部／是／否')]));
    expect(result.create).toEqual([created(3, LEE.id)]);
    expect(result.issues).toEqual([]);
  });

  it('先填參加、後來改成不參加：不新增，也不算需要處理（PPL-AC67）', () => {
    const result = ok(plan([answer('陳大文／研發一部／是'), answer('陳大文／研發一部／否')]));
    expect(result).toEqual({ ok: true, create: [], update: [], issues: [] });
  });

  it('先填不參加、後來改成參加：新增，採用最後一列的內容', () => {
    const result = ok(
      plan([answer('陳大文／研發一部／否'), answer('陳大文／研發一部／是／否／否／素食／／最後一次的備註')]),
    );
    expect(result.create).toEqual([created(3, CHEN.id, { vegetarian: true, note: '最後一次的備註' })]);
  });

  it('對應到同一位員工就是同一人：名字只有一位時，部門寫法不同的兩列也是同一人', () => {
    const result = ok(plan([answer('陳大文／研發一部／是'), answer('陳大文／業務部／否')]));
    expect(result.create).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('名字多了空白的兩列對應到同一位員工，也是同一人', () => {
    const result = ok(plan([answer('陳大文／研發一部／是／是'), answer('陳大文　／研發一部／是／否')]));
    expect(result.create).toEqual([created(3, CHEN.id)]);
  });

  it('同名、不同部門而對應到不同員工：是兩個人，各自新增', () => {
    const result = ok(
      plan([answer('王小明／研發一部／是'), answer('王小明／業務部／是')], { employees: [WANG, LEE, CHEN, WANG_BIZ] }),
    );
    expect(result.create).toEqual([created(2, WANG.id), created(3, WANG_BIZ.id)]);
  });

  it('對不到員工名單的人以名字與部門判斷同一人：填兩次只列一筆需要處理，列號是最後一列', () => {
    const result = ok(plan([answer('趙六／行政部／是'), answer('陳大文／研發一部／是'), answer('趙六／行政部／是')]));
    expect(result.create).toEqual([created(3, CHEN.id)]);
    expect(result.issues).toEqual([
      { row: 4, name: '趙六', department: '行政部', reason: ISSUE_REASON.notFound('趙六') },
    ]);
  });

  it('對不到員工名單、名字相同但部門不同：當作兩個人，各列一筆', () => {
    const result = ok(plan([answer('趙六／行政部／是'), answer('趙六／總務部／是')]));
    expect(result.issues).toEqual([
      { row: 2, name: '趙六', department: '行政部', reason: ISSUE_REASON.notFound('趙六') },
      { row: 3, name: '趙六', department: '總務部', reason: ISSUE_REASON.notFound('趙六') },
    ]);
  });

  it('對不到員工名單的人最後一次填不參加：不算需要處理', () => {
    expect(ok(plan([answer('趙六／行政部／是'), answer('趙六／行政部／否')])).issues).toEqual([]);
  });
});

describe('新增還沒報名的員工（PPL-R72、PPL-R73、PPL-Q23、PPL-Q25）', () => {
  it('不攜帶眷屬、葷食：只新增員工，不素食、沒有備註（PPL-AC64）', () => {
    expect(ok(plan([answer('陳大文／研發一部／是／否／否／葷食')])).create).toEqual([created(2, CHEN.id)]);
  });

  it('攜帶眷屬、需要兒童座椅、兩人都吃素、有備註：員工素食與備註，眷屬兒童椅與素食（PPL-AC65）', () => {
    const result = ok(plan([answer('陳大文／研發一部／是／是／是／素食／蛋奶素／需要靠走道')]));
    expect(result.create).toEqual([
      created(2, CHEN.id, {
        vegetarian: true,
        note: '需要靠走道',
        dependent: { childSeat: true, vegetarian: true },
      }),
    ]);
  });

  it.each([
    ['素食', true],
    ['蛋奶素', true],
    ['吃素', true],
    ['全素', true],
    ['葷食', false],
    ['葷素皆可', false],
    ['不吃牛', false],
    ['', false],
  ] as const)('本人飲食習慣「%s」→ 素食：%s（含「素」而且不含「葷」）', (diet, vegetarian) => {
    expect(ok(plan([answer(`陳大文／研發一部／是／否／否／${diet}`)])).create).toEqual([
      created(2, CHEN.id, { vegetarian }),
    ]);
  });

  it('飲食習慣空白、「吃葷還是吃素」填「吃素」：標素食', () => {
    const result = ok(plan([answer('陳大文／研發一部／是', { meatOrVeg: '吃素' })]));
    expect(result.create).toEqual([created(2, CHEN.id, { vegetarian: true })]);
  });

  it('兩欄任一欄含「素」而且不含「葷」就標素食：飲食習慣「葷食」、「吃葷還是吃素」填「吃素」', () => {
    const result = ok(plan([answer('陳大文／研發一部／是／否／否／葷食', { meatOrVeg: '吃素' })]));
    expect(result.create).toEqual([created(2, CHEN.id, { vegetarian: true })]);
  });

  it.each([
    ['蛋奶素', true],
    ['葷食', false],
    ['葷素皆可', false],
    ['', false],
  ] as const)('眷屬的飲食習慣「%s」→ 眷屬素食：%s', (diet, vegetarian) => {
    const result = ok(plan([answer(`陳大文／研發一部／是／是／否／葷食／${diet}`)]));
    expect(result.create).toEqual([created(2, CHEN.id, { dependent: { childSeat: false, vegetarian } })]);
  });

  it('眷屬的素食只看眷屬的飲食習慣，不看本人的', () => {
    const result = ok(plan([answer('陳大文／研發一部／是／是／否／素食／葷食')]));
    expect(result.create).toEqual([
      created(2, CHEN.id, { vegetarian: true, dependent: { childSeat: false, vegetarian: false } }),
    ]);
  });

  it('沒有攜帶眷屬卻填需要兒童座椅：不標任何人的兒童椅，照常匯入，不算需要處理（PPL-Q25）', () => {
    const result = ok(plan([answer('陳大文／研發一部／是／否／是')]));
    expect(result.create).toEqual([created(2, CHEN.id)]);
    expect(result.issues).toEqual([]);
  });

  it('攜帶眷屬是「是」開頭的回答也算（PPL-Q01）', () => {
    const result = ok(plan([answer('陳大文／研發一部／是／是，一位／是，需要')]));
    expect(result.create).toEqual([created(2, CHEN.id, { dependent: { childSeat: true, vegetarian: false } })]);
  });

  it('備註去掉前後空白；只有空白時視為沒有備註', () => {
    const result = ok(
      plan([answer('陳大文／研發一部／是／否／否／／／  需要靠走道  '), answer('李美華／業務部／是／否／否／／／   ')]),
    );
    expect(result.create).toEqual([created(2, CHEN.id, { note: '需要靠走道' }), created(3, LEE.id)]);
  });
});

describe('員工名單上標記為不參加的員工（PPL-R72、D-014）', () => {
  const CHEN_DECLINED: Employee = { ...CHEN, declined: true };
  const DECLINED_ROSTER = [WANG, LEE, CHEN_DECLINED];

  it('填「是」：照一般報名者新增，不列為需要處理（PPL-R72）', () => {
    const result = ok(plan([answer('陳大文／研發一部／是')], { employees: DECLINED_ROSTER }));
    expect(result.create).toEqual([created(2, CHEN.id)]);
    expect(result.update).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('填「是」並攜帶眷屬、素食、備註：和還沒報名的員工完全相同（PPL-R72、PPL-R73）', () => {
    const answers = [answer('陳大文／研發一部／是／是／是／素食／蛋奶素／需要靠走道')];
    expect(ok(plan(answers, { employees: DECLINED_ROSTER }))).toEqual(ok(plan(answers)));
  });

  it('最後一次填「否」：不新增，也不算需要處理（PPL-R70）', () => {
    const result = ok(plan([answer('陳大文／研發一部／是'), answer('陳大文／研發一部／否')], { employees: DECLINED_ROSTER }));
    expect(result).toEqual({ ok: true, create: [], update: [], issues: [] });
  });

  it('還沒報名的員工填「否」：計畫裡只有新增、更新與需要處理，沒有把任何人標記為不參加（PPL-R72：不因匯入被標記）', () => {
    const result = ok(plan([answer('陳大文／研發一部／否'), answer('李美華／業務部／否')]));
    expect(result).toEqual({ ok: true, create: [], update: [], issues: [] });
  });

  it('不參加的員工和其他人混在一起：各自照規則處理', () => {
    const result = ok(
      plan([answer('陳大文／研發一部／是'), answer('李美華／業務部／是'), answer('趙六／行政部／是')], {
        employees: DECLINED_ROSTER,
      }),
    );
    expect(result.create).toEqual([created(2, CHEN.id), created(3, LEE.id)]);
    expect(result.issues).toEqual([expect.objectContaining({ row: 4, reason: ISSUE_REASON.notFound('趙六') })]);
  });
});

describe('已報名的員工（PPL-R80～R84、PPL-Q20）', () => {
  // 王小明已報名、在 B4 桌（內部編號 3）、不素食、備註「舊備註」；王小明_眷屬在 B4 桌、沒有兒童椅、素食（PPL-AC78）
  const pWang = registered(11, WANG, { tableId: 3, seatOrder: 0, vegetarian: false, note: '舊備註' });
  const pWangDependent = dependentOf(12, pWang.id, { tableId: 3, seatOrder: 1, childSeat: false, vegetarian: true });
  const pLee = registered(13, LEE, { tableId: 5, seatOrder: 0, vegetarian: true });
  const pLin = guest(14, '林董', { organization: '○○科技 董事長', tableId: 5, seatOrder: 1 });

  const updated = (row: number, participantId: number, data: Partial<RegistrationUpdate> = {}): RegistrationUpdate => ({
    row,
    participantId,
    vegetarian: false,
    note: null,
    dependent: null,
    ...data,
  });

  it('不重複新增：更新員工的素食與眷屬的兒童椅、素食；系統已有備註時保留（PPL-R80、PPL-AC78、D-013）', () => {
    // 系統已有備註時保留，不用表單的備註（D-013、PPL-R80、PPL-AC78）
    const result = ok(
      plan([answer('王小明／研發一部／是／是／是／素食／葷食／新備註')], { participants: [pWang, pWangDependent] }),
    );
    expect(result.create).toEqual([]);
    expect(result.update).toEqual([
      updated(2, pWang.id, {
        vegetarian: true,
        note: '舊備註',
        dependent: { participantId: pWangDependent.id, childSeat: true, vegetarian: false },
      }),
    ]);
    expect(result.issues).toEqual([]);
  });

  it('系統裡沒有備註：填入表單的備註（PPL-R80）', () => {
    const noNote = { ...pWang, note: null };
    const result = ok(plan([answer('王小明／研發一部／是／否／否／葷食／／新備註')], { participants: [noNote] }));
    expect(result.update).toEqual([updated(2, pWang.id, { note: '新備註' })]);
  });

  it('表單沒有備註：保留系統裡的備註', () => {
    const result = ok(plan([answer('王小明／研發一部／是')], { participants: [pWang] }));
    expect(result.update).toEqual([updated(2, pWang.id, { note: '舊備註' })]);
  });

  it('系統裡素食、這次表單填葷食：改成不素食（PPL-R80）', () => {
    const result = ok(plan([answer('李美華／業務部／是／否／否／葷食')], { participants: [pLee] }));
    expect(result.update).toEqual([updated(2, pLee.id, { vegetarian: false })]);
  });

  it('表單攜帶眷屬、系統裡還沒有眷屬：補一位眷屬（PPL-R81、PPL-AC79）', () => {
    const result = ok(plan([answer('王小明／研發一部／是／是')], { participants: [pWang] }));
    expect(result.update).toEqual([
      updated(2, pWang.id, { note: '舊備註', dependent: { participantId: null, childSeat: false, vegetarian: false } }),
    ]);
    expect(result.create).toEqual([]);
  });

  it('補的眷屬照表單標兒童椅與素食（PPL-R81、PPL-R73）', () => {
    const result = ok(plan([answer('王小明／研發一部／是／是／是／／素食')], { participants: [pWang] }));
    expect(result.update).toEqual([
      updated(2, pWang.id, { note: '舊備註', dependent: { participantId: null, childSeat: true, vegetarian: true } }),
    ]);
  });

  it('最後一次填不參加：不自動取消報名、不更新，列為需要處理（PPL-R82、PPL-AC80）', () => {
    const result = ok(
      plan([answer('王小明／研發一部／是'), answer('王小明／研發一部／否')], { participants: [pWang] }),
    );
    expect(result.create).toEqual([]);
    expect(result.update).toEqual([]);
    expect(result.issues).toEqual([
      { row: 3, name: '王小明', department: '研發一部', reason: ISSUE_REASON.notAttending('王小明') },
    ]);
  });

  it('有眷屬又最後一次填不參加：只列「改填不參加」一筆，眷屬也不動（PPL-R82）', () => {
    const result = ok(plan([answer('王小明／研發一部／否')], { participants: [pWang, pWangDependent] }));
    expect(result.update).toEqual([]);
    expect(result.issues).toEqual([
      { row: 2, name: '王小明', department: '研發一部', reason: ISSUE_REASON.notAttending('王小明') },
    ]);
  });

  it('系統有眷屬、表單最後一次沒有攜帶眷屬：不刪除眷屬，列為需要處理；員工照常更新（PPL-R83、PPL-AC81）', () => {
    const result = ok(
      plan([answer('王小明／研發一部／是／否／否／素食')], { participants: [pWang, pWangDependent] }),
    );
    expect(result.update).toEqual([updated(2, pWang.id, { vegetarian: true, note: '舊備註', dependent: null })]);
    expect(result.issues).toEqual([
      { row: 2, name: '王小明', department: '研發一部', reason: ISSUE_REASON.noDependent('王小明') },
    ]);
  });

  it('表單裡沒有的參與人員不受影響；不新增外部貴賓（PPL-R79、PPL-R84、PPL-AC82）', () => {
    const pChenStaff = registered(15, CHEN, { tableId: 0, seatOrder: 0 });
    const result = ok(
      plan([answer('陳大文／研發一部／是')], { participants: [pWang, pWangDependent, pLee, pLin, pChenStaff] }),
    );
    expect(result.create).toEqual([]);
    expect(result.update).toEqual([updated(2, pChenStaff.id)]);
    expect(result.issues).toEqual([]);
  });

  it('已報名與還沒報名的人混在一起：各自新增或更新', () => {
    const result = ok(
      plan([answer('陳大文／研發一部／是'), answer('王小明／研發一部／是'), answer('李美華／業務部／是')], {
        participants: [pWang],
      }),
    );
    expect(result.create).toEqual([created(2, CHEN.id), created(4, LEE.id)]);
    expect(result.update).toEqual([updated(3, pWang.id, { note: '舊備註' })]);
  });
});

describe('需要處理的人不影響其他人（PPL-R85、PPL-AC83）', () => {
  it('三列中一位對不到員工名單：另外兩位照常新增', () => {
    const result = ok(plan([answer('陳大文／研發一部／是'), answer('李美華／業務部／是'), answer('趙六／行政部／是')]));
    expect(result.create).toEqual([created(2, CHEN.id), created(3, LEE.id)]);
    expect(result.issues).toEqual([
      { row: 4, name: '趙六', department: '行政部', reason: ISSUE_REASON.notFound('趙六') },
    ]);
  });
});

// 列號是這一列在檔案中的列號，和用 Excel 開啟時一致：表頭是第 1 列，空白列也算一列，儲存格內的換行不另算一列（階段 3 決定）。
// rows 是 src/server/csv.ts parseCsv 的結果，空白列保留在原本的位置（[]、[''] 或每格都是空字串）；空白列沒有名字，照 PPL-R70 不處理。
describe('列號是檔案中的列號：空白列也算一列（PPL-R74 錯誤清單、PPL-Q06）', () => {
  /** 在報名表的第 at 列（表頭是第 1 列）之前插入一列 */
  const insertAt = (rows: string[][], at: number, row: string[]) => [...rows.slice(0, at - 1), row, ...rows.slice(at - 1)];
  const blankOf = (rows: string[][]) => (rows[0] ?? []).map(() => '');

  it.each<[string, (rows: string[][]) => string[]]>([
    ['空行', () => []],
    ['只有一個空格子', () => ['']],
    ['每格都空白（只有逗號）', blankOf],
  ])('中間有空白列（%s）：後面的人列號照檔案算；空白列不新增、不算需要處理', (_label, makeBlank) => {
    const sheet = registrationRows([answer('陳大文／研發一部／是'), answer('趙六／行政部／是')]);
    const rows = insertAt(sheet, 3, makeBlank(sheet)); // 第 1 列表頭、第 2 列陳大文、第 3 列空白、第 4 列趙六
    const result = ok(parseRegistrations(rows, ROSTER));
    expect(result.create).toEqual([created(2, CHEN.id)]);
    expect(result.issues).toEqual([{ row: 4, name: '趙六', department: '行政部', reason: ISSUE_REASON.notFound('趙六') }]);
  });

  it('好幾列空白：新增的人與需要處理的人都用檔案中的列號', () => {
    const sheet = registrationRows([answer('陳大文／研發一部／是'), answer('李美華／業務部／是'), answer('趙六／行政部／是')]);
    // 表頭、空白、陳大文、空白、空白、李美華、趙六
    let rows = insertAt(sheet, 2, ['']);
    rows = insertAt(rows, 4, []);
    rows = insertAt(rows, 5, blankOf(sheet));
    const result = ok(parseRegistrations(rows, ROSTER));
    expect(result.create).toEqual([created(3, CHEN.id), created(6, LEE.id)]);
    expect(result.issues).toEqual([{ row: 7, name: '趙六', department: '行政部', reason: ISSUE_REASON.notFound('趙六') }]);
  });

  it('同一人填兩次、中間隔著空白列：採用的最後一列用檔案中的列號', () => {
    const sheet = registrationRows([answer('趙六／行政部／是'), answer('趙六／行政部／是')]);
    const rows = insertAt(sheet, 3, ['']);
    const result = ok(parseRegistrations(rows, ROSTER));
    expect(result.issues).toEqual([{ row: 4, name: '趙六', department: '行政部', reason: ISSUE_REASON.notFound('趙六') }]);
  });

  it('已報名的人：更新與需要處理的人也用檔案中的列號', () => {
    const pWang = registered(11, WANG, { note: '舊備註' });
    const sheet = registrationRows([answer('李美華／業務部／是'), answer('王小明／研發一部／否')]);
    const rows = insertAt(sheet, 2, ['']);
    const result = ok(parseRegistrations(rows, ROSTER, [pWang]));
    expect(result.create).toEqual([created(3, LEE.id)]);
    expect(result.issues).toEqual([
      { row: 4, name: '王小明', department: '研發一部', reason: ISSUE_REASON.notAttending('王小明') },
    ]);
  });

  it('備註欄有換行的那一列只算一列：後面的人列號不受影響', () => {
    const sheet = registrationRows([answer('陳大文／研發一部／是／否／否／／／第一行\n第二行'), answer('趙六／行政部／是')]);
    const result = ok(parseRegistrations(sheet, ROSTER));
    expect(result.create).toEqual([created(2, CHEN.id, { note: '第一行\n第二行' })]);
    expect(result.issues).toEqual([{ row: 3, name: '趙六', department: '行政部', reason: ISSUE_REASON.notFound('趙六') }]);
  });

  it('只有空白列、沒有任何回答：沒有新增、沒有需要處理', () => {
    const sheet = registrationRows([]);
    const result = ok(parseRegistrations([...sheet, [''], [], blankOf(sheet)], ROSTER));
    expect(result).toEqual({ ok: true, create: [], update: [], issues: [] });
  });
});
