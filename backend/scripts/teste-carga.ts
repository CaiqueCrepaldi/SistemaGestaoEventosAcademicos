// teste de carga do SGEA com uma massa de 10.000 alunos, num banco DESCARTAVEL (SGEA_dev_carga) no mesmo
// cluster do TiDB — nunca no banco do site (SGEA) nem no de desenvolvimento (SGEA_dev). A URL do banco de
// carga e montada a partir da do .env (que precisa apontar pro SGEA_dev) trocando so o nome do banco, entao
// a senha nunca aparece na tela. O backend roda local: o site na Vercel nao recebe nenhuma requisicao.
//
// como rodar (de dentro de backend/):
//   npx tsx scripts/teste-carga.ts preparar   -> cria o banco SGEA_dev_carga, aplica as migrations e gera a massa
//   npx tsx scripts/teste-carga.ts medir      -> mede as rotas principais (tempo e tamanho da resposta)
//   npx tsx scripts/teste-carga.ts servidor   -> sobe o backend na 8080 apontando pro banco de carga (telas)
//   npx tsx scripts/teste-carga.ts apagar     -> apaga o banco SGEA_dev_carga
import "dotenv/config";
import { execSync } from "child_process";
import { randomBytes, randomUUID } from "crypto";
import type { AddressInfo } from "net";
import type { PrismaClient } from "@prisma/client";

const BANCO_CARGA = "SGEA_dev_carga";
const ALUNOS = 10_000;
const SALAS = 10;
const PALESTRANTES = 20;
const EVENTOS = 100;
const INSCRICOES_POR_ALUNO = 3;
const LOGS_AUDITORIA = 100_000;
export const SENHA_CARGA = "SenhaCarga123";
export const EMAIL_ADMIN_CARGA = "carga.admin@teste.invalido";
export const EMAIL_SECRETARIA_CARGA = "carga.secretaria@teste.invalido";
export const EMAIL_ALUNO_CARGA = "aluno.carga.1@alunos.umc.br";

const urlDev = process.env.DATABASE_URL ?? "";
const nomeDoBanco = (url: string) => {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
};
if (nomeDoBanco(urlDev) !== "SGEA_dev") {
  console.error("[teste-carga] recusado: o DATABASE_URL do .env precisa apontar pro SGEA_dev");
  process.exit(1);
}
const urlCarga = (() => {
  const url = new URL(urlDev);
  url.pathname = `/${BANCO_CARGA}`;
  return url.toString();
})();
if (nomeDoBanco(urlCarga) !== BANCO_CARGA) {
  console.error("[teste-carga] recusado: nao consegui montar a URL do banco de carga");
  process.exit(1);
}

async function comPrisma<T>(url: string, fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// gerador pseudoaleatorio com semente fixa: a massa sai igual a cada rodada (resultado comparavel)
let semente = 20261105;
const aleatorio = () => {
  semente = (semente * 1103515245 + 12345) % 2147483648;
  return semente / 2147483648;
};
const sortear = (n: number) => Math.floor(aleatorio() * n);

const NOMES = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Felipe", "Gabriela", "Heitor", "Isabela", "João", "Karina", "Lucas", "Mariana", "Nicolas", "Olivia", "Pedro", "Rafaela", "Samuel", "Tatiane", "Vinicius"];
const SOBRENOMES = ["Silva", "Souza", "Oliveira", "Santos", "Pereira", "Lima", "Carvalho", "Ferreira", "Rodrigues", "Almeida", "Costa", "Gomes", "Martins", "Araujo", "Barbosa", "Ribeiro", "Rocha", "Dias", "Moreira", "Teixeira"];
const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const codigoValidacao = () => Array.from(randomBytes(12), (b) => ALFABETO[b % 32]).join("");

const questionario = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i + 1}`,
  enunciado: `Pergunta ${i + 1} sobre o tema do evento`,
  alternativas: Array.from({ length: 4 }, (_, j) => ({ texto: `Alternativa ${j + 1}`, correta: j === 0 })),
}));

async function emLotes<T>(rotulo: string, itens: T[], tamanho: number, gravar: (lote: T[]) => Promise<unknown>) {
  const inicio = Date.now();
  for (let i = 0; i < itens.length; i += tamanho) await gravar(itens.slice(i, i + tamanho));
  console.log(`  ${rotulo.padEnd(22)} ${String(itens.length).padStart(7)} linhas  (${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
}

async function preparar() {
  console.log(`[teste-carga] criando o banco ${BANCO_CARGA} (se ainda nao existe)`);
  await comPrisma(urlDev, (p) => p.$executeRawUnsafe(`CREATE DATABASE IF NOT EXISTS \`${BANCO_CARGA}\``));
  console.log("[teste-carga] aplicando as migrations");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: urlCarga } });

  await comPrisma(urlCarga, async (prisma) => {
    if ((await prisma.usuario.count()) > 0) {
      console.log("[teste-carga] o banco de carga ja tem dados: nada a gerar (rode 'apagar' e 'preparar' pra recomecar)");
      return;
    }
    const { gerarHashSenha } = await import("../src/utils/password");
    // um hash so pra todo mundo (bcrypt custo 12 leva ~0,3 s por conta: 10 mil seriam ~50 min)
    const senhaHash = await gerarHashSenha(SENHA_CARGA);
    const agora = Date.now();
    const DIA = 24 * 3600 * 1000;
    console.log(`[teste-carga] gerando a massa (${ALUNOS} alunos)`);

    const participantes = Array.from({ length: ALUNOS }, (_, i) => ({
      id: randomUUID(),
      rgm: `9${String(i + 1).padStart(10, "0")}`,
      criadoEm: new Date(agora - sortear(180) * DIA),
    }));
    const nomeDoAluno = (i: number) => `${NOMES[i % NOMES.length]} ${SOBRENOMES[Math.floor(i / NOMES.length) % SOBRENOMES.length]} ${SOBRENOMES[(i * 7 + 3) % SOBRENOMES.length]}`;
    const alunos = participantes.map((p, i) => ({
      id: randomUUID(),
      nome: nomeDoAluno(i),
      emailLogin: `aluno.carga.${i + 1}@alunos.umc.br`,
      senhaHash,
      perfil: "ALUNO" as const,
      participanteId: p.id,
      consentimentoLgpdEm: p.criadoEm,
      versaoTermosAceitos: "2",
      criadoEm: p.criadoEm,
    }));
    const equipe = [
      { id: randomUUID(), nome: "Administrador Carga", emailLogin: EMAIL_ADMIN_CARGA, senhaHash, perfil: "ADMINISTRADOR" as const, versaoTermosAceitos: "2" },
      { id: randomUUID(), nome: "Secretaria Carga", emailLogin: EMAIL_SECRETARIA_CARGA, senhaHash, perfil: "SECRETARIA" as const, versaoTermosAceitos: "2" },
    ];
    const salas = Array.from({ length: SALAS }, (_, i) => ({ id: randomUUID(), nome: `Sala ${i + 1}`, capacidade: 400 }));
    const palestrantes = Array.from({ length: PALESTRANTES }, (_, i) => ({
      id: randomUUID(),
      nome: `${NOMES[(i + 5) % NOMES.length]} ${SOBRENOMES[(i + 11) % SOBRENOMES.length]}`,
      email: `palestrante.${i + 1}@teste.invalido`,
    }));
    // 70 eventos que ja aconteceram (ultimos 70 dias) e 30 futuros (proximos 30 dias), um por sala e dia
    const eventos = Array.from({ length: EVENTOS }, (_, i) => {
      const dia = i < 70 ? -(70 - i) : i - 69;
      return {
        id: randomUUID(),
        titulo: `Palestra ${i + 1}: ${["Inteligência Artificial", "Engenharia de Software", "Segurança da Informação", "Ciência de Dados", "Computação em Nuvem"][i % 5]}`,
        horario: new Date(agora + dia * DIA + (i % SALAS) * 3600 * 1000),
        salaId: salas[i % SALAS].id,
        palestranteId: palestrantes[i % PALESTRANTES].id,
        tema: ["IA", "Software", "Segurança", "Dados", "Nuvem"][i % 5],
        cargaHoraria: 2,
        questionario,
      };
    });

    // cada aluno em 3 eventos diferentes; presenca, questionario, certificado e avaliacao como numa rodada real
    type Inscricao = { id: string; participanteId: string; eventoId: string; statusPresenca: "PENDENTE" | "PRESENTE" | "AUSENTE"; dataCheckin: Date | null; usuarioId: string | null; dataInscricao: Date };
    const inscricoes: Inscricao[] = [];
    const tentativas: { id: string; participanteId: string; eventoId: string; respostas: number[]; acertos: number; totalPerguntas: number; percentual: number; criadoEm: Date }[] = [];
    const certificados: { id: string; inscricaoId: string; codigoValidacao: string; nomeParticipante: string; rgm: string; tituloEvento: string; temaEvento: string; nomePalestrante: string; dataEvento: Date; cargaHoraria: number; emitidoEm: Date }[] = [];
    const feedbacks: { id: string; eventoId: string; participanteId: string; nota: number; comentario: string; criadoEm: Date }[] = [];
    const ocupacao = new Map<string, number>();
    participantes.forEach((p, i) => {
      const escolhidos = new Set<number>();
      while (escolhidos.size < INSCRICOES_POR_ALUNO) {
        const e = sortear(EVENTOS);
        if ((ocupacao.get(eventos[e].id) ?? 0) < 400) escolhidos.add(e);
      }
      for (const e of escolhidos) {
        const evento = eventos[e];
        ocupacao.set(evento.id, (ocupacao.get(evento.id) ?? 0) + 1);
        const passado = evento.horario.getTime() < agora;
        const sorteio = aleatorio();
        const status = !passado ? "PENDENTE" : sorteio < 0.75 ? "PRESENTE" : sorteio < 0.9 ? "AUSENTE" : "PENDENTE";
        const inscricao: Inscricao = {
          id: randomUUID(),
          participanteId: p.id,
          eventoId: evento.id,
          statusPresenca: status,
          dataCheckin: status === "PRESENTE" ? evento.horario : null,
          usuarioId: status === "PRESENTE" ? equipe[1].id : null,
          dataInscricao: new Date(evento.horario.getTime() - (1 + sortear(20)) * DIA),
        };
        inscricoes.push(inscricao);
        if (status !== "PRESENTE" || aleatorio() > 0.9) continue;
        // ate 2 tentativas; aprovado com 60% ou mais
        let melhor = 0;
        for (let t = 0; t < 2 && melhor < 60; t++) {
          const acertos = 3 + sortear(8);
          melhor = Math.max(melhor, acertos * 10);
          tentativas.push({
            id: randomUUID(),
            participanteId: p.id,
            eventoId: evento.id,
            respostas: Array.from({ length: 10 }, (_, k) => (k < acertos ? 0 : 1)),
            acertos,
            totalPerguntas: 10,
            percentual: acertos * 10,
            criadoEm: new Date(evento.horario.getTime() + (t + 3) * 3600 * 1000),
          });
          if (acertos * 10 < 60 && aleatorio() < 0.5) break;
        }
        if (melhor < 60 || aleatorio() > 0.6) continue;
        certificados.push({
          id: randomUUID(),
          inscricaoId: inscricao.id,
          codigoValidacao: codigoValidacao(),
          nomeParticipante: alunos[i].nome,
          rgm: p.rgm,
          tituloEvento: evento.titulo,
          temaEvento: evento.tema,
          nomePalestrante: palestrantes.find((x) => x.id === evento.palestranteId)!.nome,
          dataEvento: evento.horario,
          cargaHoraria: evento.cargaHoraria,
          emitidoEm: new Date(evento.horario.getTime() + DIA),
        });
        if (aleatorio() < 0.4) {
          feedbacks.push({
            id: randomUUID(),
            eventoId: evento.id,
            participanteId: p.id,
            nota: 1 + sortear(5),
            comentario: "Palestra muito boa, conteúdo claro e bem apresentado. Gostaria de mais exemplos práticos.",
            criadoEm: new Date(evento.horario.getTime() + 2 * DIA),
          });
        }
      }
    });
    const acoes = ["LOGIN_SUCESSO", "LOGIN_SUCESSO", "LOGIN_SUCESSO", "INSCRICAO_CRIADA", "PRESENCA_CONFIRMADA", "QUESTIONARIO_RESPONDIDO", "CERTIFICADO_EMITIDO", "LOGIN_FALHA"];
    const logs = Array.from({ length: LOGS_AUDITORIA }, () => {
      const i = sortear(ALUNOS);
      const acao = acoes[sortear(acoes.length)];
      return {
        id: randomUUID(),
        usuarioId: alunos[i].id,
        atorNome: alunos[i].nome,
        acao,
        detalhe: acao.startsWith("LOGIN") ? null : `registro de carga ${randomUUID().slice(0, 8)}`,
        criadoEm: new Date(agora - sortear(90 * 24 * 60) * 60 * 1000),
      };
    });

    const inicio = Date.now();
    await emLotes("participantes", participantes, 2000, (l) => prisma.participante.createMany({ data: l }));
    await emLotes("usuarios (alunos)", alunos, 2000, (l) => prisma.usuario.createMany({ data: l }));
    await emLotes("usuarios (equipe)", equipe, 10, (l) => prisma.usuario.createMany({ data: l }));
    await emLotes("salas", salas, 100, (l) => prisma.sala.createMany({ data: l }));
    await emLotes("palestrantes", palestrantes, 100, (l) => prisma.palestrante.createMany({ data: l }));
    await emLotes("eventos", eventos, 100, (l) => prisma.evento.createMany({ data: l }));
    await emLotes("inscricoes", inscricoes, 2000, (l) => prisma.inscricao.createMany({ data: l }));
    await emLotes("tentativas", tentativas, 2000, (l) => prisma.tentativaQuestionario.createMany({ data: l }));
    await emLotes("certificados", certificados, 2000, (l) => prisma.certificado.createMany({ data: l }));
    await emLotes("feedbacks", feedbacks, 2000, (l) => prisma.feedback.createMany({ data: l }));
    await emLotes("logs de auditoria", logs, 2500, (l) => prisma.logAuditoria.createMany({ data: l }));
    console.log(`[teste-carga] massa gerada em ${((Date.now() - inicio) / 1000).toFixed(0)} s`);
  });
}

async function medir() {
  process.env.DATABASE_URL = urlCarga;
  const { criarApp } = await import("../src/expressApp");
  const { prisma } = await import("../src/db/prisma");
  const servidor = criarApp().listen(0);
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`;
  const LIMITE_VERCEL = 4.5 * 1024 * 1024;

  const contagens = await Promise.all([
    prisma.usuario.count(), prisma.inscricao.count(), prisma.tentativaQuestionario.count(),
    prisma.certificado.count(), prisma.feedback.count(), prisma.logAuditoria.count(),
  ]);
  console.log(`[teste-carga] banco ${BANCO_CARGA}: ${contagens[0]} contas, ${contagens[1]} inscrições, ${contagens[2]} tentativas, ${contagens[3]} certificados, ${contagens[4]} avaliações, ${contagens[5]} logs`);

  async function chamar(metodo: string, caminho: string, token?: string, corpo?: unknown) {
    const inicio = performance.now();
    const res = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const bytes = (await res.arrayBuffer()).byteLength;
    return { status: res.status, ms: performance.now() - inicio, bytes, res };
  }
  async function entrar(email: string) {
    const res = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emailLogin: email, senha: SENHA_CARGA }) });
    return ((await res.json()) as { token: string }).token;
  }

  const linhas: string[] = [];
  async function medirRota(rotulo: string, caminho: string, token?: string, vezes = 3) {
    await chamar("GET", caminho, token); // aquece (conexao e cache de plano do banco)
    const tempos: number[] = [];
    let ultima = { status: 0, bytes: 0 };
    for (let i = 0; i < vezes; i++) {
      const r = await chamar("GET", caminho, token);
      tempos.push(r.ms);
      ultima = r;
    }
    tempos.sort((a, b) => a - b);
    const mediana = tempos[Math.floor(tempos.length / 2)];
    const alertas = [ultima.bytes > LIMITE_VERCEL ? "PASSA DO LIMITE DE 4,5 MB DA VERCEL" : "", mediana > 2000 ? "lenta (> 2 s)" : ""].filter(Boolean).join("; ");
    linhas.push(`  ${rotulo.padEnd(44)} ${String(ultima.status).padEnd(4)} ${mediana.toFixed(0).padStart(6)} ms ${(ultima.bytes / 1024).toFixed(0).padStart(7)} KB  ${alertas}`);
  }

  const inicioLogin = performance.now();
  const tokenAdmin = await entrar(EMAIL_ADMIN_CARGA);
  const tempoLogin = performance.now() - inicioLogin;
  const tokenAluno = await entrar(EMAIL_ALUNO_CARGA);

  const alunoMedido = await prisma.usuario.findUnique({ where: { emailLogin: EMAIL_ALUNO_CARGA } });
  const eventoMedido = await prisma.evento.findFirst({ where: { horario: { lt: new Date() } }, orderBy: { horario: "desc" } });

  console.log(`\n[teste-carga] rotas que as telas da EQUIPE usam (mediana de 3 chamadas, depois de aquecer)`);
  linhas.push(`  ${"login (bcrypt custo 12)".padEnd(44)} 200  ${tempoLogin.toFixed(0).padStart(6)} ms`);
  await medirRota("Dashboard  GET /dashboard", "/dashboard", tokenAdmin);
  await medirRota("Eventos  GET /eventos", "/eventos", tokenAdmin);
  await medirRota("Participantes  GET /participantes", "/participantes", tokenAdmin);
  await medirRota("Check-in  busca de alunos (sem texto)", "/participantes/alunos?limite=20", tokenAdmin);
  await medirRota("Check-in  busca de alunos (\"ana\")", "/participantes/alunos?busca=ana&limite=20", tokenAdmin);
  await medirRota("Check-in  inscrições do aluno escolhido", `/inscricoes?participanteId=${alunoMedido?.participanteId}`, tokenAdmin);
  await medirRota("Inscrições  GET /inscricoes/gestao (pág. 1)", "/inscricoes/gestao?page=1&pageSize=50", tokenAdmin);
  await medirRota("Inscrições  filtro por evento", `/inscricoes/gestao?eventoId=${eventoMedido?.id}&page=1&pageSize=50`, tokenAdmin);
  await medirRota("Inscrições  busca por aluno (\"silva\")", "/inscricoes/gestao?busca=silva&page=1&pageSize=50", tokenAdmin);
  await medirRota("Certificados  GET /certificados/situacao (pág. 1)", "/certificados/situacao?page=1&pageSize=50", tokenAdmin);
  await medirRota("Certificados  filtro por evento", `/certificados/situacao?eventoId=${eventoMedido?.id}&page=1&pageSize=50`, tokenAdmin);
  await medirRota("Feedback  GET /feedbacks", "/feedbacks", tokenAdmin);
  await medirRota("Auditoria  GET /logs-auditoria (página 1)", "/logs-auditoria?page=1&pageSize=50", tokenAdmin);
  await medirRota("Auditoria  GET /logs-auditoria/responsaveis", "/logs-auditoria/responsaveis", tokenAdmin);
  linhas.forEach((l) => console.log(l));
  linhas.length = 0;

  // listas inteiras que as telas usavam antes da paginacao (a API ainda tem, mas nenhuma tela chama)
  console.log(`\n[teste-carga] listas inteiras antigas, só para comparar (nenhuma tela usa mais)`);
  await medirRota("GET /inscricoes (todas)", "/inscricoes", tokenAdmin, 1);
  await medirRota("GET /inscricoes?status=PRESENTE (todas)", "/inscricoes?status=PRESENTE", tokenAdmin, 1);
  await medirRota("GET /questionario-tentativas (todas)", "/questionario-tentativas", tokenAdmin, 1);
  linhas.forEach((l) => console.log(l));
  linhas.length = 0;

  console.log(`\n[teste-carga] rotas do ALUNO`);
  await medirRota("Eventos  GET /eventos", "/eventos", tokenAluno);
  await medirRota("Inscrições próprias  GET /inscricoes", "/inscricoes", tokenAluno);
  await medirRota("Certificados  GET /certificados", "/certificados", tokenAluno);
  await medirRota("Feedback  GET /feedbacks/elegiveis", "/feedbacks/elegiveis", tokenAluno);
  await medirRota("Meus dados  GET /meus-dados", "/meus-dados", tokenAluno);
  await medirRota("Validação pública  GET /certificados/validar", "/certificados/validar/ZZZZZZZZZZZZ");
  linhas.forEach((l) => console.log(l));
  linhas.length = 0;

  // 50 alunos diferentes abrindo as telas ao mesmo tempo (logins feitos antes: o bcrypt nao entra na conta)
  const tokens = await Promise.all(Array.from({ length: 50 }, (_, i) => entrar(`aluno.carga.${i + 2}@alunos.umc.br`)));
  const inicioConcorrencia = performance.now();
  const respostas = await Promise.all(
    tokens.flatMap((t) => [chamar("GET", "/eventos", t), chamar("GET", "/inscricoes", t), chamar("GET", "/meus-dados", t)]),
  );
  const totalConcorrencia = performance.now() - inicioConcorrencia;
  const tempos = respostas.map((r) => r.ms).sort((a, b) => a - b);
  const p95 = tempos[Math.floor(tempos.length * 0.95)];
  console.log(`\n[teste-carga] 50 alunos ao mesmo tempo (150 requisições: eventos, inscrições e meus dados)`);
  console.log(`  todas responderam ${respostas.every((r) => r.status === 200) ? "200" : "COM ERRO"}; total ${totalConcorrencia.toFixed(0)} ms; mediana ${tempos[Math.floor(tempos.length / 2)].toFixed(0)} ms; 95% abaixo de ${p95.toFixed(0)} ms`);

  // gravacoes comuns com o banco cheio: autoinscricao num evento futuro com vaga e check-in
  const eventoFuturo = await prisma.evento.findFirst({ where: { horario: { gt: new Date() } }, orderBy: { horario: "asc" } });
  const aluno = await prisma.usuario.findUnique({ where: { emailLogin: EMAIL_ALUNO_CARGA } });
  if (eventoFuturo && aluno?.participanteId) {
    await prisma.inscricao.deleteMany({ where: { participanteId: aluno.participanteId, eventoId: eventoFuturo.id } });
    const r = await chamar("POST", `/eventos/${eventoFuturo.id}/inscricoes`, tokenAluno);
    console.log(`\n[teste-carga] gravação: autoinscrição com o banco cheio -> ${r.status} em ${r.ms.toFixed(0)} ms (inclui o e-mail simulado)`);
  }
  servidor.close();
  await prisma.$disconnect();
}

async function servidor() {
  process.env.DATABASE_URL = urlCarga;
  process.env.PORT = process.env.PORT ?? "8080";
  const { criarApp } = await import("../src/expressApp");
  criarApp().listen(Number(process.env.PORT), () => {
    console.log(`[teste-carga] backend na porta ${process.env.PORT} usando o banco ${BANCO_CARGA}`);
  });
}

async function apagar() {
  await comPrisma(urlDev, (p) => p.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${BANCO_CARGA}\``));
  console.log(`[teste-carga] banco ${BANCO_CARGA} apagado`);
}

const comandos: Record<string, () => Promise<void>> = { preparar, medir, servidor, apagar };
const comando = comandos[process.argv[2] ?? ""];
if (!comando) {
  console.error("uso: npx tsx scripts/teste-carga.ts preparar | medir | servidor | apagar");
  process.exit(1);
}
comando().catch((erro) => {
  console.error("[teste-carga] falhou:", erro instanceof Error ? erro.message.split("\n").slice(-3).join(" ") : erro);
  process.exit(1);
});
