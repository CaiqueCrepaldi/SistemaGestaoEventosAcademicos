import { Prisma, type Participante as ParticipanteDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { criptografar, descriptografar, indiceBusca } from "../../utils/criptografia";
import { registrarAuditoria } from "../../utils/auditoria";
import type { Participante } from "../../types/domain";
import type { ParticipanteUpdateInput } from "./participantes.schemas";

// prisma devolve criadoEm como Date e nome/email/rgm cifrados — decifra e converte pro formato do resto do app
function paraDominio(participante: ParticipanteDb): Participante {
  return {
    ...participante,
    nome: descriptografar(participante.nome),
    email: descriptografar(participante.email),
    rgm: descriptografar(participante.rgm),
    criadoEm: participante.criadoEm.toISOString(),
  };
}

// lista participantes ordenados por nome — a ordenacao tem que ser depois de decifrar,
// porque nome cifrado nao tem ordem alfabetica nenhuma no banco
async function listar() {
  const participantes = await prisma.participante.findMany();
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

async function atualizar(id: string, dados: ParticipanteUpdateInput, atorId: string) {
  const atual = await buscarOuFalhar(id);

  if (dados.ativo === false && !dados.motivoInativacao?.trim()) {
    throw AppError.validacao("Informe o motivo da inativação.", [
      { campo: "motivoInativacao", mensagem: "O motivo da inativação é obrigatório." },
    ]);
  }

  // recifra nome/email/rgm se vieram no corpo, recalculando o indice de busca dos que mudaram
  const dadosCifrados: Prisma.ParticipanteUpdateInput = { ...dados };
  if (dados.nome !== undefined) dadosCifrados.nome = criptografar(dados.nome);
  if (dados.email !== undefined) {
    dadosCifrados.email = criptografar(dados.email);
    dadosCifrados.emailHash = indiceBusca(dados.email);
  }
  if (dados.rgm !== undefined) {
    dadosCifrados.rgm = criptografar(dados.rgm);
    dadosCifrados.rgmHash = indiceBusca(dados.rgm);
  }

  try {
    const participante = await prisma.participante.update({
      where: { id },
      data: dados.ativo === true ? { ...dadosCifrados, motivoInativacao: null } : dadosCifrados,
    });

    // so conta como mudanca de status se o valor de fato mudou (o formulario manda "ativo" em toda edicao)
    const statusMudou = dados.ativo !== undefined && dados.ativo !== atual.ativo;
    // o motivo da inativacao eh texto livre e pode ter dado pessoal: fica so no cadastro, nunca no log
    if (statusMudou && dados.ativo === false) {
      await registrarAuditoria(atorId, "PARTICIPANTE_INATIVADO", `participante ${id} (motivo registrado no cadastro)`);
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

export const participantesService = { listar, buscarOuFalhar, atualizar, remover };
