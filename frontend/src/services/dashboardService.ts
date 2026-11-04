import { api } from "./api";

// resposta de GET /api/dashboard (so equipe): numeros agregados, sem nenhum dado pessoal
export interface TotaisDashboard {
  eventos: number;
  eventosFuturos: number;
  inscricoes: number;
  presentes: number;
  ausentes: number;
  pendentes: number;
  // presentes / (presentes + ausentes), em %; null enquanto nenhum check-in foi registrado
  taxaPresenca: number | null;
  certificadosLiberados: number;
  // media, entre os eventos, de inscritos / capacidade da sala, em %; null sem nenhum evento
  ocupacaoMediaSalas: number | null;
  // 1 a 5; null sem nenhum feedback
  mediaFeedback: number | null;
  totalFeedbacks: number;
}

export interface ProximoEventoDashboard {
  id: string;
  titulo: string;
  horario: string;
  salaNome: string;
  capacidade: number;
  inscritos: number;
}

export interface PresencaPorEvento {
  id: string;
  titulo: string;
  horario: string;
  inscritos: number;
  presentes: number;
  ausentes: number;
  pendentes: number;
}

export interface ResumoDashboard {
  totais: TotaisDashboard;
  proximosEventos: ProximoEventoDashboard[];
  eventos: PresencaPorEvento[];
}

export const dashboardService = {
  resumo: () => api.get<ResumoDashboard>("/dashboard"),
};
