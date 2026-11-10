// 員工名單的純函式：docs/spec/employees.md 第 3.1～3.4、3.6 節（EMP-R03～R05、R07、R08、R11～R25、R37），
// 驗收條件 EMP-AC01～AC04、AC12～AC14、AC16～AC29、AC33、AC46、AC47、AC55，
// 待確認 EMP-Q08、Q09、Q11 依 D-008 照「原型或現況」欄的做法。
//
// 假設的介面（src/domain/employees.ts，實作照這裡）：
//   type RegistrationTab = 'all' | 'unregistered' | 'registered'
//   type EmployeeFilters = { department: string | null; team: string | null; region: string | null }   // null = 不限
//   type EmployeeEmptyState = 'no-employees' | 'no-search-results' | 'no-filter-results' | 'all-registered' | 'none-registered'
//   registeredEmployeeIds(participants: readonly Participant[]): Set<number>
//   sortEmployees(employees: readonly Employee[]): Employee[]                      // 不改動輸入
//   departmentOptions(employees: readonly Employee[]): string[]
//   teamOptions(employees: readonly Employee[], department: string | null): string[]
//   regionOptions(employees: readonly Employee[]): string[]
//   tabCounts(employees, registered: ReadonlySet<number>): { all: number; unregistered: number; registered: number }
//   matchesEmployeeSearch(employee: Employee, query: string): boolean
//   filterEmployees(employees, registered, view: { tab: RegistrationTab; query: string; filters: EmployeeFilters }): Employee[]  // 已依 EMP-R07 排序
//   changeDepartmentFilter(employees, filters: EmployeeFilters, department: string | null): EmployeeFilters
//   emptyStateOf(s: { total: number; visible: number; tab: RegistrationTab; query: string; filters: EmployeeFilters }): EmployeeEmptyState | null
//   headerCheckState(pageRows: readonly Employee[], registered, selected: ReadonlySet<number>): { checked: boolean | 'indeterminate'; disabled: boolean }
//   toggleAllOnPage(pageRows, registered, selected: ReadonlySet<number>, checked: boolean): Set<number>   // 回傳新的 Set，不改動輸入
//   selectedToJoin(employees, registered, selected: ReadonlySet<number>): number[]   // 「加入尾牙（{n} 位）」要送出的員工
//   findSameNameEmployee(employees, name: string, excludeId?: number): Employee | undefined
// 「員工名單順序」是 Employee.sortOrder（docs/architecture.md 第 7.1 節；EMP-Q09），不是陣列順序。
import { describe, expect, it } from 'vitest';
import type { Employee, Participant } from '@/contracts/entities';
import {
  changeDepartmentFilter,
  departmentOptions,
  emptyStateOf,
  filterEmployees,
  findSameNameEmployee,
  headerCheckState,
  matchesEmployeeSearch,
  regionOptions,
  registeredEmployeeIds,
  selectedToJoin,
  sortEmployees,
  tabCounts,
  teamOptions,
  toggleAllOnPage,
  type EmployeeFilters,
  type RegistrationTab,
} from '@/domain/employees';

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
const joined = (id: number, employeeId: number, data: Partial<Participant> = {}): Participant => ({
  ...blank,
  id,
  kind: 'EMPLOYEE',
  employeeId,
  ...data,
});
const dependentOf = (id: number, hostId: number, data: Partial<Participant> = {}): Participant => ({
  ...blank,
  id,
  kind: 'DEPENDENT',
  hostId,
  ...data,
});
const guest = (id: number, data: Partial<Participant> = {}): Participant => ({
  ...blank,
  id,
  kind: 'GUEST',
  guestName: '測試貴賓',
  ...data,
});

const NO_FILTERS: EmployeeFilters = { department: null, team: null, region: null };
const names = (list: readonly Employee[]) => list.map((e) => e.name);
const ids = (list: Iterable<number>) => [...list].sort((a, b) => a - b);
const view = (tab: RegistrationTab, query = '', filters: Partial<EmployeeFilters> = {}) => ({
  tab,
  query,
  filters: { ...NO_FILTERS, ...filters },
});

/** EMP-AC04 的員工名單順序：甲（研發部、韌體組）、乙（業務部）、丙（研發部、軟體組）、丁（研發部、沒有組別）、戊（研發部、韌體組） */
const AC04 = [
  employee(1, { name: '甲', department: '研發部', team: '韌體組' }),
  employee(2, { name: '乙', department: '業務部' }),
  employee(3, { name: '丙', department: '研發部', team: '軟體組' }),
  employee(4, { name: '丁', department: '研發部' }),
  employee(5, { name: '戊', department: '研發部', team: '韌體組' }),
];

/** 搜尋與篩選用的名單：業務部在前（王小明最早），研發部韌體組有 3 位 */
const ROSTER = [
  employee(1, { name: '王小明', englishName: 'Xiaoming', department: '業務部', team: '北區組', extension: '1234', region: '台北' }),
  employee(2, { name: '李小華', englishName: 'Lisa', department: '研發部', team: '韌體組', extension: '2001', region: '台中' }),
  employee(3, { name: '張三', department: '研發部', team: '韌體組', region: '台北' }),
  employee(4, { name: '陳四', department: '研發部', team: '軟體組', region: '台中' }),
  employee(5, { name: '林五', department: '研發部', team: '韌體組', region: '台中' }),
  employee(6, { name: '趙六', department: '研發部', region: '台北' }),
  employee(7, { name: '周七', department: '業務部', region: '台中' }),
];

describe('registeredEmployeeIds：報名狀態由參與人員自動判斷（EMP-R03）', () => {
  it('在參與人員中有對應的員工就是已報名，沒有就是未報名', () => {
    const registered = registeredEmployeeIds([joined(101, 1), joined(102, 3)]);
    expect(ids(registered)).toEqual([1, 3]);
    expect(registered.has(2)).toBe(false);
  });

  it('入座、未入座與工作人員桌（tableId 0）的員工都算已報名（EMP-AC03）', () => {
    const registered = registeredEmployeeIds([
      joined(101, 1, { tableId: 5, seatOrder: 0 }),
      joined(102, 2, { tableId: null }),
      joined(103, 3, { tableId: 0, seatOrder: 0 }),
    ]);
    expect(ids(registered)).toEqual([1, 2, 3]);
  });

  it('眷屬與外部貴賓不讓任何員工變成已報名', () => {
    const registered = registeredEmployeeIds([joined(101, 1), dependentOf(102, 101), guest(103)]);
    expect(ids(registered)).toEqual([1]);
  });

  it('沒有參與人員時沒有人報名', () => {
    expect(registeredEmployeeIds([]).size).toBe(0);
  });
});

describe('sortEmployees：依部門、組別排列（EMP-R07、EMP-AC04、EMP-Q09）', () => {
  it('EMP-AC04：甲、戊、丙、丁、乙', () => {
    expect(names(sortEmployees(AC04))).toEqual(['甲', '戊', '丙', '丁', '乙']);
  });

  it('「員工名單順序」是 sortOrder，不是陣列順序', () => {
    expect(names(sortEmployees([...AC04].reverse()))).toEqual(['甲', '戊', '丙', '丁', '乙']);

    // id 與 sortOrder 不同時依 sortOrder
    const list = [
      employee(10, { name: '後建立', department: '業務部', sortOrder: 2 }),
      employee(20, { name: '先建立', department: '研發部', sortOrder: 1 }),
    ];
    expect(names(sortEmployees(list))).toEqual(['先建立', '後建立']);
  });

  it('部門依首次出現的先後；部門內的組別依在該部門首次出現的先後；同組依員工名單順序', () => {
    const list = [
      employee(1, { name: 'A1', department: '甲部', team: '二組' }),
      employee(2, { name: 'B1', department: '乙部', team: '一組' }),
      employee(3, { name: 'A2', department: '甲部', team: '一組' }),
      employee(4, { name: 'A3', department: '甲部', team: '二組' }),
      employee(5, { name: 'B2', department: '乙部', team: '一組' }),
      employee(6, { name: 'A4', department: '甲部', team: '一組' }),
    ];
    expect(names(sortEmployees(list))).toEqual(['A1', 'A3', 'A2', 'A4', 'B1', 'B2']);
  });

  it('沒有組別的員工排在該部門最後，彼此依員工名單順序', () => {
    const list = [
      employee(1, { name: '無組一', department: '研發部' }),
      employee(2, { name: '有組', department: '研發部', team: '韌體組' }),
      employee(3, { name: '無組二', department: '研發部' }),
      employee(4, { name: '別部門', department: '業務部' }),
    ];
    expect(names(sortEmployees(list))).toEqual(['有組', '無組一', '無組二', '別部門']);
  });

  it('不同部門有同名的組別時，各自排在自己的部門內', () => {
    const list = [
      employee(1, { name: '研發共用', department: '研發部', team: '共用組' }),
      employee(2, { name: '業務共用', department: '業務部', team: '共用組' }),
      employee(3, { name: '研發韌體', department: '研發部', team: '韌體組' }),
    ];
    expect(names(sortEmployees(list))).toEqual(['研發共用', '研發韌體', '業務共用']);
  });

  it('不改動傳入的陣列', () => {
    const input = [...AC04].reverse();
    const before = names(input);
    sortEmployees(input);
    expect(names(input)).toEqual(before);
  });

  it('空的名單回傳空陣列', () => {
    expect(sortEmployees([])).toEqual([]);
  });
});

describe('部門、組別、地區清單由員工名單產生（EMP-R04、EMP-R13、EMP-Q11）', () => {
  it('部門清單：只列至少有一位員工的部門，依首次出現的先後，不重複', () => {
    expect(departmentOptions(AC04)).toEqual(['研發部', '業務部']);
    expect(departmentOptions([...AC04].reverse())).toEqual(['研發部', '業務部']);
  });

  it('部門的最後一位員工刪掉後，部門清單不再有這個部門（EMP-AC55）', () => {
    const list = [employee(1, { department: '研發部' }), employee(2, { department: '品保部' })];
    expect(departmentOptions(list)).toContain('品保部');
    expect(departmentOptions(list.filter((e) => e.id !== 2))).not.toContain('品保部');
  });

  it('新部門名稱的員工一加入，部門清單就有這個部門（EMP-R34、EMP-AC42）', () => {
    expect(departmentOptions([...AC04, employee(9, { department: '品保部' })])).toEqual(['研發部', '業務部', '品保部']);
  });

  it('選了部門時，組別清單只列那個部門的組別，依在該部門首次出現的先後，不重複、不含空白組別（EMP-R13、EMP-AC16）', () => {
    expect(teamOptions(ROSTER, '研發部')).toEqual(['韌體組', '軟體組']);
    expect(teamOptions(ROSTER, '業務部')).toEqual(['北區組']);
  });

  it('部門沒有任何組別、或部門不存在時，組別清單是空的', () => {
    expect(teamOptions([employee(1, { department: '品保部' })], '品保部')).toEqual([]);
    expect(teamOptions(ROSTER, '不存在的部門')).toEqual([]);
  });

  it('沒選部門時列出所有部門的組別，依部門順序排列（EMP-AC17）', () => {
    expect(teamOptions(ROSTER, null)).toEqual(['北區組', '韌體組', '軟體組']);
    expect(teamOptions(AC04, null)).toEqual(['韌體組', '軟體組']);
  });

  it('沒選部門、不同部門有同名組別時，每個部門各列一次（EMP-Q11 原型做法）', () => {
    const list = [
      employee(1, { department: '研發部', team: '共用組' }),
      employee(2, { department: '研發部', team: '韌體組' }),
      employee(3, { department: '業務部', team: '共用組' }),
    ];
    expect(teamOptions(list, null)).toEqual(['共用組', '韌體組', '共用組']);
  });

  it('新組別名稱的員工一加入，該部門的組別清單就有這個組別（EMP-R35、EMP-AC44）', () => {
    const list = [...ROSTER, employee(9, { department: '研發部', team: '測試組' })];
    expect(teamOptions(list, '研發部')).toEqual(['韌體組', '軟體組', '測試組']);
  });

  it('地區清單：員工名單既有的地區，不重複、不含空白地區（EMP-R04、EMP-R36）', () => {
    const regions = regionOptions([...ROSTER, employee(9, { region: null })]);
    expect([...regions].sort()).toEqual(['台中', '台北']);
    expect(regions).toHaveLength(2);
    expect(regionOptions([...ROSTER, employee(9, { region: '高雄' })])).toContain('高雄');
  });
});

describe('tabCounts：Tabs 的人數（EMP-R08）', () => {
  it('EMP-AC01：3 位員工中 1 位已報名 → 全部 3、未報名 2、已報名 1', () => {
    const list = [employee(1), employee(2), employee(3)];
    expect(tabCounts(list, new Set([2]))).toEqual({ all: 3, unregistered: 2, registered: 1 });
  });

  it('全部已報名時未報名是 0（EMP-AC24）；沒有人報名時已報名是 0', () => {
    const list = [employee(1), employee(2)];
    expect(tabCounts(list, new Set([1, 2]))).toEqual({ all: 2, unregistered: 0, registered: 2 });
    expect(tabCounts(list, new Set())).toEqual({ all: 2, unregistered: 2, registered: 0 });
  });

  it('「全部」等於「未報名」加「已報名」；不在員工名單裡的 id 不算', () => {
    const counts = tabCounts([employee(1), employee(2), employee(3)], new Set([1, 99]));
    expect(counts).toEqual({ all: 3, unregistered: 2, registered: 1 });
    expect(counts.all).toBe(counts.unregistered + counts.registered);
  });

  it('沒有員工時都是 0', () => {
    expect(tabCounts([], new Set())).toEqual({ all: 0, unregistered: 0, registered: 0 });
  });
});

describe('matchesEmployeeSearch：搜尋姓名、英文名、分機、部門與組別（EMP-R11、EMP-Q08）', () => {
  const wang = employee(1, {
    name: '王小明',
    englishName: 'Xiaoming',
    department: '業務部',
    team: '北區組',
    extension: '1234',
    region: '台北',
    note: '素食',
  });

  it('英文名（EMP-AC12）', () => {
    expect(matchesEmployeeSearch(wang, 'Xiaoming')).toBe(true);
  });

  it('分機（EMP-AC13、COM-R14）', () => {
    expect(matchesEmployeeSearch(wang, '1234')).toBe(true);
    expect(matchesEmployeeSearch(wang, '23')).toBe(true);
  });

  it('合併的多個分機，用其中任一個都找得到（EMP-AC66、COM-R15）', () => {
    const merged = employee(2, { name: '多分機', department: '業務部', extension: '1234／1235' });
    expect(matchesEmployeeSearch(merged, '1235')).toBe(true);
    expect(matchesEmployeeSearch(merged, '1234')).toBe(true);
  });

  it('姓名、部門、組別，包含關鍵字就算（EMP-AC14）', () => {
    expect(matchesEmployeeSearch(wang, '小明')).toBe(true);
    expect(matchesEmployeeSearch(wang, '業務')).toBe(true);
    expect(matchesEmployeeSearch(wang, '北區組')).toBe(true);
  });

  it('不分英文大小寫（EMP-Q08 第 5 點）', () => {
    expect(matchesEmployeeSearch(wang, 'xiaoming')).toBe(true);
    expect(matchesEmployeeSearch(wang, 'XIAO')).toBe(true);
  });

  it('忽略關鍵字前後的空白（EMP-Q08 第 5 點）', () => {
    expect(matchesEmployeeSearch(wang, '  王小明 ')).toBe(true);
    expect(matchesEmployeeSearch(wang, '　1234　')).toBe(true);
  });

  it('空白關鍵字列出所有人', () => {
    expect(matchesEmployeeSearch(wang, '')).toBe(true);
    expect(matchesEmployeeSearch(wang, '   ')).toBe(true);
  });

  it('沒有欄位包含關鍵字就不列出（EMP-AC15）', () => {
    expect(matchesEmployeeSearch(wang, '無此人')).toBe(false);
  });

  it('選填欄位沒有值時照常比對其他欄位', () => {
    const bare = employee(3, { name: '張三', department: '研發部' });
    expect(matchesEmployeeSearch(bare, '張三')).toBe(true);
    expect(matchesEmployeeSearch(bare, 'Tony')).toBe(false);
  });
});

describe('filterEmployees：分頁（Tabs）、搜尋與篩選同時生效（EMP-R08、EMP-R12～R15）', () => {
  const registered = new Set([1]); // 王小明已報名

  it('「全部」列出所有員工，依 EMP-R07 排序', () => {
    expect(names(filterEmployees(ROSTER, registered, view('all')))).toEqual([
      '王小明',
      '周七',
      '李小華',
      '張三',
      '林五',
      '陳四',
      '趙六',
    ]);
  });

  it('「未報名」只列未報名的員工，「已報名」只列已報名的員工（EMP-AC02）', () => {
    expect(names(filterEmployees(ROSTER, registered, view('unregistered')))).not.toContain('王小明');
    expect(filterEmployees(ROSTER, registered, view('unregistered'))).toHaveLength(6);
    expect(names(filterEmployees(ROSTER, registered, view('registered')))).toEqual(['王小明']);
  });

  it('搜尋組別「韌體組」列出這 3 位；搜尋部門「研發部」列出研發部所有員工（EMP-AC14）', () => {
    expect(names(filterEmployees(ROSTER, registered, view('all', '韌體組')))).toEqual(['李小華', '張三', '林五']);
    expect(names(filterEmployees(ROSTER, registered, view('all', '研發部')))).toEqual([
      '李小華',
      '張三',
      '林五',
      '陳四',
      '趙六',
    ]);
  });

  it('部門篩選只列那個部門的員工（EMP-AC16）', () => {
    expect(names(filterEmployees(ROSTER, registered, view('all', '', { department: '業務部' })))).toEqual([
      '王小明',
      '周七',
    ]);
  });

  it('部門加組別篩選', () => {
    expect(
      names(filterEmployees(ROSTER, registered, view('all', '', { department: '研發部', team: '韌體組' }))),
    ).toEqual(['李小華', '張三', '林五']);
  });

  it('沒選部門時，組別篩選只比對組別名稱，列出所有部門中同名組別的員工（EMP-Q11 原型做法）', () => {
    const list = [
      employee(1, { name: '研發共用', department: '研發部', team: '共用組' }),
      employee(2, { name: '業務共用', department: '業務部', team: '共用組' }),
      employee(3, { name: '研發韌體', department: '研發部', team: '韌體組' }),
    ];
    expect(names(filterEmployees(list, new Set(), view('all', '', { team: '共用組' })))).toEqual([
      '研發共用',
      '業務共用',
    ]);
  });

  it('地區篩選只列地區相同的員工（EMP-AC19）', () => {
    expect(names(filterEmployees(ROSTER, registered, view('all', '', { region: '台北' })))).toEqual([
      '王小明',
      '張三',
      '趙六',
    ]);
  });

  it('部門與地區篩選同時生效；沒有符合的員工時回傳空陣列（EMP-AC20）', () => {
    expect(names(filterEmployees(ROSTER, registered, view('all', '', { department: '研發部', region: '台北' })))).toEqual([
      '張三',
      '趙六',
    ]);
    expect(filterEmployees(ROSTER, registered, view('all', '', { department: '業務部', team: '韌體組' }))).toEqual([]);
  });

  it('EMP-AC22：王小明已報名，在「未報名」搜尋找不到他，在「已報名」搜尋列出他', () => {
    expect(filterEmployees(ROSTER, registered, view('unregistered', '王小明'))).toEqual([]);
    expect(names(filterEmployees(ROSTER, registered, view('registered', '王小明')))).toEqual(['王小明']);
  });

  it('分頁、關鍵字與每一項篩選都要符合（EMP-R15）', () => {
    const both = new Set([2, 3]); // 李小華、張三已報名
    expect(
      names(filterEmployees(ROSTER, both, view('unregistered', '研發', { department: '研發部', region: '台中' }))),
    ).toEqual(['林五', '陳四']);
  });

  it('只列員工，參與人員中的眷屬不會變成一列（EMP-R05、EMP-AC06）', () => {
    const participants = [joined(101, 1), dependentOf(102, 101)];
    const rows = filterEmployees(ROSTER, registeredEmployeeIds(participants), view('all'));
    expect(rows).toHaveLength(ROSTER.length);
    expect(rows.some((e) => e.name.includes('_眷屬'))).toBe(false);
  });
});

describe('changeDepartmentFilter：換部門時清掉不屬於新部門的組別（EMP-R14）', () => {
  it('EMP-AC18：研發部、韌體組 → 換成業務部，組別清掉，地區保留', () => {
    const next = changeDepartmentFilter(ROSTER, { department: '研發部', team: '韌體組', region: '台中' }, '業務部');
    expect(next).toEqual({ department: '業務部', team: null, region: '台中' });
  });

  it('新部門也有這個組別時保留', () => {
    const list = [
      employee(1, { department: '研發部', team: '共用組' }),
      employee(2, { department: '業務部', team: '共用組' }),
    ];
    expect(changeDepartmentFilter(list, { department: '研發部', team: '共用組', region: null }, '業務部')).toEqual({
      department: '業務部',
      team: '共用組',
      region: null,
    });
  });

  it('部門改回「不限」時，組別仍在所有部門的組別裡，保留', () => {
    expect(changeDepartmentFilter(ROSTER, { department: '研發部', team: '韌體組', region: null }, null)).toEqual({
      department: null,
      team: '韌體組',
      region: null,
    });
  });

  it('沒選組別時只換部門', () => {
    expect(changeDepartmentFilter(ROSTER, NO_FILTERS, '研發部')).toEqual({ department: '研發部', team: null, region: null });
  });
});

describe('emptyStateOf：五種空狀態（EMP-R17、EMP-Q08）', () => {
  const filtered: EmployeeFilters = { department: '研發部', team: null, region: '台北' };

  it('員工名單沒有任何員工：沒有員工（EMP-AC23）', () => {
    expect(emptyStateOf({ total: 0, visible: 0, tab: 'all', query: '', filters: NO_FILTERS })).toBe('no-employees');
    expect(emptyStateOf({ total: 0, visible: 0, tab: 'all', query: '王', filters: filtered })).toBe('no-employees');
  });

  it('有關鍵字、沒有篩選，沒有符合的員工：搜尋無結果（EMP-AC15）', () => {
    expect(emptyStateOf({ total: 5, visible: 0, tab: 'all', query: '無此人', filters: NO_FILTERS })).toBe(
      'no-search-results',
    );
  });

  it('有篩選、沒有關鍵字，沒有符合的員工：篩選無結果（EMP-AC20）', () => {
    expect(emptyStateOf({ total: 5, visible: 0, tab: 'all', query: '', filters: filtered })).toBe('no-filter-results');
    expect(
      emptyStateOf({ total: 5, visible: 0, tab: 'all', query: '', filters: { department: null, team: '韌體組', region: null } }),
    ).toBe('no-filter-results');
  });

  it('同時有關鍵字與篩選而沒有結果：搜尋無結果（EMP-Q08 第 6 點）', () => {
    expect(emptyStateOf({ total: 5, visible: 0, tab: 'all', query: '無此人', filters: filtered })).toBe(
      'no-search-results',
    );
  });

  it('沒有關鍵字與篩選，「未報名」沒有員工：全部已報名（EMP-AC24）', () => {
    expect(emptyStateOf({ total: 5, visible: 0, tab: 'unregistered', query: '', filters: NO_FILTERS })).toBe(
      'all-registered',
    );
  });

  it('沒有關鍵字與篩選，「已報名」沒有員工：還沒有人報名（EMP-AC25）', () => {
    expect(emptyStateOf({ total: 5, visible: 0, tab: 'registered', query: '', filters: NO_FILTERS })).toBe(
      'none-registered',
    );
  });

  it('只有空白的關鍵字等於沒有關鍵字（EMP-Q08 第 5 點）', () => {
    expect(emptyStateOf({ total: 5, visible: 0, tab: 'unregistered', query: '   ', filters: NO_FILTERS })).toBe(
      'all-registered',
    );
  });

  it('有列出員工時沒有空狀態', () => {
    expect(emptyStateOf({ total: 5, visible: 2, tab: 'all', query: '王', filters: filtered })).toBeNull();
    expect(emptyStateOf({ total: 5, visible: 5, tab: 'all', query: '', filters: NO_FILTERS })).toBeNull();
  });
});

describe('勾選與一次加入多位（EMP-R18～R21、EMP-R23、EMP-Q08）', () => {
  /** 一頁 20 列，前 5 位已報名（EMP-AC28） */
  const pageRows = Array.from({ length: 20 }, (_, i) => employee(i + 1));
  const registered = new Set([1, 2, 3, 4, 5]);
  const pickable = pageRows.filter((e) => !registered.has(e.id)).map((e) => e.id);

  it('這一頁都沒勾：表頭未勾選、可以按', () => {
    expect(headerCheckState(pageRows, registered, new Set())).toEqual({ checked: false, disabled: false });
  });

  it('只勾一部分：表頭為不確定狀態（EMP-R20、EMP-AC29）', () => {
    expect(headerCheckState(pageRows, registered, new Set(pickable.slice(0, 3)))).toEqual({
      checked: 'indeterminate',
      disabled: false,
    });
  });

  it('能勾的列全部勾選：表頭為勾選；已報名的列不算在內（EMP-R20、EMP-AC29）', () => {
    expect(headerCheckState(pageRows, registered, new Set(pickable))).toEqual({ checked: true, disabled: false });
  });

  it('其他頁的勾選不影響這一頁的表頭（EMP-R19）', () => {
    expect(headerCheckState(pageRows, registered, new Set([101, 102]))).toEqual({ checked: false, disabled: false });
  });

  it('這一頁沒有能勾的列：表頭停用（EMP-Q08 第 2 點）', () => {
    const allRegistered = new Set(pageRows.map((e) => e.id));
    expect(headerCheckState(pageRows, allRegistered, new Set())).toEqual({ checked: false, disabled: true });
  });

  it('按表頭全選：勾起這一頁所有未報名的列，不勾已報名的列（EMP-R19、EMP-AC28）', () => {
    const next = toggleAllOnPage(pageRows, registered, new Set(), true);
    expect(ids(next)).toEqual(pickable);
    expect(next.size).toBe(15);
    for (const id of registered) expect(next.has(id)).toBe(false);
  });

  it('按表頭全選：保留其他頁已勾的列，不勾其他頁的列（EMP-R19、EMP-AC27、EMP-Q08 第 1 點）', () => {
    const next = toggleAllOnPage(pageRows, registered, new Set([101]), true);
    expect(ids(next)).toEqual([...pickable, 101]);
  });

  it('取消表頭：只取消這一頁的勾選，其他頁的保留（EMP-R19、EMP-AC29）', () => {
    const before = new Set([...pickable, 101]);
    expect(ids(toggleAllOnPage(pageRows, registered, before, false))).toEqual([101]);
  });

  it('回傳新的集合，不改動傳入的勾選', () => {
    const before = new Set([6]);
    toggleAllOnPage(pageRows, registered, before, true);
    expect(ids(before)).toEqual([6]);
  });

  it('要加入的員工：勾選中還沒報名的；別處已加入尾牙的不再算在 {n} 裡（EMP-R23、EMP-AC33）', () => {
    const list = [employee(1, { name: '王小明' }), employee(2, { name: '李小華' })];
    expect(ids(selectedToJoin(list, new Set(), new Set([1, 2])))).toEqual([1, 2]);
    expect(ids(selectedToJoin(list, new Set([1]), new Set([1, 2])))).toEqual([2]);
    expect(selectedToJoin(list, new Set([1, 2]), new Set([1, 2]))).toEqual([]);
  });

  it('要加入的員工包含看不到的頁面、分頁或搜尋之外的勾選（EMP-Q08 第 1 點）', () => {
    const list = Array.from({ length: 25 }, (_, i) => employee(i + 1));
    expect(ids(selectedToJoin(list, new Set(), new Set([1, 24])))).toEqual([1, 24]);
  });

  it('已被刪除的員工不算在要加入的員工裡', () => {
    expect(selectedToJoin([employee(1)], new Set(), new Set([1, 99]))).toEqual([1]);
  });
});

describe('findSameNameEmployee：同名提示（EMP-R37）', () => {
  const list = [
    employee(1, { name: '王小明', department: '業務部' }),
    employee(2, { name: '李小華', department: '研發部' }),
  ];

  it('EMP-AC46：已有王小明（業務部），新增時填「王小明」→ 找到業務部的那一位', () => {
    expect(findSameNameEmployee(list, '王小明')).toMatchObject({ id: 1, department: '業務部' });
  });

  it('EMP-AC47：編輯時不和這位員工自己比', () => {
    expect(findSameNameEmployee(list, '王小明', 1)).toBeUndefined();
  });

  it('編輯時改成另一位員工的姓名 → 找到那一位', () => {
    expect(findSameNameEmployee(list, '李小華', 1)).toMatchObject({ id: 2, department: '研發部' });
  });

  it('去掉前後空白再比對；空白姓名不提示（EMP-Q08 第 8 點）', () => {
    expect(findSameNameEmployee(list, ' 王小明 ')).toMatchObject({ id: 1 });
    expect(findSameNameEmployee(list, '')).toBeUndefined();
    expect(findSameNameEmployee(list, '   ')).toBeUndefined();
  });

  it('姓名不同就不提示（只是包含不算）', () => {
    expect(findSameNameEmployee(list, '王小')).toBeUndefined();
    expect(findSameNameEmployee(list, '張三')).toBeUndefined();
  });
});
