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

interface DadosCancelamentoInscricao {
  participanteNome: string;
  eventoTitulo: string;
  eventoHorario: Date;
}

// aviso pro aluno quando a EQUIPE cancela a inscricao dele (quando o proprio aluno cancela, ele ja sabe)
async function enviarCancelamentoInscricao(destinatario: string, dados: DadosCancelamentoInscricao): Promise<ResultadoEnvio> {
  const dataFormatada = dados.eventoHorario.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const assunto = `Inscrição cancelada — ${dados.eventoTitulo}`;
  const html = `
    <p>Olá, ${dados.participanteNome}!</p>
    <p>Sua inscrição em <strong>${dados.eventoTitulo}</strong> (${dataFormatada}) foi cancelada pela secretaria.</p>
    <p>Se ainda houver vagas, você pode se inscrever de novo pelo sistema. Em caso de dúvida, procure a secretaria.</p>
  `;
  return enviar("cancelamento-inscricao", destinatario, assunto, html);
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

// monta e envia o email com o codigo que confirma o e-mail institucional no cadastro (a conta so e
// criada depois que o aluno digita este codigo)
async function enviarCodigoCadastro(destinatario: string, codigo: string): Promise<ResultadoEnvio> {
  const assunto = "Código de confirmação do cadastro";
  const html = `
    <p>Use o código abaixo para confirmar seu e-mail e concluir o cadastro no Sistema de Gestão de Eventos Acadêmicos:</p>
    <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${codigo}</p>
    <p>Esse código vale por 15 minutos.</p>
    <p>Se você não pediu este cadastro, ignore este e-mail: nenhuma conta será criada.</p>
  `;
  return enviar("confirmacao-cadastro", destinatario, assunto, html);
}

export const emailService = {
  enviarConfirmacaoInscricao,
  enviarCancelamentoInscricao,
  enviarCodigoRecuperacao,
  enviarCodigoCadastro,
};
