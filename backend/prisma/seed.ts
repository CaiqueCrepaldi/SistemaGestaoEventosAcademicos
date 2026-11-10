// cria as tres contas de demonstracao (administrador, secretaria e professor) que ainda nao existirem.
// Roda com "npm run db:seed". A conta que ja existe nao muda (nem a senha). Salas, palestrantes, eventos, alunos
// e o resto da carga de demonstracao ficam em scripts/carga-demonstracao.ts, que apaga tudo e recria
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { CONTAS_DE_DEMONSTRACAO, garantirContasDeDemonstracao, lerSenhasDeDemonstracao, SenhaDeDemonstracaoInvalida } from "./contas-demonstracao";

async function main() {
  // senhas conferidas ANTES de gravar qualquer coisa: se faltar alguma, o seed nao toca no banco
  const senhas = lerSenhasDeDemonstracao();
  await garantirContasDeDemonstracao(prisma, senhas);
  console.log(`[seed] contas de demonstração conferidas: ${CONTAS_DE_DEMONSTRACAO.map((c) => c.email).join(", ")}`);
}

main()
  .catch((erro) => {
    // nunca imprime o valor de uma senha: so qual variavel esta com problema
    console.error(erro instanceof SenhaDeDemonstracaoInvalida ? `[seed] ${erro.message}` : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
