import { prisma } from "../../db/prisma";
import { descriptografar, indiceBusca } from "../../utils/criptografia";
import { pareceCifrado } from "../../utils/dadosPessoais";
import { registrarAuditoria } from "../../utils/auditoria";

// TEMPORARIO — sai na implantacao seguinte (dados pessoais sem duplicacao). Mesma conversao do
// scripts/converter-dados-pessoais.ts, so que rodando dentro do servidor: a ENCRYPTION_KEY de
// producao so existe na Vercel (variavel Secret, ninguem consegue ler o valor), entao o script de
// linha de comando nao tem como rodar. Converte nome, e-mail e RGM (usuarios e participantes) e o
// nome do responsavel nos logs de cifrado (AES-256-GCM) pra texto puro.
// Antes de gravar qualquer coisa confere que todo valor cifrado decifra de verdade e que o
// e-mail/RGM decifrado bate com o indice de busca ja gravado — se algo nao bater, nao grava nada.
// So devolve contagens, nunca dado pessoal. Idempotente: o que ja esta em texto puro e pulado.

const TAMANHO_LOTE = 50;

interface Contagem {
  total: number;
  jaEmTextoPuro: number;
  aConverter: number;
  falhas: number;
  indiceNaoConfere: number;
}

function contagemVazia(): Contagem {
  return { total: 0, jaEmTextoPuro: 0, aConverter: 0, falhas: 0, indiceNaoConfere: 0 };
}

// "cifrado" = parece o formato de criptografar() E decifra de verdade; parece mas nao decifra = falha
type Leitura = { tipo: "texto"; valor: string } | { tipo: "cifrado"; valor: string } | { tipo: "falha" };
function ler(valor: string): Leitura {
  if (!pareceCifrado(valor)) return { tipo: "texto", valor };
  try {
    return { tipo: "cifrado", valor: descriptografar(valor) };
  } catch {
    return { tipo: "falha" };
  }
}

export type SituacaoConversao = "NADA_A_CONVERTER" | "SIMULACAO" | "BLOQUEADA_POR_PROBLEMAS" | "CONVERTIDO";

export interface RelatorioConversao {
  situacao: SituacaoConversao;
  usuarios: Contagem;
  participantes: Contagem;
  logs: Contagem;
  // so preenchido depois de gravar: quantos registros ainda ficaram no formato antigo (tem que ser 0)
  restantesNoFormatoAntigo?: number;
}

async function converter(aplicar: boolean, atorId: string): Promise<RelatorioConversao> {
  // ---------------------------------------------------------------- usuarios
  const cUsuarios = contagemVazia();
  const atualizacoesUsuarios: { id: string; data: { nome?: string; emailLogin?: string; rgm?: string } }[] = [];
  for (const u of await prisma.usuario.findMany({ select: { id: true, nome: true, emailLogin: true, emailLoginHash: true, rgm: true } })) {
    cUsuarios.total++;
    const nome = ler(u.nome);
    const email = ler(u.emailLogin);
    const rgm = u.rgm === null ? null : ler(u.rgm);
    if (nome.tipo === "falha" || email.tipo === "falha" || rgm?.tipo === "falha") {
      cUsuarios.falhas++;
      continue;
    }
    if (indiceBusca(email.valor) !== u.emailLoginHash) cUsuarios.indiceNaoConfere++;
    const data: { nome?: string; emailLogin?: string; rgm?: string } = {};
    if (nome.tipo === "cifrado") data.nome = nome.valor;
    if (email.tipo === "cifrado") data.emailLogin = email.valor;
    if (rgm?.tipo === "cifrado") data.rgm = rgm.valor;
    if (Object.keys(data).length > 0) {
      cUsuarios.aConverter++;
      atualizacoesUsuarios.push({ id: u.id, data });
    } else {
      cUsuarios.jaEmTextoPuro++;
    }
  }

  // ---------------------------------------------------------------- participantes
  const cParticipantes = contagemVazia();
  const atualizacoesParticipantes: { id: string; data: { nome?: string; email?: string; rgm?: string } }[] = [];
  for (const p of await prisma.participante.findMany({
    select: { id: true, nome: true, email: true, emailHash: true, rgm: true, rgmHash: true },
  })) {
    cParticipantes.total++;
    const nome = ler(p.nome);
    const email = ler(p.email);
    const rgm = ler(p.rgm);
    if (nome.tipo === "falha" || email.tipo === "falha" || rgm.tipo === "falha") {
      cParticipantes.falhas++;
      continue;
    }
    if (indiceBusca(email.valor) !== p.emailHash || indiceBusca(rgm.valor) !== p.rgmHash) cParticipantes.indiceNaoConfere++;
    const data: { nome?: string; email?: string; rgm?: string } = {};
    if (nome.tipo === "cifrado") data.nome = nome.valor;
    if (email.tipo === "cifrado") data.email = email.valor;
    if (rgm.tipo === "cifrado") data.rgm = rgm.valor;
    if (Object.keys(data).length > 0) {
      cParticipantes.aConverter++;
      atualizacoesParticipantes.push({ id: p.id, data });
    } else {
      cParticipantes.jaEmTextoPuro++;
    }
  }

  // ---------------------------------------------------------------- logs (nome do responsavel)
  const cLogs = contagemVazia();
  const atualizacoesLogs: { id: string; atorNome: string | null }[] = [];
  cLogs.total = await prisma.logAuditoria.count();
  for (const log of await prisma.logAuditoria.findMany({
    where: { atorNomeCifrado: { not: null } },
    select: { id: true, atorNome: true, atorNomeCifrado: true },
  })) {
    const nome = ler(log.atorNomeCifrado!);
    if (nome.tipo === "falha") {
      cLogs.falhas++;
      continue;
    }
    cLogs.aConverter++;
    // se o log ja tiver atorNome (nao deveria), preserva e so limpa a copia antiga
    atualizacoesLogs.push({ id: log.id, atorNome: log.atorNome ?? nome.valor });
  }
  cLogs.jaEmTextoPuro = cLogs.total - cLogs.aConverter - cLogs.falhas;

  const relatorio = { usuarios: cUsuarios, participantes: cParticipantes, logs: cLogs };

  const problemas = cUsuarios.falhas + cParticipantes.falhas + cLogs.falhas + cUsuarios.indiceNaoConfere + cParticipantes.indiceNaoConfere;
  if (problemas > 0) return { situacao: "BLOQUEADA_POR_PROBLEMAS", ...relatorio };

  const totalAConverter = atualizacoesUsuarios.length + atualizacoesParticipantes.length + atualizacoesLogs.length;
  if (totalAConverter === 0) return { situacao: "NADA_A_CONVERTER", ...relatorio };
  if (!aplicar) return { situacao: "SIMULACAO", ...relatorio };

  for (let i = 0; i < atualizacoesUsuarios.length; i += TAMANHO_LOTE) {
    await prisma.$transaction(
      atualizacoesUsuarios.slice(i, i + TAMANHO_LOTE).map((a) => prisma.usuario.update({ where: { id: a.id }, data: a.data })),
    );
  }
  for (let i = 0; i < atualizacoesParticipantes.length; i += TAMANHO_LOTE) {
    await prisma.$transaction(
      atualizacoesParticipantes.slice(i, i + TAMANHO_LOTE).map((a) => prisma.participante.update({ where: { id: a.id }, data: a.data })),
    );
  }
  for (let i = 0; i < atualizacoesLogs.length; i += TAMANHO_LOTE) {
    await prisma.$transaction(
      atualizacoesLogs
        .slice(i, i + TAMANHO_LOTE)
        .map((a) => prisma.logAuditoria.update({ where: { id: a.id }, data: { atorNome: a.atorNome, atorNomeCifrado: null } })),
    );
  }

  // confere de novo: nada pode ter sobrado no formato antigo
  const restantesNoFormatoAntigo =
    (await prisma.logAuditoria.count({ where: { atorNomeCifrado: { not: null } } })) +
    (await prisma.usuario.findMany({ select: { nome: true, emailLogin: true, rgm: true } })).filter(
      (u) => pareceCifrado(u.nome) || pareceCifrado(u.emailLogin) || (u.rgm !== null && pareceCifrado(u.rgm)),
    ).length +
    (await prisma.participante.findMany({ select: { nome: true, email: true, rgm: true } })).filter(
      (p) => pareceCifrado(p.nome) || pareceCifrado(p.email) || pareceCifrado(p.rgm),
    ).length;

  await registrarAuditoria(
    atorId,
    "CONVERSAO_DADOS_PESSOAIS",
    `rota de manutenção: ${atualizacoesUsuarios.length} usuário(s), ${atualizacoesParticipantes.length} participante(s) e ` +
      `${atualizacoesLogs.length} registro(s) de auditoria convertidos de cifrado para texto puro; restantes no formato antigo: ${restantesNoFormatoAntigo}`,
  );

  return { situacao: "CONVERTIDO", ...relatorio, restantesNoFormatoAntigo };
}

export const conversaoService = { converter };
