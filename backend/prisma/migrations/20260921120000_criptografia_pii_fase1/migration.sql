-- Fase 1 de 2 da criptografia de PII (nome/e-mail/rgm). Esta fase eh segura de
-- rodar com dado existente: so alarga colunas e adiciona colunas novas ANULAVEIS,
-- sem exigir NOT NULL/UNIQUE ainda. Depois desta migration, rode o script de
-- backfill (backend/scripts/backfill-criptografia.ts) pra cifrar o dado existente
-- e preencher os indices de busca ANTES de aplicar a fase 2
-- (20260921120500_criptografia_pii_fase2), que so entao trava NOT NULL + UNIQUE.

-- remove os indices unicos antigos: email/rgm/emailLogin viram texto cifrado
-- (saida do AES-GCM muda a cada chamada mesmo pro mesmo valor), entao a unicidade
-- de verdade passa a viver nas colunas de hash (fase 2)
ALTER TABLE `usuarios` DROP INDEX `usuarios_emailLogin_key`;
ALTER TABLE `participantes` DROP INDEX `participantes_email_key`;
ALTER TABLE `participantes` DROP INDEX `participantes_rgm_key`;

-- alarga pra TEXT (o texto cifrado em base64 fica maior que o original)
ALTER TABLE `usuarios`
  MODIFY COLUMN `nome` TEXT NOT NULL,
  MODIFY COLUMN `emailLogin` TEXT NOT NULL,
  MODIFY COLUMN `rgm` TEXT NULL,
  ADD COLUMN `emailLoginHash` VARCHAR(191) NULL;

ALTER TABLE `participantes`
  MODIFY COLUMN `nome` TEXT NOT NULL,
  MODIFY COLUMN `email` TEXT NOT NULL,
  MODIFY COLUMN `rgm` TEXT NOT NULL,
  ADD COLUMN `emailHash` VARCHAR(191) NULL,
  ADD COLUMN `rgmHash` VARCHAR(191) NULL;
