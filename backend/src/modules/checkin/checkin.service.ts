import { rotuloSala } from "../../utils/salas";
import type { StatusPresenca } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { registrarAuditoria } from "../../utils/auditoria";
import { janelaDoCheckin, garantirJanelaAberta, PRAZO_CHECKIN_APOS_FIM_MS, ANTECEDENCIA_CHECKIN_MS, situacaoDaJanela } from "../../utils/checkin";
import { ehEquipe, eventosVisiveis, type Ator } from "../../utils/escopo";
import { garantirPresencaDestravada, paraDominio } from "../inscricoes/inscricoes.service";

// CHECK-IN PEDIDO PELO ALUNO: o aluno inscrito pede (SOLICITADO) dentro da janela e quem cuida do evento
// decide — o professor dono do evento (criadoPorId), a secretaria ou o administrador. Aprovar = PRESENTE
// (libera o questionario); recusar = RECUSADO (final: o aluno nao pede de novo). Enquanto a janela esta
// aberta, a decisao pode ser revertida (PRESENTE <-> RECUSADO), ate o aluno fazer a primeira tentativa do
// questionario (PRESENCA_TRAVADA). Ninguem marca presenca sem pedido do aluno. A expiracao (janela
// fechada) fica em utils/checkin.ts e roda antes destas rotas

export type Decisao = "APROVAR" | "RECUSAR";

// de onde cada decisao pode sair: o pedido em aberto ou a decisao contraria (reversao)
const ORIGENS: Record<Decisao, StatusPresenca[]> = {
  APROVAR: ["SOLICITADO", "RECUSADO"],
  RECUSAR: ["SOLICITADO", "PRESENTE"],
};
const DESTINO: Record<Decisao, StatusPresenca> = { APROVAR: "PRESENTE", RECUSAR: "RECUSADO" };

const MENSAGEM_PEDIDO_INDISPONIVEL: Partial<Record<StatusPresenca, [string, string]>> = {
  SOLICITADO: ["CHECKIN_JA_SOLICITADO", "Você já pediu o check-in deste evento. Aguarde a aprovação."],
  PRESENTE: ["CHECKIN_JA_DECIDIDO", "Sua presença neste evento já foi confirmada."],
  RECUSADO: ["CHECKIN_JA_DECIDIDO", "Seu check-in neste evento foi recusado e não pode ser pedido de novo."],
  AUSENTE: ["CHECKIN_ENCERRADO", "O check-in deste evento já foi encerrado."],
};

// quem decide o check-in do evento: equipe em qualquer um; professor so no dele (403 nos outros —
// aqui o 403 e a regra pedida, e o evento de outro professor nao e listado em lugar nenhum pra ele)
function garantirQuemDecide(ator: Ator, evento: { criadoPorId: string | null }) {
  if (ator.perfil === "PROFESSOR" && evento.criadoPorId !== ator.id) {
    throw AppError.acessoNegado("Só o professor responsável pelo evento, a secretaria ou o administrador decidem este check-in.");
  }
}

async function eventoParaDecidirOuFalhar(ator: Ator, eventoId: string) {
  const evento = await prisma.evento.findUnique({
    where: { id: eventoId },
    select: { id: true, titulo: true, horario: true, cargaHoraria: true, situacao: true, criadoPorId: true, sala: { select: { nome: true, tipo: true } } },
  });
  if (!evento || evento.situacao !== "APROVADO") throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  garantirQuemDecide(ator, evento);
  return evento;
}

// 1. o ALUNO pede o check-in do evento (participante do token, nunca da tela)
async function solicitar(eventoId: string, participanteId: string, atorId: string) {
  const participante = await prisma.participante.findUnique({ where: { id: participanteId }, select: { ativo: true } });
  if (!participante?.ativo) throw AppError.contaInativa();

  // evento pendente/recusado nao existe pro aluno
  const evento = await prisma.evento.findFirst({ where: { id: eventoId, situacao: "APROVADO" }, select: { horario: true, cargaHoraria: true } });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");

  const inscricao = await prisma.inscricao.findUnique({ where: { participanteId_eventoId: { participanteId, eventoId } } });
  if (!inscricao) throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Você não está inscrito neste evento.");

  garantirJanelaAberta(evento);
  const indisponivel = MENSAGEM_PEDIDO_INDISPONIVEL[inscricao.statusPresenca];
  if (indisponivel) throw AppError.conflito(indisponivel[0], indisponivel[1]);

  // so sai de PENDENTE: dois cliques ao mesmo tempo gravam um pedido so
  const { count } = await prisma.inscricao.updateMany({
    where: { id: inscricao.id, statusPresenca: "PENDENTE" },
    data: { statusPresenca: "SOLICITADO", checkinSolicitadoEm: new Date() },
  });
  if (count === 0) throw AppError.conflito("CHECKIN_JA_SOLICITADO", "Você já pediu o check-in deste evento. Aguarde a aprovação.");
  await registrarAuditoria(atorId, "CHECKIN_SOLICITADO", `inscrição ${inscricao.id} (evento ${eventoId})`);
  return paraDominio(await prisma.inscricao.findUniqueOrThrow({ where: { id: inscricao.id } }));
}

// 2. aprovar ou recusar um pedido (ou reverter a decisao, dentro da janela)
async function decidir(inscricaoId: string, decisao: Decisao, ator: Ator) {
  const inscricao = await prisma.inscricao.findUnique({
    where: { id: inscricaoId },
    include: {
      evento: { select: { horario: true, cargaHoraria: true, situacao: true, criadoPorId: true } },
      participante: { select: { ativo: true } },
    },
  });
  if (!inscricao || inscricao.evento.situacao !== "APROVADO") {
    throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Inscrição não encontrada.");
  }
  garantirQuemDecide(ator, inscricao.evento);
  garantirJanelaAberta(inscricao.evento);
  await garantirPresencaDestravada(inscricao.participanteId, inscricao.eventoId);

  const origem = inscricao.statusPresenca;
  const destino = DESTINO[decisao];
  if (origem === destino) {
    throw AppError.conflito(
      "CHECKIN_JA_DECIDIDO",
      decisao === "APROVAR" ? "Este check-in já foi aprovado." : "Este check-in já foi recusado.",
    );
  }
  if (!ORIGENS[decisao].includes(origem)) {
    throw AppError.conflito("CHECKIN_NAO_SOLICITADO", "O aluno não pediu o check-in deste evento: não há o que decidir.");
  }
  if (decisao === "APROVAR" && !inscricao.participante.ativo) {
    throw AppError.conflito("PARTICIPANTE_INATIVO", "Aluno inativo: não é possível confirmar presença.");
  }

  // so muda se ninguem decidiu no meio tempo (outra pessoa da equipe com o painel aberto). Desfazer a presenca
  // (PRESENTE -> RECUSADO) apaga junto, na mesma transacao, a avaliacao que o aluno ja tinha feito do evento: ela so
  // vale com a presenca confirmada. Se ele ja respondeu o questionario, nem chega aqui (PRESENCA_TRAVADA acima)
  const { count, avaliacaoApagada } = await prisma.$transaction(async (tx) => {
    const { count } = await tx.inscricao.updateMany({
      where: { id: inscricaoId, statusPresenca: origem },
      data: { statusPresenca: destino, usuarioId: ator.id, dataCheckin: new Date() },
    });
    if (count === 0 || origem !== "PRESENTE") return { count, avaliacaoApagada: null };
    const avaliacao = await tx.feedback.findUnique({
      where: { participanteId_eventoId: { participanteId: inscricao.participanteId, eventoId: inscricao.eventoId } },
      select: { id: true },
    });
    if (avaliacao) await tx.feedback.delete({ where: { id: avaliacao.id } });
    return { count, avaliacaoApagada: avaliacao?.id ?? null };
  });
  if (count === 0) {
    throw AppError.conflito("CHECKIN_JA_DECIDIDO", "Este check-in acabou de ser decidido por outra pessoa. Atualize a lista.");
  }
  if (origem === "SOLICITADO") {
    await registrarAuditoria(ator.id, decisao === "APROVAR" ? "CHECKIN_APROVADO" : "CHECKIN_RECUSADO", `inscrição ${inscricaoId}`);
  } else {
    await registrarAuditoria(ator.id, "CHECKIN_REVERTIDO", `inscrição ${inscricaoId}: de ${origem} para ${destino}`);
  }
  if (avaliacaoApagada) {
    await registrarAuditoria(
      ator.id,
      "FEEDBACK_EXCLUIDO",
      `feedback ${avaliacaoApagada} (evento ${inscricao.eventoId}, participante ${inscricao.participanteId}) apagado ao desfazer a presença (inscrição ${inscricaoId})`,
    );
  }
  return paraDominio(await prisma.inscricao.findUniqueOrThrow({ where: { id: inscricaoId } }));
}

// "Aprovar todos": so os pedidos SOLICITADO daquele evento, de alunos ativos (o aluno inativado fica
// com o pedido em aberto, como na aprovacao individual)
async function aprovarTodos(eventoId: string, ator: Ator) {
  const evento = await eventoParaDecidirOuFalhar(ator, eventoId);
  garantirJanelaAberta(evento);
  const { count } = await prisma.inscricao.updateMany({
    where: { eventoId, statusPresenca: "SOLICITADO", participante: { ativo: true } },
    data: { statusPresenca: "PRESENTE", usuarioId: ator.id, dataCheckin: new Date() },
  });
  if (count > 0) {
    await registrarAuditoria(ator.id, "CHECKIN_APROVADO_TODOS", `evento ${eventoId}: ${count} pedido(s) aprovado(s)`);
  }
  return { aprovados: count };
}

function janelaParaDTO(evento: { horario: Date; cargaHoraria: number }) {
  const { abre, fecha } = janelaDoCheckin(evento);
  return { abre: abre.toISOString(), fecha: fecha.toISOString(), situacao: situacaoDaJanela(evento) };
}

type ContagemCheckin = Record<StatusPresenca, number>;
const contagemVazia = (): ContagemCheckin => ({ PENDENTE: 0, SOLICITADO: 0, PRESENTE: 0, RECUSADO: 0, AUSENTE: 0 });

// tela Check-in: os eventos com a janela aberta que o perfil enxerga (o professor so os dele), com
// a quantidade de pedidos esperando decisao
async function eventosComJanelaAberta(ator: Ator) {
  const agora = new Date();
  // a janela de um evento que comecou ha mais de (24 h + maior carga horaria) ja fechou; o fim exato
  // depende da carga de cada evento, entao o ultimo filtro e no codigo
  const { _max } = await prisma.evento.aggregate({ _max: { cargaHoraria: true } });
  const maiorCargaMs = (_max.cargaHoraria ?? 0) * 3600 * 1000;
  const eventos = await prisma.evento.findMany({
    where: {
      ...eventosVisiveis(ator),
      situacao: "APROVADO",
      horario: {
        lte: new Date(agora.getTime() + ANTECEDENCIA_CHECKIN_MS),
        gt: new Date(agora.getTime() - PRAZO_CHECKIN_APOS_FIM_MS - maiorCargaMs),
      },
    },
    orderBy: { horario: "asc" },
    select: { id: true, titulo: true, horario: true, cargaHoraria: true, sala: { select: { nome: true, tipo: true } } },
  });
  const abertos = eventos.filter((evento) => situacaoDaJanela(evento, agora) === "ABERTA");
  const porStatus = abertos.length
    ? await prisma.inscricao.groupBy({
        by: ["eventoId", "statusPresenca"],
        where: { eventoId: { in: abertos.map((e) => e.id) } },
        _count: { _all: true },
      })
    : [];
  const contagens = new Map<string, ContagemCheckin>();
  for (const linha of porStatus) {
    const contagem = contagens.get(linha.eventoId) ?? contagemVazia();
    contagem[linha.statusPresenca] = linha._count._all;
    contagens.set(linha.eventoId, contagem);
  }
  return abertos.map((evento) => {
    const contagem = contagens.get(evento.id) ?? contagemVazia();
    return {
      id: evento.id,
      titulo: evento.titulo,
      horario: evento.horario.toISOString(),
      cargaHoraria: evento.cargaHoraria,
      salaNome: rotuloSala(evento.sala),
      janela: janelaParaDTO(evento),
      inscritos: Object.values(contagem).reduce((a, b) => a + b, 0),
      solicitados: contagem.SOLICITADO,
      presentes: contagem.PRESENTE,
      recusados: contagem.RECUSADO,
      semPedido: contagem.PENDENTE,
    };
  });
}

// painel "Check-ins" de um evento: os pedidos esperando decisao (nome, RGM e horario do pedido) e os ja
// decididos (com quem decidiu e se a presenca ja travou pelo questionario)
async function painel(eventoId: string, ator: Ator) {
  const evento = await eventoParaDecidirOuFalhar(ator, eventoId);
  const inscricoes = await prisma.inscricao.findMany({
    where: { eventoId, statusPresenca: { in: ["SOLICITADO", "PRESENTE", "RECUSADO"] } },
    orderBy: [{ checkinSolicitadoEm: "asc" }, { dataInscricao: "asc" }],
    include: {
      participante: { select: { rgm: true, ativo: true, usuarios: { where: { perfil: "ALUNO" }, take: 1, select: { nome: true } } } },
      usuario: { select: { nome: true } },
    },
  });
  const comTentativa = new Set(
    (
      await prisma.tentativaQuestionario.groupBy({
        by: ["participanteId"],
        where: { eventoId, participanteId: { in: inscricoes.map((i) => i.participanteId) } },
      })
    ).map((t) => t.participanteId),
  );
  // quem ja avaliou o evento: ao desfazer a presenca dele, a avaliacao e apagada (a tela avisa antes). So a equipe
  // recebe essa informacao: o professor nao ve avaliacoes (a tela dele avisa de forma generica)
  const avaliaram = ehEquipe(ator.perfil)
    ? new Set(
        (
          await prisma.feedback.findMany({
            where: { eventoId, participanteId: { in: inscricoes.map((i) => i.participanteId) } },
            select: { participanteId: true },
          })
        ).map((f) => f.participanteId),
      )
    : null;
  const [semPedido, ausentes] = await Promise.all([
    prisma.inscricao.count({ where: { eventoId, statusPresenca: "PENDENTE" } }),
    prisma.inscricao.count({ where: { eventoId, statusPresenca: "AUSENTE" } }),
  ]);

  const item = (i: (typeof inscricoes)[number]) => ({
    inscricaoId: i.id,
    participanteNome: i.participante.usuarios[0]?.nome ?? "",
    participanteRgm: i.participante.rgm,
    participanteAtivo: i.participante.ativo,
    statusPresenca: i.statusPresenca,
    checkinSolicitadoEm: i.checkinSolicitadoEm ? i.checkinSolicitadoEm.toISOString() : null,
    decididoEm: i.dataCheckin ? i.dataCheckin.toISOString() : null,
    decididoPor: i.usuario?.nome ?? null,
    presencaTravada: comTentativa.has(i.participanteId),
    ...(avaliaram ? { avaliou: avaliaram.has(i.participanteId) } : {}),
  });

  return {
    evento: {
      id: evento.id,
      titulo: evento.titulo,
      horario: evento.horario.toISOString(),
      cargaHoraria: evento.cargaHoraria,
      salaNome: rotuloSala(evento.sala),
    },
    janela: janelaParaDTO(evento),
    pedidos: inscricoes.filter((i) => i.statusPresenca === "SOLICITADO").map(item),
    decididos: inscricoes.filter((i) => i.statusPresenca !== "SOLICITADO").map(item),
    semPedido,
    ausentes,
  };
}

export const checkinService = { solicitar, decidir, aprovarTodos, eventosComJanelaAberta, painel };
