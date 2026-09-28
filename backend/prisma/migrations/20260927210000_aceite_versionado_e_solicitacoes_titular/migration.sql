-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `versaoTermosAceitos` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `solicitacoes_titular` (
    `id` VARCHAR(191) NOT NULL,
    `participanteId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ABERTA',
    `descricao` TEXT NULL,
    `resposta` TEXT NULL,
    `atendidoPorId` VARCHAR(191) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atendidoEm` DATETIME(3) NULL,

    INDEX `solicitacoes_titular_participanteId_idx`(`participanteId`),
    INDEX `solicitacoes_titular_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `solicitacoes_titular` ADD CONSTRAINT `solicitacoes_titular_participanteId_fkey` FOREIGN KEY (`participanteId`) REFERENCES `participantes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `solicitacoes_titular` ADD CONSTRAINT `solicitacoes_titular_atendidoPorId_fkey` FOREIGN KEY (`atendidoPorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
