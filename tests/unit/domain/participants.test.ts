// 參與人員的業務規則（純函式）：類別欄、部門或單位欄、入座狀態、列操作、預設排序、部門篩選的選項、
// 搜尋與篩選、新增與編輯對話框的桌次選項、「工作人員」能不能勾。
// 依據：docs/spec/participants.md 第 2.1～2.3 節、PPL-R08、R10、R12、R13、R20～R26、R29、R30、R34、R54、R56，
// PPL-AC01～AC03、AC10～AC18、AC43、AC45、AC52、AC72；待確認 PPL-Q08、Q13、Q14 依原型做法（D-008）。
// 顯示名稱、部門、分機與搜尋的共用規則在 src/domain/display.ts（tests/unit/domain/display.test.ts）。
// 人物都是規格驗收條件裡的虛構示範資料。
//
// 假設的介面（src/domain/participants.ts）：
//   type SeatState = 'seated' | 'unseated' | 'staff';
//   seatState(p: Participant): SeatState                          // 已入座（1–30 桌）／未入座／工作人員（工作人員桌）
//   kindLabel(p: Participant): string                             // 類別欄：員工／眷屬（{稱謂}）／眷屬／外部貴賓
//   unitLabel(p: Participant, dir: Directory): string | null      // 部門或單位欄：員工與眷屬是部門，外部貴賓是單位／頭銜；沒有時 null
//   type RowAction = 'edit' | 'seat' | 'move' | 'unseat' | 'cancelRegistration' | 'delete';
//   rowActions(p: Participant): RowAction[]                        // 列操作，順序同第 2.2 節的表
//                                                                  //  （編輯／入座…／移至其他桌次…／移出桌次／取消報名／刪除）
//   sortParticipants(list: readonly Participant[], dir: Directory): Participant[]   // 預設排序，不改變傳入的陣列
//   departmentOptions(employees: readonly Employee[]): string[]    // 部門篩選的選項（不含「不限」）
//   type ParticipantFilters = { kind: ParticipantKind | null; department: string | null; seat: SeatState | null; tableId: number | null };
//   NO_FILTERS: ParticipantFilters                                 // 全部「不限」（null）
//   filterParticipants(list: readonly Participant[], dir: Directory, query: string, filters: ParticipantFilters): Participant[]
//                                                                  // 搜尋與篩選同時作用；保留傳入的順序
//   type TableChoice = { tableId: number; remaining: number; disabled: boolean };
//   tableChoices(participants: readonly Participant[], self?: Participant | null): TableChoice[]
//                                                                  // 30 桌，依 A1～A15、B1～B15 排列（PPL-R56、D-019；tableId 仍是內部編號）；
//                                                                  // 已滿的停用，但 self 目前所在的桌次不算已滿
//   canMarkStaff(participants: readonly Participant[], self?: Participant | null): boolean
//                                                                  // 工作人員桌未滿 10 位，或 self 已經是工作人員
import { describe, expect, it } from 'vitest';
import { STAFF_TABLE_ID, type Employee, type Participant } from '@/contracts/entities';
import { buildDirectory, displayName, type Directory } from '@/domain/display';
import {
  canMarkStaff,
  departmentOptions,
  filterParticipants,
  kindLabel,
  NO_FILTERS,
  rowActions,
  seatState,
  sortParticipants,
  tableChoices,
  unitLabel,
  type ParticipantFilters,
} from '@/domain/participants';
import { IDS_IN_LIST_ORDER } from '../../helpers/table-codes';

const employee = (id: number, data: Partial<Employee> = {}): Employee => ({
  id,
  name: `測試員工${id}`,
  englishName: null,
  department: '測試部',
  team: null,
  extension: null,
  region: null,
  office: null,
  note: null,
  declined: false,
  sortOrder: id,
  ...data,
});

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
const asEmployee = (id: number, employeeId: number, data: Partial<Participant> = {}): Participant => ({
  ...blank,
  id,
  kind: 'EMPLOYEE',
  employeeId,
  ...data,
});
const asDependent = (id: number, hostId: number, data: Partial<Participant> = {}): Participant => ({
  ...blank,
  id,
  kind: 'DEPENDENT',
  hostId,
  ...data,
});
const asGuest = (id: number, guestName: string, data: Partial<Participant> = {}): Participant => ({
  ...blank,
  id,
  kind: 'GUEST',
  guestName,
  ...data,
});

// 示範資料：王小明（研發一部、前端組、1234）、李美華（業務部、5678）、陳大文（研發一部、沒有組別與分機）
const WANG = employee(1, { name: '王小明', department: '研發一部', team: '前端組', extension: '1234' });
const LEE = employee(2, { name: '李美華', department: '業務部', extension: '5678' });
const CHEN = employee(3, { name: '陳大文', department: '研發一部' });
const EMPLOYEES = [WANG, LEE, CHEN];

const names = (list: readonly Participant[], dir: Directory) => list.map((p) => displayName(p, dir));
const filters = (f: Partial<ParticipantFilters>): ParticipantFilters => ({ ...NO_FILTERS, ...f });

describe('類別欄（PPL-R29、PPL-AC01～AC03）', () => {
  it('員工顯示「員工」', () => {
    expect(kindLabel(asEmployee(11, WANG.id))).toBe('員工');
  });

  it('眷屬有稱謂時顯示「眷屬（{稱謂}）」', () => {
    expect(kindLabel(asDependent(12, 11, { relation: '配偶' }))).toBe('眷屬（配偶）');
    expect(kindLabel(asDependent(12, 11, { relation: '外婆' }))).toBe('眷屬（外婆）');
  });

  it('眷屬沒填稱謂時只顯示「眷屬」', () => {
    expect(kindLabel(asDependent(12, 11))).toBe('眷屬');
    expect(kindLabel(asDependent(12, 11, { relation: '' }))).toBe('眷屬');
  });

  it('外部貴賓顯示「外部貴賓」', () => {
    expect(kindLabel(asGuest(14, '林董'))).toBe('外部貴賓');
  });
});

describe('部門或單位欄（PPL-R30、PPL-R08、PPL-R12、PPL-R13）', () => {
  const pWang = asEmployee(11, WANG.id);
  const pDep = asDependent(12, pWang.id);
  const pLee = asEmployee(13, LEE.id);
  const pLin = asGuest(14, '林董', { organization: '○○科技 董事長' });
  const pSeat = asGuest(15, '貴賓席');
  const list = [pWang, pDep, pLee, pLin, pSeat];
  const dir = buildDirectory({ employees: EMPLOYEES, participants: list });

  it('員工顯示員工名單上的部門', () => {
    expect(unitLabel(pWang, dir)).toBe('研發一部');
    expect(unitLabel(pLee, dir)).toBe('業務部');
  });

  it('眷屬顯示所屬員工的部門（PPL-AC01）', () => {
    expect(unitLabel(pDep, dir)).toBe('研發一部');
  });

  it('外部貴賓顯示單位／頭銜（PPL-AC02）；沒填時沒有內容', () => {
    expect(unitLabel(pLin, dir)).toBe('○○科技 董事長');
    expect(unitLabel(pSeat, dir)).toBeNull();
  });

  it('員工名單改了部門，員工與眷屬的部門跟著變（PPL-R12、PPL-AC72）', () => {
    const changed = buildDirectory({ employees: [{ ...WANG, department: '業務部' }, LEE, CHEN], participants: list });
    expect(unitLabel(pWang, changed)).toBe('業務部');
    expect(unitLabel(pDep, changed)).toBe('業務部');
  });

  it('眷屬的所屬員工改變，部門跟著新的所屬員工（PPL-R13、PPL-AC52）', () => {
    const moved = { ...pDep, hostId: pLee.id };
    const next = buildDirectory({ employees: EMPLOYEES, participants: [pWang, moved, pLee, pLin, pSeat] });
    expect(unitLabel(moved, next)).toBe('業務部');
  });
});

describe('入座狀態（PPL-R25、PPL-R10）', () => {
  it('坐在 30 桌其中一桌是已入座', () => {
    expect(seatState(asEmployee(11, WANG.id, { tableId: 1 }))).toBe('seated');
    expect(seatState(asGuest(14, '林董', { tableId: 30 }))).toBe('seated');
  });

  it('不在任何桌次、也不是工作人員是未入座', () => {
    expect(seatState(asEmployee(11, WANG.id))).toBe('unseated');
    expect(seatState(asDependent(12, 11))).toBe('unseated');
  });

  it('坐在工作人員桌是工作人員，不算已入座也不算未入座', () => {
    expect(seatState(asEmployee(11, WANG.id, { tableId: STAFF_TABLE_ID }))).toBe('staff');
  });
});

describe('列操作（PPL-R34、第 2.2 節、PPL-AC25～AC27）', () => {
  it.each<[string, Participant, string[]]>([
    ['員工未入座', asEmployee(11, WANG.id), ['edit', 'seat', 'cancelRegistration']],
    ['員工已入座', asEmployee(11, WANG.id, { tableId: 3 }), ['edit', 'move', 'unseat', 'cancelRegistration']],
    ['員工是工作人員', asEmployee(11, WANG.id, { tableId: STAFF_TABLE_ID }), ['edit', 'cancelRegistration']],
    ['眷屬未入座', asDependent(12, 11), ['edit', 'seat', 'delete']],
    ['眷屬已入座', asDependent(12, 11, { tableId: 3 }), ['edit', 'move', 'unseat', 'delete']],
    ['外部貴賓未入座', asGuest(14, '林董'), ['edit', 'seat', 'delete']],
    ['外部貴賓已入座', asGuest(14, '林董', { tableId: 5 }), ['edit', 'move', 'unseat', 'delete']],
  ])('%s', (_name, p, expected) => {
    expect(rowActions(p)).toEqual(expected);
  });
});

describe('預設排序（PPL-R20、PPL-Q13：依員工名單的部門、組別與員工順序，外部貴賓依新增順序排最後）', () => {
  // 員工名單順序（sortOrder）：王小明、李美華、陳大文、張三、林四。id 和 sortOrder 刻意不同。
  const E_WANG = employee(51, { name: '王小明', department: '研發一部', team: '前端組', sortOrder: 1 });
  const E_LEE = employee(52, { name: '李美華', department: '業務部', sortOrder: 2 });
  const E_CHEN = employee(53, { name: '陳大文', department: '研發一部', sortOrder: 3 });
  const E_ZHANG = employee(50, { name: '張三', department: '研發一部', team: '後端組', sortOrder: 4 });
  const E_LIN4 = employee(49, { name: '林四', department: '研發一部', team: '前端組', sortOrder: 5 });
  const roster = [E_ZHANG, E_LEE, E_LIN4, E_CHEN, E_WANG];

  const pWang = asEmployee(1, E_WANG.id);
  const pWangDep = asDependent(2, pWang.id);
  const pLee = asEmployee(3, E_LEE.id);
  const pChen = asEmployee(4, E_CHEN.id);
  const pZhang = asEmployee(5, E_ZHANG.id);
  const pLin4 = asEmployee(6, E_LIN4.id);
  const pLin4Dep = asDependent(7, pLin4.id);
  const gFirst = asGuest(8, '林董', { createdAt: '2026-11-01T00:00:00.000Z' });
  const gSecond = asGuest(9, '貴賓席', { createdAt: '2026-11-02T00:00:00.000Z' });
  const all = [pWang, pWangDep, pLee, pChen, pZhang, pLin4, pLin4Dep, gFirst, gSecond];
  const dir = buildDirectory({ employees: roster, participants: all });

  const EXPECTED = ['王小明', '王小明_眷屬', '林四', '林四_眷屬', '張三', '陳大文', '李美華', '林董', '貴賓席'];

  it('部門依員工名單上先出現的順序；部門內依組別先出現的順序、沒有組別的排最後，再依員工名單順序', () => {
    expect(names(sortParticipants(all, dir), dir)).toEqual(EXPECTED);
  });

  it('傳入的順序打亂，結果一樣', () => {
    const shuffled = [gSecond, pLin4Dep, pChen, gFirst, pWangDep, pLee, pZhang, pWang, pLin4];
    expect(names(sortParticipants(shuffled, dir), dir)).toEqual(EXPECTED);
  });

  it('眷屬緊接在所屬員工的下一列（PPL-AC01）', () => {
    const sorted = names(sortParticipants(all, dir), dir);
    expect(sorted.indexOf('王小明_眷屬')).toBe(sorted.indexOf('王小明') + 1);
    expect(sorted.indexOf('林四_眷屬')).toBe(sorted.indexOf('林四') + 1);
  });

  it('外部貴賓排在所有員工與眷屬之後，依新增順序（PPL-AC02）', () => {
    const later = asGuest(10, '後來的貴賓', { createdAt: '2026-11-03T00:00:00.000Z' });
    const earliest = asGuest(11, '最早的貴賓', { createdAt: '2026-10-01T00:00:00.000Z' });
    const list = [later, ...all, earliest];
    const d = buildDirectory({ employees: roster, participants: list });
    expect(names(sortParticipants(list, d), d).slice(-4)).toEqual(['最早的貴賓', '林董', '貴賓席', '後來的貴賓']);
  });

  it('眷屬改了所屬員工，排在新的所屬員工下一列（PPL-R13、PPL-AC52）', () => {
    const moved = { ...pWangDep, hostId: pLee.id };
    const list = all.map((p) => (p.id === moved.id ? moved : p));
    const d = buildDirectory({ employees: roster, participants: list });
    const sorted = names(sortParticipants(list, d), d);
    expect(sorted).not.toContain('王小明_眷屬');
    expect(sorted.indexOf('李美華_眷屬')).toBe(sorted.indexOf('李美華') + 1);
  });

  it('員工名單改了部門，部門與組別的順序跟著重新推導（PPL-R12）', () => {
    // 王小明（名單第 1 位）改到業務部、沒有組別：業務部變成名單上第一個出現的部門；
    // 研發一部裡先出現的組別變成張三的後端組（第 4 位），再來是林四的前端組（第 5 位）
    const changed = buildDirectory({
      employees: roster.map((e) => (e.id === E_WANG.id ? { ...e, department: '業務部', team: null } : e)),
      participants: all,
    });
    expect(names(sortParticipants(all, changed), changed)).toEqual([
      '王小明',
      '王小明_眷屬',
      '李美華',
      '張三',
      '林四',
      '林四_眷屬',
      '陳大文',
      '林董',
      '貴賓席',
    ]);
  });

  it('不改變傳入的陣列', () => {
    const input = [gSecond, pWang, pLee];
    const copy = [...input];
    sortParticipants(input, dir);
    expect(input).toEqual(copy);
  });
});

describe('部門篩選的選項（PPL-R24）', () => {
  it('來自員工名單的部門：不重複，依員工名單順序；沒報名的員工的部門也列出', () => {
    const roster = [
      employee(4, { department: '總務部', sortOrder: 4 }),
      employee(2, { department: '業務部', sortOrder: 2 }),
      employee(1, { department: '研發一部', sortOrder: 1 }),
      employee(3, { department: '研發一部', sortOrder: 3 }),
    ];
    expect(departmentOptions(roster)).toEqual(['研發一部', '業務部', '總務部']);
  });

  it('沒有員工時沒有選項', () => {
    expect(departmentOptions([])).toEqual([]);
  });
});

describe('搜尋與篩選（PPL-R21～R26）', () => {
  // 王小明在 B4 桌（內部編號 3）、有眷屬（配偶，未入座）；李美華未入座；陳大文是工作人員；林董（○○科技 董事長）在 B10 桌（5）
  const pWang = asEmployee(11, WANG.id, { tableId: 3, seatOrder: 0 });
  const pDep = asDependent(12, pWang.id, { relation: '配偶' });
  const pLee = asEmployee(13, LEE.id);
  const pChen = asEmployee(15, CHEN.id, { tableId: STAFF_TABLE_ID, seatOrder: 0 });
  const pLin = asGuest(14, '林董', { organization: '○○科技 董事長', tableId: 5, seatOrder: 0 });
  const list = [pWang, pDep, pLee, pChen, pLin];
  const dir = buildDirectory({ employees: EMPLOYEES, participants: list });
  const run = (query: string, f: Partial<ParticipantFilters> = {}) =>
    names(filterParticipants(list, dir, query, filters(f)), dir);

  it('預設都是「不限」、沒有搜尋字：列出全部，保留傳入的順序（PPL-R22）', () => {
    expect(NO_FILTERS).toEqual({ kind: null, department: null, seat: null, tableId: null });
    expect(run('')).toEqual(['王小明', '王小明_眷屬', '李美華', '陳大文', '林董']);
  });

  it('用分機搜尋只列出那位員工，不列出他的眷屬（PPL-AC10）', () => {
    expect(run('1234')).toEqual(['王小明']);
  });

  it('用員工姓名搜尋，員工與眷屬都列出（PPL-AC11）', () => {
    expect(run('王小明')).toEqual(['王小明', '王小明_眷屬']);
  });

  it('用外部貴賓的單位／頭銜搜尋（PPL-AC12）', () => {
    expect(run('○○科技')).toEqual(['林董']);
  });

  it('用部門搜尋，員工與部門相同的眷屬都列出（PPL-R21）', () => {
    expect(run('研發一部')).toEqual(['王小明', '王小明_眷屬', '陳大文']);
  });

  it('也搜尋組別與稱謂，不分大小寫（PPL-Q14 的原型做法）', () => {
    expect(run('前端組')).toEqual(['王小明', '王小明_眷屬']);
    expect(run('配偶')).toEqual(['王小明_眷屬']);
    const abc = asGuest(16, 'Tony', { organization: 'ABC Corp' });
    const d = buildDirectory({ employees: EMPLOYEES, participants: [...list, abc] });
    expect(names(filterParticipants([...list, abc], d, 'abc corp', NO_FILTERS), d)).toEqual(['Tony']);
  });

  it('沒有人符合時一個都不列', () => {
    expect(run('xyz')).toEqual([]);
  });

  it.each([
    ['EMPLOYEE', ['王小明', '李美華', '陳大文']],
    ['DEPENDENT', ['王小明_眷屬']],
    ['GUEST', ['林董']],
  ] as const)('類別選 %s 只列出該類別（PPL-R23、PPL-AC14）', (kind, expected) => {
    expect(run('', { kind })).toEqual(expected);
  });

  it('部門篩選：列出該部門的員工與所屬員工在該部門的眷屬，外部貴賓不符合任何部門（PPL-R24、PPL-AC15）', () => {
    expect(run('', { department: '研發一部' })).toEqual(['王小明', '王小明_眷屬', '陳大文']);
    expect(run('', { department: '業務部' })).toEqual(['李美華']);
    expect(run('', { department: '○○科技 董事長' })).toEqual([]);
  });

  it('員工名單改了部門，部門篩選跟著新部門（PPL-R12、PPL-AC72）', () => {
    const changed = buildDirectory({ employees: [{ ...WANG, department: '業務部' }, LEE, CHEN], participants: list });
    expect(names(filterParticipants(list, changed, '', filters({ department: '業務部' })), changed)).toEqual([
      '王小明',
      '王小明_眷屬',
      '李美華',
    ]);
  });

  it('入座狀態：已入座、未入座、工作人員各自只列出符合的人（PPL-R25、PPL-AC16）', () => {
    expect(run('', { seat: 'seated' })).toEqual(['王小明', '林董']);
    expect(run('', { seat: 'unseated' })).toEqual(['王小明_眷屬', '李美華']);
    expect(run('', { seat: 'staff' })).toEqual(['陳大文']);
  });

  it('桌次：只列出坐在那一桌的人；工作人員與未入座的人不符合（PPL-R26、PPL-AC17）', () => {
    expect(run('', { tableId: 3 })).toEqual(['王小明']);
    expect(run('', { tableId: 5 })).toEqual(['林董']);
    expect(run('', { tableId: 7 })).toEqual([]);
  });

  it('搜尋與各篩選同時作用，只列出同時符合全部條件的人（PPL-R22、PPL-AC18）', () => {
    const unseatedWang = { ...pWang, tableId: null, seatOrder: null };
    const l = [unseatedWang, pDep, pLee, pChen, pLin];
    const d = buildDirectory({ employees: EMPLOYEES, participants: l });
    expect(names(filterParticipants(l, d, '王', filters({ kind: 'EMPLOYEE', seat: 'unseated' })), d)).toEqual([
      '王小明',
    ]);
    expect(run('王', { kind: 'EMPLOYEE', department: '研發一部' })).toEqual(['王小明']);
    expect(run('', { kind: 'GUEST', department: '研發一部' })).toEqual([]);
  });
});

describe('對話框的桌次選項（PPL-R56、PPL-Q08、PPL-AC43）', () => {
  const guestsAt = (tableId: number, count: number, startId: number) =>
    Array.from({ length: count }, (_, i) => asGuest(startId + i, `測試貴賓${startId + i}`, { tableId, seatOrder: i }));
  const seated = [...guestsAt(3, 5, 100), ...guestsAt(4, 10, 200)];
  const staff = Array.from({ length: 3 }, (_, i) => asEmployee(300 + i, 300 + i, { tableId: STAFF_TABLE_ID, seatOrder: i }));
  const unseated = [asGuest(400, '未入座的貴賓')];
  const all = [...seated, ...staff, ...unseated];

  it('列出 30 桌與剩幾位，依 A1～A15、B1～B15 排列；工作人員桌與未入座的人不算（PPL-R56、D-019）', () => {
    const choices = tableChoices(all);
    // 內部編號依桌號的清單順序：A1（2）、A2（22）、A3（17）…A15（21）、B1（1）、B2（7）…B15（16）
    expect(choices.map((c) => c.tableId)).toEqual(IDS_IN_LIST_ORDER);
    expect(choices.find((c) => c.tableId === 1)).toEqual({ tableId: 1, remaining: 10, disabled: false });
    expect(choices.find((c) => c.tableId === 3)).toEqual({ tableId: 3, remaining: 5, disabled: false });
  });

  it('已滿的桌次停用（PPL-AC43）', () => {
    expect(tableChoices(all).find((c) => c.tableId === 4)).toEqual({ tableId: 4, remaining: 0, disabled: true });
  });

  it('編輯時，自己目前所在的桌次不算已滿（PPL-Q08）', () => {
    const self = seated.find((p) => p.tableId === 4);
    expect(self).toBeDefined();
    const choices = tableChoices(all, self);
    expect(choices.find((c) => c.tableId === 4)?.disabled).toBe(false);
    expect(choices.find((c) => c.tableId === 3)?.disabled).toBe(false);
  });

  it('編輯坐在別桌的人時，已滿的桌次仍然停用', () => {
    const self = seated.find((p) => p.tableId === 3);
    expect(tableChoices(all, self).find((c) => c.tableId === 4)?.disabled).toBe(true);
  });
});

describe('「工作人員」能不能勾（PPL-R54、PPL-AC45）', () => {
  const staffOf = (count: number) =>
    Array.from({ length: count }, (_, i) => asEmployee(500 + i, 500 + i, { tableId: STAFF_TABLE_ID, seatOrder: i }));
  const other = asEmployee(600, 600, { tableId: 3, seatOrder: 0 });

  it('工作人員桌未滿：新增或編輯都可以勾', () => {
    expect(canMarkStaff(staffOf(9))).toBe(true);
    expect(canMarkStaff([...staffOf(9), other], other)).toBe(true);
    expect(canMarkStaff([])).toBe(true);
  });

  it('工作人員桌已有 10 位：還不是工作人員的員工不能勾', () => {
    const full = staffOf(10);
    expect(canMarkStaff(full)).toBe(false);
    expect(canMarkStaff(full, null)).toBe(false);
    expect(canMarkStaff([...full, other], other)).toBe(false);
  });

  it('工作人員桌已有 10 位：已經是工作人員的員工不受影響', () => {
    const full = staffOf(10);
    expect(canMarkStaff(full, full[0])).toBe(true);
  });
});
