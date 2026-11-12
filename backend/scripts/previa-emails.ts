// PREVIA DOS E-MAILS: gera um .html (e o .txt da versao em texto puro) de cada tipo de e-mail do SGEA, com dados de
// exemplo, em backend/previas-email/ (fora do git), pra abrir no navegador e conferir o visual. NAO envia nada e
// NAO acessa o banco: usa so o modelo de src/modules/email/conteudos-email.ts, o mesmo do envio de verdade.
//
// como rodar (de dentro de backend/):  npx tsx scripts/previa-emails.ts
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import {
  conteudoAlteracaoEvento,
  conteudoCancelamentoInscricao,
  conteudoCodigoCadastro,
  conteudoCodigoRecuperacao,
  conteudoConfirmacaoInscricao,
  conteudoDoConvite,
  conteudoSenhaAlterada,
  type EmailMontado,
} from "../src/modules/email/conteudos-email";

const PASTA = resolve(__dirname, "..", "previas-email");
const horarioDoEvento = new Date("2026-11-13T21:00:00-03:00");

const previas: Record<string, EmailMontado> = {
  "1-codigo-cadastro": conteudoCodigoCadastro("482915"),
  "2-convite-equipe": conteudoDoConvite("Marina Albuquerque", "https://www.sgeacademicos.com.br/#/primeiro-acesso?convite=exemplo-de-chave"),
  "3-codigo-recuperacao": conteudoCodigoRecuperacao("730264"),
  "4-senha-alterada": conteudoSenhaAlterada(new Date("2026-11-12T10:42:00-03:00")),
  "5-inscricao-confirmada": conteudoConfirmacaoInscricao({
    participanteNome: "João Pedro",
    eventoTitulo: "Palestra: Gestão de projetos ágeis",
    eventoTema: "Scrum, Kanban e entregas contínuas",
    palestranteNome: "Luana Coelho",
    eventoHorario: horarioDoEvento,
    salaRotulo: "2T-01 · Auditório",
  }),
  "6-inscricao-cancelada": conteudoCancelamentoInscricao({
    participanteNome: "João Pedro",
    eventoTitulo: "Palestra: Gestão de projetos ágeis",
    eventoHorario: horarioDoEvento,
  }),
  "7-evento-alterado": conteudoAlteracaoEvento({
    participanteNome: "João Pedro",
    eventoTitulo: "Palestra: Gestão de projetos ágeis",
    mudancas: [
      { rotulo: "Sala", antes: "1T-04 · Sala de aula", depois: "2T-01 · Auditório" },
      { rotulo: "Data/horário", antes: "13/11/2026, 19:00", depois: "13/11/2026, 21:00" },
    ],
  }),
  // dado de pessoa com HTML: tem que aparecer escapado (como texto), nunca virar tag
  "8-nome-com-html-escapado": conteudoConfirmacaoInscricao({
    participanteNome: '<script>alert("oi")</script> Teste',
    eventoTitulo: "Oficina <b>negrito</b> & cia",
    eventoTema: "Tema com 'aspas'",
    palestranteNome: "<img src=x onerror=alert(1)>",
    eventoHorario: horarioDoEvento,
    salaRotulo: "1T-04 · Sala de aula",
  }),
};

mkdirSync(PASTA, { recursive: true });
for (const [nome, email] of Object.entries(previas)) {
  writeFileSync(resolve(PASTA, `${nome}.html`), email.html, "utf8");
  writeFileSync(resolve(PASTA, `${nome}.txt`), `Assunto: ${email.assunto}\n\n${email.text}\n`, "utf8");
}
console.log(`[previa-emails] ${Object.keys(previas).length} e-mails gerados em ${PASTA}`);
