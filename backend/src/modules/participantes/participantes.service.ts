import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import type { Participante } from "../../types/domain";
import type { Participante as ParticipanteDb } from "@prisma/client";

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

export const participantesService = { listar, buscarOuFalhar };
