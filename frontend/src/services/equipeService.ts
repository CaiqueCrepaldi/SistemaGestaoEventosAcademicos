import type { SituacaoAprovacao } from "../types";
import { api } from "./api";

// contas da equipe na tela Equipe (so administrador e secretaria): professores e secretarias. Contas de
// administrador nao aparecem. A secretaria so gerencia professores; ninguem a propria conta (podeGerenciar)
export type PerfilEquipe = "PROFESSOR" | "SECRETARIA";
export type SituacaoConta = "AGUARDANDO_PRIMEIRO_ACESSO" | "ATIVO" | "INATIVO";

export interface ContaEquipe {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilEquipe;
  situacao: SituacaoConta;
  // so quando inativo (visivel so pra equipe)
  motivoInativacao?: string | null;
  criadoEm: string;
  // false = so leitura pra quem esta vendo (a propria conta, ou secretaria vista pela secretaria)
  podeGerenciar: boolean;
}

// resposta de criar/reenviar: se o e-mail com o convite saiu e, so fora de producao, o proprio link
export interface EnvioConvite {
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

// exclusao: sem historico a conta sai; com historico fica inativa e a resposta traz a mensagem
export type ResultadoExclusao = { excluida: true } | { excluida: false; mensagem: string; conta: ContaEquipe };

export const equipeService = {
  listar: () => api.get<ContaEquipe[]>("/equipe"),
  criar: (dados: { nomeCompleto: string; email: string; perfil: PerfilEquipe }) => api.post<EnvioConvite & { conta: ContaEquipe }>("/equipe", dados),
  reenviarConvite: (id: string) => api.post<EnvioConvite>(`/equipe/${id}/reenviar-convite`),
  eventosEmAberto: (id: string) => api.get<EventoEmAberto[]>(`/equipe/${id}/eventos-em-aberto`),
  // transferirPara: "EQUIPE" ou o id de outro professor ativo (obrigatorio quando o professor tem evento em aberto)
  inativar: (id: string, dados: { motivo: string; transferirPara?: string }) =>
    api.post<{ conta: ContaEquipe; eventosTransferidos: number }>(`/equipe/${id}/inativar`, dados),
  reativar: (id: string) => api.post<ContaEquipe>(`/equipe/${id}/reativar`),
  excluir: (id: string) => api.del<ResultadoExclusao>(`/equipe/${id}`),
};
