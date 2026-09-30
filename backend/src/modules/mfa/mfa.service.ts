import { randomInt, randomUUID } from "crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { criptografar, descriptografar, indiceBusca } from "../../utils/criptografia";
import { lerDadoPessoal } from "../../utils/dadosPessoais";
import { conferirSenha } from "../../utils/password";
import { registrarAuditoria } from "../../utils/auditoria";
import { chaveConta, estaBloqueado, incrementarTentativa, limparTentativas } from "../../utils/limiteAcesso";
import { emitirSessao } from "../auth/auth.service";
import type { DesativarMfaInput, VerificarMfaInput } from "./mfa.schemas";

const EMISSOR = "SGEA";
// TOTP padrao (RFC 6238): 6 digitos, passo de 30s, tolerancia de 1 passo pra tras e pra frente
const DIGITOS = 6;
const PERIODO_S = 30;
const TOLERANCIA_S = 30;
const QTD_CODIGOS_RECUPERACAO = 8;
// sem 0/O e 1/I, que se confundem na hora de digitar
const ALFABETO_RECUPERACAO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const MFA_ZERADO = { mfaAtivo: false, mfaSegredoCifrado: null, mfaUltimoPasso: null, mfaAtivadoEm: null };

type ResultadoCodigo = "ok" | "invalido" | "reusado";

function chaveMfa(usuarioId: string): string {
  return chaveConta("mfa", usuarioId);
}

function erroCodigoInvalido(): AppError {
  return new AppError(422, "CODIGO_MFA_INVALIDO", "Código inválido.");
}

function descreverFalha(resultado: ResultadoCodigo): string {
  return resultado === "reusado" ? "código já utilizado" : "código incorreto";
}

// 10 caracteres (~50 bits) no formato XXXXX-XXXXX
function gerarCodigoRecuperacao(): string {
  let codigo = "";
  for (let i = 0; i < 10; i++) codigo += ALFABETO_RECUPERACAO[randomInt(ALFABETO_RECUPERACAO.length)];
  return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
}

// HMAC com a chave do servidor: da pra achar o codigo pelo hash, mas nao voltar do hash pro codigo
function hashCodigoRecuperacao(codigo: string): string {
  return indiceBusca(`mfa-recuperacao:${codigo.replace(/[^a-z0-9]/gi, "").toUpperCase()}`);
}

async function garantirNaoBloqueado(usuarioId: string, contexto: string) {
  if (await estaBloqueado(chaveMfa(usuarioId))) {
    await registrarAuditoria(usuarioId, "MFA_BLOQUEADO", `${contexto}: bloqueado temporariamente (limite de tentativas)`);
    throw new AppError(429, "MUITAS_TENTATIVAS", "Muitas tentativas. Tente novamente em alguns minutos.");
  }
}

async function registrarFalha(usuarioId: string, contexto: string, motivo: string) {
  await registrarAuditoria(usuarioId, "MFA_FALHA", `${contexto}: ${motivo}`);
  await incrementarTentativa(chaveMfa(usuarioId));
  if (await estaBloqueado(chaveMfa(usuarioId))) {
    await registrarAuditoria(usuarioId, "MFA_BLOQUEADO", `${contexto}: limite de tentativas atingido`);
  }
}

// confere o codigo TOTP e grava o passo de tempo usado. Um codigo do mesmo passo (ou anterior)
// que um ja aceito e recusado, e a gravacao so acontece se ninguem gravou um passo igual/maior no
// meio tempo — duas requisicoes com o mesmo codigo ao mesmo tempo nao passam as duas
async function conferirCodigoTotp(
  usuario: { id: string; mfaSegredoCifrado: string | null; mfaUltimoPasso: number | null },
  codigo: string,
): Promise<ResultadoCodigo> {
  if (!usuario.mfaSegredoCifrado) return "invalido";

  let resultado;
  try {
    resultado = await verify({
      secret: descriptografar(usuario.mfaSegredoCifrado),
      token: codigo,
      digits: DIGITOS,
      period: PERIODO_S,
      epochTolerance: TOLERANCIA_S,
    });
  } catch {
    return "invalido";
  }
  // o tipo de retorno do verify() tambem cobre HOTP (sem timeStep); aqui e sempre TOTP
  if (!resultado.valid || !("timeStep" in resultado)) return "invalido";
  const passo = resultado.timeStep;
  if (usuario.mfaUltimoPasso !== null && passo <= usuario.mfaUltimoPasso) return "reusado";

  const { count } = await prisma.usuario.updateMany({
    where: { id: usuario.id, OR: [{ mfaUltimoPasso: null }, { mfaUltimoPasso: { lt: passo } }] },
    data: { mfaUltimoPasso: passo },
  });
  return count === 1 ? "ok" : "reusado";
}

// gera (ou reaproveita, se ja tem uma configuracao pendente) o segredo e devolve o QR code.
// Reaproveitar evita que duas chamadas seguidas (duplo clique, aba recarregada) troquem o segredo
// por baixo do QR code que o usuario ja escaneou. O QR code e gerado aqui no servidor: mandar o
// otpauth:// pra um servico externo de QR code entregaria o segredo a terceiros
async function iniciarConfiguracao(usuarioId: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw AppError.naoAutenticado();
  if (usuario.mfaAtivo) throw AppError.conflito("MFA_JA_ATIVO", "A autenticação em dois fatores já está ativa.");

  let segredo: string;
  if (usuario.mfaSegredoCifrado) {
    segredo = descriptografar(usuario.mfaSegredoCifrado);
  } else {
    const novo = generateSecret();
    const { count } = await prisma.usuario.updateMany({
      where: { id: usuarioId, mfaAtivo: false, mfaSegredoCifrado: null },
      data: { mfaSegredoCifrado: criptografar(novo), mfaUltimoPasso: null },
    });
    if (count === 1) {
      segredo = novo;
    } else {
      // outra chamada gravou um segredo primeiro: usa o dela
      const atual = await prisma.usuario.findUnique({ where: { id: usuarioId } });
      if (!atual?.mfaSegredoCifrado || atual.mfaAtivo) {
        throw AppError.conflito("MFA_JA_ATIVO", "A autenticação em dois fatores já está ativa.");
      }
      segredo = descriptografar(atual.mfaSegredoCifrado);
    }
  }

  const uri = generateURI({
    issuer: EMISSOR,
    label: lerDadoPessoal(usuario.emailLogin),
    secret: segredo,
    digits: DIGITOS,
    period: PERIODO_S,
  });
  const qrCode = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 240 });

  return { qrCode, segredo };
}

// confirma a configuracao com um codigo valido: so aqui o 2FA passa a valer. Gera os 8 codigos de
// recuperacao (devolvidos uma unica vez, so o hash fica gravado)
async function confirmarConfiguracao(usuarioId: string, codigo: string) {
  await garantirNaoBloqueado(usuarioId, "configuração");

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw AppError.naoAutenticado();
  if (usuario.mfaAtivo) throw AppError.conflito("MFA_JA_ATIVO", "A autenticação em dois fatores já está ativa.");
  if (!usuario.mfaSegredoCifrado) throw AppError.conflito("MFA_NAO_INICIADO", "Gere o QR code antes de confirmar.");

  const resultado = await conferirCodigoTotp(usuario, codigo);
  if (resultado !== "ok") {
    await registrarFalha(usuarioId, "configuração", descreverFalha(resultado));
    throw erroCodigoInvalido();
  }
  await limparTentativas(chaveMfa(usuarioId));

  const codigosRecuperacao = Array.from({ length: QTD_CODIGOS_RECUPERACAO }, gerarCodigoRecuperacao);
  await prisma.$transaction([
    prisma.codigoRecuperacaoMfa.deleteMany({ where: { usuarioId } }),
    prisma.codigoRecuperacaoMfa.createMany({
      data: codigosRecuperacao.map((c) => ({ id: randomUUID(), usuarioId, codigoHash: hashCodigoRecuperacao(c) })),
    }),
    prisma.usuario.update({ where: { id: usuarioId }, data: { mfaAtivo: true, mfaAtivadoEm: new Date() } }),
  ]);
  await registrarAuditoria(
    usuarioId,
    "MFA_ATIVADO",
    `aplicativo autenticador configurado; ${QTD_CODIGOS_RECUPERACAO} códigos de recuperação gerados`,
  );

  return { codigosRecuperacao };
}

// segunda etapa do login: codigo do aplicativo ou codigo de recuperacao (cada um vale uma vez)
async function verificarLogin(usuarioId: string, dados: VerificarMfaInput) {
  await garantirNaoBloqueado(usuarioId, "login");

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario || !usuario.mfaAtivo) throw AppError.naoAutenticado("Sessão inválida. Faça login novamente.");

  let codigosRecuperacaoRestantes: number | undefined;
  if (dados.codigoRecuperacao) {
    const { count } = await prisma.codigoRecuperacaoMfa.updateMany({
      where: { usuarioId, codigoHash: hashCodigoRecuperacao(dados.codigoRecuperacao), usadoEm: null },
      data: { usadoEm: new Date() },
    });
    if (count !== 1) {
      await registrarFalha(usuarioId, "login", "código de recuperação inválido ou já utilizado");
      throw erroCodigoInvalido();
    }
    codigosRecuperacaoRestantes = await prisma.codigoRecuperacaoMfa.count({ where: { usuarioId, usadoEm: null } });
    await registrarAuditoria(usuarioId, "CODIGO_RECUPERACAO_USADO", `restam ${codigosRecuperacaoRestantes} código(s)`);
  } else {
    const resultado = await conferirCodigoTotp(usuario, dados.codigo ?? "");
    if (resultado !== "ok") {
      await registrarFalha(usuarioId, "login", descreverFalha(resultado));
      throw erroCodigoInvalido();
    }
  }

  await limparTentativas(chaveMfa(usuarioId));
  await registrarAuditoria(
    usuarioId,
    "MFA_VERIFICADO",
    dados.codigoRecuperacao ? "login: código de recuperação" : "login: aplicativo autenticador",
  );
  await registrarAuditoria(usuarioId, "LOGIN_SUCESSO");

  return { ...emitirSessao(usuario), codigosRecuperacaoRestantes };
}

// o 2FA e opcional pra qualquer perfil: quem ativou pode desativar. Exige senha + codigo atual e
// encerra as outras sessoes (versaoToken); a sessao de quem desativou e reemitida na resposta
async function desativar(usuarioId: string, dados: DesativarMfaInput) {
  await garantirNaoBloqueado(usuarioId, "desativação");

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw AppError.naoAutenticado();
  if (!usuario.mfaAtivo) throw AppError.conflito("MFA_INATIVO", "A autenticação em dois fatores não está ativa.");

  // senha errada nem chega a conferir o codigo (nao gasta o passo de tempo do codigo certo)
  const senhaOk = await conferirSenha(dados.senha, usuario.senhaHash);
  const resultado: ResultadoCodigo = senhaOk ? await conferirCodigoTotp(usuario, dados.codigo) : "invalido";
  if (!senhaOk || resultado !== "ok") {
    await registrarFalha(usuarioId, "desativação", senhaOk ? descreverFalha(resultado) : "senha incorreta");
    throw new AppError(422, "CREDENCIAIS_MFA_INVALIDAS", "Senha ou código incorretos.");
  }
  await limparTentativas(chaveMfa(usuarioId));

  const [, atualizado] = await prisma.$transaction([
    prisma.codigoRecuperacaoMfa.deleteMany({ where: { usuarioId } }),
    prisma.usuario.update({ where: { id: usuarioId }, data: { ...MFA_ZERADO, versaoToken: { increment: 1 } } }),
  ]);
  await registrarAuditoria(usuarioId, "MFA_DESATIVADO", "desativado pelo próprio titular; outras sessões encerradas");

  return emitirSessao(atualizado);
}

// zera o 2FA de outro usuario (perdeu o celular): encerra as sessoes dele, que volta a entrar so
// com a senha e pode ativar o 2FA de novo em "Minha conta". atorId null = script de emergencia
// pela linha de comando, sem usuario do sistema por tras
async function resetar(alvoId: string, atorId: string | null, origem: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: alvoId }, select: { id: true } });
  if (!usuario) throw AppError.naoEncontrado("USUARIO_NAO_ENCONTRADO", "Usuário não encontrado.");

  await prisma.$transaction([
    prisma.codigoRecuperacaoMfa.deleteMany({ where: { usuarioId: alvoId } }),
    prisma.usuario.update({ where: { id: alvoId }, data: { ...MFA_ZERADO, versaoToken: { increment: 1 } } }),
  ]);
  await limparTentativas(chaveMfa(alvoId));
  await registrarAuditoria(atorId, "MFA_RESETADO", `usuário ${alvoId} (${origem})`);
}

export const mfaService = {
  chaveMfa,
  iniciarConfiguracao,
  confirmarConfiguracao,
  verificarLogin,
  desativar,
  resetar,
};
