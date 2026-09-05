import { randomUUID } from "crypto";
import { eventosStore, inscricoesStore, palestrantesStore, participantesStore, salasStore } from "../../db/store";
import { AppError } from "../../errors/AppError";
import { emailService } from "../email/email.service";
import type { StatusPresenca } from "../../types/domain";
import type { InscricaoCheckinInput, InscricaoInput } from "./inscricoes.schemas";

interface FiltrosListagem {
  eventoId?: string;
  participanteId?: string;
  status?: StatusPresenca;
}

async function listar(filtros: FiltrosListagem) {
  return inscricoesStore
    .listarComFiltro(
      (i) =>
        (!filtros.eventoId || i.eventoId === filtros.eventoId) &&
        (!filtros.participanteId || i.participanteId === filtros.participanteId) &&
        (!filtros.status || i.statusPresenca === filtros.status),
    )
    .sort((a, b) => b.dataInscricao.localeCompare(a.dataInscricao));
}

async function buscarOuFalhar(id: string) {
  const inscricao = inscricoesStore.buscarPorId(id);
  if (!inscricao) throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Inscrição não encontrada.");
  return inscricao;
}

async function criarManual(dados: InscricaoInput) {
  const participante = participantesStore.buscarPorId(dados.participanteId);
  const evento = eventosStore.buscarPorId(dados.eventoId);

  const erros: { campo: string; mensagem: string }[] = [];
  if (!participante) erros.push({ campo: "participanteId", mensagem: "Participante não encontrado." });
  if (!evento) erros.push({ campo: "eventoId", mensagem: "Evento não encontrado." });
  if (erros.length > 0) throw AppError.validacao("Dados inválidos.", erros);

  const jaInscrito = inscricoesStore.buscarUm(
    (i) => i.participanteId === dados.participanteId && i.eventoId === dados.eventoId,
  );
  if (jaInscrito) throw AppError.conflito("JA_INSCRITO", "Este participante já está inscrito neste evento.");

  const sala = salasStore.buscarPorId(evento!.salaId);
  const ocupadas = inscricoesStore.contar((i) => i.eventoId === dados.eventoId);
  if (sala && ocupadas >= sala.capacidade) {
    throw AppError.conflito("EVENTO_LOTADO", "Evento sem vagas disponíveis.");
  }

  return inscricoesStore.criar({
    id: randomUUID(),
    participanteId: dados.participanteId,
    eventoId: dados.eventoId,
    statusPresenca: "PENDENTE",
    dataCheckin: null,
    usuarioId: null,
    dataInscricao: new Date().toISOString(),
  });
}

async function atualizarCheckin(id: string, dados: InscricaoCheckinInput, usuarioIdDoToken: string) {
  await buscarOuFalhar(id);

  if (dados.statusPresenca === "PRESENTE") {
    // ignora qualquer dataCheckin/usuarioId vindo do cliente, sempre usa horario do servidor
    return inscricoesStore.atualizar(id, {
      statusPresenca: "PRESENTE",
      dataCheckin: new Date().toISOString(),
      usuarioId: usuarioIdDoToken,
    })!;
  }

  if (dados.statusPresenca === "AUSENTE") {
    return inscricoesStore.atualizar(id, { statusPresenca: "AUSENTE", dataCheckin: null })!;
  }

  return inscricoesStore.atualizar(id, { statusPresenca: "PENDENTE", dataCheckin: null })!;
}

async function remover(id: string) {
  await buscarOuFalhar(id);
  inscricoesStore.remover(id);
}

async function confirmarEmail(id: string, participanteIdDoToken: string) {
  const inscricao = await buscarOuFalhar(id);
  if (inscricao.participanteId !== participanteIdDoToken) {
    throw AppError.acessoNegado("Esta inscrição não pertence a você.");
  }

  const participante = participantesStore.buscarPorId(inscricao.participanteId);
  const evento = eventosStore.buscarPorId(inscricao.eventoId);
  if (!participante || !evento) {
    throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Inscrição não encontrada.");
  }

  const palestrante = evento.palestranteId ? palestrantesStore.buscarPorId(evento.palestranteId) : undefined;

  await emailService.enviarConfirmacaoInscricao(participante.email, {
    participanteNome: participante.nome,
    eventoTitulo: evento.titulo,
    eventoTema: evento.tema,
    palestranteNome: palestrante?.nome ?? "—",
    eventoHorario: new Date(evento.horario),
  });

  return { destinatario: participante.email, enviadoEm: new Date().toISOString() };
}

export const inscricoesService = { listar, buscarOuFalhar, criarManual, atualizarCheckin, remover, confirmarEmail };
