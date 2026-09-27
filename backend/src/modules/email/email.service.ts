import sgMail from "@sendgrid/mail";
import { env } from "../../config/env";

// sem SENDGRID_API_KEY/EMAIL_FROM configurados (padrao em dev local) cai no fallback de so logar no console
const sendgridPronto = Boolean(env.sendgrid.apiKey && env.sendgrid.from);
if (env.sendgrid.apiKey) sgMail.setApiKey(env.sendgrid.apiKey);

// "simulado" = SendGrid nao configurado, o e-mail so foi logado no console (quem audita precisa saber a diferenca)
export type ResultadoEnvio = "enviado" | "simulado";

// manda o email de verdade ou so loga, dependendo se o SendGrid ta configurado.
// "tipo" eh so um rotulo curto pro log (ex.: "recuperacao-senha") — o log NUNCA
// pode ter destinatario, assunto ou corpo, porque o corpo pode carregar codigo/token
// (achado da adequacao LGPD: o codigo de recuperacao nao pode aparecer em log de servidor)
async function enviar(tipo: string, destinatario: string, assunto: string, html: string): Promise<ResultadoEnvio> {
  if (!sendgridPronto) {
    console.info(`[e-mail simulado] tipo=${tipo} (SendGrid nao configurado; destinatario e conteudo omitidos do log de proposito)`);
    return "simulado";
  }
  try {
    await sgMail.send({ from: env.sendgrid.from!, to: destinatario, subject: assunto, html });
    return "enviado";
  } catch (erro) {
    // nunca logar o objeto de erro cru do SendGrid: o SDK costuma ecoar o corpo da
    // requisicao (destinatario, as vezes o html) dentro do proprio erro
    const mensagem = erro instanceof Error ? erro.message : "erro desconhecido";
    console.error(`[email] falha ao enviar via SendGrid (tipo=${tipo}):`, mensagem);
    throw new Error(`Falha ao enviar e-mail via SendGrid: ${mensagem}`);
  }
}

interface DadosConfirmacaoInscricao {
  participanteNome: string;
  eventoTitulo: string;
  eventoTema: string;
  palestranteNome: string;
  eventoHorario: Date;
}

// monta e envia o email de confirmacao depois que a inscricao eh criada
async function enviarConfirmacaoInscricao(destinatario: string, dados: DadosConfirmacaoInscricao): Promise<ResultadoEnvio> {
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
  return enviar("confirmacao-inscricao", destinatario, assunto, html);
}

// monta e envia o email com o codigo de recuperacao de senha
async function enviarCodigoRecuperacao(destinatario: string, codigo: string): Promise<ResultadoEnvio> {
  const assunto = "Código de recuperação de senha";
  const html = `
    <p>Use o código abaixo pra redefinir sua senha:</p>
    <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${codigo}</p>
    <p>Esse código expira em 15 minutos. Se você não pediu essa recuperação, ignore este e-mail.</p>
  `;
  return enviar("recuperacao-senha", destinatario, assunto, html);
}

export const emailService = {
  enviarConfirmacaoInscricao,
  enviarCodigoRecuperacao,
};
