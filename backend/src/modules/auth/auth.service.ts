import { randomUUID } from "crypto";
import { participantesStore, recuperacoesStore, usuariosStore } from "../../db/store";
import { AppError } from "../../errors/AppError";
import { conferirSenha, gerarHashSenha } from "../../utils/password";
import { assinarToken, duracaoEmSegundos } from "../../utils/jwt";
import { usuarioParaDTO } from "../../utils/dto";
import { env } from "../../config/env";
import { emailService } from "../email/email.service";
import type { ConfirmarRecuperacaoInput, LoginInput, RegistroInput, SolicitarRecuperacaoInput } from "./auth.schemas";

const CODIGO_VALIDADE_MS = 15 * 60 * 1000; // 15 min

async function registrarAluno(dados: RegistroInput) {
  const emailDuplicado = usuariosStore.buscarUm((u) => u.emailLogin === dados.emailInstitucional);
  if (emailDuplicado) {
    throw AppError.conflito("EMAIL_DUPLICADO", "Já existe uma conta com este e-mail.");
  }

  const rgmDuplicado = participantesStore.buscarUm((p) => p.rgm === dados.rgm);
  if (rgmDuplicado) {
    throw AppError.conflito("RGM_DUPLICADO", "Já existe um cadastro com este RGM.");
  }

  const senhaHash = await gerarHashSenha(dados.senha);
  const agora = new Date().toISOString();

  const participante = participantesStore.criar({
    id: randomUUID(),
    nome: dados.nomeCompleto,
    email: dados.emailInstitucional,
    rgm: dados.rgm,
    criadoEm: agora,
  });

  const usuario = usuariosStore.criar({
    id: randomUUID(),
    nome: dados.nomeCompleto,
    emailLogin: dados.emailInstitucional,
    senhaHash,
    perfil: "ALUNO",
    rgm: dados.rgm,
    participanteId: participante.id,
    criadoEm: agora,
  });

  return usuarioParaDTO(usuario);
}

async function login(dados: LoginInput) {
  const usuario = usuariosStore.buscarUm((u) => u.emailLogin === dados.emailLogin);
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
    usuario: usuarioParaDTO(usuario),
  };
}

function buscarUsuarioPorIdentificador(identificador: string) {
  return usuariosStore.buscarUm((u) => u.emailLogin === identificador || u.rgm === identificador);
}

function gerarCodigoNumerico(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function solicitarRecuperacaoSenha(dados: SolicitarRecuperacaoInput) {
  const usuario = buscarUsuarioPorIdentificador(dados.identificador);
  if (!usuario) {
    throw AppError.naoEncontrado("USUARIO_NAO_ENCONTRADO", "Não encontramos conta com esse e-mail ou RGM.");
  }

  const codigo = gerarCodigoNumerico();
  const agora = new Date();
  recuperacoesStore.criar({
    id: randomUUID(),
    usuarioId: usuario.id,
    codigo,
    expiraEm: new Date(agora.getTime() + CODIGO_VALIDADE_MS).toISOString(),
    usadoEm: null,
    criadoEm: agora.toISOString(),
  });

  await emailService.enviarCodigoRecuperacao(usuario.emailLogin, codigo);

  // fora de producao devolve o codigo no corpo tb, so pra testar sem SMTP configurado
  return env.isProduction ? {} : { codigoDemo: codigo };
}

async function confirmarRecuperacaoSenha(dados: ConfirmarRecuperacaoInput) {
  const usuario = buscarUsuarioPorIdentificador(dados.identificador);
  if (!usuario) {
    throw AppError.naoEncontrado("USUARIO_NAO_ENCONTRADO", "Não encontramos conta com esse e-mail ou RGM.");
  }

  const agora = Date.now();
  const pendentes = recuperacoesStore
    .listarComFiltro(
      (r) => r.usuarioId === usuario.id && r.codigo === dados.codigo && !r.usadoEm && new Date(r.expiraEm).getTime() > agora,
    )
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const pendente = pendentes[0];
  if (!pendente) {
    throw new AppError(422, "CODIGO_INVALIDO", "Código inválido ou expirado.");
  }

  const novaSenhaHash = await gerarHashSenha(dados.novaSenha);
  usuariosStore.atualizar(usuario.id, { senhaHash: novaSenhaHash });
  recuperacoesStore.atualizar(pendente.id, { usadoEm: new Date().toISOString() });
}

export const authService = {
  registrarAluno,
  login,
  solicitarRecuperacaoSenha,
  confirmarRecuperacaoSenha,
};
