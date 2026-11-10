// 顯示規則：顯示名稱、部門、組別、分機、員工第二行、人員面板第二行、桌次部門標示、搜尋。
// 依據：docs/spec/README.md 第 10 節（COM-R10～R15）、participants.md（PPL-R05～R08、PPL-R12、PPL-R13、PPL-R21）、
// seating.md 第 3.2 節（SEAT-R07～R10、SEAT-R49）與 SEAT-R54、SEAT-R56。
// 人物都是規格驗收條件裡的虛構示範資料。
import { describe, expect, it } from 'vitest';
import { STAFF_TABLE_ID, type Employee, type Participant } from '@/contracts/entities';
import {
  buildDirectory,
  departmentOf,
  displayName,
  employeeSecondLine,
  extensionOf,
  isStaff,
  matchesSearch,
  panelSecondLine,
  tableDepartmentLabel,
  tableDepartmentLabels,
  teamOf,
  type Directory,
} from '@/domain/display';

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

// 示範資料：王小明（研發一部、前端組、分機 1234）與他的眷屬；李美華（業務部、分機 5678）；
// 陳大文（研發一部、沒有組別、沒有分機）；外部貴賓林董。
const WANG = employee(1, { name: '王小明', department: '研發一部', team: '前端組', extension: '1234' });
const LEE = employee(2, { name: '李美華', department: '業務部', extension: '5678' });
const CHEN = employee(3, { name: '陳大文', department: '研發一部' });

const pWang = asEmployee(11, WANG.id);
const pWangDependent = asDependent(12, pWang.id, { relation: '配偶' });
const pLee = asEmployee(13, LEE.id);
const pLin = asGuest(14, '林董', { organization: '測試科技 董事長' });
const pChen = asEmployee(15, CHEN.id);

const employees = [WANG, LEE, CHEN];
const participants = [pWang, pWangDependent, pLee, pLin, pChen];
const dir: Directory = buildDirectory({ employees, participants });

/** 改了員工名單或參與人員後重新建立索引（畫面上的資料一律重新推導） */
const rebuild = (changes: { employees?: Employee[]; participants?: Participant[] }) =>
  buildDirectory({ employees: changes.employees ?? employees, participants: changes.participants ?? participants });

describe('顯示名稱（PPL-R07）', () => {
  it('員工是員工名單上的姓名', () => {
    expect(displayName(pWang, dir)).toBe('王小明');
    expect(displayName(pChen, dir)).toBe('陳大文');
  });

  it('眷屬是「{員工姓名}_眷屬」，不加數字，也不含稱謂（PPL-R05）', () => {
    expect(displayName(pWangDependent, dir)).toBe('王小明_眷屬');
  });

  it('外部貴賓是填入的姓名，可以是「貴賓席」（PPL-R06）', () => {
    expect(displayName(pLin, dir)).toBe('林董');
    const seatHolder = asGuest(99, '貴賓席');
    expect(displayName(seatHolder, buildDirectory({ employees, participants: [...participants, seatHolder] }))).toBe(
      '貴賓席',
    );
  });

  it('員工名單改了姓名，員工與眷屬的顯示名稱跟著變（PPL-R12、PPL-AC71）', () => {
    const renamed = rebuild({ employees: [{ ...WANG, name: '王曉明' }, LEE, CHEN] });
    expect(displayName(pWang, renamed)).toBe('王曉明');
    expect(displayName(pWangDependent, renamed)).toBe('王曉明_眷屬');
  });

  it('眷屬的所屬員工改變時，顯示名稱跟著新的所屬員工（PPL-R13、PPL-AC52）', () => {
    const moved = { ...pWangDependent, hostId: pLee.id };
    const next = rebuild({ participants: [pWang, moved, pLee, pLin, pChen] });
    expect(displayName(moved, next)).toBe('李美華_眷屬');
  });
});

describe('部門與組別（PPL-R08、SEAT-R56）', () => {
  it('員工的部門與組別讀自員工名單', () => {
    expect(departmentOf(pWang, dir)).toBe('研發一部');
    expect(teamOf(pWang, dir)).toBe('前端組');
    expect(departmentOf(pLee, dir)).toBe('業務部');
    expect(teamOf(pLee, dir)).toBeNull();
  });

  it('眷屬的部門與組別是所屬員工的', () => {
    expect(departmentOf(pWangDependent, dir)).toBe('研發一部');
    expect(teamOf(pWangDependent, dir)).toBe('前端組');
  });

  it('外部貴賓沒有部門與組別（PPL-R06）', () => {
    expect(departmentOf(pLin, dir)).toBeNull();
    expect(teamOf(pLin, dir)).toBeNull();
  });

  it('員工名單改了部門，員工與眷屬的部門跟著變（PPL-R12、PPL-AC72）', () => {
    const changed = rebuild({ employees: [{ ...WANG, department: '業務部' }, LEE, CHEN] });
    expect(departmentOf(pWang, changed)).toBe('業務部');
    expect(departmentOf(pWangDependent, changed)).toBe('業務部');
  });

  it('眷屬的所屬員工改變時，部門跟著新的所屬員工（PPL-R13、PPL-AC52）', () => {
    const moved = { ...pWangDependent, hostId: pLee.id };
    const next = rebuild({ participants: [pWang, moved, pLee, pLin, pChen] });
    expect(departmentOf(moved, next)).toBe('業務部');
  });
});

describe('分機（PPL-R08、PPL-R31、COM-R13）', () => {
  it('員工有分機', () => {
    expect(extensionOf(pWang, dir)).toBe('1234');
    expect(extensionOf(pLee, dir)).toBe('5678');
  });

  it('沒有分機的員工沒有分機', () => {
    expect(extensionOf(pChen, dir)).toBeNull();
  });

  it('眷屬沒有分機，即使所屬員工有分機', () => {
    expect(extensionOf(pWangDependent, dir)).toBeNull();
  });

  it('外部貴賓沒有分機', () => {
    expect(extensionOf(pLin, dir)).toBeNull();
  });

  it('多個分機以「／」合併後原樣保留（COM-R15）', () => {
    const multi = employee(50, { name: '多分機測試', department: '研發一部', extension: '1234／1235' });
    const p = asEmployee(51, multi.id);
    expect(extensionOf(p, buildDirectory({ employees: [multi], participants: [p] }))).toBe('1234／1235');
  });
});

describe('員工的第二行（COM-R10、COM-AC13）', () => {
  it('有分機時是「{部門}・分機 {分機}」', () => {
    expect(employeeSecondLine(WANG)).toBe('研發一部・分機 1234');
    expect(employeeSecondLine(LEE)).toBe('業務部・分機 5678');
  });

  it('沒有分機時只顯示部門', () => {
    expect(employeeSecondLine(CHEN)).toBe('研發一部');
  });

  it('多個分機以「／」合併顯示（COM-R15、COM-AC15）', () => {
    expect(employeeSecondLine({ department: '研發一部', extension: '1234／1235' })).toBe('研發一部・分機 1234／1235');
  });

  it('只看部門與分機，不放組別', () => {
    expect(employeeSecondLine(WANG)).not.toContain('前端組');
  });
});

describe('座位安排人員面板的第二行（COM-R11、SEAT-R56、COM-AC14、SEAT-AC61）', () => {
  it('員工是「{部門}・{組別}」', () => {
    expect(panelSecondLine('研發一部', '前端組')).toBe('研發一部・前端組');
  });

  it('沒有組別時只顯示部門', () => {
    expect(panelSecondLine('研發一部', null)).toBe('研發一部');
  });

  it('眷屬依所屬員工顯示「{部門}・{組別}」', () => {
    expect(panelSecondLine(departmentOf(pWangDependent, dir) ?? '', teamOf(pWangDependent, dir))).toBe(
      '研發一部・前端組',
    );
  });

  it('不放分機', () => {
    const line = panelSecondLine(departmentOf(pWang, dir) ?? '', teamOf(pWang, dir));
    expect(line).not.toContain('1234');
    expect(line).not.toContain('分機');
  });
});

describe('工作人員（PPL-R10）', () => {
  it('坐在工作人員桌的人是工作人員', () => {
    expect(isStaff({ ...pWang, tableId: STAFF_TABLE_ID })).toBe(true);
  });

  it('坐一般桌或未入座的人不是工作人員', () => {
    expect(isStaff({ ...pWang, tableId: 3 })).toBe(false);
    expect(isStaff({ ...pWang, tableId: null })).toBe(false);
  });
});

describe('桌次的部門標示（SEAT-R07～R10）', () => {
  // 研發一部 101–106、業務部 201–206；參與人員 id 與員工 id 相同
  const rd = [101, 102, 103, 104, 105, 106].map((id) => employee(id, { name: `研發${id}`, department: '研發一部' }));
  const biz = [201, 202, 203, 204, 205, 206].map((id) => employee(id, { name: `業務${id}`, department: '業務部' }));
  const tEmployees = [...rd, ...biz];
  const p = new Map<number, Participant>(tEmployees.map((e) => [e.id, asEmployee(e.id, e.id)]));
  const dep201 = asDependent(1201, 201);
  const dep202 = asDependent(1202, 202);
  const guestA = asGuest(901, '林董');
  const guestB = asGuest(902, '測試貴賓');
  const tParticipants = [...p.values(), dep201, dep202, guestA, guestB];
  const tDir = buildDirectory({ employees: tEmployees, participants: tParticipants });
  const seated = (...ids: number[]): Participant[] =>
    ids.map((id) => {
      const found = tParticipants.find((x) => x.id === id);
      if (!found) throw new Error(`沒有參與人員 ${id}`);
      return found;
    });

  it('取員工與眷屬（依所屬員工）的部門，同一個部門只算一次，以「＋」連接（SEAT-AC22）', () => {
    expect(tableDepartmentLabel(seated(101, 102, 103, 201, 1201), tDir)).toBe('研發一部＋業務部');
    expect(tableDepartmentLabels(seated(101, 102, 103), tDir)).toEqual(['研發一部']);
  });

  it('有外部貴賓時在最後加「貴賓」（SEAT-R08、SEAT-AC22）', () => {
    expect(tableDepartmentLabel(seated(101, 102, 103, 201, 1201, 901), tDir)).toBe('研發一部＋業務部＋貴賓');
  });

  it('外部貴賓比員工多，「貴賓」仍排在最後', () => {
    expect(tableDepartmentLabel(seated(901, 902, 101), tDir)).toBe('研發一部＋貴賓');
  });

  it('只有外部貴賓時顯示「貴賓」（SEAT-R08、SEAT-AC23）', () => {
    expect(tableDepartmentLabel(seated(901, 902), tDir)).toBe('貴賓');
  });

  it('沒有任何人時是「空桌」（SEAT-R09）', () => {
    expect(tableDepartmentLabel([], tDir)).toBe('空桌');
    expect(tableDepartmentLabels([], tDir)).toEqual([]);
  });

  it('依人數多到少排列，人數改變就重新排列（SEAT-R07、SEAT-R10、SEAT-AC24）', () => {
    expect(tableDepartmentLabel(seated(101, 102, 103, 201, 202), tDir)).toBe('研發一部＋業務部');
    expect(tableDepartmentLabel(seated(101, 102, 103, 201, 202, 203, 204), tDir)).toBe('業務部＋研發一部');
    expect(tableDepartmentLabel(seated(101, 102, 103), tDir)).toBe('研發一部');
  });

  it('眷屬算所屬員工的部門，所屬員工不在這一桌也一樣', () => {
    expect(tableDepartmentLabel(seated(101, 1201, 1202), tDir)).toBe('業務部＋研發一部');
  });

  it('人數相同時，依名單上先出現的部門在前（SEAT-Q04 的目前假設）', () => {
    expect(tableDepartmentLabel(seated(201, 101), tDir)).toBe('業務部＋研發一部');
    expect(tableDepartmentLabel(seated(101, 201), tDir)).toBe('研發一部＋業務部');
    expect(tableDepartmentLabel(seated(201, 101, 102, 202), tDir)).toBe('業務部＋研發一部');
  });

  it('員工名單改了部門，桌次與眷屬所在桌次的部門跟著變（SEAT-R10、SEAT-AC25）', () => {
    const changed = buildDirectory({
      employees: tEmployees.map((e) => (e.id === 101 ? { ...e, department: '業務部' } : e)),
      participants: tParticipants,
    });
    expect(tableDepartmentLabels(seated(101, 102), changed)).toContain('業務部');

    const hostMoved = buildDirectory({
      employees: tEmployees.map((e) => (e.id === 201 ? { ...e, department: '研發一部' } : e)),
      participants: tParticipants,
    });
    expect(tableDepartmentLabel(seated(1201), tDir)).toBe('業務部');
    expect(tableDepartmentLabel(seated(1201), hostMoved)).toBe('研發一部');
  });

  it('眷屬的所屬員工改變時，桌次部門跟著新的所屬員工（SEAT-R10）', () => {
    const moved = { ...dep201, hostId: 101 };
    const next = buildDirectory({
      employees: tEmployees,
      participants: tParticipants.map((x) => (x.id === dep201.id ? moved : x)),
    });
    expect(tableDepartmentLabel([moved], next)).toBe('研發一部');
  });

  it('工作人員桌的部門用同樣的規則（SEAT-R49、SEAT-AC48）', () => {
    const staff = seated(101, 102).map((x) => ({ ...x, tableId: STAFF_TABLE_ID }));
    expect(tableDepartmentLabel(staff, tDir)).toBe('研發一部');
  });
});

describe('搜尋（COM-R14、COM-R15、PPL-R21、SEAT-R54）', () => {
  const matching = (query: string, d: Directory = dir) =>
    participants.filter((x) => matchesSearch(x, d, query)).map((x) => displayName(x, d));

  it('沒有搜尋字時全部符合', () => {
    expect(matching('')).toHaveLength(participants.length);
    expect(matching('   ')).toHaveLength(participants.length);
  });

  it('用姓名搜尋：員工與他的眷屬都列出（PPL-AC11）', () => {
    expect(matching('王小明')).toEqual(['王小明', '王小明_眷屬']);
  });

  it('用姓名的一部分搜尋', () => {
    expect(matching('王')).toEqual(['王小明', '王小明_眷屬']);
  });

  it('用分機搜尋：只列出那位員工，不列出他的眷屬（COM-R14、PPL-AC10、COM-AC14、SEAT-AC51）', () => {
    expect(matching('1234')).toEqual(['王小明']);
    expect(matching('5678')).toEqual(['李美華']);
  });

  it('有兩個分機的員工，用其中任一個分機都搜尋得到（COM-R15、COM-AC15）', () => {
    const multi = employee(60, { name: '多分機測試', department: '研發一部', extension: '1234／1235' });
    const p = asEmployee(61, multi.id);
    const d = buildDirectory({ employees: [multi], participants: [p] });
    expect(matchesSearch(p, d, '1234')).toBe(true);
    expect(matchesSearch(p, d, '1235')).toBe(true);
    expect(matchesSearch(p, d, '1234／1235')).toBe(true);
    expect(matchesSearch(p, d, '1236')).toBe(false);
  });

  it('用部門搜尋：員工與部門相同的眷屬都列出（PPL-R21）', () => {
    expect(matching('研發一部')).toEqual(['王小明', '王小明_眷屬', '陳大文']);
  });

  it('用組別搜尋找得到該組的員工（SEAT-R54、SEAT-AC51）', () => {
    const found = matching('前端組');
    expect(found).toContain('王小明');
    expect(found).not.toContain('李美華');
    expect(found).not.toContain('陳大文');
  });

  it('用外部貴賓的單位／頭銜搜尋（PPL-AC12、SEAT-AC51）', () => {
    expect(matching('測試科技')).toEqual(['林董']);
  });

  it('沒有人符合時一個都不列', () => {
    expect(matching('xyz')).toEqual([]);
  });

  it('員工名單改了姓名後，用新姓名找得到員工與眷屬，舊姓名找不到（PPL-R12、PPL-AC71）', () => {
    const renamed = rebuild({ employees: [{ ...WANG, name: '王曉明' }, LEE, CHEN] });
    expect(matching('王曉明', renamed)).toEqual(['王曉明', '王曉明_眷屬']);
    expect(matching('王小明', renamed)).toEqual([]);
  });
});
