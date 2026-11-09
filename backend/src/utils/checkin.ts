import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { AppError } from "../errors/AppError";
import { registrarAuditoria } from "./auditoria";

// JANELA DO CHECK-IN: abre 1 hora antes do inicio (quem chega cedo ja pede) e fecha 24 horas depois do
// fim (fim = horario + carga horaria). Dentro dela o aluno pede e quem cuida do evento decide; fora dela
// a API recusa as duas coisas. Antes de abrir, a presenca nao pode existir: senao o aluno faria o
// questionario e emitiria o certificado de um evento que nem aconteceu
export const ANTECEDENCIA_CHECKIN_MS = 60 * 60 * 1000;
export const PRAZO_CHECKIN_APOS_FIM_MS = 24 * 60 * 60 * 1000;

interface EventoComHorario {
  horario: Date;
  cargaHoraria: number;
}

export interface JanelaCheckin {
  abre: Date;
  fecha: Date;
}

export function janelaDoCheckin(evento: EventoComHorario): JanelaCheckin {
  const inicio = evento.horario.getTime();
  const fim = inicio + evento.cargaHoraria * 3600 * 1000;
  return { abre: new Date(inicio - ANTECEDENCIA_CHECKIN_MS), fecha: new Date(fim + PRAZO_CHECKIN_APOS_FIM_MS) };
}

export type SituacaoJanela = "ANTES" | "ABERTA" | "FECHADA";

// a janela e [abre, fecha): no instante em que fecha, ja esta fechada
export function situacaoDaJanela(evento: EventoComHorario, agora = new Date()): SituacaoJanela {
  const { abre, fecha } = janelaDoCheckin(evento);
  if (agora < abre) return "ANTES";
  return agora < fecha ? "ABERTA" : "FECHADA";
}

export function garantirJanelaAberta(evento: EventoComHorario, agora = new Date()): void {
  const situacao = situacaoDaJanela(evento, agora);
  if (situacao === "ANTES") {
    throw AppError.conflito("CHECKIN_NAO_LIBERADO", "O check-in deste evento só abre 1 hora antes do início.");
  }
  if (situacao === "FECHADA") {
    throw AppError.conflito("CHECKIN_ENCERRADO", "O check-in deste evento já foi encerrado (fecha 24 horas depois do fim).");
  }
}

// EXPIRACAO: a API e serverless (nao tem processo agendado), entao quem precisa da presenca certa chama
// esta funcao antes de ler ou agir. Nos eventos cuja janela ja fechou, o pedido sem decisao (SOLICITADO)
// vira RECUSADO e quem nunca pediu (PENDENTE) vira AUSENTE. Idempotente: so mexe nesses dois estados,
// entao a segunda execucao seguida nao encontra nada. Uma linha de auditoria por execucao que mudou
// alguma coisa, so com as quantidades
export async function expirarCheckins(atorId: string | null, agora = new Date()): Promise<{ recusados: number; ausentes: number }> {
  // a janela fecha no minimo 24 horas depois do inicio (carga horaria >= 0): so esses eventos podem ter fechado.
  // O fim exato depende da carga horaria, que o banco nao soma ao horario aqui, entao o filtro final e no codigo
  const candidatos = await prisma.evento.findMany({
    where: {
      horario: { lte: new Date(agora.getTime() - PRAZO_CHECKIN_APOS_FIM_MS) },
      inscricoes: { some: { statusPresenca: { in: ["PENDENTE", "SOLICITADO"] } } },
    },
    select: { id: true, horario: true, cargaHoraria: true },
  });
  const fechados = candidatos.filter((evento) => situacaoDaJanela(evento, agora) === "FECHADA").map((evento) => evento.id);
  if (fechados.length === 0) return { recusados: 0, ausentes: 0 };

  const [recusados, ausentes] = await prisma.$transaction([
    prisma.inscricao.updateMany({
      where: { eventoId: { in: fechados }, statusPresenca: "SOLICITADO" },
      data: { statusPresenca: "RECUSADO" },
    }),
    prisma.inscricao.updateMany({
      where: { eventoId: { in: fechados }, statusPresenca: "PENDENTE" },
      data: { statusPresenca: "AUSENTE" },
    }),
  ]);
  if (recusados.count + ausentes.count > 0) {
    await registrarAuditoria(
      atorId,
      "CHECKIN_EXPIRADO",
      `janela do check-in fechada: ${recusados.count} pedido(s) sem decisão recusado(s) e ${ausentes.count} inscrição(ões) sem pedido marcada(s) como ausente`,
    );
  }
  return { recusados: recusados.count, ausentes: ausentes.count };
}

// middleware para as rotas que leem ou usam a presenca (listas de check-in e inscricoes, dashboard,
// questionario, certificados e Meus dados): roda a expiracao antes. Vai depois de "autenticar", para a
// auditoria registrar quem disparou
export function expirarCheckinsAntes(req: Request, _res: Response, next: NextFunction): void {
  expirarCheckins(req.usuario?.sub ?? null).then(
    () => next(),
    (erro) => next(erro),
  );
}
