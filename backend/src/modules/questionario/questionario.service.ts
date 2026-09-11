import { randomUUID } from "crypto";
import type { TentativaQuestionario as TentativaDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { MAX_TENTATIVAS_QUESTIONARIO, PERCENTUAL_APROVACAO } from "../../utils/questionario";
import type { PerguntaQuestionario, TentativaQuestionario } from "../../types/domain";
import type { RespostasQuestionarioInput } from "./questionario.schemas";

// prisma devolve criadoEm como Date (resto do app espera string ISO) e respostas como Json (guardado assim pq mysql nao tem array nativo)
function paraDominio(tentativa: TentativaDb): TentativaQuestionario {
  return {
    ...tentativa,
    criadoEm: tentativa.criadoEm.toISOString(),
    respostas: tentativa.respostas as unknown as number[],
  };
}

// busca o evento pelo id, 404 se nao existir
async function buscarEventoOuFalhar(eventoId: string) {
  const evento = await prisma.evento.findUnique({ where: { id: eventoId } });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  return evento;
}

// corrige contra o gabarito do evento e salva a tentativa
// no maximo 2 tentativas por aluno/evento; aprovou uma vez (>= PERCENTUAL_APROVACAO), nao pode mais refazer
async function responder(eventoId: string, participanteId: string, dados: RespostasQuestionarioInput) {
  const evento = await buscarEventoOuFalhar(eventoId);
  const questionario = evento.questionario as unknown as PerguntaQuestionario[];
  if (dados.respostas.length !== questionario.length) {
    throw AppError.validacao("Responda todas as perguntas do questionário antes de enviar.");
  }

  const tentativasAnteriores = await prisma.tentativaQuestionario.findMany({ where: { eventoId, participanteId } });
  const jaAprovado = tentativasAnteriores.some((t) => t.percentual >= PERCENTUAL_APROVACAO);
  if (jaAprovado) {
    throw AppError.conflito(
      "QUESTIONARIO_JA_APROVADO",
      "Você já atingiu a nota mínima neste questionário e não pode refazê-lo.",
    );
  }
  if (tentativasAnteriores.length >= MAX_TENTATIVAS_QUESTIONARIO) {
    throw AppError.conflito(
      "LIMITE_TENTATIVAS_ATINGIDO",
      `Você já utilizou as ${MAX_TENTATIVAS_QUESTIONARIO} tentativas permitidas para este questionário.`,
    );
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
