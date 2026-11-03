// script de emergencia: zera o 2FA de uma conta pela linha de comando. E o caminho pra conta de
// ADMINISTRADOR/SECRETARIA (a tela Participantes so tem o botao "Resetar 2FA" pra aluno) e pro caso
// de o unico administrador perder o celular E os codigos de recuperacao. Faz o mesmo que o botao:
// apaga segredo e codigos de recuperacao, encerra as sessoes da conta, limpa o bloqueio do codigo
// do 2FA e registra MFA_RESETADO na auditoria (origem: script de emergencia).
//
// como rodar (de dentro de backend/):
//   npx tsx scripts/resetar-2fa.ts email@dominio                       -> SIMULACAO no banco do .env (dev)
//   npx tsx scripts/resetar-2fa.ts email@dominio --producao            -> SIMULACAO no banco de producao
//   npx tsx scripts/resetar-2fa.ts email@dominio --producao --aplicar  -> reseta de verdade em producao
//
// --producao carrega o .env.production.local. Nao imprime dado pessoal decifrado, so id e situacao.
import { config } from "dotenv";

const producao = process.argv.includes("--producao");
const aplicar = process.argv.includes("--aplicar");
const email = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

// tem que carregar o .env certo ANTES de importar prisma/env do app, por isso os imports dinamicos
if (producao) config({ path: ".env.production.local", override: true });

async function main() {
  if (!email) {
    console.error("[resetar-2fa] uso: npx tsx scripts/resetar-2fa.ts email@dominio [--producao] [--aplicar]");
    process.exitCode = 1;
    return;
  }

  const { prisma } = await import("../src/db/prisma");
  const { normalizarEmail } = await import("../src/utils/validacao");
  const { mfaService } = await import("../src/modules/mfa/mfa.service");

  try {
    console.log(`[resetar-2fa] banco: ${producao ? "PRODUCAO (.env.production.local)" : "desenvolvimento (.env)"}`);
    console.log(aplicar ? "[resetar-2fa] MODO REAL: vai resetar" : "[resetar-2fa] SIMULACAO (dry-run): nada sera alterado");

    const usuario = await prisma.usuario.findUnique({
      where: { emailLogin: normalizarEmail(email) },
      select: { id: true, perfil: true, mfaAtivo: true },
    });
    if (!usuario) {
      console.log("[resetar-2fa] nenhuma conta com esse e-mail");
      return;
    }

    const codigos = await prisma.codigoRecuperacaoMfa.count({ where: { usuarioId: usuario.id, usadoEm: null } });
    console.log(`[resetar-2fa] conta: id=${usuario.id}, perfil=${usuario.perfil}, 2FA ativo=${usuario.mfaAtivo}, códigos de recuperação restantes=${codigos}`);

    if (!aplicar) {
      console.log("[resetar-2fa] simulacao concluida — rode de novo com --aplicar pra resetar");
      return;
    }

    await mfaService.resetar(usuario.id, null, "script de emergência pela linha de comando");
    console.log("[resetar-2fa] 2FA resetado, sessões encerradas e MFA_RESETADO registrado na auditoria");
    console.log("[resetar-2fa] no próximo login a conta entra só com a senha (o 2FA pode ser ativado de novo em Minha conta)");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error("[resetar-2fa] erro:", erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
