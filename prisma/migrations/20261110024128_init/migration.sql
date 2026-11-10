-- CreateTable
CREATE TABLE `Employee` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `englishName` VARCHAR(100) NULL,
    `department` VARCHAR(50) NOT NULL,
    `team` VARCHAR(50) NULL,
    `extension` VARCHAR(50) NULL,
    `region` VARCHAR(20) NULL,
    `office` VARCHAR(50) NULL,
    `note` VARCHAR(500) NULL,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Employee_name_department_idx`(`name`, `department`),
    INDEX `Employee_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Participant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kind` ENUM('EMPLOYEE', 'DEPENDENT', 'GUEST') NOT NULL,
    `employeeId` INTEGER NULL,
    `hostId` INTEGER NULL,
    `relation` VARCHAR(20) NULL,
    `guestName` VARCHAR(50) NULL,
    `organization` VARCHAR(100) NULL,
    `title` VARCHAR(50) NULL,
    `childSeat` BOOLEAN NOT NULL DEFAULT false,
    `vegetarian` BOOLEAN NOT NULL DEFAULT false,
    `note` VARCHAR(500) NULL,
    `tableId` INTEGER NULL,
    `seatOrder` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Participant_employeeId_key`(`employeeId`),
    UNIQUE INDEX `Participant_hostId_key`(`hostId`),
    INDEX `Participant_tableId_seatOrder_idx`(`tableId`, `seatOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SeatTable` (
    `id` INTEGER NOT NULL,
    `kind` ENUM('NORMAL', 'STAFF') NOT NULL,
    `noteName` VARCHAR(50) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Participant` ADD CONSTRAINT `Participant_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Participant` ADD CONSTRAINT `Participant_hostId_fkey` FOREIGN KEY (`hostId`) REFERENCES `Participant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Participant` ADD CONSTRAINT `Participant_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `SeatTable`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 固定的桌次：工作人員桌（id 0）與第 1–30 桌（docs/architecture.md 第 7.1 節）
INSERT INTO `SeatTable` (`id`, `kind`, `noteName`, `updatedAt`) VALUES
  (0, 'STAFF', NULL, CURRENT_TIMESTAMP(3)),
  (1, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (2, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (3, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (4, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (5, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (6, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (7, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (8, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (9, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (10, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (11, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (12, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (13, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (14, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (15, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (16, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (17, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (18, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (19, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (20, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (21, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (22, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (23, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (24, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (25, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (26, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (27, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (28, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (29, 'NORMAL', NULL, CURRENT_TIMESTAMP(3)),
  (30, 'NORMAL', NULL, CURRENT_TIMESTAMP(3));
