// 兩個人同時操作：docs/spec/README.md COM-R07、COM-R08、COM-AC04；docs/spec/seating.md SEAT-R86、SEAT-AC88；
// docs/architecture.md 第 7.2 節（交易內先鎖住涉及的桌次列、依桌號由小到大鎖避免死結、每次異動後 seatOrder 重排為 0..n-1）、
// 第 8.2 節（寫入時才發現違反規則回 409）；docs/decision-record.md D-004。
// 用 Promise.all 同時送出兩個請求。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import { resetData } from '../../helpers/db';
import {
  expectAllContiguous,
  newUnseated,
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

async function codeOf(res: Response): Promise<string | null> {
  if (res.ok) return null;
  const body = (await res.json()) as { error?: { code?: string } };
  return body.error?.code ?? 'UNKNOWN';
}

describe('同時搶同一桌最後一個位子', () => {
  it('兩人同時把不同的人拖進第 5 桌（剩 1 位）：只有一個成功，另一個回 409 TABLE_FULL；第 5 桌剛好 10 位（COM-AC04、SEAT-AC88）', async () => {
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

  it('兩人同時把員工放進工作人員桌（剩 1 位）：只有一個成功，另一個回 409 STAFF_TABLE_FULL（SEAT-R42、SEAT-R86）', async () => {
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

describe('同時操作不同順序的桌次不會死結（docs/architecture.md 第 7.2 節）', () => {
  it('甲把第 3 桌的人搬到第 5 桌、乙同時把第 5 桌的人搬到第 3 桌：兩個都完成，名單連續', async () => {
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

  it('同時對調第 3、7 桌與第 7、3 桌，加上一個入座：都不會卡住，名單連續', async () => {
    await seatNewEmployees(3, 2);
    await seatNewEmployees(7, 2);
    const wang = await newUnseated();

    const responses = await Promise.all([
      postOperation({ type: 'swap', tableA: 3, tableB: 7 }),
      postOperation({ type: 'swap', tableA: 7, tableB: 3 }),
      postOperation({ type: 'seat', participantId: wang, tableId: 7 }),
    ]);

    for (const r of responses) expect(r.status).toBe(200);
    expect((await roster(3)).length + (await roster(7)).length).toBe(5);
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
