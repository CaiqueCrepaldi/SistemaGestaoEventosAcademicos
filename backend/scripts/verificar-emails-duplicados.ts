// confere, SEM ALTERAR NADA, se ha e-mail repetido entre as contas (usuarios.emailLogin, de qualquer perfil) e os
// cadastros de aluno em andamento (cadastros_pendentes ainda no prazo), sem diferenca de maiusculas nem de espacos
// (a comparacao passa pelo mesmo normalizarEmail do sistema). Conta tambem os e-mails gravados fora do padrao (com
// maiuscula ou espaco) e os e-mails repetidos entre palestrantes (que so precisam ser unicos entre si).
//
// Nunca imprime o e-mail: de cada repeticao mostra so quantos registros sao, os perfis envolvidos e o dominio. Nao
// corrige nada; o que aparecer aqui e resolvido caso a caso, pela tela ou por quem cuida do banco.
//
// como rodar (de dentro de backend/):
//   npx tsx scripts/verificar-emails-duplicados.ts              -> banco do .env (desenvolvimento)
//   npx tsx scripts/verificar-emails-duplicados.ts --producao   -> banco de producao (.env.production.local)
import { config } from "dotenv";

const producao = process.argv.includes("--producao");

// tem que carregar o .env certo ANTES de importar prisma/env do app, por isso os imports dinamicos
if (producao) config({ path: ".env.production.local", override: true });

const NOME_DO_PERFIL: Record<string, string> = {
  ADMINISTRADOR: "Administrador",
  SECRETARIA: "Secretaria",
  PROFESSOR: "Professor",
  ALUNO: "Aluno",
};

function dominio(email: string): string {
  const arroba = email.lastIndexOf("@");
  return arroba >= 0 ? email.slice(arroba) : "(sem @)";
}

// agrupa pelo e-mail normalizado e devolve so os grupos com mais de um registro
function repetidos<T>(itens: T[], chave: (item: T) => string): T[][] {
  const grupos = new Map<string, T[]>();
  for (const item of itens) grupos.set(chave(item), [...(grupos.get(chave(item)) ?? []), item]);
  return [...grupos.values()].filter((grupo) => grupo.length > 1);
}

async function main() {
  const { prisma } = await import("../src/db/prisma");
  const { normalizarEmail } = await import("../src/utils/validacao");

  try {
    console.log(`[verificar-emails] banco: ${producao ? "PRODUCAO (.env.production.local)" : "desenvolvimento (.env)"}`);
    console.log("[verificar-emails] só leitura: nada é alterado e nenhum e-mail é mostrado");

    const agora = new Date();
    const [contas, cadastros, palestrantes] = await Promise.all([
      prisma.usuario.findMany({ select: { emailLogin: true, perfil: true } }),
      prisma.cadastroPendente.findMany({ select: { emailLogin: true, expiraEm: true } }),
      prisma.palestrante.findMany({ select: { email: true } }),
    ]);
    const emAndamento = cadastros.filter((c) => c.expiraEm > agora);
    console.log(
      `[verificar-emails] contas: ${contas.length}; cadastros em andamento: ${emAndamento.length}` +
        ` (vencidos aguardando limpeza: ${cadastros.length - emAndamento.length}); palestrantes: ${palestrantes.length}`,
    );

    // 1) contas + cadastros em andamento: o e-mail de login tem que ser unico no sistema todo
    const registros = [
      ...contas.map((c) => ({ email: c.emailLogin, origem: NOME_DO_PERFIL[c.perfil] ?? c.perfil })),
      ...emAndamento.map((c) => ({ email: c.emailLogin, origem: "Cadastro em andamento" })),
    ];
    const gruposDeLogin = repetidos(registros, (r) => normalizarEmail(r.email));
    if (gruposDeLogin.length === 0) {
      console.log("[verificar-emails] e-mail repetido entre contas e cadastros: nenhum");
    } else {
      console.log(`[verificar-emails] e-mail repetido entre contas e cadastros: ${gruposDeLogin.length}`);
      gruposDeLogin.forEach((grupo, i) => {
        const origens = grupo.map((r) => r.origem).sort().join(", ");
        console.log(`  ${i + 1}. ${grupo.length} registros (${origens}), domínio ${dominio(normalizarEmail(grupo[0].email))}`);
      });
    }

    // 2) e-mails gravados fora do padrao (o sistema grava tudo normalizado desde a regra do e-mail unico)
    const foraDoPadrao = {
      contas: contas.filter((c) => c.emailLogin !== normalizarEmail(c.emailLogin)).length,
      cadastros: cadastros.filter((c) => c.emailLogin !== normalizarEmail(c.emailLogin)).length,
      palestrantes: palestrantes.filter((p) => p.email !== normalizarEmail(p.email)).length,
    };
    console.log(
      `[verificar-emails] e-mail gravado com maiúscula ou espaço: contas ${foraDoPadrao.contas}, cadastros ${foraDoPadrao.cadastros},` +
        ` palestrantes ${foraDoPadrao.palestrantes}`,
    );

    // 3) palestrantes: o e-mail so precisa ser unico entre eles (nao e login de ninguem)
    const gruposDePalestrantes = repetidos(palestrantes, (p) => normalizarEmail(p.email));
    console.log(
      `[verificar-emails] e-mail repetido entre palestrantes: ${gruposDePalestrantes.length === 0 ? "nenhum" : gruposDePalestrantes.length}`,
    );
    gruposDePalestrantes.forEach((grupo, i) => {
      console.log(`  ${i + 1}. ${grupo.length} palestrantes, domínio ${dominio(normalizarEmail(grupo[0].email))}`);
    });

    const tudoCerto = gruposDeLogin.length === 0 && gruposDePalestrantes.length === 0 && Object.values(foraDoPadrao).every((n) => n === 0);
    console.log(
      tudoCerto
        ? "[verificar-emails] conclusão: nenhum problema encontrado"
        : "[verificar-emails] conclusão: há itens acima para conferir (este script não corrige nada)",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error("[verificar-emails] falhou:", erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
