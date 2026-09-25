import { randomUUID } from "crypto";
import type { Usuario as UsuarioDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { conferirSenha, gerarHashSenha } from "../../utils/password";
import { assinarToken, duracaoEmSegundos } from "../../utils/jwt";
import { usuarioParaDTO } from "../../utils/dto";
import { criptografar, descriptografar, indiceBusca } from "../../utils/criptografia";
import { registrarAuditoria } from "../../utils/auditoria";
import { env } from "../../config/env";
import { emailService } from "../email/email.service";
import type { Usuario } from "../../types/domain";
import type { ConfirmarRecuperacaoInput, LoginInput, RegistroInput, SolicitarRecuperacaoInput } from "./auth.schemas";

const CODIGO_VALIDADE_MS = 15 * 60 * 1000; // 15 min

// prisma devolve criadoEm como Date e nome/emailLogin/rgm cifrados — decifra e converte pro
// formato que o resto do app espera (reaproveitado em usuarios.routes.ts)
export function usuarioParaDominio(usuario: UsuarioDb): Usuario {
  return {
    ...usuario,
    nome: descriptografar(usuario.nome),
    emailLogin: descriptografar(usuario.emailLogin),
    rgm: usuario.rgm ? descriptografar(usuario.rgm) : null,
    consentimentoLgpdEm: usuario.consentimentoLgpdEm ? usuario.consentimentoLgpdEm.toISOString() : null,
    criadoEm: usuario.criadoEm.toISOString(),
  };
}

// cria o Participante e o Usuario ALUNO vinculado, checa duplicidade de email/rgm antes
// pelo indice de busca (hash deterministico), ja que email/rgm ficam cifrados no banco
async function registrarAluno(dados: RegistroInput) {
  const emailHash = indiceBusca(dados.emailInstitucional);
  const rgmHash = indiceBusca(dados.rgm);

  const emailDuplicado = await prisma.usuario.findUnique({ where: { emailLoginHash: emailHash } });
  if (emailDuplicado) {
    throw AppError.conflito("EMAIL_DUPLICADO", "Já existe uma conta com este e-mail.");
  }

  const rgmDuplicado = await prisma.participante.findUnique({ where: { rgmHash } });
  if (rgmDuplicado) {
    throw AppError.conflito("RGM_DUPLICADO", "Já existe um cadastro com este RGM.");
  }

  const senhaHash = await gerarHashSenha(dados.senha);

  const participante = await prisma.participante.create({
    data: {
      id: randomUUID(),
      nome: criptografar(dados.nomeCompleto),
      email: criptografar(dados.emailInstitucional),
      emailHash,
      rgm: criptografar(dados.rgm),
      rgmHash,
    },
  });

  const usuario = await prisma.usuario.create({
    data: {
      id: randomUUID(),
      nome: criptografar(dados.nomeCompleto),
      emailLogin: criptografar(dados.emailInstitucional),
      emailLoginHash: emailHash,
      senhaHash,
      perfil: "ALUNO",
      rgm: criptografar(dados.rgm),
      participanteId: participante.id,
      // aceiteLgpd ja foi validado como obrigatoriamente true no schema — registra o momento exato
      consentimentoLgpdEm: new Date(),
    },
  });

  await registrarAuditoria(usuario.id, "USUARIO_REGISTRADO", "cadastro publico de aluno");

  return usuarioParaDTO(usuarioParaDominio(usuario));
}

// confere email+senha e devolve o token assinado
async function login(dados: LoginInput) {
  const usuario = await prisma.usuario.findUnique({
    where: { emailLoginHash: indiceBusca(dados.emailLogin) },
    include: { participante: true },
  });
  // mensagem generica pra nao dar dica se foi email ou senha que errou
  const senhaOk = usuario ? await conferirSenha(dados.senha, usuario.senhaHash) : false;
  if (!usuario || !senhaOk) {
    // nunca grava o e-mail tentado (PII) no log — so se o usuario existe ou nao
    await registrarAuditoria(usuario?.id ?? null, "LOGIN_FALHA", usuario ? "senha incorreta" : "e-mail nao encontrado");
    throw new AppError(401, "CREDENCIAIS_INVALIDAS", "E-mail ou senha inválidos.");
  }

  if (usuario.perfil === "ALUNO" && usuario.participante && !usuario.participante.ativo) {
    await registrarAuditoria(usuario.id, "LOGIN_FALHA", "conta inativa");
    throw new AppError(
      403,
      "USUARIO_INATIVO",
      "Seu acesso foi inativado. Entre em contato com a secretaria.",
    );
  }

  await registrarAuditoria(usuario.id, "LOGIN_SUCESSO");

  const token = assinarToken({ sub: usuario.id, perfil: usuario.perfil, participanteId: usuario.participanteId });

  return {
    token,
    tokenType: "Bearer",
    expiresIn: duracaoEmSegundos(env.jwtExpiresIn),
    usuario: usuarioParaDTO(usuarioParaDominio(usuario)),
  };
}

// acha usuario pelo email de login (via indice de busca), usado na recuperacao de senha
function buscarUsuarioPorEmail(email: string) {
  return prisma.usuario.findUnique({ where: { emailLoginHash: indiceBusca(email) } });
}

// gera um codigo numerico de 6 digitos
function gerarCodigoNumerico(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// gera o codigo de recuperacao, salva com validade de 15min e dispara o email
async function solicitarRecuperacaoSenha(dados: SolicitarRecuperacaoInput) {
  const usuario = await buscarUsuarioPorEmail(dados.email);
  if (!usuario) {
    throw AppError.naoEncontrado("USUARIO_NAO_ENCONTRADO", "Não encontramos conta com esse e-mail.");
  }

  const codigo = gerarCodigoNumerico();
  await prisma.recuperacaoSenha.create({
    data: {
      id: randomUUID(),
      usuarioId: usuario.id,
      codigo,
      expiraEm: new Date(Date.now() + CODIGO_VALIDADE_MS),
    },
  });

  // falha de envio nao pode travar a recuperacao — em demo o codigoDemo abaixo
  // resolve isso mesmo assim, e nem toda falha de provedor deveria bloquear o fluxo
  // usa dados.email (ja veio em texto puro do request) em vez de descriptografar usuario.emailLogin
  try {
    await emailService.enviarCodigoRecuperacao(dados.email, codigo);
  } catch (erro) {
    console.error("[recuperacao-senha] falha ao enviar e-mail:", erro);
  }

  // fora de producao devolve o codigo no corpo tb, so pra testar sem e-mail configurado
  return env.isProduction ? {} : { codigoDemo: codigo };
}

// confere o codigo e troca a senha
async function confirmarRecuperacaoSenha(dados: ConfirmarRecuperacaoInput) {
  const usuario = await buscarUsuarioPorEmail(dados.email);
  if (!usuario) {
    throw AppError.naoEncontrado("USUARIO_NAO_ENCONTRADO", "Não encontramos conta com esse e-mail.");
  }

  const pendente = await prisma.recuperacaoSenha.findFirst({
    where: { usuarioId: usuario.id, codigo: dados.codigo, usadoEm: null, expiraEm: { gt: new Date() } },
    orderBy: { criadoEm: "desc" },
  });
  if (!pendente) {
    throw new AppError(422, "CODIGO_INVALIDO", "Código inválido ou expirado.");
  }

  const novaSenhaHash = await gerarHashSenha(dados.novaSenha);
  await prisma.$transaction([
    prisma.usuario.update({ where: { id: usuario.id }, data: { senhaHash: novaSenhaHash } }),
    prisma.recuperacaoSenha.update({ where: { id: pendente.id }, data: { usadoEm: new Date() } }),
  ]);
}

export const authService = {
  registrarAluno,
  login,
  solicitarRecuperacaoSenha,
  confirmarRecuperacaoSenha,
};
