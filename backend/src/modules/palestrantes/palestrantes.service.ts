import { randomUUID } from "crypto";
import { Prisma, type Palestrante as PalestranteDb, type SituacaoAprovacao } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { camposInformados, registrarAuditoria } from "../../utils/auditoria";
import { ehEquipe, palestrantesVisiveis, type Ator } from "../../utils/escopo";
import { listarHistorico, registrarHistorico } from "../aprovacoes/aprovacoes.service";
import type { Palestrante } from "../../types/domain";
import type { PalestranteInput, PalestranteUpdateInput } from "./palestrantes.schemas";

function paraDominio(palestrante: PalestranteDb): Palestrante {
  return {
    id: palestrante.id,
    nome: palestrante.nome,
    email: palestrante.email,
    situacao: palestrante.situacao,
    motivoRecusa: palestrante.motivoRecusa,
    criadoPorId: palestrante.criadoPorId,
  };
}

// lista os palestrantes que o perfil pode ver (utils/escopo.ts), ordenados por nome
async function listar(ator: Ator, situacao?: SituacaoAprovacao) {
  const palestrantes = await prisma.palestrante.findMany({
    where: { ...palestrantesVisiveis(ator), ...(situacao ? { situacao } : {}) },
    orderBy: { nome: "asc" },
  });
  return palestrantes.map(paraDominio);
}

// busca um palestrante visivel pra quem chama, 404 se nao existir
async function buscarOuFalhar(id: string, ator: Ator) {
  const palestrante = await prisma.palestrante.findFirst({ where: { id, ...palestrantesVisiveis(ator) } });
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

function relancarComoConflito(erro: unknown): never {
  if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
    throw AppError.conflito("EMAIL_DUPLICADO", "Já existe um palestrante com este e-mail.");
  }
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

// equipe edita qualquer um; o professor edita os dele enquanto nao estao aprovados (mudanca em
// palestrante ja aprovado vai precisar de nova aprovacao — proxima etapa)
async function atualizar(id: string, dados: PalestranteUpdateInput, ator: Ator) {
  const atual = await doAtorOuFalhar(id, ator);
  if (ator.perfil === "PROFESSOR" && atual.situacao === "APROVADO") {
    const mudou = (dados.nome !== undefined && dados.nome !== atual.nome) || (dados.email !== undefined && dados.email !== atual.email);
    if (mudou) throw AppError.conflito("ALTERACAO_PRECISA_APROVACAO", "Esta alteração vai precisar de aprovação (em breve).");
  }
  let palestrante: PalestranteDb;
  try {
    palestrante = await prisma.palestrante.update({ where: { id }, data: dados });
  } catch (erro) {
    relancarComoConflito(erro);
  }
  await registrarAuditoria(ator.id, "PALESTRANTE_ATUALIZADO", `palestrante ${id} (campos: ${camposInformados(dados)})`);
  return paraDominio(palestrante);
}

async function remover(id: string, ator: Ator) {
  await doAtorOuFalhar(id, ator);
  const eventos = await prisma.evento.count({ where: { palestranteId: id } });
  if (eventos > 0) {
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
  const aprovado = await prisma.palestrante.update({ where: { id }, data: { situacao: "APROVADO", motivoRecusa: null } });
  await registrarHistorico("PALESTRANTE", id, "APROVADO", ator.id);
  await registrarAuditoria(ator.id, "PALESTRANTE_APROVADO", `palestrante ${id}`);
  return paraDominio(aprovado);
}

async function recusar(id: string, motivo: string, ator: Ator) {
  await pendenteOuFalhar(id);
  const recusado = await prisma.palestrante.update({ where: { id }, data: { situacao: "RECUSADO", motivoRecusa: motivo } });
  await registrarHistorico("PALESTRANTE", id, "RECUSADO", ator.id, motivo);
  // o motivo e texto livre: fica so no historico, nunca na auditoria
  await registrarAuditoria(ator.id, "PALESTRANTE_RECUSADO", `palestrante ${id}`);
  return paraDominio(recusado);
}

// o professor reenvia o proprio palestrante recusado, com resposta opcional; volta para PENDENTE
async function reenviar(id: string, resposta: string | undefined, ator: Ator) {
  const palestrante = await doAtorOuFalhar(id, ator);
  if (palestrante.situacao !== "RECUSADO") {
    throw AppError.conflito("PALESTRANTE_NAO_RECUSADO", "Só é possível reenviar um palestrante que foi recusado.");
  }
  const reenviado = await prisma.palestrante.update({ where: { id }, data: { situacao: "PENDENTE", motivoRecusa: null } });
  await registrarHistorico("PALESTRANTE", id, "REENVIADO", ator.id, resposta);
  await registrarAuditoria(ator.id, "PALESTRANTE_REENVIADO", `palestrante ${id}`);
  return paraDominio(reenviado);
}

// historico da aprovacao: equipe e o professor que criou o palestrante
async function historico(id: string, ator: Ator) {
  await doAtorOuFalhar(id, ator);
  return listarHistorico("PALESTRANTE", id);
}

export const palestrantesService = { listar, buscarOuFalhar, criar, atualizar, remover, aprovar, recusar, reenviar, historico };
