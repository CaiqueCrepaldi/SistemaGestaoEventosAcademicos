import { criarApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./db/prisma";

const app = criarApp();

// sobe o servidor http na porta configurada
const server = app.listen(env.port, () => {
  console.log(`[sgea-backend] rodando em http://localhost:${env.port} (ambiente: ${env.nodeEnv})`);
  console.log("[sgea-backend] conectado ao banco via Prisma (ver backend/prisma/schema.prisma).");
});

// fecha o servidor e a conexao com o banco de forma graciosa ao receber sinal de termino
function desligar() {
  console.log("[sgea-backend] encerrando...");
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on("SIGINT", desligar);
process.on("SIGTERM", desligar);
