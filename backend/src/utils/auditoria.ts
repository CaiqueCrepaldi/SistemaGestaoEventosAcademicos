import { randomUUID } from "crypto";
import { prisma } from "../db/prisma";

// codigos de acao registrados na trilha de auditoria — mantidos curtos e sem PII no proprio codigo
export type AcaoAuditoria =
  | "LOGIN_SUCESSO"
  | "LOGIN_FALHA"
  // cadastro com confirmacao do e-mail (USUARIO_REGISTRADO, usado antes disso, ficou so nos logs antigos)
  | "CADASTRO_INICIADO"
  | "CADASTRO_CODIGO_REENVIADO"
  | "CADASTRO_CONCLUIDO"
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
  // aprovacao de evento/palestrante criado por professor (o motivo e a resposta ficam so em historico_aprovacoes)
  | "EVENTO_ENVIADO_PARA_APROVACAO"
  | "EVENTO_APROVADO"
  | "EVENTO_RECUSADO"
  | "EVENTO_REENVIADO"
  | "PALESTRANTE_ENVIADO_PARA_APROVACAO"
  | "PALESTRANTE_APROVADO"
  | "PALESTRANTE_RECUSADO"
  | "PALESTRANTE_REENVIADO"
  // proposta de alteracao de evento/palestrante ja aprovado (valores, motivo e resposta ficam so em
  // propostas_alteracao e historico_aprovacoes)
  | "EVENTO_PROPOSTA_ENVIADA"
  | "EVENTO_PROPOSTA_EDITADA"
  | "EVENTO_PROPOSTA_APROVADA"
  | "EVENTO_PROPOSTA_RECUSADA"
  | "EVENTO_PROPOSTA_REENVIADA"
  | "EVENTO_PROPOSTA_CANCELADA"
  | "PALESTRANTE_PROPOSTA_ENVIADA"
  | "PALESTRANTE_PROPOSTA_EDITADA"
  | "PALESTRANTE_PROPOSTA_APROVADA"
  | "PALESTRANTE_PROPOSTA_RECUSADA"
  | "PALESTRANTE_PROPOSTA_REENVIADA"
  | "PALESTRANTE_PROPOSTA_CANCELADA"
  // evento em aberto passado para outro professor (ou para a equipe) na inativacao do professor
  | "EVENTO_TRANSFERIDO"
  // conta de professor: criada pela equipe, ativada no primeiro acesso
  | "PROFESSOR_CRIADO"
  // so em registros antigos (quando o primeiro acesso era por codigo de 6 digitos)
  | "PROFESSOR_CODIGO_REENVIADO"
  | "PROFESSOR_CONVITE_REENVIADO"
  | "PROFESSOR_INATIVADO"
  | "PROFESSOR_REATIVADO"
  | "PRIMEIRO_ACESSO_CONCLUIDO"
  | "PRIMEIRO_ACESSO_FALHA"
  | "PARTICIPANTE_ATUALIZADO"
  | "PARTICIPANTE_INATIVADO"
  | "PARTICIPANTE_REATIVADO"
  | "PARTICIPANTE_REMOVIDO"
  | "INSCRICAO_CRIADA"
  | "INSCRICAO_ATUALIZADA"
  | "INSCRICAO_REMOVIDA"
  | "INSCRICAO_CANCELADA"
  // presenca marcada direto pela equipe: so nos logs anteriores ao check-in pedido pelo aluno
  | "PRESENCA_CONFIRMADA"
  | "PRESENCA_MARCADA_AUSENTE"
  // check-in pedido pelo aluno e decidido pelo professor do evento ou pela equipe
  | "CHECKIN_SOLICITADO"
  | "CHECKIN_APROVADO"
  | "CHECKIN_RECUSADO"
  | "CHECKIN_REVERTIDO"
  | "CHECKIN_APROVADO_TODOS"
  | "CHECKIN_EXPIRADO"
  | "QUESTIONARIO_RESPONDIDO"
  | "CERTIFICADO_EMITIDO"
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
  | "CODIGO_RECUPERACAO_USADO"
  // scripts/carga-demonstracao.ts: apagou tudo e carregou os dados de demonstracao (so as quantidades)
  | "CARGA_DEMONSTRACAO";

// grava uma linha na trilha de auditoria; nunca deixa uma falha de log derrubar a operacao
// de verdade — so registra o erro no console e segue. "detalhe" precisa ser sempre contexto
// operacional (tipo da entidade + id, motivo curto), nunca dado sensivel (nome, e-mail, RGM,
// senha, codigo de recuperacao, token). "criadoEm" so eh passado quando o log precisa carregar
// exatamente o mesmo instante de outro registro (ex.: o aceite LGPD).
// Logs so sao criados aqui: nenhuma rota edita ou apaga linha existente (a conversao unica do nome do
// responsavel de cifrado pra texto puro, feita uma vez antes da migration
// 20261103150000_dados_pessoais_sem_duplicacao, nao mudou o conteudo)
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
      data: { id: randomUUID(), usuarioId, atorNome: ator?.nome ?? null, acao, detalhe, criadoEm },
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
