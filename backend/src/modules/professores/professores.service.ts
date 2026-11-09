import { createHash, randomBytes, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { env } from "../../config/env";
import { VERSAO_TERMOS_ATUAL } from "../../config/termos";
import { registrarAuditoria } from "../../utils/auditoria";
import { chaveConta, chaveIp, estaBloqueado, incrementarTentativa, MAX_TENTATIVAS_POR_IP } from "../../utils/limiteAcesso";
import { gerarHashSenha, SENHA_INUTILIZAVEL } from "../../utils/password";
import { normalizarEmail } from "../../utils/validacao";
import { registrarHistorico } from "../aprovacoes/aprovacoes.service";
import { eventoEncerrado } from "../../utils/escopo";
import { emailService } from "../email/email.service";
import type { ConsultaConviteInput, PrimeiroAcessoInput } from "../auth/auth.schemas";
import type { InativacaoProfessorInput, ProfessorInput } from "./professores.schemas";

// conta de PROFESSOR: criada pela equipe (so nome e e-mail @umc.br), nasce SEM senha utilizavel e sem
// aceite dos Termos — o login recusa ate o primeiro acesso. Ao criar (e a cada reenvio), o professor recebe
// por e-mail um CONVITE: um link com uma chave aleatoria de 32 bytes (base64url), que vale 24 horas e so
// pode ser usado uma vez. No banco fica so o SHA-256 da chave (na coluna codigoHash de primeiros_acessos):
// a chave e longa e aleatoria, entao o hash rapido basta (bcrypt serve pra senha, que e curta e adivinhavel).
// Chave nova invalida a anterior. Fora de producao, a resposta traz o link (linkConviteDemo)
const VALIDADE_CONVITE_MS = 24 * 60 * 60 * 1000;
const INTERVALO_REENVIO_MS = 60 * 1000;
const BYTES_DA_CHAVE = 32;

export type SituacaoProfessor = "AGUARDANDO_PRIMEIRO_ACESSO" | "ATIVO" | "INATIVO";

interface ContaProfessor {
  id: string;
  nome: string;
  emailLogin: string;
  consentimentoLgpdEm: Date | null;
  ativo: boolean;
  motivoInativacao: string | null;
  criadoEm: Date;
}

const CAMPOS_DA_CONTA = {
  id: true,
  nome: true,
  emailLogin: true,
  consentimentoLgpdEm: true,
  ativo: true,
  motivoInativacao: true,
  criadoEm: true,
} as const;

function situacao(usuario: ContaProfessor): SituacaoProfessor {
  if (!usuario.ativo) return "INATIVO";
  return usuario.consentimentoLgpdEm ? "ATIVO" : "AGUARDANDO_PRIMEIRO_ACESSO";
}

function paraResposta(usuario: ContaProfessor) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.emailLogin,
    situacao: situacao(usuario),
    motivoInativacao: usuario.motivoInativacao,
    criadoEm: usuario.criadoEm.toISOString(),
  };
}

// tela Professores (equipe): nome, e-mail, situacao e o motivo da inativacao
async function listar() {
  const professores = await prisma.usuario.findMany({
    where: { perfil: "PROFESSOR" },
    orderBy: { nome: "asc" },
    select: CAMPOS_DA_CONTA,
  });
  return professores.map(paraResposta);
}

async function professorOuFalhar(id: string) {
  const professor = await prisma.usuario.findFirst({ where: { id, perfil: "PROFESSOR" }, select: CAMPOS_DA_CONTA });
  if (!professor) throw AppError.naoEncontrado("PROFESSOR_NAO_ENCONTRADO", "Professor não encontrado.");
  return professor;
}

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

// manda o convite pro e-mail do professor. Falha de envio (ou SendGrid sem configuracao, em producao) nao
// desfaz a conta: a equipe usa "Reenviar convite". Devolve se o e-mail saiu
async function enviarConvite(usuarioId: string, email: string, nome: string, link: string, atorId: string): Promise<boolean> {
  try {
    const resultado = await emailService.enviarConviteProfessor(email, nome, link);
    if (resultado === "enviado" || !env.isProduction) {
      await registrarAuditoria(
        atorId,
        "EMAIL_ENVIADO",
        `convite de primeiro acesso do professor ${usuarioId}${resultado === "simulado" ? " (simulado: SendGrid não configurado)" : ""}`,
      );
      return true;
    }
  } catch {
    // email.service.ts ja loga o detalhe sanitizado da falha
  }
  await registrarAuditoria(atorId, "EMAIL_FALHA", `convite de primeiro acesso do professor ${usuarioId}: falha no envio`);
  return false;
}

function respostaDoEnvio(link: string, emailEnviado: boolean) {
  // fora de producao o link volta na resposta, so pra testar sem e-mail configurado
  return { emailEnviado, ...(env.isProduction ? {} : { linkConviteDemo: link }) };
}

// a equipe cria a conta do professor
async function criar(dados: ProfessorInput, atorId: string) {
  garantirEnderecoConfigurado();
  const emailLogin = normalizarEmail(dados.email);
  if (await prisma.usuario.findUnique({ where: { emailLogin }, select: { id: true } })) {
    throw AppError.conflito("EMAIL_DUPLICADO", "Já existe uma conta com este e-mail.");
  }
  const convite = gerarConvite();
  const usuarioId = randomUUID();
  let professor;
  try {
    [professor] = await prisma.$transaction([
      prisma.usuario.create({
        data: { id: usuarioId, nome: dados.nomeCompleto, emailLogin, senhaHash: SENHA_INUTILIZAVEL, perfil: "PROFESSOR" },
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
  await registrarAuditoria(atorId, "PROFESSOR_CRIADO", `conta de professor ${professor.id}, convite de primeiro acesso enviado`);
  await incrementarTentativa(chaveConta("primeiro-acesso", professor.id));
  const link = linkDoConvite(convite.chave);
  const emailEnviado = await enviarConvite(professor.id, emailLogin, professor.nome, link, atorId);
  return { professor: paraResposta(professor), ...respostaDoEnvio(link, emailEnviado) };
}

// novo convite (o anterior deixa de valer, validade volta a 24 h). So enquanto o professor nao fez o
// primeiro acesso; minimo de 60 s entre envios e 5 envios por conta em 15 min
async function reenviarConvite(id: string, atorId: string) {
  const professor = await prisma.usuario.findFirst({ where: { id, perfil: "PROFESSOR" }, include: { primeiroAcesso: true } });
  if (!professor) throw AppError.naoEncontrado("PROFESSOR_NAO_ENCONTRADO", "Professor não encontrado.");
  if (professor.consentimentoLgpdEm) {
    throw AppError.conflito("PRIMEIRO_ACESSO_FEITO", "Este professor já fez o primeiro acesso.");
  }
  if (!professor.ativo) {
    throw AppError.conflito("PROFESSOR_INATIVO", "Este professor está inativo. Reative a conta antes de enviar um novo convite.");
  }
  garantirEnderecoConfigurado();
  const chave = chaveConta("primeiro-acesso", professor.id);
  if (await estaBloqueado(chave)) {
    throw new AppError(429, "MUITAS_TENTATIVAS", "Limite de envios de convite atingido. Tente novamente em 15 minutos.");
  }
  const ultimoEnvio = professor.primeiroAcesso?.ultimoEnvioEm.getTime() ?? 0;
  const espera = INTERVALO_REENVIO_MS - (Date.now() - ultimoEnvio);
  if (espera > 0) {
    throw new AppError(429, "AGUARDE_REENVIO", `Aguarde ${Math.ceil(espera / 1000)} segundos para enviar um novo convite.`);
  }
  await incrementarTentativa(chave);

  const convite = gerarConvite();
  const dados = { codigoHash: convite.hash, tentativas: 0, ultimoEnvioEm: new Date(), expiraEm: new Date(Date.now() + VALIDADE_CONVITE_MS) };
  await prisma.primeiroAcesso.upsert({
    where: { usuarioId: professor.id },
    create: { id: randomUUID(), usuarioId: professor.id, ...dados },
    update: { ...dados, envios: { increment: 1 } },
  });
  await registrarAuditoria(atorId, "PROFESSOR_CONVITE_REENVIADO", `conta de professor ${professor.id}: novo convite de primeiro acesso`);
  const link = linkDoConvite(convite.chave);
  const emailEnviado = await enviarConvite(professor.id, professor.emailLogin, professor.nome, link, atorId);
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
    include: { usuario: { select: { id: true, emailLogin: true, perfil: true, ativo: true, consentimentoLgpdEm: true } } },
  });
  const valido =
    !!pendente &&
    pendente.expiraEm > new Date() &&
    pendente.usuario.perfil === "PROFESSOR" &&
    pendente.usuario.ativo &&
    !pendente.usuario.consentimentoLgpdEm;
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

// o professor envia a senha nova e o aceite dos Termos com a chave do convite: grava a senha, o instante e a
// versao do aceite, e o convite e apagado na mesma transacao (uso unico, mesmo com dois envios ao mesmo tempo)
async function concluirPrimeiroAcesso(dados: PrimeiroAcessoInput, ip: string) {
  const pendente = await conviteValidoOuFalhar(dados.convite, ip);
  const professorId = pendente.usuarioId;
  const senhaHash = await gerarHashSenha(dados.novaSenha);
  // instante unico do aceite: vai igual pra conta e pro log CONSENTIMENTO_LGPD_ACEITO
  const aceiteEm = new Date();
  const usado = await prisma.$transaction(async (tx) => {
    const { count } = await tx.primeiroAcesso.deleteMany({ where: { id: pendente.id, codigoHash: pendente.codigoHash } });
    if (count === 0) return false;
    await tx.usuario.update({
      where: { id: professorId },
      data: { senhaHash, consentimentoLgpdEm: aceiteEm, versaoTermosAceitos: VERSAO_TERMOS_ATUAL, versaoToken: { increment: 1 } },
    });
    return true;
  });
  if (!usado) {
    await registrarAuditoria(professorId, "PRIMEIRO_ACESSO_FALHA", "convite já usado");
    throw erroConvite();
  }
  await registrarAuditoria(professorId, "PRIMEIRO_ACESSO_CONCLUIDO", `conta de professor ${professorId} ativada pelo convite`);
  await registrarAuditoria(
    professorId,
    "CONSENTIMENTO_LGPD_ACEITO",
    `termos de uso e política de privacidade (versão ${VERSAO_TERMOS_ATUAL}) aceitos em ${aceiteEm.toISOString()}`,
    aceiteEm,
  );
}

// ---------------------------------------------------------------- inativacao e reativacao
// evento "em aberto" do professor: ainda nao encerrou (inclusive pendente ou recusado) ou encerrou ha menos de
// 24 horas (ainda ha presenca, certificados e notas para acompanhar). Os encerrados ha mais tempo ficam com o
// nome dele, como registro
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

// tela Professores: os eventos que precisam de um novo responsavel antes de inativar
async function listarEventosEmAberto(id: string) {
  await professorOuFalhar(id);
  return (await eventosEmAberto(id)).map((evento) => ({
    id: evento.id,
    titulo: evento.titulo,
    horario: evento.horario.toISOString(),
    situacao: evento.situacao,
  }));
}

// inativa a conta: as sessoes caem (versaoToken), o login passa a recusar e o professor deixa de ser opcao de
// transferencia. Se ele tem evento em aberto, a equipe escolhe para quem vai: outro professor ATIVO (que ja fez
// o primeiro acesso) ou a equipe. O evento vai com a proposta de alteracao aberta; indo para a equipe, a proposta
// recusada e descartada (a equipe edita direto). Os palestrantes dele continuam como estao
async function inativar(id: string, dados: InativacaoProfessorInput, atorId: string) {
  const professor = await professorOuFalhar(id);
  if (!professor.ativo) throw AppError.conflito("PROFESSOR_JA_INATIVO", "Este professor já está inativo.");

  const abertos = await eventosEmAberto(id);
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
      atorId,
      `De ${professor.nome} para ${destino.nome}, na inativação do professor.${descartou ? " A proposta de alteração recusada foi descartada." : ""}`,
    );
    await registrarAuditoria(
      atorId,
      "EVENTO_TRANSFERIDO",
      `evento ${evento.id}: do professor ${id} para ${destino.id ? `o professor ${destino.id}` : "a equipe"}`,
    );
  }
  // o motivo e texto livre: fica so na conta (visivel pra equipe), nunca no log
  await registrarAuditoria(
    atorId,
    "PROFESSOR_INATIVADO",
    `conta de professor ${id} (motivo registrado no cadastro; ${abertos.length} evento(s) em aberto transferido(s))`,
  );
  return { professor: paraResposta(await professorOuFalhar(id)), eventosTransferidos: abertos.length };
}

// reativa: o professor volta a entrar com a senha dele (ou faz o primeiro acesso, se ainda nao fez). Os eventos
// transferidos nao voltam sozinhos
async function reativar(id: string, atorId: string) {
  const professor = await professorOuFalhar(id);
  if (professor.ativo) throw AppError.conflito("PROFESSOR_JA_ATIVO", "Este professor já está ativo.");
  await prisma.usuario.update({ where: { id }, data: { ativo: true, motivoInativacao: null } });
  await registrarAuditoria(atorId, "PROFESSOR_REATIVADO", `conta de professor ${id}`);
  return paraResposta(await professorOuFalhar(id));
}

export const professoresService = { listar, criar, reenviarConvite, consultarConvite, concluirPrimeiroAcesso, listarEventosEmAberto, inativar, reativar };
