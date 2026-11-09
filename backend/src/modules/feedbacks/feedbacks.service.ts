import { randomUUID } from "crypto";
import { Prisma, type Feedback as FeedbackDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { registrarAuditoria } from "../../utils/auditoria";
import { eventosComCertificado, temCertificado } from "../../utils/certificado";
import type { Feedback } from "../../types/domain";
import { COM_ALUNO_DA_INSCRICAO } from "../inscricoes/inscricoes.service";
import { MOTIVOS_EXCLUSAO_FEEDBACK, type MotivoExclusaoFeedback } from "./feedbacks.schemas";

interface FiltrosListagem {
  eventoId?: string;
  participanteId?: string;
  // so avaliacoes de eventos visiveis pra quem chama (o professor, so as dos eventos dele)
  escopoEvento?: Prisma.EventoWhereInput;
}

// prisma devolve criadoEm como Date, resto do app espera string (ISO)
function paraDominio(feedback: FeedbackDb): Feedback {
  return { ...feedback, criadoEm: feedback.criadoEm.toISOString() };
}

// lista feedbacks filtrados, mais recente primeiro
async function listar(filtros: FiltrosListagem) {
  const feedbacks = await prisma.feedback.findMany({
    where: {
      eventoId: filtros.eventoId,
      participanteId: filtros.participanteId,
      ...(filtros.escopoEvento ? { evento: filtros.escopoEvento } : {}),
    },
    orderBy: { criadoEm: "desc" },
  });
  return feedbacks.map(paraDominio);
}

// tela Avaliacoes da equipe e do professor: as mesmas avaliacoes ja com o nome do aluno (da conta dele)
// e se ele esta ativo — a tela nao precisa mais baixar a lista inteira de participantes pra cruzar
async function listarParaGestao(filtros: FiltrosListagem) {
  const feedbacks = await prisma.feedback.findMany({
    where: {
      eventoId: filtros.eventoId,
      participanteId: filtros.participanteId,
      ...(filtros.escopoEvento ? { evento: filtros.escopoEvento } : {}),
    },
    orderBy: { criadoEm: "desc" },
    include: { participante: { select: COM_ALUNO_DA_INSCRICAO } },
  });
  return feedbacks.map(({ participante, ...feedback }) => ({
    ...paraDominio(feedback),
    participanteNome: participante.usuarios[0]?.nome ?? "",
    participanteAtivo: participante.ativo,
  }));
}

// busca um feedback pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const feedback = await prisma.feedback.findUnique({ where: { id } });
  if (!feedback) throw AppError.naoEncontrado("FEEDBACK_NAO_ENCONTRADO", "Feedback não encontrado.");
  return paraDominio(feedback);
}

// aluno so avalia palestra em que ja recebeu o certificado (mesma regra da tela de Certificados:
// presenca confirmada + nota minima no questionario, ver utils/certificado.ts)
async function validarDireitoAoCertificado(eventoId: string, participanteId: string) {
  if (!(await temCertificado(participanteId, eventoId))) {
    throw AppError.acessoNegado("Você só pode avaliar palestras em que recebeu o certificado.");
  }
}

// eventos que o aluno pode avaliar agora: tem certificado e ainda nao mandou feedback (quem excluiu
// o proprio feedback volta a ver o evento aqui — e assim que ele corrige uma avaliacao)
async function listarEventosElegiveis(participanteId: string) {
  const [comCertificado, jaAvaliados] = await Promise.all([
    eventosComCertificado(participanteId),
    prisma.feedback.findMany({ where: { participanteId }, select: { eventoId: true } }),
  ]);
  const avaliados = new Set(jaAvaliados.map((feedback) => feedback.eventoId));
  const elegiveis = comCertificado.filter((eventoId) => !avaliados.has(eventoId));

  const eventos = await prisma.evento.findMany({
    where: { id: { in: elegiveis } },
    orderBy: { horario: "desc" },
    select: { id: true, titulo: true, horario: true },
  });
  return eventos.map((evento) => ({ id: evento.id, titulo: evento.titulo, horario: evento.horario.toISOString() }));
}

// cria um feedback novo, bloqueia duplicidade e evento inexistente
async function criar(eventoId: string, participanteId: string, nota: number, comentario: string, atorId: string) {
  const evento = await prisma.evento.findUnique({ where: { id: eventoId } });
  if (!evento) throw AppError.validacao("Dados inválidos.", [{ campo: "eventoId", mensagem: "Palestra não encontrada." }]);

  let feedback: FeedbackDb;
  try {
    feedback = await prisma.feedback.create({
      data: { id: randomUUID(), eventoId, participanteId, nota, comentario },
    });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      throw AppError.conflito("FEEDBACK_JA_ENVIADO", "Você já enviou feedback para esta palestra.");
    }
    throw erro;
  }
  // o comentario eh texto livre e pode ter dado pessoal, entao nunca vai pro log
  await registrarAuditoria(atorId, "FEEDBACK_CRIADO", `feedback ${feedback.id} (evento ${eventoId}, participante ${participanteId})`);
  return paraDominio(feedback);
}

// o proprio aluno exclui o feedback dele (depois pode mandar outro pro mesmo evento)
async function excluirPeloAluno(id: string, participanteIdDoToken: string, atorId: string) {
  const feedback = await buscarOuFalhar(id);
  if (feedback.participanteId !== participanteIdDoToken) {
    throw AppError.acessoNegado("Você só pode excluir o seu próprio feedback.");
  }
  await prisma.feedback.delete({ where: { id } });
  await registrarAuditoria(
    atorId,
    "FEEDBACK_EXCLUIDO",
    `feedback ${id} (evento ${feedback.eventoId}, participante ${feedback.participanteId}) excluído pelo próprio aluno`,
  );
}

// a equipe nao edita feedback de aluno, so exclui — e sempre com um motivo da lista fechada
async function excluirPelaEquipe(id: string, motivo: MotivoExclusaoFeedback, atorId: string) {
  const feedback = await buscarOuFalhar(id);
  await prisma.feedback.delete({ where: { id } });
  await registrarAuditoria(
    atorId,
    "FEEDBACK_EXCLUIDO",
    `feedback ${id} (evento ${feedback.eventoId}, participante ${feedback.participanteId}) excluído pela equipe — ` +
      `motivo: ${MOTIVOS_EXCLUSAO_FEEDBACK[motivo]}`,
  );
}

export const feedbacksService = {
  listarParaGestao,
  listar,
  buscarOuFalhar,
  validarDireitoAoCertificado,
  listarEventosElegiveis,
  criar,
  excluirPeloAluno,
  excluirPelaEquipe,
};
