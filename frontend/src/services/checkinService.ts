import type { Inscricao, Participante, StatusPresenca } from "../types";
import type { SituacaoJanela } from "../utils/presenca";
import { api } from "./api";

// CHECK-IN PEDIDO PELO ALUNO: o aluno pede (POST /eventos/:id/checkin) e o professor do evento, a
// secretaria ou o administrador aprova ou recusa (/checkin). Toda regra (janela, quem decide, trava do
// questionario) fica na API; a tela so chama

export interface JanelaCheckin {
  abre: string;
  fecha: string;
  situacao: SituacaoJanela;
}

// evento com a janela do check-in aberta, na tela Check-in
export interface EventoCheckin {
  id: string;
  titulo: string;
  horario: string;
  cargaHoraria: number;
  salaNome: string;
  janela: JanelaCheckin;
  inscritos: number;
  // pedidos esperando decisao
  solicitados: number;
  presentes: number;
  recusados: number;
  semPedido: number;
}

// uma linha do painel "Check-ins"
export interface PedidoCheckin {
  inscricaoId: string;
  participanteNome: string;
  participanteRgm: string;
  participanteAtivo: boolean;
  statusPresenca: StatusPresenca;
  checkinSolicitadoEm: string | null;
  decididoEm: string | null;
  decididoPor: string | null;
  // o aluno ja respondeu o questionario: a presenca nao muda mais (409 PRESENCA_TRAVADA)
  presencaTravada: boolean;
}

export interface PainelCheckin {
  evento: { id: string; titulo: string; horario: string; cargaHoraria: number; salaNome: string };
  janela: JanelaCheckin;
  pedidos: PedidoCheckin[];
  decididos: PedidoCheckin[];
  semPedido: number;
  ausentes: number;
}

// quantos alunos a busca traz por vez (mesmo padrao do backend)
export const LIMITE_BUSCA_ALUNOS = 20;

// busca alunos (conta ALUNO) no servidor por nome, e-mail ou RGM, em ordem alfabetica, com o campo
// "ativo". Sem texto, traz os primeiros da lista. Nunca baixa todos os alunos de uma vez (usada na
// inscricao manual)
function listarAlunos(busca = ""): Promise<Participante[]> {
  const params = new URLSearchParams({ limite: String(LIMITE_BUSCA_ALUNOS) });
  if (busca.trim()) params.set("busca", busca.trim());
  return api.get<Participante[]>(`/participantes/alunos?${params.toString()}`);
}

export const checkinService = {
  listarAlunos,

  // o aluno pede o check-in do evento em que esta inscrito
  solicitar(eventoId: string): Promise<Inscricao> {
    return api.post<Inscricao>(`/eventos/${eventoId}/checkin`, {});
  },

  // eventos com a janela aberta que o perfil enxerga (o professor so os dele)
  eventosAbertos(): Promise<EventoCheckin[]> {
    return api.get<EventoCheckin[]>("/checkin/eventos");
  },

  painel(eventoId: string): Promise<PainelCheckin> {
    return api.get<PainelCheckin>(`/checkin/eventos/${eventoId}`);
  },

  // aprovar tambem reverte uma recusa; recusar tambem reverte uma aprovacao (dentro da janela)
  aprovar(inscricaoId: string): Promise<Inscricao> {
    return api.post<Inscricao>(`/checkin/inscricoes/${inscricaoId}/aprovar`, {});
  },

  recusar(inscricaoId: string): Promise<Inscricao> {
    return api.post<Inscricao>(`/checkin/inscricoes/${inscricaoId}/recusar`, {});
  },

  aprovarTodos(eventoId: string): Promise<{ aprovados: number }> {
    return api.post<{ aprovados: number }>(`/checkin/eventos/${eventoId}/aprovar-todos`, {});
  },
};
