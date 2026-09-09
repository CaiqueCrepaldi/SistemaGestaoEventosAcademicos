import { criarApp } from "./app";
import { env } from "./config/env";

const app = criarApp();

// sobe o servidor http na porta configurada
const server = app.listen(env.port, () => {
  console.log(`[sgea-backend] rodando em http://localhost:${env.port} (ambiente: ${env.nodeEnv})`);
  console.log("[sgea-backend] dados guardados em memória — reiniciar o processo volta ao estado inicial (ver src/db/).");
});

// fecha o servidor de forma graciosa ao receber sinal de termino
function desligar() {
  console.log("[sgea-backend] encerrando...");
  server.close(() => process.exit(0));
}

process.on("SIGINT", desligar);
process.on("SIGTERM", desligar);
