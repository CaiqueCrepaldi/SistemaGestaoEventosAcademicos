import { randomUUID } from "crypto";
import { Prisma, type Evento as EventoDb, type PropostaAlteracao as PropostaDb, type SituacaoAprovacao } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { emailService, type MudancaEvento } from "../email/email.service";
import { enviarConfirmacaoPorEmail, garantirSemConflitoDeHorario, paraDominio as paraDominioInscricao } from "../inscricoes/inscricoes.service";
import { COM_CONTA_DO_ALUNO, paraDominio as participanteParaDominio } from "../participantes/participantes.service";
import { listarHistorico, registrarHistorico } from "../aprovacoes/aprovacoes.service";
import { camposInformados, registrarAuditoria } from "../../utils/auditoria";
import { rotuloSala } from "../../utils/salas";
import { env } from "../../config/env";
import { ehEquipe, eventoDoAtorOuFalhar, eventoEncerrado, eventosVisiveis, garantirEventoNaoCancelado, palestrantesVisiveis, type Ator } from "../../utils/escopo";
import type { Evento, PerguntaQuestionario, PropostaEvento } from "../../types/domain";
import type { BuscaEventos, EventoInput, EventoUpdateInput, IntervaloEventos, PropostaEventoInput } from "./eventos.schemas";

// o que acompanha o evento nas leituras: contagem de inscricoes (numero agregado, nao identifica ninguem: a
// tela Eventos do aluno precisa dela), contagem de tentativas do questionario (trava o questionario) e a
// proposta de alteracao aberta (pendente ou recusada), se houver, e o nome de quem cancelou
const COM_EXTRAS = Prisma.validator<Prisma.EventoInclude>()({
  _count: { select: { inscricoes: true, tentativas: true } },
  propostas: { where: { situacao: { in: ["PENDENTE", "RECUSADO"] } }, orderBy: { criadoEm: "desc" }, take: 1 },
  canceladoPor: { select: { nome: true } },
});

type EventoComExtras = EventoDb & {
  _count?: { inscricoes: number; tentativas?: number };
  propostas?: PropostaDb[];
  canceladoPor?: { nome: string } | null;
};

function propostaParaDominio(proposta: PropostaDb): PropostaEvento {
  return {
    id: proposta.id,
    situacao: proposta.situacao,
    salaId: proposta.novaSalaId!,
    horario: proposta.novoHorario!.toISOString(),
    cargaHoraria: proposta.novaCargaHoraria!,
    palestranteId: proposta.novoPalestranteId!,
    motivoRecusa: proposta.motivoRecusa,
    criadoEm: proposta.criadoEm.toISOString(),
  };
}

// prisma devolve horario/criadoEm como Date e questionario como Json — converte pro formato que o resto do app espera
function paraDominio(evento: EventoComExtras): Evento {
  const proposta = evento.propostas?.[0];
  return {
    id: evento.id,
    titulo: evento.titulo,
    horario: evento.horario.toISOString(),
    salaId: evento.salaId,
    palestranteId: evento.palestranteId,
    tema: evento.tema,
    cargaHoraria: evento.cargaHoraria,
    questionario: evento.questionario as unknown as PerguntaQuestionario[],
    inscritos: evento._count?.inscricoes,
    situacao: evento.situacao,
    motivoRecusa: evento.motivoRecusa,
    criadoPorId: evento.criadoPorId,
    criadoEm: evento.criadoEm.toISOString(),
    questionarioTravado: (evento._count?.tentativas ?? 0) > 0,
    proposta: proposta ? propostaParaDominio(proposta) : null,
    canceladoEm: evento.canceladoEm?.toISOString() ?? null,
    motivoCancelamento: evento.motivoCancelamento,
    canceladoPorNome: evento.canceladoPor?.nome ?? null,
  };
}

// le de novo o evento com os extras (depois de gravar)
async function recarregar(id: string) {
  return paraDominio(await prisma.evento.findUniqueOrThrow({ where: { id }, include: COM_EXTRAS }));
}

function erroEncerrado(): AppError {
  return AppError.conflito("EVENTO_ENCERRADO", "Este evento já foi encerrado e não pode mais ser editado nem excluído.");
}

// filtro da tela por situacao. "Aguardando aprovacao" (PENDENTE) traz tambem os eventos aprovados com proposta
// de alteracao pendente; "Recusados", os que tem proposta recusada. Pro aluno so existe evento aprovado
function filtroSituacao(ator: Ator, situacao?: SituacaoAprovacao): Prisma.EventoWhereInput {
  if (!situacao) return {};
  if (situacao === "APROVADO" || ator.perfil === "ALUNO") return { situacao };
  return { OR: [{ situacao }, { propostas: { some: { situacao } } }] };
}

// lista os eventos que quem chama pode ver (ver utils/escopo.ts), ordenados por horario
async function listar(ator: Ator, situacao?: SituacaoAprovacao) {
  const eventos = await prisma.evento.findMany({
    where: { AND: [eventosVisiveis(ator), filtroSituacao(ator, situacao)] },
    orderBy: { horario: "asc" },
    include: COM_EXTRAS,
  });
  return eventos.map(paraDominio);
}

// quantos pedidos de check-in esperam aprovacao em cada evento (marcacao "N check-ins" do calendario)
async function comCheckinsPendentes(eventos: Evento[]): Promise<Evento[]> {
  if (eventos.length === 0) return eventos;
  const grupos = await prisma.inscricao.groupBy({
    by: ["eventoId"],
    where: { eventoId: { in: eventos.map((e) => e.id) }, statusPresenca: "SOLICITADO" },
    _count: { _all: true },
  });
  const porEvento = new Map(grupos.map((g) => [g.eventoId, g._count._all]));
  return eventos.map((evento) => ({ ...evento, checkinsPendentes: porEvento.get(evento.id) ?? 0 }));
}

// o que o professor ve de um evento que nao e dele: so que a sala esta ocupada, e quando
export interface SalaOcupada {
  salaId: string;
  salaNome: string;
  inicio: string;
  fim: string;
}

function ocupacao(salaId: string, salaNome: string, inicio: Date, cargaHoraria: number): SalaOcupada {
  return { salaId, salaNome, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + cargaHoraria * HORA_MS).toISOString() };
}

// CALENDARIO (equipe e professor): os eventos visiveis que comecam em [de, ate), com o filtro de situacao
// opcional. A equipe ve todos completos. O professor ve os dele completos e, dos outros (de outro
// professor ou da equipe), so a sala e o horario — os que reservam a sala: evento APROVADO ou PENDENTE e nao
// cancelado (o cancelado libera a sala) e proposta de alteracao PENDENTE —, sem titulo, palestrante, inscritos nem id. A regra fica aqui, na API:
// a tela nunca recebe os detalhes do evento de outro
async function calendario(ator: Ator, intervalo: IntervaloEventos) {
  const noIntervalo = { gte: intervalo.de, lt: intervalo.ate };
  const eventos = await prisma.evento.findMany({
    where: { AND: [eventosVisiveis(ator), filtroSituacao(ator, intervalo.situacao), { horario: noIntervalo }] },
    orderBy: { horario: "asc" },
    include: COM_EXTRAS,
  });
  const completos = await comCheckinsPendentes(eventos.map(paraDominio));
  if (ator.perfil !== "PROFESSOR") return { eventos: completos, salasOcupadas: [] as SalaOcupada[] };

  // "nao e dele" inclui o evento sem professor (da equipe): criadoPorId nulo nao entra num "diferente de"
  const deOutros: Prisma.EventoWhereInput = { OR: [{ criadoPorId: null }, { criadoPorId: { not: ator.id } }] };
  const [outros, propostas] = await Promise.all([
    prisma.evento.findMany({
      where: { AND: [deOutros, { situacao: { in: ["APROVADO", "PENDENTE"] }, canceladoEm: null, horario: noIntervalo }] },
      select: { horario: true, cargaHoraria: true, sala: { select: { id: true, nome: true, tipo: true } } },
    }),
    prisma.propostaAlteracao.findMany({
      where: { tipo: "EVENTO", situacao: "PENDENTE", novoHorario: noIntervalo, evento: deOutros },
      select: { novaSalaId: true, novoHorario: true, novaCargaHoraria: true },
    }),
  ]);
  const salasDasPropostas = await prisma.sala.findMany({
    where: { id: { in: propostas.map((p) => p.novaSalaId!).filter(Boolean) } },
    select: { id: true, nome: true, tipo: true },
  });
  const nomeDaSala = new Map(salasDasPropostas.map((s) => [s.id, rotuloSala(s)]));
  const salasOcupadas = [
    ...outros.map((e) => ocupacao(e.sala.id, rotuloSala(e.sala), e.horario, e.cargaHoraria)),
    ...propostas
      .filter((p) => p.novaSalaId && p.novoHorario && p.novaCargaHoraria)
      .map((p) => ocupacao(p.novaSalaId!, nomeDaSala.get(p.novaSalaId!) ?? "Sala", p.novoHorario!, p.novaCargaHoraria!)),
  ].sort((a, b) => a.inicio.localeCompare(b.inicio));
  return { eventos: completos, salasOcupadas };
}

// BUSCA do calendario: titulo, tema, palestrante ou sala (e/ou a situacao), so entre os eventos visiveis
// (o professor: os dele), de qualquer mes, mais recentes primeiro e com limite — nunca a base inteira
async function buscar(ator: Ator, busca: BuscaEventos) {
  const texto: Prisma.EventoWhereInput = busca.q
    ? {
        OR: [
          { titulo: { contains: busca.q } },
          { tema: { contains: busca.q } },
          { palestrante: { nome: { contains: busca.q } } },
          { sala: { nome: { contains: busca.q } } },
        ],
      }
    : {};
  const encontrados = await prisma.evento.findMany({
    where: { AND: [eventosVisiveis(ator), filtroSituacao(ator, busca.situacao), texto] },
    orderBy: [{ horario: "desc" }, { id: "asc" }],
    // um a mais so pra saber se ficou alguem de fora
    take: busca.limite + 1,
    include: COM_EXTRAS,
  });
  const itens = await comCheckinsPendentes(encontrados.slice(0, busca.limite).map(paraDominio));
  return { itens, limite: busca.limite, temMais: encontrados.length > busca.limite };
}

// busca um evento visivel pra quem chama; 404 se nao existir ou nao for dele (professor) / nao estiver
// aprovado (aluno)
async function buscarOuFalhar(id: string, ator: Ator) {
  const evento = await prisma.evento.findFirst({ where: { id, ...eventosVisiveis(ator) }, include: COM_EXTRAS });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  return paraDominio(evento);
}

// confere se sala/palestrante informados existem. O palestrante tambem precisa estar disponivel pra quem
// cria: a equipe so usa palestrante APROVADO (o evento dela ja nasce aprovado e o aluno nunca ve palestrante
// que nao esta aprovado); o professor pode escolher um aprovado ou um dele mesmo, ainda pendente
async function validarReferencias(dados: Partial<Pick<EventoInput, "salaId" | "palestranteId">>, ator: Ator) {
  const erros: { campo: string; mensagem: string }[] = [];

  if (dados.salaId && !(await prisma.sala.findUnique({ where: { id: dados.salaId } }))) {
    erros.push({ campo: "salaId", mensagem: "Sala informada não existe." });
  }
  if (dados.palestranteId) {
    const palestrante = await prisma.palestrante.findFirst({ where: { id: dados.palestranteId, ...palestrantesVisiveis(ator) } });
    if (!palestrante) {
      erros.push({ campo: "palestranteId", mensagem: "Palestrante informado não existe." });
    } else if (ehEquipe(ator.perfil) && palestrante.situacao !== "APROVADO") {
      erros.push({ campo: "palestranteId", mensagem: "Este palestrante ainda não foi aprovado. Aprove-o antes de usá-lo num evento." });
    }
  }

  if (erros.length > 0) {
    throw AppError.validacao("Dados inválidos.", erros);
  }
}

const HORA_MS = 60 * 60 * 1000;

// RF024: um evento ocupa a sala no intervalo [horario, horario + cargaHoraria horas). Intervalo
// semiaberto: evento que termina exatamente quando o outro comeca NAO e conflito. Evento PENDENTE ja
// reserva a sala; RECUSADO e CANCELADO nao (recusar ou cancelar libera a sala na hora). A proposta de alteracao PENDENTE tambem
// reserva a sala/horario propostos (o evento continua segurando a sala atual ate a aprovacao).
// "ignorarEventoId" tira o proprio evento e a proposta dele
async function validarConflitoDeSala(salaId: string, inicio: Date, cargaHoraria: number, ignorarEventoId?: string) {
  const fim = new Date(inicio.getTime() + cargaHoraria * HORA_MS);
  // so os que comecam antes do fim deste podem cruzar; o fim de cada um e conferido abaixo
  const [candidatos, propostas] = await Promise.all([
    prisma.evento.findMany({
      where: {
        salaId,
        horario: { lt: fim },
        situacao: { in: ["PENDENTE", "APROVADO"] },
        canceladoEm: null,
        ...(ignorarEventoId ? { id: { not: ignorarEventoId } } : {}),
      },
      select: { titulo: true, horario: true, cargaHoraria: true },
      orderBy: { horario: "asc" },
    }),
    prisma.propostaAlteracao.findMany({
      where: {
        tipo: "EVENTO",
        situacao: "PENDENTE",
        novaSalaId: salaId,
        novoHorario: { lt: fim },
        evento: { canceladoEm: null },
        ...(ignorarEventoId ? { eventoId: { not: ignorarEventoId } } : {}),
      },
      select: { novoHorario: true, novaCargaHoraria: true, evento: { select: { titulo: true } } },
    }),
  ]);
  const conflito = candidatos.find((outro) => outro.horario.getTime() + outro.cargaHoraria * HORA_MS > inicio.getTime());
  if (conflito) {
    throw AppError.conflito("CONFLITO_DE_SALA", `A sala já está ocupada pelo evento "${conflito.titulo}" nesse horário.`);
  }
  const reservada = propostas.find((p) => p.novoHorario!.getTime() + p.novaCargaHoraria! * HORA_MS > inicio.getTime());
  if (reservada) {
    throw AppError.conflito(
      "CONFLITO_DE_SALA",
      `A sala já está reservada nesse horário por uma proposta de alteração do evento "${reservada.evento?.titulo ?? ""}", aguardando aprovação.`,
    );
  }
}

// a sala nova precisa caber quem ja esta inscrito
async function validarCapacidade(salaId: string, eventoId: string) {
  const [sala, inscritos] = await Promise.all([
    prisma.sala.findUnique({ where: { id: salaId }, select: { nome: true, tipo: true, capacidade: true } }),
    prisma.inscricao.count({ where: { eventoId } }),
  ]);
  if (sala && inscritos > sala.capacidade) {
    throw AppError.conflito(
      "SALA_SEM_CAPACIDADE",
      `A sala ${rotuloSala(sala)} comporta ${sala.capacidade} pessoa(s), mas o evento já tem ${inscritos} inscrito(s). Escolha uma sala maior.`,
    );
  }
}

// nenhum perfil cria evento (nem muda o horario de um) para uma data e horario que ja passaram
function garantirHorarioNoFuturo(horario: Date) {
  if (horario.getTime() <= Date.now()) {
    throw AppError.validacao("Dados inválidos.", [{ campo: "horario", mensagem: "A data e o horário do evento precisam ser no futuro." }]);
  }
}

// cadastra um evento novo. Da equipe ja nasce APROVADO; do professor nasce PENDENTE (aguarda a equipe)
async function criar(dados: EventoInput, ator: Ator) {
  garantirHorarioNoFuturo(new Date(dados.horario));
  await validarReferencias(dados, ator);
  await validarConflitoDeSala(dados.salaId, new Date(dados.horario), dados.cargaHoraria);
  const doProfessor = ator.perfil === "PROFESSOR";
  const evento = await prisma.evento.create({
    data: {
      id: randomUUID(),
      titulo: dados.titulo,
      horario: new Date(dados.horario),
      salaId: dados.salaId,
      palestranteId: dados.palestranteId,
      tema: dados.tema,
      cargaHoraria: dados.cargaHoraria,
      questionario: dados.questionario as unknown as Prisma.InputJsonValue,
      situacao: doProfessor ? "PENDENTE" : "APROVADO",
      criadoPorId: doProfessor ? ator.id : null,
    },
  });
  await registrarAuditoria(ator.id, "EVENTO_CRIADO", `evento ${evento.id}`);
  if (doProfessor) {
    await registrarHistorico("EVENTO", evento.id, "ENVIADO", ator.id);
    await registrarAuditoria(ator.id, "EVENTO_ENVIADO_PARA_APROVACAO", `evento ${evento.id}`);
  }
  return paraDominio(evento);
}

// ---------------------------------------------------------------- agenda (sala, horario, carga, palestrante)
// sao os campos que, num evento ja APROVADO do professor, so mudam com aprovacao da equipe
interface Agenda {
  salaId: string;
  horario: Date;
  cargaHoraria: number;
  palestranteId: string;
}

function agendaDe(evento: Pick<EventoDb, "salaId" | "horario" | "cargaHoraria" | "palestranteId">): Agenda {
  return { salaId: evento.salaId, horario: evento.horario, cargaHoraria: evento.cargaHoraria, palestranteId: evento.palestranteId };
}

function agendaDaProposta(proposta: PropostaDb): Agenda {
  return {
    salaId: proposta.novaSalaId!,
    horario: proposta.novoHorario!,
    cargaHoraria: proposta.novaCargaHoraria!,
    palestranteId: proposta.novoPalestranteId!,
  };
}

// a agenda base com o que veio no patch por cima
function agendaCom(base: Agenda, dados: Partial<Pick<EventoInput, "salaId" | "horario" | "cargaHoraria" | "palestranteId">>): Agenda {
  return {
    salaId: dados.salaId ?? base.salaId,
    horario: dados.horario ? new Date(dados.horario) : base.horario,
    cargaHoraria: dados.cargaHoraria ?? base.cargaHoraria,
    palestranteId: dados.palestranteId ?? base.palestranteId,
  };
}

function camposMudados(antes: Agenda, depois: Agenda): (keyof Agenda)[] {
  const mudou: (keyof Agenda)[] = [];
  if (antes.salaId !== depois.salaId) mudou.push("salaId");
  if (antes.horario.getTime() !== depois.horario.getTime()) mudou.push("horario");
  if (antes.cargaHoraria !== depois.cargaHoraria) mudou.push("cargaHoraria");
  if (antes.palestranteId !== depois.palestranteId) mudou.push("palestranteId");
  return mudou;
}

function formatarDataHora(data: Date): string {
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}

function formatarCarga(horas: number): string {
  return `${String(horas).replace(".", ",")} h`;
}

// o que mudou, com os nomes (sala e palestrante) e a data no formato da tela: vai no e-mail aos inscritos e no
// historico da proposta
async function descreverMudancas(antes: Agenda, depois: Agenda): Promise<MudancaEvento[]> {
  const mudou = camposMudados(antes, depois);
  const [salas, palestrantes] = await Promise.all([
    mudou.includes("salaId")
      ? prisma.sala.findMany({ where: { id: { in: [antes.salaId, depois.salaId] } }, select: { id: true, nome: true, tipo: true } })
      : [],
    mudou.includes("palestranteId")
      ? prisma.palestrante.findMany({ where: { id: { in: [antes.palestranteId, depois.palestranteId] } }, select: { id: true, nome: true } })
      : [],
  ]);
  const nomeSala = (id: string) => {
    const sala = salas.find((s) => s.id === id);
    return sala ? rotuloSala(sala) : "—";
  };
  const nomePalestrante = (id: string) => palestrantes.find((p) => p.id === id)?.nome ?? "—";
  return mudou.map((campo) => {
    if (campo === "salaId") return { rotulo: "Sala", antes: nomeSala(antes.salaId), depois: nomeSala(depois.salaId) };
    if (campo === "horario") return { rotulo: "Data/horário", antes: formatarDataHora(antes.horario), depois: formatarDataHora(depois.horario) };
    if (campo === "cargaHoraria") {
      return { rotulo: "Carga horária", antes: formatarCarga(antes.cargaHoraria), depois: formatarCarga(depois.cargaHoraria) };
    }
    return { rotulo: "Palestrante", antes: nomePalestrante(antes.palestranteId), depois: nomePalestrante(depois.palestranteId) };
  });
}

function textoDasMudancas(mudancas: MudancaEvento[]): string {
  return mudancas.map((m) => `${m.rotulo}: ${m.antes} → ${m.depois}`).join("; ");
}

// avisa por e-mail cada inscrito de um evento aprovado que mudou de sala, horario, carga ou palestrante.
// Falha de envio nao desfaz a mudanca: vai para a auditoria (sem dado pessoal, so o id da inscricao)
async function avisarInscritos(eventoId: string, eventoTitulo: string, mudancas: MudancaEvento[], atorId: string) {
  if (mudancas.length === 0) return { inscritos: 0, avisados: 0 };
  const inscricoes = await prisma.inscricao.findMany({
    where: { eventoId },
    select: { id: true, participante: { include: COM_CONTA_DO_ALUNO } },
  });
  let avisados = 0;
  let simulado = false;
  // inscrito de conta ficticia sai da lista (nao recebe e nao conta); os reais continuam recebendo
  let suprimidos = 0;
  for (const inscricao of inscricoes) {
    const participante = participanteParaDominio(inscricao.participante);
    if (!participante.email) continue;
    try {
      const resultado = await emailService.enviarAlteracaoEvento(participante.email, {
        participanteNome: participante.nome,
        eventoTitulo,
        mudancas,
      });
      if (resultado === "suprimido") {
        suprimidos++;
        continue;
      }
      avisados++;
      if (resultado === "simulado") simulado = true;
    } catch {
      // email.service.ts ja loga o detalhe sanitizado da falha
      await registrarAuditoria(atorId, "EMAIL_FALHA", `aviso de alteração do evento ${eventoId}, inscrição ${inscricao.id}: falha no envio`);
    }
  }
  if (avisados > 0) {
    await registrarAuditoria(
      atorId,
      "EMAIL_ENVIADO",
      `aviso de alteração do evento ${eventoId} a ${avisados} de ${inscricoes.length - suprimidos} inscrito(s)${simulado ? " (simulado: SendGrid não configurado)" : ""}`,
    );
  }
  return { inscritos: inscricoes.length - suprimidos, avisados };
}

// ---------------------------------------------------------------- questionario travado
// compara o conteudo (o banco pode devolver as chaves do json em outra ordem)
function assinaturaDoQuestionario(questionario: unknown): string {
  return JSON.stringify(
    (questionario as PerguntaQuestionario[]).map((p) => [p.id, p.enunciado, p.alternativas.map((a) => [a.texto, a.correta])]),
  );
}

// depois que algum aluno respondeu o questionario, ninguem (professor, secretaria ou administrador) muda mais
// as perguntas: as notas ja dadas deixariam de bater com o gabarito
async function garantirQuestionarioLiberado(evento: EventoDb, novo: unknown) {
  if (novo === undefined || assinaturaDoQuestionario(novo) === assinaturaDoQuestionario(evento.questionario)) return;
  if ((await prisma.tentativaQuestionario.count({ where: { eventoId: evento.id } })) > 0) {
    throw AppError.conflito("QUESTIONARIO_TRAVADO", "Questionário travado: já há respostas de alunos.");
  }
}

// ---------------------------------------------------------------- edicao
// proposta aberta (pendente ou recusada) do evento; no maximo uma
async function propostaAbertaDe(eventoId: string) {
  return prisma.propostaAlteracao.findFirst({
    where: { eventoId, situacao: { in: ["PENDENTE", "RECUSADO"] } },
    orderBy: { criadoEm: "desc" },
  });
}

// regras da proposta: so antes de o evento comecar, horario novo no futuro, sala e palestrante validos (o
// palestrante pode ser um pendente do proprio professor: a aprovacao da proposta espera o dele), sala que
// caiba os inscritos e sem conflito (a sala atual continua do evento ate a aprovacao)
async function validarProposta(evento: EventoDb, depois: Agenda, ator: Ator) {
  const agora = Date.now();
  if (evento.horario.getTime() <= agora) {
    throw AppError.conflito("EVENTO_JA_INICIADO", "Não é possível propor alteração: o evento já começou.");
  }
  if (depois.horario.getTime() <= agora) {
    throw AppError.validacao("Dados inválidos.", [{ campo: "horario", mensagem: "O novo horário precisa ser no futuro." }]);
  }
  const mudou = camposMudados(agendaDe(evento), depois);
  await validarReferencias(
    {
      salaId: mudou.includes("salaId") ? depois.salaId : undefined,
      palestranteId: mudou.includes("palestranteId") ? depois.palestranteId : undefined,
    },
    ator,
  );
  if (mudou.includes("salaId")) await validarCapacidade(depois.salaId, evento.id);
  await validarConflitoDeSala(depois.salaId, depois.horario, depois.cargaHoraria, evento.id);
}

function valoresDaProposta(agenda: Agenda) {
  return { novaSalaId: agenda.salaId, novoHorario: agenda.horario, novaCargaHoraria: agenda.cargaHoraria, novoPalestranteId: agenda.palestranteId };
}

// grava a proposta (nova, ou a recusada reaproveitada como reenvio) e registra historico e auditoria
async function enviarProposta(evento: EventoDb, depois: Agenda, recusada: PropostaDb | null, ator: Ator, resposta?: string) {
  const resumo = textoDasMudancas(await descreverMudancas(agendaDe(evento), depois));
  if (recusada) {
    await prisma.propostaAlteracao.update({
      where: { id: recusada.id },
      data: { ...valoresDaProposta(depois), situacao: "PENDENTE", motivoRecusa: null, decididoEm: null, criadoPorId: ator.id },
    });
    const mensagem = resposta?.trim() ? `${resumo}\nResposta: ${resposta.trim()}` : resumo;
    await registrarHistorico("EVENTO", evento.id, "PROPOSTA_REENVIADA", ator.id, mensagem);
    await registrarAuditoria(ator.id, "EVENTO_PROPOSTA_REENVIADA", `evento ${evento.id}, proposta ${recusada.id}`);
    return;
  }
  const proposta = await prisma.propostaAlteracao.create({
    data: { id: randomUUID(), tipo: "EVENTO", eventoId: evento.id, ...valoresDaProposta(depois), criadoPorId: ator.id },
  });
  await registrarHistorico("EVENTO", evento.id, "PROPOSTA_ENVIADA", ator.id, resumo);
  await registrarAuditoria(ator.id, "EVENTO_PROPOSTA_ENVIADA", `evento ${evento.id}, proposta ${proposta.id}`);
}

// edita um evento. Ninguem edita evento encerrado, e ninguem muda o questionario depois de respondido.
// Professor em evento ja APROVADO: titulo, tema e questionario mudam direto; sala, horario, carga horaria e
// palestrante viram uma PROPOSTA de alteracao, e o evento continua valendo como esta ate a equipe aprovar.
// Equipe (e professor em evento pendente/recusado) muda tudo direto; em evento aprovado, os inscritos sao
// avisados por e-mail quando a agenda muda
async function atualizar(id: string, dados: EventoUpdateInput, ator: Ator) {
  const atual = await eventoDoAtorOuFalhar(ator, id);
  garantirEventoNaoCancelado(atual);
  if (eventoEncerrado(atual)) throw erroEncerrado();
  await garantirQuestionarioLiberado(atual, dados.questionario);

  const antes = agendaDe(atual);
  const depois = agendaCom(antes, dados);
  const mudou = camposMudados(antes, depois);
  const viraProposta = ator.perfil === "PROFESSOR" && atual.situacao === "APROVADO" && mudou.length > 0;

  let recusada: PropostaDb | null = null;
  if (viraProposta) {
    const aberta = await propostaAbertaDe(id);
    if (aberta?.situacao === "PENDENTE") {
      throw AppError.conflito(
        "PROPOSTA_JA_PENDENTE",
        "Este evento já tem uma proposta de alteração aguardando aprovação. Edite ou cancele essa proposta antes de fazer outra.",
      );
    }
    recusada = aberta;
    await validarProposta(atual, depois, ator);
  } else if (mudou.length > 0) {
    if (mudou.includes("horario")) garantirHorarioNoFuturo(depois.horario);
    await validarReferencias(
      {
        salaId: mudou.includes("salaId") ? depois.salaId : undefined,
        palestranteId: mudou.includes("palestranteId") ? depois.palestranteId : undefined,
      },
      ator,
    );
    if (mudou.includes("salaId")) await validarCapacidade(depois.salaId, id);
    if (mudou.includes("salaId") || mudou.includes("horario") || mudou.includes("cargaHoraria")) {
      await validarConflitoDeSala(depois.salaId, depois.horario, depois.cargaHoraria, id);
    }
  }

  // o que grava direto no evento (na proposta, a agenda fica de fora)
  const diretos: EventoUpdateInput = viraProposta ? { titulo: dados.titulo, tema: dados.tema, questionario: dados.questionario } : dados;
  if (camposInformados(diretos) !== "nenhum") {
    await prisma.evento.update({
      where: { id },
      data: {
        titulo: diretos.titulo,
        horario: diretos.horario ? new Date(diretos.horario) : undefined,
        salaId: diretos.salaId,
        palestranteId: diretos.palestranteId,
        tema: diretos.tema,
        cargaHoraria: diretos.cargaHoraria,
        questionario: diretos.questionario as unknown as Prisma.InputJsonValue | undefined,
      },
    });
    await registrarAuditoria(ator.id, "EVENTO_ATUALIZADO", `evento ${id} (campos: ${camposInformados(diretos)})`);
  }

  let avisoInscritos: { inscritos: number; avisados: number } | null = null;
  if (viraProposta) {
    await enviarProposta(atual, depois, recusada, ator);
  } else if (mudou.length > 0 && atual.situacao === "APROVADO") {
    avisoInscritos = await avisarInscritos(id, dados.titulo ?? atual.titulo, await descreverMudancas(antes, depois), ator.id);
  }
  return { evento: await recarregar(id), propostaEnviada: viraProposta, avisoInscritos };
}

// ---------------------------------------------------------------- proposta de alteracao
// quem cuida da proposta do lado do evento: o professor dono; num evento que ficou com a equipe (transferido
// na inativacao do professor), a equipe
function garantirDonoDoEvento(evento: EventoDb, ator: Ator) {
  if (ehEquipe(ator.perfil) && evento.criadoPorId) {
    throw AppError.acessoNegado("Só o professor responsável pelo evento pode fazer isto.");
  }
}

async function propostaAbertaOuFalhar(eventoId: string) {
  const proposta = await propostaAbertaDe(eventoId);
  if (!proposta) throw AppError.naoEncontrado("PROPOSTA_NAO_ENCONTRADA", "Este evento não tem proposta de alteração em aberto.");
  return proposta;
}

// o professor corrige a proposta que ainda aguarda aprovacao, ou reenvia a recusada (com resposta opcional)
async function editarProposta(id: string, dados: PropostaEventoInput, ator: Ator) {
  const evento = await eventoDoAtorOuFalhar(ator, id);
  garantirEventoNaoCancelado(evento);
  if (eventoEncerrado(evento)) throw erroEncerrado();
  const proposta = await propostaAbertaOuFalhar(id);
  const depois = agendaCom(agendaDaProposta(proposta), dados);
  if (camposMudados(agendaDe(evento), depois).length === 0) {
    throw new AppError(
      422,
      "PROPOSTA_SEM_MUDANCA",
      "A proposta precisa mudar a sala, o horário, a carga horária ou o palestrante. Para desistir dela, cancele a proposta.",
    );
  }
  await validarProposta(evento, depois, ator);

  if (proposta.situacao === "RECUSADO") {
    await enviarProposta(evento, depois, proposta, ator, dados.resposta);
  } else {
    await prisma.propostaAlteracao.update({ where: { id: proposta.id }, data: valoresDaProposta(depois) });
    const resumo = textoDasMudancas(await descreverMudancas(agendaDe(evento), depois));
    await registrarHistorico("EVENTO", id, "PROPOSTA_EDITADA", ator.id, resumo);
    await registrarAuditoria(ator.id, "EVENTO_PROPOSTA_EDITADA", `evento ${id}, proposta ${proposta.id}`);
  }
  return recarregar(id);
}

// o professor desiste da proposta (pendente ou recusada); a sala proposta fica livre na hora
async function cancelarProposta(id: string, ator: Ator) {
  const evento = await eventoDoAtorOuFalhar(ator, id);
  garantirDonoDoEvento(evento, ator);
  garantirEventoNaoCancelado(evento);
  const proposta = await propostaAbertaOuFalhar(id);
  await prisma.propostaAlteracao.delete({ where: { id: proposta.id } });
  await registrarHistorico("EVENTO", id, "PROPOSTA_CANCELADA", ator.id);
  await registrarAuditoria(ator.id, "EVENTO_PROPOSTA_CANCELADA", `evento ${id}, proposta ${proposta.id}`);
  return recarregar(id);
}

async function propostaPendenteOuFalhar(eventoId: string) {
  const evento = await prisma.evento.findUnique({ where: { id: eventoId } });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  const proposta = await prisma.propostaAlteracao.findFirst({ where: { eventoId, situacao: "PENDENTE" } });
  if (!proposta) {
    throw AppError.conflito("PROPOSTA_NAO_PENDENTE", "Este evento não tem proposta de alteração aguardando aprovação.");
  }
  return { evento, proposta };
}

// a equipe aprova (sem motivo): confere de novo tudo o que pode ter mudado desde o envio (evento ja comecou,
// sala, palestrante aprovado, capacidade, conflito), aplica a mudanca e avisa os inscritos por e-mail
async function aprovarProposta(id: string, ator: Ator) {
  const { evento, proposta } = await propostaPendenteOuFalhar(id);
  const antes = agendaDe(evento);
  const depois = agendaDaProposta(proposta);
  const agora = Date.now();
  if (evento.horario.getTime() <= agora) {
    throw AppError.conflito("EVENTO_JA_INICIADO", "O evento já começou: a proposta não pode mais ser aprovada. Recuse-a.");
  }
  if (depois.horario.getTime() <= agora) {
    throw AppError.conflito("PROPOSTA_VENCIDA", "O horário proposto já passou: a proposta não pode ser aprovada. Recuse-a.");
  }
  if (!(await prisma.sala.findUnique({ where: { id: depois.salaId } }))) {
    throw AppError.conflito("SALA_NAO_ENCONTRADA", "A sala proposta não existe mais. Recuse a proposta.");
  }
  const palestrante = await prisma.palestrante.findUnique({ where: { id: depois.palestranteId } });
  if (!palestrante) throw AppError.conflito("PALESTRANTE_NAO_ENCONTRADO", "O palestrante proposto não existe mais. Recuse a proposta.");
  if (palestrante.situacao !== "APROVADO") {
    throw AppError.conflito(
      "PALESTRANTE_NAO_APROVADO",
      `O palestrante "${palestrante.nome}" ainda não foi aprovado. Aprove o palestrante antes de aprovar a alteração.`,
    );
  }
  if (depois.salaId !== antes.salaId) await validarCapacidade(depois.salaId, id);
  await validarConflitoDeSala(depois.salaId, depois.horario, depois.cargaHoraria, id);

  const mudancas = await descreverMudancas(antes, depois);
  await prisma.$transaction([
    prisma.evento.update({ where: { id }, data: { ...depois } }),
    prisma.propostaAlteracao.update({ where: { id: proposta.id }, data: { situacao: "APROVADO", motivoRecusa: null, decididoEm: new Date() } }),
  ]);
  await registrarHistorico("EVENTO", id, "PROPOSTA_APROVADA", ator.id, textoDasMudancas(mudancas));
  await registrarAuditoria(ator.id, "EVENTO_PROPOSTA_APROVADA", `evento ${id}, proposta ${proposta.id}`);
  const avisoInscritos = await avisarInscritos(id, evento.titulo, mudancas, ator.id);
  return { evento: await recarregar(id), avisoInscritos };
}

// a equipe recusa com motivo: o evento fica como estava e a sala proposta fica livre. O professor ve o
// motivo no sistema e pode corrigir e reenviar
async function recusarProposta(id: string, motivo: string, ator: Ator) {
  const { proposta } = await propostaPendenteOuFalhar(id);
  await prisma.propostaAlteracao.update({ where: { id: proposta.id }, data: { situacao: "RECUSADO", motivoRecusa: motivo, decididoEm: new Date() } });
  await registrarHistorico("EVENTO", id, "PROPOSTA_RECUSADA", ator.id, motivo);
  // o motivo e texto livre: fica so na proposta e no historico, nunca na auditoria
  await registrarAuditoria(ator.id, "EVENTO_PROPOSTA_RECUSADA", `evento ${id}, proposta ${proposta.id}`);
  return recarregar(id);
}

// RF009/RNF010: evento com qualquer inscricao NAO e excluido — nada mais some em cascata pela API.
// Evento encerrado tambem nao (para todos os perfis). A proposta de alteracao sai junto com o evento
async function remover(id: string, ator: Ator) {
  const evento = await eventoDoAtorOuFalhar(ator, id);
  // o cancelado fica no historico (as inscricoes continuam ligadas a ele)
  garantirEventoNaoCancelado(evento);
  if (eventoEncerrado(evento)) throw erroEncerrado();
  const inscricoes = await prisma.inscricao.count({ where: { eventoId: id } });
  if (inscricoes > 0) {
    throw AppError.conflito("EVENTO_COM_INSCRICOES", "Cancele as inscrições antes de excluir o evento.");
  }
  await prisma.$transaction([
    prisma.historicoAprovacao.deleteMany({ where: { tipo: "EVENTO", itemId: id } }),
    prisma.evento.delete({ where: { id } }),
  ]);
  await registrarAuditoria(ator.id, "EVENTO_REMOVIDO", `evento ${id}`);
}

// ---------------------------------------------------------------- aprovacao (so a equipe aprova/recusa)
async function eventoPendenteOuFalhar(id: string) {
  const evento = await prisma.evento.findUnique({ where: { id }, include: { palestrante: { select: { nome: true, situacao: true } } } });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  if (evento.situacao !== "PENDENTE") {
    throw AppError.conflito("EVENTO_NAO_PENDENTE", "Só é possível aprovar ou recusar um evento que está aguardando aprovação.");
  }
  return evento;
}

// aprova: confere de novo o conflito de sala e se o palestrante ja esta APROVADO
async function aprovar(id: string, ator: Ator) {
  const evento = await eventoPendenteOuFalhar(id);
  if (evento.palestrante.situacao !== "APROVADO") {
    throw AppError.conflito(
      "PALESTRANTE_NAO_APROVADO",
      `O palestrante "${evento.palestrante.nome}" ainda não foi aprovado. Aprove o palestrante antes de aprovar o evento.`,
    );
  }
  await validarConflitoDeSala(evento.salaId, evento.horario, evento.cargaHoraria, id);
  await prisma.evento.update({ where: { id }, data: { situacao: "APROVADO", motivoRecusa: null } });
  await registrarHistorico("EVENTO", id, "APROVADO", ator.id);
  await registrarAuditoria(ator.id, "EVENTO_APROVADO", `evento ${id}`);
  return recarregar(id);
}

// recusa com motivo (o professor ve o motivo no sistema); a sala fica livre na hora
async function recusar(id: string, motivo: string, ator: Ator) {
  await eventoPendenteOuFalhar(id);
  await prisma.evento.update({ where: { id }, data: { situacao: "RECUSADO", motivoRecusa: motivo } });
  await registrarHistorico("EVENTO", id, "RECUSADO", ator.id, motivo);
  // o motivo e texto livre: fica so no historico, nunca na auditoria
  await registrarAuditoria(ator.id, "EVENTO_RECUSADO", `evento ${id}`);
  return recarregar(id);
}

// o professor reenvia o evento recusado (depois de corrigir), com uma resposta opcional. Volta para
// PENDENTE e confere a sala de novo (enquanto estava recusado, a sala ficou livre). Evento recusado que
// ficou com a equipe (transferido na inativacao do professor) a equipe reenvia
async function reenviar(id: string, resposta: string | undefined, ator: Ator) {
  const evento = await eventoDoAtorOuFalhar(ator, id);
  garantirDonoDoEvento(evento, ator);
  if (evento.situacao !== "RECUSADO") {
    throw AppError.conflito("EVENTO_NAO_RECUSADO", "Só é possível reenviar um evento que foi recusado.");
  }
  if (eventoEncerrado(evento)) throw erroEncerrado();
  await validarConflitoDeSala(evento.salaId, evento.horario, evento.cargaHoraria, id);
  await prisma.evento.update({ where: { id }, data: { situacao: "PENDENTE", motivoRecusa: null } });
  await registrarHistorico("EVENTO", id, "REENVIADO", ator.id, resposta);
  await registrarAuditoria(ator.id, "EVENTO_REENVIADO", `evento ${id}`);
  return recarregar(id);
}

// historico da aprovacao (equipe e o professor dono do evento)
async function historico(id: string, ator: Ator) {
  await eventoDoAtorOuFalhar(ator, id);
  return listarHistorico("EVENTO", id);
}

// autoinscricao do aluno logado: checa evento aprovado, conta ativa, evento que ainda nao comecou,
// duplicidade e vaga antes de criar
async function autoinscrever(eventoId: string, participanteId: string, atorId: string) {
  const evento = await prisma.evento.findFirst({ where: { id: eventoId, situacao: "APROVADO" }, include: { sala: true } });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  garantirEventoNaoCancelado(evento);

  // o aluno inativado ja nao tem sessao (a inativacao derruba as sessoes), isto e so a segunda barreira
  const participante = await prisma.participante.findUnique({ where: { id: participanteId }, select: { ativo: true } });
  if (!participante?.ativo) throw AppError.contaInativa();

  // o aluno so se inscreve antes de o evento comecar; registro retroativo de quem foi a um evento
  // passado continua possivel pela inscricao manual da secretaria
  if (evento.horario <= new Date()) {
    throw AppError.conflito("EVENTO_JA_INICIADO", "Não é possível se inscrever: o evento já começou.");
  }

  const jaInscrito = await prisma.inscricao.findUnique({
    where: { participanteId_eventoId: { participanteId, eventoId } },
  });
  if (jaInscrito) {
    throw AppError.conflito("JA_INSCRITO", "Você já está inscrito neste evento.");
  }
  await garantirSemConflitoDeHorario(participanteId, evento, "ALUNO");

  const ocupadas = await prisma.inscricao.count({ where: { eventoId } });
  if (ocupadas >= evento.sala.capacidade) {
    throw AppError.conflito("EVENTO_LOTADO", "Evento sem vagas disponíveis.");
  }

  const inscricao = await prisma.inscricao.create({
    data: { id: randomUUID(), participanteId, eventoId, statusPresenca: "PENDENTE" },
  });
  await registrarAuditoria(
    atorId,
    "INSCRICAO_CRIADA",
    `inscrição ${inscricao.id} (evento ${eventoId}, participante ${participanteId}) feita pelo próprio aluno`,
  );
  // o e-mail de confirmacao sai daqui mesmo; se falhar, a inscricao continua valendo e a tela avisa
  const emailConfirmacaoEnviado = await enviarConfirmacaoPorEmail(inscricao.id, atorId);
  return { inscricao: paraDominioInscricao(inscricao), emailConfirmacaoEnviado };
}

// ---------------------------------------------------------------- cancelamento (so a equipe; nao se desfaz)
// so evento APROVADO, ainda nao iniciado e nao cancelado. Na mesma transacao: grava quando, por que e quem
// cancelou e encerra como recusada a proposta de alteracao pendente. As inscricoes ficam (historico do aluno) e a
// sala fica livre (validarConflitoDeSala ignora cancelado). Depois, avisa por e-mail cada inscrito e o professor
// responsavel; falha de envio nao desfaz o cancelamento e vai para a auditoria sem endereco de e-mail
const MOTIVO_PROPOSTA_DO_CANCELADO = "Evento cancelado";

async function cancelar(id: string, motivo: string, ator: Ator) {
  const evento = await prisma.evento.findUnique({
    where: { id },
    include: {
      sala: { select: { nome: true, tipo: true } },
      palestrante: { select: { nome: true } },
      criadoPor: { select: { nome: true, emailLogin: true } },
    },
  });
  if (!evento) throw AppError.naoEncontrado("EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
  if (evento.canceladoEm) throw AppError.conflito("EVENTO_CANCELADO", "Este evento já foi cancelado.");
  if (evento.situacao !== "APROVADO") {
    throw AppError.conflito("EVENTO_NAO_APROVADO", "Este evento ainda não foi aprovado; recuse-o pela tela de aprovações.");
  }
  if (evento.horario.getTime() <= Date.now()) {
    throw AppError.conflito("EVENTO_JA_INICIADO", "Não é possível cancelar um evento que já começou.");
  }

  const canceladoEm = new Date();
  const propostasPendentes = await prisma.propostaAlteracao.findMany({ where: { eventoId: id, situacao: "PENDENTE" }, select: { id: true } });
  await prisma.$transaction([
    prisma.evento.update({ where: { id }, data: { canceladoEm, motivoCancelamento: motivo, canceladoPorId: ator.id } }),
    prisma.propostaAlteracao.updateMany({
      where: { eventoId: id, situacao: "PENDENTE" },
      data: { situacao: "RECUSADO", motivoRecusa: MOTIVO_PROPOSTA_DO_CANCELADO, decididoEm: canceladoEm },
    }),
  ]);
  // historico da aprovacao (visivel so para a equipe e para o professor dono): o motivo pode ficar aqui
  for (const _ of propostasPendentes) await registrarHistorico("EVENTO", id, "PROPOSTA_RECUSADA", ator.id, MOTIVO_PROPOSTA_DO_CANCELADO);
  if (evento.criadoPorId) await registrarHistorico("EVENTO", id, "CANCELADO", ator.id, motivo);

  // ---- e-mails (depois da transacao)
  const dados = {
    eventoTitulo: evento.titulo,
    eventoHorario: evento.horario,
    salaRotulo: rotuloSala(evento.sala),
    palestranteNome: evento.palestrante.nome,
    motivo,
    linkEventos: env.appUrl ? `${env.appUrl}/#/eventos` : null,
  };
  const inscricoes = await prisma.inscricao.findMany({ where: { eventoId: id }, select: { id: true, participante: { include: COM_CONTA_DO_ALUNO } } });
  let avisados = 0;
  let suprimidos = 0;
  let simulado = false;
  for (const inscricao of inscricoes) {
    const participante = participanteParaDominio(inscricao.participante);
    if (!participante.email) continue;
    try {
      const resultado = await emailService.enviarCancelamentoEvento(participante.email, { ...dados, nome: participante.nome, destinatario: "INSCRITO" });
      if (resultado === "suprimido") {
        suprimidos++;
        continue;
      }
      avisados++;
      if (resultado === "simulado") simulado = true;
    } catch {
      // email.service.ts ja loga o detalhe sanitizado da falha
      await registrarAuditoria(ator.id, "EMAIL_FALHA", `aviso de cancelamento do evento ${id}, inscrição ${inscricao.id}: falha no envio`);
    }
  }
  let professorAvisado = false;
  if (evento.criadoPor) {
    try {
      const resultado = await emailService.enviarCancelamentoEvento(evento.criadoPor.emailLogin, {
        ...dados,
        nome: evento.criadoPor.nome,
        destinatario: "PROFESSOR",
      });
      professorAvisado = resultado !== "suprimido";
      if (resultado === "simulado") simulado = true;
    } catch {
      await registrarAuditoria(ator.id, "EMAIL_FALHA", `aviso de cancelamento do evento ${id} ao professor responsável: falha no envio`);
    }
  }
  const inscritosReais = inscricoes.length - suprimidos;
  // o motivo e texto livre: fica so no evento (e no historico da aprovacao), nunca na auditoria
  await registrarAuditoria(
    ator.id,
    "EVENTO_CANCELADO",
    `evento ${id}: ${avisados} de ${inscritosReais} inscrito(s) avisado(s) por e-mail${professorAvisado ? ", e o professor responsável" : ""}` +
      `${propostasPendentes.length > 0 ? `; ${propostasPendentes.length} proposta(s) de alteração encerrada(s)` : ""}` +
      `${simulado ? " (simulado: SendGrid não configurado)" : ""}`,
  );
  return { evento: await recarregar(id), avisoInscritos: { inscritos: inscritosReais, avisados }, professorAvisado };
}

export const eventosService = {
  cancelar,
  listar,
  calendario,
  buscar,
  buscarOuFalhar,
  criar,
  atualizar,
  remover,
  aprovar,
  recusar,
  reenviar,
  historico,
  editarProposta,
  cancelarProposta,
  aprovarProposta,
  recusarProposta,
  autoinscrever,
};
