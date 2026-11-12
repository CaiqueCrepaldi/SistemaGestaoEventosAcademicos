import { createHash, randomBytes, randomUUID } from "crypto";
import { Prisma, type Perfil } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { env } from "../../config/env";
import { VERSAO_TERMOS_ATUAL } from "../../config/termos";
import { registrarAuditoria, type AcaoAuditoria } from "../../utils/auditoria";
import {
  chaveConta,
  chaveIp,
  chavesDaConta,
  estaBloqueado,
  incrementarTentativa,
  MAX_TENTATIVAS_POR_IP,
} from "../../utils/limiteAcesso";
import { gerarHashSenha, SENHA_INUTILIZAVEL } from "../../utils/password";
import { normalizarEmail } from "../../utils/validacao";
import { registrarHistorico } from "../aprovacoes/aprovacoes.service";
import { eventoEncerrado, type Ator } from "../../utils/escopo";
import { emailService, observacaoDoEnvio } from "../email/email.service";
import type { ConsultaConviteInput, PrimeiroAcessoInput } from "../auth/auth.schemas";
import type { ContaEquipeInput, InativacaoProfessorInput } from "./professores.schemas";

// tela Equipe: contas de PROFESSOR e de SECRETARIA, criadas pela equipe (so nome e e-mail @umc.br). Nascem SEM
// senha utilizavel e sem aceite dos Termos — o login recusa ate o primeiro acesso. Ao criar (e a cada reenvio), a
// pessoa recebe por e-mail um CONVITE: um link com uma chave aleatoria de 32 bytes (base64url), que vale 24 horas e
// so pode ser usado uma vez. No banco fica so o SHA-256 da chave (na coluna codigoHash de primeiros_acessos): a
// chave e longa e aleatoria, entao o hash rapido basta (bcrypt serve pra senha, que e curta e adivinhavel). Chave
// nova invalida a anterior. Fora de producao, a resposta traz o link (linkConviteDemo).
// Quem gerencia quem: o ADMINISTRADOR gerencia professores e secretarias; a SECRETARIA so professores; ninguem mexe
// na propria conta por aqui; conta de ADMINISTRADOR nao aparece, nao e criada, inativada nem excluida por esta tela
const VALIDADE_CONVITE_MS = 24 * 60 * 60 * 1000;
const INTERVALO_REENVIO_MS = 60 * 1000;
const BYTES_DA_CHAVE = 32;

export type PerfilEquipe = "PROFESSOR" | "SECRETARIA";
export type SituacaoConta = "AGUARDANDO_PRIMEIRO_ACESSO" | "ATIVO" | "INATIVO";

const PERFIS_DA_TELA: PerfilEquipe[] = ["PROFESSOR", "SECRETARIA"];

interface ContaEquipe {
  id: string;
  nome: string;
  emailLogin: string;
  perfil: Perfil;
  senhaHash: string;
  consentimentoLgpdEm: Date | null;
  ativo: boolean;
  motivoInativacao: string | null;
  criadoEm: Date;
}

const CAMPOS_DA_CONTA = {
  id: true,
  nome: true,
  emailLogin: true,
  perfil: true,
  senhaHash: true,
  consentimentoLgpdEm: true,
  ativo: true,
  motivoInativacao: true,
  criadoEm: true,
} as const;

const NOME_DO_PERFIL: Record<PerfilEquipe, string> = { PROFESSOR: "professor", SECRETARIA: "secretaria" };

// convite ainda nao usado: sem aceite dos Termos e (no caso da secretaria) sem senha utilizavel. A conta de
// secretaria antiga, criada direto no banco antes do convite, tem senha e nao conta como pendente
export function aguardaConvite(conta: { perfil: Perfil; consentimentoLgpdEm: Date | null; senhaHash: string }): boolean {
  if (conta.consentimentoLgpdEm) return false;
  return conta.perfil === "PROFESSOR" || (conta.perfil === "SECRETARIA" && conta.senhaHash === SENHA_INUTILIZAVEL);
}

function situacao(conta: ContaEquipe): SituacaoConta {
  if (!conta.ativo) return "INATIVO";
  return aguardaConvite(conta) ? "AGUARDANDO_PRIMEIRO_ACESSO" : "ATIVO";
}

// o administrador gerencia professores e secretarias; a secretaria so professores; ninguem a propria conta
function podeGerenciar(conta: { id: string; perfil: Perfil }, ator: Ator): boolean {
  if (conta.id === ator.id || conta.perfil === "ADMINISTRADOR") return false;
  return ator.perfil === "ADMINISTRADOR" || conta.perfil === "PROFESSOR";
}

function paraResposta(conta: ContaEquipe, ator: Ator) {
  return {
    id: conta.id,
    nome: conta.nome,
    email: conta.emailLogin,
    perfil: conta.perfil,
    situacao: situacao(conta),
    motivoInativacao: conta.motivoInativacao,
    criadoEm: conta.criadoEm.toISOString(),
    podeGerenciar: podeGerenciar(conta, ator),
  };
}

// tela Equipe: professores e secretarias (nunca administradores), com nome, e-mail, perfil, situacao e o motivo da
// inativacao. "perfil" opcional filtra
async function listar(ator: Ator, perfil?: PerfilEquipe) {
  const contas = await prisma.usuario.findMany({
    where: { perfil: perfil ? perfil : { in: PERFIS_DA_TELA } },
    orderBy: { nome: "asc" },
    select: CAMPOS_DA_CONTA,
  });
  return contas.map((conta) => paraResposta(conta, ator));
}

// o sistema nunca fica sem administrador ativo: true se esta conta e o unico administrador ativo
async function ehUltimoAdministradorAtivo(id: string): Promise<boolean> {
  const outros = await prisma.usuario.count({ where: { perfil: "ADMINISTRADOR", ativo: true, id: { not: id } } });
  return outros === 0;
}

// a conta que o ator quer gerenciar, ja com as regras de quem gerencia quem (na API, nao so na tela)
async function contaGerenciavelOuFalhar(id: string, ator: Ator): Promise<ContaEquipe> {
  const conta = await prisma.usuario.findFirst({
    where: { id, perfil: { in: ["PROFESSOR", "SECRETARIA", "ADMINISTRADOR"] } },
    select: CAMPOS_DA_CONTA,
  });
  if (!conta) throw AppError.naoEncontrado("CONTA_NAO_ENCONTRADA", "Conta não encontrada.");
  if (conta.id === ator.id) {
    throw new AppError(403, "PROPRIA_CONTA", "Você não pode alterar a sua própria conta por esta tela.");
  }
  if (conta.perfil === "ADMINISTRADOR") {
    if (await ehUltimoAdministradorAtivo(conta.id)) {
      throw AppError.conflito("ULTIMO_ADMINISTRADOR", "O sistema precisa de pelo menos um administrador ativo.");
    }
    throw new AppError(403, "CONTA_ADMINISTRADOR", "Contas de administrador não são gerenciadas por esta tela.");
  }
  if (conta.perfil === "SECRETARIA" && ator.perfil !== "ADMINISTRADOR") {
    throw new AppError(403, "SO_ADMINISTRADOR", "Só o administrador gerencia contas de secretaria.");
  }
  return conta;
}

function perfilDaConta(conta: { perfil: Perfil }): PerfilEquipe {
  return conta.perfil === "SECRETARIA" ? "SECRETARIA" : "PROFESSOR";
}

// a acao de auditoria de cada passo, conforme o perfil da conta (as de professor ja existiam)
const ACOES: Record<PerfilEquipe, Record<"criada" | "convite" | "inativada" | "reativada", AcaoAuditoria>> = {
  PROFESSOR: {
    criada: "PROFESSOR_CRIADO",
    convite: "PROFESSOR_CONVITE_REENVIADO",
    inativada: "PROFESSOR_INATIVADO",
    reativada: "PROFESSOR_REATIVADO",
  },
  SECRETARIA: {
    criada: "SECRETARIA_CRIADA",
    convite: "SECRETARIA_CONVITE_REENVIADO",
    inativada: "SECRETARIA_INATIVADA",
    reativada: "SECRETARIA_REATIVADA",
  },
};

// chave do convite: aleatoria (crypto), 32 bytes em base64url; o banco guarda so o hash
function gerarConvite(): { chave: string; hash: string } {
  const chave = randomBytes(BYTES_DA_CHAVE).toString("base64url");
  return { chave, hash: hashDoConvite(chave) };
}

function hashDoConvite(chave: string): string {
  return createHash("sha256").update(chave, "utf8").digest("hex");
}

// a chave vai depois do "#": essa parte do endereco nunca chega ao servidor (nem a logs de proxy)
function linkDoConvite(chave: string): string {
  return `${env.appUrl}/#/primeiro-acesso?convite=${encodeURIComponent(chave)}`;
}

// sem APP_URL nao ha como montar o link: criar e reenviar sao recusados antes de mexer em qualquer coisa
function garantirEnderecoConfigurado() {
  if (!env.appUrl) {
    throw new AppError(503, "APP_URL_NAO_CONFIGURADA", "O endereço do sistema não está configurado; não é possível enviar o convite.");
  }
}

// manda o convite pro e-mail da conta. Falha de envio (ou SendGrid sem configuracao, em producao) nao desfaz a
// conta: a equipe usa "Reenviar convite". Devolve se o e-mail saiu
async function enviarConvite(conta: { id: string; perfil: PerfilEquipe }, email: string, nome: string, link: string, atorId: string) {
  const descricao = `convite de primeiro acesso da conta de ${NOME_DO_PERFIL[conta.perfil]} ${conta.id}`;
  try {
    const resultado = await emailService.enviarConviteEquipe(email, nome, link);
    if (resultado !== "simulado" || !env.isProduction) {
      await registrarAuditoria(atorId, "EMAIL_ENVIADO", `${descricao}${observacaoDoEnvio(resultado)}`);
      return true;
    }
  } catch {
    // email.service.ts ja loga o detalhe sanitizado da falha
  }
  await registrarAuditoria(atorId, "EMAIL_FALHA", `${descricao}: falha no envio`);
  return false;
}

function respostaDoEnvio(link: string, emailEnviado: boolean) {
  // fora de producao o link volta na resposta, so pra testar sem e-mail configurado
  return { emailEnviado, ...(env.isProduction ? {} : { linkConviteDemo: link }) };
}

// cria a conta de professor (administrador ou secretaria) ou de secretaria (so o administrador)
async function criar(dados: ContaEquipeInput, ator: Ator) {
  const perfil: PerfilEquipe = dados.perfil ?? "PROFESSOR";
  if (perfil === "SECRETARIA" && ator.perfil !== "ADMINISTRADOR") {
    throw new AppError(403, "SO_ADMINISTRADOR", "Só o administrador cria contas de secretaria.");
  }
  garantirEnderecoConfigurado();
  // o e-mail e unico no sistema todo: entre as contas de qualquer perfil e os cadastros de aluno ainda em andamento
  // (codigo enviado e no prazo). O indice unico de usuarios.emailLogin garante o resto, ate numa corrida
  const emailLogin = normalizarEmail(dados.email);
  const [contaComEmail, cadastroComEmail] = await Promise.all([
    prisma.usuario.findUnique({ where: { emailLogin }, select: { id: true } }),
    prisma.cadastroPendente.findFirst({ where: { emailLogin, expiraEm: { gt: new Date() } }, select: { id: true } }),
  ]);
  if (contaComEmail || cadastroComEmail) {
    throw AppError.conflito("EMAIL_DUPLICADO", "Já existe uma conta com este e-mail.");
  }
  const convite = gerarConvite();
  const usuarioId = randomUUID();
  try {
    await prisma.$transaction([
      prisma.usuario.create({
        data: { id: usuarioId, nome: dados.nomeCompleto, emailLogin, senhaHash: SENHA_INUTILIZAVEL, perfil },
      }),
      prisma.primeiroAcesso.create({
        data: { id: randomUUID(), usuarioId, codigoHash: convite.hash, expiraEm: new Date(Date.now() + VALIDADE_CONVITE_MS) },
      }),
    ]);
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      throw AppError.conflito("EMAIL_DUPLICADO", "Já existe uma conta com este e-mail.");
    }
    throw erro;
  }
  await registrarAuditoria(ator.id, ACOES[perfil].criada, `conta de ${NOME_DO_PERFIL[perfil]} ${usuarioId}, convite de primeiro acesso enviado`);
  await incrementarTentativa(chaveConta("primeiro-acesso", usuarioId));
  const link = linkDoConvite(convite.chave);
  const emailEnviado = await enviarConvite({ id: usuarioId, perfil }, emailLogin, dados.nomeCompleto, link, ator.id);
  const conta = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: CAMPOS_DA_CONTA });
  return { conta: paraResposta(conta, ator), ...respostaDoEnvio(link, emailEnviado) };
}

// novo convite (o anterior deixa de valer, validade volta a 24 h). So enquanto a conta nao fez o primeiro acesso;
// minimo de 60 s entre envios e 5 envios por conta em 15 min
async function reenviarConvite(id: string, ator: Ator) {
  const conta = await contaGerenciavelOuFalhar(id, ator);
  const perfil = perfilDaConta(conta);
  if (!aguardaConvite(conta)) {
    throw AppError.conflito("PRIMEIRO_ACESSO_FEITO", "Esta conta já fez o primeiro acesso.");
  }
  if (!conta.ativo) {
    throw AppError.conflito("CONTA_INATIVA", "Esta conta está inativa. Reative a conta antes de enviar um novo convite.");
  }
  garantirEnderecoConfigurado();
  const chave = chaveConta("primeiro-acesso", conta.id);
  if (await estaBloqueado(chave)) {
    throw new AppError(429, "MUITAS_TENTATIVAS", "Limite de envios de convite atingido. Tente novamente em 15 minutos.");
  }
  const pendente = await prisma.primeiroAcesso.findUnique({ where: { usuarioId: conta.id }, select: { ultimoEnvioEm: true } });
  const espera = INTERVALO_REENVIO_MS - (Date.now() - (pendente?.ultimoEnvioEm.getTime() ?? 0));
  if (espera > 0) {
    throw new AppError(429, "AGUARDE_REENVIO", `Aguarde ${Math.ceil(espera / 1000)} segundos para enviar um novo convite.`);
  }
  await incrementarTentativa(chave);

  const convite = gerarConvite();
  const dados = { codigoHash: convite.hash, tentativas: 0, ultimoEnvioEm: new Date(), expiraEm: new Date(Date.now() + VALIDADE_CONVITE_MS) };
  await prisma.primeiroAcesso.upsert({
    where: { usuarioId: conta.id },
    create: { id: randomUUID(), usuarioId: conta.id, ...dados },
    update: { ...dados, envios: { increment: 1 } },
  });
  await registrarAuditoria(ator.id, ACOES[perfil].convite, `conta de ${NOME_DO_PERFIL[perfil]} ${conta.id}: novo convite de primeiro acesso`);
  const link = linkDoConvite(convite.chave);
  const emailEnviado = await enviarConvite({ id: conta.id, perfil }, normalizarEmail(conta.emailLogin), conta.nome, link, ator.id);
  return respostaDoEnvio(link, emailEnviado);
}

// resposta UNICA pra qualquer falha (chave inexistente, vencida, ja usada, conta ja ativa ou inativa):
// ninguem descobre por aqui se a chave chegou a existir
function erroConvite(): AppError {
  return new AppError(422, "CONVITE_INVALIDO", "Convite inválido ou vencido.");
}

// acha o convite valido pela chave (pelo hash). Chave errada conta no limite de tentativas por IP; com o
// IP bloqueado, 429 antes de olhar a chave
async function conviteValidoOuFalhar(chave: string, ip: string) {
  const chaveDoIp = chaveIp("primeiro-acesso", ip);
  if (await estaBloqueado(chaveDoIp)) {
    await registrarAuditoria(null, "PRIMEIRO_ACESSO_FALHA", "bloqueado temporariamente (limite de tentativas)");
    throw new AppError(429, "MUITAS_TENTATIVAS", "Muitas tentativas. Tente novamente em alguns minutos.");
  }
  const pendente = await prisma.primeiroAcesso.findFirst({
    where: { codigoHash: hashDoConvite(chave) },
    include: { usuario: { select: { id: true, emailLogin: true, perfil: true, ativo: true, consentimentoLgpdEm: true, senhaHash: true } } },
  });
  const valido =
    !!pendente &&
    pendente.expiraEm > new Date() &&
    PERFIS_DA_TELA.includes(pendente.usuario.perfil as PerfilEquipe) &&
    pendente.usuario.ativo &&
    aguardaConvite(pendente.usuario);
  if (!valido) {
    await incrementarTentativa(chaveDoIp, MAX_TENTATIVAS_POR_IP);
    await registrarAuditoria(
      pendente?.usuarioId ?? null,
      "PRIMEIRO_ACESSO_FALHA",
      pendente ? "convite vencido ou conta indisponível" : "convite inexistente ou já usado",
    );
    throw erroConvite();
  }
  return pendente;
}

// a tela "Primeiro acesso" abre pelo link e consulta a chave: so diz se vale e o e-mail da conta (pra
// mostrar). NAO gasta o convite — antivirus de e-mail costumam abrir os links sozinhos
async function consultarConvite(dados: ConsultaConviteInput, ip: string) {
  const pendente = await conviteValidoOuFalhar(dados.convite, ip);
  return { email: pendente.usuario.emailLogin };
}

// a pessoa envia a senha nova e o aceite dos Termos com a chave do convite: grava a senha, o instante e a
// versao do aceite, e o convite e apagado na mesma transacao (uso unico, mesmo com dois envios ao mesmo tempo)
async function concluirPrimeiroAcesso(dados: PrimeiroAcessoInput, ip: string) {
  const pendente = await conviteValidoOuFalhar(dados.convite, ip);
  const contaId = pendente.usuarioId;
  const perfil = perfilDaConta(pendente.usuario);
  const senhaHash = await gerarHashSenha(dados.novaSenha);
  // instante unico do aceite: vai igual pra conta e pro log CONSENTIMENTO_LGPD_ACEITO
  const aceiteEm = new Date();
  const usado = await prisma.$transaction(async (tx) => {
    const { count } = await tx.primeiroAcesso.deleteMany({ where: { id: pendente.id, codigoHash: pendente.codigoHash } });
    if (count === 0) return false;
    await tx.usuario.update({
      where: { id: contaId },
      data: { senhaHash, consentimentoLgpdEm: aceiteEm, versaoTermosAceitos: VERSAO_TERMOS_ATUAL, versaoToken: { increment: 1 } },
    });
    return true;
  });
  if (!usado) {
    await registrarAuditoria(contaId, "PRIMEIRO_ACESSO_FALHA", "convite já usado");
    throw erroConvite();
  }
  await registrarAuditoria(contaId, "PRIMEIRO_ACESSO_CONCLUIDO", `conta de ${NOME_DO_PERFIL[perfil]} ${contaId} ativada pelo convite`);
  await registrarAuditoria(
    contaId,
    "CONSENTIMENTO_LGPD_ACEITO",
    `termos de uso e política de privacidade (versão ${VERSAO_TERMOS_ATUAL}) aceitos em ${aceiteEm.toISOString()}`,
    aceiteEm,
  );
}

// ---------------------------------------------------------------- inativacao e reativacao
// evento "em aberto" do professor: ainda nao encerrou (inclusive pendente ou recusado) ou encerrou ha menos de
// 24 horas (ainda ha presenca, certificados e notas para acompanhar). Os encerrados ha mais tempo ficam com o
// nome dele, como registro. A secretaria nunca e "responsavel" por evento (o evento da equipe fica com
// criadoPorId nulo), entao nao tem o que transferir
const JANELA_POS_EVENTO_MS = 24 * 60 * 60 * 1000;

async function eventosEmAberto(professorId: string) {
  const eventos = await prisma.evento.findMany({
    where: { criadoPorId: professorId },
    orderBy: { horario: "asc" },
    select: { id: true, titulo: true, horario: true, cargaHoraria: true, situacao: true },
  });
  const limite = new Date(Date.now() - JANELA_POS_EVENTO_MS);
  return eventos.filter((evento) => !eventoEncerrado(evento, limite));
}

// tela Equipe: os eventos que precisam de um novo responsavel antes de inativar (secretaria: nenhum)
async function listarEventosEmAberto(id: string, ator: Ator) {
  const conta = await contaGerenciavelOuFalhar(id, ator);
  if (conta.perfil !== "PROFESSOR") return [];
  return (await eventosEmAberto(id)).map((evento) => ({
    id: evento.id,
    titulo: evento.titulo,
    horario: evento.horario.toISOString(),
    situacao: evento.situacao,
  }));
}

// inativa a conta: as sessoes caem (versaoToken) e o login passa a recusar. Professor: deixa de ser opcao de
// transferencia e, se tem evento em aberto, a equipe escolhe para quem vai: outro professor ATIVO (que ja fez o
// primeiro acesso) ou a equipe. O evento vai com a proposta de alteracao aberta; indo para a equipe, a proposta
// recusada e descartada (a equipe edita direto). Os palestrantes dele continuam como estao. Secretaria: so inativa
async function inativar(id: string, dados: InativacaoProfessorInput, ator: Ator) {
  const conta = await contaGerenciavelOuFalhar(id, ator);
  const perfil = perfilDaConta(conta);
  if (!conta.ativo) throw AppError.conflito("CONTA_JA_INATIVA", "Esta conta já está inativa.");

  const abertos = perfil === "PROFESSOR" ? await eventosEmAberto(id) : [];
  let destino: { id: string | null; nome: string } = { id: null, nome: "Equipe" };
  if (abertos.length > 0) {
    if (!dados.transferirPara) {
      throw AppError.conflito(
        "TRANSFERENCIA_OBRIGATORIA",
        `Este professor tem ${abertos.length} evento(s) em aberto. Escolha para quem transferi-los antes de inativar.`,
      );
    }
    if (dados.transferirPara !== "EQUIPE") {
      const alvo =
        dados.transferirPara === id
          ? null
          : await prisma.usuario.findFirst({
              where: { id: dados.transferirPara, perfil: "PROFESSOR", ativo: true, consentimentoLgpdEm: { not: null } },
              select: { id: true, nome: true },
            });
      if (!alvo) {
        throw AppError.validacao("Dados inválidos.", [
          { campo: "transferirPara", mensagem: "Escolha um professor ativo (que já fez o primeiro acesso) ou a equipe." },
        ]);
      }
      destino = alvo;
    }
  }

  const ids = abertos.map((evento) => evento.id);
  // indo para a equipe, a proposta recusada sai (ninguem mais a reenviaria: a equipe edita o evento direto)
  const descartadas =
    destino.id === null && ids.length > 0
      ? await prisma.propostaAlteracao.findMany({ where: { eventoId: { in: ids }, situacao: "RECUSADO" }, select: { eventoId: true } })
      : [];
  await prisma.$transaction([
    prisma.evento.updateMany({ where: { id: { in: ids } }, data: { criadoPorId: destino.id } }),
    prisma.propostaAlteracao.deleteMany({
      where: { eventoId: { in: descartadas.map((p) => p.eventoId!) }, situacao: "RECUSADO" },
    }),
    prisma.propostaAlteracao.updateMany({
      where: { eventoId: { in: ids }, situacao: { in: ["PENDENTE", "RECUSADO"] } },
      data: { criadoPorId: destino.id },
    }),
    prisma.usuario.update({
      where: { id },
      data: { ativo: false, motivoInativacao: dados.motivo, versaoToken: { increment: 1 } },
    }),
  ]);

  for (const evento of abertos) {
    const descartou = descartadas.some((p) => p.eventoId === evento.id);
    await registrarHistorico(
      "EVENTO",
      evento.id,
      "TRANSFERIDO",
      ator.id,
      `De ${conta.nome} para ${destino.nome}, na inativação do professor.${descartou ? " A proposta de alteração recusada foi descartada." : ""}`,
    );
    await registrarAuditoria(
      ator.id,
      "EVENTO_TRANSFERIDO",
      `evento ${evento.id}: do professor ${id} para ${destino.id ? `o professor ${destino.id}` : "a equipe"}`,
    );
  }
  // o motivo e texto livre: fica so na conta (visivel pra equipe), nunca no log
  await registrarAuditoria(
    ator.id,
    ACOES[perfil].inativada,
    perfil === "PROFESSOR"
      ? `conta de professor ${id} (motivo registrado no cadastro; ${abertos.length} evento(s) em aberto transferido(s))`
      : `conta de secretaria ${id} (motivo registrado no cadastro)`,
  );
  const atualizada = await prisma.usuario.findUniqueOrThrow({ where: { id }, select: CAMPOS_DA_CONTA });
  return { conta: paraResposta(atualizada, ator), eventosTransferidos: abertos.length };
}

// reativa: a pessoa volta a entrar com a senha dela (ou faz o primeiro acesso, se ainda nao fez). Os eventos
// transferidos nao voltam sozinhos
async function reativar(id: string, ator: Ator) {
  const conta = await contaGerenciavelOuFalhar(id, ator);
  if (conta.ativo) throw AppError.conflito("CONTA_JA_ATIVA", "Esta conta já está ativa.");
  const atualizada = await prisma.usuario.update({ where: { id }, data: { ativo: true, motivoInativacao: null }, select: CAMPOS_DA_CONTA });
  await registrarAuditoria(ator.id, ACOES[perfilDaConta(conta)].reativada, `conta de ${NOME_DO_PERFIL[perfilDaConta(conta)]} ${id}`);
  return paraResposta(atualizada, ator);
}

// ---------------------------------------------------------------- exclusao
// o que conta como historico da pessoa no sistema: eventos ou palestrantes criados, decisoes de aprovacao (e o que
// ela enviou para aprovacao), propostas de alteracao, check-ins decididos e solicitacoes do titular atendidas
async function temHistorico(id: string): Promise<boolean> {
  const contagens = await prisma.$transaction([
    prisma.evento.count({ where: { criadoPorId: id } }),
    prisma.palestrante.count({ where: { criadoPorId: id } }),
    prisma.historicoAprovacao.count({ where: { autorId: id } }),
    prisma.propostaAlteracao.count({ where: { criadoPorId: id } }),
    prisma.inscricao.count({ where: { usuarioId: id } }),
    prisma.solicitacaoTitular.count({ where: { atendidoPorId: id } }),
  ]);
  return contagens.some((n) => n > 0);
}

export const MENSAGEM_CONTA_PRESERVADA = "Esta conta tem histórico no sistema e fica preservada como inativa.";

// exclui conta inativa ou com convite pendente. Quem tem historico nao sai: fica (ou passa a ficar) inativa. A
// exclusao apaga a conta, o convite, os codigos de recuperacao e os contadores de tentativa dela; os registros de
// auditoria FICAM (logs_auditoria.usuarioId vira nulo pela chave estrangeira, e o atorNome guarda quem agiu), como
// na remocao de aluno
async function excluir(id: string, ator: Ator) {
  const conta = await contaGerenciavelOuFalhar(id, ator);
  const perfil = perfilDaConta(conta);
  const pendente = aguardaConvite(conta);
  if (conta.ativo && !pendente) {
    throw AppError.conflito("CONTA_ATIVA", "Só é possível excluir uma conta inativa ou com convite pendente. Inative a conta antes.");
  }

  if (await temHistorico(id)) {
    if (conta.ativo) {
      await prisma.$transaction([
        prisma.primeiroAcesso.deleteMany({ where: { usuarioId: id } }),
        prisma.usuario.update({
          where: { id },
          data: { ativo: false, motivoInativacao: "Exclusão pedida: a conta tem histórico no sistema.", versaoToken: { increment: 1 } },
        }),
      ]);
    }
    await registrarAuditoria(
      ator.id,
      "CONTA_EQUIPE_PRESERVADA",
      `conta de ${NOME_DO_PERFIL[perfil]} ${id}: exclusão pedida, mantida como inativa por ter histórico`,
    );
    const atualizada = await prisma.usuario.findUniqueOrThrow({ where: { id }, select: CAMPOS_DA_CONTA });
    return { excluida: false, mensagem: MENSAGEM_CONTA_PRESERVADA, conta: paraResposta(atualizada, ator) };
  }

  const chaves = [...chavesDaConta(conta), chaveConta("primeiro-acesso", id)];
  await prisma.$transaction([
    prisma.limiteAcesso.deleteMany({ where: { chave: { in: chaves } } }),
    // primeiros_acessos, recuperacoes_senha e codigos_recuperacao_mfa saem junto (onDelete: Cascade)
    prisma.usuario.delete({ where: { id } }),
  ]);
  await registrarAuditoria(
    ator.id,
    "CONTA_EQUIPE_EXCLUIDA",
    `conta de ${NOME_DO_PERFIL[perfil]} ${id}${pendente ? " (nunca ativada; convite pendente apagado junto)" : ""}`,
  );
  return { excluida: true };
}

export const professoresService = {
  listar,
  criar,
  reenviarConvite,
  consultarConvite,
  concluirPrimeiroAcesso,
  listarEventosEmAberto,
  inativar,
  reativar,
  excluir,
};

