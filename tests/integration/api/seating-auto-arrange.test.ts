// 自動排座指令的流程（C 線的部分）：docs/spec/auto-arrange.md ARR-R12（不改備註名稱）、ARR-R13（直接套用、立即儲存、一次復原）、
// ARR-R14（回傳摘要）、ARR-Q02（一位都沒排進去時座位都不變，目前假設）；docs/spec/seating.md SEAT-R76、SEAT-R78；
// docs/architecture.md 第 7.2 節（寫入時仍檢查每桌最多 10 位）、第 8.1 節（autoArrange 指令、summary、undo）、第 11.3 節。
// 排座規則本身由 D 線的 src/domain/auto-arrange.ts 測；這裡用假的 arranger 固定把某幾個人排到某桌。
//
// 假設 src/server/services/seating.ts 匯出：
//   export type AutoArranger = (input: {
//     employees: Employee[]; participants: Participant[]; tables: SeatTable[]; mode: 'unseatedOnly' | 'rebuild';
//   }) => { changes: { participantId: number; tableId: number | null; seatOrder: number | null }[]; summary: AutoArrangeSummary };
//   export function registerAutoArranger(fn: AutoArranger): void;
// autoArrange 指令呼叫登記的函式，把 changes 寫進資料庫，回傳 SeatingResult（participants、tables、undo、summary）。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Employee, Participant, SeatTable } from '@/contracts/entities';
import type { AutoArrangeSummary } from '@/contracts/seating';
import { registerAutoArranger } from '@/server/services/seating';
import { prisma, resetData } from '../../helpers/db';
import { createGuest } from '../../helpers/factory';
import {
  allPositions,
  expectAllContiguous,
  expectError,
  newUnseated,
  noteNameOf,
  operate,
  positionOf,
  postOperation,
  roster,
  seatNewEmployees,
  staffIds,
} from '../../helpers/seating-api';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

type ArrangeInput = {
  employees: Employee[];
  participants: Participant[];
  tables: SeatTable[];
  mode: 'unseatedOnly' | 'rebuild';
};
type Change = { participantId: number; tableId: number | null; seatOrder: number | null };
type ArrangeOutput = { changes: Change[]; summary: AutoArrangeSummary };

const arranger = vi.fn<(input: ArrangeInput) => ArrangeOutput>();

beforeEach(async () => {
  await resetData();
  arranger.mockReset();
  registerAutoArranger(arranger);
});

describe('autoArrange：呼叫登記的排座函式', () => {
  it('把目前的員工名單、參與人員、桌次與範圍交給排座函式', async () => {
    const seated = await seatNewEmployees(3, 2);
    const wang = await newUnseated({ name: '王小明', department: '研發一部' });
    await createGuest({ guestName: '林董' });
    await prisma.seatTable.update({ where: { id: 1 }, data: { noteName: '主桌' } });
    arranger.mockReturnValue({ changes: [], summary: { placed: 0, tableIds: [], left: 0 } });

    await operate({ type: 'autoArrange', mode: 'rebuild' });

    expect(arranger).toHaveBeenCalledTimes(1);
    const input = arranger.mock.calls[0]![0];
    expect(input.mode).toBe('rebuild');
    expect(input.participants.map((p) => p.id).sort((a, b) => a - b)).toEqual(
      [...seated, wang, ...(await prisma.participant.findMany({ where: { kind: 'GUEST' } })).map((g) => g.id)].sort(
        (a, b) => a - b,
      ),
    );
    expect(input.participants.find((p) => p.id === seated[1])).toMatchObject({ tableId: 3, seatOrder: 1 });
    expect(input.employees.map((e) => e.name)).toContain('王小明');
    expect(input.tables).toHaveLength(31);
    expect(input.tables.find((t) => t.id === 1)?.noteName).toBe('主桌');
  });

  it('範圍「只排未入座」也原樣交給排座函式', async () => {
    arranger.mockReturnValue({ changes: [], summary: { placed: 0, tableIds: [], left: 0 } });
    await operate({ type: 'autoArrange', mode: 'unseatedOnly' });
    expect(arranger.mock.calls[0]![0].mode).toBe('unseatedOnly');
  });
});

describe('autoArrange：套用與復原（ARR-R13、SEAT-R76、SEAT-R78）', () => {
  it('直接寫入排座結果，回傳摘要、有變動的人與操作前的狀態', async () => {
    const existing = await seatNewEmployees(2, 2);
    const [a, b, c] = [await newUnseated(), await newUnseated(), await newUnseated()];
    arranger.mockReturnValue({
      changes: [
        { participantId: a, tableId: 2, seatOrder: 2 },
        { participantId: b, tableId: 2, seatOrder: 3 },
        { participantId: c, tableId: 3, seatOrder: 0 },
      ],
      summary: { placed: 3, tableIds: [2, 3], left: 0 },
    });

    const result = await operate({ type: 'autoArrange', mode: 'unseatedOnly' });

    expect(result.summary).toEqual({ placed: 3, tableIds: [2, 3], left: 0 });
    expect(await roster(2)).toEqual([...existing, a, b]);
    expect(await roster(3)).toEqual([c]);
    expect(result.participants.map((p) => p.id).sort((x, y) => x - y)).toEqual([a, b, c].sort((x, y) => x - y));
    expect(result.undo.participants).toEqual(
      expect.arrayContaining([
        { id: a, tableId: null, seatOrder: null },
        { id: b, tableId: null, seatOrder: null },
        { id: c, tableId: null, seatOrder: null },
      ]),
    );
    await expectAllContiguous();
  });

  it('按一次「復原」就回到自動排座之前的全部座位，包含各桌的順序與被移到未入座的外部貴賓（ARR-R13、ARR-AC10）', async () => {
    // A1 桌（內部編號 2）依序：貴賓、甲、乙；B7 桌（4）：丙；丁未入座。清空後重排：貴賓回到未入座，其他人重新排
    const guest = await createGuest({ guestName: '測試貴賓', tableId: 2, seatOrder: 0 });
    const [jia, yi] = await seatNewEmployees(2, 2);
    const [bing] = await seatNewEmployees(4, 1);
    const ding = await newUnseated();
    const before = await allPositions();
    arranger.mockReturnValue({
      changes: [
        { participantId: guest.id, tableId: null, seatOrder: null },
        { participantId: bing!, tableId: 2, seatOrder: 0 },
        { participantId: jia!, tableId: 2, seatOrder: 1 },
        { participantId: yi!, tableId: 2, seatOrder: 2 },
        { participantId: ding, tableId: 2, seatOrder: 3 },
      ],
      summary: { placed: 4, tableIds: [2], left: 0 },
    });

    const result = await operate({ type: 'autoArrange', mode: 'rebuild' });
    expect(await roster(2)).toEqual([bing, jia, yi, ding]);
    expect(await roster(4)).toEqual([]);
    expect(await positionOf(guest.id)).toEqual({ tableId: null, seatOrder: null });

    await operate({ type: 'restore', snapshot: result.undo });
    expect(await allPositions()).toEqual(before);
    expect(await roster(2)).toEqual([guest.id, jia, yi]);
  });

  it('不改任何桌的備註名稱，也不動工作人員（ARR-R12）', async () => {
    await prisma.seatTable.update({ where: { id: 1 }, data: { noteName: '主桌' } });
    await prisma.seatTable.update({ where: { id: 5 }, data: { noteName: '供應商' } });
    const staff = await seatNewEmployees(0, 2);
    const a = await newUnseated();
    arranger.mockReturnValue({
      changes: [{ participantId: a, tableId: 2, seatOrder: 0 }],
      summary: { placed: 1, tableIds: [2], left: 0 },
    });

    const result = await operate({ type: 'autoArrange', mode: 'unseatedOnly' });

    expect(await noteNameOf(1)).toBe('主桌');
    expect(await noteNameOf(5)).toBe('供應商');
    expect(await noteNameOf(2)).toBeNull();
    expect(result.undo.tables).toEqual([]);
    expect(await staffIds()).toEqual(staff);
  });

  it('排不下的人留在未入座，摘要原樣回傳（ARR-R11、ARR-R14）', async () => {
    const a = await newUnseated();
    const b = await newUnseated();
    arranger.mockReturnValue({
      changes: [{ participantId: a, tableId: 30, seatOrder: 0 }],
      summary: { placed: 1, tableIds: [30], left: 1 },
    });
    const result = await operate({ type: 'autoArrange', mode: 'unseatedOnly' });
    expect(result.summary).toEqual({ placed: 1, tableIds: [30], left: 1 });
    expect(await positionOf(b)).toEqual({ tableId: null, seatOrder: null });
  });

  it('一位都沒排進去：座位都不變，清空後重排也不清空（ARR-Q02 的目前假設、ARR-AC14）', async () => {
    const [x] = await seatNewEmployees(3, 1);
    await newUnseated();
    const before = await allPositions();
    // 假的 arranger 先把 B4 桌（3）清空，結果卻一位都沒排進去
    arranger.mockReturnValue({
      changes: [{ participantId: x!, tableId: null, seatOrder: null }],
      summary: { placed: 0, tableIds: [], left: 1 },
    });

    const result = await operate({ type: 'autoArrange', mode: 'rebuild' });

    expect(result.summary).toEqual({ placed: 0, tableIds: [], left: 1 });
    expect(result.undo).toEqual({ participants: [], tables: [] });
    expect(await allPositions()).toEqual(before);
  });

  it('排座結果會讓某一桌超過 10 位：409 TABLE_FULL，整批不寫入（docs/architecture.md 第 7.2 節）', async () => {
    await seatNewEmployees(2, 9);
    const a = await newUnseated();
    const b = await newUnseated();
    const before = await allPositions();
    arranger.mockReturnValue({
      changes: [
        { participantId: a, tableId: 2, seatOrder: 9 },
        { participantId: b, tableId: 2, seatOrder: 10 },
      ],
      summary: { placed: 2, tableIds: [2], left: 0 },
    });

    await expectError(await postOperation({ type: 'autoArrange', mode: 'unseatedOnly' }), 409, 'TABLE_FULL');
    expect(await allPositions()).toEqual(before);
  });
});

// D-018：拖移或「加入人員」可以讓桌次有 11、12 位；自動排座每桌只排到 10 位（auto-arrange.md ARR-R17、docs/architecture.md 第 8.1 節）
describe('autoArrange：桌上已有 11、12 位（ARR-R17、D-018）', () => {
  it('排座沒有動到的桌已有 11、12 位：照樣寫入其他桌，那兩桌的名單與順序不變', async () => {
    const table1 = await seatNewEmployees(1, 12);
    await prisma.seatTable.update({ where: { id: 1 }, data: { noteName: '主桌' } });
    const table4 = await seatNewEmployees(4, 11);
    const a = await newUnseated();
    arranger.mockReturnValue({
      changes: [{ participantId: a, tableId: 2, seatOrder: 0 }],
      summary: { placed: 1, tableIds: [2], left: 0 },
    });

    const result = await operate({ type: 'autoArrange', mode: 'unseatedOnly' });

    expect(result.summary).toEqual({ placed: 1, tableIds: [2], left: 0 });
    expect(await roster(2)).toEqual([a]);
    expect(await roster(1)).toEqual(table1);
    expect(await roster(4)).toEqual(table4);
    await expectAllContiguous();
  });

  it('排座結果把人排進已有 10 位以上的桌（成為第 11、12 位）：409 TABLE_FULL，整批不寫入', async () => {
    await seatNewEmployees(4, 11);
    const a = await newUnseated();
    const b = await newUnseated();
    const before = await allPositions();
    arranger.mockReturnValue({
      changes: [
        { participantId: a, tableId: 2, seatOrder: 0 },
        { participantId: b, tableId: 4, seatOrder: 11 },
      ],
      summary: { placed: 2, tableIds: [2, 4], left: 0 },
    });

    await expectError(await postOperation({ type: 'autoArrange', mode: 'unseatedOnly' }), 409, 'TABLE_FULL');
    expect(await allPositions()).toEqual(before);
  });
});
