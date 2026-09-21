import type { Evento, Feedback, Inscricao, Palestrante, Participante, Sala } from "../types";
import { createCrudService } from "./crud";

// um servico CRUD pronto por entidade, importado direto nas paginas
export const eventoService = createCrudService<Evento>("eventos");
export const salaService = createCrudService<Sala>("salas");
export const palestranteService = createCrudService<Palestrante>("palestrantes");
export const participanteService = createCrudService<Participante>("participantes");
export const inscricaoService = createCrudService<Inscricao>("inscricoes");
export const feedbackService = createCrudService<Feedback>("feedbacks");
