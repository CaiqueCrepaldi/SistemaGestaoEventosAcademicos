import { api } from "./api";

// acoes sobre a CONTA de acesso, so ADMINISTRADOR (o backend recusa os outros perfis com 403).
// A tela Participantes chama com o usuarioId do aluno; a listagem de contas (antiga tela Usuarios) saiu
export const usuarioService = {
  resetarMfa: (usuarioId: string) => api.del<void>(`/usuarios/${usuarioId}/2fa`),
  removerBloqueio: (usuarioId: string) => api.del<void>(`/usuarios/${usuarioId}/bloqueio`),
};
