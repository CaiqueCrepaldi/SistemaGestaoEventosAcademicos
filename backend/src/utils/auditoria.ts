import { randomUUID } from "crypto";
import { prisma } from "../db/prisma";

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
  | "PRESENCA_CONFIRMADA"
  | "PRESENCA_MARCADA_AUSENTE"
  | "QUESTIONARIO_RESPONDIDO"
  | "FEEDBACK_CRIADO"
  | "FEEDBACK_ATUALIZADO"
  | "FEEDBACK_REMOVIDO";

// grava uma linha na trilha de auditoria; nunca deixa uma falha de log derrubar a operacao
// de verdade — so registra o erro no console e segue. "detalhe" precisa ser sempre contexto
// operacional (tipo da entidade + id, motivo curto), nunca dado sensivel (nome, e-mail, RGM,
// senha, codigo de recuperacao, token). "criadoEm" so eh passado quando o log precisa carregar
// exatamente o mesmo instante de outro registro (ex.: o aceite LGPD)
export async function registrarAuditoria(
  usuarioId: string | null,
  acao: AcaoAuditoria,
  detalhe?: string,
  criadoEm?: Date,
): Promise<void> {
  try {
    await prisma.logAuditoria.create({
      data: { id: randomUUID(), usuarioId, acao, detalhe, criadoEm },
    });
  } catch (erro) {
    console.error("[auditoria] falha ao registrar log:", erro);
  }
}

// nomes (nao valores) dos campos que vieram preenchidos num update, pra dizer o que mudou sem gravar o conteudo
export function camposInformados(dados: object): string {
  const campos = Object.entries(dados)
    .filter(([, valor]) => valor !== undefined)
    .map(([campo]) => campo);
  return campos.length > 0 ? campos.join(", ") : "nenhum";
}
