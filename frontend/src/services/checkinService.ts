import type { Inscricao, Participante } from "../types";
import { api } from "./api";
import { eventoService, inscricaoService, participanteService } from "./entityServices";

// formato "achatado" usado so na tela de checkin
export interface InscricaoDetalhada {
  inscricao: Inscricao;
  participanteNome: string;
  participanteEmail: string;
  participanteRgm: string;
  eventoTitulo: string;
  eventoHorario: string;
}

// todos os alunos cadastrados (participantes com conta ALUNO), ja em ordem alfabetica, com o
// campo "ativo". nome/e-mail/rgm ficam cifrados no banco, entao quem filtra por texto eh a tela,
// em cima dessa lista ja decifrada pelo backend
function listarAlunos(): Promise<Participante[]> {
  return api.get<Participante[]>("/participantes/alunos");
}

// todas as inscricoes de UM participante, com o titulo do evento ja junto
async function listarInscricoesDoParticipante(participanteId: string): Promise<InscricaoDetalhada[]> {
  const [inscricoes, eventos, participante] = await Promise.all([
    inscricaoService.list(),
    eventoService.list(),
    participanteService.get(participanteId),
  ]);

  return inscricoes
    .filter((i) => i.participanteId === participanteId)
    .map((inscricao) => {
      const evento = eventos.find((e) => e.id === inscricao.eventoId);
      return {
        inscricao,
        participanteNome: participante?.nome ?? "",
        participanteEmail: participante?.email ?? "",
        participanteRgm: participante?.rgm ?? "",
        eventoTitulo: evento?.titulo ?? "Evento removido",
        eventoHorario: evento?.horario ?? "",
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
