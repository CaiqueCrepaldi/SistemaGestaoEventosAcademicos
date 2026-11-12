-- Salas no padrao da UMC: o codigo da sala (ex.: 1T-01) fica na coluna nome, agora unica, e a sala ganha o tipo
-- (sala de aula, laboratorio ou auditorio). SQL gerado com "prisma migrate diff" (schema anterior -> atual).
-- So aditiva: uma coluna nova com valor padrao SALA_DE_AULA para as salas que ja existem e um indice unico em
-- nome. Nao apaga nem renomeia nada. O indice falha se houver duas salas com o mesmo nome: confira antes com
-- SELECT nome, COUNT(*) FROM salas GROUP BY nome HAVING COUNT(*) > 1;

-- AlterTable
ALTER TABLE `salas` ADD COLUMN `tipo` ENUM('SALA_DE_AULA', 'LABORATORIO', 'AUDITORIO') NOT NULL DEFAULT 'SALA_DE_AULA';

-- CreateIndex
CREATE UNIQUE INDEX `salas_nome_key` ON `salas`(`nome`);
