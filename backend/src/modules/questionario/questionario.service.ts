import { randomUUID } from "crypto";
import type { TentativaQuestionario as TentativaDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import type { PerguntaQuestionario, TentativaQuestionario } from "../../types/domain";
import type { RespostasQuestionarioInput } from "./questionario.schemas";

// prisma devolve criadoEm como Date, resto do app espera string (ISO)
function paraDominio(tentativa: TentativaDb): TentativaQuestionario {
  return { ...tentativa, criadoEm: tentativa.criadoEm.toISOString() };
}

// busca o evento pelo id, 404 se nao existir
async function buscarEventoOuFalhar(eventoId: string) {
  const evento = await prisma.evento.findUnique({ where: { id: eventoId } });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  return evento;
}

// corrige contra o gabarito do evento e salva a tentativa
// pode ter mais de uma tentativa por aluno/evento, quem decide elegibilidade de certificado usa a melhor
async function responder(eventoId: string, participanteId: string, dados: RespostasQuestionarioInput) {
  const evento = await buscarEventoOuFalhar(eventoId);
  const questionario = evento.questionario as unknown as PerguntaQuestionario[];
  if (dados.respostas.length !== questionario.length) {
    throw AppError.validacao("Responda todas as perguntas do questionário antes de enviar.");
  }

  const totalPerguntas = questionario.length;
  const acertos = questionario.reduce((total, pergunta, indice) => {
    const alternativa = pergunta.alternativas[dados.respostas[indice]];
    return alternativa?.correta ? total + 1 : total;
  }, 0);
  const percentual = totalPerguntas > 0 ? Math.round((acertos / totalPerguntas) * 100) : 0;

  const tentativa = await prisma.tentativaQuestionario.create({
    data: {
      id: randomUUID(),
      participanteId,
      eventoId,
      respostas: dados.respostas,
      acertos,
      totalPerguntas,
      percentual,
    },
  });
  return paraDominio(tentativa);
}

// lista as tentativas de um aluno especifico num evento especifico
async function listarTentativas(eventoId: string, participanteId: string) {
  await buscarEventoOuFalhar(eventoId);
  const tentativas = await prisma.tentativaQuestionario.findMany({
    where: { eventoId, participanteId },
    orderBy: { criadoEm: "asc" },
  });
  return tentativas.map(paraDominio);
}

// lista todas as tentativas de todo mundo, usado na tela de certificados da equipe
async function listarTodas() {
  const tentativas = await prisma.tentativaQuestionario.findMany({ orderBy: { criadoEm: "asc" } });
  return tentativas.map(paraDominio);
}

export const questionarioService = { responder, listarTentativas, listarTodas };
