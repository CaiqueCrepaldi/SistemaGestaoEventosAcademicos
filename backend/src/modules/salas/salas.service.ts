import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import type { SalaInput, SalaUpdateInput } from "./salas.schemas";

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

// cadastra uma sala nova
async function criar(dados: SalaInput) {
  return prisma.sala.create({ data: { id: randomUUID(), ...dados } });
}

// edita uma sala existente
async function atualizar(id: string, dados: SalaUpdateInput) {
  await buscarOuFalhar(id);
  return prisma.sala.update({ where: { id }, data: dados });
}

// remove uma sala, bloqueia se tiver evento vinculado (o banco tambem tem essa trava, isso so da uma mensagem melhor)
async function remover(id: string) {
  await buscarOuFalhar(id);
  const temEventoVinculado = (await prisma.evento.count({ where: { salaId: id } })) > 0;
  if (temEventoVinculado) {
    throw AppError.conflito("CONFLITO_DEPENDENCIA", "Não é possível remover: existem eventos vinculados a esta sala.");
  }
  try {
    await prisma.sala.delete({ where: { id } });
  } catch (erro) {
    // corrida rara: evento criado entre o count acima e o delete, o banco barra do mesmo jeito
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2003") {
      throw AppError.conflito("CONFLITO_DEPENDENCIA", "Não é possível remover: existem eventos vinculados a esta sala.");
    }
    throw erro;
  }
}

export const salasService = { listar, buscarOuFalhar, criar, atualizar, remover };
