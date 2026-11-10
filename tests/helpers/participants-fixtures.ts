// 參與人員整合測試的資料與檢查（只用虛構資料）。建立員工與參與人員沿用 tests/helpers/factory.ts。
import { expect } from 'vitest';
import { STAFF_TABLE_ID } from '@/contracts/entities';
import { prisma } from './db';
import { createEmployee, createGuest, createRegisteredEmployee } from './factory';

/**
 * 規格驗收條件的示範資料：員工名單有王小明（研發一部，分機 1234）、李美華（業務部，分機 5678）、
 * 陳大文（研發一部，沒有分機）；王小明、李美華已報名，陳大文未報名（docs/spec/participants.md 第 5 節）。
 */
export async function demoRoster() {
  const wang = await createRegisteredEmployee({ name: '王小明', department: '研發一部', extension: '1234' });
  const lee = await createRegisteredEmployee({ name: '李美華', department: '業務部', extension: '5678' });
  const chen = await createEmployee({ name: '陳大文', department: '研發一部' });
  return { wang, lee, chen };
}

/** 目前坐在這一桌的人數 */
export const countAt = (tableId: number) => prisma.participant.count({ where: { tableId } });

/** 把這些人依序排到這一桌名單的最後 */
export async function seatAt(tableId: number, ...ids: number[]): Promise<void> {
  let order = await countAt(tableId);
  for (const id of ids) {
    await prisma.participant.update({ where: { id }, data: { tableId, seatOrder: order++ } });
  }
}

/** 在這一桌加入 count 位外部貴賓（排在名單最後），回傳他們的 id */
export async function fillTable(tableId: number, count: number): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const g = await createGuest({ guestName: `佔位貴賓${tableId}-${i + 1}` });
    await seatAt(tableId, g.id);
    ids.push(g.id);
  }
  return ids;
}

/** 在工作人員桌加入 count 位已報名的員工，回傳他們的參與人員 id */
export async function fillStaff(count: number): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const { participant } = await createRegisteredEmployee({ name: `工作人員${i + 1}`, department: '總務部' });
    await seatAt(STAFF_TABLE_ID, participant.id);
    ids.push(participant.id);
  }
  return ids;
}

/** 這一桌的名單（參與人員 id，依桌內順序） */
export async function seatedIds(tableId: number): Promise<number[]> {
  const rows = await prisma.participant.findMany({ where: { tableId }, orderBy: [{ seatOrder: 'asc' }, { id: 'asc' }] });
  return rows.map((p) => p.id);
}

/** 這一桌每個人的桌內順序（依順序排好）；每次異動後應該是 0..n-1（docs/architecture.md 第 7.2 節） */
export async function seatOrdersAt(tableId: number): Promise<(number | null)[]> {
  const rows = await prisma.participant.findMany({ where: { tableId }, orderBy: [{ seatOrder: 'asc' }, { id: 'asc' }] });
  return rows.map((p) => p.seatOrder);
}

export const contiguous = (n: number) => Array.from({ length: n }, (_, i) => i);

/** 全部員工與參與人員，用來確認「沒有任何改變」 */
export async function snapshot() {
  const [employees, participants] = await Promise.all([
    prisma.employee.findMany({ orderBy: { id: 'asc' } }),
    prisma.participant.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return { employees, participants };
}

/** 讀出回應：成功時依 schema 解析；失敗時讓測試失敗並印出本體 */
export async function okJson<T>(res: Response, schema: { parse: (v: unknown) => T }): Promise<T> {
  const text = await res.text();
  expect(res.ok, `HTTP ${res.status}：${text}`).toBe(true);
  return schema.parse(JSON.parse(text));
}

/** 讀出錯誤回應：{ status, code, message, fields } */
export async function errorOf(res: Response) {
  const text = await res.text();
  expect(res.ok, `應該失敗，卻是 HTTP ${res.status}：${text}`).toBe(false);
  const body = JSON.parse(text) as { error: { code: string; message: string; fields?: Record<string, string> } };
  return { status: res.status, ...body.error };
}
