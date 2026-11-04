import { randomUUID } from "crypto";
import type { Inscricao as InscricaoDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { emailService } from "../email/email.service";
import { COM_CONTA_DO_ALUNO, paraDominio as participanteParaDominio } from "../participantes/participantes.service";
import { registrarAuditoria } from "../../utils/auditoria";
import type { Inscricao, Perfil, StatusPresenca } from "../../types/domain";
import type { InscricaoCheckinInput, InscricaoInput } from "./inscricoes.schemas";

interface FiltrosListagem {
  eventoId?: string;
  participanteId?: string;
  status?: StatusPresenca;
}

// prisma devolve as datas como Date, resto do app espera string (ISO) ou null
export function paraDominio(inscricao: InscricaoDb): Inscricao {
  return {
    ...inscricao,
    dataCheckin: inscricao.dataCheckin ? inscricao.dataCheckin.toISOString() : null,
    dataInscricao: inscricao.dataInscricao.toISOString(),
  };
}

// lista inscricoes filtradas, mais recente primeiro
async function listar(filtros: FiltrosListagem) {
  const inscricoes = await prisma.inscricao.findMany({
    where: {
      eventoId: filtros.eventoId,
      participanteId: filtros.participanteId,
      statusPresenca: filtros.status,
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

// inscricao manual feita por admin/secretaria, checa duplicidade e vaga
async function criarManual(dados: InscricaoInput, ator: { id: string; perfil: Perfil }) {
  const [participante, evento] = await Promise.all([
    prisma.participante.findUnique({ where: { id: dados.participanteId } }),
    prisma.evento.findUnique({ where: { id: dados.eventoId }, include: { sala: true } }),
  ]);

  const erros: { campo: string; mensagem: string }[] = [];
  if (!participante) erros.push({ campo: "participanteId", mensagem: "Participante não encontrado." });
  if (!evento) erros.push({ campo: "eventoId", mensagem: "Evento não encontrado." });
  if (erros.length > 0) throw AppError.validacao("Dados inválidos.", erros);
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
  const quem = ator.perfil === "SECRETARIA" ? "pela secretaria" : "pelo administrador";
  await registrarAuditoria(
    ator.id,
    "INSCRICAO_CRIADA",
    `inscrição ${inscricao.id} (evento ${dados.eventoId}, participante ${dados.participanteId}) feita ${quem}`,
  );
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

// muda o status de presenca (confirma, marca ausente ou reverte pra pendente)
async function atualizarCheckin(id: string, dados: InscricaoCheckinInput, usuarioIdDoToken: string) {
  const existente = await buscarOuFalhar(id);
  await garantirPresencaDestravada(existente.participanteId, existente.eventoId);

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

// quem cancela: o proprio aluno ou alguem da equipe (administrador/secretaria)
interface QuemCancela {
  id: string;
  perfil: Perfil;
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
  const quem = !pelaEquipe ? "pelo próprio aluno" : ator.perfil === "SECRETARIA" ? "pela secretaria" : "pelo administrador";
  await registrarAuditoria(
    ator.id,
    "INSCRICAO_CANCELADA",
    `inscrição ${id} (evento ${inscricao.eventoId}, participante ${inscricao.participanteId}) cancelada ${quem}`,
  );
  if (pelaEquipe) await avisarCancelamentoPorEmail(inscricao, ator.id);
}

// DELETE /inscricoes/:id — a equipe cancela a inscricao de qualquer aluno (mesma regra do aluno)
async function remover(id: string, ator: QuemCancela) {
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
async function confirmarEmail(id: string, participanteIdDoToken: string, atorId: string) {
  const inscricao = await prisma.inscricao.findUnique({
    where: { id },
    include: { participante: { include: COM_CONTA_DO_ALUNO }, evento: { include: { palestrante: true } } },
  });
  if (!inscricao) throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Inscrição não encontrada.");
  if (inscricao.participanteId !== participanteIdDoToken) {
    throw AppError.acessoNegado("Esta inscrição não pertence a você.");
  }

  // nome e e-mail do aluno vem da conta dele (o participante so guarda o RGM)
  const participante = participanteParaDominio(inscricao.participante);

  try {
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
      `confirmação de inscrição, inscrição ${id}${resultado === "simulado" ? " (simulado: SendGrid não configurado)" : ""}`,
    );
  } catch (erro) {
    await registrarAuditoria(atorId, "EMAIL_FALHA", `confirmação de inscrição, inscrição ${id}: falha no envio`);
    throw erro;
  }

  return { destinatario: participante.email, enviadoEm: new Date().toISOString() };
}

export const inscricoesService = {
  listar,
  buscarOuFalhar,
  criarManual,
  atualizarCheckin,
  remover,
  cancelarPeloAluno,
  confirmarEmail,
};
