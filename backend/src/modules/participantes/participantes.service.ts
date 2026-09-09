import { randomUUID } from "crypto";
import { feedbacksStore, inscricoesStore, participantesStore, usuariosStore } from "../../db/store";
import { AppError } from "../../errors/AppError";
import type { ParticipanteInput, ParticipanteUpdateInput } from "./participantes.schemas";

// lista participantes ordenados por nome
async function listar() {
  return [...participantesStore.listar()].sort((a, b) => a.nome.localeCompare(b.nome));
}

// busca um participante pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const participante = participantesStore.buscarPorId(id);
  if (!participante) throw AppError.naoEncontrado("PARTICIPANTE_NAO_ENCONTRADO", "Participante não encontrado.");
  return participante;
}

// bloqueia email/rgm repetido, ignorando o proprio registro quando eh update
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

// cadastra um participante novo
async function criar(dados: ParticipanteInput) {
  garantirEmailERgmUnicos(dados);
  return participantesStore.criar({ id: randomUUID(), ...dados, criadoEm: new Date().toISOString() });
}

// edita um participante existente
async function atualizar(id: string, dados: ParticipanteUpdateInput) {
  await buscarOuFalhar(id);
  garantirEmailERgmUnicos(dados, id);
  return participantesStore.atualizar(id, dados)!;
}

// remove um participante, bloqueia se tiver inscricao/feedback vinculado
async function remover(id: string) {
  await buscarOuFalhar(id);
  // sem fk de banco: inscricao/feedback vinculado bloqueia exclusao, conta de usuario so perde a referencia
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
