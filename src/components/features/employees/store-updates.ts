// 員工名單頁對前端 store 的改動（樂觀更新與用伺服器回應校正）。純函式：輸入目前的全部資料，回傳新的資料。
// 刪除員工、取消報名後，同桌的人重排成連續的 0..n-1，和伺服器的做法相同（docs/architecture.md 第 7.2 節）。
import type { AppState, Employee, Participant } from '@/contracts/entities';

// ---- 暫時 id：新增的員工或參與人員在伺服器回應前先用負數 id 顯示；
// 儲存佇列依序送出，後面的請求送出時（resolveId）已經拿得到伺服器給的 id。
let lastTempId = 0;
const resolved = new Map<number, number>();

export const newTempId = (): number => --lastTempId;
export const rememberId = (tempId: number, realId: number) => resolved.set(tempId, realId);
export const resolveId = (id: number): number => resolved.get(id) ?? id;

/** 有人離開的桌次：剩下的人依原本的順序重排成 0..n-1 */
function resequence(participants: Participant[], tableIds: Iterable<number | null>): Participant[] {
  const tables = new Set([...tableIds].filter((t): t is number => t != null));
  if (tables.size === 0) return participants;
  const order = new Map<number, number>();
  for (const tableId of tables) {
    participants
      .filter((p) => p.tableId === tableId)
      .sort(
        (a, b) => (a.seatOrder ?? Number.MAX_SAFE_INTEGER) - (b.seatOrder ?? Number.MAX_SAFE_INTEGER) || a.id - b.id,
      )
      .forEach((p, i) => order.set(p.id, i));
  }
  return participants.map((p) =>
    order.has(p.id) && order.get(p.id) !== p.seatOrder ? { ...p, seatOrder: order.get(p.id)! } : p,
  );
}

/** 移除參與人員；員工的眷屬一併移除，空出的座位重排 */
export function removeParticipants(data: AppState, ids: Iterable<number>): AppState {
  const removed = new Set(ids);
  for (const p of data.participants) if (p.hostId != null && removed.has(p.hostId)) removed.add(p.id);
  const tables = data.participants.filter((p) => removed.has(p.id)).map((p) => p.tableId);
  return {
    ...data,
    participants: resequence(
      data.participants.filter((p) => !removed.has(p.id)),
      tables,
    ),
  };
}

/** 用伺服器回應的參與人員覆蓋（新增或更新） */
export function upsertParticipants(data: AppState, list: readonly Participant[]): AppState {
  if (list.length === 0) return data;
  const byId = new Map(list.map((p) => [p.id, p]));
  const kept = data.participants.map((p) => byId.get(p.id) ?? p);
  const known = new Set(kept.map((p) => p.id));
  return { ...data, participants: [...kept, ...list.filter((p) => !known.has(p.id))] };
}

export const addEmployee = (data: AppState, e: Employee): AppState => ({ ...data, employees: [...data.employees, e] });

/** 換掉一位員工（暫時 id 換成伺服器的資料，或編輯後校正） */
export const replaceEmployee = (data: AppState, id: number, e: Employee): AppState => ({
  ...data,
  employees: data.employees.map((x) => (x.id === id ? e : x)),
});

/** 刪除員工：已報名的一併取消報名、移除眷屬（EMP-R43） */
export function removeEmployee(data: AppState, id: number): AppState {
  const own = data.participants.filter((p) => p.kind === 'EMPLOYEE' && p.employeeId === id).map((p) => p.id);
  const next = removeParticipants(data, own);
  return { ...next, employees: next.employees.filter((e) => e.id !== id) };
}

/** 員工加入尾牙後還沒有伺服器回應時的參與人員：只有員工本人、未入座（EMP-R22） */
export const pendingParticipant = (employeeId: number): Participant => ({
  id: newTempId(),
  kind: 'EMPLOYEE',
  employeeId,
  hostId: null,
  relation: null,
  guestName: null,
  organization: null,
  title: null,
  childSeat: false,
  vegetarian: false,
  note: null,
  tableId: null,
  seatOrder: null,
  createdAt: new Date().toISOString(),
});
