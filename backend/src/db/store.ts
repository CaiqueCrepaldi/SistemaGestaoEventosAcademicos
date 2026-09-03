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
import type { Evento, Feedback, Inscricao, Palestrante, Participante, RecuperacaoSenha, Sala, Usuario } from "../types/domain";

// Um repositório em memória por entidade — é isso que cada service em
// src/modules/*/*.service.ts importa e usa. Ver repositorio.ts pro porquê
// disso existir (banco de verdade administrado à parte, fora deste projeto).
export const usuariosStore = criarRepositorio<Usuario>(usuariosSeed);
export const participantesStore = criarRepositorio<Participante>(participantesSeed);
export const salasStore = criarRepositorio<Sala>(salasSeed);
export const palestrantesStore = criarRepositorio<Palestrante>(palestrantesSeed);
export const eventosStore = criarRepositorio<Evento>(eventosSeed);
export const inscricoesStore = criarRepositorio<Inscricao>(inscricoesSeed);
export const feedbacksStore = criarRepositorio<Feedback>(feedbacksSeed);
export const recuperacoesStore = criarRepositorio<RecuperacaoSenha>([]);
