import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { AppError } from "../errors/AppError";
import type { Perfil } from "../types/domain";

// quem esta fazendo a chamada (vem do token)
export interface Ator {
  id: string;
  perfil: Perfil;
  participanteId?: string | null;
}

export function ehEquipe(perfil: Perfil): boolean {
  return perfil === "ADMINISTRADOR" || perfil === "SECRETARIA";
}

// REGRA UNICA de quais eventos cada perfil enxerga — usada em eventos, inscricoes, check-in,
// certificados, notas, avaliacoes e Dashboard:
// - equipe (administrador e secretaria): todos;
// - professor: so os que ele criou (qualquer situacao);
// - aluno: so os APROVADOS (pendente/recusado nao aparece pra ele em lugar nenhum)
export function eventosVisiveis(ator: Ator): Prisma.EventoWhereInput {
  if (ator.perfil === "PROFESSOR") return { criadoPorId: ator.id };
  if (ator.perfil === "ALUNO") return { situacao: "APROVADO" };
  return {};
}

// o mesmo, para os numeros do Dashboard: so eventos APROVADOS entram na conta (o professor ve so os dele)
export function eventosDoDashboard(ator: Ator): Prisma.EventoWhereInput {
  return { ...eventosVisiveis(ator), situacao: "APROVADO" };
}

// palestrantes visiveis: equipe todos; aluno so os APROVADOS; professor os APROVADOS e os que ele criou
// (ele pode escolher um palestrante seu ainda PENDENTE no proprio evento)
export function palestrantesVisiveis(ator: Ator): Prisma.PalestranteWhereInput {
  if (ator.perfil === "ALUNO") return { situacao: "APROVADO" };
  if (ator.perfil === "PROFESSOR") return { OR: [{ situacao: "APROVADO" }, { criadoPorId: ator.id }] };
  return {};
}

// confere que o evento existe E e visivel pra quem chama; senao 404 (o professor nao descobre que o
// evento de outro existe). Devolve o evento cru do banco
export async function eventoDoAtorOuFalhar(ator: Ator, eventoId: string) {
  const evento = await prisma.evento.findFirst({ where: { id: eventoId, ...eventosVisiveis(ator) } });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  return evento;
}

// o mesmo para uma inscricao: o evento dela precisa ser visivel pra quem chama
export async function inscricaoDoAtorOuFalhar(ator: Ator, inscricaoId: string) {
  const inscricao = await prisma.inscricao.findFirst({ where: { id: inscricaoId, evento: eventosVisiveis(ator) } });
  if (!inscricao) throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Inscrição não encontrada.");
  return inscricao;
}

// o professor so age sobre as inscricoes dos eventos dele (o responsavel e quem criou o evento: criadoPorId). Em
// evento de outro, 403 com a mensagem de cada acao. A equipe age em qualquer evento; o aluno tem rotas proprias
export function garantirEventoDoProfessor(ator: Ator, evento: { criadoPorId: string | null }, mensagem: string) {
  if (ator.perfil === "PROFESSOR" && evento.criadoPorId !== ator.id) {
    throw new AppError(403, "EVENTO_DE_OUTRO_PROFESSOR", mensagem);
  }
}

// professor filtrando uma lista de inscricoes por um evento que nao e dele: 403 (evento inexistente: lista vazia)
export async function garantirFiltroDeEventoDoProfessor(ator: Ator, eventoId: string | undefined) {
  if (ator.perfil !== "PROFESSOR" || !eventoId) return;
  const evento = await prisma.evento.findUnique({ where: { id: eventoId }, select: { criadoPorId: true } });
  if (evento) garantirEventoDoProfessor(ator, evento, "Você só pode ver as inscrições dos seus próprios eventos.");
}

// encerrado = horario + carga horaria (em horas) ja passou
export function eventoEncerrado(evento: { horario: Date; cargaHoraria: number }, agora = new Date()): boolean {
  return evento.horario.getTime() + evento.cargaHoraria * 3600 * 1000 <= agora.getTime();
}
