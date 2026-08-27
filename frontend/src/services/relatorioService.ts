import {
  eventoService,
  feedbackService,
  inscricaoService,
  salaService,
  sessaoService,
} from "./entityServices";

export interface EstatisticasGerais {
  totalEventos: number;
  totalInscricoes: number;
  totalPresentes: number;
  taxaPresenca: number;
  ocupacaoMedia: number;
}

async function estatisticasGerais(): Promise<EstatisticasGerais> {
  const [eventos, inscricoes, sessoes, salas] = await Promise.all([
    eventoService.list(),
    inscricaoService.list(),
    sessaoService.list(),
    salaService.list(),
  ]);

  const totalPresentes = inscricoes.filter((i) => i.statusPresenca === "PRESENTE").length;
  const taxaPresenca = inscricoes.length > 0 ? (totalPresentes / inscricoes.length) * 100 : 0;

  const ocupacoes = sessoes.map((sessao) => {
    const sala = salas.find((s) => s.id === sessao.salaId);
    const inscritosNaSessao = inscricoes.filter((i) => i.sessaoId === sessao.id).length;
    if (!sala || sala.capacidade === 0) return 0;
    return Math.min(inscritosNaSessao / sala.capacidade, 1) * 100;
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

export interface SessaoAgenda {
  id: string;
  titulo: string;
  tema: string;
  horario: string;
  salaId: string;
  salaNome: string;
  eventoNome: string;
  inscritos: number;
  capacidade: number;
}

async function agendaPorEvento(eventoId: string): Promise<SessaoAgenda[]> {
  const [sessoes, salas, eventos, inscricoes] = await Promise.all([
    sessaoService.list(),
    salaService.list(),
    eventoService.list(),
    inscricaoService.list(),
  ]);

  return sessoes
    .filter((s) => !eventoId || s.eventoId === eventoId)
    .map((sessao) => {
      const sala = salas.find((s) => s.id === sessao.salaId);
      const evento = eventos.find((e) => e.id === sessao.eventoId);
      return {
        id: sessao.id,
        titulo: sessao.titulo,
        tema: sessao.tema ?? "",
        horario: sessao.horario,
        salaId: sessao.salaId,
        salaNome: sala?.nome ?? "—",
        eventoNome: evento?.nome ?? "—",
        inscritos: inscricoes.filter((i) => i.sessaoId === sessao.id).length,
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
  agendaPorEvento,
  mediaFeedbackPorEvento,
};
