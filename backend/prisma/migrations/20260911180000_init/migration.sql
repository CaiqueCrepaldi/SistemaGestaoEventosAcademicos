-- CreateTable
CREATE TABLE `usuarios` (
    `id` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `emailLogin` VARCHAR(191) NOT NULL,
    `senhaHash` VARCHAR(191) NOT NULL,
    `perfil` ENUM('ADMINISTRADOR', 'SECRETARIA', 'ALUNO') NOT NULL,
    `rgm` VARCHAR(191) NULL,
    `participanteId` VARCHAR(191) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `usuarios_emailLogin_key`(`emailLogin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `participantes` (
    `id` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `rgm` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `participantes_email_key`(`email`),
    UNIQUE INDEX `participantes_rgm_key`(`rgm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `salas` (
    `id` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `capacidade` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `palestrantes` (
    `id` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `telefone` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `palestrantes_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `eventos` (
    `id` VARCHAR(191) NOT NULL,
    `titulo` VARCHAR(191) NOT NULL,
    `horario` DATETIME(3) NOT NULL,
    `salaId` VARCHAR(191) NOT NULL,
    `palestranteId` VARCHAR(191) NOT NULL,
    `tema` VARCHAR(191) NOT NULL,
    `cargaHoraria` DOUBLE NOT NULL,
    `questionario` JSON NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inscricoes` (
    `id` VARCHAR(191) NOT NULL,
    `participanteId` VARCHAR(191) NOT NULL,
    `eventoId` VARCHAR(191) NOT NULL,
    `statusPresenca` ENUM('PENDENTE', 'PRESENTE', 'AUSENTE') NOT NULL DEFAULT 'PENDENTE',
    `dataCheckin` DATETIME(3) NULL,
    `usuarioId` VARCHAR(191) NULL,
    `dataInscricao` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `inscricoes_participanteId_eventoId_key`(`participanteId`, `eventoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feedbacks` (
    `id` VARCHAR(191) NOT NULL,
    `eventoId` VARCHAR(191) NOT NULL,
    `participanteId` VARCHAR(191) NOT NULL,
    `nota` INTEGER NOT NULL,
    `comentario` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `feedbacks_participanteId_eventoId_key`(`participanteId`, `eventoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recuperacoes_senha` (
    `id` VARCHAR(191) NOT NULL,
    `usuarioId` VARCHAR(191) NOT NULL,
    `codigo` VARCHAR(191) NOT NULL,
    `expiraEm` DATETIME(3) NOT NULL,
    `usadoEm` DATETIME(3) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tentativas_questionario` (
    `id` VARCHAR(191) NOT NULL,
    `participanteId` VARCHAR(191) NOT NULL,
    `eventoId` VARCHAR(191) NOT NULL,
    `respostas` JSON NOT NULL,
    `acertos` INTEGER NOT NULL,
    `totalPerguntas` INTEGER NOT NULL,
    `percentual` INTEGER NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_participanteId_fkey` FOREIGN KEY (`participanteId`) REFERENCES `participantes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos` ADD CONSTRAINT `eventos_salaId_fkey` FOREIGN KEY (`salaId`) REFERENCES `salas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos` ADD CONSTRAINT `eventos_palestranteId_fkey` FOREIGN KEY (`palestranteId`) REFERENCES `palestrantes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscricoes` ADD CONSTRAINT `inscricoes_participanteId_fkey` FOREIGN KEY (`participanteId`) REFERENCES `participantes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscricoes` ADD CONSTRAINT `inscricoes_eventoId_fkey` FOREIGN KEY (`eventoId`) REFERENCES `eventos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscricoes` ADD CONSTRAINT `inscricoes_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedbacks` ADD CONSTRAINT `feedbacks_eventoId_fkey` FOREIGN KEY (`eventoId`) REFERENCES `eventos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedbacks` ADD CONSTRAINT `feedbacks_participanteId_fkey` FOREIGN KEY (`participanteId`) REFERENCES `participantes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recuperacoes_senha` ADD CONSTRAINT `recuperacoes_senha_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tentativas_questionario` ADD CONSTRAINT `tentativas_questionario_participanteId_fkey` FOREIGN KEY (`participanteId`) REFERENCES `participantes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tentativas_questionario` ADD CONSTRAINT `tentativas_questionario_eventoId_fkey` FOREIGN KEY (`eventoId`) REFERENCES `eventos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
