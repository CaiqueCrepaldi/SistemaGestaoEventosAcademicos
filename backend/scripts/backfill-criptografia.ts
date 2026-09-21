// script de migracao de dado, roda uma vez so: cifra nome/email/rgm dos registros
// que ainda estao em texto puro (criados antes da criptografia existir) e preenche
// os indices de busca (emailLoginHash/emailHash/rgmHash).
//
// pre-requisito: a migration "criptografia_pii_fase1" ja aplicada (colunas
// alargadas pra TEXT, colunas de hash existindo como NULLAVEIS).
//
// como rodar (de dentro de backend/): npx tsx scripts/backfill-criptografia.ts
//
// idempotente: registro que ja tem hash preenchido eh pulado, entao rodar de novo
// nao cifra em cima de um valor ja cifrado.
//
// usa $queryRawUnsafe pra selecionar: o Prisma Client gerado reflete o schema
// FINAL (colunas de hash NOT NULL), mas nesse momento intermediario da migracao
// elas ainda sao nulaveis no banco de verdade — o client tipado nao deixaria
// filtrar por "hash is null" sem reclamar de tipo
import { prisma } from "../src/db/prisma";
import { criptografar, indiceBusca } from "../src/utils/criptografia";

interface UsuarioPendente {
  id: string;
  nome: string;
  emailLogin: string;
  rgm: string | null;
}

interface ParticipantePendente {
  id: string;
  nome: string;
  email: string;
  rgm: string;
}

async function processarUsuarios() {
  const usuarios = await prisma.$queryRawUnsafe<UsuarioPendente[]>(
    "SELECT id, nome, emailLogin, rgm FROM usuarios WHERE emailLoginHash IS NULL",
  );
  console.log(`[backfill] ${usuarios.length} usuario(s) pendente(s)`);

  for (const usuario of usuarios) {
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        nome: criptografar(usuario.nome),
        emailLogin: criptografar(usuario.emailLogin),
        emailLoginHash: indiceBusca(usuario.emailLogin),
        rgm: usuario.rgm ? criptografar(usuario.rgm) : null,
      },
    });
  }
  console.log(`[backfill] usuarios: ${usuarios.length} atualizado(s)`);
}

async function processarParticipantes() {
  const participantes = await prisma.$queryRawUnsafe<ParticipantePendente[]>(
    "SELECT id, nome, email, rgm FROM participantes WHERE emailHash IS NULL",
  );
  console.log(`[backfill] ${participantes.length} participante(s) pendente(s)`);

  for (const participante of participantes) {
    await prisma.participante.update({
      where: { id: participante.id },
      data: {
        nome: criptografar(participante.nome),
        email: criptografar(participante.email),
        emailHash: indiceBusca(participante.email),
        rgm: criptografar(participante.rgm),
        rgmHash: indiceBusca(participante.rgm),
      },
    });
  }
  console.log(`[backfill] participantes: ${participantes.length} atualizado(s)`);
}

async function main() {
  await processarUsuarios();
  await processarParticipantes();
  console.log("[backfill] concluido");
}

main()
  .catch((erro) => {
    console.error("[backfill] falhou:", erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
