-- Certificado registrado (RF018/RF019) e validacao publica (RF027): o certificado passa a ser gravado
-- na primeira emissao, com um codigo de validacao aleatorio e a copia dos dados impressos.
-- SQL gerado com "prisma migrate diff" (schema anterior -> atual), equivalente ao "migrate dev --create-only".
-- So cria tabela nova: nao altera nem apaga nada que ja existe.

-- CreateTable
CREATE TABLE `certificados` (
    `id` VARCHAR(191) NOT NULL,
    `inscricaoId` VARCHAR(191) NOT NULL,
    `codigoValidacao` VARCHAR(20) NOT NULL,
    `nomeParticipante` TEXT NOT NULL,
    `rgm` VARCHAR(20) NOT NULL,
    `tituloEvento` VARCHAR(191) NOT NULL,
    `temaEvento` VARCHAR(191) NOT NULL,
    `nomePalestrante` VARCHAR(191) NOT NULL,
    `dataEvento` DATETIME(3) NOT NULL,
    `cargaHoraria` DOUBLE NOT NULL,
    `emitidoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `certificados_inscricaoId_key`(`inscricaoId`),
    UNIQUE INDEX `certificados_codigoValidacao_key`(`codigoValidacao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `certificados` ADD CONSTRAINT `certificados_inscricaoId_fkey` FOREIGN KEY (`inscricaoId`) REFERENCES `inscricoes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
