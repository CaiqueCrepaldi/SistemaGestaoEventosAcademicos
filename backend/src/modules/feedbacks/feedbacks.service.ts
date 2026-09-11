import { randomUUID } from "crypto";
import { Prisma, type Feedback as FeedbackDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import type { Feedback } from "../../types/domain";
import type { FeedbackUpdateInput } from "./feedbacks.schemas";

interface FiltrosListagem {
  eventoId?: string;
  participanteId?: string;
}

// prisma devolve criadoEm como Date, resto do app espera string (ISO)
function paraDominio(feedback: FeedbackDb): Feedback {
  return { ...feedback, criadoEm: feedback.criadoEm.toISOString() };
}

// lista feedbacks filtrados, mais recente primeiro
async function listar(filtros: FiltrosListagem) {
  const feedbacks = await prisma.feedback.findMany({
    where: { eventoId: filtros.eventoId, participanteId: filtros.participanteId },
    orderBy: { criadoEm: "desc" },
  });
  return feedbacks.map(paraDominio);
}

// busca um feedback pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const feedback = await prisma.feedback.findUnique({ where: { id } });
  if (!feedback) throw AppError.naoEncontrado("FEEDBACK_NAO_ENCONTRADO", "Feedback não encontrado.");
  return paraDominio(feedback);
}

// cria um feedback novo, bloqueia duplicidade e evento/participante inexistente
async function criar(eventoId: string, participanteId: string, nota: number, comentario: string) {
  const [evento, participante] = await Promise.all([
    prisma.evento.findUnique({ where: { id: eventoId } }),
    prisma.participante.findUnique({ where: { id: participanteId } }),
  ]);
  const erros: { campo: string; mensagem: string }[] = [];
  if (!evento) erros.push({ campo: "eventoId", mensagem: "Evento não encontrado." });
  if (!participante) erros.push({ campo: "participanteId", mensagem: "Participante não encontrado." });
  if (erros.length > 0) throw AppError.validacao("Dados inválidos.", erros);

  try {
    const feedback = await prisma.feedback.create({
      data: { id: randomUUID(), eventoId, participanteId, nota, comentario },
    });
    return paraDominio(feedback);
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      throw AppError.conflito("FEEDBACK_JA_ENVIADO", "Você já enviou feedback para este evento.");
    }
    throw erro;
  }
}

// edita nota/comentario de um feedback existente
async function atualizar(id: string, dados: FeedbackUpdateInput) {
  await buscarOuFalhar(id);
  const feedback = await prisma.feedback.update({ where: { id }, data: dados });
  return paraDominio(feedback);
}

// remove um feedback
async function remover(id: string) {
  await buscarOuFalhar(id);
  await prisma.feedback.delete({ where: { id } });
}

export const feedbacksService = { listar, buscarOuFalhar, criar, atualizar, remover };
