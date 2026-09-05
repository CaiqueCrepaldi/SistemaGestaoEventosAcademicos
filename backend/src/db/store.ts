import { criarRepositorio } from "./repositorio";
import {
  eventosSeed,
  feedbacksSeed,
  inscricoesSeed,
  palestrantesSeed,
  participantesSeed,
  salasSeed,
  usuariosSeed,
} from "./seedData";
import type {
  Evento,
  Feedback,
  Inscricao,
  Palestrante,
  Participante,
  RecuperacaoSenha,
  Sala,
  TentativaQuestionario,
  Usuario,
} from "../types/domain";

// um repositorio por entidade, cada service usa o dele
export const usuariosStore = criarRepositorio<Usuario>(usuariosSeed);
export const participantesStore = criarRepositorio<Participante>(participantesSeed);
export const salasStore = criarRepositorio<Sala>(salasSeed);
export const palestrantesStore = criarRepositorio<Palestrante>(palestrantesSeed);
export const eventosStore = criarRepositorio<Evento>(eventosSeed);
export const inscricoesStore = criarRepositorio<Inscricao>(inscricoesSeed);
export const feedbacksStore = criarRepositorio<Feedback>(feedbacksSeed);
export const recuperacoesStore = criarRepositorio<RecuperacaoSenha>([]);
export const tentativasStore = criarRepositorio<TentativaQuestionario>([]);
