import type { Inscricao, Participante } from "../types";
import { api } from "./api";
import { eventoService, inscricaoService } from "./entityServices";
import { questionarioService } from "./questionarioService";

// formato "achatado" usado so na tela de checkin
export interface InscricaoDetalhada {
  inscricao: Inscricao;
  eventoTitulo: string;
  eventoHorario: string;
  // o aluno ja respondeu o questionario desse evento: a presenca nao muda mais (o backend responde 409)
  presencaTravada: boolean;
  // o check-in so abre 1 hora antes do inicio do evento (mesma regra do backend, que responde 409 antes disso)
  checkinAberto: boolean;
}

// mesma antecedencia do backend (inscricoes.service.ts, ANTECEDENCIA_CHECKIN_MS)
export const ANTECEDENCIA_CHECKIN_MS = 60 * 60 * 1000;

export function checkinAberto(eventoHorario: string): boolean {
  return !eventoHorario || new Date(eventoHorario).getTime() - ANTECEDENCIA_CHECKIN_MS <= Date.now();
}

// quantos alunos a busca traz por vez (mesmo padrao do backend)
export const LIMITE_BUSCA_ALUNOS = 20;

// busca alunos (conta ALUNO) no servidor por nome, e-mail ou RGM, em ordem alfabetica, com o campo
// "ativo". Sem texto, traz os primeiros da lista. Nunca baixa todos os alunos de uma vez
function listarAlunos(busca = ""): Promise<Participante[]> {
  const params = new URLSearchParams({ limite: String(LIMITE_BUSCA_ALUNOS) });
  if (busca.trim()) params.set("busca", busca.trim());
  return api.get<Participante[]>(`/participantes/alunos?${params.toString()}`);
}

// as inscricoes de UM participante (so as dele, filtradas no servidor), com o titulo do evento ja
// junto e a marca de presenca travada (eventos em que o aluno ja respondeu o questionario)
async function listarInscricoesDoParticipante(participanteId: string): Promise<InscricaoDetalhada[]> {
  // nome/RGM do aluno a tela ja tem (veio da busca); aqui so as inscricoes. O professor recebe so as dos
  // eventos dele (a API filtra) e nao acessa GET /participantes/:id
  const [inscricoes, eventos, tentativas] = await Promise.all([
    api.get<Inscricao[]>(`/inscricoes?participanteId=${encodeURIComponent(participanteId)}`),
    eventoService.list(),
    questionarioService.listarTentativasDoParticipante(participanteId),
  ]);
  const eventosRespondidos = new Set(tentativas.map((t) => t.eventoId));

  return inscricoes
    .filter((i) => i.participanteId === participanteId)
    .map((inscricao) => {
      const evento = eventos.find((e) => e.id === inscricao.eventoId);
      return {
        inscricao,
        eventoTitulo: evento?.titulo ?? "Evento removido",
        eventoHorario: evento?.horario ?? "",
        presencaTravada: eventosRespondidos.has(inscricao.eventoId),
        checkinAberto: checkinAberto(evento?.horario ?? ""),
      };
    });
}

// marca presenca, grava horario do checkin e quem confirmou, libera o certificado
async function confirmarPresenca(inscricaoId: string, usuarioId: string): Promise<Inscricao> {
  return inscricaoService.update(inscricaoId, {
    statusPresenca: "PRESENTE",
    dataCheckin: new Date().toISOString(),
    usuarioId,
  });
}

// marca ausente, nao conta como presenca nem libera certificado
async function marcarAusente(inscricaoId: string): Promise<Inscricao> {
  return inscricaoService.update(inscricaoId, {
    statusPresenca: "AUSENTE",
    dataCheckin: null,
  });
}

export const checkinService = {
  listarAlunos,
  listarInscricoesDoParticipante,
  confirmarPresenca,
  marcarAusente,
};
