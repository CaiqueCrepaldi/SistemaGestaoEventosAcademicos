import { eventoService, feedbackService, salaService } from "./entityServices";

// os numeros do Dashboard vem prontos do backend (dashboardService), nao sao mais calculados aqui

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

// todos os eventos com nome da sala e contagem de inscritos, pra tela de Agenda. A contagem vem
// pronta da API (campo "inscritos"): o aluno so enxerga as proprias inscricoes, entao contar no
// navegador mostraria pra ele so 0 ou 1
async function agendaGeral(): Promise<EventoAgenda[]> {
  const [eventos, salas] = await Promise.all([eventoService.list(), salaService.list()]);

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
        inscritos: evento.inscritos ?? 0,
        capacidade: sala?.capacidade ?? 0,
      };
    })
    .sort((a, b) => a.horario.localeCompare(b.horario));
}

// media das notas de feedback de um evento, null se ainda nao tem nenhuma
async function mediaFeedbackPorEvento(eventoId: string): Promise<number | null> {
  const feedbacks = (await feedbackService.list()).filter((f) => f.eventoId === eventoId);
  if (feedbacks.length === 0) return null;
  return feedbacks.reduce((acc, f) => acc + f.nota, 0) / feedbacks.length;
}

export const relatorioService = {
  agendaGeral,
  mediaFeedbackPorEvento,
};
