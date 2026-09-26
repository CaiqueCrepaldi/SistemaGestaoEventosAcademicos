/*
  Warnings:

  - You are about to drop the column `codigo` on the `recuperacoes_senha` table. All the data in the column will be lost.
  - Added the required column `codigoHash` to the `recuperacoes_senha` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `recuperacoes_senha` DROP COLUMN `codigo`,
    ADD COLUMN `codigoHash` VARCHAR(191) NOT NULL,
    ADD COLUMN `tentativas` INTEGER NOT NULL DEFAULT 0;
