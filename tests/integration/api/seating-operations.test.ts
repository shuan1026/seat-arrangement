// POST /api/seating/operations：座位異動指令（docs/architecture.md 第 7.2、8.1、8.2 節）。
// docs/spec/seating.md SEAT-R02、R06、R16～R20、R26、R28～R33、R35～R36、R38、R40～R46、R48、R50、R51、R76～R78、R85、R86；
// docs/spec/README.md COM-R01（立即儲存）、COM-R05（重新整理看到最後儲存的結果）、COM-R07、COM-R08（別人剛改過資料）。
// 每個寫入在一個交易內完成，回傳有變動的人（完整資料）、有變動的桌，以及操作前的狀態 undo；送回 restore 就能復原。
// 這個檔案的 seat、seatMany 都不帶 allowOverflow，是選擇桌次對話框那條路，上限 10 位（D-018、SEAT-R88）；
// 帶 allowOverflow（拖移、「加入人員」）到 12 位的情況在 seating-overflow.test.ts。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import { prisma, resetData } from '../../helpers/db';
import { createDependent, createGuest, createRegisteredEmployee } from '../../helpers/factory';
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

beforeEach(async () => {
  await resetData();
});

const unseated = { tableId: null, seatOrder: null };

describe('seat：入座（SEAT-R16～R18、COM-R01）', () => {
  it('未入座的人入座：排到名單最後並立即儲存；回應有這位的新位置與操作前的狀態（SEAT-R16、SEAT-AC01、SEAT-AC87）', async () => {
    const table3 = await seatNewEmployees(3, 4);
    const wang = await newUnseated({ name: '王小明', department: '研發一部' });

    const result = await operate({ type: 'seat', participantId: wang, tableId: 3 });

    expect(await roster(3)).toEqual([...table3, wang]);
    expect(await positionOf(wang)).toEqual({ tableId: 3, seatOrder: 4 });
    expect(result.participants.find((p) => p.id === wang)).toMatchObject({ tableId: 3, seatOrder: 4, kind: 'EMPLOYEE' });
    expect(result.undo.participants).toEqual([{ id: wang, ...unseated }]);
    expect(result.undo.tables).toEqual([]);
  });

  it('放在名單的某一列：插入那一列，後面的人往後移；回應包含往後移的人（SEAT-R17、SEAT-AC02）', async () => {
    const [a, b, c] = await seatNewEmployees(3, 3);
    const wang = await newUnseated();

    const result = await operate({ type: 'seat', participantId: wang, tableId: 3, index: 1 });

    expect(await roster(3)).toEqual([a, wang, b, c]);
    expect(result.participants.map((p) => p.id).sort((x, y) => x - y)).toEqual([wang, b!, c!].sort((x, y) => x - y));
    expect(result.undo.participants).toEqual(
      expect.arrayContaining([
        { id: wang, ...unseated },
        { id: b, tableId: 3, seatOrder: 1 },
        { id: c, tableId: 3, seatOrder: 2 },
      ]),
    );
    await expectAllContiguous();
  });

  it('放在空位列：排到名單最後（SEAT-R17、SEAT-AC03）', async () => {
    const [a, b] = await seatNewEmployees(3, 2);
    const wang = await newUnseated();
    await operate({ type: 'seat', participantId: wang, tableId: 3, index: 6 });
    expect(await roster(3)).toEqual([a, b, wang]);
    await expectAllContiguous();
  });

  it('第 10 位可以入座（SEAT-R02、SEAT-AC13）', async () => {
    await seatNewEmployees(5, 9);
    const wang = await newUnseated();
    await operate({ type: 'seat', participantId: wang, tableId: 5 });
    expect(await roster(5)).toHaveLength(10);
  });

  it('不帶 allowOverflow（選擇桌次）：目標桌已滿，409 TABLE_FULL，不入座、資料不變（SEAT-R23、SEAT-R86、SEAT-R88）', async () => {
    await seatNewEmployees(5, 10);
    const wang = await newUnseated();
    const before = await allPositions();

    await expectError(await postOperation({ type: 'seat', participantId: wang, tableId: 5 }), 409, 'TABLE_FULL');

    expect(await allPositions()).toEqual(before);
  });

  it('找不到這位參與人員（已被別人刪除）：404 NOT_FOUND（COM-R07、docs/architecture.md 第 8.2 節）', async () => {
    await expectError(await postOperation({ type: 'seat', participantId: 987654, tableId: 3 }), 404, 'NOT_FOUND');
  });

  it('輸入格式不對：400 VALIDATION_FAILED', async () => {
    const wang = await newUnseated();
    await expectError(await postOperation({ type: 'seat', participantId: wang, tableId: 31 }), 400, 'VALIDATION_FAILED');
    await expectError(await postOperation({ type: 'teleport', participantId: wang }), 400, 'VALIDATION_FAILED');
    await expectError(await postOperation('not json'), 400, 'VALIDATION_FAILED');
    expect(await positionOf(wang)).toEqual(unseated);
  });
});

describe('seat：搬移（SEAT-R06、R19、R20）', () => {
  it('搬到另一桌：離開原桌，原桌其他人依原本順序往前補；回應包含往前補的人（SEAT-R19、SEAT-R06、SEAT-AC04）', async () => {
    const [a] = await seatNewEmployees(3, 1);
    const { participant: wang } = await createRegisteredEmployee({ name: '王小明' }, { tableId: 3, seatOrder: 1 });
    const [c, d] = await seatNewEmployees(3, 2);
    const table7 = await seatNewEmployees(7, 2);

    const result = await operate({ type: 'seat', participantId: wang.id, tableId: 7 });

    expect(await roster(3)).toEqual([a, c, d]);
    expect(await roster(7)).toEqual([...table7, wang.id]);
    expect(result.participants.map((p) => p.id)).toEqual(expect.arrayContaining([wang.id, c!, d!]));
    expect(result.undo.participants).toEqual(
      expect.arrayContaining([
        { id: wang.id, tableId: 3, seatOrder: 1 },
        { id: c, tableId: 3, seatOrder: 2 },
        { id: d, tableId: 3, seatOrder: 3 },
      ]),
    );
    await expectAllContiguous();
  });

  it('不帶 allowOverflow（選擇桌次）：目標桌已滿，409 TABLE_FULL，留在原桌（SEAT-R23、SEAT-R88）', async () => {
    const [wang] = await seatNewEmployees(3, 1);
    await seatNewEmployees(5, 10);
    await expectError(await postOperation({ type: 'seat', participantId: wang, tableId: 5 }), 409, 'TABLE_FULL');
    expect(await positionOf(wang!)).toEqual({ tableId: 3, seatOrder: 0 });
  });

  it('放到自己所在的桌、沒有指定列：沒有作用，不寫入（SEAT-Q03 的目前假設）', async () => {
    const table3 = await seatNewEmployees(3, 3);
    const before = await allPositions();
    const result = await operate({ type: 'seat', participantId: table3[0], tableId: 3 });
    expect(result.undo).toEqual({ participants: [], tables: [] });
    expect(await allPositions()).toEqual(before);
  });
});

describe('seat：工作人員桌（SEAT-R40～R45、R51）', () => {
  it('未入座的員工放進工作人員桌（SEAT-R40、SEAT-R43、SEAT-AC38）', async () => {
    const wang = await newUnseated();
    const result = await operate({ type: 'seat', participantId: wang, tableId: STAFF_TABLE_ID });
    expect((await positionOf(wang)).tableId).toBe(STAFF_TABLE_ID);
    expect(result.undo.participants).toEqual([{ id: wang, ...unseated }]);
  });

  it('坐在桌次的員工放進工作人員桌：離開原桌，其他人往前補；眷屬留在原桌（SEAT-R43、SEAT-R44、SEAT-AC39、SEAT-AC40）', async () => {
    const { participant: wang } = await createRegisteredEmployee({ name: '王小明' }, { tableId: 3, seatOrder: 0 });
    const dependent = await createDependent(wang.id, { tableId: 3, seatOrder: 1 });
    const [other] = await seatNewEmployees(3, 1);

    await operate({ type: 'seat', participantId: wang.id, tableId: STAFF_TABLE_ID });

    expect(await staffIds()).toEqual([wang.id]);
    expect(await roster(3)).toEqual([dependent.id, other]);
    await expectAllContiguous();
  });

  it('眷屬或外部貴賓放進工作人員桌：409 STAFF_EMPLOYEE_ONLY，留在原處（SEAT-R41、SEAT-AC41）', async () => {
    const { participant: wang } = await createRegisteredEmployee();
    const dependent = await createDependent(wang.id);
    const lin = await createGuest({ guestName: '林董', tableId: 12, seatOrder: 0 });
    const before = await allPositions();

    await expectError(
      await postOperation({ type: 'seat', participantId: dependent.id, tableId: STAFF_TABLE_ID }),
      409,
      'STAFF_EMPLOYEE_ONLY',
    );
    await expectError(
      await postOperation({ type: 'seat', participantId: lin.id, tableId: STAFF_TABLE_ID }),
      409,
      'STAFF_EMPLOYEE_ONLY',
    );
    expect(await allPositions()).toEqual(before);
  });

  it('不帶 allowOverflow：工作人員桌已有 10 位，409 STAFF_TABLE_FULL，員工留在原處（docs/architecture.md 第 8.1 節）', async () => {
    await seatNewEmployees(STAFF_TABLE_ID, 10);
    const [wang] = await seatNewEmployees(3, 1);
    await expectError(
      await postOperation({ type: 'seat', participantId: wang, tableId: STAFF_TABLE_ID }),
      409,
      'STAFF_TABLE_FULL',
    );
    expect(await positionOf(wang!)).toEqual({ tableId: 3, seatOrder: 0 });
  });

  it('已經是工作人員的人放回工作人員桌：沒有作用（SEAT-R51、SEAT-AC49）', async () => {
    const staff = await seatNewEmployees(STAFF_TABLE_ID, 10);
    const before = await allPositions();
    const result = await operate({ type: 'seat', participantId: staff[2], tableId: STAFF_TABLE_ID });
    expect(result.undo).toEqual({ participants: [], tables: [] });
    expect(await allPositions()).toEqual(before);
  });

  it('工作人員拖到某一桌：入座那一桌，不再是工作人員；復原後回到工作人員桌（SEAT-R45、SEAT-R78、SEAT-AC43）', async () => {
    const [wang] = await seatNewEmployees(STAFF_TABLE_ID, 1);
    const table7 = await seatNewEmployees(7, 3);

    const result = await operate({ type: 'seat', participantId: wang, tableId: 7 });
    expect(await roster(7)).toEqual([...table7, wang]);
    expect(await staffIds()).toEqual([]);

    await operate({ type: 'restore', snapshot: result.undo });
    expect(await staffIds()).toEqual([wang]);
    expect(await roster(7)).toEqual(table7);
  });

  it('不帶 allowOverflow：工作人員放到已滿的桌，409 TABLE_FULL，仍是工作人員（SEAT-R45、SEAT-R88）', async () => {
    const [wang] = await seatNewEmployees(STAFF_TABLE_ID, 1);
    await seatNewEmployees(5, 10);
    await expectError(await postOperation({ type: 'seat', participantId: wang, tableId: 5 }), 409, 'TABLE_FULL');
    expect(await staffIds()).toEqual([wang]);
  });
});

describe('seatMany：加入人員（SEAT-R30、R31、R50）', () => {
  it('依勾選順序排到名單最後；復原後這次加入的人全部回到未入座（SEAT-R31、SEAT-Q06、SEAT-AC18、SEAT-AC79）', async () => {
    const table3 = await seatNewEmployees(3, 7);
    const a = await newUnseated();
    const b = await newUnseated();
    const c = await newUnseated();

    const result = await operate({ type: 'seatMany', tableId: 3, participantIds: [c, a, b] });
    expect(await roster(3)).toEqual([...table3, c, a, b]);
    expect(result.undo.participants).toEqual(
      expect.arrayContaining([
        { id: a, ...unseated },
        { id: b, ...unseated },
        { id: c, ...unseated },
      ]),
    );

    await operate({ type: 'restore', snapshot: result.undo });
    expect(await roster(3)).toEqual(table3);
    for (const id of [a, b, c]) expect(await positionOf(id)).toEqual(unseated);
  });

  it('不帶 allowOverflow：超過 10 位，409 TABLE_FULL，整批不加入（docs/architecture.md 第 8.1 節、COM-R07）', async () => {
    await seatNewEmployees(3, 8);
    const ids = [await newUnseated(), await newUnseated(), await newUnseated()];
    const before = await allPositions();
    await expectError(await postOperation({ type: 'seatMany', tableId: 3, participantIds: ids }), 409, 'TABLE_FULL');
    expect(await allPositions()).toEqual(before);
  });

  it('加入工作人員桌：已入座的員工離開原桌、未入座的員工也成為工作人員；復原後各自回到原本的座號（SEAT-R50、SEAT-R78、SEAT-AC47）', async () => {
    await seatNewEmployees(STAFF_TABLE_ID, 8);
    const [first] = await seatNewEmployees(3, 1);
    const { participant: chen } = await createRegisteredEmployee({ name: '陳大華' }, { tableId: 3, seatOrder: 1 });
    const [third] = await seatNewEmployees(3, 1);
    const yi = await newUnseated({ name: '乙' });

    const result = await operate({ type: 'seatMany', tableId: STAFF_TABLE_ID, participantIds: [chen.id, yi] });
    expect(await staffIds()).toEqual(expect.arrayContaining([chen.id, yi]));
    expect(await staffIds()).toHaveLength(10);
    expect(await roster(3)).toEqual([first, third]);

    await operate({ type: 'restore', snapshot: result.undo });
    expect(await roster(3)).toEqual([first, chen.id, third]);
    expect(await positionOf(yi)).toEqual(unseated);
    expect(await staffIds()).toHaveLength(8);
  });

  it('不帶 allowOverflow：加入工作人員桌超過 10 位，409 STAFF_TABLE_FULL（docs/architecture.md 第 8.1 節）', async () => {
    await seatNewEmployees(STAFF_TABLE_ID, 9);
    const ids = [await newUnseated(), await newUnseated()];
    await expectError(
      await postOperation({ type: 'seatMany', tableId: STAFF_TABLE_ID, participantIds: ids }),
      409,
      'STAFF_TABLE_FULL',
    );
    expect(await staffIds()).toHaveLength(9);
  });

  it('加入工作人員桌的人裡有眷屬或外部貴賓：409 STAFF_EMPLOYEE_ONLY，整批不加入（SEAT-R41、SEAT-R50）', async () => {
    const wang = await newUnseated();
    const dependent = await createDependent(wang);
    await expectError(
      await postOperation({ type: 'seatMany', tableId: STAFF_TABLE_ID, participantIds: [wang, dependent.id] }),
      409,
      'STAFF_EMPLOYEE_ONLY',
    );
    expect(await staffIds()).toEqual([]);
  });
});

describe('unseat：移出（SEAT-R26、R28、R46）', () => {
  it('移出桌次：變成未入座，原桌其他人往前補，人員不刪除（SEAT-R26、SEAT-R28、SEAT-AC05、SEAT-AC06）', async () => {
    const [a, wang, c] = await seatNewEmployees(3, 3);
    const count = await prisma.participant.count();

    const result = await operate({ type: 'unseat', participantId: wang });

    expect(await positionOf(wang!)).toEqual(unseated);
    expect(await roster(3)).toEqual([a, c]);
    expect(await prisma.participant.count()).toBe(count);
    expect(result.undo.participants).toEqual(
      expect.arrayContaining([
        { id: wang, tableId: 3, seatOrder: 1 },
        { id: c, tableId: 3, seatOrder: 2 },
      ]),
    );
    await expectAllContiguous();
  });

  it('移出工作人員桌：不再是工作人員，變成未入座；復原後回到工作人員桌（SEAT-R46、SEAT-R78、SEAT-AC45）', async () => {
    const [wang] = await seatNewEmployees(STAFF_TABLE_ID, 1);
    const result = await operate({ type: 'unseat', participantId: wang });
    expect(await positionOf(wang!)).toEqual(unseated);
    await operate({ type: 'restore', snapshot: result.undo });
    expect(await staffIds()).toEqual([wang]);
  });
});

describe('reorder：調整順序（SEAT-R32、R33、R34）', () => {
  it('只改變順序，人數不變（SEAT-R32、SEAT-AC07）', async () => {
    const [jia, yi, bing, ding] = await seatNewEmployees(3, 4);
    await operate({ type: 'reorder', tableId: 3, participantIds: [ding, jia, yi, bing] });
    expect(await roster(3)).toEqual([ding, jia, yi, bing]);
    await expectAllContiguous();
  });

  it('已滿的桌次也可以調整順序（SEAT-R33、SEAT-AC16）', async () => {
    const ids = await seatNewEmployees(5, 10);
    const next = [ids[9]!, ...ids.slice(0, 9)];
    await operate({ type: 'reorder', tableId: 5, participantIds: next });
    expect(await roster(5)).toEqual(next);
  });

  it('送來的名單和這一桌目前的人不一樣（別人剛改過）：409 CONFLICT，資料不變（COM-R07）', async () => {
    const ids = await seatNewEmployees(3, 3);
    const outsider = await newUnseated();
    const before = await allPositions();
    await expectError(await postOperation({ type: 'reorder', tableId: 3, participantIds: [ids[1], ids[0]] }), 409, 'CONFLICT');
    await expectError(
      await postOperation({ type: 'reorder', tableId: 3, participantIds: [...ids, outsider] }),
      409,
      'CONFLICT',
    );
    expect(await allPositions()).toEqual(before);
  });

  it('工作人員桌不能調整順序：400（SEAT-R34）', async () => {
    const ids = await seatNewEmployees(STAFF_TABLE_ID, 2);
    await expectError(
      await postOperation({ type: 'reorder', tableId: STAFF_TABLE_ID, participantIds: [ids[1], ids[0]] }),
      400,
      'VALIDATION_FAILED',
    );
  });
});

describe('clear：清空桌次（SEAT-R28、R29）', () => {
  it('全部變成未入座、備註名稱保留、人員不刪除；復原後回到原本的座號（SEAT-R29、SEAT-AC36、SEAT-AC77）', async () => {
    const ids = await seatNewEmployees(3, 6);
    await prisma.seatTable.update({ where: { id: 3 }, data: { noteName: '主桌' } });
    const count = await prisma.participant.count();

    const result = await operate({ type: 'clear', tableId: 3 });
    expect(await roster(3)).toEqual([]);
    for (const id of ids) expect(await positionOf(id)).toEqual(unseated);
    expect(await noteNameOf(3)).toBe('主桌');
    expect(await prisma.participant.count()).toBe(count);
    expect(result.undo.tables).toEqual([]);

    await operate({ type: 'restore', snapshot: result.undo });
    expect(await roster(3)).toEqual(ids);
  });

  it('工作人員桌沒有清空桌次：400（SEAT-R48）', async () => {
    await seatNewEmployees(STAFF_TABLE_ID, 2);
    await expectError(await postOperation({ type: 'clear', tableId: STAFF_TABLE_ID }), 400, 'VALIDATION_FAILED');
    expect(await staffIds()).toHaveLength(2);
  });
});

describe('swap：對調桌次（SEAT-R35、R36、R38、R48）', () => {
  it('兩桌的名單（含順序）與備註名稱整組對調，回應包含兩桌的新備註名稱；復原後回到對調前（SEAT-R35、SEAT-AC30、SEAT-AC76）', async () => {
    const table3 = await seatNewEmployees(3, 2);
    const table7 = await seatNewEmployees(7, 3);
    await prisma.seatTable.update({ where: { id: 3 }, data: { noteName: '主桌' } });

    const result = await operate({ type: 'swap', tableA: 3, tableB: 7 });
    expect(await roster(3)).toEqual(table7);
    expect(await roster(7)).toEqual(table3);
    expect(await noteNameOf(3)).toBeNull();
    expect(await noteNameOf(7)).toBe('主桌');
    expect(result.tables).toEqual(
      expect.arrayContaining([
        { id: 3, kind: 'NORMAL', noteName: null },
        { id: 7, kind: 'NORMAL', noteName: '主桌' },
      ]),
    );
    expect(result.undo.tables).toEqual(
      expect.arrayContaining([
        { id: 3, noteName: '主桌' },
        { id: 7, noteName: null },
      ]),
    );

    const restored = await operate({ type: 'restore', snapshot: result.undo });
    expect(await roster(3)).toEqual(table3);
    expect(await roster(7)).toEqual(table7);
    expect(await noteNameOf(3)).toBe('主桌');
    expect(await noteNameOf(7)).toBeNull();
    expect(restored.tables).toEqual(expect.arrayContaining([{ id: 3, kind: 'NORMAL', noteName: '主桌' }]));
  });

  it('已滿的桌次也可以對調（SEAT-R35、SEAT-AC35）', async () => {
    const table3 = await seatNewEmployees(3, 4);
    const table7 = await seatNewEmployees(7, 10);
    await operate({ type: 'swap', tableA: 3, tableB: 7 });
    expect(await roster(3)).toEqual(table7);
    expect(await roster(7)).toEqual(table3);
  });

  it('拖到空桌：整桌搬過去，原本的桌變成空桌、沒有備註名稱（SEAT-R36、SEAT-AC32）', async () => {
    const table3 = await seatNewEmployees(3, 2);
    await prisma.seatTable.update({ where: { id: 3 }, data: { noteName: '主桌' } });
    await operate({ type: 'swap', tableA: 3, tableB: 9 });
    expect(await roster(9)).toEqual(table3);
    expect(await noteNameOf(9)).toBe('主桌');
    expect(await roster(3)).toEqual([]);
    expect(await noteNameOf(3)).toBeNull();
  });

  it('和自己對調：沒有作用（SEAT-R38）', async () => {
    const table3 = await seatNewEmployees(3, 2);
    const result = await operate({ type: 'swap', tableA: 3, tableB: 3 });
    expect(result.undo).toEqual({ participants: [], tables: [] });
    expect(await roster(3)).toEqual(table3);
  });

  it('工作人員桌不能對調：400（SEAT-R48）', async () => {
    await expectError(await postOperation({ type: 'swap', tableA: 0, tableB: 3 }), 400, 'VALIDATION_FAILED');
  });
});

describe('restore：復原（SEAT-R76～R79、COM-R07）', () => {
  it('搬移後復原：回到原本的桌次與座號，兩桌的名單順序回到操作前（SEAT-R78、SEAT-AC75）', async () => {
    const [a] = await seatNewEmployees(3, 1);
    const { participant: wang } = await createRegisteredEmployee({ name: '王小明' }, { tableId: 3, seatOrder: 1 });
    const [c] = await seatNewEmployees(3, 1);
    const table7 = await seatNewEmployees(7, 2);

    const moved = await operate({ type: 'seat', participantId: wang.id, tableId: 7 });
    await operate({ type: 'restore', snapshot: moved.undo });

    expect(await roster(3)).toEqual([a, wang.id, c]);
    expect(await roster(7)).toEqual(table7);
  });

  it('從桌次放進工作人員桌後復原：回到原本的座號（SEAT-R78、SEAT-AC80）', async () => {
    const before = await seatNewEmployees(3, 5);
    const wang = before[3]!;
    const result = await operate({ type: 'seat', participantId: wang, tableId: STAFF_TABLE_ID });
    await operate({ type: 'restore', snapshot: result.undo });
    expect(await roster(3)).toEqual(before);
    expect(await staffIds()).toEqual([]);
  });

  it('復原的回應也帶 undo（可以用來再做一次）', async () => {
    const wang = await newUnseated();
    const seated = await operate({ type: 'seat', participantId: wang, tableId: 3 });
    const restored = await operate({ type: 'restore', snapshot: seated.undo });
    expect(restored.undo.participants).toEqual([{ id: wang, tableId: 3, seatOrder: 0 }]);
    expect(restored.participants.find((p) => p.id === wang)).toMatchObject(unseated);
  });

  it('復原會讓某一桌變成 11 位（別人在這之間坐進來）：復原上限 12 位，可以復原，回到原本的座號（SEAT-R88、D-018）', async () => {
    const ids = await seatNewEmployees(5, 10);
    const removed = await operate({ type: 'unseat', participantId: ids[0] });
    const other = await newUnseated();
    await operate({ type: 'seat', participantId: other, tableId: 5 });

    await operate({ type: 'restore', snapshot: removed.undo });
    expect(await roster(5)).toEqual([...ids, other]);
    expect(await positionOf(ids[0]!)).toEqual({ tableId: 5, seatOrder: 0 });
    await expectAllContiguous();
  });

  it('復原會讓某一桌變成 13 位（別人在這之間坐滿 12 位）：409 TABLE_LIMIT，資料不變（SEAT-R02、SEAT-R88、COM-R07）', async () => {
    const ids = await seatNewEmployees(5, 12);
    const removed = await operate({ type: 'unseat', participantId: ids[0] });
    const other = await newUnseated();
    await operate({ type: 'seat', participantId: other, tableId: 5, allowOverflow: true });
    const before = await allPositions();

    await expectError(await postOperation({ type: 'restore', snapshot: removed.undo }), 409, 'TABLE_LIMIT');
    expect(await allPositions()).toEqual(before);
  });

  it('復原的人已被別人刪除：404 NOT_FOUND，資料不變（COM-R07）', async () => {
    const { participant: wang, employee } = await createRegisteredEmployee();
    const seated = await operate({ type: 'seat', participantId: wang.id, tableId: 3 });
    await prisma.employee.delete({ where: { id: employee.id } });

    await expectError(await postOperation({ type: 'restore', snapshot: seated.undo }), 404, 'NOT_FOUND');
  });
});

describe('立即儲存（COM-R01、COM-R05、SEAT-R85）', () => {
  it('每個成功的指令都寫入資料庫，重新載入後看得到；名單順序保持連續', async () => {
    const wang = await newUnseated();
    const others = await seatNewEmployees(3, 2);
    await operate({ type: 'seat', participantId: wang, tableId: 3, index: 0 });
    await operate({ type: 'reorder', tableId: 3, participantIds: [others[1], wang, others[0]] });
    await operate({ type: 'swap', tableA: 3, tableB: 12 });
    expect(await roster(12)).toEqual([others[1], wang, others[0]]);
    await expectAllContiguous();
  });
});
