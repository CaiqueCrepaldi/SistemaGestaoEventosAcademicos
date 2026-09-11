import { randomUUID } from "crypto";
import type { Usuario as UsuarioDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { conferirSenha, gerarHashSenha } from "../../utils/password";
import { assinarToken, duracaoEmSegundos } from "../../utils/jwt";
import { usuarioParaDTO } from "../../utils/dto";
import { env } from "../../config/env";
import { emailService } from "../email/email.service";
import type { Usuario } from "../../types/domain";
import type { ConfirmarRecuperacaoInput, LoginInput, RegistroInput, SolicitarRecuperacaoInput } from "./auth.schemas";

const CODIGO_VALIDADE_MS = 15 * 60 * 1000; // 15 min

// prisma devolve criadoEm como Date, resto do app espera string (ISO) — reaproveitado em usuarios.routes.ts
export function usuarioParaDominio(usuario: UsuarioDb): Usuario {
  return { ...usuario, criadoEm: usuario.criadoEm.toISOString() };
}

// cria o Participante e o Usuario ALUNO vinculado, checa duplicidade de email/rgm antes
async function registrarAluno(dados: RegistroInput) {
  const emailDuplicado = await prisma.usuario.findUnique({ where: { emailLogin: dados.emailInstitucional } });
  if (emailDuplicado) {
    throw AppError.conflito("EMAIL_DUPLICADO", "Já existe uma conta com este e-mail.");
  }

  const rgmDuplicado = await prisma.participante.findUnique({ where: { rgm: dados.rgm } });
  if (rgmDuplicado) {
    throw AppError.conflito("RGM_DUPLICADO", "Já existe um cadastro com este RGM.");
  }

  const senhaHash = await gerarHashSenha(dados.senha);

  const participante = await prisma.participante.create({
    data: { id: randomUUID(), nome: dados.nomeCompleto, email: dados.emailInstitucional, rgm: dados.rgm },
  });

  const usuario = await prisma.usuario.create({
    data: {
      id: randomUUID(),
      nome: dados.nomeCompleto,
      emailLogin: dados.emailInstitucional,
      senhaHash,
      perfil: "ALUNO",
      rgm: dados.rgm,
      participanteId: participante.id,
    },
  });

  return usuarioParaDTO(usuarioParaDominio(usuario));
}

// confere email+senha e devolve o token assinado
async function login(dados: LoginInput) {
  const usuario = await prisma.usuario.findUnique({ where: { emailLogin: dados.emailLogin } });
  // mensagem generica pra nao dar dica se foi email ou senha que errou
  const senhaOk = usuario ? await conferirSenha(dados.senha, usuario.senhaHash) : false;
  if (!usuario || !senhaOk) {
    throw new AppError(401, "CREDENCIAIS_INVALIDAS", "E-mail ou senha inválidos.");
  }

  const token = assinarToken({ sub: usuario.id, perfil: usuario.perfil, participanteId: usuario.participanteId });

  return {
    token,
    tokenType: "Bearer",
    expiresIn: duracaoEmSegundos(env.jwtExpiresIn),
    usuario: usuarioParaDTO(usuarioParaDominio(usuario)),
  };
}

// acha usuario por email de login ou por rgm, usado na recuperacao de senha
function buscarUsuarioPorIdentificador(identificador: string) {
  return prisma.usuario.findFirst({ where: { OR: [{ emailLogin: identificador }, { rgm: identificador }] } });
}

// gera um codigo numerico de 6 digitos
function gerarCodigoNumerico(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// gera o codigo de recuperacao, salva com validade de 15min e dispara o email
async function solicitarRecuperacaoSenha(dados: SolicitarRecuperacaoInput) {
  const usuario = await buscarUsuarioPorIdentificador(dados.identificador);
  if (!usuario) {
    throw AppError.naoEncontrado("USUARIO_NAO_ENCONTRADO", "Não encontramos conta com esse e-mail ou RGM.");
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

  await emailService.enviarCodigoRecuperacao(usuario.emailLogin, codigo);

  // fora de producao devolve o codigo no corpo tb, so pra testar sem SMTP configurado
  return env.isProduction ? {} : { codigoDemo: codigo };
}

// confere o codigo e troca a senha
async function confirmarRecuperacaoSenha(dados: ConfirmarRecuperacaoInput) {
  const usuario = await buscarUsuarioPorIdentificador(dados.identificador);
  if (!usuario) {
    throw AppError.naoEncontrado("USUARIO_NAO_ENCONTRADO", "Não encontramos conta com esse e-mail ou RGM.");
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
