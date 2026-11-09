-- Check-in pedido pelo aluno e aprovado pelo professor do evento ou pela equipe.
-- SQL gerado com "prisma migrate diff" (schema anterior -> atual), equivalente ao "migrate dev --create-only".
-- So aditiva: o enum statusPresenca ganha SOLICITADO e RECUSADO no fim da lista (PENDENTE, PRESENTE e
-- AUSENTE continuam iguais, com o mesmo padrao) e a coluna nova checkinSolicitadoEm nasce nula. Nao
-- apaga nem renomeia nada: o codigo que esta no ar continua funcionando com ela aplicada.

-- AlterTable
ALTER TABLE `inscricoes` ADD COLUMN `checkinSolicitadoEm` DATETIME(3) NULL,
    MODIFY `statusPresenca` ENUM('PENDENTE', 'PRESENTE', 'AUSENTE', 'SOLICITADO', 'RECUSADO') NOT NULL DEFAULT 'PENDENTE';
