import type { Perfil } from "../types";
import { api } from "./api";

// linha da tela de usuarios (so ADMINISTRADOR)
export interface UsuarioResumo {
  id: string;
  nome: string;
  emailLogin: string;
  perfil: Perfil;
  mfaAtivo: boolean;
  bloqueado: boolean;
  // aluno inativado pela equipe (conta de equipe nunca e inativada)
  inativo: boolean;
}

export const usuarioService = {
  listar: () => api.get<UsuarioResumo[]>("/usuarios"),
  resetarMfa: (id: string) => api.del<void>(`/usuarios/${id}/2fa`),
  removerBloqueio: (id: string) => api.del<void>(`/usuarios/${id}/bloqueio`),
};
