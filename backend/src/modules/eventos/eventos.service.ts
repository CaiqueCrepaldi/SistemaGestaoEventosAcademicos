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

// cadastra um evento novo
async function criar(dados: EventoInput, atorId: string) {
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
  await registrarAuditoria(atorId, "EVENTO_CRIADO", `evento ${evento.id}`);
  return paraDominio(evento);
}

// edita um evento existente
async function atualizar(id: string, dados: EventoUpdateInput, atorId: string) {
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
  await registrarAuditoria(atorId, "EVENTO_ATUALIZADO", `evento ${id} (campos: ${camposInformados(dados)})`);
  return paraDominio(evento);
}

// remove o evento; inscricao/feedback/tentativa vinculados somem juntos (onDelete: Cascade no schema),
// entao conta o que vai junto antes pra trilha mostrar o tamanho real do estrago
async function remover(id: string, atorId: string) {
  await buscarOuFalhar(id);
  const [inscricoes, feedbacks, tentativas] = await Promise.all([
    prisma.inscricao.count({ where: { eventoId: id } }),
    prisma.feedback.count({ where: { eventoId: id } }),
    prisma.tentativaQuestionario.count({ where: { eventoId: id } }),
  ]);
  await prisma.evento.delete({ where: { id } });
  await registrarAuditoria(
    atorId,
    "EVENTO_REMOVIDO",
    `evento ${id} (removidos junto: ${inscricoes} inscrições, ${feedbacks} feedbacks, ${tentativas} tentativas de questionário)`,
  );
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
