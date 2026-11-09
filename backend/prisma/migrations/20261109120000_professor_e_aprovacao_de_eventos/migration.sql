-- Perfil PROFESSOR e aprovacao de eventos e palestrantes pela equipe.
-- SQL gerado com "prisma migrate diff" (schema anterior -> atual), equivalente ao "migrate dev --create-only".
-- So aditiva: acrescenta PROFESSOR ao enum de perfis, colunas novas com valor padrao em eventos e
-- palestrantes (situacao = APROVADO para tudo o que ja existe; criadoPorId e motivoRecusa nulos) e duas
-- tabelas novas. Nao apaga nem renomeia nada: o codigo que esta no ar continua funcionando com ela aplicada.

-- AlterTable
ALTER TABLE `usuarios` MODIFY `perfil` ENUM('ADMINISTRADOR', 'SECRETARIA', 'ALUNO', 'PROFESSOR') NOT NULL;

-- AlterTable
ALTER TABLE `palestrantes` ADD COLUMN `criadoPorId` VARCHAR(191) NULL,
    ADD COLUMN `motivoRecusa` TEXT NULL,
    ADD COLUMN `situacao` ENUM('PENDENTE', 'APROVADO', 'RECUSADO') NOT NULL DEFAULT 'APROVADO';

-- AlterTable
ALTER TABLE `eventos` ADD COLUMN `criadoPorId` VARCHAR(191) NULL,
    ADD COLUMN `motivoRecusa` TEXT NULL,
    ADD COLUMN `situacao` ENUM('PENDENTE', 'APROVADO', 'RECUSADO') NOT NULL DEFAULT 'APROVADO';

-- CreateTable
CREATE TABLE `primeiros_acessos` (
    `id` VARCHAR(191) NOT NULL,
    `usuarioId` VARCHAR(191) NOT NULL,
    `codigoHash` VARCHAR(191) NOT NULL,
    `tentativas` INTEGER NOT NULL DEFAULT 0,
    `envios` INTEGER NOT NULL DEFAULT 1,
    `ultimoEnvioEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiraEm` DATETIME(3) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `primeiros_acessos_usuarioId_key`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `historico_aprovacoes` (
    `id` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `acao` VARCHAR(20) NOT NULL,
    `mensagem` TEXT NULL,
    `autorId` VARCHAR(191) NULL,
    `autorNome` TEXT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `historico_aprovacoes_tipo_itemId_idx`(`tipo`, `itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `palestrantes` ADD CONSTRAINT `palestrantes_criadoPorId_fkey` FOREIGN KEY (`criadoPorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos` ADD CONSTRAINT `eventos_criadoPorId_fkey` FOREIGN KEY (`criadoPorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `primeiros_acessos` ADD CONSTRAINT `primeiros_acessos_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historico_aprovacoes` ADD CONSTRAINT `historico_aprovacoes_autorId_fkey` FOREIGN KEY (`autorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

