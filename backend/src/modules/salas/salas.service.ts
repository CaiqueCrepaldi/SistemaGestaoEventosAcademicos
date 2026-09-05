import { randomUUID } from "crypto";
import { eventosStore, salasStore } from "../../db/store";
import { AppError } from "../../errors/AppError";
import type { SalaInput, SalaUpdateInput } from "./salas.schemas";

async function listar() {
  return [...salasStore.listar()].sort((a, b) => a.nome.localeCompare(b.nome));
}

async function buscarOuFalhar(id: string) {
  const sala = salasStore.buscarPorId(id);
  if (!sala) throw AppError.naoEncontrado("SALA_NAO_ENCONTRADA", "Sala não encontrada.");
  return sala;
}

async function criar(dados: SalaInput) {
  return salasStore.criar({ id: randomUUID(), ...dados });
}

async function atualizar(id: string, dados: SalaUpdateInput) {
  await buscarOuFalhar(id);
  return salasStore.atualizar(id, dados)!;
}

async function remover(id: string) {
  await buscarOuFalhar(id);
  // sem fk de banco, checa a mao se tem evento vinculado antes de excluir
  const temEventoVinculado = eventosStore.contar((e) => e.salaId === id) > 0;
  if (temEventoVinculado) {
    throw AppError.conflito("CONFLITO_DEPENDENCIA", "Não é possível remover: existem eventos vinculados a esta sala.");
  }
  salasStore.remover(id);
}

export const salasService = { listar, buscarOuFalhar, criar, atualizar, remover };
