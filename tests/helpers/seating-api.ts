// 座位安排整合測試用：直接呼叫 Route Handler（POST /api/seating/operations、PATCH /api/tables/{id}），
// 並用 Prisma 讀寫測試資料庫。呼叫端的測試檔要先 vi.mock('@/server/auth')（docs/plan/implementation-plan.md 第 5 節 C 線）。
// D-027 起 tableId 是桌子本身的 id，和位置分開：resetData 後 1–30 桌在同號的位置（position = id），搬動後 roster(id) 仍是那一張桌的名單，
// 要看某個位置上的名單用 rosterAt(position)。
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

/**
 * 每一張一般桌（場上與暫存區，含新增的桌，D-027）的 seatOrder 都是 0..n-1 連續；未入座的人沒有座號（docs/architecture.md 第 7.2 節）；
 * 一個位置最多一張桌（position unique）
 */
export async function expectAllContiguous() {
  const rows = await prisma.participant.findMany({ orderBy: [{ tableId: 'asc' }, { seatOrder: 'asc' }] });
  const tables = await prisma.seatTable.findMany({ where: { kind: 'NORMAL' }, orderBy: { id: 'asc' } });
  for (const { id: t } of tables) {
    const orders = rows
      .filter((p) => p.tableId === t)
      .map((p) => p.seatOrder)
      .sort((a, b) => (a ?? -1) - (b ?? -1));
    expect(orders, `內部編號 ${t} 的桌的座號`).toEqual(orders.map((_, i) => i));
  }
  for (const p of rows) if (p.tableId === null) expect(p.seatOrder, `未入座的 ${p.id}`).toBeNull();
  const positions = tables.map((t) => t.position).filter((p): p is number => p !== null);
  expect(new Set(positions).size, '一個位置最多一張桌').toBe(positions.length);
}

// ---- 桌子與位置（D-027；docs/architecture.md 第 7.1 節：position 1–30 是位置、null 是暫存區；工作人員桌 id 0、position null）

export type TableRow = { id: number; kind: 'NORMAL' | 'STAFF'; position: number | null; stagedAt: string | null; noteName: string | null };

const toRow = (t: { id: number; kind: 'NORMAL' | 'STAFF'; position: number | null; stagedAt: Date | null; noteName: string | null }): TableRow => ({
  id: t.id,
  kind: t.kind,
  position: t.position,
  stagedAt: t.stagedAt ? t.stagedAt.toISOString() : null,
  noteName: t.noteName,
});

/** 這張桌在資料庫的樣子；已不存在時是 null */
export async function tableRow(id: number): Promise<TableRow | null> {
  const t = await prisma.seatTable.findUnique({ where: { id } });
  return t ? toRow(t) : null;
}

/** 全部桌（含工作人員桌），依 id；比對「桌子沒有任何改變」用 */
export async function allTableRows(): Promise<TableRow[]> {
  return (await prisma.seatTable.findMany({ orderBy: { id: 'asc' } })).map(toRow);
}

/** 這個位置（1–30）上的桌的 id；「未放桌」是 null */
export async function tableAt(position: number): Promise<number | null> {
  const t = await prisma.seatTable.findFirst({ where: { position, kind: 'NORMAL' } });
  return t?.id ?? null;
}

/** 這張桌所在的位置；暫存區是 null */
export async function positionOfTable(id: number): Promise<number | null> {
  return (await prisma.seatTable.findUniqueOrThrow({ where: { id } })).position;
}

/** 暫存區的桌，依移入的先後由上往下（2.1.12） */
export async function stagedTableIds(): Promise<number[]> {
  const rows = await prisma.seatTable.findMany({ where: { kind: 'NORMAL', position: null }, orderBy: [{ stagedAt: 'asc' }, { id: 'asc' }] });
  return rows.map((t) => t.id);
}

/** 這個位置上的桌的名單（依座號）；「未放桌」是空陣列 */
export async function rosterAt(position: number): Promise<number[]> {
  const id = await tableAt(position);
  return id === null ? [] : roster(id);
}

/** 模擬承辦人先前把桌子移到暫存區：position null、stagedAt 是給的時間（預設依呼叫順序遞增的過去時間） */
let stagedSeq = 0;
export async function stageTable(id: number, stagedAt: Date = new Date(Date.UTC(2026, 0, 1, 0, 0, ++stagedSeq))): Promise<void> {
  await prisma.seatTable.update({ where: { id }, data: { position: null, stagedAt } });
}

/** 模擬承辦人先前刪掉這個位置上的桌：這個位置變成「未放桌」（要先確定桌上沒有人） */
export async function emptyPosition(position: number): Promise<void> {
  await prisma.seatTable.deleteMany({ where: { position, kind: 'NORMAL' } });
}

/** 直接新增一張桌（模擬先前新增、或別人剛新增）：id 預設是目前最大的 id 加 1；position null 時放在暫存區 */
export async function insertTable(data: { id?: number; position: number | null; stagedAt?: Date | null; noteName?: string | null }): Promise<number> {
  const max = (await prisma.seatTable.aggregate({ _max: { id: true } }))._max.id ?? 30;
  const id = data.id ?? Math.max(max, 30) + 1;
  const stagedAt = data.position === null ? (data.stagedAt ?? new Date(Date.UTC(2026, 0, 1, 0, 0, ++stagedSeq))) : null;
  await prisma.seatTable.create({ data: { id, kind: 'NORMAL', position: data.position, stagedAt, noteName: data.noteName ?? null } });
  return id;
}

/** 新增一張暫存的桌，坐 count 位已報名的員工；回傳桌的 id 與名單 */
export async function stagedTableWith(count: number, noteName: string | null = null): Promise<{ tableId: number; people: number[] }> {
  const tableId = await insertTable({ position: null, noteName });
  return { tableId, people: await seatNewEmployees(tableId, count) };
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
