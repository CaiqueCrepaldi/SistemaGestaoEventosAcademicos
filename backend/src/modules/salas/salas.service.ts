import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { camposInformados, registrarAuditoria } from "../../utils/auditoria";
import { compararSalas } from "../../utils/salas";
import type { SalaInput, SalaUpdateInput } from "./salas.schemas";

// lista salas por predio, andar e numero (1T-01, 1T-02, ..., 11-01, ..., 33-21)
async function listar() {
  const salas = await prisma.sala.findMany();
  return salas.sort(compararSalas);
}

// busca uma sala pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const sala = await prisma.sala.findUnique({ where: { id } });
  if (!sala) throw AppError.naoEncontrado("SALA_NAO_ENCONTRADA", "Sala não encontrada.");
  return sala;
}

function erroSalaDuplicada(codigo: string): AppError {
  return AppError.conflito("SALA_DUPLICADA", `Já existe uma sala ${codigo}.`);
}

// codigo repetido -> 409 com mensagem clara. O indice unico em salas.nome barra do mesmo jeito (corrida rara)
async function garantirCodigoLivre(codigo: string, ignorarId?: string) {
  const existente = await prisma.sala.findUnique({ where: { nome: codigo }, select: { id: true } });
  if (existente && existente.id !== ignorarId) throw erroSalaDuplicada(codigo);
}

async function gravar<T>(codigo: string | undefined, operacao: () => Promise<T>): Promise<T> {
  try {
    return await operacao();
  } catch (erro) {
    if (codigo && erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") throw erroSalaDuplicada(codigo);
    throw erro;
  }
}

// cadastra uma sala nova
async function criar(dados: SalaInput, atorId: string) {
  await garantirCodigoLivre(dados.nome);
  const sala = await gravar(dados.nome, () => prisma.sala.create({ data: { id: randomUUID(), ...dados } }));
  await registrarAuditoria(atorId, "SALA_CRIADA", `sala ${sala.id}`);
  return sala;
}

// edita uma sala existente
async function atualizar(id: string, dados: SalaUpdateInput, atorId: string) {
  await buscarOuFalhar(id);
  if (dados.nome) await garantirCodigoLivre(dados.nome, id);
  const sala = await gravar(dados.nome, () => prisma.sala.update({ where: { id }, data: dados }));
  await registrarAuditoria(atorId, "SALA_ATUALIZADA", `sala ${id} (campos: ${camposInformados(dados)})`);
  return sala;
}
// remove uma sala, bloqueia se tiver evento vinculado (o banco tambem tem essa trava, isso so da uma mensagem melhor)
async function remover(id: string, atorId: string) {
  await buscarOuFalhar(id);
  // proposta de alteracao aberta que usa a sala tambem segura (a pendente reserva a sala)
  const temEventoVinculado =
    (await prisma.evento.count({ where: { salaId: id } })) > 0 ||
    (await prisma.propostaAlteracao.count({ where: { novaSalaId: id, situacao: { in: ["PENDENTE", "RECUSADO"] } } })) > 0;
  if (temEventoVinculado) {
    throw AppError.conflito("CONFLITO_DEPENDENCIA", "Não é possível remover: existem eventos vinculados a esta sala.");
  }
  try {
    await prisma.sala.delete({ where: { id } });
  } catch (erro) {
    // corrida rara: evento criado entre o count acima e o delete, o banco barra do mesmo jeito
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2003") {
      throw AppError.conflito("CONFLITO_DEPENDENCIA", "Não é possível remover: existem eventos vinculados a esta sala.");
    }
    throw erro;
  }
  await registrarAuditoria(atorId, "SALA_REMOVIDA", `sala ${id}`);
}

export const salasService = { listar, buscarOuFalhar, criar, atualizar, remover };
