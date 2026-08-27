import { USE_MOCK } from "./api";
import { delay } from "./storage";

const EMAILS_LOG_KEY = "sgea:emails-enviados";

export interface ConfirmacaoInscricaoInput {
  destinatario: string;
  eventoNome: string;
  sessaoTitulo: string;
}

interface EmailService {
  enviarConfirmacaoInscricao(dados: ConfirmacaoInscricaoInput): Promise<void>;
}

const localEmailService: EmailService = {
  async enviarConfirmacaoInscricao(dados) {
    const registro = { ...dados, enviadoEm: new Date().toISOString() };
    const log = JSON.parse(localStorage.getItem(EMAILS_LOG_KEY) ?? "[]") as unknown[];
    localStorage.setItem(EMAILS_LOG_KEY, JSON.stringify([...log, registro]));
    console.info(`[mock] e-mail de confirmação enviado para ${dados.destinatario}`, registro);
    return delay(undefined, 200);
  },
};

// backend já dispara o e-mail junto com o POST de inscrição, então aqui não tem o que fazer
const httpEmailService: EmailService = {
  async enviarConfirmacaoInscricao() {
    return undefined;
  },
};

export const emailService: EmailService = USE_MOCK ? localEmailService : httpEmailService;
