// 座位安排整合測試用：直接呼叫 Route Handler（POST /api/seating/operations、PATCH /api/tables/{id}），
// 並用 Prisma 讀寫測試資料庫。呼叫端的測試檔要先 vi.mock('@/server/auth')（docs/plan/implementation-plan.md 第 5 節 C 線）。
import { expect } from 'vitest';
import { POST } from '@/app/api/seating/operations/route';
import { PATCH } from '@/app/api/tables/[id]/route';
import type { Prisma } from '@/generated/prisma/client';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import { seatingResultSchema, tableResultSchema, type SeatingResult, type TableResult } from '@/contracts/seating';
import { prisma } from './db';
import { createRegisteredEmployee } from './factory';

const ORIGIN = 'http://localhost:3000';

const jsonRequest = (path: string, method: string, body: unknown) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  });

/** 送出一個座位異動指令，回傳原始回應 */
export const postOperation = (op: unknown): Promise<Response> =>
  POST(jsonRequest('/api/seating/operations', 'POST', op), { params: Promise.resolve({}) });

/** 送出一個應該成功的指令：200，回應符合 SeatingResult */
export async function operate(op: unknown): Promise<SeatingResult> {
  const res = await postOperation(op);
  const body: unknown = await res.json();
  expect(res.status, JSON.stringify(body)).toBe(200);
  return seatingResultSchema.parse(body);
}

/** 檢查錯誤回應：HTTP 狀態與錯誤碼（docs/architecture.md 第 8.2 節） */
export async function expectError(res: Response, status: number, code: string) {
  const body = (await res.json()) as { error?: { code?: string } };
  expect(res.status, JSON.stringify(body)).toBe(status);
  expect(body.error?.code).toBe(code);
}

export const patchTable = (id: number | string, body: unknown): Promise<Response> =>
  PATCH(jsonRequest(`/api/tables/${id}`, 'PATCH', body), { params: Promise.resolve({ id: String(id) }) });

export async function patchTableOk(id: number, body: unknown): Promise<TableResult> {
  const res = await patchTable(id, body);
  const json: unknown = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(200);
  return tableResultSchema.parse(json);
}

/** 一般桌的名單（依座號），回傳參與人員 id */
export async function roster(tableId: number): Promise<number[]> {
  const rows = await prisma.participant.findMany({ where: { tableId }, orderBy: [{ seatOrder: 'asc' }, { id: 'asc' }] });
  return rows.map((p) => p.id);
}

/** 工作人員桌的人（不看順序），由小到大 */
export async function staffIds(): Promise<number[]> {
  const rows = await prisma.participant.findMany({ where: { tableId: STAFF_TABLE_ID } });
  return rows.map((p) => p.id).sort((a, b) => a - b);
}

export async function positionOf(id: number): Promise<{ tableId: number | null; seatOrder: number | null }> {
  const p = await prisma.participant.findUniqueOrThrow({ where: { id } });
  return { tableId: p.tableId, seatOrder: p.seatOrder };
}

export async function noteNameOf(tableId: number): Promise<string | null> {
  const t = await prisma.seatTable.findUniqueOrThrow({ where: { id: tableId } });
  return t.noteName;
}

/** 第 1–30 桌的 seatOrder 都是 0..n-1 連續；未入座的人沒有座號（docs/architecture.md 第 7.2 節） */
export async function expectAllContiguous() {
  const rows = await prisma.participant.findMany({ orderBy: [{ tableId: 'asc' }, { seatOrder: 'asc' }] });
  for (let t = 1; t <= 30; t++) {
    const orders = rows
      .filter((p) => p.tableId === t)
      .map((p) => p.seatOrder)
      .sort((a, b) => (a ?? -1) - (b ?? -1));
    expect(orders, `第 ${t} 桌的座號`).toEqual(orders.map((_, i) => i));
  }
  for (const p of rows) if (p.tableId === null) expect(p.seatOrder, `未入座的 ${p.id}`).toBeNull();
}

/** 全部參與人員的位置（id → tableId、seatOrder），比對「沒有任何改變」用 */
export async function allPositions(): Promise<Record<number, { tableId: number | null; seatOrder: number | null }>> {
  const rows = await prisma.participant.findMany();
  return Object.fromEntries(rows.map((p) => [p.id, { tableId: p.tableId, seatOrder: p.seatOrder }]));
}

/** 建立一位已報名、未入座的員工，回傳參與人員 id */
export async function newUnseated(employee: Partial<Prisma.EmployeeUncheckedCreateInput> = {}): Promise<number> {
  const { participant } = await createRegisteredEmployee(employee);
  return participant.id;
}

/** 在 tableId 接著現有的人再坐 count 位已報名的員工，回傳參與人員 id（依座號） */
export async function seatNewEmployees(
  tableId: number,
  count: number,
  employee: Partial<Prisma.EmployeeUncheckedCreateInput> = {},
): Promise<number[]> {
  const existing = await prisma.participant.count({ where: { tableId } });
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const { participant } = await createRegisteredEmployee(employee, { tableId, seatOrder: existing + i });
    ids.push(participant.id);
  }
  return ids;
}
