import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";

// lista palestrantes ordenados por nome
async function listar() {
  return prisma.palestrante.findMany({ orderBy: { nome: "asc" } });
}

// busca um palestrante pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const palestrante = await prisma.palestrante.findUnique({ where: { id } });
  if (!palestrante) throw AppError.naoEncontrado("PALESTRANTE_NAO_ENCONTRADO", "Palestrante não encontrado.");
  return palestrante;
}

export const palestrantesService = { listar, buscarOuFalhar };
