import type { Inscricao } from "../types";
import { USE_MOCK, api } from "./api";
import { participanteService } from "./entityServices";
import { delay } from "./storage";

export interface ConfirmacaoEmailResult {
  destinatario: string;
}

interface EmailService {
  enviarConfirmacaoInscricao(inscricao: Inscricao): Promise<ConfirmacaoEmailResult>;
}

// no mock nao tem servidor de email de verdade, aviso pro usuario fica por conta de quem chama (EventosPage.tsx)
const localEmailService: EmailService = {
  async enviarConfirmacaoInscricao(inscricao) {
    const participante = await participanteService.get(inscricao.participanteId);
    const destinatario = participante?.email ?? "e-mail não encontrado";
    await delay(undefined, 200);
    return { destinatario };
  },
};

const httpEmailService: EmailService = {
  enviarConfirmacaoInscricao(inscricao) {
    return api.post<ConfirmacaoEmailResult>(`/inscricoes/${inscricao.id}/confirmacao-email`, {});
  },
};

export const emailService: EmailService = USE_MOCK ? localEmailService : httpEmailService;
