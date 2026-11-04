import type { Inscricao } from "../types";
import { api } from "./api";

// autoinscricao do proprio aluno, diferente da inscricao manual que admin/secretaria fazem (InscricoesPage.tsx)
interface InscricaoAlunoService {
  inscrever(participanteId: string, eventoId: string): Promise<Inscricao>;
  cancelar(eventoId: string): Promise<void>;
}

// duplicidade, falta de vaga e regra de cancelamento sao validadas no servidor, frontend so chama
// os endpoints dedicados (o participante e sempre o do token)
export const inscricaoAlunoService: InscricaoAlunoService = {
  async inscrever(_participanteId, eventoId) {
    return api.post<Inscricao>(`/eventos/${eventoId}/inscricoes`, {});
  },
  // so cancela com presenca pendente e antes de o evento comecar (409 com o motivo, se nao der)
  async cancelar(eventoId) {
    return api.del<void>(`/eventos/${eventoId}/inscricoes`);
  },
};
