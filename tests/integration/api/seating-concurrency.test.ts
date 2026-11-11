// 兩個人同時操作：docs/spec/README.md COM-R07、COM-R08、COM-AC04；docs/spec/seating.md SEAT-R86、SEAT-AC88、SEAT-AC97；
// docs/architecture.md 第 7.2 節（交易內先鎖住涉及的桌次列、依桌號由小到大鎖避免死結、每次異動後 seatOrder 重排為 0..n-1）、
// 第 8.1、8.2 節（寫入時才發現違反規則回 409；不帶 allowOverflow 上限 10 位回 TABLE_FULL、帶 allowOverflow 上限 12 位回 TABLE_LIMIT，D-018）；
// docs/decision-record.md D-004、D-018。
// 用 Promise.all 同時送出兩個請求。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import { prisma, resetData } from '../../helpers/db';
import {
  expectAllContiguous,
  insertTable,
  newUnseated,
  positionOf,
  positionOfTable,
  postOperation,
  roster,
  seatNewEmployees,
  stagedTableIds,
  staffIds,
  tableAt,
} from '../../helpers/seating-api';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

beforeEach(async () => {
  await resetData();
});

async function codeOf(res: Response): Promise<string | null> {
  if (res.ok) return null;
  const body = (await res.json()) as { error?: { code?: string } };
  return body.error?.code ?? 'UNKNOWN';
}

describe('同時搶同一桌最後一個位子', () => {
  it('兩人同時從選擇桌次把不同的人排進 B10 桌（內部編號 5，剩 1 位、不帶 allowOverflow）：只有一個成功，另一個回 409 TABLE_FULL；B10 桌剛好 10 位（COM-AC04、SEAT-AC97）', async () => {
    await seatNewEmployees(5, 9);
    const a = await newUnseated({ name: '甲' });
    const b = await newUnseated({ name: '乙' });

    const responses = await Promise.all([
      postOperation({ type: 'seat', participantId: a, tableId: 5 }),
      postOperation({ type: 'seat', participantId: b, tableId: 5 }),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const codes = await Promise.all(responses.map(codeOf));
    expect(codes.filter((c) => c !== null)).toEqual(['TABLE_FULL']);

    const table5 = await roster(5);
    expect(table5).toHaveLength(10);
    const winner = responses[0]!.status === 200 ? a : b;
    const loser = winner === a ? b : a;
    expect(table5).toContain(winner);
    expect(await positionOf(loser)).toEqual({ tableId: null, seatOrder: null });
    await expectAllContiguous();
  });

  it('同時搬移與入座搶同一個位子：只有一個成功，搬移失敗的人留在原桌', async () => {
    await seatNewEmployees(5, 9);
    const [mover] = await seatNewEmployees(3, 1);
    const newcomer = await newUnseated();

    const responses = await Promise.all([
      postOperation({ type: 'seat', participantId: mover, tableId: 5 }),
      postOperation({ type: 'seat', participantId: newcomer, tableId: 5 }),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await roster(5)).toHaveLength(10);
    if (responses[0]!.status === 409) expect(await positionOf(mover!)).toEqual({ tableId: 3, seatOrder: 0 });
    await expectAllContiguous();
  });

  it('同時「加入 2 位」與入座 1 位到剩 2 位的桌：不會超過 10 位', async () => {
    await seatNewEmployees(5, 8);
    const pair = [await newUnseated(), await newUnseated()];
    const single = await newUnseated();

    const responses = await Promise.all([
      postOperation({ type: 'seatMany', tableId: 5, participantIds: pair }),
      postOperation({ type: 'seat', participantId: single, tableId: 5 }),
    ]);

    expect(responses.some((r) => r.status === 200)).toBe(true);
    expect(await roster(5)).not.toHaveLength(11);
    expect((await roster(5)).length).toBeLessThanOrEqual(10);
    const codes = await Promise.all(responses.map(codeOf));
    for (const c of codes) if (c !== null) expect(c).toBe('TABLE_FULL');
    await expectAllContiguous();
  });

  it('不帶 allowOverflow：兩人同時把員工放進工作人員桌（剩 1 位）：只有一個成功，另一個回 409 STAFF_TABLE_FULL（docs/architecture.md 第 8.1 節）', async () => {
    await seatNewEmployees(STAFF_TABLE_ID, 9);
    const a = await newUnseated();
    const b = await newUnseated();

    const responses = await Promise.all([
      postOperation({ type: 'seat', participantId: a, tableId: STAFF_TABLE_ID }),
      postOperation({ type: 'seat', participantId: b, tableId: STAFF_TABLE_ID }),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await Promise.all(responses.map(codeOf))).filter((c) => c !== null)).toEqual(['STAFF_TABLE_FULL']);
    expect(await staffIds()).toHaveLength(10);
  });
});

describe('D-018 同時搶第 12 位（帶 allowOverflow）', () => {
  it('兩人同時把不同的人拖進 11 位的 B10 桌：只有一個成功，另一個回 409 TABLE_LIMIT；B10 桌剛好 12 位（SEAT-R20、SEAT-R86、SEAT-AC88、SEAT-AC97）', async () => {
    await seatNewEmployees(5, 11);
    const a = await newUnseated({ name: '甲' });
    const b = await newUnseated({ name: '乙' });

    const responses = await Promise.all([
      postOperation({ type: 'seat', participantId: a, tableId: 5, allowOverflow: true }),
      postOperation({ type: 'seat', participantId: b, tableId: 5, allowOverflow: true }),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await Promise.all(responses.map(codeOf))).filter((c) => c !== null)).toEqual(['TABLE_LIMIT']);
    const table5 = await roster(5);
    expect(table5).toHaveLength(12);
    const winner = responses[0]!.status === 200 ? a : b;
    const loser = winner === a ? b : a;
    expect(table5).toContain(winner);
    expect(await positionOf(loser)).toEqual({ tableId: null, seatOrder: null });
    await expectAllContiguous();
  });

  it('兩人同時把人拖進 10 位的 B10 桌：兩個都成功，B10 桌 12 位（拖移上限是 12 位）', async () => {
    await seatNewEmployees(5, 10);
    const a = await newUnseated();
    const b = await newUnseated();

    const responses = await Promise.all([
      postOperation({ type: 'seat', participantId: a, tableId: 5, allowOverflow: true }),
      postOperation({ type: 'seat', participantId: b, tableId: 5, allowOverflow: true }),
    ]);

    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(await roster(5)).toHaveLength(12);
    await expectAllContiguous();
  });

  it('同時「加入 2 位」與拖進 1 位到 10 位的桌：不會超過 12 位，失敗的一方回 TABLE_LIMIT', async () => {
    await seatNewEmployees(5, 10);
    const pair = [await newUnseated(), await newUnseated()];
    const single = await newUnseated();

    const responses = await Promise.all([
      postOperation({ type: 'seatMany', tableId: 5, participantIds: pair, allowOverflow: true }),
      postOperation({ type: 'seat', participantId: single, tableId: 5, allowOverflow: true }),
    ]);

    expect(responses.some((r) => r.status === 200)).toBe(true);
    expect((await roster(5)).length).toBeLessThanOrEqual(12);
    const codes = await Promise.all(responses.map(codeOf));
    for (const c of codes) if (c !== null) expect(c).toBe('TABLE_LIMIT');
    await expectAllContiguous();
  });

  it('同時拖進與從選擇桌次排進 11 位的桌：拖移成功成為第 12 位；選單那一方一律回 TABLE_FULL（SEAT-R88）', async () => {
    await seatNewEmployees(5, 11);
    const dragged = await newUnseated();
    const picked = await newUnseated();

    const [dragRes, pickRes] = await Promise.all([
      postOperation({ type: 'seat', participantId: dragged, tableId: 5, allowOverflow: true }),
      postOperation({ type: 'seat', participantId: picked, tableId: 5 }),
    ]);

    expect(dragRes.status).toBe(200);
    expect(await codeOf(pickRes)).toBe('TABLE_FULL');
    expect(await roster(5)).toHaveLength(12);
    expect(await positionOf(picked)).toEqual({ tableId: null, seatOrder: null });
  });

  it('兩人同時把員工拖進 11 位的工作人員桌：只有一個成功，另一個回 409 STAFF_TABLE_LIMIT；工作人員桌剛好 12 位（SEAT-R42、SEAT-R86）', async () => {
    await seatNewEmployees(STAFF_TABLE_ID, 11);
    const a = await newUnseated();
    const b = await newUnseated();

    const responses = await Promise.all([
      postOperation({ type: 'seat', participantId: a, tableId: STAFF_TABLE_ID, allowOverflow: true }),
      postOperation({ type: 'seat', participantId: b, tableId: STAFF_TABLE_ID, allowOverflow: true }),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await Promise.all(responses.map(codeOf))).filter((c) => c !== null)).toEqual(['STAFF_TABLE_LIMIT']);
    expect(await staffIds()).toHaveLength(12);
  });
});

describe('同時操作不同順序的桌次不會死結（docs/architecture.md 第 7.2 節）', () => {
  it('甲把 B4 桌（3）的人搬到 B10 桌（5）、乙同時把 B10 桌的人搬到 B4 桌：兩個都完成，名單連續', async () => {
    const [x] = await seatNewEmployees(3, 3);
    const [y] = await seatNewEmployees(5, 3);

    const responses = await Promise.all([
      postOperation({ type: 'seat', participantId: x, tableId: 5 }),
      postOperation({ type: 'seat', participantId: y, tableId: 3 }),
    ]);

    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect((await positionOf(x!)).tableId).toBe(5);
    expect((await positionOf(y!)).tableId).toBe(3);
    await expectAllContiguous();
  });

  // D-027：對調改用 moveTable。兩人同時把 B4 拖到 B2、把 B2 拖到 B4：先到的成功；後到的看到的位置已經不同，
  // expectedTableId 不符時回 409 CONFLICT（或剛好變成放回自己的位置、沒有作用），不會卡住
  it('同時把 B4 桌（3）拖到 B2（7）、把 B2 桌拖到 B4，加上一個入座：都不會卡住，每個位置仍只有一桌，名單連續', async () => {
    await seatNewEmployees(3, 2);
    await seatNewEmployees(7, 2);
    const wang = await newUnseated();

    const responses = await Promise.all([
      postOperation({ type: 'moveTable', tableId: 3, to: 7, expectedTableId: 7 }),
      postOperation({ type: 'moveTable', tableId: 7, to: 3, expectedTableId: 3 }),
      postOperation({ type: 'seat', participantId: wang, tableId: 7 }),
    ]);

    const statuses = responses.map((r) => r.status);
    expect(statuses[2]).toBe(200);
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(2);
    for (const r of responses.slice(0, 2)) if (r.status !== 200) expect(await codeOf(r)).toBe('CONFLICT');
    expect((await roster(3)).length + (await roster(7)).length).toBe(5);
    const positions = [await positionOfTable(3), await positionOfTable(7)].sort();
    expect(positions).toEqual([3, 7]);
    await expectAllContiguous();
  });

  it('同一桌同時調整順序與有人入座：座號仍是 0..n-1 連續', async () => {
    const ids = await seatNewEmployees(3, 4);
    const wang = await newUnseated();

    await Promise.all([
      postOperation({ type: 'reorder', tableId: 3, participantIds: [ids[3], ids[2], ids[1], ids[0]] }),
      postOperation({ type: 'seat', participantId: wang, tableId: 3, index: 0 }),
    ]);

    expect((await roster(3)).length).toBeGreaterThanOrEqual(4);
    await expectAllContiguous();
  });
});

// D-027：搬動、新增或刪除桌子時，別人剛改過相關的位置或桌，不儲存並重新載入（SEAT-R85、SEAT-AC124；docs/architecture.md 第 8.1 節）
describe('D-027 同時搬動、新增、刪除桌子（SEAT-R85、SEAT-AC124）', () => {
  it('SEAT-AC124：暫存區有兩桌、B8（9）是「未放桌」，甲、乙同時把不同的暫存的桌放到 B8：只有一個成功，另一個回 409 CONFLICT；B8 只有一桌，另一桌仍在暫存區', async () => {
    await prisma.seatTable.delete({ where: { id: 9 } });
    const first = await insertTable({ position: null });
    const second = await insertTable({ position: null });

    const responses = await Promise.all([
      postOperation({ type: 'moveTable', tableId: first, to: 9, expectedTableId: null }),
      postOperation({ type: 'moveTable', tableId: second, to: 9, expectedTableId: null }),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await Promise.all(responses.map(codeOf))).filter((c) => c !== null)).toEqual(['CONFLICT']);
    const winner = responses[0]!.status === 200 ? first : second;
    const loser = winner === first ? second : first;
    expect(await tableAt(9)).toBe(winner);
    expect(await stagedTableIds()).toEqual([loser]);
    await expectAllContiguous();
  });

  it('兩人同時在 B8（未放桌）按「新增桌」：只有一個成功，另一個回 409 CONFLICT；B8 只有一桌', async () => {
    await prisma.seatTable.delete({ where: { id: 9 } });

    const responses = await Promise.all([
      postOperation({ type: 'createTable', position: 9 }),
      postOperation({ type: 'createTable', position: 9 }),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await Promise.all(responses.map(codeOf))).filter((c) => c !== null)).toEqual(['CONFLICT']);
    expect(await prisma.seatTable.count({ where: { position: 9 } })).toBe(1);
    expect(await prisma.seatTable.count({ where: { kind: 'NORMAL' } })).toBe(30);
  });

  it('同時把 B4 桌（3）搬到 B8（未放桌）與把 B4 桌移到暫存區：只有一個成功，另一個被拒或沒有作用；B4 那一桌只在一個地方', async () => {
    await prisma.seatTable.delete({ where: { id: 9 } });
    await seatNewEmployees(3, 2);

    const responses = await Promise.all([
      postOperation({ type: 'moveTable', tableId: 3, to: 9, expectedTableId: null }),
      postOperation({ type: 'moveTable', tableId: 3, to: 'staging', expectedTableId: null }),
    ]);

    expect(responses.some((r) => r.status === 200)).toBe(true);
    for (const r of responses) expect([200, 409]).toContain(r.status);
    const position = await positionOfTable(3);
    expect(position === 9 || position === null).toBe(true);
    expect(await roster(3)).toHaveLength(2);
    await expectAllContiguous();
  });

  it('同時刪除 B4 桌與把人排進 B4 桌：不會留下坐在不存在的桌的人；刪除成功時人都是未入座', async () => {
    await seatNewEmployees(3, 2);
    const wang = await newUnseated();

    const [del, seat] = await Promise.all([
      postOperation({ type: 'deleteTable', tableId: 3 }),
      postOperation({ type: 'seat', participantId: wang, tableId: 3, allowOverflow: true }),
    ]);

    expect(del.status).toBe(200);
    expect([200, 404, 409]).toContain(seat.status);
    expect(await prisma.seatTable.findUnique({ where: { id: 3 } })).toBeNull();
    expect(await prisma.participant.count({ where: { tableId: 3 } })).toBe(0);
    expect(await positionOf(wang)).toEqual({ tableId: null, seatOrder: null });
    await expectAllContiguous();
  });
});
