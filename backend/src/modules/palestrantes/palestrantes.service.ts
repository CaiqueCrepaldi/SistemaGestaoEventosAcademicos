import { randomUUID } from "crypto";
import { Prisma, type Palestrante as PalestranteDb, type PropostaAlteracao as PropostaDb, type SituacaoAprovacao } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { camposInformados, registrarAuditoria } from "../../utils/auditoria";
import { ehEquipe, palestrantesVisiveis, type Ator } from "../../utils/escopo";
import { listarHistorico, registrarHistorico } from "../aprovacoes/aprovacoes.service";
import type { Palestrante } from "../../types/domain";
import type { PalestranteInput, PalestranteUpdateInput, PropostaPalestranteInput } from "./palestrantes.schemas";

// a proposta de alteracao aberta (pendente ou recusada) vem junto nas leituras
const COM_PROPOSTA = Prisma.validator<Prisma.PalestranteInclude>()({
  propostas: { where: { situacao: { in: ["PENDENTE", "RECUSADO"] } }, orderBy: { criadoEm: "desc" }, take: 1 },
});

function paraDominio(palestrante: PalestranteDb & { propostas?: PropostaDb[] }): Palestrante {
  const proposta = palestrante.propostas?.[0];
  return {
    id: palestrante.id,
    nome: palestrante.nome,
    email: palestrante.email,
    situacao: palestrante.situacao,
    motivoRecusa: palestrante.motivoRecusa,
    criadoPorId: palestrante.criadoPorId,
    proposta: proposta
      ? {
          id: proposta.id,
          situacao: proposta.situacao,
          nome: proposta.novoNome!,
          email: proposta.novoEmail!,
          motivoRecusa: proposta.motivoRecusa,
          criadoEm: proposta.criadoEm.toISOString(),
        }
      : null,
  };
}

async function recarregar(id: string) {
  return paraDominio(await prisma.palestrante.findUniqueOrThrow({ where: { id }, include: COM_PROPOSTA }));
}

// "Aguardando aprovacao" traz tambem os aprovados com proposta pendente; "Recusados", os com proposta recusada
function filtroSituacao(ator: Ator, situacao?: SituacaoAprovacao): Prisma.PalestranteWhereInput {
  if (!situacao) return {};
  if (situacao === "APROVADO" || ator.perfil === "ALUNO") return { situacao };
  return { OR: [{ situacao }, { propostas: { some: { situacao } } }] };
}

// lista os palestrantes que o perfil pode ver (utils/escopo.ts), ordenados por nome
async function listar(ator: Ator, situacao?: SituacaoAprovacao) {
  const palestrantes = await prisma.palestrante.findMany({
    where: { AND: [palestrantesVisiveis(ator), filtroSituacao(ator, situacao)] },
    orderBy: { nome: "asc" },
    include: COM_PROPOSTA,
  });
  return palestrantes.map(paraDominio);
}

// busca um palestrante visivel pra quem chama, 404 se nao existir
async function buscarOuFalhar(id: string, ator: Ator) {
  const palestrante = await prisma.palestrante.findFirst({ where: { id, ...palestrantesVisiveis(ator) }, include: COM_PROPOSTA });
  if (!palestrante) throw AppError.naoEncontrado("PALESTRANTE_NAO_ENCONTRADO", "Palestrante não encontrado.");
  return paraDominio(palestrante);
}

// palestrante que quem chama pode alterar: equipe qualquer um; professor so os que ele criou
async function doAtorOuFalhar(id: string, ator: Ator) {
  const palestrante = await prisma.palestrante.findFirst({
    where: { id, ...(ehEquipe(ator.perfil) ? {} : { criadoPorId: ator.id }) },
  });
  if (!palestrante) throw AppError.naoEncontrado("PALESTRANTE_NAO_ENCONTRADO", "Palestrante não encontrado.");
  return palestrante;
}

function erroEmailDuplicado(): AppError {
  return AppError.conflito("EMAIL_DUPLICADO", "Já existe um palestrante com este e-mail.");
}

function relancarComoConflito(erro: unknown): never {
  if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") throw erroEmailDuplicado();
  throw erro;
}

// da equipe ja nasce APROVADO; do professor nasce PENDENTE (aguarda a equipe)
async function criar(dados: PalestranteInput, ator: Ator) {
  const doProfessor = ator.perfil === "PROFESSOR";
  let palestrante: PalestranteDb;
  try {
    palestrante = await prisma.palestrante.create({
      data: { id: randomUUID(), ...dados, situacao: doProfessor ? "PENDENTE" : "APROVADO", criadoPorId: doProfessor ? ator.id : null },
    });
  } catch (erro) {
    relancarComoConflito(erro);
  }
  await registrarAuditoria(ator.id, "PALESTRANTE_CRIADO", `palestrante ${palestrante.id}`);
  if (doProfessor) {
    await registrarHistorico("PALESTRANTE", palestrante.id, "ENVIADO", ator.id);
    await registrarAuditoria(ator.id, "PALESTRANTE_ENVIADO_PARA_APROVACAO", `palestrante ${palestrante.id}`);
  }
  return paraDominio(palestrante);
}

// ---------------------------------------------------------------- proposta de alteracao (nome/e-mail)
async function propostaAbertaDe(palestranteId: string) {
  return prisma.propostaAlteracao.findFirst({
    where: { palestranteId, situacao: { in: ["PENDENTE", "RECUSADO"] } },
    orderBy: { criadoEm: "desc" },
  });
}

// "Nome: A → B; E-mail: x → y" (historico; visivel so pra equipe e pro professor dono do palestrante)
function resumoDaMudanca(atual: PalestranteDb, nome: string, email: string): string {
  const partes: string[] = [];
  if (nome !== atual.nome) partes.push(`Nome: ${atual.nome} → ${nome}`);
  if (email !== atual.email) partes.push(`E-mail: ${atual.email} → ${email}`);
  return partes.join("; ");
}

// o e-mail proposto nao pode ser de outro palestrante
async function garantirEmailLivre(email: string, palestranteId: string) {
  const outro = await prisma.palestrante.findFirst({ where: { email, id: { not: palestranteId } }, select: { id: true } });
  if (outro) throw erroEmailDuplicado();
}

// grava a proposta (nova, ou a recusada reaproveitada como reenvio), com historico e auditoria
async function enviarProposta(atual: PalestranteDb, nome: string, email: string, recusada: PropostaDb | null, ator: Ator, resposta?: string) {
  const resumo = resumoDaMudanca(atual, nome, email);
  if (recusada) {
    await prisma.propostaAlteracao.update({
      where: { id: recusada.id },
      data: { novoNome: nome, novoEmail: email, situacao: "PENDENTE", motivoRecusa: null, decididoEm: null, criadoPorId: ator.id },
    });
    const mensagem = resposta?.trim() ? `${resumo}\nResposta: ${resposta.trim()}` : resumo;
    await registrarHistorico("PALESTRANTE", atual.id, "PROPOSTA_REENVIADA", ator.id, mensagem);
    await registrarAuditoria(ator.id, "PALESTRANTE_PROPOSTA_REENVIADA", `palestrante ${atual.id}, proposta ${recusada.id}`);
    return;
  }
  const proposta = await prisma.propostaAlteracao.create({
    data: { id: randomUUID(), tipo: "PALESTRANTE", palestranteId: atual.id, novoNome: nome, novoEmail: email, criadoPorId: ator.id },
  });
  await registrarHistorico("PALESTRANTE", atual.id, "PROPOSTA_ENVIADA", ator.id, resumo);
  await registrarAuditoria(ator.id, "PALESTRANTE_PROPOSTA_ENVIADA", `palestrante ${atual.id}, proposta ${proposta.id}`);
}

// equipe edita qualquer um, direto. O professor edita direto os dele enquanto nao estao aprovados; num
// palestrante ja APROVADO, a mudanca de nome/e-mail vira PROPOSTA (o palestrante continua como esta ate a
// equipe aprovar). Nao manda e-mail a ninguem
async function atualizar(id: string, dados: PalestranteUpdateInput, ator: Ator) {
  const atual = await doAtorOuFalhar(id, ator);
  const nome = dados.nome ?? atual.nome;
  const email = dados.email ?? atual.email;
  const mudou = nome !== atual.nome || email !== atual.email;

  if (ator.perfil === "PROFESSOR" && atual.situacao === "APROVADO") {
    if (!mudou) return recarregar(id);
    const aberta = await propostaAbertaDe(id);
    if (aberta?.situacao === "PENDENTE") {
      throw AppError.conflito(
        "PROPOSTA_JA_PENDENTE",
        "Este palestrante já tem uma proposta de alteração aguardando aprovação. Edite ou cancele essa proposta antes de fazer outra.",
      );
    }
    if (email !== atual.email) await garantirEmailLivre(email, id);
    await enviarProposta(atual, nome, email, aberta, ator);
    return recarregar(id);
  }

  try {
    await prisma.palestrante.update({ where: { id }, data: dados });
  } catch (erro) {
    relancarComoConflito(erro);
  }
  await registrarAuditoria(ator.id, "PALESTRANTE_ATUALIZADO", `palestrante ${id} (campos: ${camposInformados(dados)})`);
  return recarregar(id);
}

async function propostaAbertaOuFalhar(palestranteId: string) {
  const proposta = await propostaAbertaDe(palestranteId);
  if (!proposta) throw AppError.naoEncontrado("PROPOSTA_NAO_ENCONTRADA", "Este palestrante não tem proposta de alteração em aberto.");
  return proposta;
}

// o professor corrige a proposta pendente, ou reenvia a recusada (com resposta opcional)
async function editarProposta(id: string, dados: PropostaPalestranteInput, ator: Ator) {
  const atual = await doAtorOuFalhar(id, ator);
  const proposta = await propostaAbertaOuFalhar(id);
  const nome = dados.nome ?? proposta.novoNome!;
  const email = dados.email ?? proposta.novoEmail!;
  if (nome === atual.nome && email === atual.email) {
    throw new AppError(
      422,
      "PROPOSTA_SEM_MUDANCA",
      "A proposta precisa mudar o nome ou o e-mail. Para desistir dela, cancele a proposta.",
    );
  }
  if (email !== atual.email) await garantirEmailLivre(email, id);
  if (proposta.situacao === "RECUSADO") {
    await enviarProposta(atual, nome, email, proposta, ator, dados.resposta);
  } else {
    await prisma.propostaAlteracao.update({ where: { id: proposta.id }, data: { novoNome: nome, novoEmail: email } });
    await registrarHistorico("PALESTRANTE", id, "PROPOSTA_EDITADA", ator.id, resumoDaMudanca(atual, nome, email));
    await registrarAuditoria(ator.id, "PALESTRANTE_PROPOSTA_EDITADA", `palestrante ${id}, proposta ${proposta.id}`);
  }
  return recarregar(id);
}

// o professor desiste da proposta (pendente ou recusada)
async function cancelarProposta(id: string, ator: Ator) {
  await doAtorOuFalhar(id, ator);
  const proposta = await propostaAbertaOuFalhar(id);
  await prisma.propostaAlteracao.delete({ where: { id: proposta.id } });
  await registrarHistorico("PALESTRANTE", id, "PROPOSTA_CANCELADA", ator.id);
  await registrarAuditoria(ator.id, "PALESTRANTE_PROPOSTA_CANCELADA", `palestrante ${id}, proposta ${proposta.id}`);
  return recarregar(id);
}

async function propostaPendenteOuFalhar(palestranteId: string) {
  const palestrante = await prisma.palestrante.findUnique({ where: { id: palestranteId } });
  if (!palestrante) throw AppError.naoEncontrado("PALESTRANTE_NAO_ENCONTRADO", "Palestrante não encontrado.");
  const proposta = await prisma.propostaAlteracao.findFirst({ where: { palestranteId, situacao: "PENDENTE" } });
  if (!proposta) {
    throw AppError.conflito("PROPOSTA_NAO_PENDENTE", "Este palestrante não tem proposta de alteração aguardando aprovação.");
  }
  return { palestrante, proposta };
}

// a equipe aprova (sem motivo): aplica nome/e-mail (o e-mail continua unico)
async function aprovarProposta(id: string, ator: Ator) {
  const { palestrante, proposta } = await propostaPendenteOuFalhar(id);
  const resumo = resumoDaMudanca(palestrante, proposta.novoNome!, proposta.novoEmail!);
  try {
    await prisma.$transaction([
      prisma.palestrante.update({ where: { id }, data: { nome: proposta.novoNome!, email: proposta.novoEmail! } }),
      prisma.propostaAlteracao.update({ where: { id: proposta.id }, data: { situacao: "APROVADO", motivoRecusa: null, decididoEm: new Date() } }),
    ]);
  } catch (erro) {
    relancarComoConflito(erro);
  }
  await registrarHistorico("PALESTRANTE", id, "PROPOSTA_APROVADA", ator.id, resumo);
  await registrarAuditoria(ator.id, "PALESTRANTE_PROPOSTA_APROVADA", `palestrante ${id}, proposta ${proposta.id}`);
  return recarregar(id);
}

// a equipe recusa com motivo: o palestrante fica como estava; o professor ve o motivo e pode reenviar
async function recusarProposta(id: string, motivo: string, ator: Ator) {
  const { proposta } = await propostaPendenteOuFalhar(id);
  await prisma.propostaAlteracao.update({ where: { id: proposta.id }, data: { situacao: "RECUSADO", motivoRecusa: motivo, decididoEm: new Date() } });
  await registrarHistorico("PALESTRANTE", id, "PROPOSTA_RECUSADA", ator.id, motivo);
  // o motivo e texto livre: fica so na proposta e no historico, nunca na auditoria
  await registrarAuditoria(ator.id, "PALESTRANTE_PROPOSTA_RECUSADA", `palestrante ${id}, proposta ${proposta.id}`);
  return recarregar(id);
}

// so sem evento vinculado e sem proposta de evento pendente que o use (a proposta do proprio palestrante sai junto)
// a equipe so exclui palestrante ja decidido (aprovado ou recusado): o que aguarda aprovacao, ou que tem proposta
// de alteracao aguardando, precisa da decisao antes. E palestrante com evento vinculado continua sem sair
async function remover(id: string, ator: Ator) {
  const palestrante = await doAtorOuFalhar(id, ator);
  if (palestrante.situacao === "PENDENTE") {
    throw AppError.conflito("PALESTRANTE_PENDENTE", "Aprove ou recuse este palestrante antes de excluir.");
  }
  const propostaPendente = await prisma.propostaAlteracao.count({ where: { palestranteId: id, situacao: "PENDENTE" } });
  if (propostaPendente > 0) {
    throw AppError.conflito("PROPOSTA_PENDENTE", "Aprove ou recuse a proposta de alteração deste palestrante antes de excluir.");
  }
  const eventos = await prisma.evento.count({ where: { palestranteId: id } });
  const propostasDeEvento = await prisma.propostaAlteracao.count({ where: { novoPalestranteId: id, situacao: { in: ["PENDENTE", "RECUSADO"] } } });
  if (eventos > 0 || propostasDeEvento > 0) {
    throw AppError.conflito("CONFLITO_DEPENDENCIA", "Não é possível remover: existem eventos vinculados a este palestrante.");
  }
  await prisma.$transaction([
    prisma.historicoAprovacao.deleteMany({ where: { tipo: "PALESTRANTE", itemId: id } }),
    prisma.palestrante.delete({ where: { id } }),
  ]);
  await registrarAuditoria(ator.id, "PALESTRANTE_REMOVIDO", `palestrante ${id}`);
}

// ---------------------------------------------------------------- aprovacao (so a equipe aprova/recusa)
async function pendenteOuFalhar(id: string) {
  const palestrante = await prisma.palestrante.findUnique({ where: { id } });
  if (!palestrante) throw AppError.naoEncontrado("PALESTRANTE_NAO_ENCONTRADO", "Palestrante não encontrado.");
  if (palestrante.situacao !== "PENDENTE") {
    throw AppError.conflito("PALESTRANTE_NAO_PENDENTE", "Só é possível aprovar ou recusar um palestrante que está aguardando aprovação.");
  }
  return palestrante;
}

async function aprovar(id: string, ator: Ator) {
  await pendenteOuFalhar(id);
  await prisma.palestrante.update({ where: { id }, data: { situacao: "APROVADO", motivoRecusa: null } });
  await registrarHistorico("PALESTRANTE", id, "APROVADO", ator.id);
  await registrarAuditoria(ator.id, "PALESTRANTE_APROVADO", `palestrante ${id}`);
  return recarregar(id);
}

async function recusar(id: string, motivo: string, ator: Ator) {
  await pendenteOuFalhar(id);
  await prisma.palestrante.update({ where: { id }, data: { situacao: "RECUSADO", motivoRecusa: motivo } });
  await registrarHistorico("PALESTRANTE", id, "RECUSADO", ator.id, motivo);
  // o motivo e texto livre: fica so no historico, nunca na auditoria
  await registrarAuditoria(ator.id, "PALESTRANTE_RECUSADO", `palestrante ${id}`);
  return recarregar(id);
}

// o professor reenvia o proprio palestrante recusado, com resposta opcional; volta para PENDENTE
async function reenviar(id: string, resposta: string | undefined, ator: Ator) {
  const palestrante = await doAtorOuFalhar(id, ator);
  if (palestrante.situacao !== "RECUSADO") {
    throw AppError.conflito("PALESTRANTE_NAO_RECUSADO", "Só é possível reenviar um palestrante que foi recusado.");
  }
  await prisma.palestrante.update({ where: { id }, data: { situacao: "PENDENTE", motivoRecusa: null } });
  await registrarHistorico("PALESTRANTE", id, "REENVIADO", ator.id, resposta);
  await registrarAuditoria(ator.id, "PALESTRANTE_REENVIADO", `palestrante ${id}`);
  return recarregar(id);
}

// historico da aprovacao: equipe e o professor que criou o palestrante
async function historico(id: string, ator: Ator) {
  await doAtorOuFalhar(id, ator);
  return listarHistorico("PALESTRANTE", id);
}

export const palestrantesService = {
  listar,
  buscarOuFalhar,
  criar,
  atualizar,
  remover,
  aprovar,
  recusar,
  reenviar,
  historico,
  editarProposta,
  cancelarProposta,
  aprovarProposta,
  recusarProposta,
};
