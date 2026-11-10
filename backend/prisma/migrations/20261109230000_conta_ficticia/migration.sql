-- Conta da carga de demonstracao (scripts/carga-demonstracao.ts): o sistema nunca manda e-mail para ela.
-- SQL gerado com "prisma migrate diff" (schema anterior -> atual), equivalente ao "migrate dev --create-only".
-- So aditiva: uma coluna nova em usuarios, false para todas as contas que ja existem. Nao apaga nem renomeia
-- nada: o codigo que esta no ar continua funcionando com ela aplicada.

-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `ficticio` BOOLEAN NOT NULL DEFAULT false;
