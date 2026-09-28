-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `mfaAtivadoEm` DATETIME(3) NULL,
    ADD COLUMN `mfaAtivo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `mfaSegredoCifrado` TEXT NULL,
    ADD COLUMN `mfaUltimoPasso` INTEGER NULL;

-- CreateTable
CREATE TABLE `codigos_recuperacao_mfa` (
    `id` VARCHAR(191) NOT NULL,
    `usuarioId` VARCHAR(191) NOT NULL,
    `codigoHash` VARCHAR(191) NOT NULL,
    `usadoEm` DATETIME(3) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `codigos_recuperacao_mfa_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `codigos_recuperacao_mfa` ADD CONSTRAINT `codigos_recuperacao_mfa_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
