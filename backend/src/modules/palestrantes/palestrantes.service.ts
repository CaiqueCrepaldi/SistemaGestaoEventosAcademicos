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
  // Palestrante é opcional num evento, então remover um que já está
  // vinculado não bloqueia — só desvincula (palestranteId vira null nos
  // eventos afetados), igual seria com ON DELETE SET NULL num banco de verdade.
  for (const evento of eventosStore.listarComFiltro((e) => e.palestranteId === id)) {
    eventosStore.atualizar(evento.id, { palestranteId: null });
  }
  palestrantesStore.remover(id);
}

export const palestrantesService = { listar, buscarOuFalhar, criar, atualizar, remover };
