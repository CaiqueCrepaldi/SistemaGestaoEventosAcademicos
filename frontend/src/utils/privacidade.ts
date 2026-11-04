// canal dos pedidos LGPD que nao sao feitos pela propria tela (correcao, exclusao, revisao humana do
// questionario, oposicao...). Mesmo e-mail e prazo da Politica de Privacidade e do docs/lgpd/08
export const EMAIL_PRIVACIDADE = "privacidade@sgeacademicos.com.br";
export const PRAZO_RESPOSTA_DIAS = 15;
export const ASSUNTO_PEDIDO_LGPD = "Solicitação LGPD – SGEA";

// link mailto com o assunto e o RGM ja preenchidos (o RGM ajuda a equipe a achar o cadastro).
// Quebra de linha como CRLF, que e o que o mailto espera
export function linkPedidoPrivacidade(assunto: string, rgm: string | null | undefined, pedido = "Descreva aqui o seu pedido:"): string {
  const corpo = [`RGM: ${rgm ?? ""}`, "", pedido, ""].join("\r\n");
  return `mailto:${EMAIL_PRIVACIDADE}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

// revisao humana do resultado do questionario (LGPD, art. 20): o certificado e liberado automaticamente
export function linkRevisaoQuestionario(tituloEvento: string, rgm: string | null | undefined): string {
  return linkPedidoPrivacidade(
    `Revisão do resultado do questionário – ${tituloEvento}`,
    rgm,
    "Peço a revisão humana do resultado do questionário deste evento. Motivo:",
  );
}
