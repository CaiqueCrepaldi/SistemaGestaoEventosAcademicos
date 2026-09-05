import type { Inscricao } from "../types";
import { ApiError, USE_MOCK, api } from "./api";
import { eventoService, inscricaoService, salaService } from "./entityServices";

// autoinscricao do proprio aluno, diferente da inscricao manual que admin/secretaria fazem (InscricoesPage.tsx)
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

    const jaInscrito = inscricoes.some((i) => i.participanteId === participanteId && i.eventoId === eventoId);
    if (jaInscrito) {
      throw new ApiError(409, "Você já está inscrito neste evento.", "JA_INSCRITO");
    }

    const sala = evento ? salas.find((s) => s.id === evento.salaId) : undefined;
    const ocupadas = inscricoes.filter((i) => i.eventoId === eventoId).length;
    if (sala && ocupadas >= sala.capacidade) {
      throw new ApiError(409, "Evento sem vagas disponíveis.", "EVENTO_LOTADO");
    }

    return inscricaoService.create({
      participanteId,
      eventoId,
      statusPresenca: "PENDENTE",
      dataCheckin: null,
      usuarioId: null,
    });
  },
};

// no backend real as duas validacoes acima rodam no servidor, frontend so chama o endpoint dedicado
const httpInscricaoAlunoService: InscricaoAlunoService = {
  async inscrever(_participanteId, eventoId) {
    return api.post<Inscricao>(`/eventos/${eventoId}/inscricoes`, {});
  },
};

export const inscricaoAlunoService: InscricaoAlunoService = USE_MOCK
  ? localInscricaoAlunoService
  : httpInscricaoAlunoService;
