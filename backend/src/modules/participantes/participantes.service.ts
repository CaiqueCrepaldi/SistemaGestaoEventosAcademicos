import { Prisma, type Participante as ParticipanteDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import type { Participante } from "../../types/domain";
import type { ParticipanteUpdateInput } from "./participantes.schemas";

// prisma devolve criadoEm como Date, resto do app espera string (ISO)
function paraDominio(participante: ParticipanteDb): Participante {
  return { ...participante, criadoEm: participante.criadoEm.toISOString() };
}

// lista participantes ordenados por nome
async function listar() {
  const participantes = await prisma.participante.findMany({ orderBy: { nome: "asc" } });
  return participantes.map(paraDominio);
}

// busca um participante pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const participante = await prisma.participante.findUnique({ where: { id } });
  if (!participante) throw AppError.naoEncontrado("PARTICIPANTE_NAO_ENCONTRADO", "Participante não encontrado.");
  return paraDominio(participante);
}

function relancarComoConflito(erro: unknown): never {
  if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
    throw AppError.conflito("DUPLICIDADE_PARTICIPANTE", "Já existe um participante com este e-mail ou RGM.");
  }
  throw erro;
}

async function atualizar(id: string, dados: ParticipanteUpdateInput) {
  await buscarOuFalhar(id);

  try {
    const participante = await prisma.participante.update({
      where: { id },
      data: dados,
    });
    return paraDominio(participante);
  } catch (erro) {
    relancarComoConflito(erro);
  }
}

async function remover(id: string) {
  await buscarOuFalhar(id);

  const inscricoes = await prisma.inscricao.count({ where: { participanteId: id } });
  const usuarios = await prisma.usuario.count({ where: { participanteId: id } });

  if (inscricoes > 0 || usuarios > 0) {
    throw AppError.conflito(
      "PARTICIPANTE_EM_USO",
      "Não é possível remover este participante porque ele está vinculado a inscrições ou a um usuário.",
    );
  }

  await prisma.participante.delete({ where: { id } });
}

export const participantesService = { listar, buscarOuFalhar, atualizar, remover };
