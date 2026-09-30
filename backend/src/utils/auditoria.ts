import { randomUUID } from "crypto";
import { prisma } from "../db/prisma";
import { lerDadoPessoal } from "./dadosPessoais";

// codigos de acao registrados na trilha de auditoria — mantidos curtos e sem PII no proprio codigo
export type AcaoAuditoria =
  | "LOGIN_SUCESSO"
  | "LOGIN_FALHA"
  | "USUARIO_REGISTRADO"
  | "CONSENTIMENTO_LGPD_ACEITO"
  | "RECUPERACAO_SENHA_SOLICITADA"
  | "RECUPERACAO_SENHA_FALHA"
  | "SENHA_REDEFINIDA"
  | "EMAIL_ENVIADO"
  | "EMAIL_FALHA"
  | "ACESSO_NEGADO"
  | "BLOQUEIO_LOGIN_REMOVIDO"
  | "SALA_CRIADA"
  | "SALA_ATUALIZADA"
  | "SALA_REMOVIDA"
  | "PALESTRANTE_CRIADO"
  | "PALESTRANTE_ATUALIZADO"
  | "PALESTRANTE_REMOVIDO"
  | "EVENTO_CRIADO"
  | "EVENTO_ATUALIZADO"
  | "EVENTO_REMOVIDO"
  | "PARTICIPANTE_ATUALIZADO"
  | "PARTICIPANTE_INATIVADO"
  | "PARTICIPANTE_REATIVADO"
  | "PARTICIPANTE_REMOVIDO"
  | "INSCRICAO_CRIADA"
  | "INSCRICAO_ATUALIZADA"
  | "INSCRICAO_REMOVIDA"
  | "INSCRICAO_CANCELADA"
  | "PRESENCA_CONFIRMADA"
  | "PRESENCA_MARCADA_AUSENTE"
  | "QUESTIONARIO_RESPONDIDO"
  | "FEEDBACK_CRIADO"
  | "FEEDBACK_EXCLUIDO"
  | "SENHA_HASH_ATUALIZADO"
  | "CONVERSAO_DADOS_PESSOAIS"
  | "TERMOS_REACEITOS"
  | "DADOS_EXPORTADOS"
  | "CONTA_ANONIMIZADA"
  | "SOLICITACAO_TITULAR_CRIADA"
  | "SOLICITACAO_TITULAR_ATENDIDA"
  | "RETENCAO_EXECUTADA"
  | "MFA_ATIVADO"
  | "MFA_DESATIVADO"
  | "MFA_VERIFICADO"
  | "MFA_FALHA"
  | "MFA_BLOQUEADO"
  | "MFA_RESETADO"
  | "CODIGO_RECUPERACAO_USADO";

// grava uma linha na trilha de auditoria; nunca deixa uma falha de log derrubar a operacao
// de verdade — so registra o erro no console e segue. "detalhe" precisa ser sempre contexto
// operacional (tipo da entidade + id, motivo curto), nunca dado sensivel (nome, e-mail, RGM,
// senha, codigo de recuperacao, token). "criadoEm" so eh passado quando o log precisa carregar
// exatamente o mesmo instante de outro registro (ex.: o aceite LGPD).
// Logs so sao criados aqui. A unica alteracao de linha existente e a conversao unica do nome do
// responsavel de cifrado pra texto puro (scripts/converter-dados-pessoais.ts), sem mudar o conteudo
export async function registrarAuditoria(
  usuarioId: string | null,
  acao: AcaoAuditoria,
  detalhe?: string,
  criadoEm?: Date,
): Promise<void> {
  try {
    // copia o nome de quem agiu: se o usuario for excluido depois, o log mantem o responsavel
    // mesmo com usuarioId nulo
    const ator = usuarioId ? await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nome: true } }) : null;
    await prisma.logAuditoria.create({
      data: { id: randomUUID(), usuarioId, atorNome: ator ? lerDadoPessoal(ator.nome) : null, acao, detalhe, criadoEm },
    });
  } catch (erro) {
    // so o tipo do erro: a mensagem do Prisma repete os valores da gravacao (nome de quem agiu)
    const codigo = erro instanceof Error ? ((erro as { code?: string }).code ?? erro.name) : "erro desconhecido";
    console.error(`[auditoria] falha ao registrar log ${acao}: ${codigo}`);
  }
}

// nomes (nao valores) dos campos que vieram preenchidos num update, pra dizer o que mudou sem gravar o conteudo
export function camposInformados(dados: object): string {
  const campos = Object.entries(dados)
    .filter(([, valor]) => valor !== undefined)
    .map(([campo]) => campo);
  return campos.length > 0 ? campos.join(", ") : "nenhum";
}
