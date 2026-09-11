import { randomUUID } from "crypto";
import type { Evento as EventoDb, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { paraDominio as paraDominioInscricao } from "../inscricoes/inscricoes.service";
import type { Evento, PerguntaQuestionario } from "../../types/domain";
import type { EventoInput, EventoUpdateInput } from "./eventos.schemas";

// prisma devolve horario/criadoEm como Date e questionario como Json — converte pro formato que o resto do app espera
function paraDominio(evento: EventoDb): Evento {
  return {
    id: evento.id,
    titulo: evento.titulo,
    horario: evento.horario.toISOString(),
    salaId: evento.salaId,
    palestranteId: evento.palestranteId,
    tema: evento.tema,
    cargaHoraria: evento.cargaHoraria,
    questionario: evento.questionario as unknown as PerguntaQuestionario[],
    criadoEm: evento.criadoEm.toISOString(),
  };
}

// lista todos os eventos ordenados por horario
async function listar() {
  const eventos = await prisma.evento.findMany({ orderBy: { horario: "asc" } });
  return eventos.map(paraDominio);
}

// busca um evento pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const evento = await prisma.evento.findUnique({ where: { id } });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  return paraDominio(evento);
}

// confere se sala/palestrante informados existem de verdade
async function validarReferencias(dados: Partial<Pick<EventoInput, "salaId" | "palestranteId">>) {
  const erros: { campo: string; mensagem: string }[] = [];

  if (dados.salaId && !(await prisma.sala.findUnique({ where: { id: dados.salaId } }))) {
    erros.push({ campo: "salaId", mensagem: "Sala informada não existe." });
  }
  if (dados.palestranteId && !(await prisma.palestrante.findUnique({ where: { id: dados.palestranteId } }))) {
    erros.push({ campo: "palestranteId", mensagem: "Palestrante informado não existe." });
  }

  if (erros.length > 0) {
    throw AppError.validacao("Dados inválidos.", erros);
  }
}

// cadastra um evento novo
async function criar(dados: EventoInput) {
  await validarReferencias(dados);
  const evento = await prisma.evento.create({
    data: {
      id: randomUUID(),
      titulo: dados.titulo,
      horario: new Date(dados.horario),
      salaId: dados.salaId,
      palestranteId: dados.palestranteId,
      tema: dados.tema,
      cargaHoraria: dados.cargaHoraria,
      questionario: dados.questionario as unknown as Prisma.InputJsonValue,
    },
  });
  return paraDominio(evento);
}

// edita um evento existente
async function atualizar(id: string, dados: EventoUpdateInput) {
  await buscarOuFalhar(id);
  await validarReferencias(dados);
  const evento = await prisma.evento.update({
    where: { id },
    data: {
      titulo: dados.titulo,
      horario: dados.horario ? new Date(dados.horario) : undefined,
      salaId: dados.salaId,
      palestranteId: dados.palestranteId,
      tema: dados.tema,
      cargaHoraria: dados.cargaHoraria,
      questionario: dados.questionario as unknown as Prisma.InputJsonValue | undefined,
    },
  });
  return paraDominio(evento);
}

// remove o evento; inscricao/feedback/tentativa vinculados somem juntos (onDelete: Cascade no schema)
async function remover(id: string) {
  await buscarOuFalhar(id);
  await prisma.evento.delete({ where: { id } });
}

// autoinscricao do aluno logado: checa duplicidade e vaga antes de criar
async function autoinscrever(eventoId: string, participanteId: string) {
  const evento = await prisma.evento.findUnique({ where: { id: eventoId }, include: { sala: true } });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");

  const jaInscrito = await prisma.inscricao.findUnique({
    where: { participanteId_eventoId: { participanteId, eventoId } },
  });
  if (jaInscrito) {
    throw AppError.conflito("JA_INSCRITO", "Você já está inscrito neste evento.");
  }

  const ocupadas = await prisma.inscricao.count({ where: { eventoId } });
  if (ocupadas >= evento.sala.capacidade) {
    throw AppError.conflito("EVENTO_LOTADO", "Evento sem vagas disponíveis.");
  }

  const inscricao = await prisma.inscricao.create({
    data: { id: randomUUID(), participanteId, eventoId, statusPresenca: "PENDENTE" },
  });
  return paraDominioInscricao(inscricao);
}

export const eventosService = { listar, buscarOuFalhar, criar, atualizar, remover, autoinscrever };
