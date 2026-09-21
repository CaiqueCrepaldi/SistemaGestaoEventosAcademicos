import type { TentativaQuestionario } from "../types";
import { api } from "./api";

// pergunta sem revelar a correta, formato que o aluno recebe pra responder
export interface PerguntaSemGabarito {
  id: string;
  enunciado: string;
  alternativas: { texto: string }[];
}

interface QuestionarioService {
  obterQuestionario(eventoId: string): Promise<PerguntaSemGabarito[]>;
  enviarRespostas(eventoId: string, participanteId: string, respostas: number[]): Promise<TentativaQuestionario>;
  listarTentativas(eventoId: string, participanteId: string): Promise<TentativaQuestionario[]>;
  listarTodasTentativas(): Promise<TentativaQuestionario[]>;
  // backend ja cascade-deleta as tentativas junto com o evento
  removerTentativasDoEvento(eventoId: string): Promise<void>;
}

// perguntas e correcao vivem no backend, servidor nunca manda o gabarito antes do aluno responder
export const questionarioService: QuestionarioService = {
  obterQuestionario(eventoId) {
    return api.get<PerguntaSemGabarito[]>(`/eventos/${eventoId}/questionario`);
  },
  enviarRespostas(eventoId, _participanteId, respostas) {
    return api.post<TentativaQuestionario>(`/eventos/${eventoId}/questionario/respostas`, { respostas });
  },
  listarTentativas(eventoId, _participanteId) {
    return api.get<TentativaQuestionario[]>(`/eventos/${eventoId}/questionario/tentativas`);
  },
  listarTodasTentativas() {
    return api.get<TentativaQuestionario[]>("/questionario-tentativas");
  },
  async removerTentativasDoEvento() {},
};
