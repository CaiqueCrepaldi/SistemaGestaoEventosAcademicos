import { Prisma, type Participante as ParticipanteDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { indiceBusca } from "../../utils/criptografia";
import { lerDadoPessoal } from "../../utils/dadosPessoais";
import { registrarAuditoria } from "../../utils/auditoria";
import type { Participante } from "../../types/domain";
import type { ParticipanteUpdateInput } from "./participantes.schemas";

// prisma devolve criadoEm como Date — converte pro formato do resto do app. nome/email/rgm podem
// estar no formato antigo (cifrado) ate a conversao dos dados, por isso passam por lerDadoPessoal
function paraDominio(participante: ParticipanteDb): Participante {
  return {
    ...participante,
    nome: lerDadoPessoal(participante.nome),
    email: lerDadoPessoal(participante.email),
    rgm: lerDadoPessoal(participante.rgm),
    criadoEm: participante.criadoEm.toISOString(),
  };
}

// lista participantes ordenados por nome (ordenado depois de ler, pra valer tambem pros registros
// que ainda estao no formato antigo)
async function listar() {
  const participantes = await prisma.participante.findMany();
  return participantes.map(paraDominio).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// so os alunos: participantes com conta de acesso de perfil ALUNO, em ordem alfabetica — usado
// pelo check-in, que mostra todos sem precisar digitar nada
async function listarAlunos() {
  const participantes = await prisma.participante.findMany({
    where: { usuarios: { some: { perfil: "ALUNO" } } },
  });
  return participantes.map(paraDominio).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// busca um participante pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const participante = await prisma.participante.findUnique({ where: { id } });
  if (!participante) throw AppError.naoEncontrado("PARTICIPANTE_NAO_ENCONTRADO", "Participante não encontrado.");
  return paraDominio(participante);
}

function relancarComoConflito(erro: unknown): never {
  if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
    throw AppError.conflito("DUPLICIDADE_PARTICIPANTE", "Já existe um participante com este e-mail ou RGM.");
  }
  throw erro;
}

// inativar = o aluno deixa de acessar o sistema: as sessoes abertas caem (versaoToken) e as
// inscricoes ainda pendentes em eventos que vao acontecer sao canceladas (liberam a vaga).
// Inscricao com presenca ja confirmada nao e tocada: dela sai o certificado, que continua valido
async function cancelarInscricoesFuturas(participanteId: string, atorId: string): Promise<number> {
  const futuras = await prisma.inscricao.findMany({
    where: { participanteId, statusPresenca: "PENDENTE", evento: { horario: { gt: new Date() } } },
    select: { id: true, eventoId: true },
  });
  if (futuras.length === 0) return 0;

  await prisma.inscricao.deleteMany({ where: { id: { in: futuras.map((f) => f.id) } } });
  for (const inscricao of futuras) {
    await registrarAuditoria(
      atorId,
      "INSCRICAO_CANCELADA",
      `inscrição ${inscricao.id} (evento ${inscricao.eventoId}, participante ${participanteId}) cancelada pela inativação do aluno`,
    );
  }
  return futuras.length;
}

async function atualizar(id: string, dados: ParticipanteUpdateInput, atorId: string) {
  const atual = await buscarOuFalhar(id);

  if (dados.ativo === false && !dados.motivoInativacao?.trim()) {
    throw AppError.validacao("Informe o motivo da inativação.", [
      { campo: "motivoInativacao", mensagem: "O motivo da inativação é obrigatório." },
    ]);
  }

  // nome/email/rgm gravados em texto puro; o indice de busca de e-mail/RGM continua sendo mantido
  // enquanto os registros antigos (cifrados) nao forem convertidos
  const dadosGravados: Prisma.ParticipanteUpdateInput = { ...dados };
  if (dados.email !== undefined) dadosGravados.emailHash = indiceBusca(dados.email);
  if (dados.rgm !== undefined) dadosGravados.rgmHash = indiceBusca(dados.rgm);

  // a conta de login do aluno guarda uma copia de nome/e-mail/RGM: corrigir so o participante
  // deixaria o login com o e-mail antigo e o nome antigo no topo da tela e na auditoria
  const dadosDaConta: Prisma.UsuarioUpdateManyMutationInput = {};
  if (dados.nome !== undefined) dadosDaConta.nome = dados.nome;
  if (dados.email !== undefined) {
    dadosDaConta.emailLogin = dados.email;
    dadosDaConta.emailLoginHash = indiceBusca(dados.email);
  }
  if (dados.rgm !== undefined) dadosDaConta.rgm = dados.rgm;

  try {
    const atualizacao = prisma.participante.update({
      where: { id },
      data: dados.ativo === true ? { ...dadosGravados, motivoInativacao: null } : dadosGravados,
    });
    const [participante] =
      Object.keys(dadosDaConta).length > 0
        ? await prisma.$transaction([
            atualizacao,
            prisma.usuario.updateMany({ where: { participanteId: id, perfil: "ALUNO" }, data: dadosDaConta }),
          ])
        : [await atualizacao];

    // so conta como mudanca de status se o valor de fato mudou (o formulario manda "ativo" em toda edicao)
    const statusMudou = dados.ativo !== undefined && dados.ativo !== atual.ativo;
    // o motivo da inativacao eh texto livre e pode ter dado pessoal: fica so no cadastro, nunca no log
    if (statusMudou && dados.ativo === false) {
      // sem subir a versao do token a sessao ja aberta continuaria valendo ate expirar (ate 8h)
      await prisma.usuario.updateMany({ where: { participanteId: id }, data: { versaoToken: { increment: 1 } } });
      const canceladas = await cancelarInscricoesFuturas(id, atorId);
      await registrarAuditoria(
        atorId,
        "PARTICIPANTE_INATIVADO",
        `participante ${id} (motivo registrado no cadastro; ${canceladas} inscrição(ões) em eventos futuros cancelada(s))`,
      );
    } else if (statusMudou && dados.ativo === true) {
      await registrarAuditoria(atorId, "PARTICIPANTE_REATIVADO", `participante ${id}`);
    }

    // edicao de dados (nome/e-mail/rgm/motivo) — grava so os nomes dos campos que mudaram, nunca os valores;
    // o motivo que acompanha uma inativacao ja esta coberto pelo log de inativacao, nao conta como edicao a parte
    const camposAlterados = (["nome", "email", "rgm", "motivoInativacao"] as const).filter(
      (campo) => dados[campo] !== undefined && dados[campo] !== atual[campo] && !(campo === "motivoInativacao" && statusMudou),
    );
    if (camposAlterados.length > 0 || !statusMudou) {
      await registrarAuditoria(
        atorId,
        "PARTICIPANTE_ATUALIZADO",
        `participante ${id} (campos: ${camposAlterados.length > 0 ? camposAlterados.join(", ") : "nenhum alterado"})`,
      );
    }

    return paraDominio(participante);
  } catch (erro) {
    relancarComoConflito(erro);
  }
}

// so remove participante inativo — e o usuario vinculado tem que ser ALUNO,
// administrador/secretaria nunca tem participante entao nunca cai aqui, mas
// a checagem fica como garantia extra: essas duas contas nao podem ser
// removidas de jeito nenhum
async function remover(id: string, atorId: string) {
  const participante = await buscarOuFalhar(id);

  if (participante.ativo !== false) {
    throw AppError.conflito(
      "PARTICIPANTE_ATIVO",
      "Só é possível remover um aluno depois de inativá-lo.",
    );
  }

  const usuario = await prisma.usuario.findFirst({ where: { participanteId: id } });
  if (usuario && usuario.perfil !== "ALUNO") {
    throw AppError.conflito("USUARIO_PROTEGIDO", "Administrador e secretaria não podem ser removidos.");
  }

  const [tentativas, feedbacks, inscricoes] = await prisma.$transaction([
    prisma.tentativaQuestionario.deleteMany({ where: { participanteId: id } }),
    prisma.feedback.deleteMany({ where: { participanteId: id } }),
    prisma.inscricao.deleteMany({ where: { participanteId: id } }),
    ...(usuario ? [prisma.usuario.delete({ where: { id: usuario.id } })] : []),
    prisma.participante.delete({ where: { id } }),
  ]);

  await registrarAuditoria(
    atorId,
    "PARTICIPANTE_REMOVIDO",
    `participante ${id} (removidos junto: ${inscricoes.count} inscrições, ${feedbacks.count} feedbacks, ` +
      `${tentativas.count} tentativas de questionário${usuario ? ", 1 conta de acesso" : ""})`,
  );
}

export const participantesService = { listar, listarAlunos, buscarOuFalhar, atualizar, remover };
