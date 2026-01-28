-- AlterTable
ALTER TABLE `User` ADD COLUMN `reset_token_expires` DATETIME(3) NULL,
    ADD COLUMN `reset_token_hash` VARCHAR(191) NULL;

-- DropTable
DROP TABLE `links`;

