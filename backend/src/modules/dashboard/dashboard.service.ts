import type { StatusPresenca } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { MAX_TENTATIVAS_QUESTIONARIO, PERCENTUAL_APROVACAO } from "../../utils/questionario";

// quantos eventos futuros a lista "Proximos eventos" do dashboard mostra
const LIMITE_PROXIMOS = 5;

type ContagemPresenca = Record<StatusPresenca, number>;

function contagemVazia(): ContagemPresenca {
  return { PRESENTE: 0, AUSENTE: 0, PENDENTE: 0 };
}

// resultado do questionario de quem teve a presenca confirmada num evento (indicador de aprendizagem)
interface ContagemAprendizagem {
  aprovados: number;
  reprovados: number;
  podemResponder: number;
}

function aprendizagemVazia(): ContagemAprendizagem {
  return { aprovados: 0, reprovados: 0, podemResponder: 0 };
}

// mesma regra do certificado e do questionario: aprovado = alguma tentativa com a nota minima;
// reprovado = usou as 2 tentativas sem atingir; senao ainda pode responder (nenhuma tentativa, ou 1
// tentativa abaixo da nota minima)
function situacaoNoQuestionario(tentativa: { melhorPercentual: number; tentativas: number } | undefined): keyof ContagemAprendizagem {
  if (!tentativa) return "podemResponder";
  if (tentativa.melhorPercentual >= PERCENTUAL_APROVACAO) return "aprovados";
  return tentativa.tentativas >= MAX_TENTATIVAS_QUESTIONARIO ? "reprovados" : "podemResponder";
}

// tudo que o Dashboard da equipe mostra, numa chamada so. So numeros agregados, titulo do evento e
// nome da sala — nenhum dado pessoal (nome, e-mail, RGM, quem se inscreveu ou quem avaliou)
async function resumo() {
  const agora = new Date();

  const [eventos, porEventoEStatus, presencas, tentativasPorAluno, feedbacks] = await Promise.all([
    prisma.evento.findMany({
      orderBy: { horario: "asc" },
      select: { id: true, titulo: true, horario: true, sala: { select: { nome: true, capacidade: true } } },
    }),
    prisma.inscricao.groupBy({ by: ["eventoId", "statusPresenca"], _count: { _all: true } }),
    prisma.inscricao.findMany({ where: { statusPresenca: "PRESENTE" }, select: { participanteId: true, eventoId: true } }),
    // melhor nota e numero de tentativas de cada aluno em cada evento: uma linha por par, sem respostas
    prisma.tentativaQuestionario.groupBy({
      by: ["participanteId", "eventoId"],
      _max: { percentual: true },
      _count: { _all: true },
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

  // aprendizagem: so entre quem teve a presenca confirmada (o questionario so abre pra eles). O id do
  // aluno serve so pra juntar as duas consultas aqui dentro — sai daqui so a contagem por evento
  const tentativas = new Map(
    tentativasPorAluno.map((t) => [
      `${t.participanteId}:${t.eventoId}`,
      { melhorPercentual: t._max.percentual ?? 0, tentativas: t._count._all },
    ]),
  );
  const aprendizagemPorEvento = new Map<string, ContagemAprendizagem>();
  for (const presenca of presencas) {
    const contagem = aprendizagemPorEvento.get(presenca.eventoId) ?? aprendizagemVazia();
    contagem[situacaoNoQuestionario(tentativas.get(`${presenca.participanteId}:${presenca.eventoId}`))] += 1;
    aprendizagemPorEvento.set(presenca.eventoId, contagem);
  }

  const porEvento = eventos.map((evento) => {
    const contagem = contagemPorEvento.get(evento.id) ?? contagemVazia();
    const aprendizagem = aprendizagemPorEvento.get(evento.id) ?? aprendizagemVazia();
    return {
      ...aprendizagem,
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

  // certificado liberado = presenca confirmada + nota minima no questionario do MESMO evento, ou seja,
  // os aprovados do indicador de aprendizagem
  const totalAprovados = porEvento.reduce((soma, e) => soma + e.aprovados, 0);
  const totalReprovados = porEvento.reduce((soma, e) => soma + e.reprovados, 0);
  const totalPodemResponder = porEvento.reduce((soma, e) => soma + e.podemResponder, 0);
  const certificadosLiberados = totalAprovados;
  // RF021 (aprendizagem): aprovados / quem ja concluiu o questionario (aprovados + reprovados), em %.
  // Quem ainda pode responder fica fora, senao a taxa cairia so porque o aluno nao respondeu ainda
  const concluiramQuestionario = totalAprovados + totalReprovados;

  // RF021: media, entre os eventos, de inscritos / capacidade da sala (em %). Sala sem capacidade
  // (nao deveria existir) fica fora da conta; null enquanto nao houver evento
  const comCapacidade = porEvento.filter((e) => e.capacidade > 0);
  const ocupacaoMediaSalas =
    comCapacidade.length > 0
      ? comCapacidade.reduce((soma, e) => soma + (e.inscritos / e.capacidade) * 100, 0) / comCapacidade.length
      : null;

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
      aprovadosQuestionario: totalAprovados,
      reprovadosQuestionario: totalReprovados,
      podemResponderQuestionario: totalPodemResponder,
      // null enquanto ninguem concluiu o questionario (nem aprovado nem com as 2 tentativas usadas)
      taxaAprovacao: concluiramQuestionario > 0 ? (totalAprovados / concluiramQuestionario) * 100 : null,
      ocupacaoMediaSalas,
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
      // entre os presentes: aprovados + reprovados + podemResponder = presentes
      aprovados: e.aprovados,
      reprovados: e.reprovados,
      podemResponder: e.podemResponder,
    })),
  };
}

export const dashboardService = { resumo };
