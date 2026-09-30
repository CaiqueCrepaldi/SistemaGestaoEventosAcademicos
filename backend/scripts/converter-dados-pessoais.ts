// conversao unica: nome, e-mail e RGM (usuarios e participantes) e o nome do responsavel nos logs
// de auditoria saem do formato cifrado (AES-256-GCM) e passam a ficar em texto puro — sao dados
// pessoais comuns (art. 5º, I da LGPD), nao sensiveis. O segredo do 2FA, as senhas e os codigos
// continuam protegidos (cifrado/hash) e nao passam por aqui. A ENCRYPTION_KEY continua existindo.
//
// como rodar (de dentro de backend/):
//   npx tsx scripts/converter-dados-pessoais.ts                                            -> SIMULACAO no dev
//   npx tsx scripts/converter-dados-pessoais.ts --aplicar                                  -> converte no dev
//   npx tsx scripts/converter-dados-pessoais.ts --producao                                 -> SIMULACAO em producao
//   npx tsx scripts/converter-dados-pessoais.ts --producao --aplicar --confirmo-exportacao -> converte em producao
//
// --producao carrega o .env.production.local. Em producao so aplica com --confirmo-exportacao
// (confirmacao de que as tabelas usuarios, participantes e logs_auditoria foram exportadas antes).
// Idempotente: registro que ja esta em texto puro e pulado. So imprime contagens, nunca dado pessoal.
// Antes de gravar qualquer coisa confere que todo valor cifrado decifra de verdade e que o e-mail/RGM
// decifrado bate com o indice de busca ja gravado — se algo nao bater, nao grava nada.
import { config } from "dotenv";

const producao = process.argv.includes("--producao");
const aplicar = process.argv.includes("--aplicar");
const confirmouExportacao = process.argv.includes("--confirmo-exportacao");

// tem que carregar o .env certo ANTES de importar prisma/env do app, por isso os imports dinamicos
if (producao) config({ path: ".env.production.local", override: true });

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

async function main() {
  if (producao && aplicar && !confirmouExportacao) {
    console.error(
      "[converter-dados-pessoais] em produção só aplica com --confirmo-exportacao: exporte antes as tabelas " +
        "usuarios, participantes e logs_auditoria pelo TiDB Cloud (o backup automático só guarda 1 dia).",
    );
    process.exitCode = 1;
    return;
  }

  const { prisma } = await import("../src/db/prisma");
  const { descriptografar, indiceBusca } = await import("../src/utils/criptografia");
  const { pareceCifrado } = await import("../src/utils/dadosPessoais");
  const { registrarAuditoria } = await import("../src/utils/auditoria");

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

  try {
    console.log(`[converter-dados-pessoais] banco: ${producao ? "PRODUCAO (.env.production.local)" : "desenvolvimento (.env)"}`);
    console.log(aplicar ? "[converter-dados-pessoais] MODO REAL: vai gravar" : "[converter-dados-pessoais] SIMULACAO (dry-run): nada sera gravado");

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
    let cursor: string | undefined;
    for (;;) {
      const lote = await prisma.logAuditoria.findMany({
        where: { atorNomeCifrado: { not: null } },
        select: { id: true, atorNome: true, atorNomeCifrado: true },
        orderBy: { id: "asc" },
        take: 500,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (lote.length === 0) break;
      cursor = lote[lote.length - 1].id;
      for (const log of lote) {
        const nome = ler(log.atorNomeCifrado!);
        if (nome.tipo === "falha") {
          cLogs.falhas++;
          continue;
        }
        cLogs.aConverter++;
        // se o log ja tiver atorNome (nao deveria), preserva e so limpa a copia antiga
        atualizacoesLogs.push({ id: log.id, atorNome: log.atorNome ?? nome.valor });
      }
    }
    cLogs.jaEmTextoPuro = cLogs.total - cLogs.aConverter - cLogs.falhas;

    console.log(
      `[converter-dados-pessoais] usuarios: ${cUsuarios.total} no total | ${cUsuarios.jaEmTextoPuro} já em texto puro | ` +
        `${cUsuarios.aConverter} a converter | ${cUsuarios.falhas} que não decifram | ${cUsuarios.indiceNaoConfere} com índice de busca divergente`,
    );
    console.log(
      `[converter-dados-pessoais] participantes: ${cParticipantes.total} no total | ${cParticipantes.jaEmTextoPuro} já em texto puro | ` +
        `${cParticipantes.aConverter} a converter | ${cParticipantes.falhas} que não decifram | ${cParticipantes.indiceNaoConfere} com índice de busca divergente`,
    );
    console.log(
      `[converter-dados-pessoais] logs de auditoria: ${cLogs.total} no total | ${cLogs.jaEmTextoPuro} sem nome cifrado | ` +
        `${cLogs.aConverter} com o nome do responsável a converter | ${cLogs.falhas} que não decifram`,
    );

    const problemas = cUsuarios.falhas + cParticipantes.falhas + cLogs.falhas + cUsuarios.indiceNaoConfere + cParticipantes.indiceNaoConfere;
    if (problemas > 0) {
      console.error(
        "[converter-dados-pessoais] há valores que não decifram com a ENCRYPTION_KEY atual ou cujo índice não confere — " +
          "nada foi gravado. Confira se o .env usado tem a mesma ENCRYPTION_KEY que gravou os dados.",
      );
      process.exitCode = 1;
      return;
    }

    const totalAConverter = atualizacoesUsuarios.length + atualizacoesParticipantes.length + atualizacoesLogs.length;
    if (totalAConverter === 0) {
      console.log("[converter-dados-pessoais] nada a converter — tudo já está em texto puro");
      return;
    }
    if (!aplicar) {
      console.log("[converter-dados-pessoais] simulação concluída — rode com --aplicar pra gravar");
      return;
    }

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
    const restantes =
      (await prisma.logAuditoria.count({ where: { atorNomeCifrado: { not: null } } })) +
      (await prisma.usuario.findMany({ select: { nome: true, emailLogin: true, rgm: true } })).filter(
        (u) => pareceCifrado(u.nome) || pareceCifrado(u.emailLogin) || (u.rgm !== null && pareceCifrado(u.rgm)),
      ).length +
      (await prisma.participante.findMany({ select: { nome: true, email: true, rgm: true } })).filter(
        (p) => pareceCifrado(p.nome) || pareceCifrado(p.email) || pareceCifrado(p.rgm),
      ).length;

    await registrarAuditoria(
      null,
      "CONVERSAO_DADOS_PESSOAIS",
      `script converter-dados-pessoais: ${atualizacoesUsuarios.length} usuário(s), ${atualizacoesParticipantes.length} participante(s) e ` +
        `${atualizacoesLogs.length} registro(s) de auditoria convertidos de cifrado para texto puro`,
    );
    console.log(
      `[converter-dados-pessoais] concluído: ${atualizacoesUsuarios.length} usuário(s), ${atualizacoesParticipantes.length} participante(s), ` +
        `${atualizacoesLogs.length} log(s) convertidos | registros ainda no formato antigo: ${restantes}`,
    );
    if (restantes > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error("[converter-dados-pessoais] erro:", erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
