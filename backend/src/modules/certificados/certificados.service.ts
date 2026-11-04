import { randomBytes, randomUUID } from "crypto";
import { Prisma, type Certificado as CertificadoDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { registrarAuditoria } from "../../utils/auditoria";
import { temCertificado } from "../../utils/certificado";
import { chaveIp, estaBloqueado, incrementarTentativa } from "../../utils/limiteAcesso";
import { PERCENTUAL_APROVACAO } from "../../utils/questionario";
import { COM_CONTA_DO_ALUNO, paraDominio as participanteParaDominio } from "../participantes/participantes.service";
import type { Certificado, Perfil } from "../../types/domain";
import { ALFABETO_CODIGO_VALIDACAO, codigoValidacaoSchema, TAMANHO_CODIGO_VALIDACAO } from "./certificados.schemas";

// consultas publicas de validacao por IP antes do bloqueio de 15 min (utils/limiteAcesso.ts). Conta
// TODA consulta, nao so codigo errado: quem confere certificado de verdade faz poucas por vez
const LIMITE_VALIDACOES_POR_IP = 30;
// colisao de codigo aleatorio de 60 bits e praticamente impossivel; se acontecer, sorteia de novo
const MAX_SORTEIOS_CODIGO = 3;

interface FiltrosListagem {
  eventoId?: string;
  participanteId?: string;
}

// quem pede a emissao: aluno so a propria inscricao, equipe qualquer uma
interface Solicitante {
  id: string;
  perfil: Perfil;
  participanteId: string | null;
}

// o evento e o aluno do certificado vem da inscricao (o snapshot guarda so o que vai impresso)
const COM_INSCRICAO = { inscricao: { select: { eventoId: true, participanteId: true } } } as const;
type CertificadoComInscricao = CertificadoDb & { inscricao: { eventoId: string; participanteId: string } };

// prisma devolve datas como Date — o resto do app espera string ISO
function paraDominio({ inscricao, ...certificado }: CertificadoComInscricao): Certificado {
  return {
    ...certificado,
    eventoId: inscricao.eventoId,
    participanteId: inscricao.participanteId,
    dataEvento: certificado.dataEvento.toISOString(),
    emitidoEm: certificado.emitidoEm.toISOString(),
  };
}

// 12 simbolos sorteados com crypto.randomBytes (60 bits), sem relacao com id de inscricao, aluno ou
// evento: nao da pra deduzir o codigo de um certificado a partir de outro. 256 e multiplo de 32,
// entao "byte % 32" nao favorece nenhum simbolo
function gerarCodigoValidacao(): string {
  return Array.from(randomBytes(TAMANHO_CODIGO_VALIDACAO), (byte) => ALFABETO_CODIGO_VALIDACAO[byte % ALFABETO_CODIGO_VALIDACAO.length]).join("");
}

function descreverSolicitante(perfil: Perfil): string {
  if (perfil === "ALUNO") return "pelo próprio aluno";
  return perfil === "SECRETARIA" ? "pela secretaria" : "pelo administrador";
}

// certificados ja emitidos, mais recentes primeiro (filtro por evento e/ou aluno)
async function listar(filtros: FiltrosListagem) {
  const certificados = await prisma.certificado.findMany({
    where: { inscricao: { eventoId: filtros.eventoId, participanteId: filtros.participanteId } },
    include: COM_INSCRICAO,
    orderBy: { emitidoEm: "desc" },
  });
  return certificados.map(paraDominio);
}

// RF018/RF019: na primeira emissao confere os requisitos (presenca PRESENTE + nota minima, a mesma
// regra de utils/certificado.ts) e grava o certificado com a copia dos dados impressos. Nas
// seguintes devolve o MESMO registro, sem regerar codigo nem dados. "novo" diz qual dos dois foi
async function emitir(inscricaoId: string, solicitante: Solicitante): Promise<{ certificado: Certificado; novo: boolean }> {
  const inscricao = await prisma.inscricao.findUnique({
    where: { id: inscricaoId },
    include: {
      certificado: { include: COM_INSCRICAO },
      participante: { include: COM_CONTA_DO_ALUNO },
      evento: { include: { palestrante: { select: { nome: true } } } },
    },
  });
  if (!inscricao) throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Inscrição não encontrada.");
  if (solicitante.perfil === "ALUNO" && inscricao.participanteId !== solicitante.participanteId) {
    throw AppError.acessoNegado("Você só pode emitir o certificado das suas próprias inscrições.");
  }

  const referencia = `inscrição ${inscricaoId}, evento ${inscricao.eventoId}, participante ${inscricao.participanteId}`;
  const quem = descreverSolicitante(solicitante.perfil);

  if (inscricao.certificado) {
    await registrarAuditoria(
      solicitante.id,
      "CERTIFICADO_EMITIDO",
      `certificado ${inscricao.certificado.id} (${referencia}): nova via do certificado já emitido, baixada ${quem}`,
    );
    return { certificado: paraDominio(inscricao.certificado), novo: false };
  }

  if (!(await temCertificado(inscricao.participanteId, inscricao.eventoId))) {
    throw AppError.conflito(
      "CERTIFICADO_NAO_LIBERADO",
      inscricao.statusPresenca !== "PRESENTE"
        ? "O certificado só é liberado depois da confirmação de presença no check-in."
        : `O certificado só é liberado depois de atingir ${PERCENTUAL_APROVACAO}% de acertos no questionário do evento.`,
    );
  }

  // nome vem da conta do aluno e RGM do participante (ver participantes.service.ts)
  const participante = participanteParaDominio(inscricao.participante);
  const dadosImpressos = {
    inscricaoId,
    nomeParticipante: participante.nome,
    rgm: participante.rgm,
    tituloEvento: inscricao.evento.titulo,
    temaEvento: inscricao.evento.tema,
    nomePalestrante: inscricao.evento.palestrante.nome,
    dataEvento: inscricao.evento.horario,
    cargaHoraria: inscricao.evento.cargaHoraria,
  };

  for (let sorteio = 1; ; sorteio++) {
    try {
      const certificado = await prisma.certificado.create({
        data: { id: randomUUID(), codigoValidacao: gerarCodigoValidacao(), ...dadosImpressos },
        include: COM_INSCRICAO,
      });
      await registrarAuditoria(solicitante.id, "CERTIFICADO_EMITIDO", `certificado ${certificado.id} (${referencia}): primeira emissão, ${quem}`);
      return { certificado: paraDominio(certificado), novo: true };
    } catch (erro) {
      if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== "P2002") throw erro;
      // dois cliques ao mesmo tempo na mesma inscricao: o outro gravou primeiro, devolve o dele
      const existente = await prisma.certificado.findUnique({ where: { inscricaoId }, include: COM_INSCRICAO });
      if (existente) return { certificado: paraDominio(existente), novo: false };
      // senao foi o codigo sorteado que ja existia: sorteia outro
      if (sorteio >= MAX_SORTEIOS_CODIGO) throw erro;
    }
  }
}

// RF027: consulta publica (sem token) pelo codigo impresso no PDF. Toda consulta conta no limite
// do IP — com o bloqueio ativo nem consulta o banco. Codigo fora do formato = nao encontrado
async function validar(codigoDigitado: string, ip: string): Promise<Certificado> {
  const chave = chaveIp("validacao", ip);
  if (await estaBloqueado(chave)) {
    throw new AppError(429, "MUITAS_TENTATIVAS", "Muitas consultas seguidas. Tente novamente em alguns minutos.");
  }
  await incrementarTentativa(chave, LIMITE_VALIDACOES_POR_IP);

  const codigo = codigoValidacaoSchema.safeParse(codigoDigitado);
  const certificado = codigo.success
    ? await prisma.certificado.findUnique({ where: { codigoValidacao: codigo.data }, include: COM_INSCRICAO })
    : null;
  if (!certificado) throw AppError.naoEncontrado("CERTIFICADO_NAO_ENCONTRADO", "Certificado não encontrado.");
  return paraDominio(certificado);
}

export const certificadosService = { listar, emitir, validar };
