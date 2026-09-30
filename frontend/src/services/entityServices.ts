import type { Evento, Feedback, Inscricao, Palestrante, Participante, Sala } from "../types";
import { api } from "./api";
import { createCrudService } from "./crud";

// um servico CRUD pronto por entidade, importado direto nas paginas
export const eventoService = createCrudService<Evento>("eventos");
export const salaService = createCrudService<Sala>("salas");
export const palestranteService = createCrudService<Palestrante>("palestrantes");
export const participanteService = createCrudService<Participante>("participantes");
export const inscricaoService = createCrudService<Inscricao>("inscricoes");

// evento que o aluno logado pode avaliar agora (recebeu o certificado e ainda nao mandou feedback)
export interface EventoParaAvaliar {
  id: string;
  titulo: string;
  horario: string;
}

export const feedbackService = {
  ...createCrudService<Feedback>("feedbacks"),

  // so ALUNO; a regra (certificado + um feedback por evento) mora no backend
  eventosParaAvaliar(): Promise<EventoParaAvaliar[]> {
    return api.get<EventoParaAvaliar[]>("/feedbacks/elegiveis");
  },

  // so o aluno envia, em nome dele mesmo: o backend usa sempre o participanteId do token
  avaliar(dados: { eventoId: string; nota: number; comentario: string }): Promise<Feedback> {
    return api.post<Feedback>("/feedbacks", dados);
  },

  // o aluno exclui o proprio feedback (e depois pode mandar outro pro mesmo evento)
  excluirMeu(id: string): Promise<void> {
    return api.del<void>(`/feedbacks/${id}`);
  },

  // a equipe so exclui feedback de aluno informando o motivo (lista fechada, ver MOTIVOS_EXCLUSAO_FEEDBACK)
  excluirPelaEquipe(id: string, motivo: MotivoExclusaoFeedback): Promise<void> {
    return api.del<void>(`/feedbacks/${id}`, { motivo });
  },
};

// mesma lista do backend (feedbacks.schemas.ts): texto livre no log de auditoria poderia ter dado pessoal
export const MOTIVOS_EXCLUSAO_FEEDBACK = {
  CONTEUDO_OFENSIVO: "Conteúdo ofensivo ou desrespeitoso",
  DADO_PESSOAL_EXPOSTO: "Expõe dado pessoal de alguém",
  FORA_DO_TEMA: "Fora do tema ou spam",
  PEDIDO_DO_ALUNO: "A pedido do próprio aluno",
} as const;
export type MotivoExclusaoFeedback = keyof typeof MOTIVOS_EXCLUSAO_FEEDBACK;
