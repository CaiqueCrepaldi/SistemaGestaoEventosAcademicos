import { randomUUID } from "crypto";
import { prisma } from "../../db/prisma";
import { ehEquipe, type Ator } from "../../utils/escopo";

// historico da aprovacao de eventos e palestrantes criados por professor (tabela historico_aprovacoes).
// Fica numa tabela propria, e nao na auditoria, porque guarda o motivo da recusa e a resposta do
// professor — texto livre que a auditoria nunca grava. A auditoria registra so que houve o passo
export type TipoItemAprovacao = "EVENTO" | "PALESTRANTE";
export type AcaoAprovacao = "ENVIADO" | "APROVADO" | "RECUSADO" | "REENVIADO";

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
// recusados (pra corrigir e reenviar). Aluno nao tem contador
export async function contadores(ator: Ator) {
  if (ehEquipe(ator.perfil)) {
    const [eventosPendentes, palestrantesPendentes] = await Promise.all([
      prisma.evento.count({ where: { situacao: "PENDENTE" } }),
      prisma.palestrante.count({ where: { situacao: "PENDENTE" } }),
    ]);
    return { eventosPendentes, palestrantesPendentes };
  }
  if (ator.perfil === "PROFESSOR") {
    const [eventosRecusados, palestrantesRecusados] = await Promise.all([
      prisma.evento.count({ where: { situacao: "RECUSADO", criadoPorId: ator.id } }),
      prisma.palestrante.count({ where: { situacao: "RECUSADO", criadoPorId: ator.id } }),
    ]);
    return { eventosRecusados, palestrantesRecusados };
  }
  return {};
}

export const aprovacoesService = { registrarHistorico, listarHistorico, contadores };
