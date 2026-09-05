import { criarApp } from "./app";
import { env } from "./config/env";

const app = criarApp();

const server = app.listen(env.port, () => {
  console.log(`[sgea-backend] rodando em http://localhost:${env.port} (ambiente: ${env.nodeEnv})`);
  console.log("[sgea-backend] dados guardados em memória — reiniciar o processo volta ao estado inicial (ver src/db/).");
});

function desligar() {
  console.log("[sgea-backend] encerrando...");
  server.close(() => process.exit(0));
}

process.on("SIGINT", desligar);
process.on("SIGTERM", desligar);
