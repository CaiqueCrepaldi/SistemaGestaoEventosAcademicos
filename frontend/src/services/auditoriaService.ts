import { api } from "./api";

export interface LogAuditoria {
  id: string;
  acao: string;
  detalhe: string | null;
  criadoEm: string;
  atorNome: string | null;
}

// so admin/secretaria acessam, ver backend/src/modules/auditoria/auditoria.routes.ts
export const auditoriaService = {
  listar(): Promise<LogAuditoria[]> {
    return api.get<LogAuditoria[]>("/logs-auditoria");
  },
};
