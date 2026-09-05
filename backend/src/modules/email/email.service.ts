import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env";

// sem SMTP_HOST configurado (padrao em dev local) cai no fallback de so logar no console
let transporter: Transporter | null = null;
if (env.smtp.host) {
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
}

async function enviar(destinatario: string, assunto: string, html: string): Promise<void> {
  if (!transporter) {
    console.info(`[e-mail simulado] Para: ${destinatario} | Assunto: ${assunto}\n${html}\n`);
    return;
  }
  await transporter.sendMail({ from: env.smtp.from, to: destinatario, subject: assunto, html });
}

interface DadosConfirmacaoInscricao {
  participanteNome: string;
  eventoTitulo: string;
  eventoTema: string;
  palestranteNome: string;
  eventoHorario: Date;
}

async function enviarConfirmacaoInscricao(destinatario: string, dados: DadosConfirmacaoInscricao): Promise<void> {
  const dataFormatada = dados.eventoHorario.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const assunto = `Inscrição confirmada — ${dados.eventoTitulo}`;
  const html = `
    <p>Olá, ${dados.participanteNome}!</p>
    <p>Sua inscrição em <strong>${dados.eventoTitulo}</strong> foi confirmada.</p>
    <p>
      <strong>Tema:</strong> ${dados.eventoTema}<br>
      <strong>Palestrante:</strong> ${dados.palestranteNome}<br>
      <strong>Data/horário:</strong> ${dataFormatada}
    </p>
    <p>Até lá!</p>
  `;
  await enviar(destinatario, assunto, html);
}

async function enviarCodigoRecuperacao(destinatario: string, codigo: string): Promise<void> {
  const assunto = "Código de recuperação de senha";
  const html = `
    <p>Use o código abaixo pra redefinir sua senha:</p>
    <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${codigo}</p>
    <p>Esse código expira em 15 minutos. Se você não pediu essa recuperação, ignore este e-mail.</p>
  `;
  await enviar(destinatario, assunto, html);
}

export const emailService = {
  enviarConfirmacaoInscricao,
  enviarCodigoRecuperacao,
};
