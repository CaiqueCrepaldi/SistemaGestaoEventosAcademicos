import type { Evento, SituacaoAprovacao } from "../types";
import { api } from "./api";

// o que o professor recebe de um evento que nao e dele (de outro professor ou da equipe): so a sala e o
// horario, pra saber que ela esta ocupada. A API nunca manda titulo, palestrante nem inscritos desses
export interface SalaOcupada {
  salaId: string;
  salaNome: string;
  inicio: string;
  fim: string;
}

export interface MesDoCalendario {
  eventos: Evento[];
  salasOcupadas: SalaOcupada[];
}

export interface ResultadoBuscaEventos {
  itens: Evento[];
  limite: number;
  // ficou evento de fora do limite: a tela pede pra refinar a busca
  temMais: boolean;
}

// tela Eventos da equipe e do professor (calendario do mes): toda regra fica na API
export const calendarioService = {
  // eventos que comecam em [de, ate): o mes na tela com as semanas de borda
  intervalo(de: Date, ate: Date): Promise<MesDoCalendario> {
    const params = new URLSearchParams({ de: de.toISOString(), ate: ate.toISOString() });
    return api.get<MesDoCalendario>(`/eventos?${params.toString()}`);
  },

  // busca por titulo, tema, palestrante ou sala e/ou filtro de situacao, de qualquer mes, com limite
  buscar(filtros: { q?: string; situacao?: SituacaoAprovacao | ""; limite?: number }): Promise<ResultadoBuscaEventos> {
    const params = new URLSearchParams();
    if (filtros.q?.trim()) params.set("q", filtros.q.trim());
    if (filtros.situacao) params.set("situacao", filtros.situacao);
    if (filtros.limite) params.set("limite", String(filtros.limite));
    return api.get<ResultadoBuscaEventos>(`/eventos/busca?${params.toString()}`);
  },
};
