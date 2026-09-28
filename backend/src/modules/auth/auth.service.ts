import { randomUUID } from "crypto";
import type { Usuario as UsuarioDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { conferirSenha, gerarHashSenha } from "../../utils/password";
import { assinarToken, duracaoEmSegundos } from "../../utils/jwt";
import { usuarioParaDTO } from "../../utils/dto";
import { criptografar, descriptografar, indiceBusca } from "../../utils/criptografia";
import { registrarAuditoria } from "../../utils/auditoria";
import { chaveConta, chaveIp, estaBloqueado, incrementarTentativa, limparTentativas } from "../../utils/limiteAcesso";
import { env } from "../../config/env";
import { VERSAO_TERMOS_ATUAL } from "../../config/termos";
import { emailService } from "../email/email.service";
import type { Usuario } from "../../types/domain";
import type { ConfirmarRecuperacaoInput, LoginInput, RegistroInput, SolicitarRecuperacaoInput } from "./auth.schemas";

const CODIGO_VALIDADE_MS = 15 * 60 * 1000; // 15 min
const MAX_TENTATIVAS_CODIGO = 5;

// prisma devolve criadoEm como Date e nome/emailLogin/rgm cifrados — decifra e converte pro
// formato que o resto do app espera (reaproveitado em usuarios.routes.ts)
export function usuarioParaDominio(usuario: UsuarioDb): Usuario {
  return {
    ...usuario,
    nome: descriptografar(usuario.nome),
    emailLogin: descriptografar(usuario.emailLogin),
    rgm: usuario.rgm ? descriptografar(usuario.rgm) : null,
    consentimentoLgpdEm: usuario.consentimentoLgpdEm ? usuario.consentimentoLgpdEm.toISOString() : null,
    versaoTermosAceitos: usuario.versaoTermosAceitos,
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

  // instante unico do aceite: vai igual pra usuarios.consentimentoLgpdEm e pro log de auditoria
  const consentimentoEm = new Date();

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
      // e a versao vigente dos Termos/Politica (ver config/termos.ts)
      consentimentoLgpdEm: consentimentoEm,
      versaoTermosAceitos: VERSAO_TERMOS_ATUAL,
    },
  });

  await registrarAuditoria(usuario.id, "USUARIO_REGISTRADO", "cadastro publico de aluno");
  await registrarAuditoria(
    usuario.id,
    "CONSENTIMENTO_LGPD_ACEITO",
    `termos de uso e política de privacidade aceitos em ${consentimentoEm.toISOString()}`,
    consentimentoEm,
  );

  return usuarioParaDTO(usuarioParaDominio(usuario));
}

// mensagem generica de bloqueio: a mesma pra conta real ou inexistente, pra nao dar pista
function erroBloqueado(): AppError {
  return new AppError(429, "MUITAS_TENTATIVAS", "Muitas tentativas. Tente novamente em alguns minutos.");
}

// confere email+senha e devolve o token assinado. Bloqueia por excesso de tentativas (conta E ip,
// o que vier primeiro) antes mesmo de consultar o banco, pra nao vazar se a conta existe
async function login(dados: LoginInput, ip: string) {
  const emailHash = indiceBusca(dados.emailLogin);
  const chaveDaConta = chaveConta("login", emailHash);
  const chaveDoIp = chaveIp("login", ip);

  if ((await estaBloqueado(chaveDaConta)) || (await estaBloqueado(chaveDoIp))) {
    await registrarAuditoria(null, "LOGIN_FALHA", "bloqueado temporariamente (limite de tentativas)");
    throw erroBloqueado();
  }

  const usuario = await prisma.usuario.findUnique({
    where: { emailLoginHash: emailHash },
    include: { participante: true },
  });
  // mensagem generica pra nao dar dica se foi email ou senha que errou
  const senhaOk = usuario ? await conferirSenha(dados.senha, usuario.senhaHash) : false;
  if (!usuario || !senhaOk) {
    // nunca grava o e-mail tentado (PII) no log — so se o usuario existe ou nao
    await registrarAuditoria(usuario?.id ?? null, "LOGIN_FALHA", usuario ? "senha incorreta" : "e-mail nao encontrado");
    await incrementarTentativa(chaveDaConta);
    await incrementarTentativa(chaveDoIp);
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

  await limparTentativas(chaveDaConta);
  await registrarAuditoria(usuario.id, "LOGIN_SUCESSO");

  const token = assinarToken({
    sub: usuario.id,
    perfil: usuario.perfil,
    participanteId: usuario.participanteId,
    versaoToken: usuario.versaoToken,
  });

  return {
    token,
    tokenType: "Bearer",
    expiresIn: duracaoEmSegundos(env.jwtExpiresIn),
    usuario: usuarioParaDTO(usuarioParaDominio(usuario)),
    // versao aceita no cadastro/ultimo aceite diverge da vigente: front pede novo aceite antes de liberar a tela
    precisaAceitarTermos: usuario.versaoTermosAceitos !== VERSAO_TERMOS_ATUAL,
  };
}

// registra o aceite da versao vigente dos Termos/Politica (reaceite pedido apos mudanca de versao)
async function aceitarTermos(usuarioId: string) {
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { consentimentoLgpdEm: new Date(), versaoTermosAceitos: VERSAO_TERMOS_ATUAL },
  });
  await registrarAuditoria(usuarioId, "TERMOS_REACEITOS", `versão ${VERSAO_TERMOS_ATUAL}`);
}

// acha usuario pelo email de login (via indice de busca), usado na recuperacao de senha
function buscarUsuarioPorEmail(email: string) {
  return prisma.usuario.findUnique({ where: { emailLoginHash: indiceBusca(email) } });
}

// gera um codigo numerico de 6 digitos
function gerarCodigoNumerico(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// gera o codigo de recuperacao, salva com validade de 15min e dispara o email. Aqui conta TODA
// chamada (nao so falha) contra o limite — o que se limita e a frequencia do pedido em si, pra
// nao deixar alguem inundar a caixa de entrada de outra pessoa nem varrer e-mails cadastrados
async function solicitarRecuperacaoSenha(dados: SolicitarRecuperacaoInput, ip: string) {
  const emailHash = indiceBusca(dados.email);
  const chaveDaConta = chaveConta("recuperacao", emailHash);
  const chaveDoIp = chaveIp("recuperacao", ip);

  if ((await estaBloqueado(chaveDaConta)) || (await estaBloqueado(chaveDoIp))) {
    await registrarAuditoria(null, "RECUPERACAO_SENHA_FALHA", "bloqueado temporariamente (limite de tentativas)");
    throw erroBloqueado();
  }
  await incrementarTentativa(chaveDaConta);
  await incrementarTentativa(chaveDoIp);

  const usuario = await buscarUsuarioPorEmail(dados.email);
  if (!usuario) {
    // nunca grava o e-mail digitado (PII) no log
    await registrarAuditoria(null, "RECUPERACAO_SENHA_FALHA", "e-mail não cadastrado");
    throw AppError.naoEncontrado("USUARIO_NAO_ENCONTRADO", "Não encontramos conta com esse e-mail.");
  }

  const codigo = gerarCodigoNumerico();
  await prisma.recuperacaoSenha.create({
    data: {
      id: randomUUID(),
      usuarioId: usuario.id,
      codigoHash: await gerarHashSenha(codigo),
      expiraEm: new Date(Date.now() + CODIGO_VALIDADE_MS),
    },
  });
  await registrarAuditoria(usuario.id, "RECUPERACAO_SENHA_SOLICITADA", "código de verificação gerado, validade de 15 minutos");

  // falha de envio nao pode travar a recuperacao — em demo o codigoDemo abaixo
  // resolve isso mesmo assim, e nem toda falha de provedor deveria bloquear o fluxo
  // usa dados.email (ja veio em texto puro do request) em vez de descriptografar usuario.emailLogin
  try {
    const resultado = await emailService.enviarCodigoRecuperacao(dados.email, codigo);
    await registrarAuditoria(
      usuario.id,
      "EMAIL_ENVIADO",
      `recuperação de senha, usuário ${usuario.id}${resultado === "simulado" ? " (simulado: SendGrid não configurado)" : ""}`,
    );
  } catch (erro) {
    // email.service.ts ja loga o detalhe sanitizado da falha — aqui so registra o contexto
    // (qual fluxo falhou), sem repetir o objeto de erro
    console.error("[recuperacao-senha] falha ao enviar e-mail de recuperacao");
    await registrarAuditoria(usuario.id, "EMAIL_FALHA", `recuperação de senha, usuário ${usuario.id}: falha no envio`);
  }

  // fora de producao devolve o codigo no corpo tb, so pra testar sem e-mail configurado
  return env.isProduction ? {} : { codigoDemo: codigo };
}

// confere o codigo e troca a senha
async function confirmarRecuperacaoSenha(dados: ConfirmarRecuperacaoInput) {
  const usuario = await buscarUsuarioPorEmail(dados.email);
  if (!usuario) {
    await registrarAuditoria(null, "RECUPERACAO_SENHA_FALHA", "confirmação: e-mail não cadastrado");
    throw AppError.naoEncontrado("USUARIO_NAO_ENCONTRADO", "Não encontramos conta com esse e-mail.");
  }

  // o codigo fica guardado so como hash, entao pega o ultimo pendente e compara por bcrypt
  const pendente = await prisma.recuperacaoSenha.findFirst({
    where: { usuarioId: usuario.id, usadoEm: null, expiraEm: { gt: new Date() } },
    orderBy: { criadoEm: "desc" },
  });
  if (!pendente) {
    await registrarAuditoria(usuario.id, "RECUPERACAO_SENHA_FALHA", "confirmação: código inexistente, expirado ou já utilizado");
    throw new AppError(422, "CODIGO_INVALIDO", "Código inválido ou expirado.");
  }
  if (pendente.tentativas >= MAX_TENTATIVAS_CODIGO) {
    await registrarAuditoria(usuario.id, "RECUPERACAO_SENHA_FALHA", `confirmação: limite de ${MAX_TENTATIVAS_CODIGO} tentativas excedido`);
    throw new AppError(422, "CODIGO_INVALIDO", "Código inválido ou expirado.");
  }

  if (!(await conferirSenha(dados.codigo, pendente.codigoHash))) {
    await prisma.recuperacaoSenha.update({ where: { id: pendente.id }, data: { tentativas: { increment: 1 } } });
    await registrarAuditoria(
      usuario.id,
      "RECUPERACAO_SENHA_FALHA",
      `confirmação: código incorreto (tentativa ${pendente.tentativas + 1} de ${MAX_TENTATIVAS_CODIGO})`,
    );
    throw new AppError(422, "CODIGO_INVALIDO", "Código inválido ou expirado.");
  }

  const novaSenhaHash = await gerarHashSenha(dados.novaSenha);
  await prisma.$transaction([
    // versaoToken incrementado invalida qualquer sessao ja aberta com a senha antiga
    prisma.usuario.update({ where: { id: usuario.id }, data: { senhaHash: novaSenhaHash, versaoToken: { increment: 1 } } }),
    prisma.recuperacaoSenha.update({ where: { id: pendente.id }, data: { usadoEm: new Date() } }),
  ]);
  await registrarAuditoria(usuario.id, "SENHA_REDEFINIDA", "senha redefinida com código de recuperação");
}

export const authService = {
  registrarAluno,
  login,
  aceitarTermos,
  solicitarRecuperacaoSenha,
  confirmarRecuperacaoSenha,
};
