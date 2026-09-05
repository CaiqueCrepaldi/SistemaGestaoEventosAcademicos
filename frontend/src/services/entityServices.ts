import type { Evento, Feedback, Inscricao, Palestrante, Participante, Sala } from "../types";
import { createCrudService } from "./crud";
import {
  eventosSeed,
  feedbacksSeed,
  inscricoesSeed,
  palestrantesSeed,
  participantesSeed,
  salasSeed,
} from "./seed";

// um servico CRUD pronto por entidade, importado direto nas paginas
// eventos/palestrantes/inscricoes/feedbacks tem storageKey versionada porque
// o formato salvo no localStorage mudou de forma incompativel com versoes antigas
export const eventoService = createCrudService<Evento>("eventos", eventosSeed, "eventos-v3");
export const salaService = createCrudService<Sala>("salas", salasSeed);
export const palestranteService = createCrudService<Palestrante>("palestrantes", palestrantesSeed, "palestrantes-v2");
export const participanteService = createCrudService<Participante>("participantes", participantesSeed);
export const inscricaoService = createCrudService<Inscricao>("inscricoes", inscricoesSeed, "inscricoes-v2");
export const feedbackService = createCrudService<Feedback>("feedbacks", feedbacksSeed, "feedbacks-v2");
