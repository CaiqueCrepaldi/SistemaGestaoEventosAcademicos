// script de migracao de dado: cria retroativamente na trilha de auditoria (logs_auditoria)
// o registro das contas que ja existiam antes da trilha ser ampliada.
//
//   USUARIO_REGISTRADO        -> pra todo usuario que ainda nao tem esse log, com criadoEm = usuarios.criadoEm
//   CONSENTIMENTO_LGPD_ACEITO -> SO pra usuario com usuarios.consentimentoLgpdEm preenchido e sem esse log,
//                                com criadoEm = consentimentoLgpdEm. Nunca inventa consentimento pra conta
//                                antiga que nao tem a data gravada.
//
// os dois sao verificados de forma independente: conta cadastrada depois do LGPD ja tem USUARIO_REGISTRADO
// mas pode nao ter o log de consentimento, e esse caso tambem eh coberto.
//
// como rodar (de dentro de backend/):
//   npx tsx scripts/backfill-auditoria.ts            -> SIMULACAO (dry-run, padrao): so mostra quantos logs seriam criados
//   npx tsx scripts/backfill-auditoria.ts --aplicar  -> grava de verdade
//
// idempotente: so cria o que ainda nao existe, entao rodar duas vezes nao duplica nada.
// nao seleciona nome/e-mail/rgm de ninguem — so id, perfil e datas.
import { randomUUID } from "crypto";
import { prisma } from "../src/db/prisma";

const TAMANHO_LOTE = 100;

interface LogParaCriar {
  id: string;
  usuarioId: string;
  acao: "USUARIO_REGISTRADO" | "CONSENTIMENTO_LGPD_ACEITO";
  detalhe: string;
  criadoEm: Date;
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  console.log(aplicar ? "[backfill-auditoria] MODO REAL: vai gravar no banco" : "[backfill-auditoria] SIMULACAO (dry-run): nada sera gravado");

  const usuarios = await prisma.usuario.findMany({
    select: { id: true, perfil: true, criadoEm: true, consentimentoLgpdEm: true },
    orderBy: { criadoEm: "asc" },
  });

  const existentes = await prisma.logAuditoria.findMany({
    where: { acao: { in: ["USUARIO_REGISTRADO", "CONSENTIMENTO_LGPD_ACEITO"] }, usuarioId: { not: null } },
    select: { usuarioId: true, acao: true },
  });
  const jaTemRegistro = new Set(existentes.filter((l) => l.acao === "USUARIO_REGISTRADO").map((l) => l.usuarioId));
  const jaTemConsentimento = new Set(existentes.filter((l) => l.acao === "CONSENTIMENTO_LGPD_ACEITO").map((l) => l.usuarioId));

  const paraCriar: LogParaCriar[] = [];
  let semConsentimentoGravado = 0;

  for (const usuario of usuarios) {
    if (!jaTemRegistro.has(usuario.id)) {
      paraCriar.push({
        id: randomUUID(),
        usuarioId: usuario.id,
        acao: "USUARIO_REGISTRADO",
        detalhe: `registro retroativo: conta existente antes desta trilha (perfil ${usuario.perfil})`,
        criadoEm: usuario.criadoEm,
      });
    }

    if (usuario.consentimentoLgpdEm) {
      if (!jaTemConsentimento.has(usuario.id)) {
        paraCriar.push({
          id: randomUUID(),
          usuarioId: usuario.id,
          acao: "CONSENTIMENTO_LGPD_ACEITO",
          detalhe:
            `termos de uso e política de privacidade aceitos em ${usuario.consentimentoLgpdEm.toISOString()} ` +
            "(registro retroativo a partir de usuarios.consentimentoLgpdEm)",
          criadoEm: usuario.consentimentoLgpdEm,
        });
      }
    } else {
      semConsentimentoGravado++;
    }
  }

  const registrados = paraCriar.filter((l) => l.acao === "USUARIO_REGISTRADO");
  const consentimentos = paraCriar.filter((l) => l.acao === "CONSENTIMENTO_LGPD_ACEITO");

  console.log(`[backfill-auditoria] usuarios no banco: ${usuarios.length}`);
  console.log(`[backfill-auditoria] ja tinham USUARIO_REGISTRADO: ${jaTemRegistro.size} | ja tinham CONSENTIMENTO_LGPD_ACEITO: ${jaTemConsentimento.size}`);
  console.log(`[backfill-auditoria] logs USUARIO_REGISTRADO a criar: ${registrados.length}`);
  console.log(`[backfill-auditoria] logs CONSENTIMENTO_LGPD_ACEITO a criar: ${consentimentos.length}`);
  console.log(`[backfill-auditoria] usuarios SEM data de consentimento gravada (nenhum log de consentimento sera criado pra eles): ${semConsentimentoGravado}`);

  if (paraCriar.length === 0) {
    console.log("[backfill-auditoria] nada a fazer");
    return;
  }

  if (!aplicar) {
    console.log("[backfill-auditoria] simulacao concluida — rode com --aplicar pra gravar");
    return;
  }

  for (let i = 0; i < paraCriar.length; i += TAMANHO_LOTE) {
    await prisma.logAuditoria.createMany({ data: paraCriar.slice(i, i + TAMANHO_LOTE) });
  }
  console.log(`[backfill-auditoria] concluido: ${paraCriar.length} log(s) criado(s)`);
}

main()
  .catch((erro) => {
    console.error("[backfill-auditoria] erro:", erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
