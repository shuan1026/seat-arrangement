// 把桌子恢復成部署時的樣子（D-027；docs/architecture.md 第 7.1 節）：內部編號 1–30 的 30 張桌各在自己的位置（position = id）、
// 沒有備註名稱、不在暫存區（stagedAt 是 null）；刪掉這次測試新增的桌（id > 30）；工作人員桌（id 0）不刪也不重建，只清備註名稱。
// 整合測試（tests/helpers/db.ts，用 Prisma 的 $executeRawUnsafe）與 E2E（tests/e2e/helpers/*-db.ts、seating-data.ts，用 mariadb）共用同一組 SQL。
// 不引用 src/，E2E 也可以用。
//
// 呼叫前要先刪掉參與人員（Participant.tableId 參照 SeatTable）。
// position 有 unique：先把一般桌的 position 都清成 null，再逐列設回 position = id，不會在中途撞到別桌的位置。
// 測試裡被 deleteTable 刪掉的 1–30 桌用 INSERT … ON DUPLICATE KEY UPDATE 重建（原本的 id）。

/** 內部編號 1–30 */
const IDS = Array.from({ length: 30 }, (_, i) => i + 1);

export const RESET_TABLES_SQL: readonly string[] = [
  'UPDATE `SeatTable` SET `position` = NULL, `stagedAt` = NULL, `noteName` = NULL, `updatedAt` = CURRENT_TIMESTAMP(3)',
  'DELETE FROM `SeatTable` WHERE `id` > 30',
  'INSERT INTO `SeatTable` (`id`, `kind`, `position`, `stagedAt`, `noteName`, `updatedAt`) VALUES ' +
    IDS.map((id) => `(${id}, 'NORMAL', ${id}, NULL, NULL, CURRENT_TIMESTAMP(3))`).join(', ') +
    ' ON DUPLICATE KEY UPDATE `kind` = VALUES(`kind`), `position` = VALUES(`position`), `stagedAt` = NULL, `noteName` = NULL, `updatedAt` = CURRENT_TIMESTAMP(3)',
];
