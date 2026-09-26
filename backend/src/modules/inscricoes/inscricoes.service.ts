import { randomUUID } from "crypto";
import type { Inscricao as InscricaoDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { emailService } from "../email/email.service";
import { descriptografar } from "../../utils/criptografia";
import { registrarAuditoria } from "../../utils/auditoria";
import type { Inscricao, Perfil, StatusPresenca } from "../../types/domain";
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
async function criarManual(dados: InscricaoInput, ator: { id: string; perfil: Perfil }) {
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
  const quem = ator.perfil === "SECRETARIA" ? "pela secretaria" : "pelo administrador";
  await registrarAuditoria(
    ator.id,
    "INSCRICAO_CRIADA",
    `inscrição ${inscricao.id} (evento ${dados.eventoId}, participante ${dados.participanteId}) feita ${quem}`,
  );
  return paraDominio(inscricao);
}

// muda o status de presenca (confirma, marca ausente ou reverte pra pendente)
async function atualizarCheckin(id: string, dados: InscricaoCheckinInput, usuarioIdDoToken: string) {
  const existente = await buscarOuFalhar(id);

  if (dados.statusPresenca === "PRESENTE") {
    // aluno inativado nao pode ter presenca confirmada (a tela do check-in tambem bloqueia, mas a regra vale na API)
    const participante = await prisma.participante.findUnique({
      where: { id: existente.participanteId },
      select: { ativo: true },
    });
    if (participante && !participante.ativo) {
      throw AppError.conflito("PARTICIPANTE_INATIVO", "Aluno inativo: não é possível confirmar presença.");
    }

    // ignora qualquer dataCheckin/usuarioId vindo do cliente, sempre usa horario do servidor
    const inscricao = await prisma.inscricao.update({
      where: { id },
      data: { statusPresenca: "PRESENTE", dataCheckin: new Date(), usuarioId: usuarioIdDoToken },
    });
    await registrarAuditoria(usuarioIdDoToken, "PRESENCA_CONFIRMADA", `inscricao ${id}`);
    return paraDominio(inscricao);
  }

  if (dados.statusPresenca === "AUSENTE") {
    const inscricao = await prisma.inscricao.update({
      where: { id },
      data: { statusPresenca: "AUSENTE", dataCheckin: null },
    });
    await registrarAuditoria(usuarioIdDoToken, "PRESENCA_MARCADA_AUSENTE", `inscricao ${id}`);
    return paraDominio(inscricao);
  }

  const inscricao = await prisma.inscricao.update({
    where: { id },
    data: { statusPresenca: "PENDENTE", dataCheckin: null },
  });
  await registrarAuditoria(usuarioIdDoToken, "INSCRICAO_ATUALIZADA", `inscrição ${id}: presença revertida para pendente`);
  return paraDominio(inscricao);
}

// remove uma inscricao
async function remover(id: string, atorId: string) {
  const inscricao = await buscarOuFalhar(id);
  await prisma.inscricao.delete({ where: { id } });
  await registrarAuditoria(
    atorId,
    "INSCRICAO_REMOVIDA",
    `inscrição ${id} (evento ${inscricao.eventoId}, participante ${inscricao.participanteId})`,
  );
}

// dispara o email de confirmacao, so pro proprio dono da inscricao
async function confirmarEmail(id: string, participanteIdDoToken: string, atorId: string) {
  const inscricao = await prisma.inscricao.findUnique({
    where: { id },
    include: { participante: true, evento: { include: { palestrante: true } } },
  });
  if (!inscricao) throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Inscrição não encontrada.");
  if (inscricao.participanteId !== participanteIdDoToken) {
    throw AppError.acessoNegado("Esta inscrição não pertence a você.");
  }

  const emailParticipante = descriptografar(inscricao.participante.email);

  try {
    const resultado = await emailService.enviarConfirmacaoInscricao(emailParticipante, {
      participanteNome: descriptografar(inscricao.participante.nome),
      eventoTitulo: inscricao.evento.titulo,
      eventoTema: inscricao.evento.tema,
      palestranteNome: inscricao.evento.palestrante.nome,
      eventoHorario: inscricao.evento.horario,
    });
    await registrarAuditoria(
      atorId,
      "EMAIL_ENVIADO",
      `confirmação de inscrição, inscrição ${id}${resultado === "simulado" ? " (simulado: SendGrid não configurado)" : ""}`,
    );
  } catch (erro) {
    await registrarAuditoria(atorId, "EMAIL_FALHA", `confirmação de inscrição, inscrição ${id}: falha no envio`);
    throw erro;
  }

  return { destinatario: emailParticipante, enviadoEm: new Date().toISOString() };
}

export const inscricoesService = { listar, buscarOuFalhar, criarManual, atualizarCheckin, remover, confirmarEmail };
