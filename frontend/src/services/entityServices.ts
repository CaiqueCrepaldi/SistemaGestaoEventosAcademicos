import type { Evento, Feedback, Inscricao, Palestrante, Participante, Sala, Sessao } from "../types";
import { createCrudService } from "./crud";
import {
  eventosSeed,
  feedbacksSeed,
  inscricoesSeed,
  palestrantesSeed,
  participantesSeed,
  salasSeed,
  sessoesSeed,
} from "./seed";

export const eventoService = createCrudService<Evento>("eventos", eventosSeed);
export const salaService = createCrudService<Sala>("salas", salasSeed);
export const palestranteService = createCrudService<Palestrante>("palestrantes", palestrantesSeed);
export const sessaoService = createCrudService<Sessao>("sessoes", sessoesSeed);
export const participanteService = createCrudService<Participante>("participantes", participantesSeed);
export const inscricaoService = createCrudService<Inscricao>("inscricoes", inscricoesSeed);
export const feedbackService = createCrudService<Feedback>("feedbacks", feedbacksSeed);
