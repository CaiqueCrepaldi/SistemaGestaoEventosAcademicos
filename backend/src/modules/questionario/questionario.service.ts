import { randomUUID } from "crypto";
import { eventosStore, tentativasStore } from "../../db/store";
import { AppError } from "../../errors/AppError";
import type { RespostasQuestionarioInput } from "./questionario.schemas";

function buscarEventoOuFalhar(eventoId: string) {
  const evento = eventosStore.buscarPorId(eventoId);
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  return evento;
}

// corrige contra o gabarito do evento e salva a tentativa
// pode ter mais de uma tentativa por aluno/evento, quem decide elegibilidade de certificado usa a melhor
async function responder(eventoId: string, participanteId: string, dados: RespostasQuestionarioInput) {
  const evento = buscarEventoOuFalhar(eventoId);
  if (dados.respostas.length !== evento.questionario.length) {
    throw AppError.validacao("Responda todas as perguntas do questionário antes de enviar.");
  }

  const totalPerguntas = evento.questionario.length;
  const acertos = evento.questionario.reduce((total, pergunta, indice) => {
    const alternativa = pergunta.alternativas[dados.respostas[indice]];
    return alternativa?.correta ? total + 1 : total;
  }, 0);
  const percentual = totalPerguntas > 0 ? Math.round((acertos / totalPerguntas) * 100) : 0;

  return tentativasStore.criar({
    id: randomUUID(),
    participanteId,
    eventoId,
    respostas: dados.respostas,
    acertos,
    totalPerguntas,
    percentual,
    criadoEm: new Date().toISOString(),
  });
}

async function listarTentativas(eventoId: string, participanteId: string) {
  buscarEventoOuFalhar(eventoId);
  return tentativasStore.listarComFiltro((t) => t.eventoId === eventoId && t.participanteId === participanteId);
}

async function listarTodas() {
  return tentativasStore.listar();
}

export const questionarioService = { responder, listarTentativas, listarTodas };
