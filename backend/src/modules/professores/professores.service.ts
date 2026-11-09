import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { env } from "../../config/env";
import { VERSAO_TERMOS_ATUAL } from "../../config/termos";
import { registrarAuditoria } from "../../utils/auditoria";
import { chaveConta, chaveIp, estaBloqueado, incrementarTentativa, MAX_TENTATIVAS_POR_IP } from "../../utils/limiteAcesso";
import { conferirSenha, gerarHashSenha, SENHA_INUTILIZAVEL } from "../../utils/password";
import { normalizarEmail } from "../../utils/validacao";
import { gerarCodigoNumerico } from "../auth/auth.service";
import { registrarHistorico } from "../aprovacoes/aprovacoes.service";
import { eventoEncerrado } from "../../utils/escopo";
import { emailService } from "../email/email.service";
import type { PrimeiroAcessoInput } from "../auth/auth.schemas";
import type { InativacaoProfessorInput, ProfessorInput } from "./professores.schemas";

// conta de PROFESSOR: criada pela equipe (so nome e e-mail @umc.br), nasce SEM senha utilizavel e sem
// aceite dos Termos — o login recusa ate o primeiro acesso. Ao criar, o professor recebe por e-mail um
// codigo de 6 digitos (mesmo padrao do cadastro do aluno: so o hash bcrypt, limite de envios, codigoDemo
// fora de producao), que vale 24 horas e deixa de valer na 5a tentativa errada
const VALIDADE_CODIGO_MS = 24 * 60 * 60 * 1000;
const INTERVALO_REENVIO_MS = 60 * 1000;
const MAX_TENTATIVAS_CODIGO = 5;

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

// manda o codigo pro e-mail do professor. Falha de envio (ou SendGrid sem configuracao, em producao) nao
// desfaz a conta: a equipe usa "Reenviar codigo". Devolve se o e-mail saiu
async function enviarCodigo(usuarioId: string, email: string, nome: string, codigo: string, atorId: string): Promise<boolean> {
  try {
    const resultado = await emailService.enviarCodigoPrimeiroAcesso(email, nome, codigo);
    if (resultado === "enviado" || !env.isProduction) {
      await registrarAuditoria(
        atorId,
        "EMAIL_ENVIADO",
        `código de primeiro acesso do professor ${usuarioId}${resultado === "simulado" ? " (simulado: SendGrid não configurado)" : ""}`,
      );
      return true;
    }
  } catch {
    // email.service.ts ja loga o detalhe sanitizado da falha
  }
  await registrarAuditoria(atorId, "EMAIL_FALHA", `código de primeiro acesso do professor ${usuarioId}: falha no envio`);
  return false;
}

function respostaDoEnvio(codigo: string, emailEnviado: boolean) {
  // fora de producao o codigo volta na resposta, so pra testar sem e-mail configurado
  return { emailEnviado, ...(env.isProduction ? {} : { codigoDemo: codigo }) };
}

// a equipe cria a conta do professor
async function criar(dados: ProfessorInput, atorId: string) {
  const emailLogin = normalizarEmail(dados.email);
  if (await prisma.usuario.findUnique({ where: { emailLogin }, select: { id: true } })) {
    throw AppError.conflito("EMAIL_DUPLICADO", "Já existe uma conta com este e-mail.");
  }
  const codigo = gerarCodigoNumerico();
  const usuarioId = randomUUID();
  let professor;
  try {
    [professor] = await prisma.$transaction([
      prisma.usuario.create({
        data: { id: usuarioId, nome: dados.nomeCompleto, emailLogin, senhaHash: SENHA_INUTILIZAVEL, perfil: "PROFESSOR" },
      }),
      prisma.primeiroAcesso.create({
        data: {
          id: randomUUID(),
          usuarioId,
          codigoHash: await gerarHashSenha(codigo),
          expiraEm: new Date(Date.now() + VALIDADE_CODIGO_MS),
        },
      }),
    ]);
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      throw AppError.conflito("EMAIL_DUPLICADO", "Já existe uma conta com este e-mail.");
    }
    throw erro;
  }
  await registrarAuditoria(atorId, "PROFESSOR_CRIADO", `conta de professor ${professor.id}, aguardando o primeiro acesso`);
  await incrementarTentativa(chaveConta("primeiro-acesso", professor.id));
  const emailEnviado = await enviarCodigo(professor.id, emailLogin, professor.nome, codigo, atorId);
  return { professor: paraResposta(professor), ...respostaDoEnvio(codigo, emailEnviado) };
}

// novo codigo (o anterior deixa de valer, tentativas zeram, validade volta a 24 h). So enquanto o
// professor nao fez o primeiro acesso; minimo de 60 s entre envios e 5 envios por conta em 15 min
async function reenviarCodigo(id: string, atorId: string) {
  const professor = await prisma.usuario.findFirst({ where: { id, perfil: "PROFESSOR" }, include: { primeiroAcesso: true } });
  if (!professor) throw AppError.naoEncontrado("PROFESSOR_NAO_ENCONTRADO", "Professor não encontrado.");
  if (professor.consentimentoLgpdEm) {
    throw AppError.conflito("PRIMEIRO_ACESSO_FEITO", "Este professor já fez o primeiro acesso.");
  }
  if (!professor.ativo) {
    throw AppError.conflito("PROFESSOR_INATIVO", "Este professor está inativo. Reative a conta antes de enviar um novo código.");
  }
  const chave = chaveConta("primeiro-acesso", professor.id);
  if (await estaBloqueado(chave)) {
    throw new AppError(429, "MUITAS_TENTATIVAS", "Limite de envios de código atingido. Tente novamente em 15 minutos.");
  }
  const ultimoEnvio = professor.primeiroAcesso?.ultimoEnvioEm.getTime() ?? 0;
  const espera = INTERVALO_REENVIO_MS - (Date.now() - ultimoEnvio);
  if (espera > 0) {
    throw new AppError(429, "AGUARDE_REENVIO", `Aguarde ${Math.ceil(espera / 1000)} segundos para enviar um novo código.`);
  }
  await incrementarTentativa(chave);

  const codigo = gerarCodigoNumerico();
  const dados = { codigoHash: await gerarHashSenha(codigo), tentativas: 0, ultimoEnvioEm: new Date(), expiraEm: new Date(Date.now() + VALIDADE_CODIGO_MS) };
  await prisma.primeiroAcesso.upsert({
    where: { usuarioId: professor.id },
    create: { id: randomUUID(), usuarioId: professor.id, ...dados },
    update: { ...dados, envios: { increment: 1 } },
  });
  await registrarAuditoria(atorId, "PROFESSOR_CODIGO_REENVIADO", `conta de professor ${professor.id}: novo código de primeiro acesso`);
  const emailEnviado = await enviarCodigo(professor.id, professor.emailLogin, professor.nome, codigo, atorId);
  return respostaDoEnvio(codigo, emailEnviado);
}

// resposta UNICA pra qualquer falha (e-mail sem conta, conta ja ativa, codigo errado, expirado ou
// esgotado): ninguem descobre por aqui quais e-mails tem conta de professor
function erroCodigo(): AppError {
  return new AppError(422, "CODIGO_INVALIDO", "Código inválido ou expirado.");
}

// tela publica "Primeiro acesso": codigo + senha nova + aceite dos Termos. Ao confirmar, grava a senha,
// o instante e a versao do aceite e a conta fica ativa
async function concluirPrimeiroAcesso(dados: PrimeiroAcessoInput, ip: string) {
  const chaveDoIp = chaveIp("primeiro-acesso", ip);
  if (await estaBloqueado(chaveDoIp)) {
    await registrarAuditoria(null, "PRIMEIRO_ACESSO_FALHA", "bloqueado temporariamente (limite de tentativas)");
    throw new AppError(429, "MUITAS_TENTATIVAS", "Muitas tentativas. Tente novamente em alguns minutos.");
  }
  const falhar = async (motivo: string, usuarioId: string | null = null): Promise<never> => {
    await incrementarTentativa(chaveDoIp, MAX_TENTATIVAS_POR_IP);
    await registrarAuditoria(usuarioId, "PRIMEIRO_ACESSO_FALHA", motivo);
    throw erroCodigo();
  };

  const professor = await prisma.usuario.findFirst({
    where: { emailLogin: normalizarEmail(dados.email), perfil: "PROFESSOR", consentimentoLgpdEm: null, ativo: true },
    include: { primeiroAcesso: true },
  });
  const pendente = professor?.primeiroAcesso;
  if (!professor || !pendente) return falhar("e-mail sem primeiro acesso pendente");
  if (pendente.expiraEm <= new Date() || pendente.tentativas >= MAX_TENTATIVAS_CODIGO) {
    return falhar("código expirado ou esgotado", professor.id);
  }
  if (!(await conferirSenha(dados.codigo, pendente.codigoHash))) {
    await prisma.primeiroAcesso.update({ where: { id: pendente.id }, data: { tentativas: { increment: 1 } } });
    return falhar(`código incorreto (tentativa ${pendente.tentativas + 1} de ${MAX_TENTATIVAS_CODIGO})`, professor.id);
  }

  // instante unico do aceite: vai igual pra conta e pro log CONSENTIMENTO_LGPD_ACEITO
  const aceiteEm = new Date();
  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: professor.id },
      data: {
        senhaHash: await gerarHashSenha(dados.novaSenha),
        consentimentoLgpdEm: aceiteEm,
        versaoTermosAceitos: VERSAO_TERMOS_ATUAL,
        versaoToken: { increment: 1 },
      },
    }),
    prisma.primeiroAcesso.delete({ where: { id: pendente.id } }),
  ]);
  await registrarAuditoria(professor.id, "PRIMEIRO_ACESSO_CONCLUIDO", `conta de professor ${professor.id} ativada`);
  await registrarAuditoria(
    professor.id,
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

export const professoresService = { listar, criar, reenviarCodigo, concluirPrimeiroAcesso, listarEventosEmAberto, inativar, reativar };
