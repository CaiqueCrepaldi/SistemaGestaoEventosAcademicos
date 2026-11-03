-- Nome e e-mail passam a ficar so na conta (usuarios); RGM so no aluno (participantes). Saem as
-- copias duplicadas e os indices de busca (HMAC) da epoca em que esses campos eram cifrados.
--
-- PRE-REQUISITO: nenhum registro antigo ainda cifrado. A conversao roda NA VERSAO ANTERIOR DO CODIGO:
-- em producao, pela rota temporaria POST /api/manutencao/conversao-dados-pessoais (commit 3ef98dd);
-- com a chave em maos, pelo script scripts/converter-dados-pessoais.ts (commit 8c2e7df).
-- Ver backend/README.md, secao "Implantacao em producao".
-- Confira no SQL Editor que as tres contagens abaixo dao 0 antes de aplicar esta migration:
--   SELECT COUNT(*) FROM usuarios WHERE emailLogin NOT LIKE '%@%';
--   SELECT COUNT(*) FROM participantes WHERE email NOT LIKE '%@%';
--   SELECT COUNT(*) FROM logs_auditoria WHERE atorNomeCifrado IS NOT NULL AND atorNome IS NULL;
--
-- TiDB nao aceita varias mudancas na mesma tabela/coluna num ALTER so (ver
-- 20260921130000_criptografia_pii_fase2): por isso cada operacao vai em uma instrucao.

-- 1. usuarios: sai o indice de busca do e-mail; o proprio e-mail vira a chave unica (minusculo, sem espaco)
DROP INDEX `usuarios_emailLoginHash_key` ON `usuarios`;
ALTER TABLE `usuarios` DROP COLUMN `emailLoginHash`;
UPDATE `usuarios` SET `emailLogin` = LOWER(TRIM(`emailLogin`));

-- 2. participante sem conta de acesso (so existe em dado de seed antigo) ganha uma conta ALUNO com o
--    nome e o e-mail que estavam nele, pra esses dados nao se perderem quando as colunas sairem.
--    Senha "!" nunca confere no bcrypt: a pessoa entra pela recuperacao de senha. Pula quem tiver o
--    e-mail ja usado por outra conta (confira antes:
--    SELECT COUNT(*) FROM participantes p WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.participanteId = p.id);)
INSERT INTO `usuarios` (`id`, `nome`, `emailLogin`, `senhaHash`, `perfil`, `participanteId`)
SELECT UUID(), p.`nome`, LOWER(TRIM(p.`email`)), '!', 'ALUNO', p.`id`
FROM `participantes` p
WHERE NOT EXISTS (SELECT 1 FROM `usuarios` u WHERE u.`participanteId` = p.`id`)
  AND NOT EXISTS (SELECT 1 FROM `usuarios` u2 WHERE u2.`emailLogin` = LOWER(TRIM(p.`email`)));

-- 3. usuarios: RGM sai (fica so no participante); e-mail vira VARCHAR com indice unico
ALTER TABLE `usuarios` DROP COLUMN `rgm`;
ALTER TABLE `usuarios` MODIFY COLUMN `emailLogin` VARCHAR(255) NOT NULL;
CREATE UNIQUE INDEX `usuarios_emailLogin_key` ON `usuarios`(`emailLogin`);

-- 4. participantes: saem nome/e-mail (ficam na conta) e os indices de busca; RGM vira a chave unica
DROP INDEX `participantes_emailHash_key` ON `participantes`;
DROP INDEX `participantes_rgmHash_key` ON `participantes`;
ALTER TABLE `participantes` DROP COLUMN `emailHash`;
ALTER TABLE `participantes` DROP COLUMN `rgmHash`;
ALTER TABLE `participantes` DROP COLUMN `nome`;
ALTER TABLE `participantes` DROP COLUMN `email`;
ALTER TABLE `participantes` MODIFY COLUMN `rgm` VARCHAR(20) NOT NULL;
CREATE UNIQUE INDEX `participantes_rgm_key` ON `participantes`(`rgm`);

-- 5. logs: sai a copia cifrada do nome do responsavel (a conversao ja passou tudo pra atorNome)
ALTER TABLE `logs_auditoria` DROP COLUMN `atorNomeCifrado`;
