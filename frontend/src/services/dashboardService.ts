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
  // resultado do questionario de quem teve a presenca confirmada (indicador de aprendizagem, RF021):
  // aprovado = alguma tentativa com 60% ou mais; reprovado = usou as 2 tentativas abaixo de 60%;
  // podem responder = nenhuma tentativa, ou 1 abaixo de 60%
  aprovadosQuestionario: number;
  reprovadosQuestionario: number;
  podemResponderQuestionario: number;
  // aprovados / (aprovados + reprovados), em %; null enquanto ninguem concluiu o questionario
  taxaAprovacao: number | null;
  // RF021, ocupacao real: media, entre os eventos ENCERRADOS, de presentes / capacidade da sala, em %;
  // null enquanto nenhum evento tiver terminado
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

// cada evento nos graficos "Presenca por evento" e "Aprendizagem por evento"
export interface EventoDashboard {
  id: string;
  titulo: string;
  horario: string;
  inscritos: number;
  presentes: number;
  ausentes: number;
  pendentes: number;
  // entre os presentes: aprovados + reprovados + podemResponder = presentes
  aprovados: number;
  reprovados: number;
  podemResponder: number;
}

export interface ResumoDashboard {
  totais: TotaisDashboard;
  proximosEventos: ProximoEventoDashboard[];
  eventos: EventoDashboard[];
}

export const dashboardService = {
  resumo: () => api.get<ResumoDashboard>("/dashboard"),
};
