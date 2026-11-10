// 還沒登記排座函式時的自動排座指令（docs/plan/implementation-plan.md 第 5.2 節：D 線的演算法在階段 3 才登記）。
// 獨立一個檔案，確保這個檔案的模組裡沒有呼叫過 registerAutoArranger。
// 沒有登記時回錯誤，座位都不變。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetData } from '../../helpers/db';
import { allPositions, newUnseated, postOperation, seatNewEmployees } from '../../helpers/seating-api';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

beforeEach(async () => {
  await resetData();
});

describe('autoArrange：沒有登記排座函式', () => {
  it.each(['unseatedOnly', 'rebuild'] as const)('範圍 %s：回錯誤，不寫入任何改變', async (mode) => {
    await seatNewEmployees(3, 2);
    await newUnseated();
    const before = await allPositions();

    const res = await postOperation({ type: 'autoArrange', mode });

    expect(res.ok).toBe(false);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['error']);
    expect(await allPositions()).toEqual(before);
  });
});
