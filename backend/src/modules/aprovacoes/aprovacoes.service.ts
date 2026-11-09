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
      prisma.evento.count({ where: { situacao: "RECUSADO", criadoPorId: ator.id } }),
      prisma.propostaAlteracao.count({ where: { tipo: "EVENTO", situacao: "RECUSADO", evento: { criadoPorId: ator.id } } }),
      prisma.palestrante.count({ where: { situacao: "RECUSADO", criadoPorId: ator.id } }),
      prisma.propostaAlteracao.count({ where: { tipo: "PALESTRANTE", situacao: "RECUSADO", palestrante: { criadoPorId: ator.id } } }),
    ]);
    return { eventosRecusados: eventos + propostasEvento, palestrantesRecusados: palestrantes + propostasPalestrante };
  }
  return {};
}

export const aprovacoesService = { registrarHistorico, listarHistorico, contadores };
