import type { Inscricao } from "../types";
import { eventoService, inscricaoService, participanteService, sessaoService } from "./entityServices";

export interface InscricaoDetalhada {
  inscricao: Inscricao;
  participanteNome: string;
  participanteEmail: string;
  participanteRgm: string;
  sessaoTitulo: string;
  sessaoHorario: string;
  eventoNome: string;
}

async function buscarParticipantes(termo: string) {
  const participantes = await participanteService.list();
  const alvo = termo.trim().toLowerCase();
  if (!alvo) return [];
  return participantes.filter(
    (p) =>
      p.nome.toLowerCase().includes(alvo) ||
      p.email.toLowerCase().includes(alvo) ||
      p.rgm.toLowerCase().includes(alvo),
  );
}

async function listarInscricoesDoParticipante(participanteId: string): Promise<InscricaoDetalhada[]> {
  const [inscricoes, sessoes, eventos, participante] = await Promise.all([
    inscricaoService.list(),
    sessaoService.list(),
    eventoService.list(),
    participanteService.get(participanteId),
  ]);

  return inscricoes
    .filter((i) => i.participanteId === participanteId)
    .map((inscricao) => {
      const sessao = sessoes.find((s) => s.id === inscricao.sessaoId);
      const evento = eventos.find((e) => e.id === sessao?.eventoId);
      return {
        inscricao,
        participanteNome: participante?.nome ?? "",
        participanteEmail: participante?.email ?? "",
        participanteRgm: participante?.rgm ?? "",
        sessaoTitulo: sessao?.titulo ?? "Sessão removida",
        sessaoHorario: sessao?.horario ?? "",
        eventoNome: evento?.nome ?? "",
      };
    });
}

async function confirmarPresenca(inscricaoId: string, usuarioId: string): Promise<Inscricao> {
  return inscricaoService.update(inscricaoId, {
    statusPresenca: "PRESENTE",
    dataCheckin: new Date().toISOString(),
    usuarioId,
  });
}

async function marcarAusente(inscricaoId: string): Promise<Inscricao> {
  return inscricaoService.update(inscricaoId, {
    statusPresenca: "AUSENTE",
    dataCheckin: null,
  });
}

async function listarPresencaPorSessao(sessaoId: string): Promise<InscricaoDetalhada[]> {
  const [inscricoes, participantes, sessao, eventos] = await Promise.all([
    inscricaoService.list(),
    participanteService.list(),
    sessaoService.get(sessaoId),
    eventoService.list(),
  ]);
  const evento = eventos.find((e) => e.id === sessao?.eventoId);

  return inscricoes
    .filter((i) => i.sessaoId === sessaoId)
    .map((inscricao) => {
      const participante = participantes.find((p) => p.id === inscricao.participanteId);
      return {
        inscricao,
        participanteNome: participante?.nome ?? "",
        participanteEmail: participante?.email ?? "",
        participanteRgm: participante?.rgm ?? "",
        sessaoTitulo: sessao?.titulo ?? "",
        sessaoHorario: sessao?.horario ?? "",
        eventoNome: evento?.nome ?? "",
      };
    });
}

function gerarCsvPresenca(lista: InscricaoDetalhada[]): string {
  const cabecalho = ["Nome", "E-mail", "RGM", "Sessão", "Status", "Check-in"];
  const linhas = lista.map((item) =>
    [
      item.participanteNome,
      item.participanteEmail,
      item.participanteRgm,
      item.sessaoTitulo,
      item.inscricao.statusPresenca,
      item.inscricao.dataCheckin ?? "",
    ]
      .map((campo) => `"${String(campo).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [cabecalho.join(","), ...linhas].join("\n");
}

export const checkinService = {
  buscarParticipantes,
  listarInscricoesDoParticipante,
  confirmarPresenca,
  marcarAusente,
  listarPresencaPorSessao,
  gerarCsvPresenca,
};
