import 'server-only';
import type { AppState, Employee, Participant, SeatTable } from '@/contracts/entities';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';

// 全部資料（員工、參與人員、桌次）一次載入：資料量很小，搜尋、篩選、統計都在瀏覽器算（docs/architecture.md 第 10.2 節）。

type Db = Prisma.TransactionClient | typeof prisma;

export const toEmployee = (e: Prisma.EmployeeGetPayload<object>): Employee => ({
  id: e.id,
  name: e.name,
  englishName: e.englishName,
  department: e.department,
  team: e.team,
  extension: e.extension,
  region: e.region,
  office: e.office,
  note: e.note,
  declined: e.declined,
  sortOrder: e.sortOrder,
});

export const toParticipant = (p: Prisma.ParticipantGetPayload<object>): Participant => ({
  id: p.id,
  kind: p.kind,
  employeeId: p.employeeId,
  hostId: p.hostId,
  relation: p.relation,
  guestName: p.guestName,
  organization: p.organization,
  title: p.title,
  childSeat: p.childSeat,
  vegetarian: p.vegetarian,
  note: p.note,
  tableId: p.tableId,
  seatOrder: p.seatOrder,
  createdAt: p.createdAt.toISOString(),
});

export const toSeatTable = (t: Prisma.SeatTableGetPayload<object>): SeatTable => ({
  id: t.id,
  kind: t.kind,
  position: t.position,
  stagedAt: t.stagedAt ? t.stagedAt.toISOString() : null,
  noteName: t.noteName,
});


export async function loadState(db: Db = prisma): Promise<AppState> {
  const [employees, participants, tables] = await Promise.all([
    db.employee.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    db.participant.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    db.seatTable.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return {
    employees: employees.map(toEmployee),
    participants: participants.map(toParticipant),
    tables: tables.map(toSeatTable),
  };
}
