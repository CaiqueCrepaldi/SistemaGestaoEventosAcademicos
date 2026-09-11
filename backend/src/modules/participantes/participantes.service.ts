import { randomUUID } from "crypto";
import { Prisma, type Participante as ParticipanteDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import type { Participante } from "../../types/domain";
import type { ParticipanteInput, ParticipanteUpdateInput } from "./participantes.schemas";

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

// traduz violacao de unique constraint do postgres pro erro de negocio certo
function relancarComoConflito(erro: unknown): never {
  if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
    const campo = (erro.meta?.target as string[] | undefined)?.[0];
    if (campo === "rgm") throw AppError.conflito("RGM_DUPLICADO", "Já existe um participante com este RGM.");
    throw AppError.conflito("EMAIL_DUPLICADO", "Já existe um participante com este e-mail.");
  }
  throw erro;
}

// cadastra um participante novo
async function criar(dados: ParticipanteInput) {
  try {
    const participante = await prisma.participante.create({ data: { id: randomUUID(), ...dados } });
    return paraDominio(participante);
  } catch (erro) {
    relancarComoConflito(erro);
  }
}

// edita um participante existente
async function atualizar(id: string, dados: ParticipanteUpdateInput) {
  await buscarOuFalhar(id);
  try {
    const participante = await prisma.participante.update({ where: { id }, data: dados });
    return paraDominio(participante);
  } catch (erro) {
    relancarComoConflito(erro);
  }
}

// remove um participante, bloqueia se tiver inscricao/feedback vinculado
// (conta de usuario vinculada so perde a referencia, o banco faz isso sozinho via onDelete: SetNull)
async function remover(id: string) {
  await buscarOuFalhar(id);
  const [inscricoes, feedbacks] = await Promise.all([
    prisma.inscricao.count({ where: { participanteId: id } }),
    prisma.feedback.count({ where: { participanteId: id } }),
  ]);
  if (inscricoes > 0 || feedbacks > 0) {
    throw AppError.conflito(
      "CONFLITO_DEPENDENCIA",
      "Não é possível remover: existem inscrições ou feedbacks vinculados a este participante.",
    );
  }
  await prisma.participante.delete({ where: { id } });
}

export const participantesService = { listar, buscarOuFalhar, criar, atualizar, remover };
