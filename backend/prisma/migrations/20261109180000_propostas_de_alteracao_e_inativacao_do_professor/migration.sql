-- Propostas de alteracao (evento e palestrante ja aprovados) e inativacao da conta de professor.
-- SQL gerado com "prisma migrate diff" (schema anterior -> atual), equivalente ao "migrate dev --create-only".
-- So aditiva: duas colunas novas em usuarios (ativo = true para todas as contas que ja existem;
-- motivoInativacao nulo) e uma tabela nova. Nao apaga nem renomeia nada: o codigo que esta no ar
-- continua funcionando com ela aplicada.

-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `ativo` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `motivoInativacao` VARCHAR(500) NULL;

-- CreateTable
CREATE TABLE `propostas_alteracao` (
    `id` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `eventoId` VARCHAR(191) NULL,
    `palestranteId` VARCHAR(191) NULL,
    `situacao` ENUM('PENDENTE', 'APROVADO', 'RECUSADO') NOT NULL DEFAULT 'PENDENTE',
    `novaSalaId` VARCHAR(191) NULL,
    `novoHorario` DATETIME(3) NULL,
    `novaCargaHoraria` DOUBLE NULL,
    `novoPalestranteId` VARCHAR(191) NULL,
    `novoNome` VARCHAR(191) NULL,
    `novoEmail` VARCHAR(191) NULL,
    `motivoRecusa` TEXT NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizadoEm` DATETIME(3) NOT NULL,
    `decididoEm` DATETIME(3) NULL,

    INDEX `propostas_alteracao_eventoId_situacao_idx`(`eventoId`, `situacao`),
    INDEX `propostas_alteracao_palestranteId_situacao_idx`(`palestranteId`, `situacao`),
    INDEX `propostas_alteracao_novaSalaId_situacao_idx`(`novaSalaId`, `situacao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `propostas_alteracao` ADD CONSTRAINT `propostas_alteracao_eventoId_fkey` FOREIGN KEY (`eventoId`) REFERENCES `eventos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `propostas_alteracao` ADD CONSTRAINT `propostas_alteracao_palestranteId_fkey` FOREIGN KEY (`palestranteId`) REFERENCES `palestrantes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `propostas_alteracao` ADD CONSTRAINT `propostas_alteracao_criadoPorId_fkey` FOREIGN KEY (`criadoPorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

