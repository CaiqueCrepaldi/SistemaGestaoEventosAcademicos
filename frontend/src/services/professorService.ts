import type { SituacaoAprovacao } from "../types";
import { api } from "./api";

// contas de professor (tela Professores, so administrador e secretaria)
export type SituacaoProfessor = "AGUARDANDO_PRIMEIRO_ACESSO" | "ATIVO" | "INATIVO";

export interface Professor {
  id: string;
  nome: string;
  email: string;
  situacao: SituacaoProfessor;
  // so quando inativo (visivel so pra equipe)
  motivoInativacao?: string | null;
  criadoEm: string;
}

// resposta de criar/reenviar: se o e-mail com o convite saiu e, so fora de producao, o proprio link
export interface EnvioConviteProfessor {
  emailEnviado: boolean;
  linkConviteDemo?: string;
}

// evento do professor que precisa de novo responsavel antes da inativacao (nao encerrado, ou encerrado ha
// menos de 24 horas)
export interface EventoEmAberto {
  id: string;
  titulo: string;
  horario: string;
  situacao: SituacaoAprovacao;
}

export const professorService = {
  listar: () => api.get<Professor[]>("/professores"),
  criar: (dados: { nomeCompleto: string; email: string }) =>
    api.post<EnvioConviteProfessor & { professor: Professor }>("/professores", dados),
  reenviarConvite: (id: string) => api.post<EnvioConviteProfessor>(`/professores/${id}/reenviar-convite`),
  eventosEmAberto: (id: string) => api.get<EventoEmAberto[]>(`/professores/${id}/eventos-em-aberto`),
  // transferirPara: "EQUIPE" ou o id de outro professor ativo (obrigatorio quando ha evento em aberto)
  inativar: (id: string, dados: { motivo: string; transferirPara?: string }) =>
    api.post<{ professor: Professor; eventosTransferidos: number }>(`/professores/${id}/inativar`, dados),
  reativar: (id: string) => api.post<Professor>(`/professores/${id}/reativar`),
};
