import type { Inscricao } from "../types";
import { eventoService, inscricaoService, participanteService } from "./entityServices";

// Formato "enriquecido" de inscrição usado só na tela de Check-in — junta
// dados de Inscricao + Participante + Evento num objeto só, pra tabela não
// precisar fazer o cruzamento na hora de renderizar.
export interface InscricaoDetalhada {
  inscricao: Inscricao;
  participanteNome: string;
  participanteEmail: string;
  participanteRgm: string;
  eventoTitulo: string;
  eventoHorario: string;
}

// Busca por nome, e-mail ou RGM (usado no campo de busca do Check-in).
// Se o campo de busca estiver vazio, devolve lista vazia em vez de mostrar
// todo mundo de uma vez.
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

// Todas as inscrições de UM participante (é o que aparece quando o
// atendente clica num resultado de busca) — usa "Evento removido" como
// fallback pra não quebrar se o evento tiver sido excluído depois da inscrição.
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

// Marca presença: muda status pra PRESENTE, grava o horário do check-in e
// registra quem confirmou (usuarioId). É essa chamada que libera o
// certificado do participante nesse evento.
async function confirmarPresenca(inscricaoId: string, usuarioId: string): Promise<Inscricao> {
  return inscricaoService.update(inscricaoId, {
    statusPresenca: "PRESENTE",
    dataCheckin: new Date().toISOString(),
    usuarioId,
  });
}

// Marca o inscrito como ausente — não conta como presença nem libera certificado.
async function marcarAusente(inscricaoId: string): Promise<Inscricao> {
  return inscricaoService.update(inscricaoId, {
    statusPresenca: "AUSENTE",
    dataCheckin: null,
  });
}

// Lista de presença de UM evento (o contrário da função acima: aqui é "todo
// mundo inscrito nesse evento", não "todos os eventos desse participante") —
// usada tanto pra conferência manual quanto pra exportar CSV.
async function listarPresencaPorEvento(eventoId: string): Promise<InscricaoDetalhada[]> {
  const [inscricoes, participantes, evento] = await Promise.all([
    inscricaoService.list(),
    participanteService.list(),
    eventoService.get(eventoId),
  ]);

  return inscricoes
    .filter((i) => i.eventoId === eventoId)
    .map((inscricao) => {
      const participante = participantes.find((p) => p.id === inscricao.participanteId);
      return {
        inscricao,
        participanteNome: participante?.nome ?? "",
        participanteEmail: participante?.email ?? "",
        participanteRgm: participante?.rgm ?? "",
        eventoTitulo: evento?.titulo ?? "",
        eventoHorario: evento?.horario ?? "",
      };
    });
}

// Monta o conteúdo do arquivo CSV de presença inteiramente no navegador
// (sem chamar backend nenhum) — cada linha vira uma string com os campos
// entre aspas, escapando aspas internas duplicando elas (regra do formato CSV).
function gerarCsvPresenca(lista: InscricaoDetalhada[]): string {
  const cabecalho = ["Nome", "E-mail", "RGM", "Evento", "Status", "Check-in"];
  const linhas = lista.map((item) =>
    [
      item.participanteNome,
      item.participanteEmail,
      item.participanteRgm,
      item.eventoTitulo,
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
  listarPresencaPorEvento,
  gerarCsvPresenca,
};
