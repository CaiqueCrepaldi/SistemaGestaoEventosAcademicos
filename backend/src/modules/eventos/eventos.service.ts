import { randomUUID } from "crypto";
import type { Evento as EventoDb, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { paraDominio as paraDominioInscricao } from "../inscricoes/inscricoes.service";
import { camposInformados, registrarAuditoria } from "../../utils/auditoria";
import type { Evento, PerguntaQuestionario } from "../../types/domain";
import type { EventoInput, EventoUpdateInput } from "./eventos.schemas";

// prisma devolve horario/criadoEm como Date e questionario como Json — converte pro formato que o resto do app espera.
// "inscritos" e so a contagem (numero agregado, nao identifica ninguem): a Agenda do aluno precisa
// dela e ele nao enxerga as inscricoes dos outros pra contar sozinho
function paraDominio(evento: EventoDb & { _count?: { inscricoes: number } }): Evento {
  return {
    id: evento.id,
    titulo: evento.titulo,
    horario: evento.horario.toISOString(),
    salaId: evento.salaId,
    palestranteId: evento.palestranteId,
    tema: evento.tema,
    cargaHoraria: evento.cargaHoraria,
    questionario: evento.questionario as unknown as PerguntaQuestionario[],
    inscritos: evento._count?.inscricoes,
    criadoEm: evento.criadoEm.toISOString(),
  };
}

const COM_CONTAGEM = { _count: { select: { inscricoes: true } } } as const;

// lista todos os eventos ordenados por horario
async function listar() {
  const eventos = await prisma.evento.findMany({ orderBy: { horario: "asc" }, include: COM_CONTAGEM });
  return eventos.map(paraDominio);
}

// busca um evento pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const evento = await prisma.evento.findUnique({ where: { id }, include: COM_CONTAGEM });
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

const HORA_MS = 60 * 60 * 1000;

// RF024: um evento ocupa a sala no intervalo [horario, horario + cargaHoraria horas). Intervalo
// semiaberto: evento que termina exatamente quando o outro comeca NAO e conflito. Na edicao,
// "ignorarEventoId" tira o proprio evento da comparacao
async function validarConflitoDeSala(salaId: string, inicio: Date, cargaHoraria: number, ignorarEventoId?: string) {
  const fim = new Date(inicio.getTime() + cargaHoraria * HORA_MS);
  // so os que comecam antes do fim deste podem cruzar; o fim de cada um e conferido abaixo
  const candidatos = await prisma.evento.findMany({
    where: { salaId, horario: { lt: fim }, ...(ignorarEventoId ? { id: { not: ignorarEventoId } } : {}) },
    select: { titulo: true, horario: true, cargaHoraria: true },
    orderBy: { horario: "asc" },
  });
  const conflito = candidatos.find((outro) => outro.horario.getTime() + outro.cargaHoraria * HORA_MS > inicio.getTime());
  if (conflito) {
    throw AppError.conflito("CONFLITO_DE_SALA", `A sala já está ocupada pelo evento "${conflito.titulo}" nesse horário.`);
  }
}

// cadastra um evento novo
async function criar(dados: EventoInput, atorId: string) {
  await validarReferencias(dados);
  await validarConflitoDeSala(dados.salaId, new Date(dados.horario), dados.cargaHoraria);
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
  await registrarAuditoria(atorId, "EVENTO_CRIADO", `evento ${evento.id}`);
  return paraDominio(evento);
}

// edita um evento existente. Se sala, horario ou carga horaria vierem no patch, confere o conflito
// de sala com os valores finais (o que veio + o que ja estava gravado), ignorando o proprio evento
async function atualizar(id: string, dados: EventoUpdateInput, atorId: string) {
  const atual = await buscarOuFalhar(id);
  await validarReferencias(dados);
  if (dados.salaId !== undefined || dados.horario !== undefined || dados.cargaHoraria !== undefined) {
    await validarConflitoDeSala(
      dados.salaId ?? atual.salaId,
      new Date(dados.horario ?? atual.horario),
      dados.cargaHoraria ?? atual.cargaHoraria,
      id,
    );
  }
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
  await registrarAuditoria(atorId, "EVENTO_ATUALIZADO", `evento ${id} (campos: ${camposInformados(dados)})`);
  return paraDominio(evento);
}

// RF009/RNF010: evento com qualquer inscricao NAO e excluido — nada mais some em cascata pela API.
// A equipe cancela as inscricoes antes (so as pendentes de evento futuro podem ser canceladas, ver
// inscricoes.service.ts), entao evento que ja teve presenca/certificado fica preservado
async function remover(id: string, atorId: string) {
  await buscarOuFalhar(id);
  const inscricoes = await prisma.inscricao.count({ where: { eventoId: id } });
  if (inscricoes > 0) {
    throw AppError.conflito("EVENTO_COM_INSCRICOES", "Cancele as inscrições antes de excluir o evento.");
  }
  await prisma.evento.delete({ where: { id } });
  await registrarAuditoria(atorId, "EVENTO_REMOVIDO", `evento ${id}`);
}

// autoinscricao do aluno logado: checa conta ativa, duplicidade e vaga antes de criar
async function autoinscrever(eventoId: string, participanteId: string, atorId: string) {
  const evento = await prisma.evento.findUnique({ where: { id: eventoId }, include: { sala: true } });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");

  // o aluno inativado ja nao tem sessao (a inativacao derruba as sessoes), isto e so a segunda barreira
  const participante = await prisma.participante.findUnique({ where: { id: participanteId }, select: { ativo: true } });
  if (!participante?.ativo) throw AppError.contaInativa();

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
  await registrarAuditoria(
    atorId,
    "INSCRICAO_CRIADA",
    `inscrição ${inscricao.id} (evento ${eventoId}, participante ${participanteId}) feita pelo próprio aluno`,
  );
  return paraDominioInscricao(inscricao);
}

export const eventosService = { listar, buscarOuFalhar, criar, atualizar, remover, autoinscrever };
