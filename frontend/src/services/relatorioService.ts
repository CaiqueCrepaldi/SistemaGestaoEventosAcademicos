import { eventoService, feedbackService, inscricaoService, salaService } from "./entityServices";

export interface EstatisticasGerais {
  totalEventos: number;
  totalInscricoes: number;
  totalPresentes: number;
  taxaPresenca: number;
  ocupacaoMedia: number;
}

async function estatisticasGerais(): Promise<EstatisticasGerais> {
  const [eventos, inscricoes, salas] = await Promise.all([
    eventoService.list(),
    inscricaoService.list(),
    salaService.list(),
  ]);

  const totalPresentes = inscricoes.filter((i) => i.statusPresenca === "PRESENTE").length;
  const taxaPresenca = inscricoes.length > 0 ? (totalPresentes / inscricoes.length) * 100 : 0;

  const ocupacoes = eventos.map((evento) => {
    const sala = salas.find((s) => s.id === evento.salaId);
    const inscritosNoEvento = inscricoes.filter((i) => i.eventoId === evento.id).length;
    if (!sala || sala.capacidade === 0) return 0;
    return Math.min(inscritosNoEvento / sala.capacidade, 1) * 100;
  });
  const ocupacaoMedia = ocupacoes.length > 0 ? ocupacoes.reduce((a, b) => a + b, 0) / ocupacoes.length : 0;

  return {
    totalEventos: eventos.length,
    totalInscricoes: inscricoes.length,
    totalPresentes,
    taxaPresenca,
    ocupacaoMedia,
  };
}

export interface EventoAgenda {
  id: string;
  titulo: string;
  tema: string;
  horario: string;
  salaId: string;
  salaNome: string;
  inscritos: number;
  capacidade: number;
}

async function agendaGeral(): Promise<EventoAgenda[]> {
  const [eventos, salas, inscricoes] = await Promise.all([
    eventoService.list(),
    salaService.list(),
    inscricaoService.list(),
  ]);

  return eventos
    .map((evento) => {
      const sala = salas.find((s) => s.id === evento.salaId);
      return {
        id: evento.id,
        titulo: evento.titulo,
        tema: evento.tema ?? "",
        horario: evento.horario,
        salaId: evento.salaId,
        salaNome: sala?.nome ?? "—",
        inscritos: inscricoes.filter((i) => i.eventoId === evento.id).length,
        capacidade: sala?.capacidade ?? 0,
      };
    })
    .sort((a, b) => a.horario.localeCompare(b.horario));
}

async function mediaFeedbackPorEvento(eventoId: string): Promise<number | null> {
  const feedbacks = (await feedbackService.list()).filter((f) => f.eventoId === eventoId);
  if (feedbacks.length === 0) return null;
  return feedbacks.reduce((acc, f) => acc + f.nota, 0) / feedbacks.length;
}

export const relatorioService = {
  estatisticasGerais,
  agendaGeral,
  mediaFeedbackPorEvento,
};
