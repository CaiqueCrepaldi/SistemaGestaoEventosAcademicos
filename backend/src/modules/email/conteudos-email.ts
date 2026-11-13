// Modelo unico dos e-mails do SGEA e o conteudo de cada um (codigo do cadastro, convite, recuperacao de senha,
// senha alterada, confirmacao e cancelamento de inscricao, mudanca no evento, evento cancelado). Funcoes puras: nao acessam banco nem
// configuracao, entao o teste e o script de previa (scripts/previa-emails.ts) usam exatamente o que o envio usa.
//
// Visual do site: cabecalho escuro com "UMC · Gestao de Eventos Academicos" (UMC em azul), botao amarelo, texto
// escuro sobre fundo claro. Compatibilidade de e-mail: layout em tabelas, CSS inline, largura maxima de 600px, sem
// imagem nem fonte externa. Todo e-mail tem um texto de pre-visualizacao (preheader) e a versao em texto puro.
// Todo dado que vem de pessoa (nome, titulo, tema, palestrante, sala, motivo, link) e escapado antes de entrar no HTML.
// As cores ficam em hexadecimal sem 6 digitos seguidos (#111, #345...): o teste do convite procura sequencias de 6
// digitos no HTML pra garantir que nenhum codigo vazou

export interface EmailMontado {
  assunto: string;
  html: string;
  text: string;
}

interface Linha {
  rotulo: string;
  valor: string;
}

interface ConteudoEmail {
  assunto: string;
  // frase que o programa de e-mail mostra ao lado do assunto, antes de abrir
  preheader: string;
  titulo: string;
  // paragrafos de texto; **trecho** sai em negrito no HTML
  paragrafos: string[];
  // cartao do evento: titulo e os dados (data e horario, sala, palestrante...)
  evento?: { titulo: string; linhas: Linha[] };
  codigo?: { valor: string; validade: string };
  // paragrafos logo antes do botao (o texto que convida a clicar)
  paragrafosDaAcao?: string[];
  acao?: { rotulo: string; url: string };
  paragrafosFinais?: string[];
}

const COR = {
  fundo: "#f8fafc",
  cartao: "#fff",
  borda: "#e2e8f0",
  cabecalho: "#111",
  marca: "#3b82f6",
  texto: "#0f172a",
  corpo: "#345",
  suave: "#64748b",
  destaque: "#ffc400",
  sobreDestaque: "#111",
  destaqueClaro: "#fff8e1",
  link: "#8a6400",
} as const;

const FONTE = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'Courier New', Courier, monospace";
const CANAL_PRIVACIDADE = "privacidade@sgeacademicos.com.br";

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// escapa e depois troca **trecho** por <strong> (o trecho ja esta escapado)
function emHtml(texto: string): string {
  return escaparHtml(texto).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${COR.texto};">$1</strong>`);
}

function semMarcacao(texto: string): string {
  return texto.replace(/\*\*(.+?)\*\*/g, "$1");
}

// data e hora no horario de Brasilia: o servidor (Vercel) roda em UTC, e sem o fuso o e-mail mostraria o horario
// 3 horas adiantado
export function dataHoraDeBrasilia(data: Date): string {
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}

function paragrafoHtml(texto: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONTE};font-size:15px;line-height:1.6;color:${COR.corpo};">${emHtml(texto)}</p>`;
}

function cartaoDoEvento(evento: NonNullable<ConteudoEmail["evento"]>): string {
  const linhas = evento.linhas
    .map(
      (l) =>
        `<p style="margin:6px 0 0;font-family:${FONTE};font-size:14px;line-height:1.5;color:${COR.corpo};">` +
        `<span style="color:${COR.suave};font-weight:bold;">${escaparHtml(l.rotulo)}:</span> ${escaparHtml(l.valor)}</p>`,
    )
    .join("");
  return `
          <tr>
            <td style="padding:4px 28px 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${COR.fundo};border:1px solid ${COR.borda};border-left:4px solid ${COR.destaque};border-radius:8px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0;font-family:${FONTE};font-size:16px;font-weight:bold;line-height:1.4;color:${COR.texto};">${escaparHtml(evento.titulo)}</p>
                    ${linhas}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

function caixaDoCodigo(codigo: NonNullable<ConteudoEmail["codigo"]>): string {
  return `
          <tr>
            <td align="center" style="padding:4px 28px 18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td align="center" style="padding:16px 30px;background:${COR.destaqueClaro};border:2px dashed ${COR.destaque};border-radius:10px;font-family:${MONO};font-size:32px;font-weight:bold;letter-spacing:8px;color:${COR.sobreDestaque};">${escaparHtml(codigo.valor)}</td>
                </tr>
              </table>
              <p style="margin:10px 0 0;font-family:${FONTE};font-size:13px;color:${COR.suave};">${escaparHtml(codigo.validade)}</p>
            </td>
          </tr>`;
}

// botao "a prova de cliente de e-mail": a celula pinta o fundo mesmo onde o <a> nao aceita padding (Outlook)
function botaoDaAcao(acao: NonNullable<ConteudoEmail["acao"]>): string {
  const url = escaparHtml(acao.url);
  return `
          <tr>
            <td align="center" style="padding:6px 28px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td align="center" bgcolor="${COR.destaque}" style="border-radius:8px;background:${COR.destaque};">
                    <a href="${url}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${FONTE};font-size:16px;font-weight:bold;color:${COR.sobreDestaque};text-decoration:none;border-radius:8px;">${escaparHtml(acao.rotulo)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 18px;">
              <p style="margin:0;font-family:${FONTE};font-size:13px;line-height:1.5;color:${COR.suave};word-break:break-all;">Se o botão não funcionar, copie e cole este link no navegador:<br><a href="${url}" target="_blank" style="color:${COR.link};">${url}</a></p>
            </td>
          </tr>`;
}

export function montarEmail(c: ConteudoEmail): EmailMontado {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escaparHtml(c.assunto)}</title>
  </head>
  <body style="margin:0;padding:0;background:${COR.fundo};">
    <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;mso-hide:all;">${escaparHtml(c.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COR.fundo};">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${COR.cartao};border:1px solid ${COR.borda};border-radius:10px;border-collapse:separate;">
          <tr>
            <td style="background:${COR.cabecalho};padding:18px 28px;border-radius:10px 10px 0 0;font-family:${FONTE};font-size:17px;font-weight:bold;color:#fff;"><span style="color:${COR.marca};">UMC</span> · Gestão de Eventos Acadêmicos</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 6px;">
              <h1 style="margin:0 0 14px;font-family:${FONTE};font-size:24px;line-height:1.3;color:${COR.texto};">${escaparHtml(c.titulo)}</h1>
              ${c.paragrafos.map(paragrafoHtml).join("\n              ")}
            </td>
          </tr>${c.evento ? cartaoDoEvento(c.evento) : ""}${c.codigo ? caixaDoCodigo(c.codigo) : ""}${
            c.paragrafosDaAcao?.length
              ? `
          <tr>
            <td style="padding:0 28px 6px;">
              ${c.paragrafosDaAcao.map(paragrafoHtml).join("\n              ")}
            </td>
          </tr>`
              : ""
          }${c.acao ? botaoDaAcao(c.acao) : ""}${
            c.paragrafosFinais?.length
              ? `
          <tr>
            <td style="padding:0 28px 10px;">
              ${c.paragrafosFinais.map(paragrafoHtml).join("\n              ")}
            </td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:18px 28px;border-top:1px solid ${COR.borda};font-family:${FONTE};font-size:12px;line-height:1.6;color:${COR.suave};">Mensagem automática do SGEA, não responda.<br>Dúvidas sobre os seus dados: <a href="mailto:${CANAL_PRIVACIDADE}" style="color:${COR.link};">${CANAL_PRIVACIDADE}</a></td>
          </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const partes: string[] = ["UMC · Gestão de Eventos Acadêmicos", "", c.titulo.toUpperCase(), "", ...c.paragrafos.map(semMarcacao)];
  if (c.evento) partes.push("", c.evento.titulo, ...c.evento.linhas.map((l) => `${l.rotulo}: ${l.valor}`));
  if (c.codigo) partes.push("", `Código: ${c.codigo.valor}`, c.codigo.validade);
  if (c.paragrafosDaAcao?.length) partes.push("", ...c.paragrafosDaAcao.map(semMarcacao));
  if (c.acao) partes.push("", `${c.acao.rotulo}: ${c.acao.url}`);
  if (c.paragrafosFinais?.length) partes.push("", ...c.paragrafosFinais.map(semMarcacao));
  partes.push("", "--", "Mensagem automática do SGEA, não responda.", `Dúvidas sobre os seus dados: ${CANAL_PRIVACIDADE}`);
  return { assunto: c.assunto, html, text: partes.join("\n") };
}

// ---------------------------------------------------------------- o conteudo de cada e-mail

// codigo que confirma o e-mail institucional no cadastro (a conta so e criada depois que o aluno digita o codigo)
export function conteudoCodigoCadastro(codigo: string): EmailMontado {
  return montarEmail({
    assunto: "Código de confirmação do cadastro",
    preheader: "Use o código deste e-mail para concluir o seu cadastro no SGEA. Ele vale por 15 minutos.",
    titulo: "Confirme o seu e-mail",
    paragrafos: ["Use o código abaixo para confirmar seu e-mail e concluir o cadastro no Sistema de Gestão de Eventos Acadêmicos."],
    codigo: { valor: codigo, validade: "Esse código vale por 15 minutos." },
    paragrafosFinais: ["Se você não pediu este cadastro, ignore este e-mail: nenhuma conta será criada."],
  });
}

// codigo da recuperacao de senha ("Esqueci minha senha")
export function conteudoCodigoRecuperacao(codigo: string): EmailMontado {
  return montarEmail({
    assunto: "Código de recuperação de senha",
    preheader: "Use o código deste e-mail para criar uma nova senha no SGEA. Ele expira em 15 minutos.",
    titulo: "Redefina a sua senha",
    paragrafos: ["Use o código abaixo para redefinir a sua senha no SGEA."],
    codigo: { valor: codigo, validade: "Esse código expira em 15 minutos." },
    paragrafosFinais: ["Se você não pediu essa recuperação, ignore este e-mail: a sua senha continua a mesma."],
  });
}

// convite da conta da equipe (professor ou secretaria; criacao e reenvio): so o link, sem codigo. A chave vai
// depois do "#" (APP_URL/#/primeiro-acesso?convite=...), parte do endereco que o navegador nunca manda ao servidor
export function conteudoDoConvite(nome: string, link: string): EmailMontado {
  return montarEmail({
    assunto: "Convite para criar sua senha no Sistema de Gestão de Eventos Acadêmicos",
    preheader: "A sua conta no SGEA foi criada. Crie a sua senha pelo link deste e-mail, que vale por 24 horas.",
    titulo: "Crie a sua senha",
    paragrafos: [
      `Olá, ${nome}.`,
      "A equipe da UMC criou sua conta no Sistema de Gestão de Eventos Acadêmicos. Clique no botão abaixo para criar sua senha e aceitar os Termos de Uso.",
      "O link vale por 24 horas. Se ele vencer, peça um novo convite a quem criou a sua conta.",
    ],
    acao: { rotulo: "Criar minha senha", url: link },
  });
}

// aviso de que a senha foi trocada pela Minha Conta: so a data e a hora (horario de Brasilia), nunca a senha
export function conteudoSenhaAlterada(alteradaEm: Date): EmailMontado {
  const quando = dataHoraDeBrasilia(alteradaEm);
  return montarEmail({
    assunto: "Sua senha no SGEA foi alterada",
    preheader: `A senha da sua conta no SGEA foi alterada em ${quando}.`,
    titulo: "A sua senha foi alterada",
    paragrafos: [
      `A senha da sua conta no SGEA foi alterada em ${quando}.`,
      `Se não foi você, use **Esqueci minha senha** e avise ${CANAL_PRIVACIDADE}.`,
    ],
  });
}

export interface DadosConfirmacaoInscricao {
  participanteNome: string;
  eventoTitulo: string;
  eventoTema: string;
  palestranteNome: string;
  eventoHorario: Date;
  // "1T-01 · Laboratório" (utils/salas.ts: rotuloSala)
  salaRotulo?: string;
}

// confirmacao da inscricao (autoinscricao do aluno ou inscricao feita pela equipe ou pelo professor)
export function conteudoConfirmacaoInscricao(dados: DadosConfirmacaoInscricao): EmailMontado {
  return montarEmail({
    assunto: `Inscrição confirmada — ${dados.eventoTitulo}`,
    preheader: `Sua inscrição em ${dados.eventoTitulo} foi confirmada.`,
    titulo: "Inscrição confirmada",
    paragrafos: [`Olá, ${dados.participanteNome}!`, `Sua inscrição em **${dados.eventoTitulo}** foi confirmada.`],
    evento: {
      titulo: dados.eventoTitulo,
      linhas: [
        { rotulo: "Tema", valor: dados.eventoTema },
        { rotulo: "Data e horário", valor: `${dataHoraDeBrasilia(dados.eventoHorario)} (horário de Brasília)` },
        ...(dados.salaRotulo ? [{ rotulo: "Sala", valor: dados.salaRotulo }] : []),
        { rotulo: "Palestrante", valor: dados.palestranteNome },
      ],
    },
    paragrafosFinais: ["O check-in é pedido por você, na tela Eventos, a partir de 1 hora antes do início. Até lá!"],
  });
}

export interface DadosCancelamentoInscricao {
  participanteNome: string;
  eventoTitulo: string;
  eventoHorario: Date;
}

// aviso pro aluno quando a EQUIPE cancela a inscricao dele (quando o proprio aluno cancela, ele ja sabe)
export function conteudoCancelamentoInscricao(dados: DadosCancelamentoInscricao): EmailMontado {
  return montarEmail({
    assunto: `Inscrição cancelada — ${dados.eventoTitulo}`,
    preheader: `Sua inscrição em ${dados.eventoTitulo} foi cancelada pela secretaria.`,
    titulo: "Inscrição cancelada",
    paragrafos: [`Olá, ${dados.participanteNome}!`, `Sua inscrição em **${dados.eventoTitulo}** foi cancelada pela secretaria.`],
    evento: {
      titulo: dados.eventoTitulo,
      linhas: [{ rotulo: "Data e horário", valor: `${dataHoraDeBrasilia(dados.eventoHorario)} (horário de Brasília)` }],
    },
    paragrafosFinais: ["Se ainda houver vagas, você pode se inscrever de novo pelo sistema. Em caso de dúvida, procure a secretaria."],
  });
}

export interface MudancaEvento {
  rotulo: string;
  antes: string;
  depois: string;
}

export interface DadosAlteracaoEvento {
  participanteNome: string;
  eventoTitulo: string;
  mudancas: MudancaEvento[];
}

// aviso pro aluno inscrito quando sala, horario, carga horaria ou palestrante de um evento aprovado mudam: so o que
// mudou, antes -> depois
export function conteudoAlteracaoEvento(dados: DadosAlteracaoEvento): EmailMontado {
  return montarEmail({
    assunto: `Evento alterado — ${dados.eventoTitulo}`,
    preheader: `O evento ${dados.eventoTitulo}, em que você está inscrito, foi alterado.`,
    titulo: "Evento alterado",
    paragrafos: [`Olá, ${dados.participanteNome}!`, `O evento **${dados.eventoTitulo}**, em que você está inscrito, foi alterado:`],
    evento: {
      titulo: dados.eventoTitulo,
      linhas: dados.mudancas.map((m) => ({ rotulo: m.rotulo, valor: `${m.antes} → ${m.depois}` })),
    },
    paragrafosFinais: ["Sua inscrição continua valendo. Se não puder comparecer no novo horário, você pode cancelá-la pelo sistema."],
  });
}

export interface DadosCancelamentoEvento {
  nome: string;
  // INSCRITO: aluno inscrito no evento; PROFESSOR: o professor responsavel (texto adaptado)
  destinatario: "INSCRITO" | "PROFESSOR";
  eventoTitulo: string;
  eventoHorario: Date;
  // "1T-01 · Laboratório" (utils/salas.ts: rotuloSala)
  salaRotulo: string;
  palestranteNome: string;
  motivo: string;
  // tela de eventos do sistema (APP_URL); sem ela o e-mail sai sem o botao
  linkEventos: string | null;
}

// evento cancelado pela equipe: vai para cada inscrito e para o professor responsavel, com o motivo informado
export function conteudoCancelamentoEvento(dados: DadosCancelamentoEvento): EmailMontado {
  const professor = dados.destinatario === "PROFESSOR";
  return montarEmail({
    assunto: `Evento cancelado: ${dados.eventoTitulo}`,
    preheader: professor
      ? `Seu evento ${dados.eventoTitulo} foi cancelado pela equipe.`
      : `O evento ${dados.eventoTitulo}, em que você estava inscrito, foi cancelado.`,
    titulo: "Este evento foi cancelado",
    paragrafos: [
      `Olá, ${dados.nome}!`,
      professor
        ? `Seu evento **${dados.eventoTitulo}** foi cancelado pela equipe.`
        : `O evento **${dados.eventoTitulo}**, em que você estava inscrito, foi cancelado.`,
    ],
    evento: {
      titulo: dados.eventoTitulo,
      linhas: [
        { rotulo: "Data e horário", valor: `${dataHoraDeBrasilia(dados.eventoHorario)} (horário de Brasília)` },
        { rotulo: "Sala", valor: dados.salaRotulo },
        { rotulo: "Palestrante", valor: dados.palestranteNome },
        { rotulo: "Motivo do cancelamento", valor: dados.motivo },
      ],
    },
    paragrafosDaAcao: [
      professor
        ? "As inscrições dos alunos foram encerradas, e cada inscrito foi avisado por e-mail. Veja os seus eventos no sistema."
        : "Sua inscrição foi encerrada. Veja outros eventos abertos no sistema.",
    ],
    ...(dados.linkEventos ? { acao: { rotulo: professor ? "Ver meus eventos" : "Ver eventos abertos", url: dados.linkEventos } } : {}),
  });
}
