-- CreateTable
CREATE TABLE `Editor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(254) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(254) NULL,

    UNIQUE INDEX `Editor_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `seatsPublished` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 發布設定的唯一一列（docs/architecture.md 第 7.1、7.3 節）：預設未發布（PRM-R17）
INSERT INTO `Setting` (`id`, `seatsPublished`, `updatedAt`) VALUES (1, false, CURRENT_TIMESTAMP(3));
