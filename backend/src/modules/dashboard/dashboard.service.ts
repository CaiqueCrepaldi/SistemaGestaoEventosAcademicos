import type { StatusPresenca } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { PERCENTUAL_APROVACAO } from "../../utils/questionario";

// quantos eventos futuros a lista "Proximos eventos" do dashboard mostra
const LIMITE_PROXIMOS = 5;

type ContagemPresenca = Record<StatusPresenca, number>;

function contagemVazia(): ContagemPresenca {
  return { PRESENTE: 0, AUSENTE: 0, PENDENTE: 0 };
}

// tudo que o Dashboard da equipe mostra, numa chamada so. So numeros agregados, titulo do evento e
// nome da sala — nenhum dado pessoal (nome, e-mail, RGM, quem se inscreveu ou quem avaliou)
async function resumo() {
  const agora = new Date();

  const [eventos, porEventoEStatus, presencas, aprovacoes, feedbacks] = await Promise.all([
    prisma.evento.findMany({
      orderBy: { horario: "asc" },
      select: { id: true, titulo: true, horario: true, sala: { select: { nome: true, capacidade: true } } },
    }),
    prisma.inscricao.groupBy({ by: ["eventoId", "statusPresenca"], _count: { _all: true } }),
    prisma.inscricao.findMany({ where: { statusPresenca: "PRESENTE" }, select: { participanteId: true, eventoId: true } }),
    // mesma regra de utils/certificado.ts (atingiuNotaMinima): basta UMA tentativa com a nota minima
    prisma.tentativaQuestionario.findMany({
      where: { percentual: { gte: PERCENTUAL_APROVACAO } },
      select: { participanteId: true, eventoId: true },
    }),
    prisma.feedback.aggregate({ _avg: { nota: true }, _count: { _all: true } }),
  ]);

  // presentes/ausentes/pendentes de cada evento
  const contagemPorEvento = new Map<string, ContagemPresenca>();
  for (const linha of porEventoEStatus) {
    const contagem = contagemPorEvento.get(linha.eventoId) ?? contagemVazia();
    contagem[linha.statusPresenca] = linha._count._all;
    contagemPorEvento.set(linha.eventoId, contagem);
  }

  const porEvento = eventos.map((evento) => {
    const contagem = contagemPorEvento.get(evento.id) ?? contagemVazia();
    return {
      id: evento.id,
      titulo: evento.titulo,
      horario: evento.horario.toISOString(),
      salaNome: evento.sala.nome,
      capacidade: evento.sala.capacidade,
      inscritos: contagem.PRESENTE + contagem.AUSENTE + contagem.PENDENTE,
      presentes: contagem.PRESENTE,
      ausentes: contagem.AUSENTE,
      pendentes: contagem.PENDENTE,
    };
  });

  const totalPresentes = porEvento.reduce((soma, e) => soma + e.presentes, 0);
  const totalAusentes = porEvento.reduce((soma, e) => soma + e.ausentes, 0);
  const totalPendentes = porEvento.reduce((soma, e) => soma + e.pendentes, 0);
  const checkinsRegistrados = totalPresentes + totalAusentes;

  // certificado liberado = presenca confirmada + nota minima no questionario do MESMO evento
  const aprovados = new Set(aprovacoes.map((a) => `${a.participanteId}:${a.eventoId}`));
  const certificadosLiberados = presencas.filter((p) => aprovados.has(`${p.participanteId}:${p.eventoId}`)).length;

  const futuros = porEvento.filter((e) => new Date(e.horario) >= agora);

  return {
    totais: {
      eventos: eventos.length,
      eventosFuturos: futuros.length,
      inscricoes: totalPresentes + totalAusentes + totalPendentes,
      presentes: totalPresentes,
      ausentes: totalAusentes,
      pendentes: totalPendentes,
      // entre os check-ins ja registrados (presente ou ausente); null enquanto nao houver nenhum
      taxaPresenca: checkinsRegistrados > 0 ? (totalPresentes / checkinsRegistrados) * 100 : null,
      certificadosLiberados,
      mediaFeedback: feedbacks._avg.nota,
      totalFeedbacks: feedbacks._count._all,
    },
    proximosEventos: futuros.slice(0, LIMITE_PROXIMOS).map((e) => ({
      id: e.id,
      titulo: e.titulo,
      horario: e.horario,
      salaNome: e.salaNome,
      capacidade: e.capacidade,
      inscritos: e.inscritos,
    })),
    eventos: porEvento.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      horario: e.horario,
      inscritos: e.inscritos,
      presentes: e.presentes,
      ausentes: e.ausentes,
      pendentes: e.pendentes,
    })),
  };
}

export const dashboardService = { resumo };
