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

// Um serviço CRUD pronto por entidade — é o que toda página importa pra
// listar/criar/editar/excluir (ex.: eventoService.list(), salaService.create(...)).
//
// "eventos", "palestrantes", "inscricoes" e "feedbacks" ganharam storageKey
// versionado: o formato salvo em localStorage mudou de forma incompatível
// com a versão anterior (eventos: perguntas texto → questionario de múltipla
// escolha + palestrante obrigatório; palestrantes: currículo → e-mail), então
// usamos uma chave nova pra não misturar dados antigos, no formato velho,
// com o seed atual.
export const eventoService = createCrudService<Evento>("eventos", eventosSeed, "eventos-v3");
export const salaService = createCrudService<Sala>("salas", salasSeed);
export const palestranteService = createCrudService<Palestrante>("palestrantes", palestrantesSeed, "palestrantes-v2");
export const participanteService = createCrudService<Participante>("participantes", participantesSeed);
export const inscricaoService = createCrudService<Inscricao>("inscricoes", inscricoesSeed, "inscricoes-v2");
export const feedbackService = createCrudService<Feedback>("feedbacks", feedbacksSeed, "feedbacks-v2");
