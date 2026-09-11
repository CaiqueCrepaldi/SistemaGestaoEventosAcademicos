import { randomUUID } from "crypto";
import type { Inscricao as InscricaoDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { emailService } from "../email/email.service";
import type { Inscricao, StatusPresenca } from "../../types/domain";
import type { InscricaoCheckinInput, InscricaoInput } from "./inscricoes.schemas";

interface FiltrosListagem {
  eventoId?: string;
  participanteId?: string;
  status?: StatusPresenca;
}

// prisma devolve as datas como Date, resto do app espera string (ISO) ou null
export function paraDominio(inscricao: InscricaoDb): Inscricao {
  return {
    ...inscricao,
    dataCheckin: inscricao.dataCheckin ? inscricao.dataCheckin.toISOString() : null,
    dataInscricao: inscricao.dataInscricao.toISOString(),
  };
}

// lista inscricoes filtradas, mais recente primeiro
async function listar(filtros: FiltrosListagem) {
  const inscricoes = await prisma.inscricao.findMany({
    where: {
      eventoId: filtros.eventoId,
      participanteId: filtros.participanteId,
      statusPresenca: filtros.status,
    },
    orderBy: { dataInscricao: "desc" },
  });
  return inscricoes.map(paraDominio);
}

// busca uma inscricao pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const inscricao = await prisma.inscricao.findUnique({ where: { id } });
  if (!inscricao) throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Inscrição não encontrada.");
  return paraDominio(inscricao);
}

// inscricao manual feita por admin/secretaria, checa duplicidade e vaga
async function criarManual(dados: InscricaoInput) {
  const [participante, evento] = await Promise.all([
    prisma.participante.findUnique({ where: { id: dados.participanteId } }),
    prisma.evento.findUnique({ where: { id: dados.eventoId }, include: { sala: true } }),
  ]);

  const erros: { campo: string; mensagem: string }[] = [];
  if (!participante) erros.push({ campo: "participanteId", mensagem: "Participante não encontrado." });
  if (!evento) erros.push({ campo: "eventoId", mensagem: "Evento não encontrado." });
  if (erros.length > 0) throw AppError.validacao("Dados inválidos.", erros);

  const jaInscrito = await prisma.inscricao.findUnique({
    where: { participanteId_eventoId: { participanteId: dados.participanteId, eventoId: dados.eventoId } },
  });
  if (jaInscrito) throw AppError.conflito("JA_INSCRITO", "Este participante já está inscrito neste evento.");

  const ocupadas = await prisma.inscricao.count({ where: { eventoId: dados.eventoId } });
  if (ocupadas >= evento!.sala.capacidade) {
    throw AppError.conflito("EVENTO_LOTADO", "Evento sem vagas disponíveis.");
  }

  const inscricao = await prisma.inscricao.create({
    data: { id: randomUUID(), participanteId: dados.participanteId, eventoId: dados.eventoId, statusPresenca: "PENDENTE" },
  });
  return paraDominio(inscricao);
}

// muda o status de presenca (confirma, marca ausente ou reverte pra pendente)
async function atualizarCheckin(id: string, dados: InscricaoCheckinInput, usuarioIdDoToken: string) {
  await buscarOuFalhar(id);

  if (dados.statusPresenca === "PRESENTE") {
    // ignora qualquer dataCheckin/usuarioId vindo do cliente, sempre usa horario do servidor
    const inscricao = await prisma.inscricao.update({
      where: { id },
      data: { statusPresenca: "PRESENTE", dataCheckin: new Date(), usuarioId: usuarioIdDoToken },
    });
    return paraDominio(inscricao);
  }

  if (dados.statusPresenca === "AUSENTE") {
    const inscricao = await prisma.inscricao.update({
      where: { id },
      data: { statusPresenca: "AUSENTE", dataCheckin: null },
    });
    return paraDominio(inscricao);
  }

  const inscricao = await prisma.inscricao.update({
    where: { id },
    data: { statusPresenca: "PENDENTE", dataCheckin: null },
  });
  return paraDominio(inscricao);
}

// remove uma inscricao
async function remover(id: string) {
  await buscarOuFalhar(id);
  await prisma.inscricao.delete({ where: { id } });
}

// dispara o email de confirmacao, so pro proprio dono da inscricao
async function confirmarEmail(id: string, participanteIdDoToken: string) {
  const inscricao = await prisma.inscricao.findUnique({
    where: { id },
    include: { participante: true, evento: { include: { palestrante: true } } },
  });
  if (!inscricao) throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Inscrição não encontrada.");
  if (inscricao.participanteId !== participanteIdDoToken) {
    throw AppError.acessoNegado("Esta inscrição não pertence a você.");
  }

  await emailService.enviarConfirmacaoInscricao(inscricao.participante.email, {
    participanteNome: inscricao.participante.nome,
    eventoTitulo: inscricao.evento.titulo,
    eventoTema: inscricao.evento.tema,
    palestranteNome: inscricao.evento.palestrante.nome,
    eventoHorario: inscricao.evento.horario,
  });

  return { destinatario: inscricao.participante.email, enviadoEm: new Date().toISOString() };
}

export const inscricoesService = { listar, buscarOuFalhar, criarManual, atualizarCheckin, remover, confirmarEmail };
