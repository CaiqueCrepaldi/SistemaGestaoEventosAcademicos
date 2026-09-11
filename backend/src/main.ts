import { criarApp } from "./expressApp";
import { env } from "./config/env";
import { prisma } from "./db/prisma";

// so export default (a vercel reclama se misturar export nomeado com default no entrypoint)
const app = criarApp();

// so sobe servidor http de verdade quando esse arquivo eh o ponto de entrada
// (ambiente serverless so importa "app" e invoca direto, sem passar por aqui)
if (require.main === module) {
  const server = app.listen(env.port, () => {
    console.log(`[sgea-backend] rodando em http://localhost:${env.port} (ambiente: ${env.nodeEnv})`);
    console.log("[sgea-backend] conectado ao banco via Prisma (ver backend/prisma/schema.prisma).");
  });

  // fecha o servidor e a conexao com o banco de forma graciosa ao receber sinal de termino
  const desligar = () => {
    console.log("[sgea-backend] encerrando...");
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", desligar);
  process.on("SIGTERM", desligar);
}

export default app;
