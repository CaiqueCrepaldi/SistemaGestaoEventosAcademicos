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

// Chamado logo depois que a inscrição é criada (ver inscricaoAlunoService.ts
// e EventosPage.tsx). No mock não existe servidor de e-mail de verdade —
// só busca o e-mail do participante e escreve no console, pra simular o envio.
const localEmailService: EmailService = {
  async enviarConfirmacaoInscricao(inscricao) {
    const participante = await participanteService.get(inscricao.participanteId);
    const destinatario = participante?.email ?? "e-mail não encontrado";
    console.info(`[mock] e-mail de confirmação da inscrição ${inscricao.id} enviado para ${destinatario}`);
    await delay(undefined, 200);
    return { destinatario };
  },
};

// No backend real, quem resolve o e-mail do participante e manda a
// mensagem (via JavaMailSender) é o servidor — o frontend só avisa qual
// inscrição confirmar.
const httpEmailService: EmailService = {
  enviarConfirmacaoInscricao(inscricao) {
    return api.post<ConfirmacaoEmailResult>(`/inscricoes/${inscricao.id}/confirmacao-email`, {});
  },
};

export const emailService: EmailService = USE_MOCK ? localEmailService : httpEmailService;
