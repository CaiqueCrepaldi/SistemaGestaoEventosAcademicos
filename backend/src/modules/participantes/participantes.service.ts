import { randomUUID } from "crypto";
import { feedbacksStore, inscricoesStore, participantesStore, usuariosStore } from "../../db/store";
import { AppError } from "../../errors/AppError";
import type { ParticipanteInput, ParticipanteUpdateInput } from "./participantes.schemas";

async function listar() {
  return [...participantesStore.listar()].sort((a, b) => a.nome.localeCompare(b.nome));
}

async function buscarOuFalhar(id: string) {
  const participante = participantesStore.buscarPorId(id);
  if (!participante) throw AppError.naoEncontrado("PARTICIPANTE_NAO_ENCONTRADO", "Participante não encontrado.");
  return participante;
}

function garantirEmailERgmUnicos(dados: { email?: string; rgm?: string }, ignorarId?: string) {
  if (dados.email) {
    const existente = participantesStore.buscarUm((p) => p.email === dados.email);
    if (existente && existente.id !== ignorarId) {
      throw AppError.conflito("EMAIL_DUPLICADO", "Já existe um participante com este e-mail.");
    }
  }
  if (dados.rgm) {
    const existente = participantesStore.buscarUm((p) => p.rgm === dados.rgm);
    if (existente && existente.id !== ignorarId) {
      throw AppError.conflito("RGM_DUPLICADO", "Já existe um participante com este RGM.");
    }
  }
}

async function criar(dados: ParticipanteInput) {
  garantirEmailERgmUnicos(dados);
  return participantesStore.criar({ id: randomUUID(), ...dados, criadoEm: new Date().toISOString() });
}

async function atualizar(id: string, dados: ParticipanteUpdateInput) {
  await buscarOuFalhar(id);
  garantirEmailERgmUnicos(dados, id);
  return participantesStore.atualizar(id, dados)!;
}

async function remover(id: string) {
  await buscarOuFalhar(id);
  // Sem banco de dados enforçando foreign key, replicamos à mão as mesmas
  // regras que o schema tinha: inscrição/feedback vinculado bloqueia a
  // exclusão (era ON DELETE RESTRICT); já a conta de usuário vinculada só
  // perde a referência (era ON DELETE SET NULL).
  const temVinculo =
    inscricoesStore.contar((i) => i.participanteId === id) > 0 || feedbacksStore.contar((f) => f.participanteId === id) > 0;
  if (temVinculo) {
    throw AppError.conflito(
      "CONFLITO_DEPENDENCIA",
      "Não é possível remover: existem inscrições ou feedbacks vinculados a este participante.",
    );
  }
  const usuarioVinculado = usuariosStore.buscarUm((u) => u.participanteId === id);
  if (usuarioVinculado) {
    usuariosStore.atualizar(usuarioVinculado.id, { participanteId: null });
  }
  participantesStore.remover(id);
}

export const participantesService = { listar, buscarOuFalhar, criar, atualizar, remover };
