// demonstracao (evidencia pra docs/lgpd/07 e 10) de como a senha e guardada: bcrypt com salt
// aleatorio por senha, embutido no proprio hash. So roda no banco de DESENVOLVIMENTO: cria duas
// contas temporarias com a MESMA senha, le os hashes gravados no banco e apaga as contas no final.
//
// como rodar (de dentro de backend/):  npx tsx scripts/demonstrar-hash-senha.ts
import "dotenv/config";
import { randomUUID } from "crypto";

if (!process.env.DATABASE_URL?.includes("SGEA_dev")) {
  console.error("[demonstrar-hash-senha] recusado: DATABASE_URL não aponta pro SGEA_dev");
  process.exit(1);
}

const SENHA_DE_EXEMPLO = "SenhaDeExemplo123";

// $2a$12$ + 22 caracteres de salt + 31 caracteres de hash = 60 caracteres
function decompor(hash: string) {
  const [, versao, custo, resto] = hash.split("$");
  return { versao: `$${versao}$`, custo: Number(custo), salt: resto.slice(0, 22), hash: resto.slice(22) };
}

async function main() {
  const { prisma } = await import("../src/db/prisma");
  const { indiceBusca } = await import("../src/utils/criptografia");
  const { conferirSenha, gerarHashSenha, CUSTO_HASH } = await import("../src/utils/password");

  const ids: string[] = [];
  try {
    for (const n of [1, 2]) {
      const email = `exemplo.hash.${n}.${randomUUID().slice(0, 8)}@teste.invalido`;
      const usuario = await prisma.usuario.create({
        data: {
          id: randomUUID(),
          nome: `Exemplo Hash ${n}`,
          emailLogin: email,
          emailLoginHash: indiceBusca(email),
          senhaHash: await gerarHashSenha(SENHA_DE_EXEMPLO),
          perfil: "SECRETARIA",
        },
      });
      ids.push(usuario.id);
    }

    const [a, b] = await Promise.all(ids.map((id) => prisma.usuario.findUniqueOrThrow({ where: { id }, select: { senhaHash: true } })));
    const partesA = decompor(a.senhaHash);
    const partesB = decompor(b.senhaHash);

    console.log(`senha usada nas duas contas: "${SENHA_DE_EXEMPLO}" (só de exemplo, contas temporárias do banco de dev)\n`);
    console.log(`hash gravado na conta 1: ${a.senhaHash}`);
    console.log(`hash gravado na conta 2: ${b.senhaHash}\n`);
    console.log(`partes do hash da conta 1 (${a.senhaHash.length} caracteres):`);
    console.log(`  versão do algoritmo : ${partesA.versao}  (bcrypt; a biblioteca bcryptjs grava $2a$)`);
    console.log(`  custo               : ${partesA.custo}  (2^${partesA.custo} = ${2 ** partesA.custo} rodadas; constante CUSTO_HASH = ${CUSTO_HASH})`);
    console.log(`  salt                : ${partesA.salt}  (${partesA.salt.length} caracteres = 128 bits aleatórios)`);
    console.log(`  hash                : ${partesA.hash}  (${partesA.hash.length} caracteres = 184 bits)\n`);
    console.log(`mesma senha, hashes diferentes? ${a.senhaHash !== b.senhaHash ? "sim" : "NÃO"}`);
    console.log(`salts diferentes?               ${partesA.salt !== partesB.salt ? "sim" : "NÃO"}`);
    console.log(`a senha confere com os dois?     ${(await conferirSenha(SENHA_DE_EXEMPLO, a.senhaHash)) && (await conferirSenha(SENHA_DE_EXEMPLO, b.senhaHash)) ? "sim" : "NÃO"}`);
    console.log(`senha errada confere?            ${(await conferirSenha("SenhaErrada123", a.senhaHash)) ? "SIM (erro)" : "não"}`);

    const inicio = Date.now();
    await gerarHashSenha(SENHA_DE_EXEMPLO);
    console.log(`\ntempo pra gerar um hash com custo ${CUSTO_HASH} nesta máquina: ${Date.now() - inicio} ms`);
  } finally {
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error("[demonstrar-hash-senha] erro:", erro);
  process.exitCode = 1;
});
