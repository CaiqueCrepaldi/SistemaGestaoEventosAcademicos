import { randomUUID } from "crypto";
import { prisma } from "../db/prisma";

// codigos de acao registrados na trilha de auditoria — mantidos curtos e sem PII no proprio codigo
export type AcaoAuditoria =
  | "LOGIN_SUCESSO"
  | "LOGIN_FALHA"
  | "USUARIO_REGISTRADO"
  | "PARTICIPANTE_INATIVADO"
  | "PARTICIPANTE_REATIVADO"
  | "PARTICIPANTE_REMOVIDO"
  | "EVENTO_CRIADO"
  | "EVENTO_ATUALIZADO"
  | "EVENTO_REMOVIDO"
  | "PRESENCA_CONFIRMADA"
  | "PRESENCA_MARCADA_AUSENTE";

// grava uma linha na trilha de auditoria; nunca deixa uma falha de log derrubar a operacao
// de verdade — so registra o erro no console e segue. "detalhe" precisa ser sempre contexto
// operacional (id, motivo curto), nunca dado sensivel (senha, token, PII bruta)
export async function registrarAuditoria(usuarioId: string | null, acao: AcaoAuditoria, detalhe?: string): Promise<void> {
  try {
    await prisma.logAuditoria.create({
      data: { id: randomUUID(), usuarioId, acao, detalhe },
    });
  } catch (erro) {
    console.error("[auditoria] falha ao registrar log:", erro);
  }
}
