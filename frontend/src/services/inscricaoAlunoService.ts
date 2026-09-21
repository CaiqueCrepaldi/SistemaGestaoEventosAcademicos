import type { Inscricao } from "../types";
import { api } from "./api";

// autoinscricao do proprio aluno, diferente da inscricao manual que admin/secretaria fazem (InscricoesPage.tsx)
interface InscricaoAlunoService {
  inscrever(participanteId: string, eventoId: string): Promise<Inscricao>;
}

// duplicidade e falta de vaga sao validadas no servidor, frontend so chama o endpoint dedicado
export const inscricaoAlunoService: InscricaoAlunoService = {
  async inscrever(_participanteId, eventoId) {
    return api.post<Inscricao>(`/eventos/${eventoId}/inscricoes`, {});
  },
};
