import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import type { PalestranteInput, PalestranteUpdateInput } from "./palestrantes.schemas";

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

// cadastra um palestrante novo
async function criar(dados: PalestranteInput) {
  return prisma.palestrante.create({ data: { id: randomUUID(), ...dados } });
}

// edita um palestrante existente
async function atualizar(id: string, dados: PalestranteUpdateInput) {
  await buscarOuFalhar(id);
  return prisma.palestrante.update({ where: { id }, data: dados });
}

// remove um palestrante, bloqueia se tiver evento vinculado
async function remover(id: string) {
  await buscarOuFalhar(id);
  // palestrante eh obrigatorio no evento, bloqueia exclusao se tiver vinculo
  const emUso = (await prisma.evento.count({ where: { palestranteId: id } })) > 0;
  if (emUso) {
    throw AppError.conflito("PALESTRANTE_EM_USO", "Não é possível remover: há eventos vinculados a este palestrante.");
  }
  try {
    await prisma.palestrante.delete({ where: { id } });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2003") {
      throw AppError.conflito("PALESTRANTE_EM_USO", "Não é possível remover: há eventos vinculados a este palestrante.");
    }
    throw erro;
  }
}

export const palestrantesService = { listar, buscarOuFalhar, criar, atualizar, remover };
