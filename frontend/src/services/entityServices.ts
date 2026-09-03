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

// "eventos", "inscricoes" e "feedbacks" ganharam storageKey com sufixo "-v2":
// o formato salvo em localStorage mudou de forma incompatível com a versão anterior
// (fusão de Evento+Sessão e renomeação de sessaoId para eventoId), então usamos uma
// chave nova para não misturar dados antigos, no formato velho, com o seed atual.
export const eventoService = createCrudService<Evento>("eventos", eventosSeed, "eventos-v2");
export const salaService = createCrudService<Sala>("salas", salasSeed);
export const palestranteService = createCrudService<Palestrante>("palestrantes", palestrantesSeed);
export const participanteService = createCrudService<Participante>("participantes", participantesSeed);
export const inscricaoService = createCrudService<Inscricao>("inscricoes", inscricoesSeed, "inscricoes-v2");
export const feedbackService = createCrudService<Feedback>("feedbacks", feedbacksSeed, "feedbacks-v2");
