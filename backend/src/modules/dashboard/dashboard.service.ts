import { rotuloSala } from "../../utils/salas";
import type { StatusPresenca } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { eventosDoDashboard, type Ator } from "../../utils/escopo";
import { resumoDeOcupacao } from "../../utils/ocupacao";
import { MAX_TENTATIVAS_QUESTIONARIO, PERCENTUAL_APROVACAO } from "../../utils/questionario";

// quantos eventos futuros a lista "Proximos eventos" do dashboard mostra
const LIMITE_PROXIMOS = 5;

type ContagemPresenca = Record<StatusPresenca, number>;

function contagemVazia(): ContagemPresenca {
  return { PENDENTE: 0, SOLICITADO: 0, PRESENTE: 0, RECUSADO: 0, AUSENTE: 0 };
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

// tudo que o Dashboard mostra, numa chamada so. So numeros agregados, titulo do evento e nome da sala —
// nenhum dado pessoal (nome, e-mail, RGM, quem se inscreveu ou quem avaliou). So eventos APROVADOS entram
// na conta; para o professor, TODOS os numeros, graficos e listas contam so os eventos dele (utils/escopo.ts:
// eventosDoDashboard), e ele nao recebe os indicadores de certificados nem de avaliacoes (nao ve nenhum dos dois)
async function resumo(ator: Ator) {
  const agora = new Date();
  const escopo = eventosDoDashboard(ator);
  const professor = ator.perfil === "PROFESSOR";

  const [eventos, porEventoEStatus, presencas, tentativasPorAluno, feedbacks] = await Promise.all([
    prisma.evento.findMany({
      where: escopo,
      orderBy: { horario: "asc" },
      select: { id: true, titulo: true, horario: true, cargaHoraria: true, sala: { select: { nome: true, tipo: true, capacidade: true } } },
    }),
    prisma.inscricao.groupBy({ by: ["eventoId", "statusPresenca"], where: { evento: escopo }, _count: { _all: true } }),
    prisma.inscricao.findMany({ where: { statusPresenca: "PRESENTE", evento: escopo }, select: { participanteId: true, eventoId: true } }),
    // melhor nota e numero de tentativas de cada aluno em cada evento: uma linha por par, sem respostas
    prisma.tentativaQuestionario.groupBy({
      by: ["participanteId", "eventoId"],
      where: { evento: escopo },
      _max: { percentual: true },
      _count: { _all: true },
    }),
    professor ? Promise.resolve(null) : prisma.feedback.aggregate({ where: { evento: escopo }, _avg: { nota: true }, _count: { _all: true } }),
  ]);

  // situacao do check-in de cada evento
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
      salaNome: rotuloSala(evento.sala),
      capacidade: evento.sala.capacidade,
      inscritos: contagem.PENDENTE + contagem.SOLICITADO + contagem.PRESENTE + contagem.RECUSADO + contagem.AUSENTE,
      // check-in pedido pelo aluno: presente = aprovado; ausente = nao pediu a tempo ou teve o pedido
      // recusado; aguardando = ainda sem pedido ou com o pedido esperando decisao
      presentes: contagem.PRESENTE,
      ausentes: contagem.AUSENTE + contagem.RECUSADO,
      aguardando: contagem.PENDENTE + contagem.SOLICITADO,
    };
  });

  const totalPresentes = porEvento.reduce((soma, e) => soma + e.presentes, 0);
  const totalAusentes = porEvento.reduce((soma, e) => soma + e.ausentes, 0);
  const totalAguardando = porEvento.reduce((soma, e) => soma + e.aguardando, 0);
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

  // RF021: ocupacao REAL das salas — media, entre os eventos ENCERRADOS, de presentes (check-in
  // PRESENTE) / capacidade da sala, em %. Mesma funcao da listagem de salas (utils/ocupacao.ts); sala sem
  // capacidade fica fora; null enquanto nenhum evento tiver terminado
  const { ocupacaoMedia: ocupacaoMediaSalas } = resumoDeOcupacao(
    eventos.map((evento) => ({
      horario: evento.horario,
      cargaHoraria: evento.cargaHoraria,
      capacidade: evento.sala.capacidade,
      presentes: contagemPorEvento.get(evento.id)?.PRESENTE ?? 0,
    })),
    agora,
  );

  const futuros = porEvento.filter((e) => new Date(e.horario) >= agora);

  return {
    totais: {
      eventos: eventos.length,
      eventosFuturos: futuros.length,
      inscricoes: totalPresentes + totalAusentes + totalAguardando,
      presentes: totalPresentes,
      ausentes: totalAusentes,
      aguardando: totalAguardando,
      // entre as presencas ja definidas (presente, ou ausente/recusado); null enquanto nao houver nenhuma
      taxaPresenca: checkinsRegistrados > 0 ? (totalPresentes / checkinsRegistrados) * 100 : null,
      // certificados e avaliacoes: so pra equipe (o professor nao ve nenhum dos dois)
      ...(professor || !feedbacks
        ? {}
        : { certificadosLiberados, mediaFeedback: feedbacks._avg.nota, totalFeedbacks: feedbacks._count._all }),
      aprovadosQuestionario: totalAprovados,
      reprovadosQuestionario: totalReprovados,
      podemResponderQuestionario: totalPodemResponder,
      // null enquanto ninguem concluiu o questionario (nem aprovado nem com as 2 tentativas usadas)
      taxaAprovacao: concluiramQuestionario > 0 ? (totalAprovados / concluiramQuestionario) * 100 : null,
      ocupacaoMediaSalas,
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
      aguardando: e.aguardando,
      // entre os presentes: aprovados + reprovados + podemResponder = presentes
      aprovados: e.aprovados,
      reprovados: e.reprovados,
      podemResponder: e.podemResponder,
    })),
  };
}

export const dashboardService = { resumo };
