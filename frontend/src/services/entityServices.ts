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

  // aluno nao manda participanteId: o backend usa sempre o do token
  avaliar(dados: { eventoId: string; nota: number; comentario: string }): Promise<Feedback> {
    return api.post<Feedback>("/feedbacks", dados);
  },
};
