// prepara e limpa os dados do teste de interface (frontend/testes-interface) no banco de
// DESENVOLVIMENTO — se recusa a rodar se o DATABASE_URL nao for o SGEA_dev.
//
// como rodar (de dentro de backend/):
//   npx tsx scripts/dados-teste-interface.ts preparar   -> cria administrador e secretaria de teste
//   npx tsx scripts/dados-teste-interface.ts limpar     -> apaga tudo que o teste criou (logs ficam)
//
// as credenciais de teste vao pra frontend/testes-interface/dados-ui.json (fora do git)
import "dotenv/config";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

if (!process.env.DATABASE_URL?.includes("SGEA_dev")) {
  console.error("[dados-teste-interface] recusado: DATABASE_URL não aponta pro SGEA_dev");
  process.exit(1);
}

const ARQUIVO = join(__dirname, "..", "..", "frontend", "testes-interface", "dados-ui.json");

async function main() {
  const { prisma } = await import("../src/db/prisma");
  const { indiceBusca } = await import("../src/utils/criptografia");
  const { gerarHashSenha } = await import("../src/utils/password");
  const acao = process.argv[2];

  try {
    if (acao === "preparar") {
      const sufixo = randomUUID().slice(0, 6);
      const senha = "SenhaUi12345";
      const contas: Record<string, { id: string; email: string; senha: string }> = {};
      for (const perfil of ["ADMINISTRADOR", "SECRETARIA"] as const) {
        const email = `ui-${perfil.toLowerCase()}-${sufixo}@teste.invalido`;
        const usuario = await prisma.usuario.create({
          data: {
            id: randomUUID(),
            nome: `Equipe UI ${perfil === "ADMINISTRADOR" ? "Admin" : "Secretaria"}`,
            emailLogin: email,
            emailLoginHash: indiceBusca(email),
            senhaHash: await gerarHashSenha(senha),
            perfil,
          },
        });
        contas[perfil] = { id: usuario.id, email, senha };
      }
      // o teste de interface sai do 127.0.0.1: zera o contador de tentativas desse IP
      await prisma.limiteAcesso.deleteMany({ where: { chave: { contains: "127.0.0.1" } } });
      writeFileSync(ARQUIVO, JSON.stringify({ sufixo, contas }, null, 2));
      console.log(`[dados-teste-interface] preparado (sufixo ${sufixo})`);
      return;
    }

    if (acao === "limpar") {
      const { sufixo } = JSON.parse(readFileSync(ARQUIVO, "utf8")) as { sufixo: string };
      const eventos = await prisma.evento.findMany({ where: { titulo: { contains: sufixo } }, select: { id: true } });
      await prisma.evento.deleteMany({ where: { id: { in: eventos.map((e) => e.id) } } });
      const usuarios = (await prisma.usuario.findMany({ select: { id: true, emailLogin: true, participanteId: true } })).filter((u) =>
        u.emailLogin.includes(sufixo),
      );
      for (const u of usuarios) {
        if (u.participanteId) {
          await prisma.tentativaQuestionario.deleteMany({ where: { participanteId: u.participanteId } });
          await prisma.feedback.deleteMany({ where: { participanteId: u.participanteId } });
          await prisma.inscricao.deleteMany({ where: { participanteId: u.participanteId } });
        }
        await prisma.usuario.delete({ where: { id: u.id } });
        if (u.participanteId) await prisma.participante.deleteMany({ where: { id: u.participanteId } });
      }
      await prisma.sala.deleteMany({ where: { nome: { contains: sufixo } } });
      await prisma.palestrante.deleteMany({ where: { email: { contains: sufixo } } });
      await prisma.limiteAcesso.deleteMany({ where: { chave: { contains: "127.0.0.1" } } });
      console.log(`[dados-teste-interface] limpo: ${usuarios.length} conta(s), ${eventos.length} evento(s)`);
      return;
    }

    console.error("[dados-teste-interface] uso: npx tsx scripts/dados-teste-interface.ts preparar|limpar");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error("[dados-teste-interface] erro:", erro);
  process.exitCode = 1;
});
