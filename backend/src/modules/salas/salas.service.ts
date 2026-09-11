import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";

// lista salas ordenadas por nome
async function listar() {
  return prisma.sala.findMany({ orderBy: { nome: "asc" } });
}

// busca uma sala pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const sala = await prisma.sala.findUnique({ where: { id } });
  if (!sala) throw AppError.naoEncontrado("SALA_NAO_ENCONTRADA", "Sala não encontrada.");
  return sala;
}

export const salasService = { listar, buscarOuFalhar };
