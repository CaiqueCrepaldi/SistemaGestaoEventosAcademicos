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

// chaves de limite de tentativas do IP local (IPv4 e IPv6)
const IP_LOCAL = { OR: [{ chave: { contains: "127.0.0.1" } }, { chave: { endsWith: ":ip:::1" } }] };

const ARQUIVO = join(__dirname, "..", "..", "frontend", "testes-interface", "dados-ui.json");

async function main() {
  const { prisma } = await import("../src/db/prisma");
  const { gerarHashSenha } = await import("../src/utils/password");
  const { indiceBusca } = await import("../src/utils/criptografia");
  const acao = process.argv[2];

  try {
    if (acao === "preparar") {
      const sufixo = randomUUID().slice(0, 6);
      const senha = "Senha@Ui12345";
      const contas: Record<string, { id: string; email: string; senha: string }> = {};
      for (const perfil of ["ADMINISTRADOR", "SECRETARIA"] as const) {
        const email = `ui-${perfil.toLowerCase()}-${sufixo}@teste.invalido`;
        const usuario = await prisma.usuario.create({
          data: {
            id: randomUUID(),
            nome: `Equipe UI ${perfil === "ADMINISTRADOR" ? "Admin" : "Secretaria"}`,
            emailLogin: email,
            senhaHash: await gerarHashSenha(senha),
            perfil,
          },
        });
        contas[perfil] = { id: usuario.id, email, senha };
      }
      // o teste de interface sai da propria maquina: zera o contador de tentativas desse IP (127.0.0.1, ou ::1
      // quando o navegador chama "localhost" por IPv6)
      await prisma.limiteAcesso.deleteMany({ where: IP_LOCAL });
      writeFileSync(ARQUIVO, JSON.stringify({ sufixo, contas }, null, 2));
      console.log(`[dados-teste-interface] preparado (sufixo ${sufixo})`);
      return;
    }

    if (acao === "limpar") {
      const { sufixo } = JSON.parse(readFileSync(ARQUIVO, "utf8")) as { sufixo: string };
      const eventos = await prisma.evento.findMany({ where: { titulo: { contains: sufixo } }, select: { id: true } });
      const usuarios = (await prisma.usuario.findMany({ select: { id: true, emailLogin: true, participanteId: true } })).filter((u) =>
        u.emailLogin.includes(sufixo),
      );
      // certificado emitido pela tela segura a inscricao (onDelete: Restrict): sai antes de tudo
      const participantes = usuarios.map((u) => u.participanteId).filter((id): id is string => !!id);
      await prisma.certificado.deleteMany({
        where: { inscricao: { OR: [{ eventoId: { in: eventos.map((e) => e.id) } }, { participanteId: { in: participantes } }] } },
      });
      // historico da aprovacao dos eventos e palestrantes do teste (nao tem chave estrangeira pro item). A
      // proposta de alteracao sai junto com o evento/palestrante (cascata)
      const palestrantesDoTeste = await prisma.palestrante.findMany({ where: { email: { contains: sufixo } }, select: { id: true } });
      await prisma.historicoAprovacao.deleteMany({
        where: { itemId: { in: [...eventos.map((e) => e.id), ...palestrantesDoTeste.map((p) => p.id)] } },
      });
      await prisma.evento.deleteMany({ where: { id: { in: eventos.map((e) => e.id) } } });
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
      // cadastros que ficaram sem confirmar e o contador de envios do codigo dos e-mails do teste
      await prisma.cadastroPendente.deleteMany({ where: { emailLogin: { contains: sufixo } } });
      await prisma.limiteAcesso.deleteMany({
        where: {
          chave: {
            in: [
              ...usuarios.map((u) => `cadastro:conta:${indiceBusca(u.emailLogin)}`),
              // contador de envios do codigo do professor criado pelo teste
              ...usuarios.map((u) => `primeiro-acesso:conta:${u.id}`),
            ],
          },
        },
      });
      await prisma.limiteAcesso.deleteMany({ where: IP_LOCAL });
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
