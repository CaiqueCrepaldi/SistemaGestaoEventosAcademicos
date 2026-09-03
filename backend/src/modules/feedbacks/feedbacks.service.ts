import { randomUUID } from "crypto";
import { eventosStore, feedbacksStore, participantesStore } from "../../db/store";
import { AppError } from "../../errors/AppError";
import type { FeedbackUpdateInput } from "./feedbacks.schemas";

interface FiltrosListagem {
  eventoId?: string;
  participanteId?: string;
}

async function listar(filtros: FiltrosListagem) {
  return feedbacksStore
    .listarComFiltro(
      (f) =>
        (!filtros.eventoId || f.eventoId === filtros.eventoId) &&
        (!filtros.participanteId || f.participanteId === filtros.participanteId),
    )
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

async function buscarOuFalhar(id: string) {
  const feedback = feedbacksStore.buscarPorId(id);
  if (!feedback) throw AppError.naoEncontrado("FEEDBACK_NAO_ENCONTRADO", "Feedback não encontrado.");
  return feedback;
}

async function criar(eventoId: string, participanteId: string, nota: number, comentario: string) {
  const evento = eventosStore.buscarPorId(eventoId);
  const participante = participantesStore.buscarPorId(participanteId);
  const erros: { campo: string; mensagem: string }[] = [];
  if (!evento) erros.push({ campo: "eventoId", mensagem: "Evento não encontrado." });
  if (!participante) erros.push({ campo: "participanteId", mensagem: "Participante não encontrado." });
  if (erros.length > 0) throw AppError.validacao("Dados inválidos.", erros);

  const jaExiste = feedbacksStore.buscarUm((f) => f.participanteId === participanteId && f.eventoId === eventoId);
  if (jaExiste) {
    throw AppError.conflito("FEEDBACK_JA_ENVIADO", "Você já enviou feedback para este evento.");
  }

  return feedbacksStore.criar({
    id: randomUUID(),
    eventoId,
    participanteId,
    nota,
    comentario,
    criadoEm: new Date().toISOString(),
  });
}

async function atualizar(id: string, dados: FeedbackUpdateInput) {
  await buscarOuFalhar(id);
  return feedbacksStore.atualizar(id, dados)!;
}

async function remover(id: string) {
  await buscarOuFalhar(id);
  feedbacksStore.remover(id);
}

export const feedbacksService = { listar, buscarOuFalhar, criar, atualizar, remover };
