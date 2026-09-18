ALTER TABLE `participantes`
  ADD COLUMN `ativo` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `motivoInativacao` VARCHAR(500) NULL;
