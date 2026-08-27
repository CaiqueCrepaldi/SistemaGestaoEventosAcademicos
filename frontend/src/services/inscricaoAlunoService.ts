import type { Inscricao } from "../types";
import { ApiError, USE_MOCK, api } from "./api";
import { inscricaoService, salaService, sessaoService } from "./entityServices";

interface InscricaoAlunoService {
  inscrever(participanteId: string, sessaoId: string): Promise<Inscricao>;
}

const localInscricaoAlunoService: InscricaoAlunoService = {
  async inscrever(participanteId, sessaoId) {
    const [inscricoes, sessao, salas] = await Promise.all([
      inscricaoService.list(),
      sessaoService.get(sessaoId),
      salaService.list(),
    ]);

    const jaInscrito = inscricoes.some((i) => i.participanteId === participanteId && i.sessaoId === sessaoId);
    if (jaInscrito) {
      throw new ApiError(409, "Você já está inscrito nesta sessão.", "JA_INSCRITO");
    }

    const sala = sessao ? salas.find((s) => s.id === sessao.salaId) : undefined;
    const ocupadas = inscricoes.filter((i) => i.sessaoId === sessaoId).length;
    if (sala && ocupadas >= sala.capacidade) {
      throw new ApiError(409, "Sessão sem vagas disponíveis.", "SESSAO_LOTADA");
    }

    return inscricaoService.create({
      participanteId,
      sessaoId,
      statusPresenca: "PENDENTE",
      dataCheckin: null,
      usuarioId: null,
    });
  },
};

const httpInscricaoAlunoService: InscricaoAlunoService = {
  async inscrever(_participanteId, sessaoId) {
    const sessao = await sessaoService.get(sessaoId);
    if (!sessao) throw new ApiError(404, "Sessão não encontrada.", "SESSAO_NAO_ENCONTRADA");
    return api.post<Inscricao>(`/eventos/${sessao.eventoId}/sessoes/${sessaoId}/inscricoes`, {});
  },
};

export const inscricaoAlunoService: InscricaoAlunoService = USE_MOCK
  ? localInscricaoAlunoService
  : httpInscricaoAlunoService;
