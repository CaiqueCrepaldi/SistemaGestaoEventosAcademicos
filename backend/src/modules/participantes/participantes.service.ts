import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { registrarAuditoria } from "../../utils/auditoria";
import { chavesBloqueadasAgora, contaBloqueada } from "../../utils/limiteAcesso";
import { normalizarEmail } from "../../utils/validacao";
import type { Participante, SituacaoConta } from "../../types/domain";
import type { ParticipanteUpdateInput } from "./participantes.schemas";

// a conta ALUNO vinculada: e dela que saem o nome e o e-mail do participante (o participante so
// guarda RGM e situacao). Toda leitura de participante que vira resposta da API inclui isto
export const COM_CONTA_DO_ALUNO = {
  usuarios: {
    where: { perfil: "ALUNO" },
    select: { id: true, nome: true, emailLogin: true, mfaAtivo: true },
    take: 1,
  },
} satisfies Prisma.ParticipanteInclude;

type ParticipanteComConta = Prisma.ParticipanteGetPayload<{ include: typeof COM_CONTA_DO_ALUNO }>;

// monta o participante no formato de sempre da API (nome/e-mail/rgm), juntando as duas tabelas.
// criadoEm vem como Date do prisma e vira ISO
export function paraDominio({ usuarios, ...participante }: ParticipanteComConta): Participante {
  const conta = usuarios[0];
  return {
    ...participante,
    // participante sem conta nao deveria existir (todo participante nasce do cadastro da conta)
    nome: conta?.nome ?? "",
    email: conta?.emailLogin ?? "",
    criadoEm: participante.criadoEm.toISOString(),
  };
}

// lista participantes ordenados por nome, junto com a situacao da conta de acesso do aluno: 2FA
// ativo e bloqueio por excesso de tentativas agora (o e-mail da conta so serve pra montar a chave
// do bloqueio; segredo do 2FA e hash de senha nem sao lidos)
async function listar(): Promise<(Participante & SituacaoConta)[]> {
  const [participantes, chavesBloqueadas] = await Promise.all([
    prisma.participante.findMany({ include: COM_CONTA_DO_ALUNO }),
    chavesBloqueadasAgora(),
  ]);

  return participantes
    .map((participante) => {
      const conta = participante.usuarios[0];
      return {
        ...paraDominio(participante),
        usuarioId: conta?.id ?? null,
        mfaAtivo: conta?.mfaAtivo ?? false,
        bloqueado: conta ? contaBloqueada(chavesBloqueadas, conta) : false,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// so os alunos: participantes com conta de acesso de perfil ALUNO, em ordem alfabetica — usado
// pelo check-in, que mostra todos sem precisar digitar nada
async function listarAlunos() {
  const participantes = await prisma.participante.findMany({
    where: { usuarios: { some: { perfil: "ALUNO" } } },
    include: COM_CONTA_DO_ALUNO,
  });
  return participantes.map(paraDominio).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// busca um participante pelo id, 404 se nao existir
async function buscarOuFalhar(id: string) {
  const participante = await prisma.participante.findUnique({ where: { id }, include: COM_CONTA_DO_ALUNO });
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

  // cada dado na sua tabela, sem copia: nome e e-mail (tambem o de login) na conta do aluno; RGM e
  // situacao no participante. Os dois juntos ou nenhum. E-mail ou RGM repetido -> P2002 -> 409
  const { nome, email, ...dadosDoParticipante } = dados;
  const dadosDaConta: Prisma.UsuarioUpdateManyMutationInput = {};
  if (nome !== undefined) dadosDaConta.nome = nome;
  if (email !== undefined) dadosDaConta.emailLogin = normalizarEmail(email);

  try {
    const participante = await prisma.$transaction(async (tx) => {
      if (Object.keys(dadosDaConta).length > 0) {
        await tx.usuario.updateMany({ where: { participanteId: id, perfil: "ALUNO" }, data: dadosDaConta });
      }
      // depois da conta, pra ja voltar com o nome/e-mail novos
      return tx.participante.update({
        where: { id },
        data: dados.ativo === true ? { ...dadosDoParticipante, motivoInativacao: null } : dadosDoParticipante,
        include: COM_CONTA_DO_ALUNO,
      });
    });

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

  // certificado emitido segura a inscricao (onDelete: Restrict no schema): o codigo impresso no PDF
  // precisa continuar validando. O banco barraria do mesmo jeito, isto so da uma mensagem melhor
  const certificados = await prisma.certificado.count({ where: { inscricao: { participanteId: id } } });
  if (certificados > 0) {
    throw AppError.conflito(
      "PARTICIPANTE_COM_CERTIFICADO",
      "Não é possível remover: o aluno tem certificado emitido, que precisa continuar válido para consulta.",
    );
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
