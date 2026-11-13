-- Cancelamento de evento pela equipe (administrador ou secretaria): quando, por que e quem cancelou.
-- SQL gerado com "prisma migrate diff" (schema anterior -> atual), equivalente ao "migrate dev --create-only".
-- So aditiva: tres colunas novas em eventos, todas opcionais (NULL nos eventos que ja existem, que continuam
-- nao cancelados), e a chave estrangeira de quem cancelou. Nao apaga nem renomeia nada: o codigo que esta no ar
-- continua funcionando com ela aplicada.

-- AlterTable
ALTER TABLE `eventos` ADD COLUMN `canceladoEm` DATETIME(3) NULL,
    ADD COLUMN `canceladoPorId` VARCHAR(191) NULL,
    ADD COLUMN `motivoCancelamento` VARCHAR(500) NULL;

-- AddForeignKey
ALTER TABLE `eventos` ADD CONSTRAINT `eventos_canceladoPorId_fkey` FOREIGN KEY (`canceladoPorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
