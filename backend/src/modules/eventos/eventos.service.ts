import { randomUUID } from "crypto";
import { eventosStore, feedbacksStore, inscricoesStore, palestrantesStore, salasStore, tentativasStore } from "../../db/store";
import { AppError } from "../../errors/AppError";
import type { EventoInput, EventoUpdateInput } from "./eventos.schemas";

async function listar() {
  return [...eventosStore.listar()].sort((a, b) => a.horario.localeCompare(b.horario));
}

async function buscarOuFalhar(id: string) {
  const evento = eventosStore.buscarPorId(id);
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  return evento;
}

// Confere se sala/palestrante informados realmente existem antes de
// criar/editar um evento. Sem um banco por trás garantindo isso via
// foreign key, essa validação manual é a única linha de defesa contra um
// evento apontando pra uma sala/palestrante que não existe.
function validarReferencias(dados: Partial<Pick<EventoInput, "salaId" | "palestranteId">>) {
  const erros: { campo: string; mensagem: string }[] = [];

  if (dados.salaId && !salasStore.buscarPorId(dados.salaId)) {
    erros.push({ campo: "salaId", mensagem: "Sala informada não existe." });
  }
  if (dados.palestranteId && !palestrantesStore.buscarPorId(dados.palestranteId)) {
    erros.push({ campo: "palestranteId", mensagem: "Palestrante informado não existe." });
  }

  if (erros.length > 0) {
    throw AppError.validacao("Dados inválidos.", erros);
  }
}

async function criar(dados: EventoInput) {
  validarReferencias(dados);
  return eventosStore.criar({
    id: randomUUID(),
    ...dados,
    criadoEm: new Date().toISOString(),
  });
}

async function atualizar(id: string, dados: EventoUpdateInput) {
  await buscarOuFalhar(id);
  validarReferencias(dados);
  return eventosStore.atualizar(id, dados)!;
}

async function remover(id: string) {
  await buscarOuFalhar(id);
  // Sem banco de dados fazendo isso via ON DELETE CASCADE, precisamos
  // limpar à mão inscrições e feedbacks desse evento antes de excluí-lo —
  // senão eles ficariam "órfãos", apontando pra um eventoId inexistente.
  for (const inscricao of inscricoesStore.listarComFiltro((i) => i.eventoId === id)) {
    inscricoesStore.remover(inscricao.id);
  }
  for (const feedback of feedbacksStore.listarComFiltro((f) => f.eventoId === id)) {
    feedbacksStore.remover(feedback.id);
  }
  for (const tentativa of tentativasStore.listarComFiltro((t) => t.eventoId === id)) {
    tentativasStore.remover(tentativa.id);
  }
  eventosStore.remover(id);
}

// Autoinscrição do aluno (POST /api/eventos/{eventoId}/inscricoes). As
// duas regras de negócio (não duplicar, respeitar capacidade da sala) são
// checadas em sequência síncrona — sem `await` entre a checagem e a
// escrita, então não tem brecha pra duas requisições simultâneas do mesmo
// aluno criarem duas inscrições (o event loop do Node não interrompe um
// bloco síncrono no meio).
async function autoinscrever(eventoId: string, participanteId: string) {
  const evento = eventosStore.buscarPorId(eventoId);
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");

  const jaInscrito = inscricoesStore.buscarUm((i) => i.participanteId === participanteId && i.eventoId === eventoId);
  if (jaInscrito) {
    throw AppError.conflito("JA_INSCRITO", "Você já está inscrito neste evento.");
  }

  const sala = salasStore.buscarPorId(evento.salaId);
  const ocupadas = inscricoesStore.contar((i) => i.eventoId === eventoId);
  if (sala && ocupadas >= sala.capacidade) {
    throw AppError.conflito("EVENTO_LOTADO", "Evento sem vagas disponíveis.");
  }

  return inscricoesStore.criar({
    id: randomUUID(),
    participanteId,
    eventoId,
    statusPresenca: "PENDENTE",
    dataCheckin: null,
    usuarioId: null,
    dataInscricao: new Date().toISOString(),
  });
}

export const eventosService = { listar, buscarOuFalhar, criar, atualizar, remover, autoinscrever };
