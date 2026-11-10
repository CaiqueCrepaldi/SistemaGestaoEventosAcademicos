import sgMail from "@sendgrid/mail";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { normalizarEmail } from "../../utils/validacao";

// sem SENDGRID_API_KEY/EMAIL_FROM configurados (padrao em dev local) cai no fallback de so logar no console
const sendgridPronto = Boolean(env.sendgrid.apiKey && env.sendgrid.from);
if (env.sendgrid.apiKey) sgMail.setApiKey(env.sendgrid.apiKey);

// "simulado" = SendGrid nao configurado, o e-mail so foi logado no console (quem audita precisa saber a diferenca);
// "suprimido" = o destinatario e uma conta ficticia (carga de demonstracao): nada sai
export type ResultadoEnvio = "enviado" | "simulado" | "suprimido";

// complemento do detalhe da auditoria conforme o resultado do envio
export function observacaoDoEnvio(resultado: ResultadoEnvio): string {
  if (resultado === "simulado") return " (simulado: SendGrid não configurado)";
  if (resultado === "suprimido") return " (suprimido: conta fictícia)";
  return "";
}

// conta da carga de demonstracao (usuarios.ficticio): o sistema nunca manda e-mail pra ela, em nenhum fluxo.
// O e-mail sem conta (ex.: cadastro ainda nao confirmado) segue normal
async function destinatarioFicticio(destinatario: string): Promise<boolean> {
  const conta = await prisma.usuario.findUnique({ where: { emailLogin: normalizarEmail(destinatario) }, select: { ficticio: true } });
  return conta?.ficticio === true;
}

// manda o email de verdade ou so loga, dependendo se o SendGrid ta configurado.
// "tipo" eh so um rotulo curto pro log (ex.: "recuperacao-senha") — o log NUNCA
// pode ter destinatario, assunto ou corpo, porque o corpo pode carregar codigo/token
// (achado da adequacao LGPD: o codigo de recuperacao nao pode aparecer em log de servidor)
async function enviar(tipo: string, destinatario: string, assunto: string, html: string): Promise<ResultadoEnvio> {
  if (await destinatarioFicticio(destinatario)) {
    console.info(`[e-mail] envio suprimido (conta fictícia) tipo=${tipo}`);
    return "suprimido";
  }
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

// aviso de que a senha foi trocada pela Minha Conta: so a data e a hora (horario de Brasilia), nunca a senha
async function enviarAvisoSenhaAlterada(destinatario: string, alteradaEm: Date): Promise<ResultadoEnvio> {
  const quando = alteradaEm.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
  const assunto = "Sua senha no SGEA foi alterada";
  const html = `
    <p>A senha da sua conta no SGEA foi alterada em ${quando}.</p>
    <p>Se não foi você, use <strong>Esqueci minha senha</strong> e avise privacidade@sgeacademicos.com.br.</p>
  `;
  return enviar("senha-alterada", destinatario, assunto, html);
}

// texto que vem do cadastro (titulo do evento, nome da sala/palestrante) entra no html escapado
function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// convite do professor (criacao da conta e reenvio): so o link, sem codigo. O link leva a chave depois do
// "#" (APP_URL/#/primeiro-acesso?convite=...), parte do endereco que o navegador nunca manda ao servidor.
// Separado do envio pra o teste conferir o conteudo sem enviar nada
export function conteudoDoConvite(nome: string, link: string): { assunto: string; html: string } {
  const linkSeguro = escaparHtml(link);
  return {
    assunto: "Convite para criar sua senha no Sistema de Gestão de Eventos Acadêmicos",
    html: `
    <p>Olá, ${escaparHtml(nome)}.</p>
    <p>A equipe da UMC criou sua conta no Sistema de Gestão de Eventos Acadêmicos. Clique no botão abaixo para criar
    sua senha e aceitar os Termos de Uso. O link vale por 24 horas. Se ele vencer, peça um novo convite à secretaria.</p>
    <p>
      <a href="${linkSeguro}" style="display: inline-block; padding: 12px 20px; background: #ffc400; color: #111;
        font-weight: bold; text-decoration: none; border-radius: 8px;">Criar minha senha</a>
    </p>
    <p>Se o botão não funcionar, copie e cole este link no navegador:<br><a href="${linkSeguro}">${linkSeguro}</a></p>
  `,
  };
}

async function enviarConviteProfessor(destinatario: string, nome: string, link: string): Promise<ResultadoEnvio> {
  const { assunto, html } = conteudoDoConvite(nome, link);
  return enviar("convite-professor", destinatario, assunto, html);
}

export interface MudancaEvento {
  rotulo: string;
  antes: string;
  depois: string;
}

interface DadosAlteracaoEvento {
  participanteNome: string;
  eventoTitulo: string;
  mudancas: MudancaEvento[];
}

// aviso pro aluno inscrito quando sala, horario, carga horaria ou palestrante de um evento aprovado mudam
// (proposta do professor aprovada pela equipe, ou edicao direta da equipe): so o que mudou, antes -> depois
async function enviarAlteracaoEvento(destinatario: string, dados: DadosAlteracaoEvento): Promise<ResultadoEnvio> {
  const assunto = `Evento alterado — ${dados.eventoTitulo}`;
  const linhas = dados.mudancas
    .map((m) => `<li><strong>${escaparHtml(m.rotulo)}:</strong> ${escaparHtml(m.antes)} → <strong>${escaparHtml(m.depois)}</strong></li>`)
    .join("");
  const html = `
    <p>Olá, ${escaparHtml(dados.participanteNome)}!</p>
    <p>O evento <strong>${escaparHtml(dados.eventoTitulo)}</strong>, em que você está inscrito, foi alterado:</p>
    <ul>${linhas}</ul>
    <p>Sua inscrição continua valendo. Se não puder comparecer no novo horário, você pode cancelá-la pelo sistema.</p>
  `;
  return enviar("alteracao-evento", destinatario, assunto, html);
}

export const emailService = {
  enviarAlteracaoEvento,
  enviarConviteProfessor,
  enviarConfirmacaoInscricao,
  enviarCancelamentoInscricao,
  enviarCodigoRecuperacao,
  enviarCodigoCadastro,
  enviarAvisoSenhaAlterada,
};
