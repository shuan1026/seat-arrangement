import 'server-only';
import type { PublishedSeating } from '@/contracts/permissions';
import { toPublishedTables } from '@/domain/published-seating';
import { prisma } from '../db';
import { logInfo } from '../log';
import { loadState } from './state';

// 座位發布（D-021；docs/spec/permissions.md 第 3.3、3.4 節；docs/architecture.md 第 11.5 節）。
// 發布設定存在 Setting 的 id = 1 那一列（由 migration 建好）；萬一那一列不見了，讀取當作未發布、寫入時補建。

const SETTING_ID = 1;

/** 目前是否已發布（PRM-R17，預設未發布） */
export async function getSeatsPublished(): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { id: SETTING_ID }, select: { seatsPublished: true } });
  return row?.seatsPublished ?? false;
}

/** 開啟或停止發布（PRM-R19）；兩位編輯者先後切換時以後切換的為準 */
export async function setSeatsPublished(published: boolean, by: { id: string }): Promise<boolean> {
  const row = await prisma.setting.upsert({
    where: { id: SETTING_ID },
    update: { seatsPublished: published },
    create: { id: SETTING_ID, seatsPublished: published },
    select: { seatsPublished: true },
  });
  logInfo({ eventType: 'seats_publish_changed', message: 'Seats publish setting changed', userId: by.id, published: row.seatsPublished });
  return row.seatsPublished;
}

/**
 * 發布頁 /seats 與 GET /api/seats 的資料（PRM-R22、PRM-R27、PRM-R29）：未發布時只有 { published: false }，不查座位；
 * 已發布時每次都讀最新的座位，只留發布頁要顯示的欄位。
 */
export async function getPublishedSeating(): Promise<PublishedSeating> {
  if (!(await getSeatsPublished())) return { published: false };
  return { published: true, tables: toPublishedTables(await loadState()) };
}
