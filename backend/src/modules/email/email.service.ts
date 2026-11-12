import sgMail from "@sendgrid/mail";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { normalizarEmail } from "../../utils/validacao";
import {
  conteudoAlteracaoEvento,
  conteudoCancelamentoInscricao,
  conteudoCodigoCadastro,
  conteudoCodigoRecuperacao,
  conteudoConfirmacaoInscricao,
  conteudoDoConvite,
  conteudoSenhaAlterada,
  type DadosAlteracaoEvento,
  type DadosCancelamentoInscricao,
  type DadosConfirmacaoInscricao,
  type EmailMontado,
} from "./conteudos-email";

// o conteudo e o visual de cada e-mail ficam em conteudos-email.ts (modelo unico, sem banco): aqui so o envio
export { conteudoDoConvite, dataHoraDeBrasilia, type MudancaEvento } from "./conteudos-email";

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

// manda o email de verdade ou so loga, dependendo se o SendGrid ta configurado. Vai sempre com as duas versoes:
// HTML e texto puro (campo "text"), o que tambem ajuda a nao cair no spam.
// "tipo" eh so um rotulo curto pro log (ex.: "recuperacao-senha") — o log NUNCA
// pode ter destinatario, assunto ou corpo, porque o corpo pode carregar codigo/token
// (achado da adequacao LGPD: o codigo de recuperacao nao pode aparecer em log de servidor)
async function enviar(tipo: string, destinatario: string, email: EmailMontado): Promise<ResultadoEnvio> {
  if (await destinatarioFicticio(destinatario)) {
    console.info(`[e-mail] envio suprimido (conta fictícia) tipo=${tipo}`);
    return "suprimido";
  }
  if (!sendgridPronto) {
    console.info(`[e-mail simulado] tipo=${tipo} (SendGrid nao configurado; destinatario e conteudo omitidos do log de proposito)`);
    return "simulado";
  }
  try {
    await sgMail.send({ from: env.sendgrid.from!, to: destinatario, subject: email.assunto, html: email.html, text: email.text });
    return "enviado";
  } catch (erro) {
    // nunca logar o objeto de erro cru do SendGrid: o SDK costuma ecoar o corpo da
    // requisicao (destinatario, as vezes o html) dentro do proprio erro
    const mensagem = erro instanceof Error ? erro.message : "erro desconhecido";
    console.error(`[email] falha ao enviar via SendGrid (tipo=${tipo}):`, mensagem);
    throw new Error(`Falha ao enviar e-mail via SendGrid: ${mensagem}`);
  }
}

// confirmacao depois que a inscricao eh criada
async function enviarConfirmacaoInscricao(destinatario: string, dados: DadosConfirmacaoInscricao): Promise<ResultadoEnvio> {
  return enviar("confirmacao-inscricao", destinatario, conteudoConfirmacaoInscricao(dados));
}

// aviso pro aluno quando a EQUIPE cancela a inscricao dele (quando o proprio aluno cancela, ele ja sabe)
async function enviarCancelamentoInscricao(destinatario: string, dados: DadosCancelamentoInscricao): Promise<ResultadoEnvio> {
  return enviar("cancelamento-inscricao", destinatario, conteudoCancelamentoInscricao(dados));
}

// codigo de recuperacao de senha
async function enviarCodigoRecuperacao(destinatario: string, codigo: string): Promise<ResultadoEnvio> {
  return enviar("recuperacao-senha", destinatario, conteudoCodigoRecuperacao(codigo));
}

// codigo que confirma o e-mail institucional no cadastro (a conta so e criada depois que o aluno digita o codigo)
async function enviarCodigoCadastro(destinatario: string, codigo: string): Promise<ResultadoEnvio> {
  return enviar("confirmacao-cadastro", destinatario, conteudoCodigoCadastro(codigo));
}

// aviso de que a senha foi trocada pela Minha Conta: so a data e a hora (horario de Brasilia), nunca a senha
async function enviarAvisoSenhaAlterada(destinatario: string, alteradaEm: Date): Promise<ResultadoEnvio> {
  return enviar("senha-alterada", destinatario, conteudoSenhaAlterada(alteradaEm));
}

// convite da conta da equipe (professor ou secretaria): so o link, sem codigo
async function enviarConviteEquipe(destinatario: string, nome: string, link: string): Promise<ResultadoEnvio> {
  return enviar("convite-equipe", destinatario, conteudoDoConvite(nome, link));
}

// aviso pro aluno inscrito quando sala, horario, carga horaria ou palestrante de um evento aprovado mudam
async function enviarAlteracaoEvento(destinatario: string, dados: DadosAlteracaoEvento): Promise<ResultadoEnvio> {
  return enviar("alteracao-evento", destinatario, conteudoAlteracaoEvento(dados));
}

export const emailService = {
  enviarAlteracaoEvento,
  enviarConviteEquipe,
  enviarConfirmacaoInscricao,
  enviarCancelamentoInscricao,
  enviarCodigoRecuperacao,
  enviarCodigoCadastro,
  enviarAvisoSenhaAlterada,
};
