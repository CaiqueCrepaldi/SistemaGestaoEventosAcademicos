import { prisma } from "../db/prisma";

// RF021: ocupacao REAL das salas — quem de fato esteve no evento (check-in PRESENTE) dividido pela
// capacidade da sala, em %. Regra unica, usada pelo Dashboard e pela listagem de salas:
// - so eventos ENCERRADOS (horario + carga horaria ja passou): evento futuro ou em andamento ainda nao
//   teve o check-in completo e puxaria a media pra baixo;
// - sala com capacidade 0 fica fora da media;
// - media simples entre os eventos (cada evento pesa igual); null sem nenhum evento que entre na conta.
// So numeros: nenhum dado de aluno entra ou sai daqui

export interface EventoParaOcupacao {
  horario: Date;
  // em horas, como no cadastro do evento
  cargaHoraria: number;
  capacidade: number;
  presentes: number;
}

export interface ResumoOcupacao {
  // eventos encerrados considerados (inclusive os de sala com capacidade 0, que ficam fora da media)
  eventosRealizados: number;
  // media de presentes / capacidade entre os eventos encerrados, em %; null se nenhum entrou na conta
  ocupacaoMedia: number | null;
}

export function eventoEncerrado(evento: { horario: Date; cargaHoraria: number }, agora: Date): boolean {
  return evento.horario.getTime() + evento.cargaHoraria * 3600 * 1000 <= agora.getTime();
}

// a formula, num lugar so
export function resumoDeOcupacao(eventos: EventoParaOcupacao[], agora: Date): ResumoOcupacao {
  const encerrados = eventos.filter((evento) => eventoEncerrado(evento, agora));
  const comCapacidade = encerrados.filter((evento) => evento.capacidade > 0);
  const ocupacaoMedia =
    comCapacidade.length > 0
      ? comCapacidade.reduce((soma, evento) => soma + (evento.presentes / evento.capacidade) * 100, 0) / comCapacidade.length
      : null;
  return { eventosRealizados: encerrados.length, ocupacaoMedia };
}

// ocupacao de cada sala (listagem da equipe), com 2 consultas no total: os eventos que ja comecaram
// e a contagem de PRESENTE agrupada por evento no banco — nunca uma consulta por sala ou por evento
export async function ocupacaoPorSala(agora = new Date()): Promise<Map<string, ResumoOcupacao>> {
  const eventos = await prisma.evento.findMany({
    where: { horario: { lte: agora } },
    select: { id: true, horario: true, cargaHoraria: true, salaId: true, sala: { select: { capacidade: true } } },
  });
  const encerrados = eventos.filter((evento) => eventoEncerrado(evento, agora));
  const presentes =
    encerrados.length > 0
      ? await prisma.inscricao.groupBy({
          by: ["eventoId"],
          where: { statusPresenca: "PRESENTE", eventoId: { in: encerrados.map((evento) => evento.id) } },
          _count: { _all: true },
        })
      : [];
  const presentesPorEvento = new Map(presentes.map((linha) => [linha.eventoId, linha._count._all]));

  const eventosPorSala = new Map<string, EventoParaOcupacao[]>();
  for (const evento of encerrados) {
    const lista = eventosPorSala.get(evento.salaId) ?? [];
    lista.push({
      horario: evento.horario,
      cargaHoraria: evento.cargaHoraria,
      capacidade: evento.sala.capacidade,
      presentes: presentesPorEvento.get(evento.id) ?? 0,
    });
    eventosPorSala.set(evento.salaId, lista);
  }

  return new Map([...eventosPorSala].map(([salaId, lista]) => [salaId, resumoDeOcupacao(lista, agora)]));
}
