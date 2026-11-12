import { randomUUID } from "crypto";
import { prisma } from "../../db/prisma";
import { ehEquipe, type Ator } from "../../utils/escopo";

// historico da aprovacao de eventos e palestrantes criados por professor (tabela historico_aprovacoes).
// Fica numa tabela propria, e nao na auditoria, porque guarda o motivo da recusa e a resposta do
// professor — texto livre que a auditoria nunca grava. A auditoria registra so que houve o passo
export type TipoItemAprovacao = "EVENTO" | "PALESTRANTE";
// os 4 primeiros sao do item (evento/palestrante criado por professor); os PROPOSTA_* sao da proposta de
// alteracao de um item ja aprovado; TRANSFERIDO e o evento passado para outro dono na inativacao do professor
export type AcaoAprovacao =
  | "ENVIADO"
  | "APROVADO"
  | "RECUSADO"
  | "REENVIADO"
  | "PROPOSTA_ENVIADA"
  | "PROPOSTA_EDITADA"
  | "PROPOSTA_APROVADA"
  | "PROPOSTA_RECUSADA"
  | "PROPOSTA_REENVIADA"
  | "PROPOSTA_CANCELADA"
  | "TRANSFERIDO";

export async function registrarHistorico(
  tipo: TipoItemAprovacao,
  itemId: string,
  acao: AcaoAprovacao,
  autorId: string,
  mensagem?: string | null,
) {
  // copia o nome de quem agiu: se a conta sair, o historico continua dizendo quem foi
  const autor = await prisma.usuario.findUnique({ where: { id: autorId }, select: { nome: true } });
  await prisma.historicoAprovacao.create({
    data: { id: randomUUID(), tipo, itemId, acao, mensagem: mensagem?.trim() || null, autorId, autorNome: autor?.nome ?? null },
  });
}

// o historico de um item, do mais antigo pro mais novo
export async function listarHistorico(tipo: TipoItemAprovacao, itemId: string) {
  const linhas = await prisma.historicoAprovacao.findMany({ where: { tipo, itemId }, orderBy: { criadoEm: "asc" } });
  return linhas.map((linha) => ({
    acao: linha.acao as AcaoAprovacao,
    mensagem: linha.mensagem,
    autorNome: linha.autorNome,
    criadoEm: linha.criadoEm.toISOString(),
  }));
}

// contadores do menu: a equipe ve quantos itens aguardam aprovacao; o professor, quantos dos dele foram
// recusados (pra corrigir e reenviar). Propostas de alteracao entram na conta do item: um evento aprovado
// com proposta pendente conta como pendente. Aluno nao tem contador
export async function contadores(ator: Ator) {
  if (ehEquipe(ator.perfil)) {
    const [eventos, propostasEvento, palestrantes, propostasPalestrante] = await Promise.all([
      prisma.evento.count({ where: { situacao: "PENDENTE" } }),
      prisma.propostaAlteracao.count({ where: { tipo: "EVENTO", situacao: "PENDENTE" } }),
      prisma.palestrante.count({ where: { situacao: "PENDENTE" } }),
      prisma.propostaAlteracao.count({ where: { tipo: "PALESTRANTE", situacao: "PENDENTE" } }),
    ]);
    return { eventosPendentes: eventos + propostasEvento, palestrantesPendentes: palestrantes + propostasPalestrante };
  }
  if (ator.perfil === "PROFESSOR") {
    const [eventos, propostasEvento, palestrantes, propostasPalestrante] = await Promise.all([
      prisma.evento.findMany({ where: { situacao: "RECUSADO", criadoPorId: ator.id }, select: { id: true } }),
      prisma.propostaAlteracao.findMany({
        where: { tipo: "EVENTO", situacao: "RECUSADO", evento: { criadoPorId: ator.id } },
        select: { eventoId: true },
      }),
      prisma.palestrante.findMany({ where: { situacao: "RECUSADO", criadoPorId: ator.id }, select: { id: true } }),
      prisma.propostaAlteracao.findMany({
        where: { tipo: "PALESTRANTE", situacao: "RECUSADO", palestrante: { criadoPorId: ator.id } },
        select: { palestranteId: true },
      }),
    ]);
    return {
      eventosRecusados: eventos.length + propostasEvento.length,
      palestrantesRecusados: palestrantes.length + propostasPalestrante.length,
      recusas: await identificarRecusas([
        ...eventos.map((e) => ({ tipo: "EVENTO", itemId: e.id, acao: "RECUSADO" })),
        ...propostasEvento.flatMap((p) => (p.eventoId ? [{ tipo: "EVENTO", itemId: p.eventoId, acao: "PROPOSTA_RECUSADA" }] : [])),
        ...palestrantes.map((p) => ({ tipo: "PALESTRANTE", itemId: p.id, acao: "RECUSADO" })),
        ...propostasPalestrante.flatMap((p) =>
          p.palestranteId ? [{ tipo: "PALESTRANTE", itemId: p.palestranteId, acao: "PROPOSTA_RECUSADA" }] : [],
        ),
      ]),
    };
  }
  return {};
}

// um identificador por recusa em aberto do professor: o id da linha do historico que registrou a recusa (a
// mais recente do item). Recusar de novo um item reenviado gera outra linha, e portanto outro id: e assim que
// a tela sabe que chegou uma recusa nova depois que o professor fechou o aviso. Sem a linha (dado antigo),
// vale um id montado com o item
async function identificarRecusas(abertas: { tipo: string; itemId: string; acao: string }[]) {
  if (abertas.length === 0) return [];
  const linhas = await prisma.historicoAprovacao.findMany({
    where: { OR: abertas },
    select: { id: true, tipo: true, itemId: true, acao: true },
    orderBy: { criadoEm: "desc" },
  });
  return abertas.map(
    ({ tipo, itemId, acao }) =>
      linhas.find((l) => l.tipo === tipo && l.itemId === itemId && l.acao === acao)?.id ?? `${tipo}-${acao}-${itemId}`,
  );
}

export const aprovacoesService = { registrarHistorico, listarHistorico, contadores };
