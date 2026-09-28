-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `versaoToken` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `limites_acesso` (
    `id` VARCHAR(191) NOT NULL,
    `chave` VARCHAR(191) NOT NULL,
    `tentativas` INTEGER NOT NULL DEFAULT 0,
    `bloqueadoAte` DATETIME(3) NULL,
    `atualizadoEm` DATETIME(3) NOT NULL,
    UNIQUE INDEX `limites_acesso_chave_key`(`chave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
