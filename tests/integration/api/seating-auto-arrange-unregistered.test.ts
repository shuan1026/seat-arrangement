// 自動排座接上 D 線的演算法（docs/plan/implementation-plan.md 第 5.2 節「自動排座」、第 6 節第 1 點）：
// 這個檔案的模組裡不呼叫 registerAutoArranger，直接打 POST /api/seating/operations 的 autoArrange，
// 用的就是伺服器預設的排座函式，也就是 src/domain/auto-arrange.ts 的 autoArrange（不 mock）。
// 依據：docs/spec/auto-arrange.md 第 3 節 ARR-R01～R16、第 5.1 節 ARR-AC01～AC14、AC21、AC22，第 5.2 節 ARR-AC19、AC20；
// ARR-Q02（一位都沒排進去時座位都不變）；docs/spec/seating.md SEAT-R06（座號從 0 起連續）、SEAT-R76、SEAT-R78（一次復原）。
// 排座規則本身的細節在 tests/unit/domain/auto-arrange*.test.ts（純函式）；C 線用假 arranger 測流程的整合測試在
// seating-auto-arrange.test.ts（那個檔案自己登記假的 arranger，vitest 每個檔案的模組各自獨立，不影響這裡）。
// 這裡驗證接上之後：伺服器把資料庫的員工名單、參與人員與桌次交給演算法，寫進資料庫的結果、回傳的 summary 都符合規格。
//
// 原本這個檔案驗證「沒有登記排座函式時回錯誤、不寫入」，那是階段 2 還沒接上時的暫時行為；
// 階段 3 接上之後，沒有另外登記時就用 D 線的演算法，所以改成這裡的測試。
//
// 假設：src/server/services/seating.ts 的自動排座預設使用 src/domain/auto-arrange.ts 的 autoArrange，
// 只要 import Route Handler（tests/helpers/seating-api.ts）就是接好的，不必先呼叫 registerAutoArranger。
// 測試資料用 tests/helpers/auto-arrange-scenario.ts 的 Scenario 照規格的寫法建構，再原樣寫進測試資料庫；都是虛構資料。
// D-019：資料庫與 summary 用內部編號；規格寫的桌號換成內部編號（B1 = 1、A1 = 2、B4 = 3、B7 = 4、A10 = 29、A13 = 30），
// 填桌順序就是內部編號的順序。Sonner 的 {k} 是 summary.tableIds 的個數。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF_TABLE_ID, TABLE_COUNT } from '@/contracts/entities';
import type { SeatingResult } from '@/contracts/seating';
import { buildFixture2026, GUEST_COUNT_2026, NOTE_TABLES_2026 } from '../../helpers/auto-arrange-fixture-2026';
import { dep, range, Scenario, type ArrangeMode } from '../../helpers/auto-arrange-scenario';
import { prisma, resetData } from '../../helpers/db';
import { allPositions, expectAllContiguous, noteNameOf, operate } from '../../helpers/seating-api';
import { codeOf } from '../../helpers/table-codes';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

beforeEach(async () => {
  await resetData();
});

/** 寫進資料庫之後的對照：顯示名稱 ↔ 參與人員 id */
class Stored {
  constructor(
    readonly scenario: Scenario,
    readonly idOf: ReadonlyMap<string, number>,
    readonly nameOf: ReadonlyMap<number, string>,
  ) {}

  /** 內部編號 tableId 的桌依座號的顯示名稱（0 是工作人員桌） */
  async table(tableId: number): Promise<string[]> {
    const rows = await prisma.participant.findMany({ where: { tableId }, orderBy: [{ seatOrder: 'asc' }, { id: 'asc' }] });
    return rows.map((p) => this.nameOf.get(p.id) ?? `#${p.id}`);
  }

  /** 未入座的人（不含工作人員），依加入資料的先後 */
  async unseated(): Promise<string[]> {
    const rows = await prisma.participant.findMany({ where: { tableId: null }, orderBy: { id: 'asc' } });
    return rows.map((p) => this.nameOf.get(p.id) ?? `#${p.id}`);
  }

  async position(name: string) {
    const id = this.idOf.get(name);
    if (id === undefined) throw new Error(`測試資料沒有「${name}」`);
    const p = await prisma.participant.findUniqueOrThrow({ where: { id } });
    return { tableId: p.tableId, seatOrder: p.seatOrder };
  }
}

/**
 * 把 Scenario 原樣寫進資料庫：員工名單順序（sortOrder）、參與人員（依加入先後建立）、眷屬的所屬員工、座位與座號、備註名稱。
 * 資料庫的 id 和 Scenario 的 id 不同，用顯示名稱對照。
 */
async function store(s: Scenario): Promise<Stored> {
  const employeeIds = new Map<number, number>();
  for (const e of s.employees) {
    const row = await prisma.employee.create({
      data: { name: e.name, department: e.department, team: e.team, sortOrder: e.sortOrder },
    });
    employeeIds.set(e.id, row.id);
  }
  const participantIds = new Map<number, number>();
  const idOf = new Map<string, number>();
  const nameOf = new Map<number, string>();
  for (const p of s.participants) {
    const row = await prisma.participant.create({
      data: {
        kind: p.kind,
        employeeId: p.employeeId === null ? null : (employeeIds.get(p.employeeId) ?? null),
        hostId: p.hostId === null ? null : (participantIds.get(p.hostId) ?? null),
        relation: p.relation,
        guestName: p.guestName,
        tableId: p.tableId,
        seatOrder: p.seatOrder,
      },
    });
    participantIds.set(p.id, row.id);
    const name = s.nameOf(p.id);
    idOf.set(name, row.id);
    nameOf.set(row.id, name);
  }
  for (const t of s.tables) {
    if (t.noteName !== null) await prisma.seatTable.update({ where: { id: t.id }, data: { noteName: t.noteName } });
  }
  return new Stored(s, idOf, nameOf);
}

const arrange = (mode: ArrangeMode): Promise<SeatingResult> => operate({ type: 'autoArrange', mode });

/** 排座之後每一次都要成立：每桌最多 10 位、座號從 0 起連續、未入座沒有座號（SEAT-R06、docs/architecture.md 第 7.2 節） */
async function expectValidSeats() {
  await expectAllContiguous();
  for (let t = 1; t <= TABLE_COUNT; t++) {
    expect(await prisma.participant.count({ where: { tableId: t } }), `${codeOf(t)} 桌`).toBeLessThanOrEqual(10);
  }
}

describe('只排未入座（ARR-R03、ARR-R05～R10）', () => {
  it('ARR-AC01：同部門依組別第一次出現的先後、沒有組別的排在部門最後、眷屬緊接在員工後面 → B1 桌依序為業1、業4、業4_眷屬、業2、業5、業3、研1；Sonner 的數字是 7 位、1 桌（ARR-AC15）', async () => {
    const s = new Scenario()
      .addEmployee('業1', '業務部', '二組')
      .addEmployee('業2', '業務部', '一組')
      .addEmployee('業3', '業務部')
      .addEmployee('業4', '業務部', '二組', { dependent: true })
      .addEmployee('研1', '研發部')
      .addEmployee('業5', '業務部', '一組');
    const db = await store(s);

    const result = await arrange('unseatedOnly');

    expect(await db.table(1)).toEqual(['業1', '業4', dep('業4'), '業2', '業5', '業3', '研1']);
    expect(result.summary).toEqual({ placed: 7, tableIds: [1], left: 0 });
    expect(await db.unseated()).toEqual([]);
    await expectValidSeats();
  });

  it('ARR-AC02：業務部 7 人、研發部 7 人 → B1 桌業1–業7、研1–研3；A1 桌研4–研7；「已把 14 位安排到 2 桌。」的數字', async () => {
    const s = new Scenario().addGroup('業務部', null, range('業', 1, 7)).addGroup('研發部', null, range('研', 1, 7));
    const db = await store(s);

    const result = await arrange('unseatedOnly');

    expect(await db.table(1)).toEqual([...range('業', 1, 7), ...range('研', 1, 3)]);
    expect(await db.table(2)).toEqual(range('研', 4, 7));
    expect(result.summary).toEqual({ placed: 14, tableIds: [1, 2], left: 0 });
    await expectValidSeats();
  });

  it('ARR-AC03：一組 12 人 → B1 桌研1–研10；A1 桌研11–研12（ARR-R09）', async () => {
    const db = await store(new Scenario().addGroup('研發部', '前端組', range('研', 1, 12)));
    const result = await arrange('unseatedOnly');
    expect(await db.table(1)).toEqual(range('研', 1, 10));
    expect(await db.table(2)).toEqual(range('研', 11, 12));
    expect(result.summary).toEqual({ placed: 12, tableIds: [1, 2], left: 0 });
  });

  it('ARR-AC04：前端組 12 人超過空位，先由同部門的後端組、再由後面部門的行1 填，才拆前端組（ARR-R08、ARR-R09）', async () => {
    const db = await store(
      new Scenario()
        .addGroup('研發部', '前端組', range('研', 1, 12))
        .addGroup('研發部', '後端組', range('後', 1, 3))
        .addGroup('行政部', null, ['行1']),
    );
    await arrange('unseatedOnly');
    expect(await db.table(1)).toEqual(['後1', '後2', '後3', '行1', ...range('研', 1, 6)]);
    expect(await db.table(2)).toEqual(range('研', 7, 12));
  });

  it('ARR-AC05：南區組 5 人排不進剩 4 位時取同部門最近的中區組；剩 1 位時取研發部的研1（ARR-R08）', async () => {
    const db = await store(
      new Scenario()
        .addGroup('業務部', '北區組', range('北', 1, 6))
        .addGroup('業務部', '南區組', range('南', 1, 5))
        .addGroup('業務部', '中區組', range('中', 1, 3))
        .addGroup('業務部', '東區組', range('東', 1, 2))
        .addGroup('研發部', null, ['研1']),
    );
    const result = await arrange('unseatedOnly');
    expect(await db.table(1)).toEqual([...range('北', 1, 6), ...range('中', 1, 3), '研1']);
    expect(await db.table(2)).toEqual([...range('南', 1, 5), '東1', '東2']);
    expect(result.summary).toEqual({ placed: 17, tableIds: [1, 2], left: 0 });
  });

  it('ARR-AC06：B1 桌已坐 9 位，業1 帶眷屬（2 人）排不進 → B1 桌第 10 位是業2；A1 桌業1、業1_眷屬', async () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 9))
      .addEmployee('業1', '業務部', null, { dependent: true })
      .addEmployee('業2', '業務部')
      .seat(1, range('行', 1, 9));
    const db = await store(s);

    const result = await arrange('unseatedOnly');

    expect(await db.table(1)).toEqual([...range('行', 1, 9), '業2']);
    expect(await db.table(2)).toEqual(['業1', dep('業1')]);
    expect(result.summary).toEqual({ placed: 3, tableIds: [1, 2], left: 0 });
    // 已入座的人不動，各桌原本的座位順序不變（ARR-R03）
    expect(await db.position('行1')).toEqual({ tableId: 1, seatOrder: 0 });
    await expectValidSeats();
  });

  it('ARR-AC07：拆點落在員工與眷屬之間、沒有人可以補 → B1 桌第 9 位業1、第 10 位空著；A1 桌業2、業2_眷屬（ARR-R09、ARR-R16、D-009）', async () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 8))
      .addGroup('業務部', '北區組', ['業1', '業2'], ['業2'])
      .seat(1, range('行', 1, 8));
    const db = await store(s);

    const result = await arrange('unseatedOnly');

    expect(await db.table(1)).toEqual([...range('行', 1, 8), '業1']);
    expect(await db.table(2)).toEqual(['業2', dep('業2')]);
    expect(result.summary).toEqual({ placed: 3, tableIds: [1, 2], left: 0 });
  });

  it('ARR-AC08：有備註名稱的桌不用；已坐滿的桌跳過；外部貴賓不排 → A1 桌研1–研8、業1、業2；B7 桌業3；賓4 未入座；摘要是 A1、B7 兩桌（Sonner「2 桌」）（ARR-R01、R02、R03、R14）', async () => {
    const s = new Scenario()
      .addGroup('研發部', null, range('研', 1, 8))
      .addGroup('行政部', null, range('行', 1, 10))
      .addGroup('業務部', '北區組', range('業', 1, 3))
      .addGuest('賓1')
      .addGuest('賓2')
      .addGuest('賓3')
      .addGuest('賓4')
      .note(1, '主桌')
      .seat(1, ['賓1', '賓2', '賓3'])
      .seat(2, range('研', 1, 8))
      .seat(3, range('行', 1, 10));
    const db = await store(s);

    const result = await arrange('unseatedOnly');

    expect(await db.table(1)).toEqual(['賓1', '賓2', '賓3']);
    expect(await db.table(2)).toEqual([...range('研', 1, 8), '業1', '業2']);
    expect(await db.table(3)).toEqual(range('行', 1, 10));
    expect(await db.table(4)).toEqual(['業3']);
    expect(await db.unseated()).toEqual(['賓4']);
    expect(result.summary).toEqual({ placed: 3, tableIds: [2, 4], left: 0 });
    expect(await noteNameOf(1)).toBe('主桌');
  });

  it('ARR-AC11：工作人員不排、工作人員的眷屬照常排；外部貴賓不排 → B1 桌第 10 位業1_眷屬；A1 桌業2（ARR-R01、ARR-R05）', async () => {
    const db = await store(arrangeWithStaff());

    const result = await arrange('unseatedOnly');

    expect(await db.table(1)).toEqual([...range('行', 1, 9), dep('業1')]);
    expect(await db.table(2)).toEqual(['業2']);
    expect(await db.table(STAFF_TABLE_ID)).toEqual(['業1']);
    expect(await db.unseated()).toEqual(['賓1']);
    expect(result.summary).toEqual({ placed: 2, tableIds: [1, 2], left: 0 });
  });

  it('ARR-AC13：空位不夠 → A10 桌第 9、10 位業1、業2；A13 桌第 10 位業3；研1–研4 留在未入座；摘要「還有 4 位排不下」（ARR-R09、ARR-R11、ARR-R14）', async () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 17))
      .addGroup('業務部', '北區組', range('業', 1, 3))
      .addGroup('研發部', '前端組', range('研', 1, 4))
      .seat(29, range('行', 1, 8))
      .seat(30, range('行', 9, 17));
    for (let t = 1; t <= 28; t++) s.note(t, `備註${t}`);
    const db = await store(s);

    const result = await arrange('unseatedOnly');

    expect(await db.table(29)).toEqual([...range('行', 1, 8), '業1', '業2']);
    expect(await db.table(30)).toEqual([...range('行', 9, 17), '業3']);
    expect(await db.unseated()).toEqual(range('研', 1, 4));
    expect(result.summary).toEqual({ placed: 3, tableIds: [29, 30], left: 4 });
    for (let t = 1; t <= 28; t++) expect(await db.table(t), `${codeOf(t)} 桌`).toEqual([]);
  });

  it('ARR-AC21：拆點落在員工與眷屬之間、有人可以補 → B1 桌第 9、10 位業1、南2；A1 桌業2、業2_眷屬、南1、南1_眷屬、南3、研1–研3（ARR-R16）', async () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 8))
      .addGroup('業務部', '北區組', ['業1', '業2'], ['業2'])
      .addGroup('業務部', '南區組', ['南1', '南2', '南3'], ['南1'])
      .addGroup('研發部', '前端組', range('研', 1, 3))
      .seat(1, range('行', 1, 8));
    const db = await store(s);

    const result = await arrange('unseatedOnly');

    expect(await db.table(1)).toEqual([...range('行', 1, 8), '業1', '南2']);
    expect(await db.table(2)).toEqual(['業2', dep('業2'), '南1', dep('南1'), '南3', ...range('研', 1, 3)]);
    expect(result.summary).toEqual({ placed: 10, tableIds: [1, 2], left: 0 });
  });

  it('ARR-AC22：沒有組別的員工與眷屬遇到只剩 1 個空位 → B1 桌第 10 位研1；A1 桌業1、業1_眷屬、研2（ARR-R06、R09、R16）', async () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 9))
      .addEmployee('業1', '業務部', null, { dependent: true })
      .addGroup('研發部', '前端組', ['研1', '研2'])
      .seat(1, range('行', 1, 9));
    const db = await store(s);

    const result = await arrange('unseatedOnly');

    expect(await db.table(1)).toEqual([...range('行', 1, 9), '研1']);
    expect(await db.table(2)).toEqual(['業1', dep('業1'), '研2']);
    expect(result.summary).toEqual({ placed: 4, tableIds: [1, 2], left: 0 });
  });
});

/** ARR-AC11、AC12 的資料：B1 桌坐行1–行9；業1 是工作人員、業1_眷屬未入座；業2、外部貴賓賓1 未入座 */
function arrangeWithStaff(): Scenario {
  return new Scenario()
    .addGroup('行政部', null, range('行', 1, 9))
    .addEmployee('業1', '業務部', null, { dependent: true })
    .addEmployee('業2', '業務部')
    .addGuest('賓1')
    .seat(1, range('行', 1, 9))
    .staff(['業1']);
}

/** ARR-AC09 的資料：B1 桌「主桌」業1、業2、賓1；A1 桌賓2、研1–研9；B4 桌「供應商」沒有人；B7 桌業3；研10 未入座 */
function rebuildScenario(): Scenario {
  return new Scenario()
    .addGroup('業務部', null, range('業', 1, 3))
    .addGroup('研發部', null, range('研', 1, 10))
    .addGuest('賓1')
    .addGuest('賓2')
    .note(1, '主桌')
    .note(3, '供應商')
    .seat(1, ['業1', '業2', '賓1'])
    .seat(2, ['賓2', ...range('研', 1, 9)])
    .seat(4, ['業3']);
}

describe('清空後重排（ARR-R04、ARR-R12）與復原（ARR-R13）', () => {
  it('ARR-AC09：有備註名稱的桌與桌上的人不動；可用的桌清空重排；原本坐在可用桌的外部貴賓回到未入座 → A1 桌業3、研1–研9；B7 桌研10；摘要 11 位、2 桌', async () => {
    const db = await store(rebuildScenario());

    const result = await arrange('rebuild');

    expect(await db.table(1)).toEqual(['業1', '業2', '賓1']);
    expect(await db.table(2)).toEqual(['業3', ...range('研', 1, 9)]);
    expect(await db.table(3)).toEqual([]);
    expect(await db.table(4)).toEqual(['研10']);
    expect(await db.unseated()).toEqual(['賓2']);
    expect(result.summary).toEqual({ placed: 11, tableIds: [2, 4], left: 0 });
    expect(await noteNameOf(1)).toBe('主桌');
    expect(await noteNameOf(3)).toBe('供應商');
    for (const t of [2, 4, 5, 30]) expect(await noteNameOf(t), `${codeOf(t)} 桌`).toBeNull();
    await expectValidSeats();
  });

  it('ARR-AC10：ARR-AC09 排完後送回這次的 undo → 回到排座前的全部座位，包含各桌的順序與回到未入座的外部貴賓；備註名稱不變', async () => {
    const db = await store(rebuildScenario());
    const before = await allPositions();

    const result = await arrange('rebuild');
    expect(await allPositions()).not.toEqual(before);

    await operate({ type: 'restore', snapshot: result.undo });

    expect(await allPositions()).toEqual(before);
    expect(await db.table(2)).toEqual(['賓2', ...range('研', 1, 9)]);
    expect(await db.table(4)).toEqual(['業3']);
    expect(await db.position('研10')).toEqual({ tableId: null, seatOrder: null });
    expect(await noteNameOf(1)).toBe('主桌');
    expect(await noteNameOf(3)).toBe('供應商');
  });

  it('ARR-AC12：清空後重排也不排工作人員 → B1 桌行1–行9、業1_眷屬；A1 桌業2；摘要 11 位（ARR-R01、ARR-R04）', async () => {
    const db = await store(arrangeWithStaff());

    const result = await arrange('rebuild');

    expect(await db.table(1)).toEqual([...range('行', 1, 9), dep('業1')]);
    expect(await db.table(2)).toEqual(['業2']);
    expect(await db.table(STAFF_TABLE_ID)).toEqual(['業1']);
    expect(await db.unseated()).toEqual(['賓1']);
    expect(result.summary).toEqual({ placed: 11, tableIds: [1, 2], left: 0 });
  });

  it('只排未入座的復原：送回 undo 後新排的人回到未入座，原本已入座的人不動', async () => {
    const s = new Scenario()
      .addGroup('行政部', null, range('行', 1, 9))
      .addEmployee('業1', '業務部', null, { dependent: true })
      .addEmployee('業2', '業務部')
      .seat(1, range('行', 1, 9));
    await store(s);
    const before = await allPositions();

    const result = await arrange('unseatedOnly');
    await operate({ type: 'restore', snapshot: result.undo });

    expect(await allPositions()).toEqual(before);
    await expectValidSeats();
  });
});

describe('一位都沒排進去（ARR-Q02 的目前假設）', () => {
  it('ARR-AC14：30 桌都坐滿 10 人、業1 未入座 → 座位都不變；摘要沒有排進任何人', async () => {
    // 300 位佔位的外部貴賓一次寫入
    await prisma.participant.createMany({
      data: Array.from({ length: TABLE_COUNT * 10 }, (_, i) => ({
        kind: 'GUEST' as const,
        guestName: `佔位貴賓${i + 1}`,
        tableId: Math.floor(i / 10) + 1,
        seatOrder: i % 10,
      })),
    });
    await store(new Scenario().addEmployee('業1', '業務部'));
    const before = await allPositions();

    const result = await arrange('unseatedOnly');

    expect(result.summary).toMatchObject({ placed: 0, tableIds: [] });
    expect(result.summary?.left).toBe(1);
    expect(await allPositions()).toEqual(before);
  });

  it('沒有任何候選人（只有外部貴賓未入座）：只排未入座時座位都不變', async () => {
    await store(new Scenario().addGroup('行政部', null, ['行1']).addGuest('賓1').seat(1, ['行1']));
    const before = await allPositions();
    const result = await arrange('unseatedOnly');
    expect(result.summary).toEqual({ placed: 0, tableIds: [], left: 0 });
    expect(await allPositions()).toEqual(before);
  });

  it('可用的桌都有備註名稱：清空後重排也不清空任何一桌，座位都不變', async () => {
    const s = new Scenario().addGroup('行政部', null, ['行1', '行2']).seat(5, ['行1']);
    for (let t = 1; t <= TABLE_COUNT; t++) s.note(t, `備註${t}`);
    await store(s);
    const before = await allPositions();
    const result = await arrange('rebuild');
    expect(result.summary?.placed).toBe(0);
    expect(await allPositions()).toEqual(before);
  });
});

describe('2026 年示範資料的結構（auto-arrange.md 第 5.2 節、ARR-AC19、ARR-AC20）', () => {
  it.each<ArrangeMode>(['rebuild', 'unseatedOnly'])(
    '%s：寫進資料庫的結果和演算法算出來的完全相同；211 位排進 B4 到 A4 之間的 22 桌（Sonner「已把 211 位安排到 22 桌。」；A14 桌 9 位、A4 桌 2 位）、外部貴賓都留在未入座、有備註名稱的 5 桌是空桌',
    async (mode) => {
      const fixture = buildFixture2026();
      const db = await store(fixture.scenario);
      // 演算法本身（純函式）對同一份資料的結果；tests/unit/domain/auto-arrange-2026.test.ts 逐桌驗證過規格的表
      const expected = fixture.scenario.run(mode);

      const result = await arrange(mode);

      expect(result.summary).toEqual({ placed: 211, tableIds: expected.summary.tableIds, left: 0 });
      // 填桌順序的第一桌 B4（內部編號 3）到最後一桌 A4（27）；{k} 是 22 桌
      expect(Math.min(...(result.summary?.tableIds ?? []))).toBe(3);
      expect(Math.max(...(result.summary?.tableIds ?? []))).toBe(27);
      expect(new Set(result.summary?.tableIds ?? []).size).toBe(22);
      for (let t = 1; t <= TABLE_COUNT; t++) {
        expect(await db.table(t), `${codeOf(t)} 桌`).toEqual(expected.table(t));
      }
      expect((await db.table(26)).length).toBe(9); // A14 桌
      expect((await db.table(27)).length).toBe(2); // A4 桌
      // A7、A10、A13 桌（28、29、30）與有備註名稱的 5 桌是空桌
      for (const t of [28, 29, 30, ...Object.keys(NOTE_TABLES_2026).map(Number)]) {
        expect(await db.table(t), `${codeOf(t)} 桌`).toEqual([]);
      }
      for (const [id, noteName] of Object.entries(NOTE_TABLES_2026)) expect(await noteNameOf(Number(id))).toBe(noteName);
      const unseated = await db.unseated();
      expect(unseated).toHaveLength(GUEST_COUNT_2026);
      expect(unseated).toEqual(fixture.guests);
      await expectValidSeats();
    },
    120_000,
  );
});
