import { api } from "./api";

// contas de professor (tela Professores, so administrador e secretaria)
export type SituacaoProfessor = "AGUARDANDO_PRIMEIRO_ACESSO" | "ATIVO";

export interface Professor {
  id: string;
  nome: string;
  email: string;
  situacao: SituacaoProfessor;
  criadoEm: string;
}

// resposta de criar/reenviar: se o e-mail com o codigo saiu e, so fora de producao, o proprio codigo
export interface EnvioCodigoProfessor {
  emailEnviado: boolean;
  codigoDemo?: string;
}

export const professorService = {
  listar: () => api.get<Professor[]>("/professores"),
  criar: (dados: { nomeCompleto: string; email: string }) =>
    api.post<EnvioCodigoProfessor & { professor: Professor }>("/professores", dados),
  reenviarCodigo: (id: string) => api.post<EnvioCodigoProfessor>(`/professores/${id}/reenviar-codigo`),
};
