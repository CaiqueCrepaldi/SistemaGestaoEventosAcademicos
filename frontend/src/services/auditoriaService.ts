import { api } from "./api";

export interface LogAuditoria {
  id: string;
  acao: string;
  detalhe: string | null;
  criadoEm: string;
  usuarioId: string | null;
  atorNome: string | null;
  // o responsavel existia na epoca do log, mas a conta foi excluida depois (nome vem da copia guardada no log)
  atorRemovido: boolean;
}

export interface PaginaAuditoria {
  itens: LogAuditoria[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ResponsavelAuditoria {
  id: string;
  nome: string;
}

export interface FiltrosAuditoria {
  page: number;
  pageSize: number;
  acao?: string;
  usuarioId?: string;
  // instantes ISO, limites inclusivos
  de?: string;
  ate?: string;
}

// valor do filtro "responsavel" pra pegar so as acoes sem usuario (login falho, recuperacao com e-mail inexistente)
export const SEM_RESPONSAVEL = "sem-responsavel";

// so admin/secretaria acessam, ver backend/src/modules/auditoria/auditoria.routes.ts
export const auditoriaService = {
  listar(filtros: FiltrosAuditoria): Promise<PaginaAuditoria> {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== "") params.set(chave, String(valor));
    });
    return api.get<PaginaAuditoria>(`/logs-auditoria?${params.toString()}`);
  },

  responsaveis(): Promise<ResponsavelAuditoria[]> {
    return api.get<ResponsavelAuditoria[]>("/logs-auditoria/responsaveis");
  },
};
