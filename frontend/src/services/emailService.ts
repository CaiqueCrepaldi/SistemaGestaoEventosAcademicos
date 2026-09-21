import type { Inscricao } from "../types";
import { api } from "./api";

export interface ConfirmacaoEmailResult {
  destinatario: string;
}

interface EmailService {
  enviarConfirmacaoInscricao(inscricao: Inscricao): Promise<ConfirmacaoEmailResult>;
}

export const emailService: EmailService = {
  enviarConfirmacaoInscricao(inscricao) {
    return api.post<ConfirmacaoEmailResult>(`/inscricoes/${inscricao.id}/confirmacao-email`, {});
  },
};
