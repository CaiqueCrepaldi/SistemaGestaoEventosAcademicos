-- Confirmacao do e-mail no cadastro: o aluno so ganha conta depois de digitar o codigo de 6 digitos
-- enviado ao e-mail institucional. Ate la, os dados do formulario ficam aqui por ate 15 minutos (senha
-- e codigo so como hash bcrypt) e sao apagados ao concluir o cadastro ou depois de expirar.
-- SQL gerado com "prisma migrate diff" (schema anterior -> atual), equivalente ao "migrate dev --create-only".
-- So cria tabela nova, sem relacao com as outras: nao altera nem apaga nada que ja existe, e a versao
-- que esta no ar continua funcionando com ela aplicada.

-- CreateTable
CREATE TABLE `cadastros_pendentes` (
    `id` VARCHAR(191) NOT NULL,
    `nome` TEXT NOT NULL,
    `emailLogin` VARCHAR(255) NOT NULL,
    `rgm` VARCHAR(20) NOT NULL,
    `senhaHash` VARCHAR(191) NOT NULL,
    `codigoHash` VARCHAR(191) NOT NULL,
    `tentativas` INTEGER NOT NULL DEFAULT 0,
    `envios` INTEGER NOT NULL DEFAULT 1,
    `ultimoEnvioEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `aceiteEm` DATETIME(3) NOT NULL,
    `versaoTermos` VARCHAR(20) NOT NULL,
    `expiraEm` DATETIME(3) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `cadastros_pendentes_emailLogin_key`(`emailLogin`),
    INDEX `cadastros_pendentes_rgm_idx`(`rgm`),
    INDEX `cadastros_pendentes_expiraEm_idx`(`expiraEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
