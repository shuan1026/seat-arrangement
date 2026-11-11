-- 編輯者名單改為權限名單（D-026；docs/architecture.md 第 7.1 節）。
-- 表改名、unique 索引一併改名，加上 role；既有的列都是編輯者，所以加欄位時用預設值 EDITOR 補上，再拿掉預設值（之後由程式指定）。
RENAME TABLE `Editor` TO `Member`;

ALTER TABLE `Member` RENAME INDEX `Editor_email_key` TO `Member_email_key`;

ALTER TABLE `Member` ADD COLUMN `role` ENUM('EDITOR', 'VIEWER') NOT NULL DEFAULT 'EDITOR' AFTER `email`;

ALTER TABLE `Member` ALTER COLUMN `role` DROP DEFAULT;
