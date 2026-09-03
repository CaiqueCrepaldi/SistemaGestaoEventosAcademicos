import type { Inscricao } from "../types";
import { ApiError, USE_MOCK, api } from "./api";
import { eventoService, inscricaoService, salaService } from "./entityServices";

// Autoinscrição do próprio aluno num evento — diferente da inscrição manual
// que admin/secretaria fazem em nome de outra pessoa (ver InscricoesPage.tsx).
interface InscricaoAlunoService {
  inscrever(participanteId: string, eventoId: string): Promise<Inscricao>;
}

const localInscricaoAlunoService: InscricaoAlunoService = {
  async inscrever(participanteId, eventoId) {
    const [inscricoes, evento, salas] = await Promise.all([
      inscricaoService.list(),
      eventoService.get(eventoId),
      salaService.list(),
    ]);

    // Regra 1: não deixa o mesmo participante se inscrever duas vezes no
    // mesmo evento.
    const jaInscrito = inscricoes.some((i) => i.participanteId === participanteId && i.eventoId === eventoId);
    if (jaInscrito) {
      throw new ApiError(409, "Você já está inscrito neste evento.", "JA_INSCRITO");
    }

    // Regra 2: não deixa passar da capacidade da sala. Se a sala não for
    // encontrada (dado inconsistente), essa checagem é pulada em vez de
    // travar a inscrição.
    const sala = evento ? salas.find((s) => s.id === evento.salaId) : undefined;
    const ocupadas = inscricoes.filter((i) => i.eventoId === eventoId).length;
    if (sala && ocupadas >= sala.capacidade) {
      throw new ApiError(409, "Evento sem vagas disponíveis.", "EVENTO_LOTADO");
    }

    // Passou nas duas checagens: cria a inscrição já como PENDENTE (só vira
    // PRESENTE quando alguém da equipe confirmar no check-in).
    return inscricaoService.create({
      participanteId,
      eventoId,
      statusPresenca: "PENDENTE",
      dataCheckin: null,
      usuarioId: null,
    });
  },
};

// No backend real as duas validações acima (duplicidade e vaga) são feitas
// no servidor — o frontend só chama o endpoint dedicado de autoinscrição
// (ver docs/api-contract.md), sem mandar o participanteId no corpo: o
// backend usa o do token, pra impedir alguém se inscrever em nome de outro.
const httpInscricaoAlunoService: InscricaoAlunoService = {
  async inscrever(_participanteId, eventoId) {
    return api.post<Inscricao>(`/eventos/${eventoId}/inscricoes`, {});
  },
};

export const inscricaoAlunoService: InscricaoAlunoService = USE_MOCK
  ? localInscricaoAlunoService
  : httpInscricaoAlunoService;
