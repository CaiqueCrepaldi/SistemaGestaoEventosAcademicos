import { randomUUID } from "crypto";
import { Prisma, type Palestrante as PalestranteDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import type { Palestrante } from "../../types/domain";
import type { PalestranteInput, PalestranteUpdateInput } from "./palestrantes.schemas";

function paraDominio(palestrante: PalestranteDb): Palestrante {
  return palestrante;
}

// lista palestrantes ordenados por nome
async function listar() {
  const palestrantes = await prisma.palestrante.findMany({ orderBy: { nome: "asc" } });
  return palestrantes.map(paraDominio);
}

// busca um palestrante pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const palestrante = await prisma.palestrante.findUnique({ where: { id } });
  if (!palestrante) throw AppError.naoEncontrado("PALESTRANTE_NAO_ENCONTRADO", "Palestrante não encontrado.");
  return paraDominio(palestrante);
}

function relancarComoConflito(erro: unknown): never {
  if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
    throw AppError.conflito("EMAIL_DUPLICADO", "Já existe um palestrante com este e-mail.");
  }
  throw erro;
}

async function criar(dados: PalestranteInput) {
  try {
    const palestrante = await prisma.palestrante.create({ data: { id: randomUUID(), ...dados } });
    return paraDominio(palestrante);
  } catch (erro) {
    relancarComoConflito(erro);
  }
}

async function atualizar(id: string, dados: PalestranteUpdateInput) {
  await buscarOuFalhar(id);
  try {
    const palestrante = await prisma.palestrante.update({ where: { id }, data: dados });
    return paraDominio(palestrante);
  } catch (erro) {
    relancarComoConflito(erro);
  }
}

async function remover(id: string) {
  await buscarOuFalhar(id);
  const eventos = await prisma.evento.count({ where: { palestranteId: id } });
  if (eventos > 0) {
    throw AppError.conflito("CONFLITO_DEPENDENCIA", "Não é possível remover: existem eventos vinculados a este palestrante.");
  }
  await prisma.palestrante.delete({ where: { id } });
}

export const palestrantesService = { listar, buscarOuFalhar, criar, atualizar, remover };
