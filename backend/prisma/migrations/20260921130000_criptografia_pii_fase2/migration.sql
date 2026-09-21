-- Fase 2 de 2 da criptografia de PII. So aplicar depois do backfill
-- (scripts/backfill-criptografia.ts) confirmar 0 pendentes nos dois lados.
--
-- TiDB nao aceita combinar MODIFY COLUMN e ADD INDEX na mesma coluna num so
-- ALTER TABLE ("Unsupported operate same column") — por isso cada operacao
-- vai em uma instrucao separada.

ALTER TABLE `usuarios` MODIFY COLUMN `emailLoginHash` VARCHAR(191) NOT NULL;
ALTER TABLE `usuarios` ADD UNIQUE INDEX `usuarios_emailLoginHash_key` (`emailLoginHash`);

ALTER TABLE `participantes` MODIFY COLUMN `emailHash` VARCHAR(191) NOT NULL;
ALTER TABLE `participantes` MODIFY COLUMN `rgmHash` VARCHAR(191) NOT NULL;
ALTER TABLE `participantes` ADD UNIQUE INDEX `participantes_emailHash_key` (`emailHash`);
ALTER TABLE `participantes` ADD UNIQUE INDEX `participantes_rgmHash_key` (`rgmHash`);
