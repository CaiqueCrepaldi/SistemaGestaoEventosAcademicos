import type { Evento, PassoAprovacao, Palestrante } from "../types";
import { api } from "./api";

// aprovacao de eventos e palestrantes criados por professor
export type TipoAprovacao = "EVENTO" | "PALESTRANTE";
// "item": o evento/palestrante que aguarda aprovacao; "proposta": a proposta de alteracao de um item ja aprovado
export type AlvoAprovacao = "item" | "proposta";

const RECURSO: Record<TipoAprovacao, string> = { EVENTO: "eventos", PALESTRANTE: "palestrantes" };

function caminho(tipo: TipoAprovacao, id: string, alvo: AlvoAprovacao, acao: string) {
  return `/${RECURSO[tipo]}/${id}${alvo === "proposta" ? "/proposta" : ""}/${acao}`;
}

// contadores do menu: a equipe recebe os pendentes; o professor, os recusados dele (propostas incluidas)
export interface ContadoresAprovacao {
  eventosPendentes?: number;
  palestrantesPendentes?: number;
  eventosRecusados?: number;
  palestrantesRecusados?: number;
  // so o professor: um id por recusa em aberto, pro aviso saber se chegou recusa nova depois de fechado
  recusas?: string[];
}

// avisa o menu (Layout) que algo mudou e os contadores precisam ser recarregados
export const APROVACOES_ALTERADAS_EVENT = "sgea:aprovacoes-alteradas";

export function avisarAprovacoesAlteradas() {
  window.dispatchEvent(new Event(APROVACOES_ALTERADAS_EVENT));
}

// valores da proposta de alteracao do evento (campo que nao vier fica como estava na proposta)
export interface DadosPropostaEvento {
  salaId?: string;
  horario?: string;
  cargaHoraria?: number;
  palestranteId?: string;
  resposta?: string;
}

export interface DadosPropostaPalestrante {
  nome?: string;
  email?: string;
  resposta?: string;
}

export const aprovacaoService = {
  contadores: () => api.get<ContadoresAprovacao>("/aprovacoes/contadores"),
  historico: (tipo: TipoAprovacao, id: string) => api.get<PassoAprovacao[]>(`/${RECURSO[tipo]}/${id}/historico`),
  aprovar: (tipo: TipoAprovacao, id: string, alvo: AlvoAprovacao = "item") => api.post<Evento | Palestrante>(caminho(tipo, id, alvo, "aprovar")),
  recusar: (tipo: TipoAprovacao, id: string, motivo: string, alvo: AlvoAprovacao = "item") =>
    api.post<unknown>(caminho(tipo, id, alvo, "recusar"), { motivo }),
  reenviar: (tipo: TipoAprovacao, id: string, resposta?: string) =>
    api.post<unknown>(`/${RECURSO[tipo]}/${id}/reenviar`, resposta?.trim() ? { resposta: resposta.trim() } : {}),
  // o professor corrige a proposta pendente ou reenvia a recusada (com resposta opcional)
  editarPropostaEvento: (id: string, dados: DadosPropostaEvento) => api.put<Evento>(`/eventos/${id}/proposta`, dados),
  editarPropostaPalestrante: (id: string, dados: DadosPropostaPalestrante) => api.put<Palestrante>(`/palestrantes/${id}/proposta`, dados),
  cancelarProposta: (tipo: TipoAprovacao, id: string) => api.del<unknown>(`/${RECURSO[tipo]}/${id}/proposta`),
};
