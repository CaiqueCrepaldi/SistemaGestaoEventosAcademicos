import { eventoService, feedbackService, inscricaoService, salaService } from "./entityServices";

// Números exibidos nos cartões do topo do Dashboard.
export interface EstatisticasGerais {
  totalEventos: number;
  totalInscricoes: number;
  totalPresentes: number;
  taxaPresenca: number;
  ocupacaoMedia: number;
}

// Calcula tudo isso no próprio navegador, cruzando as listas já carregadas
// — não existe um endpoint de estatísticas pronto no backend (ver "Lacunas
// conhecidas" em docs/api-contract.md).
async function estatisticasGerais(): Promise<EstatisticasGerais> {
  const [eventos, inscricoes, salas] = await Promise.all([
    eventoService.list(),
    inscricaoService.list(),
    salaService.list(),
  ]);

  const totalPresentes = inscricoes.filter((i) => i.statusPresenca === "PRESENTE").length;
  // Taxa de presença = presentes / total de inscrições. Se não tiver
  // nenhuma inscrição ainda, evita dividir por zero e já cai em 0%.
  const taxaPresenca = inscricoes.length > 0 ? (totalPresentes / inscricoes.length) * 100 : 0;

  // Ocupação de cada evento = inscritos / capacidade da sala (limitado a
  // 100%, pra não passar disso mesmo que a inscrição tenha sido feita "no
  // limite"). A ocupação média é a média simples entre todos os eventos.
  const ocupacoes = eventos.map((evento) => {
    const sala = salas.find((s) => s.id === evento.salaId);
    const inscritosNoEvento = inscricoes.filter((i) => i.eventoId === evento.id).length;
    if (!sala || sala.capacidade === 0) return 0;
    return Math.min(inscritosNoEvento / sala.capacidade, 1) * 100;
  });
  const ocupacaoMedia = ocupacoes.length > 0 ? ocupacoes.reduce((a, b) => a + b, 0) / ocupacoes.length : 0;

  return {
    totalEventos: eventos.length,
    totalInscricoes: inscricoes.length,
    totalPresentes,
    taxaPresenca,
    ocupacaoMedia,
  };
}

// Cada evento já com nome da sala e contagem de inscritos prontos — é o
// formato que a tela de Agenda usa pra listar/filtrar/agrupar por dia.
export interface EventoAgenda {
  id: string;
  titulo: string;
  tema: string;
  horario: string;
  salaId: string;
  salaNome: string;
  inscritos: number;
  capacidade: number;
}

// Monta a agenda com TODOS os eventos cadastrados, já ordenados por
// horário (mais cedo primeiro) — os filtros (dia, sala, tema etc.) são
// aplicados depois, na própria tela.
async function agendaGeral(): Promise<EventoAgenda[]> {
  const [eventos, salas, inscricoes] = await Promise.all([
    eventoService.list(),
    salaService.list(),
    inscricaoService.list(),
  ]);

  return eventos
    .map((evento) => {
      const sala = salas.find((s) => s.id === evento.salaId);
      return {
        id: evento.id,
        titulo: evento.titulo,
        tema: evento.tema ?? "",
        horario: evento.horario,
        salaId: evento.salaId,
        salaNome: sala?.nome ?? "—",
        inscritos: inscricoes.filter((i) => i.eventoId === evento.id).length,
        capacidade: sala?.capacidade ?? 0,
      };
    })
    .sort((a, b) => a.horario.localeCompare(b.horario));
}

// Média das notas de feedback de um evento específico. Devolve null (em
// vez de 0) quando não tem nenhum feedback ainda, pra tela poder mostrar
// "—" em vez de uma média falsa de zero.
async function mediaFeedbackPorEvento(eventoId: string): Promise<number | null> {
  const feedbacks = (await feedbackService.list()).filter((f) => f.eventoId === eventoId);
  if (feedbacks.length === 0) return null;
  return feedbacks.reduce((acc, f) => acc + f.nota, 0) / feedbacks.length;
}

export const relatorioService = {
  estatisticasGerais,
  agendaGeral,
  mediaFeedbackPorEvento,
};
