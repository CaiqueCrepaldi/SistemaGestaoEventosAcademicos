import type { Inscricao, Pagina, StatusPresenca } from "../types";
import { api } from "./api";

// uma linha da tela Inscricoes da equipe: a inscricao com o aluno e o evento ja juntos pelo backend
export interface InscricaoGestao extends Inscricao {
  dataInscricao: string;
  participanteNome: string;
  participanteRgm: string;
  participanteAtivo: boolean;
  eventoTitulo: string;
  eventoHorario: string;
  // evento cancelado pela equipe: a inscricao fica so como historico, sem acao
  eventoCancelado?: boolean;
}

export interface FiltrosInscricoesGestao {
  eventoId?: string;
  status?: StatusPresenca | "";
  // nome, e-mail ou RGM do aluno
  busca?: string;
  page: number;
}

// lista paginada e filtrada no servidor (GET /inscricoes/gestao): nunca baixa todas as inscricoes
export const inscricaoGestaoService = {
  listar(filtros: FiltrosInscricoesGestao): Promise<Pagina<InscricaoGestao>> {
    const params = new URLSearchParams({ page: String(filtros.page), pageSize: "50" });
    if (filtros.eventoId) params.set("eventoId", filtros.eventoId);
    if (filtros.status) params.set("status", filtros.status);
    if (filtros.busca?.trim()) params.set("busca", filtros.busca.trim());
    return api.get<Pagina<InscricaoGestao>>(`/inscricoes/gestao?${params.toString()}`);
  },
};
