import type { PassoAprovacao } from "../types";
import { api } from "./api";

// aprovacao de eventos e palestrantes criados por professor
export type TipoAprovacao = "EVENTO" | "PALESTRANTE";

const RECURSO: Record<TipoAprovacao, string> = { EVENTO: "eventos", PALESTRANTE: "palestrantes" };

// contadores do menu: a equipe recebe os pendentes; o professor, os recusados dele
export interface ContadoresAprovacao {
  eventosPendentes?: number;
  palestrantesPendentes?: number;
  eventosRecusados?: number;
  palestrantesRecusados?: number;
}

// avisa o menu (Layout) que algo mudou e os contadores precisam ser recarregados
export const APROVACOES_ALTERADAS_EVENT = "sgea:aprovacoes-alteradas";

export function avisarAprovacoesAlteradas() {
  window.dispatchEvent(new Event(APROVACOES_ALTERADAS_EVENT));
}

export const aprovacaoService = {
  contadores: () => api.get<ContadoresAprovacao>("/aprovacoes/contadores"),
  historico: (tipo: TipoAprovacao, id: string) => api.get<PassoAprovacao[]>(`/${RECURSO[tipo]}/${id}/historico`),
  aprovar: (tipo: TipoAprovacao, id: string) => api.post<unknown>(`/${RECURSO[tipo]}/${id}/aprovar`),
  recusar: (tipo: TipoAprovacao, id: string, motivo: string) => api.post<unknown>(`/${RECURSO[tipo]}/${id}/recusar`, { motivo }),
  reenviar: (tipo: TipoAprovacao, id: string, resposta?: string) =>
    api.post<unknown>(`/${RECURSO[tipo]}/${id}/reenviar`, resposta?.trim() ? { resposta: resposta.trim() } : {}),
};
