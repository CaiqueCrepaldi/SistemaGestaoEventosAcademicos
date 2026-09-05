import { randomUUID } from "crypto";
import { eventosStore, palestrantesStore } from "../../db/store";
import { AppError } from "../../errors/AppError";
import type { PalestranteInput, PalestranteUpdateInput } from "./palestrantes.schemas";

async function listar() {
  return [...palestrantesStore.listar()].sort((a, b) => a.nome.localeCompare(b.nome));
}

async function buscarOuFalhar(id: string) {
  const palestrante = palestrantesStore.buscarPorId(id);
  if (!palestrante) throw AppError.naoEncontrado("PALESTRANTE_NAO_ENCONTRADO", "Palestrante não encontrado.");
  return palestrante;
}

async function criar(dados: PalestranteInput) {
  return palestrantesStore.criar({ id: randomUUID(), ...dados });
}

async function atualizar(id: string, dados: PalestranteUpdateInput) {
  await buscarOuFalhar(id);
  return palestrantesStore.atualizar(id, dados)!;
}

async function remover(id: string) {
  await buscarOuFalhar(id);
  // palestrante eh obrigatorio no evento, bloqueia exclusao se tiver vinculo
  const emUso = eventosStore.contar((e) => e.palestranteId === id) > 0;
  if (emUso) {
    throw AppError.conflito("PALESTRANTE_EM_USO", "Não é possível remover: há eventos vinculados a este palestrante.");
  }
  palestrantesStore.remover(id);
}

export const palestrantesService = { listar, buscarOuFalhar, criar, atualizar, remover };
