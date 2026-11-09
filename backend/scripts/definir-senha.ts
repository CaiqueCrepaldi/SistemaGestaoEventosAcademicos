// define uma senha nova para uma conta que ja existe, pela linha de comando — por exemplo as contas de
// equipe criadas pelo seed num banco antigo (o seed nunca muda a senha de conta que ja existe) ou uma
// conta cujo e-mail nao recebe o codigo do "Esqueci a senha". Faz o mesmo que a troca pela recuperacao:
// grava o hash com o gerarHashSenha do sistema, encerra as sessoes abertas (versaoToken + 1), limpa o
// bloqueio de tentativas de login da conta e registra SENHA_REDEFINIDA na auditoria, sem a senha.
//
// como rodar (de dentro de backend/, num terminal interativo):
//   npx tsx scripts/definir-senha.ts email@dominio                       -> SIMULACAO no banco do .env (dev)
//   npx tsx scripts/definir-senha.ts email@dominio --aplicar             -> pede a senha e grava no banco do .env
//   npx tsx scripts/definir-senha.ts email@dominio --producao            -> SIMULACAO no banco de producao
//   npx tsx scripts/definir-senha.ts email@dominio --producao --aplicar  -> pede a senha e grava em producao
//
// --producao carrega o .env.production.local (e para se ele nao existir). A senha e digitada duas vezes,
// sem aparecer na tela, precisa seguir a regra de senha do sistema e nunca e impressa.
import { config } from "dotenv";
import { existsSync } from "fs";

const producao = process.argv.includes("--producao");
const aplicar = process.argv.includes("--aplicar");
const email = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

// tem que carregar o .env certo ANTES de importar prisma/env do app, por isso os imports dinamicos
if (producao) {
  if (!existsSync(".env.production.local")) {
    console.error("[definir-senha] --producao: o arquivo .env.production.local não existe nesta pasta. Nada foi feito.");
    process.exit(1);
  }
  config({ path: ".env.production.local", override: true });
}

// le uma linha do terminal sem mostrar o que e digitado (nem asteriscos). Backspace apaga; Ctrl+C cancela
function perguntarSemMostrar(pergunta: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const entrada = process.stdin;
    if (!entrada.isTTY) {
      reject(new Error("rode o script num terminal interativo: a senha é digitada sem aparecer na tela"));
      return;
    }
    process.stdout.write(pergunta);
    let valor = "";
    const encerrar = () => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.removeListener("data", aoDigitar);
      process.stdout.write("\n");
    };
    function aoDigitar(tecla: string) {
      for (const caractere of tecla) {
        if (caractere === "\r" || caractere === "\n") {
          encerrar();
          resolve(valor);
          return;
        }
        if (caractere === "\u0003") {
          encerrar();
          reject(new Error("cancelado"));
          return;
        }
        if (caractere === "\u007f" || caractere === "\b") {
          valor = Array.from(valor).slice(0, -1).join("");
          continue;
        }
        valor += caractere;
      }
    }
    entrada.setRawMode(true);
    entrada.setEncoding("utf8");
    entrada.resume();
    entrada.on("data", aoDigitar);
  });
}

// nome do banco da DATABASE_URL (sem usuario, senha nem host), so pra mostrar onde o script vai gravar
function nomeDoBanco(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, "") || "(sem nome)";
  } catch {
    return "(DATABASE_URL inválida)";
  }
}

async function main() {
  if (!email) {
    console.error("[definir-senha] uso: npx tsx scripts/definir-senha.ts email@dominio [--producao] [--aplicar]");
    process.exitCode = 1;
    return;
  }

  const { prisma } = await import("../src/db/prisma");
  const { normalizarEmail, senhaAtendeRegras, MENSAGEM_REGRA_SENHA } = await import("../src/utils/validacao");
  const { gerarHashSenha } = await import("../src/utils/password");
  const { chaveConta, idDoEmail, limparTentativas } = await import("../src/utils/limiteAcesso");
  const { registrarAuditoria } = await import("../src/utils/auditoria");

  try {
    console.log(`[definir-senha] banco: ${nomeDoBanco()} (${producao ? "PRODUCAO, .env.production.local" : "desenvolvimento, .env"})`);
    console.log(aplicar ? "[definir-senha] MODO REAL: vai gravar a senha nova" : "[definir-senha] SIMULACAO (dry-run): nada será alterado");

    const emailLogin = normalizarEmail(email);
    const usuario = await prisma.usuario.findUnique({ where: { emailLogin }, select: { id: true, perfil: true, mfaAtivo: true } });
    if (!usuario) {
      console.log("[definir-senha] nenhuma conta com esse e-mail");
      process.exitCode = 1;
      return;
    }
    const chaveDoLogin = chaveConta("login", idDoEmail(emailLogin));
    const bloqueio = await prisma.limiteAcesso.findUnique({ where: { chave: chaveDoLogin }, select: { bloqueadoAte: true } });
    const bloqueada = !!bloqueio?.bloqueadoAte && bloqueio.bloqueadoAte > new Date();
    console.log(`[definir-senha] conta: id=${usuario.id}, perfil=${usuario.perfil}, 2FA ativo=${usuario.mfaAtivo}, login bloqueado agora=${bloqueada}`);

    if (!aplicar) {
      console.log("[definir-senha] simulação concluída — rode de novo com --aplicar para digitar a senha nova e gravar");
      console.log("[definir-senha] ao aplicar: as sessões abertas da conta caem e o bloqueio de login é limpo (o 2FA não muda)");
      return;
    }

    const senha = await perguntarSemMostrar("Nova senha (não aparece enquanto digita): ");
    if (!senhaAtendeRegras(senha)) {
      console.error(`[definir-senha] ${MENSAGEM_REGRA_SENHA} Nada foi alterado.`);
      process.exitCode = 1;
      return;
    }
    const confirmacao = await perguntarSemMostrar("Repita a nova senha: ");
    if (confirmacao !== senha) {
      console.error("[definir-senha] as senhas não coincidem. Nada foi alterado.");
      process.exitCode = 1;
      return;
    }

    // versaoToken + 1 invalida qualquer sessao ja aberta com a senha antiga (mesma regra da recuperacao)
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash: await gerarHashSenha(senha), versaoToken: { increment: 1 } },
    });
    await limparTentativas(chaveDoLogin);
    await registrarAuditoria(
      null,
      "SENHA_REDEFINIDA",
      `senha da conta ${usuario.id} redefinida pelo script de linha de comando; sessões encerradas e bloqueio de login limpo`,
    );
    console.log("[definir-senha] senha gravada, sessões encerradas, bloqueio de login limpo e SENHA_REDEFINIDA registrado na auditoria");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error("[definir-senha] erro:", erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
