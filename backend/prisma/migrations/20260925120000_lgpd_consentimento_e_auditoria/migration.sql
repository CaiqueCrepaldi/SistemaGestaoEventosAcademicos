-- data/hora do aceite dos termos de uso/politica de privacidade no cadastro (LGPD)
ALTER TABLE `usuarios` ADD COLUMN `consentimentoLgpdEm` DATETIME(3) NULL;

-- trilha de auditoria: login, mudanca em registro critico
CREATE TABLE `logs_auditoria` (
  `id` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `usuarioId` VARCHAR(191) COLLATE utf8mb4_unicode_ci NULL,
  `acao` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `detalhe` TEXT COLLATE utf8mb4_unicode_ci NULL,
  `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `logs_auditoria_criadoEm_idx` (`criadoEm`),
  KEY `logs_auditoria_usuarioId_fkey` (`usuarioId`),
  CONSTRAINT `logs_auditoria_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
