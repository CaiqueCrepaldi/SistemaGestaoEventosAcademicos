import { randomUUID } from "crypto";
import type { Inscricao as InscricaoDb, Prisma } from "@prisma/client";
import { montarPagina } from "../../utils/paginacao";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { emailService } from "../email/email.service";
import { COM_CONTA_DO_ALUNO, paraDominio as participanteParaDominio } from "../participantes/participantes.service";
import { registrarAuditoria } from "../../utils/auditoria";
import { eventosVisiveis, inscricaoDoAtorOuFalhar, type Ator } from "../../utils/escopo";
import type { Inscricao, Perfil, StatusPresenca } from "../../types/domain";
import type { InscricaoCheckinInput, InscricaoInput } from "./inscricoes.schemas";

interface FiltrosListagem {
  eventoId?: string;
  participanteId?: string;
  status?: StatusPresenca;
  // so inscricoes de eventos visiveis pra quem chama (utils/escopo.ts): o professor so as dos eventos dele
  escopoEvento?: Prisma.EventoWhereInput;
}

// prisma devolve as datas como Date, resto do app espera string (ISO) ou null
export function paraDominio(inscricao: InscricaoDb): Inscricao {
  return {
    ...inscricao,
    dataCheckin: inscricao.dataCheckin ? inscricao.dataCheckin.toISOString() : null,
    dataInscricao: inscricao.dataInscricao.toISOString(),
  };
}

// inscricoes cujo aluno tem o texto no nome, no e-mail (da conta) ou no RGM (vazio = todas). A collation
// das tabelas (utf8mb4_unicode_ci) ja ignora maiusculas e acentos
export function filtroDoAluno(busca?: string): Prisma.InscricaoWhereInput {
  if (!busca) return {};
  return {
    participante: {
      OR: [
        { rgm: { contains: busca } },
        { usuarios: { some: { perfil: "ALUNO", OR: [{ nome: { contains: busca } }, { emailLogin: { contains: busca } }] } } },
      ],
    },
  };
}

// o nome do aluno vem da conta dele (o participante so guarda RGM e situacao)
export const COM_ALUNO_DA_INSCRICAO = {
  rgm: true,
  ativo: true,
  usuarios: { where: { perfil: "ALUNO" as const }, take: 1, select: { nome: true } },
} satisfies Prisma.ParticipanteSelect;

export interface FiltrosGestao {
  escopoEvento?: Prisma.EventoWhereInput;
  eventoId?: string;
  status?: StatusPresenca;
  busca?: string;
  page: number;
  pageSize: number;
}

// tela Inscricoes da equipe: uma pagina por vez, ja com nome/RGM do aluno e titulo do evento, filtrada
// no banco. Antes a tela baixava todas as inscricoes e todos os participantes e cruzava no navegador
// (com 30 mil inscricoes a resposta passava de 8 MB, acima do limite da Vercel)
async function listarParaGestao(filtros: FiltrosGestao) {
  const where: Prisma.InscricaoWhereInput = {
    eventoId: filtros.eventoId,
    statusPresenca: filtros.status,
    ...(filtros.escopoEvento ? { evento: filtros.escopoEvento } : {}),
    ...filtroDoAluno(filtros.busca),
  };
  const [total, inscricoes] = await prisma.$transaction([
    prisma.inscricao.count({ where }),
    prisma.inscricao.findMany({
      where,
      orderBy: [{ dataInscricao: "desc" }, { id: "desc" }],
      skip: (filtros.page - 1) * filtros.pageSize,
      take: filtros.pageSize,
      include: { participante: { select: COM_ALUNO_DA_INSCRICAO }, evento: { select: { titulo: true, horario: true } } },
    }),
  ]);
  const itens = inscricoes.map(({ participante, evento, ...inscricao }) => ({
    ...paraDominio(inscricao),
    participanteNome: participante.usuarios[0]?.nome ?? "",
    participanteRgm: participante.rgm,
    participanteAtivo: participante.ativo,
    eventoTitulo: evento.titulo,
    eventoHorario: evento.horario.toISOString(),
  }));
  return montarPagina(itens, total, filtros.page, filtros.pageSize);
}

// lista inscricoes filtradas, mais recente primeiro
async function listar(filtros: FiltrosListagem) {
  const inscricoes = await prisma.inscricao.findMany({
    where: {
      eventoId: filtros.eventoId,
      participanteId: filtros.participanteId,
      statusPresenca: filtros.status,
      ...(filtros.escopoEvento ? { evento: filtros.escopoEvento } : {}),
    },
    orderBy: { dataInscricao: "desc" },
  });
  return inscricoes.map(paraDominio);
}

// busca uma inscricao pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const inscricao = await prisma.inscricao.findUnique({ where: { id } });
  if (!inscricao) throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Inscrição não encontrada.");
  return paraDominio(inscricao);
}

// inscricao manual feita pela equipe ou pelo professor (so nos eventos dele), checa duplicidade e vaga.
// Evento que nao esta APROVADO nao aceita inscricao
async function criarManual(dados: InscricaoInput, ator: Ator) {
  const [participante, evento] = await Promise.all([
    prisma.participante.findUnique({ where: { id: dados.participanteId } }),
    prisma.evento.findFirst({ where: { id: dados.eventoId, ...eventosVisiveis(ator) }, include: { sala: true } }),
  ]);

  const erros: { campo: string; mensagem: string }[] = [];
  if (!participante) erros.push({ campo: "participanteId", mensagem: "Participante não encontrado." });
  if (!evento) erros.push({ campo: "eventoId", mensagem: "Evento não encontrado." });
  if (erros.length > 0) throw AppError.validacao("Dados inválidos.", erros);
  if (evento!.situacao !== "APROVADO") {
    throw AppError.conflito("EVENTO_NAO_APROVADO", "Este evento ainda não foi aprovado e não aceita inscrições.");
  }
  // aluno inativado nao se inscreve em nada, nem pela secretaria
  if (!participante!.ativo) {
    throw AppError.conflito("PARTICIPANTE_INATIVO", "Aluno inativo: não é possível inscrevê-lo em eventos.");
  }

  const jaInscrito = await prisma.inscricao.findUnique({
    where: { participanteId_eventoId: { participanteId: dados.participanteId, eventoId: dados.eventoId } },
  });
  if (jaInscrito) throw AppError.conflito("JA_INSCRITO", "Este participante já está inscrito neste evento.");

  const ocupadas = await prisma.inscricao.count({ where: { eventoId: dados.eventoId } });
  if (ocupadas >= evento!.sala.capacidade) {
    throw AppError.conflito("EVENTO_LOTADO", "Evento sem vagas disponíveis.");
  }

  const inscricao = await prisma.inscricao.create({
    data: { id: randomUUID(), participanteId: dados.participanteId, eventoId: dados.eventoId, statusPresenca: "PENDENTE" },
  });
  const quem = descreverQuem(ator.perfil);
  await registrarAuditoria(
    ator.id,
    "INSCRICAO_CRIADA",
    `inscrição ${inscricao.id} (evento ${dados.eventoId}, participante ${dados.participanteId}) feita ${quem}`,
  );
  // o aluno e avisado de que foi inscrito por alguem da equipe; registro retroativo de evento que
  // ja comecou nao manda "confirmacao" de algo que ja passou
  if (evento!.horario > new Date()) {
    await enviarConfirmacaoPorEmail(inscricao.id, ator.id);
  }
  return paraDominio(inscricao);
}

// RF015: depois que o aluno responde o questionario do evento, a presenca daquela inscricao fica
// travada — nao muda mais de status e a inscricao nao pode ser excluida (o certificado depende dela)
async function garantirPresencaDestravada(participanteId: string, eventoId: string) {
  const tentativas = await prisma.tentativaQuestionario.count({ where: { participanteId, eventoId } });
  if (tentativas > 0) {
    throw AppError.conflito("PRESENCA_TRAVADA", "A presença não pode mais ser alterada: o aluno já respondeu o questionário.");
  }
}

// o check-in abre 1 hora antes do inicio do evento (a recepcao atende quem chega cedo) e nao fecha:
// da pra registrar presenca ou ausencia depois que o evento acabou. Antes disso a presenca nao pode
// ser marcada — senao o aluno faria o questionario e emitiria o certificado de um evento que nem aconteceu
export const ANTECEDENCIA_CHECKIN_MS = 60 * 60 * 1000;

async function garantirCheckinAberto(eventoId: string) {
  const evento = await prisma.evento.findUnique({ where: { id: eventoId }, select: { horario: true } });
  if (evento && evento.horario.getTime() - ANTECEDENCIA_CHECKIN_MS > Date.now()) {
    throw AppError.conflito("CHECKIN_NAO_LIBERADO", "O check-in deste evento só abre 1 hora antes do início.");
  }
}

// muda o status de presenca (confirma, marca ausente ou reverte pra pendente). O professor so nos
// eventos dele (404 nos outros)
async function atualizarCheckin(id: string, dados: InscricaoCheckinInput, ator: Ator) {
  const usuarioIdDoToken = ator.id;
  const existente = paraDominio(await inscricaoDoAtorOuFalhar(ator, id));
  await garantirPresencaDestravada(existente.participanteId, existente.eventoId);
  // voltar pra pendente nao registra presenca nenhuma, entao nao depende da janela do check-in
  if (dados.statusPresenca === "PRESENTE" || dados.statusPresenca === "AUSENTE") {
    await garantirCheckinAberto(existente.eventoId);
  }

  if (dados.statusPresenca === "PRESENTE") {
    // aluno inativado nao pode ter presenca confirmada (a tela do check-in tambem bloqueia, mas a regra vale na API)
    const participante = await prisma.participante.findUnique({
      where: { id: existente.participanteId },
      select: { ativo: true },
    });
    if (participante && !participante.ativo) {
      throw AppError.conflito("PARTICIPANTE_INATIVO", "Aluno inativo: não é possível confirmar presença.");
    }

    // ignora qualquer dataCheckin/usuarioId vindo do cliente, sempre usa horario do servidor
    const inscricao = await prisma.inscricao.update({
      where: { id },
      data: { statusPresenca: "PRESENTE", dataCheckin: new Date(), usuarioId: usuarioIdDoToken },
    });
    await registrarAuditoria(usuarioIdDoToken, "PRESENCA_CONFIRMADA", `inscricao ${id}`);
    return paraDominio(inscricao);
  }

  if (dados.statusPresenca === "AUSENTE") {
    const inscricao = await prisma.inscricao.update({
      where: { id },
      data: { statusPresenca: "AUSENTE", dataCheckin: null },
    });
    await registrarAuditoria(usuarioIdDoToken, "PRESENCA_MARCADA_AUSENTE", `inscricao ${id}`);
    return paraDominio(inscricao);
  }

  const inscricao = await prisma.inscricao.update({
    where: { id },
    data: { statusPresenca: "PENDENTE", dataCheckin: null },
  });
  await registrarAuditoria(usuarioIdDoToken, "INSCRICAO_ATUALIZADA", `inscrição ${id}: presença revertida para pendente`);
  return paraDominio(inscricao);
}

// quem cancela: o proprio aluno, alguem da equipe ou o professor dono do evento
type QuemCancela = Ator;

function descreverQuem(perfil: Perfil): string {
  if (perfil === "ALUNO") return "pelo próprio aluno";
  if (perfil === "PROFESSOR") return "pelo professor do evento";
  return perfil === "SECRETARIA" ? "pela secretaria" : "pelo administrador";
}

// aviso por e-mail quando a EQUIPE cancela. Falha de envio nao desfaz o cancelamento (que ja foi
// gravado): so fica registrada na auditoria, como no fluxo de recuperacao de senha
async function avisarCancelamentoPorEmail(
  inscricao: { id: string; participanteId: string; evento: { titulo: string; horario: Date } },
  atorId: string,
) {
  try {
    const participante = await prisma.participante.findUnique({
      where: { id: inscricao.participanteId },
      include: COM_CONTA_DO_ALUNO,
    });
    // nome e e-mail do aluno vem da conta dele (o participante so guarda o RGM); sem conta, sem aviso
    const dados = participante ? participanteParaDominio(participante) : null;
    if (!dados?.email) return;

    const resultado = await emailService.enviarCancelamentoInscricao(dados.email, {
      participanteNome: dados.nome,
      eventoTitulo: inscricao.evento.titulo,
      eventoHorario: inscricao.evento.horario,
    });
    await registrarAuditoria(
      atorId,
      "EMAIL_ENVIADO",
      `aviso de cancelamento de inscrição, inscrição ${inscricao.id}${resultado === "simulado" ? " (simulado: SendGrid não configurado)" : ""}`,
    );
  } catch {
    // email.service.ts ja loga o detalhe sanitizado da falha
    await registrarAuditoria(atorId, "EMAIL_FALHA", `aviso de cancelamento de inscrição, inscrição ${inscricao.id}: falha no envio`);
  }
}

// RF025: regra UNICA de cancelamento, a mesma pro aluno (DELETE /eventos/:eventoId/inscricoes) e
// pra equipe (DELETE /inscricoes/:id): so cancela inscricao com presenca PENDENTE, de evento que
// ainda nao comecou e cujo questionario o aluno nao respondeu. A vaga volta na hora — o aluno pode
// se inscrever de novo se ainda houver vaga
async function cancelar(id: string, ator: QuemCancela) {
  const inscricao = await prisma.inscricao.findUnique({
    where: { id },
    include: { evento: { select: { titulo: true, horario: true } } },
  });
  if (!inscricao) throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Inscrição não encontrada.");

  await garantirPresencaDestravada(inscricao.participanteId, inscricao.eventoId);
  if (inscricao.statusPresenca !== "PENDENTE") {
    throw AppError.conflito(
      "PRESENCA_JA_REGISTRADA",
      "Não é possível cancelar: a presença desta inscrição já foi registrada no check-in.",
    );
  }
  if (inscricao.evento.horario <= new Date()) {
    throw AppError.conflito("EVENTO_JA_INICIADO", "Não é possível cancelar: o evento já começou.");
  }

  await prisma.inscricao.delete({ where: { id } });

  const pelaEquipe = ator.perfil !== "ALUNO";
  const quem = descreverQuem(ator.perfil);
  await registrarAuditoria(
    ator.id,
    "INSCRICAO_CANCELADA",
    `inscrição ${id} (evento ${inscricao.eventoId}, participante ${inscricao.participanteId}) cancelada ${quem}`,
  );
  if (pelaEquipe) await avisarCancelamentoPorEmail(inscricao, ator.id);
}

// DELETE /inscricoes/:id — a equipe cancela a inscricao de qualquer aluno; o professor, so nos eventos
// dele (mesma regra do aluno)
async function remover(id: string, ator: QuemCancela) {
  await inscricaoDoAtorOuFalhar(ator, id);
  await cancelar(id, ator);
}

// DELETE /eventos/:eventoId/inscricoes — o aluno cancela a PROPRIA inscricao (participante do token)
async function cancelarPeloAluno(eventoId: string, participanteId: string, atorId: string) {
  const inscricao = await prisma.inscricao.findUnique({
    where: { participanteId_eventoId: { participanteId, eventoId } },
    select: { id: true },
  });
  if (!inscricao) throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Você não está inscrito neste evento.");
  await cancelar(inscricao.id, { id: atorId, perfil: "ALUNO" });
}

// dispara o email de confirmacao, so pro proprio dono da inscricao
// e-mail de confirmacao, enviado pelo proprio backend logo depois de criar a inscricao (autoinscricao,
// ou inscricao manual em evento que ainda nao comecou) — nao depende mais da tela fazer uma segunda
// chamada. Falha no envio nao desfaz a inscricao (que ja foi gravada): fica na auditoria e o retorno
// avisa quem chamou. Devolve true se o e-mail saiu (ou foi simulado, sem SendGrid configurado)
export async function enviarConfirmacaoPorEmail(inscricaoId: string, atorId: string): Promise<boolean> {
  try {
    const inscricao = await prisma.inscricao.findUnique({
      where: { id: inscricaoId },
      include: { participante: { include: COM_CONTA_DO_ALUNO }, evento: { include: { palestrante: true } } },
    });
    // nome e e-mail do aluno vem da conta dele (o participante so guarda o RGM); sem conta, sem e-mail
    const participante = inscricao ? participanteParaDominio(inscricao.participante) : null;
    if (!inscricao || !participante?.email) return false;

    const resultado = await emailService.enviarConfirmacaoInscricao(participante.email, {
      participanteNome: participante.nome,
      eventoTitulo: inscricao.evento.titulo,
      eventoTema: inscricao.evento.tema,
      palestranteNome: inscricao.evento.palestrante.nome,
      eventoHorario: inscricao.evento.horario,
    });
    await registrarAuditoria(
      atorId,
      "EMAIL_ENVIADO",
      `confirmação de inscrição, inscrição ${inscricaoId}${resultado === "simulado" ? " (simulado: SendGrid não configurado)" : ""}`,
    );
    return true;
  } catch {
    // email.service.ts ja loga o detalhe sanitizado da falha
    await registrarAuditoria(atorId, "EMAIL_FALHA", `confirmação de inscrição, inscrição ${inscricaoId}: falha no envio`);
    return false;
  }
}

export const inscricoesService = {
  listar,
  listarParaGestao,
  buscarOuFalhar,
  criarManual,
  atualizarCheckin,
  remover,
  cancelarPeloAluno,
};
