-- 桌子與位置分開（D-027；docs/architecture.md 第 7.1 節）：加上 position（1–30 是位置，null 是暫存區）與 stagedAt。
-- 既有的 1–30 桌放在原本的位置（position = id），工作人員桌（id 0）是 null；id 不變，參與人員的 tableId 不必改。
ALTER TABLE `SeatTable` ADD COLUMN `position` INTEGER NULL AFTER `kind`,
    ADD COLUMN `stagedAt` DATETIME(3) NULL AFTER `position`;

UPDATE `SeatTable` SET `position` = `id` WHERE `kind` = 'NORMAL' AND `id` BETWEEN 1 AND 30;

CREATE UNIQUE INDEX `SeatTable_position_key` ON `SeatTable`(`position`);
