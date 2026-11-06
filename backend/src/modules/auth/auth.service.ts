import { randomInt, randomUUID } from "crypto";
import { Prisma, type Usuario as UsuarioDb } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { conferirSenha, CUSTO_HASH, custoDoHash, gerarHashSenha, precisaRefazerHash } from "../../utils/password";
import { assinarToken, assinarTokenEtapa, duracaoEmSegundos } from "../../utils/jwt";
import { usuarioParaDTO } from "../../utils/dto";
import { normalizarEmail } from "../../utils/validacao";
import { registrarAuditoria } from "../../utils/auditoria";
import {
  chaveConta,
  chaveIp,
  estaBloqueado,
  idDoEmail,
  incrementarTentativa,
  limparTentativas,
  MAX_TENTATIVAS_POR_IP,
} from "../../utils/limiteAcesso";
import { env } from "../../config/env";
import { VERSAO_TERMOS_ATUAL } from "../../config/termos";
import { emailService } from "../email/email.service";
import type { Usuario } from "../../types/domain";
import type {
  ConfirmarCadastroInput,
  ConfirmarRecuperacaoInput,
  LoginInput,
  ReenviarCodigoCadastroInput,
  RegistroInput,
  SolicitarRecuperacaoInput,
} from "./auth.schemas";

const CODIGO_VALIDADE_MS = 15 * 60 * 1000; // 15 min
const MAX_TENTATIVAS_CODIGO = 5;
// validade do token da etapa do 2FA: 5 min pra digitar o codigo do aplicativo
const VALIDADE_TOKEN_MFA_PENDENTE_S = 5 * 60;

// conta com o RGM do aluno vinculado (o RGM mora so no Participante). Toda consulta que vai virar
// sessao ou "minha conta" precisa trazer isto: include { participante: { select: COM_RGM } }
export const COM_RGM = { rgm: true, ativo: true } as const;
export type UsuarioComParticipante = UsuarioDb & { participante: { rgm: string; ativo: boolean } | null };

// prisma devolve criadoEm como Date — converte pro formato que o resto do app espera
// (reaproveitado em usuarios.routes.ts)
export function usuarioParaDominio(usuario: UsuarioComParticipante): Usuario {
  // o segredo do 2FA nunca sai daqui, nem cifrado
  const { mfaSegredoCifrado, participante, ...semSegredo } = usuario;
  void mfaSegredoCifrado;
  return {
    ...semSegredo,
    rgm: participante?.rgm ?? null,
    consentimentoLgpdEm: usuario.consentimentoLgpdEm ? usuario.consentimentoLgpdEm.toISOString() : null,
    versaoTermosAceitos: usuario.versaoTermosAceitos,
    criadoEm: usuario.criadoEm.toISOString(),
  };
}

// ---------------------------------------------------------------- cadastro com confirmacao do e-mail
// o cadastro acontece em 2 passos: POST /registro valida os dados e guarda um CadastroPendente (sem
// criar conta), mandando um codigo de 6 digitos pro e-mail institucional; POST /registro/confirmar
// confere o codigo e so entao cria o Participante e a conta ALUNO. Assim a conta (e os certificados)
// so existem pra quem de fato recebe o e-mail informado
const CADASTRO_VALIDADE_MS = 15 * 60 * 1000; // 15 min
const INTERVALO_REENVIO_MS = 60 * 1000; // 60 s entre um envio de codigo e o proximo

// mensagem generica de bloqueio: a mesma pra conta real ou inexistente, pra nao dar pista
function erroBloqueado(): AppError {
  return new AppError(429, "MUITAS_TENTATIVAS", "Muitas tentativas. Tente novamente em alguns minutos.");
}

function erroCodigoExpirado(): AppError {
  return new AppError(422, "CODIGO_EXPIRADO", "O código expirou. Preencha o cadastro novamente.");
}

// e-mail ou RGM ja usados por uma conta -> 409 no campo certo. Roda de novo dentro da transacao da
// confirmacao, porque outra pessoa pode ter concluido um cadastro com o mesmo RGM nesse meio tempo
async function conferirEmailERgmLivres(emailLogin: string, rgm: string, cliente: Prisma.TransactionClient = prisma) {
  if (await cliente.usuario.findUnique({ where: { emailLogin }, select: { id: true } })) {
    throw AppError.conflito("EMAIL_DUPLICADO", "Já existe uma conta com este e-mail.");
  }
  if (await cliente.participante.findUnique({ where: { rgm }, select: { id: true } })) {
    throw AppError.conflito("RGM_DUPLICADO", "Já existe um cadastro com este RGM.");
  }
}

// limite de envios do codigo (cadastro + reenvios): 5 por e-mail e 20 por IP, bloqueio de 15 min
function chavesDeEnvio(emailLogin: string, ip: string) {
  return { conta: chaveConta("cadastro", idDoEmail(emailLogin)), ip: chaveIp("cadastro", ip) };
}

async function recusarSeLimiteDeEnvios(chaves: { conta: string; ip: string }) {
  if ((await estaBloqueado(chaves.conta)) || (await estaBloqueado(chaves.ip))) {
    throw new AppError(429, "MUITAS_TENTATIVAS", "Limite de envios de código atingido. Tente novamente em 15 minutos.");
  }
}

async function contarEnvio(chaves: { conta: string; ip: string }) {
  await incrementarTentativa(chaves.conta);
  await incrementarTentativa(chaves.ip, MAX_TENTATIVAS_POR_IP);
}

// apaga os cadastros que passaram dos 15 minutos sem confirmacao (dados provisorios nao ficam guardados)
async function apagarCadastrosExpirados(): Promise<number> {
  const { count } = await prisma.cadastroPendente.deleteMany({ where: { expiraEm: { lte: new Date() } } });
  return count;
}

// a mesma limpeza, rodada a cada login: uma falha aqui (ex.: tabela ainda nao criada no banco) nunca
// impede o login — so fica registrada no log do servidor, sem detalhe do banco
async function apagarCadastrosExpiradosSemFalhar() {
  try {
    await apagarCadastrosExpirados();
  } catch (erro) {
    const codigo = erro instanceof Error ? ((erro as { code?: string }).code ?? erro.name) : "erro desconhecido";
    console.error(`[cadastro] falha ao apagar cadastros pendentes expirados: ${codigo}`);
  }
}

// manda o codigo pro e-mail institucional. Em producao, falha de envio vira 503 (o pendente fica
// guardado pro aluno usar "Reenviar codigo"); fora de producao segue, porque o codigoDemo resolve.
// Em producao, SendGrid sem configuracao ("simulado") tambem e falha: o codigo nao chegaria a ninguem
// e o codigoDemo nao volta na resposta, entao o aluno ficaria preso na etapa do codigo sem aviso
async function enviarCodigoDoCadastro(pendenteId: string, destinatario: string, codigo: string) {
  let motivoFalha: string;
  try {
    const resultado = await emailService.enviarCodigoCadastro(destinatario, codigo);
    if (resultado === "enviado" || !env.isProduction) {
      await registrarAuditoria(
        null,
        "EMAIL_ENVIADO",
        `código de confirmação do cadastro ${pendenteId}${resultado === "simulado" ? " (simulado: SendGrid não configurado)" : ""}`,
      );
      return;
    }
    motivoFalha = "SendGrid não configurado";
  } catch {
    // email.service.ts ja loga o detalhe sanitizado da falha
    motivoFalha = "falha no envio";
  }

  console.error(`[cadastro] o código de confirmação do e-mail não foi enviado (${motivoFalha})`);
  await registrarAuditoria(null, "EMAIL_FALHA", `código de confirmação do cadastro ${pendenteId}: ${motivoFalha}`);
  if (env.isProduction) {
    throw new AppError(
      503,
      "EMAIL_INDISPONIVEL",
      "Não foi possível enviar o código agora. Aguarde um minuto e clique em \"Reenviar código\".",
    );
  }
}

function respostaDoEnvio(emailLogin: string, expiraEm: Date, codigo: string) {
  return {
    emailInstitucional: emailLogin,
    expiraEm: expiraEm.toISOString(),
    // fora de producao devolve o codigo no corpo, so pra testar sem e-mail configurado
    ...(env.isProduction ? {} : { codigoDemo: codigo }),
  };
}

// passo 1: valida tudo (o schema ja conferiu formato, senha e aceite), guarda o cadastro pendente com
// validade de 15 minutos e manda o codigo. Nenhuma conta e criada aqui
async function iniciarCadastro(dados: RegistroInput, ip: string) {
  const emailLogin = normalizarEmail(dados.emailInstitucional);
  const chaves = chavesDeEnvio(emailLogin, ip);
  await recusarSeLimiteDeEnvios(chaves);
  await conferirEmailERgmLivres(emailLogin, dados.rgm);

  // expirados de qualquer pessoa e um pendente anterior com o mesmo e-mail ou RGM (cadastro refeito)
  const agora = new Date();
  await prisma.cadastroPendente.deleteMany({
    where: { OR: [{ expiraEm: { lte: agora } }, { emailLogin }, { rgm: dados.rgm }] },
  });

  await contarEnvio(chaves);
  const codigo = gerarCodigoNumerico();
  const expiraEm = new Date(agora.getTime() + CADASTRO_VALIDADE_MS);
  let pendente;
  try {
    pendente = await prisma.cadastroPendente.create({
      data: {
        id: randomUUID(),
        nome: dados.nomeCompleto,
        emailLogin,
        rgm: dados.rgm,
        senhaHash: await gerarHashSenha(dados.senha),
        codigoHash: await gerarHashSenha(codigo),
        ultimoEnvioEm: agora,
        // aceiteLgpd ja foi validado como obrigatoriamente true no schema: o instante do aceite e a
        // versao vigente vao pra conta quando o cadastro for confirmado
        aceiteEm: agora,
        versaoTermos: VERSAO_TERMOS_ATUAL,
        expiraEm,
      },
    });
  } catch (erro) {
    // dois envios do mesmo e-mail ao mesmo tempo: o indice unico segura o segundo
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      throw AppError.conflito("CADASTRO_EM_ANDAMENTO", "Já existe um cadastro em andamento com este e-mail. Tente novamente.");
    }
    throw erro;
  }

  await registrarAuditoria(null, "CADASTRO_INICIADO", `cadastro pendente ${pendente.id}: código enviado, validade de 15 minutos`);
  await enviarCodigoDoCadastro(pendente.id, emailLogin, codigo);
  return respostaDoEnvio(emailLogin, expiraEm, codigo);
}

// pendente do e-mail ainda valido; expirado e apagado na hora (o aluno preenche o cadastro de novo)
async function buscarPendenteValido(emailLogin: string) {
  const pendente = await prisma.cadastroPendente.findUnique({ where: { emailLogin } });
  if (!pendente) throw erroCodigoExpirado();
  if (pendente.expiraEm <= new Date()) {
    await prisma.cadastroPendente.deleteMany({ where: { id: pendente.id } });
    throw erroCodigoExpirado();
  }
  return pendente;
}

// passo 2: confere o codigo e cria a conta. No 5º erro o codigo deixa de valer (precisa reenviar)
async function confirmarCadastro(dados: ConfirmarCadastroInput) {
  const emailLogin = normalizarEmail(dados.emailInstitucional);
  const pendente = await buscarPendenteValido(emailLogin);

  const mensagemCodigoEsgotado = `Você errou o código ${MAX_TENTATIVAS_CODIGO} vezes. Clique em "Reenviar código" para receber outro.`;
  if (pendente.tentativas >= MAX_TENTATIVAS_CODIGO) {
    throw new AppError(422, "CODIGO_INVALIDO", mensagemCodigoEsgotado);
  }
  if (!(await conferirSenha(dados.codigo, pendente.codigoHash))) {
    const tentativas = pendente.tentativas + 1;
    await prisma.cadastroPendente.update({ where: { id: pendente.id }, data: { tentativas } });
    throw new AppError(422, "CODIGO_INVALIDO", tentativas >= MAX_TENTATIVAS_CODIGO ? mensagemCodigoEsgotado : "Código inválido.");
  }

  let usuario: UsuarioComParticipante;
  try {
    // tudo junto ou nada: participante, conta e a saida do pendente
    usuario = await prisma.$transaction(async (tx) => {
      await conferirEmailERgmLivres(pendente.emailLogin, pendente.rgm, tx);
      const participanteId = randomUUID();
      await tx.participante.create({ data: { id: participanteId, rgm: pendente.rgm } });
      const criado = await tx.usuario.create({
        data: {
          id: randomUUID(),
          nome: pendente.nome,
          emailLogin: pendente.emailLogin,
          // a senha ja chegou como hash no passo 1 — o texto puro nunca foi guardado
          senhaHash: pendente.senhaHash,
          perfil: "ALUNO",
          participanteId,
          consentimentoLgpdEm: pendente.aceiteEm,
          versaoTermosAceitos: pendente.versaoTermos,
        },
        include: { participante: { select: COM_RGM } },
      });
      await tx.cadastroPendente.delete({ where: { id: pendente.id } });
      return criado;
    });
  } catch (erro) {
    // e-mail ou RGM tomados por outro cadastro nesse meio tempo: este pendente nunca vai poder concluir
    if (erro instanceof AppError) {
      await prisma.cadastroPendente.deleteMany({ where: { id: pendente.id } });
      throw erro;
    }
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      await prisma.cadastroPendente.deleteMany({ where: { id: pendente.id } });
      throw AppError.conflito("EMAIL_DUPLICADO", "Já existe uma conta com este e-mail ou RGM.");
    }
    // confirmacao em dobro (duplo clique): o primeiro ja concluiu e apagou o pendente
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2025") throw erroCodigoExpirado();
    throw erro;
  }

  await limparTentativas(chaveConta("cadastro", idDoEmail(emailLogin)));
  await registrarAuditoria(usuario.id, "CADASTRO_CONCLUIDO", `conta ${usuario.id} criada após a confirmação do e-mail (cadastro pendente ${pendente.id})`);
  await registrarAuditoria(
    usuario.id,
    "CONSENTIMENTO_LGPD_ACEITO",
    `termos de uso e política de privacidade (versão ${pendente.versaoTermos}) aceitos em ${pendente.aceiteEm.toISOString()}`,
    pendente.aceiteEm,
  );

  return usuarioParaDTO(usuarioParaDominio(usuario));
}

// novo codigo pro mesmo cadastro: o anterior deixa de valer, as tentativas zeram e a validade volta a
// ser de 15 minutos. Minimo de 60 s entre envios
async function reenviarCodigoCadastro(dados: ReenviarCodigoCadastroInput, ip: string) {
  const emailLogin = normalizarEmail(dados.emailInstitucional);
  const chaves = chavesDeEnvio(emailLogin, ip);
  await recusarSeLimiteDeEnvios(chaves);
  const pendente = await buscarPendenteValido(emailLogin);

  const desdeUltimoEnvio = Date.now() - pendente.ultimoEnvioEm.getTime();
  if (desdeUltimoEnvio < INTERVALO_REENVIO_MS) {
    const segundos = Math.ceil((INTERVALO_REENVIO_MS - desdeUltimoEnvio) / 1000);
    throw new AppError(429, "AGUARDE_REENVIO", `Aguarde ${segundos} segundos para pedir um novo código.`);
  }

  await contarEnvio(chaves);
  const codigo = gerarCodigoNumerico();
  const agora = new Date();
  const expiraEm = new Date(agora.getTime() + CADASTRO_VALIDADE_MS);
  const atualizado = await prisma.cadastroPendente.update({
    where: { id: pendente.id },
    data: { codigoHash: await gerarHashSenha(codigo), tentativas: 0, envios: { increment: 1 }, ultimoEnvioEm: agora, expiraEm },
  });

  await registrarAuditoria(
    null,
    "CADASTRO_CODIGO_REENVIADO",
    `cadastro pendente ${pendente.id}: novo código enviado (envio ${atualizado.envios}), validade renovada para 15 minutos`,
  );
  await enviarCodigoDoCadastro(pendente.id, emailLogin, codigo);
  return respostaDoEnvio(emailLogin, expiraEm, codigo);
}

// confere email+senha e devolve o token assinado. Bloqueia por excesso de tentativas (conta E ip,
// o que vier primeiro) antes mesmo de consultar o banco, pra nao vazar se a conta existe
async function login(dados: LoginInput, ip: string) {
  // cadastros pendentes vencidos saem a cada login (nao ha rotina agendada); nunca impede o login
  await apagarCadastrosExpiradosSemFalhar();

  const chaveDaConta = chaveConta("login", idDoEmail(dados.emailLogin));
  const chaveDoIp = chaveIp("login", ip);

  if ((await estaBloqueado(chaveDaConta)) || (await estaBloqueado(chaveDoIp))) {
    await registrarAuditoria(null, "LOGIN_FALHA", "bloqueado temporariamente (limite de tentativas)");
    throw erroBloqueado();
  }

  const usuario = await prisma.usuario.findUnique({
    where: { emailLogin: normalizarEmail(dados.emailLogin) },
    include: { participante: { select: COM_RGM } },
  });
  // mensagem generica pra nao dar dica se foi email ou senha que errou
  const senhaOk = usuario ? await conferirSenha(dados.senha, usuario.senhaHash) : false;
  if (!usuario || !senhaOk) {
    // nunca grava o e-mail tentado (PII) no log — so se o usuario existe ou nao
    await registrarAuditoria(usuario?.id ?? null, "LOGIN_FALHA", usuario ? "senha incorreta" : "e-mail nao encontrado");
    await incrementarTentativa(chaveDaConta);
    await incrementarTentativa(chaveDoIp, MAX_TENTATIVAS_POR_IP);
    throw new AppError(401, "CREDENCIAIS_INVALIDAS", "E-mail ou senha inválidos.");
  }

  // aluno inativado pela equipe: a mensagem nao expoe o motivo interno (fica so no cadastro).
  // So quem acertou a senha chega aqui, entao isso nao revela a situacao da conta pra quem chuta senha
  if (usuario.perfil === "ALUNO" && usuario.participante && !usuario.participante.ativo) {
    await registrarAuditoria(usuario.id, "LOGIN_FALHA", "conta inativa");
    throw AppError.contaInativa();
  }

  await limparTentativas(chaveDaConta);

  // hash de senha gravado com custo menor que o atual: refaz agora, enquanto a senha em texto puro
  // acabou de ser conferida — o titular nao precisa trocar a senha pra ganhar o custo novo
  if (precisaRefazerHash(usuario.senhaHash)) {
    const custoAnterior = custoDoHash(usuario.senhaHash);
    await prisma.usuario.update({ where: { id: usuario.id }, data: { senhaHash: await gerarHashSenha(dados.senha) } });
    await registrarAuditoria(usuario.id, "SENHA_HASH_ATUALIZADO", `hash da senha refeito no login: custo ${custoAnterior} → ${CUSTO_HASH}`);
  }

  // senha certa com 2FA ativo: ainda nao e sessao, so um token curto que serve apenas pra rota
  // de verificar o codigo. LOGIN_SUCESSO so e registrado quando o codigo tambem confere
  if (usuario.mfaAtivo) {
    return {
      mfa: "PENDENTE" as const,
      tokenEtapa: assinarTokenEtapa(usuario, "mfa_pendente", VALIDADE_TOKEN_MFA_PENDENTE_S),
      expiresIn: VALIDADE_TOKEN_MFA_PENDENTE_S,
    };
  }

  await registrarAuditoria(usuario.id, "LOGIN_SUCESSO");
  return emitirSessao(usuario);
}

// monta a resposta de login com o token de sessao de verdade — usada no login sem 2FA, depois do
// codigo do 2FA conferir e quando a sessao precisa ser reemitida (ex.: ao desativar o 2FA)
export function emitirSessao(usuario: UsuarioComParticipante) {
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

// acha usuario pelo email de login (normalizado), usado na recuperacao de senha
function buscarUsuarioPorEmail(email: string) {
  return prisma.usuario.findUnique({ where: { emailLogin: normalizarEmail(email) } });
}

// gera um codigo numerico de 6 digitos com gerador criptografico (Math.random e previsivel, nao
// serve pra segredo): randomInt sorteia de 100000 a 999999 sem vies
function gerarCodigoNumerico(): string {
  return String(randomInt(100000, 1000000));
}

// gera o codigo de recuperacao, salva com validade de 15min e dispara o email. Aqui conta TODA
// chamada (nao so falha) contra o limite — o que se limita e a frequencia do pedido em si, pra
// nao deixar alguem inundar a caixa de entrada de outra pessoa nem varrer e-mails cadastrados
async function solicitarRecuperacaoSenha(dados: SolicitarRecuperacaoInput, ip: string) {
  const chaveDaConta = chaveConta("recuperacao", idDoEmail(dados.email));
  const chaveDoIp = chaveIp("recuperacao", ip);

  if ((await estaBloqueado(chaveDaConta)) || (await estaBloqueado(chaveDoIp))) {
    await registrarAuditoria(null, "RECUPERACAO_SENHA_FALHA", "bloqueado temporariamente (limite de tentativas)");
    throw erroBloqueado();
  }
  await incrementarTentativa(chaveDaConta);
  await incrementarTentativa(chaveDoIp, MAX_TENTATIVAS_POR_IP);

  const usuario = await buscarUsuarioPorEmail(dados.email);
  if (!usuario) {
    // nunca grava o e-mail digitado (PII) no log. A resposta e a mesma de quando a conta existe
    // (em producao, {}): a tela diz "se houver uma conta com esse e-mail, enviamos o codigo", entao
    // ninguem descobre por aqui quem tem conta — igual ao login, que tambem nao revela
    await registrarAuditoria(null, "RECUPERACAO_SENHA_FALHA", "e-mail não cadastrado");
    return {};
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
  // usa dados.email (o que a pessoa digitou no pedido) como destinatario
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
    // mesma resposta de codigo errado: a confirmacao tambem nao revela se o e-mail tem conta
    await registrarAuditoria(null, "RECUPERACAO_SENHA_FALHA", "confirmação: e-mail não cadastrado");
    throw new AppError(422, "CODIGO_INVALIDO", "Código inválido ou expirado.");
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
  iniciarCadastro,
  confirmarCadastro,
  reenviarCodigoCadastro,
  login,
  aceitarTermos,
  solicitarRecuperacaoSenha,
  confirmarRecuperacaoSenha,
};
