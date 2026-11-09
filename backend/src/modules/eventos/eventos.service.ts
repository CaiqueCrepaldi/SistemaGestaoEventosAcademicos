import { randomUUID } from "crypto";
import type { Evento as EventoDb, Prisma, SituacaoAprovacao } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { enviarConfirmacaoPorEmail, paraDominio as paraDominioInscricao } from "../inscricoes/inscricoes.service";
import { listarHistorico, registrarHistorico } from "../aprovacoes/aprovacoes.service";
import { camposInformados, registrarAuditoria } from "../../utils/auditoria";
import { ehEquipe, eventoDoAtorOuFalhar, eventoEncerrado, eventosVisiveis, palestrantesVisiveis, type Ator } from "../../utils/escopo";
import type { Evento, PerguntaQuestionario } from "../../types/domain";
import type { EventoInput, EventoUpdateInput } from "./eventos.schemas";

// prisma devolve horario/criadoEm como Date e questionario como Json — converte pro formato que o resto do app espera.
// "inscritos" e so a contagem (numero agregado, nao identifica ninguem): a tela Eventos do aluno precisa
// dela e ele nao enxerga as inscricoes dos outros pra contar sozinho
function paraDominio(evento: EventoDb & { _count?: { inscricoes: number } }): Evento {
  return {
    id: evento.id,
    titulo: evento.titulo,
    horario: evento.horario.toISOString(),
    salaId: evento.salaId,
    palestranteId: evento.palestranteId,
    tema: evento.tema,
    cargaHoraria: evento.cargaHoraria,
    questionario: evento.questionario as unknown as PerguntaQuestionario[],
    inscritos: evento._count?.inscricoes,
    situacao: evento.situacao,
    motivoRecusa: evento.motivoRecusa,
    criadoPorId: evento.criadoPorId,
    criadoEm: evento.criadoEm.toISOString(),
  };
}

const COM_CONTAGEM = { _count: { select: { inscricoes: true } } } as const;

function erroEncerrado(): AppError {
  return AppError.conflito("EVENTO_ENCERRADO", "Este evento já foi encerrado e não pode mais ser editado nem excluído.");
}

// lista os eventos que quem chama pode ver (ver utils/escopo.ts), ordenados por horario. "situacao"
// filtra, por exemplo, os que aguardam aprovacao
async function listar(ator: Ator, situacao?: SituacaoAprovacao) {
  const eventos = await prisma.evento.findMany({
    where: { ...eventosVisiveis(ator), ...(situacao ? { situacao } : {}) },
    orderBy: { horario: "asc" },
    include: COM_CONTAGEM,
  });
  return eventos.map(paraDominio);
}

// busca um evento visivel pra quem chama; 404 se nao existir ou nao for dele (professor) / nao estiver
// aprovado (aluno)
async function buscarOuFalhar(id: string, ator: Ator) {
  const evento = await prisma.evento.findFirst({ where: { id, ...eventosVisiveis(ator) }, include: COM_CONTAGEM });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  return paraDominio(evento);
}

// confere se sala/palestrante informados existem. O palestrante tambem precisa estar disponivel pra quem
// cria: a equipe so usa palestrante APROVADO (o evento dela ja nasce aprovado e o aluno nunca ve palestrante
// que nao esta aprovado); o professor pode escolher um aprovado ou um dele mesmo, ainda pendente
async function validarReferencias(dados: Partial<Pick<EventoInput, "salaId" | "palestranteId">>, ator: Ator) {
  const erros: { campo: string; mensagem: string }[] = [];

  if (dados.salaId && !(await prisma.sala.findUnique({ where: { id: dados.salaId } }))) {
    erros.push({ campo: "salaId", mensagem: "Sala informada não existe." });
  }
  if (dados.palestranteId) {
    const palestrante = await prisma.palestrante.findFirst({ where: { id: dados.palestranteId, ...palestrantesVisiveis(ator) } });
    if (!palestrante) {
      erros.push({ campo: "palestranteId", mensagem: "Palestrante informado não existe." });
    } else if (ehEquipe(ator.perfil) && palestrante.situacao !== "APROVADO") {
      erros.push({ campo: "palestranteId", mensagem: "Este palestrante ainda não foi aprovado. Aprove-o antes de usá-lo num evento." });
    }
  }

  if (erros.length > 0) {
    throw AppError.validacao("Dados inválidos.", erros);
  }
}

const HORA_MS = 60 * 60 * 1000;

// RF024: um evento ocupa a sala no intervalo [horario, horario + cargaHoraria horas). Intervalo
// semiaberto: evento que termina exatamente quando o outro comeca NAO e conflito. Evento PENDENTE ja
// reserva a sala; RECUSADO nao (recusar libera a sala na hora). "ignorarEventoId" tira o proprio evento
async function validarConflitoDeSala(salaId: string, inicio: Date, cargaHoraria: number, ignorarEventoId?: string) {
  const fim = new Date(inicio.getTime() + cargaHoraria * HORA_MS);
  // so os que comecam antes do fim deste podem cruzar; o fim de cada um e conferido abaixo
  const candidatos = await prisma.evento.findMany({
    where: {
      salaId,
      horario: { lt: fim },
      situacao: { in: ["PENDENTE", "APROVADO"] },
      ...(ignorarEventoId ? { id: { not: ignorarEventoId } } : {}),
    },
    select: { titulo: true, horario: true, cargaHoraria: true },
    orderBy: { horario: "asc" },
  });
  const conflito = candidatos.find((outro) => outro.horario.getTime() + outro.cargaHoraria * HORA_MS > inicio.getTime());
  if (conflito) {
    throw AppError.conflito("CONFLITO_DE_SALA", `A sala já está ocupada pelo evento "${conflito.titulo}" nesse horário.`);
  }
}

// cadastra um evento novo. Da equipe ja nasce APROVADO; do professor nasce PENDENTE (aguarda a equipe)
async function criar(dados: EventoInput, ator: Ator) {
  await validarReferencias(dados, ator);
  await validarConflitoDeSala(dados.salaId, new Date(dados.horario), dados.cargaHoraria);
  const doProfessor = ator.perfil === "PROFESSOR";
  const evento = await prisma.evento.create({
    data: {
      id: randomUUID(),
      titulo: dados.titulo,
      horario: new Date(dados.horario),
      salaId: dados.salaId,
      palestranteId: dados.palestranteId,
      tema: dados.tema,
      cargaHoraria: dados.cargaHoraria,
      questionario: dados.questionario as unknown as Prisma.InputJsonValue,
      situacao: doProfessor ? "PENDENTE" : "APROVADO",
      criadoPorId: doProfessor ? ator.id : null,
    },
  });
  await registrarAuditoria(ator.id, "EVENTO_CRIADO", `evento ${evento.id}`);
  if (doProfessor) {
    await registrarHistorico("EVENTO", evento.id, "ENVIADO", ator.id);
    await registrarAuditoria(ator.id, "EVENTO_ENVIADO_PARA_APROVACAO", `evento ${evento.id}`);
  }
  return paraDominio(evento);
}

// sala, horario, carga horaria e palestrante de um evento ja APROVADO: o professor nao muda sozinho
// (a proposta de mudanca com nova aprovacao fica para a proxima etapa). Titulo, tema e questionario sim
function mudancasQuePrecisamDeAprovacao(atual: EventoDb, dados: EventoUpdateInput): string[] {
  const mudou: string[] = [];
  if (dados.salaId !== undefined && dados.salaId !== atual.salaId) mudou.push("salaId");
  if (dados.horario !== undefined && new Date(dados.horario).getTime() !== atual.horario.getTime()) mudou.push("horario");
  if (dados.cargaHoraria !== undefined && dados.cargaHoraria !== atual.cargaHoraria) mudou.push("cargaHoraria");
  if (dados.palestranteId !== undefined && dados.palestranteId !== atual.palestranteId) mudou.push("palestranteId");
  return mudou;
}

// edita um evento. Ninguem edita evento encerrado. Se sala, horario ou carga horaria vierem no patch,
// confere o conflito de sala com os valores finais, ignorando o proprio evento
async function atualizar(id: string, dados: EventoUpdateInput, ator: Ator) {
  const atual = await eventoDoAtorOuFalhar(ator, id);
  if (eventoEncerrado(atual)) throw erroEncerrado();
  if (ator.perfil === "PROFESSOR" && atual.situacao === "APROVADO" && mudancasQuePrecisamDeAprovacao(atual, dados).length > 0) {
    throw AppError.conflito("ALTERACAO_PRECISA_APROVACAO", "Esta alteração vai precisar de aprovação (em breve).");
  }

  await validarReferencias(
    { salaId: dados.salaId, palestranteId: dados.palestranteId !== atual.palestranteId ? dados.palestranteId : undefined },
    ator,
  );
  if (dados.salaId !== undefined || dados.horario !== undefined || dados.cargaHoraria !== undefined) {
    await validarConflitoDeSala(
      dados.salaId ?? atual.salaId,
      dados.horario ? new Date(dados.horario) : atual.horario,
      dados.cargaHoraria ?? atual.cargaHoraria,
      id,
    );
  }
  const evento = await prisma.evento.update({
    where: { id },
    data: {
      titulo: dados.titulo,
      horario: dados.horario ? new Date(dados.horario) : undefined,
      salaId: dados.salaId,
      palestranteId: dados.palestranteId,
      tema: dados.tema,
      cargaHoraria: dados.cargaHoraria,
      questionario: dados.questionario as unknown as Prisma.InputJsonValue | undefined,
    },
  });
  await registrarAuditoria(ator.id, "EVENTO_ATUALIZADO", `evento ${id} (campos: ${camposInformados(dados)})`);
  return paraDominio(evento);
}

// RF009/RNF010: evento com qualquer inscricao NAO e excluido — nada mais some em cascata pela API.
// Evento encerrado tambem nao (para todos os perfis)
async function remover(id: string, ator: Ator) {
  const evento = await eventoDoAtorOuFalhar(ator, id);
  if (eventoEncerrado(evento)) throw erroEncerrado();
  const inscricoes = await prisma.inscricao.count({ where: { eventoId: id } });
  if (inscricoes > 0) {
    throw AppError.conflito("EVENTO_COM_INSCRICOES", "Cancele as inscrições antes de excluir o evento.");
  }
  await prisma.$transaction([
    prisma.historicoAprovacao.deleteMany({ where: { tipo: "EVENTO", itemId: id } }),
    prisma.evento.delete({ where: { id } }),
  ]);
  await registrarAuditoria(ator.id, "EVENTO_REMOVIDO", `evento ${id}`);
}

// ---------------------------------------------------------------- aprovacao (so a equipe aprova/recusa)
async function eventoPendenteOuFalhar(id: string) {
  const evento = await prisma.evento.findUnique({ where: { id }, include: { palestrante: { select: { nome: true, situacao: true } } } });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  if (evento.situacao !== "PENDENTE") {
    throw AppError.conflito("EVENTO_NAO_PENDENTE", "Só é possível aprovar ou recusar um evento que está aguardando aprovação.");
  }
  return evento;
}

// aprova: confere de novo o conflito de sala e se o palestrante ja esta APROVADO
async function aprovar(id: string, ator: Ator) {
  const evento = await eventoPendenteOuFalhar(id);
  if (evento.palestrante.situacao !== "APROVADO") {
    throw AppError.conflito(
      "PALESTRANTE_NAO_APROVADO",
      `O palestrante "${evento.palestrante.nome}" ainda não foi aprovado. Aprove o palestrante antes de aprovar o evento.`,
    );
  }
  await validarConflitoDeSala(evento.salaId, evento.horario, evento.cargaHoraria, id);
  const aprovado = await prisma.evento.update({ where: { id }, data: { situacao: "APROVADO", motivoRecusa: null } });
  await registrarHistorico("EVENTO", id, "APROVADO", ator.id);
  await registrarAuditoria(ator.id, "EVENTO_APROVADO", `evento ${id}`);
  return paraDominio(aprovado);
}

// recusa com motivo (o professor ve o motivo no sistema); a sala fica livre na hora
async function recusar(id: string, motivo: string, ator: Ator) {
  await eventoPendenteOuFalhar(id);
  const recusado = await prisma.evento.update({ where: { id }, data: { situacao: "RECUSADO", motivoRecusa: motivo } });
  await registrarHistorico("EVENTO", id, "RECUSADO", ator.id, motivo);
  // o motivo e texto livre: fica so no historico, nunca na auditoria
  await registrarAuditoria(ator.id, "EVENTO_RECUSADO", `evento ${id}`);
  return paraDominio(recusado);
}

// o professor reenvia o evento recusado (depois de corrigir), com uma resposta opcional. Volta para
// PENDENTE e confere a sala de novo (enquanto estava recusado, a sala ficou livre)
async function reenviar(id: string, resposta: string | undefined, ator: Ator) {
  const evento = await eventoDoAtorOuFalhar(ator, id);
  if (evento.situacao !== "RECUSADO") {
    throw AppError.conflito("EVENTO_NAO_RECUSADO", "Só é possível reenviar um evento que foi recusado.");
  }
  if (eventoEncerrado(evento)) throw erroEncerrado();
  await validarConflitoDeSala(evento.salaId, evento.horario, evento.cargaHoraria, id);
  const reenviado = await prisma.evento.update({ where: { id }, data: { situacao: "PENDENTE", motivoRecusa: null } });
  await registrarHistorico("EVENTO", id, "REENVIADO", ator.id, resposta);
  await registrarAuditoria(ator.id, "EVENTO_REENVIADO", `evento ${id}`);
  return paraDominio(reenviado);
}

// historico da aprovacao (equipe e o professor dono do evento)
async function historico(id: string, ator: Ator) {
  await eventoDoAtorOuFalhar(ator, id);
  return listarHistorico("EVENTO", id);
}

// autoinscricao do aluno logado: checa evento aprovado, conta ativa, evento que ainda nao comecou,
// duplicidade e vaga antes de criar
async function autoinscrever(eventoId: string, participanteId: string, atorId: string) {
  const evento = await prisma.evento.findFirst({ where: { id: eventoId, situacao: "APROVADO" }, include: { sala: true } });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");

  // o aluno inativado ja nao tem sessao (a inativacao derruba as sessoes), isto e so a segunda barreira
  const participante = await prisma.participante.findUnique({ where: { id: participanteId }, select: { ativo: true } });
  if (!participante?.ativo) throw AppError.contaInativa();

  // o aluno so se inscreve antes de o evento comecar; registro retroativo de quem foi a um evento
  // passado continua possivel pela inscricao manual da secretaria
  if (evento.horario <= new Date()) {
    throw AppError.conflito("EVENTO_JA_INICIADO", "Não é possível se inscrever: o evento já começou.");
  }

  const jaInscrito = await prisma.inscricao.findUnique({
    where: { participanteId_eventoId: { participanteId, eventoId } },
  });
  if (jaInscrito) {
    throw AppError.conflito("JA_INSCRITO", "Você já está inscrito neste evento.");
  }

  const ocupadas = await prisma.inscricao.count({ where: { eventoId } });
  if (ocupadas >= evento.sala.capacidade) {
    throw AppError.conflito("EVENTO_LOTADO", "Evento sem vagas disponíveis.");
  }

  const inscricao = await prisma.inscricao.create({
    data: { id: randomUUID(), participanteId, eventoId, statusPresenca: "PENDENTE" },
  });
  await registrarAuditoria(
    atorId,
    "INSCRICAO_CRIADA",
    `inscrição ${inscricao.id} (evento ${eventoId}, participante ${participanteId}) feita pelo próprio aluno`,
  );
  // o e-mail de confirmacao sai daqui mesmo; se falhar, a inscricao continua valendo e a tela avisa
  const emailConfirmacaoEnviado = await enviarConfirmacaoPorEmail(inscricao.id, atorId);
  return { inscricao: paraDominioInscricao(inscricao), emailConfirmacaoEnviado };
}

export const eventosService = {
  listar,
  buscarOuFalhar,
  criar,
  atualizar,
  remover,
  aprovar,
  recusar,
  reenviar,
  historico,
  autoinscrever,
};
