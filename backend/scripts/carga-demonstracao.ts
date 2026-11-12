// CARGA DE DEMONSTRACAO: apaga TODOS os dados do banco e carrega um cenario realista para a apresentacao —
// 12 salas no padrao da UMC (8 de aula, 2 laboratorios e 2 auditorios), 40 palestrantes, 150 professores e 1.000
// alunos ficticios, 200 eventos (140 passados, 10 nos proximos 7 dias e 50 de 8 a 30 dias a frente), com aprovacao
// e historico, inscricoes (nenhum aluno em dois eventos no mesmo horario), check-in, questionario, certificados e
// avaliacoes — alem das tres contas de demonstracao (admin, secretaria e professor, com as senhas
// das variaveis SEED_*_SENHA). As contas ficticias (usuarios.ficticio) nunca recebem e-mail.
//
// como rodar (de dentro de backend/):
//   npx tsx scripts/carga-demonstracao.ts                         -> SIMULACAO no banco do .env (dev): so mostra
//   npx tsx scripts/carga-demonstracao.ts --aplicar               -> apaga tudo e carrega no banco do .env
//   npx tsx scripts/carga-demonstracao.ts --producao              -> SIMULACAO no banco de producao
//   npx tsx scripts/carga-demonstracao.ts --producao --aplicar    -> apaga tudo e carrega em producao
//   --evento-apresentacao "2026-11-13T21:00"                      -> data/hora (Sao Paulo) do evento da apresentacao
//
// --producao carrega o backend/.env.production.local (onde tambem precisam estar as SEED_*_SENHA). Com --aplicar,
// ANTES de apagar qualquer coisa, salva uma copia de todas as tabelas em backend/backups/backup-<data-hora>.json;
// se a copia falhar (ou faltar alguma senha), nada e apagado. O console mostra so quantidades, nunca dado pessoal.
// Datas: a partir do dia em que o script roda, no fuso America/Sao_Paulo
import { config, parse } from "dotenv";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const producao = process.argv.includes("--producao");
const aplicar = process.argv.includes("--aplicar");
const indiceApresentacao = process.argv.indexOf("--evento-apresentacao");
const textoApresentacao = indiceApresentacao >= 0 ? process.argv[indiceApresentacao + 1] : "2026-11-13T21:00";

// tem que carregar o .env certo ANTES de importar prisma/env do app, por isso os imports dinamicos. Em producao, as
// senhas das contas de demonstracao precisam estar no proprio .env.production.local: o app tambem le o .env de
// dev (sem sobrescrever), e uma SEED_*_SENHA que faltasse no de producao viria do dev sem ninguem perceber
const SENHAS_EXIGIDAS = ["SEED_ADMIN_SENHA", "SEED_SECRETARIA_SENHA", "SEED_PROFESSOR_SENHA"];
let faltamNoArquivoDeProducao: string[] = [];
if (producao) {
  if (!existsSync(".env.production.local")) {
    console.error("[carga] .env.production.local não encontrado (rode de dentro de backend/). Nada foi feito.");
    process.exit(1);
  }
  const doArquivo = parse(readFileSync(".env.production.local"));
  faltamNoArquivoDeProducao = SENHAS_EXIGIDAS.filter((v) => !doArquivo[v]?.trim());
  config({ path: ".env.production.local", override: true });
}

const PREFIXO = "[carga]";
const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const TAMANHO_DO_LOTE = 500;
const PALAVRAS_PROIBIDAS = ["teste", "demo", "fake", "exemplo"];

// ---------------------------------------------------------------- aleatorio com semente (carga reproduzivel)
function gerador(semente: number) {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const aleatorio = gerador(20261109);
const entre = (min: number, max: number) => min + aleatorio() * (max - min);
const inteiro = (min: number, max: number) => Math.floor(entre(min, max + 1));
const chance = (p: number) => aleatorio() < p;
const sortear = <T>(lista: readonly T[]): T => lista[Math.floor(aleatorio() * lista.length)];
function embaralhar<T>(lista: T[]): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}
function sortearPeso<T>(opcoes: [T, number][]): T {
  const total = opcoes.reduce((s, [, p]) => s + p, 0);
  let x = aleatorio() * total;
  for (const [valor, peso] of opcoes) {
    x -= peso;
    if (x <= 0) return valor;
  }
  return opcoes[opcoes.length - 1][0];
}
const entreDatas = (de: Date, ate: Date) => new Date(de.getTime() + aleatorio() * Math.max(0, ate.getTime() - de.getTime()));
const minData = (...datas: Date[]) => new Date(Math.min(...datas.map((d) => d.getTime())));
const maxData = (...datas: Date[]) => new Date(Math.max(...datas.map((d) => d.getTime())));

// ---------------------------------------------------------------- datas no fuso de Sao Paulo
const FORMATO_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

function partesSP(data: Date) {
  const p = Object.fromEntries(FORMATO_SP.formatToParts(data).map((x) => [x.type, x.value]));
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: Number(p.hour), minuto: Number(p.minute), domingo: p.weekday === "Sun" };
}

// instante de uma data/hora local de Sao Paulo (o dia pode "transbordar": dia 32 vira o dia 1 do mes seguinte)
function dataSP(ano: number, mes: number, dia: number, hora = 0, minuto = 0): Date {
  const desejado = Date.UTC(ano, mes - 1, dia, hora, minuto);
  let instante = desejado + 3 * HORA;
  for (let i = 0; i < 2; i++) {
    const p = partesSP(new Date(instante));
    instante += desejado - Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
  }
  return new Date(instante);
}

function carimbo(data: Date): string {
  const p = partesSP(data);
  const d2 = (n: number) => String(n).padStart(2, "0");
  return `${p.ano}-${d2(p.mes)}-${d2(p.dia)}_${d2(p.hora)}-${d2(p.minuto)}`;
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ---------------------------------------------------------------- tipos do que vai ser gravado
interface Usuario {
  id: string;
  nome: string;
  emailLogin: string;
  senhaHash: string;
  perfil: "PROFESSOR" | "ALUNO";
  participanteId: string | null;
  consentimentoLgpdEm: Date;
  versaoTermosAceitos: string;
  ativo: boolean;
  ficticio: boolean;
  criadoEm: Date;
}
interface EventoGerado {
  id: string;
  titulo: string;
  tema: string;
  horario: Date;
  cargaHoraria: number;
  salaId: string;
  palestranteId: string;
  questionario: { id: string; enunciado: string; alternativas: { texto: string; correta: boolean }[] }[];
  criadoEm: Date;
  situacao: "PENDENTE" | "APROVADO" | "RECUSADO";
  motivoRecusa: string | null;
  criadoPorId: string | null;
  // so pra montar a carga (nao vao pro banco)
  aprovadoEm: Date | null;
  passado: boolean;
  apresentacao: boolean;
  capacidade: number;
}

async function main() {
  const inicioDaExecucao = Date.now();
  const { prisma } = await import("../src/db/prisma");
  const { SENHA_INUTILIZAVEL } = await import("../src/utils/password");
  const { VERSAO_TERMOS_ATUAL } = await import("../src/config/termos");
  const { gerarCodigoValidacao } = await import("../src/modules/certificados/certificados.service");
  const { PERCENTUAL_APROVACAO, MAX_TENTATIVAS_QUESTIONARIO } = await import("../src/utils/questionario");
  const { janelaDoCheckin } = await import("../src/utils/checkin");
  const { REGEX_CODIGO_SALA } = await import("../src/utils/salas");
  const contas = await import("../prisma/contas-demonstracao");
  const dados = await import("./carga-demonstracao-dados");

  try {
    const banco = (() => {
      try {
        return decodeURIComponent(new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, "")) || "(sem nome)";
      } catch {
        return "(DATABASE_URL inválida)";
      }
    })();
    console.log(`${PREFIXO} banco de destino: ${banco} (${producao ? "PRODUÇÃO, .env.production.local" : "desenvolvimento, .env"})`);
    console.log(aplicar ? `${PREFIXO} MODO REAL: vai apagar todos os dados e carregar a demonstração` : `${PREFIXO} SIMULAÇÃO: nada será alterado`);

    // senhas das tres contas: conferidas antes de qualquer coisa
    let senhas: Awaited<ReturnType<typeof contas.lerSenhasDeDemonstracao>> | null = null;
    try {
      if (faltamNoArquivoDeProducao.length > 0) {
        throw new Error(`faltam no .env.production.local: ${faltamNoArquivoDeProducao.join(", ")}`);
      }
      senhas = contas.lerSenhasDeDemonstracao();
      console.log(`${PREFIXO} senhas das contas de demonstração: ok (SEED_ADMIN_SENHA, SEED_SECRETARIA_SENHA, SEED_PROFESSOR_SENHA)`);
    } catch (erro) {
      console.error(`${PREFIXO} ${erro instanceof Error ? erro.message : erro}`);
      if (aplicar) {
        console.error(`${PREFIXO} nada foi apagado.`);
        process.exitCode = 1;
        return;
      }
    }

    // ------------------------------------------------------------ datas de referencia
    const agora = new Date();
    const hoje = partesSP(agora);
    const diaSP = (deslocamento: number, hora = 0, minuto = 0) => dataSP(hoje.ano, hoje.mes, hoje.dia + deslocamento, hora, minuto);
    const inicioDaCarga = dataSP(2026, 7, 1, 8, 0);
    const casamento = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(textoApresentacao ?? "");
    if (!casamento) throw new Error('--evento-apresentacao no formato "AAAA-MM-DDTHH:MM" (horário de São Paulo)');
    const horarioApresentacao = dataSP(Number(casamento[1]), Number(casamento[2]), Number(casamento[3]), Number(casamento[4]), Number(casamento[5]));
    if (horarioApresentacao <= agora) console.warn(`${PREFIXO} atenção: o evento da apresentação ficou no passado`);

    // ------------------------------------------------------------ contas de demonstracao (ids fixos)
    const idAdmin = randomUUID();
    const idSecretaria = randomUUID();
    const idProfessorDemo = randomUUID();
    const nomeDaEquipe: Record<string, string> = { [idAdmin]: "Administrador", [idSecretaria]: "Secretaria", [idProfessorDemo]: "Professor" };
    const equipeQueAprova = () => (chance(0.65) ? idSecretaria : idAdmin);

    // ------------------------------------------------------------ salas e palestrantes
    const salas = dados.SALAS.map((s) => ({ id: randomUUID(), nome: s.nome, tipo: s.tipo, capacidade: s.capacidade }));
    const palestrantes: { id: string; nome: string; email: string; situacao: "APROVADO" }[] = [];
    const emailsPalestrantes = new Set<string>();
    while (palestrantes.length < 40) {
      const nome = sortear(dados.PRIMEIROS_NOMES);
      const sobrenome = sortear(dados.SOBRENOMES);
      const email = `${semAcento(nome).toLowerCase()}.${semAcento(sobrenome).toLowerCase()}@${sortear(dados.DOMINIOS_PALESTRANTES)}`;
      if (emailsPalestrantes.has(email) || palestrantes.some((p) => p.nome === `${nome} ${sobrenome}`)) continue;
      emailsPalestrantes.add(email);
      palestrantes.push({ id: randomUUID(), nome: `${nome} ${sobrenome}`, email, situacao: "APROVADO" });
    }

    // ------------------------------------------------------------ professores ficticios (so o primeiro nome)
    const usuarios: Usuario[] = [];
    const emailsUsados = new Set(contas.CONTAS_DE_DEMONSTRACAO.map((c) => c.email));
    const repeticoes = new Map<string, number>();
    const professores: Usuario[] = [];
    for (let i = 0; i < 150; i++) {
      const nome = sortear(dados.PRIMEIROS_NOMES);
      const base = semAcento(nome).toLowerCase();
      const vez = (repeticoes.get(base) ?? 0) + 1;
      repeticoes.set(base, vez);
      const emailLogin = `${base}${vez === 1 ? "" : vez}@umc.br`;
      emailsUsados.add(emailLogin);
      const criadoEm = entreDatas(dataSP(2026, 7, 1, 8), dataSP(2026, 7, 10, 18));
      const professor: Usuario = {
        id: randomUUID(),
        nome,
        emailLogin,
        senhaHash: SENHA_INUTILIZAVEL,
        perfil: "PROFESSOR",
        participanteId: null,
        consentimentoLgpdEm: criadoEm,
        versaoTermosAceitos: VERSAO_TERMOS_ATUAL,
        ativo: true,
        ficticio: true,
        criadoEm,
      };
      professores.push(professor);
      usuarios.push(professor);
    }

    // ------------------------------------------------------------ alunos ficticios (data da conta definida depois)
    const participantes: { id: string; rgm: string; ativo: boolean; criadoEm: Date }[] = [];
    const alunos: (Usuario & { participanteId: string })[] = [];
    for (let i = 1; i <= 1000; i++) {
      let emailLogin: string;
      do {
        emailLogin = `${String(inteiro(0, 9999999999)).padStart(10, "0")}${"abcdefghijklmnopqrstuvwxyz"[inteiro(0, 25)]}@alunos.umc.br`;
      } while (emailsUsados.has(emailLogin));
      emailsUsados.add(emailLogin);
      const sobrenomes = chance(0.6) ? `${sortear(dados.SOBRENOMES)} ${sortear(dados.SOBRENOMES)}` : sortear(dados.SOBRENOMES);
      const participante = { id: randomUUID(), rgm: `09${String(i).padStart(9, "0")}`, ativo: true, criadoEm: inicioDaCarga };
      participantes.push(participante);
      const aluno = {
        id: randomUUID(),
        nome: `${sortear(dados.PRIMEIROS_NOMES)} ${sobrenomes}`,
        emailLogin,
        senhaHash: SENHA_INUTILIZAVEL,
        perfil: "ALUNO" as const,
        participanteId: participante.id,
        consentimentoLgpdEm: inicioDaCarga,
        versaoTermosAceitos: VERSAO_TERMOS_ATUAL,
        ativo: true,
        ficticio: true,
        criadoEm: inicioDaCarga,
      };
      alunos.push(aluno);
      usuarios.push(aluno);
    }

    // ------------------------------------------------------------ titulos e questionarios
    const areas = Object.keys(dados.TEMAS) as (keyof typeof dados.TEMAS)[];
    // titulo unico ("Formato: assunto"); o mesmo assunto aparece no maximo 3 vezes, sempre em formato diferente. O
    // formato segue o tipo da sala: workshop e minicurso no laboratorio; palestra, mesa-redonda e seminario nas outras
    const titulosUsados = new Set<string>();
    const vezesDoAssunto = new Map<string, number>();
    function assuntoNovo(tipoDaSala: keyof typeof dados.FORMATOS_POR_TIPO) {
      for (;;) {
        const area = sortear(areas);
        const topico = sortear(dados.TEMAS[area]);
        const titulo = `${sortear(dados.FORMATOS_POR_TIPO[tipoDaSala])}: ${topico.assunto}`;
        if (titulosUsados.has(titulo) || (vezesDoAssunto.get(topico.assunto) ?? 0) >= 3) continue;
        titulosUsados.add(titulo);
        vezesDoAssunto.set(topico.assunto, (vezesDoAssunto.get(topico.assunto) ?? 0) + 1);
        return { area, titulo, tema: topico.tema };
      }
    }
    function questionarioDa(area: keyof typeof dados.PERGUNTAS) {
      return embaralhar(dados.PERGUNTAS[area])
        .slice(0, 10)
        .map((pergunta, i) => {
          const ordem = embaralhar([0, 1, 2, 3]);
          return {
            id: `q${i + 1}`,
            enunciado: pergunta.enunciado,
            alternativas: ordem.map((original) => ({ texto: pergunta.alternativas[original], correta: original === 0 })),
          };
        });
    }

    // ------------------------------------------------------------ agenda das salas (mesma regra do validarConflitoDeSala:
    // um evento ocupa [inicio, inicio + carga horaria); encostar no fim do outro nao e conflito)
    const ocupacao = new Map<string, [number, number][]>();
    const salaLivre = (salaId: string, inicio: Date, carga: number) => {
      const fim = inicio.getTime() + carga * HORA;
      return (ocupacao.get(salaId) ?? []).every(([a, b]) => !(inicio.getTime() < b && fim > a));
    };
    const reservar = (salaId: string, inicio: Date, carga: number) => {
      ocupacao.set(salaId, [...(ocupacao.get(salaId) ?? []), [inicio.getTime(), inicio.getTime() + carga * HORA]]);
    };
    const CARGAS = [1, 1.5, 2, 2, 2.5, 3, 3, 4];
    // sorteia dia (dentro da lista), horario (8h as 21h, de meia em meia hora), carga e sala sem conflito
    function alocar(dias: number[], depoisDe: Date | null, capacidadeMinima = 0) {
      for (let tentativa = 0; tentativa < 2000; tentativa++) {
        const deslocamento = sortear(dias);
        const meiaHora = inteiro(16, 42);
        const horario = diaSP(deslocamento, Math.floor(meiaHora / 2), (meiaHora % 2) * 30);
        if (depoisDe && horario <= depoisDe) continue;
        if (partesSP(horario).domingo) continue;
        const carga = sortear(CARGAS);
        const sala = sortear(salas.filter((s) => s.capacidade >= capacidadeMinima));
        if (!salaLivre(sala.id, horario, carga)) continue;
        reservar(sala.id, horario, carga);
        return { horario, carga, sala };
      }
      throw new Error("não foi possível encaixar um evento sem conflito de sala");
    }

    // dias de referencia (deslocamento a partir de hoje)
    const primeiroDiaPassado = Math.round((dataSP(2026, 8, 1).getTime() - diaSP(0).getTime()) / DIA);
    const diasPassados = Array.from({ length: -primeiroDiaPassado }, (_, i) => primeiroDiaPassado + i); // 01/08 ate ontem
    const diasProximos = [0, 1, 2, 3, 4, 5, 6, 7];
    const diasDistantes = Array.from({ length: 23 }, (_, i) => 8 + i);
    const minimoFuturo = new Date(agora.getTime() + 3 * HORA);

    // ------------------------------------------------------------ eventos
    const eventos: EventoGerado[] = [];
    const historico: { id: string; tipo: string; itemId: string; acao: string; mensagem: string | null; autorId: string; autorNome: string; criadoEm: Date }[] = [];
    const nomeDe = (id: string) => nomeDaEquipe[id] ?? professores.find((p) => p.id === id)?.nome ?? "";
    const criadoEmDe = (id: string | null) => (id ? (professores.find((p) => p.id === id)?.criadoEm ?? inicioDaCarga) : inicioDaCarga);

    function criarEvento(
      dono: string | null,
      situacao: "PENDENTE" | "APROVADO" | "RECUSADO",
      agenda: { horario: Date; carga: number; sala: (typeof salas)[number] },
      opcoes: { passado: boolean; apresentacao?: boolean; criadoEmFixo?: Date } = { passado: false },
    ) {
      const { area, titulo, tema } = assuntoNovo(agenda.sala.tipo);
      const limiteCriacao = minData(new Date(agenda.horario.getTime() - 2 * DIA), new Date(agora.getTime() - 2 * HORA));
      const criadoEm =
        opcoes.criadoEmFixo ??
        maxData(
          minData(new Date(agenda.horario.getTime() - inteiro(10, 25) * DIA - inteiro(0, 10) * HORA), limiteCriacao),
          new Date(criadoEmDe(dono).getTime() + DIA),
        );
      let aprovadoEm: Date | null = null;
      let motivoRecusa: string | null = null;
      if (situacao === "APROVADO") {
        aprovadoEm = dono ? minData(new Date(criadoEm.getTime() + inteiro(3, 60) * HORA), new Date(agenda.horario.getTime() - DIA), new Date(agora.getTime() - HORA)) : criadoEm;
        if (aprovadoEm < criadoEm) aprovadoEm = new Date(criadoEm.getTime() + 30 * MIN);
      }
      const evento: EventoGerado = {
        id: randomUUID(),
        titulo,
        tema,
        horario: agenda.horario,
        cargaHoraria: agenda.carga,
        salaId: agenda.sala.id,
        palestranteId: sortear(palestrantes).id,
        questionario: questionarioDa(area),
        criadoEm,
        situacao,
        motivoRecusa: null,
        criadoPorId: dono,
        aprovadoEm,
        passado: opcoes.passado,
        apresentacao: !!opcoes.apresentacao,
        capacidade: agenda.sala.capacidade,
      };
      // historico da aprovacao: so evento de professor (o da equipe ja nasce aprovado)
      if (dono) {
        historico.push({ id: randomUUID(), tipo: "EVENTO", itemId: evento.id, acao: "ENVIADO", mensagem: null, autorId: dono, autorNome: nomeDe(dono), criadoEm });
        if (situacao === "APROVADO") {
          const quem = equipeQueAprova();
          historico.push({ id: randomUUID(), tipo: "EVENTO", itemId: evento.id, acao: "APROVADO", mensagem: null, autorId: quem, autorNome: nomeDe(quem), criadoEm: aprovadoEm! });
        } else if (situacao === "RECUSADO") {
          const quem = equipeQueAprova();
          motivoRecusa = sortear(dados.MOTIVOS_RECUSA);
          const recusadoEm = minData(new Date(criadoEm.getTime() + inteiro(3, 40) * HORA), new Date(agora.getTime() - 30 * MIN));
          historico.push({ id: randomUUID(), tipo: "EVENTO", itemId: evento.id, acao: "RECUSADO", mensagem: motivoRecusa, autorId: quem, autorNome: nomeDe(quem), criadoEm: recusadoEm });
        }
      }
      evento.motivoRecusa = motivoRecusa;
      eventos.push(evento);
      return evento;
    }

    const professorFicticio = () => sortear(professores).id;
    const donoComum = () => (chance(0.75) ? professorFicticio() : null);

    // evento da apresentacao (professor de demonstracao): horario fixo, sala de 40 lugares ou mais, livre
    const salaApresentacao = embaralhar(salas.filter((s) => s.capacidade >= 40)).find((s) => salaLivre(s.id, horarioApresentacao, 2));
    if (!salaApresentacao) throw new Error("nenhuma sala livre para o evento da apresentação");
    reservar(salaApresentacao.id, horarioApresentacao, 2);
    criarEvento(idProfessorDemo, "APROVADO", { horario: horarioApresentacao, carga: 2, sala: salaApresentacao }, { passado: false, apresentacao: true });
    // professor de demonstracao: 6 passados, 4 futuros aprovados (2 nos proximos 7 dias, 2 depois), 1 pendente em 7 dias
    for (let i = 0; i < 6; i++) criarEvento(idProfessorDemo, "APROVADO", alocar(diasPassados.slice(10), null), { passado: true });
    for (let i = 0; i < 2; i++) criarEvento(idProfessorDemo, "APROVADO", alocar(diasProximos.slice(1, 7), minimoFuturo), { passado: false });
    for (let i = 0; i < 2; i++) criarEvento(idProfessorDemo, "APROVADO", alocar(diasDistantes, minimoFuturo), { passado: false });
    {
      const agenda = alocar([7], minimoFuturo);
      criarEvento(idProfessorDemo, "PENDENTE", agenda, { passado: false });
    }
    // os demais: 134 passados, 6 nos proximos 7 dias e 48 de 8 a 30 dias (3 pendentes e 2 recusados de professores)
    for (let i = 0; i < 134; i++) criarEvento(donoComum(), "APROVADO", alocar(diasPassados, null), { passado: true });
    for (let i = 0; i < 6; i++) criarEvento(donoComum(), "APROVADO", alocar(diasProximos, minimoFuturo), { passado: false });
    for (let i = 0; i < 3; i++) criarEvento(professorFicticio(), "PENDENTE", alocar(diasDistantes, minimoFuturo), { passado: false });
    for (let i = 0; i < 2; i++) criarEvento(professorFicticio(), "RECUSADO", alocar(diasDistantes, minimoFuturo), { passado: false });
    for (let i = 0; i < 43; i++) criarEvento(donoComum(), "APROVADO", alocar(diasDistantes, minimoFuturo), { passado: false });

    // ------------------------------------------------------------ inscricoes, check-in, questionario, certificado, avaliacao
    const inscricoes: {
      id: string;
      participanteId: string;
      eventoId: string;
      statusPresenca: "PENDENTE" | "SOLICITADO" | "PRESENTE" | "RECUSADO" | "AUSENTE";
      checkinSolicitadoEm: Date | null;
      dataCheckin: Date | null;
      usuarioId: string | null;
      dataInscricao: Date;
    }[] = [];
    const tentativas: { id: string; participanteId: string; eventoId: string; respostas: number[]; acertos: number; totalPerguntas: number; percentual: number; criadoEm: Date }[] = [];
    const certificados: {
      id: string;
      inscricaoId: string;
      codigoValidacao: string;
      nomeParticipante: string;
      rgm: string;
      tituloEvento: string;
      temaEvento: string;
      nomePalestrante: string;
      dataEvento: Date;
      cargaHoraria: number;
      emitidoEm: Date;
    }[] = [];
    const feedbacks: { id: string; eventoId: string; participanteId: string; nota: number; comentario: string; criadoEm: Date }[] = [];
    const codigosUsados = new Set<string>();
    const primeiraInscricao = new Map<string, Date>();
    const alunoDoParticipante = new Map(alunos.map((a) => [a.participanteId, a]));
    const rgmDoParticipante = new Map(participantes.map((p) => [p.id, p.rgm]));
    const nomeDoPalestrante = new Map(palestrantes.map((p) => [p.id, p.nome]));
    // mesma regra da API (inscricoes.service.ts: garantirSemConflitoDeHorario): o aluno nao fica inscrito em dois
    // eventos que se cruzam no horario; [inicio, fim) — encostar nao e conflito
    const agendaDoAluno = new Map<string, [number, number][]>();
    const alunoLivre = (participanteId: string, inicio: number, fim: number) =>
      (agendaDoAluno.get(participanteId) ?? []).every(([a, b]) => !(inicio < b && fim > a));

    // respostas com "acertos" questoes certas (as demais numa alternativa errada)
    function respostasCom(questionario: EventoGerado["questionario"], acertos: number) {
      const certas = new Set(embaralhar(questionario.map((_, i) => i)).slice(0, acertos));
      return questionario.map((pergunta, i) => {
        const correta = pergunta.alternativas.findIndex((a) => a.correta);
        return certas.has(i) ? correta : sortear([0, 1, 2, 3].filter((x) => x !== correta));
      });
    }

    for (const evento of eventos) {
      if (evento.situacao !== "APROVADO") continue;
      const quantidade = evento.apresentacao
        ? Math.min(35, evento.capacidade)
        : Math.round(evento.capacidade * (evento.passado ? entre(0.5, 0.95) : entre(0.2, 0.7)));
      const fim = new Date(evento.horario.getTime() + evento.cargaHoraria * HORA);
      const { abre, fecha } = janelaDoCheckin({ horario: evento.horario, cargaHoraria: evento.cargaHoraria });
      // quem decide o check-in: o professor do evento (ou a equipe); evento da equipe, secretaria ou administrador
      const quemDecide = () => (evento.criadoPorId && chance(0.7) ? evento.criadoPorId : equipeQueAprova());
      const percentualPresentes = entre(0.7, 0.85);
      const percentualRecusados = entre(0.02, 0.06);
      const inicioDoEvento = evento.horario.getTime();
      const escolhidos = embaralhar(participantes)
        .filter((p) => alunoLivre(p.id, inicioDoEvento, fim.getTime()))
        .slice(0, quantidade);
      for (const p of escolhidos) agendaDoAluno.set(p.id, [...(agendaDoAluno.get(p.id) ?? []), [inicioDoEvento, fim.getTime()]]);
      const limiteInscricao = minData(new Date(evento.horario.getTime() - HORA), new Date(agora.getTime() - 5 * MIN));

      escolhidos.forEach((participante, posicao) => {
        const dataInscricao = entreDatas(new Date(evento.aprovadoEm!.getTime() + 10 * MIN), limiteInscricao);
        const anterior = primeiraInscricao.get(participante.id);
        if (!anterior || dataInscricao < anterior) primeiraInscricao.set(participante.id, dataInscricao);
        const inscricao = {
          id: randomUUID(),
          participanteId: participante.id,
          eventoId: evento.id,
          statusPresenca: "PENDENTE" as (typeof inscricoes)[number]["statusPresenca"],
          checkinSolicitadoEm: null as Date | null,
          dataCheckin: null as Date | null,
          usuarioId: null as string | null,
          dataInscricao,
        };
        inscricoes.push(inscricao);

        // evento da apresentacao: 12 ja pediram o check-in entre 20:00 e 20:15 do dia, pra aprovacao ao vivo
        if (evento.apresentacao) {
          if (posicao < 12) {
            inscricao.statusPresenca = "SOLICITADO";
            inscricao.checkinSolicitadoEm = new Date(dataSP(...diaDoEvento(evento.horario), 20, 0).getTime() + inteiro(0, 15 * 60) * 1000);
          }
          return;
        }
        if (!evento.passado) return;

        // eventos passados: presentes, alguns recusados e o resto ausente (nao pediu a tempo)
        const sorteio = aleatorio();
        if (sorteio >= percentualPresentes + percentualRecusados) {
          inscricao.statusPresenca = "AUSENTE";
          return;
        }
        const pedido = entreDatas(abre, minData(new Date(evento.horario.getTime() + Math.min(60, evento.cargaHoraria * 30) * MIN), new Date(agora.getTime() - 10 * MIN)));
        const decisao = minData(new Date(pedido.getTime() + inteiro(2, 45) * MIN), new Date(fecha.getTime() - MIN), new Date(agora.getTime() - MIN));
        inscricao.checkinSolicitadoEm = pedido;
        inscricao.dataCheckin = maxData(decisao, new Date(pedido.getTime() + MIN));
        inscricao.usuarioId = quemDecide();
        if (sorteio >= percentualPresentes) {
          inscricao.statusPresenca = "RECUSADO";
          return;
        }
        inscricao.statusPresenca = "PRESENTE";

        // questionario: a maioria responde; uns 80% aprovam (no maximo 2 tentativas; aprovou, para)
        if (!chance(0.85)) return;
        const aprova = chance(0.8);
        const resultados: number[] = aprova
          ? chance(0.75)
            ? [sortearPeso([[6, 2], [7, 3], [8, 4], [9, 3], [10, 2]])]
            : [inteiro(2, 5), sortearPeso([[6, 3], [7, 4], [8, 3], [9, 1]])]
          : chance(0.6)
            ? [inteiro(2, 5), inteiro(2, 5)]
            : [inteiro(2, 5)];
        let momento = inscricao.dataCheckin;
        let aprovadoEm: Date | null = null;
        for (const acertos of resultados.slice(0, MAX_TENTATIVAS_QUESTIONARIO)) {
          momento = minData(new Date(momento.getTime() + inteiro(15, 48 * 60) * MIN), new Date(agora.getTime() - MIN));
          const percentual = Math.round((acertos / evento.questionario.length) * 100);
          tentativas.push({
            id: randomUUID(),
            participanteId: participante.id,
            eventoId: evento.id,
            respostas: respostasCom(evento.questionario, acertos),
            acertos,
            totalPerguntas: evento.questionario.length,
            percentual,
            criadoEm: momento,
          });
          if (percentual >= PERCENTUAL_APROVACAO) {
            aprovadoEm = momento;
            break;
          }
        }
        if (!aprovadoEm) return;

        // certificado: mesma logica do sistema (codigo aleatorio de 12 simbolos e copia do que vai impresso)
        const aluno = alunoDoParticipante.get(participante.id)!;
        let codigoValidacao: string;
        do codigoValidacao = gerarCodigoValidacao();
        while (codigosUsados.has(codigoValidacao));
        codigosUsados.add(codigoValidacao);
        const emitidoEm = minData(new Date(aprovadoEm.getTime() + inteiro(1, 72 * 60) * MIN), new Date(agora.getTime() - MIN));
        certificados.push({
          id: randomUUID(),
          inscricaoId: inscricao.id,
          codigoValidacao,
          nomeParticipante: aluno.nome,
          rgm: rgmDoParticipante.get(participante.id)!,
          tituloEvento: evento.titulo,
          temaEvento: evento.tema,
          nomePalestrante: nomeDoPalestrante.get(evento.palestranteId)!,
          dataEvento: evento.horario,
          cargaHoraria: evento.cargaHoraria,
          emitidoEm,
        });

        // avaliacao: so quem tem direito ao certificado (regra do sistema); uns 40% dos presentes
        if (!chance(0.59)) return;
        const nota = sortearPeso([[5, 40], [4, 33], [3, 17], [2, 7], [1, 3]]);
        feedbacks.push({
          id: randomUUID(),
          eventoId: evento.id,
          participanteId: participante.id,
          nota,
          comentario: sortear(dados.COMENTARIOS[nota]),
          criadoEm: minData(new Date(maxData(fim, emitidoEm).getTime() + inteiro(10, 72 * 60) * MIN), new Date(agora.getTime() - MIN)),
        });
      });
    }

    // conta do aluno criada entre julho e o inicio das inscricoes dele, com o aceite na mesma data
    for (const aluno of alunos) {
      const primeira = primeiraInscricao.get(aluno.participanteId);
      const ate = primeira ? new Date(primeira.getTime() - 2 * HORA) : new Date(agora.getTime() - DIA);
      const criadoEm = entreDatas(dataSP(2026, 7, 1, 8), maxData(dataSP(2026, 7, 1, 9), ate));
      aluno.criadoEm = criadoEm;
      aluno.consentimentoLgpdEm = criadoEm;
      const participante = participantes.find((p) => p.id === aluno.participanteId)!;
      participante.criadoEm = criadoEm;
    }

    // ------------------------------------------------------------ conferencias antes de gravar
    const problemas: string[] = [];
    const ativos = eventos.filter((e) => e.situacao !== "RECUSADO");
    for (const a of ativos) {
      for (const b of ativos) {
        if (a.id >= b.id || a.salaId !== b.salaId) continue;
        const fimA = a.horario.getTime() + a.cargaHoraria * HORA;
        const fimB = b.horario.getTime() + b.cargaHoraria * HORA;
        if (a.horario.getTime() < fimB && fimA > b.horario.getTime()) problemas.push("conflito de sala entre dois eventos");
      }
    }
    for (const evento of eventos) {
      const total = inscricoes.filter((i) => i.eventoId === evento.id).length;
      if (total > evento.capacidade) problemas.push(`evento com ${total} inscritos acima da capacidade ${evento.capacidade}`);
      const hora = partesSP(evento.horario).hora;
      if (hora < 8 || hora > 21) problemas.push("evento fora do horário de 8h a 21h");
    }
    if (new Set(inscricoes.map((i) => `${i.participanteId}:${i.eventoId}`)).size !== inscricoes.length) problemas.push("inscrição repetida");
    // nenhum aluno com duas inscricoes em horarios que se cruzam (regra da API)
    const eventoPorId = new Map(eventos.map((e) => [e.id, e]));
    const porAluno = new Map<string, [number, number][]>();
    for (const i of inscricoes) {
      const e = eventoPorId.get(i.eventoId)!;
      porAluno.set(i.participanteId, [...(porAluno.get(i.participanteId) ?? []), [e.horario.getTime(), e.horario.getTime() + e.cargaHoraria * HORA]]);
    }
    for (const intervalos of porAluno.values()) {
      const ordenados = [...intervalos].sort((a, b) => a[0] - b[0]);
      for (let k = 1; k < ordenados.length; k++) if (ordenados[k][0] < ordenados[k - 1][1]) problemas.push("aluno inscrito em dois eventos no mesmo horário");
    }
    // salas no padrao da UMC, sem codigo repetido, com 8 salas de aula, 2 laboratorios e 2 auditorios
    if (salas.some((sala) => !REGEX_CODIGO_SALA.test(sala.nome))) problemas.push("sala com código fora do padrão da UMC");
    if (new Set(salas.map((sala) => sala.nome)).size !== salas.length) problemas.push("código de sala repetido");
    const porTipo = (tipo: string) => salas.filter((sala) => sala.tipo === tipo).length;
    if (porTipo("SALA_DE_AULA") !== 8 || porTipo("LABORATORIO") !== 2 || porTipo("AUDITORIO") !== 2) problemas.push("tipos de sala fora do combinado");
    if (new Set(usuarios.map((u) => u.emailLogin)).size !== usuarios.length) problemas.push("e-mail repetido");
    if (new Set(participantes.map((p) => p.rgm)).size !== participantes.length) problemas.push("RGM repetido");
    const textos = JSON.stringify([salas, palestrantes, usuarios.map((u) => [u.nome, u.emailLogin]), eventos.map((e) => [e.titulo, e.tema, e.questionario, e.motivoRecusa]), feedbacks.map((f) => f.comentario)]);
    const normalizado = semAcento(textos).toLowerCase();
    for (const palavra of PALAVRAS_PROIBIDAS) if (normalizado.includes(palavra)) problemas.push(`a palavra "${palavra}" aparece nos dados gerados`);
    if (problemas.length > 0) throw new Error(`a carga gerada não passou nas conferências: ${[...new Set(problemas)].join("; ")}`);

    const contagem = {
      salas: salas.length,
      palestrantes: palestrantes.length,
      "contas (3 de demonstração + professores e alunos fictícios)": 3 + usuarios.length,
      "professores fictícios": professores.length,
      "alunos fictícios": alunos.length,
      eventos: eventos.length,
      "eventos passados": eventos.filter((e) => e.passado).length,
      "eventos nos próximos 7 dias": eventos.filter((e) => !e.passado && e.horario < diaSP(8)).length,
      "eventos de 8 a 30 dias": eventos.filter((e) => !e.passado && e.horario >= diaSP(8)).length,
      "eventos pendentes / recusados": `${eventos.filter((e) => e.situacao === "PENDENTE").length} / ${eventos.filter((e) => e.situacao === "RECUSADO").length}`,
      "histórico de aprovação": historico.length,
      inscrições: inscricoes.length,
      "presentes / recusados / ausentes": `${inscricoes.filter((i) => i.statusPresenca === "PRESENTE").length} / ${inscricoes.filter((i) => i.statusPresenca === "RECUSADO").length} / ${inscricoes.filter((i) => i.statusPresenca === "AUSENTE").length}`,
      "pedidos de check-in no evento da apresentação": inscricoes.filter((i) => i.statusPresenca === "SOLICITADO").length,
      "tentativas do questionário": tentativas.length,
      certificados: certificados.length,
      avaliações: feedbacks.length,
    };
    console.log(`${PREFIXO} o que será criado:`);
    for (const [nome, valor] of Object.entries(contagem)) console.log(`  - ${nome}: ${valor}`);
    const apresentacao = eventos.find((e) => e.apresentacao)!;
    const p = partesSP(apresentacao.horario);
    console.log(
      `${PREFIXO} evento da apresentação: ${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}/${p.ano} às ${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}, ` +
        `${inscricoes.filter((i) => i.eventoId === apresentacao.id).length} inscritos, 12 pedidos de check-in`,
    );

    const tabelas = {
      certificado: prisma.certificado,
      feedback: prisma.feedback,
      tentativaQuestionario: prisma.tentativaQuestionario,
      inscricao: prisma.inscricao,
      propostaAlteracao: prisma.propostaAlteracao,
      historicoAprovacao: prisma.historicoAprovacao,
      evento: prisma.evento,
      palestrante: prisma.palestrante,
      sala: prisma.sala,
      solicitacaoTitular: prisma.solicitacaoTitular,
      codigoRecuperacaoMfa: prisma.codigoRecuperacaoMfa,
      recuperacaoSenha: prisma.recuperacaoSenha,
      primeiroAcesso: prisma.primeiroAcesso,
      logAuditoria: prisma.logAuditoria,
      usuario: prisma.usuario,
      participante: prisma.participante,
      cadastroPendente: prisma.cadastroPendente,
      limiteAcesso: prisma.limiteAcesso,
    } as const;
    console.log(`${PREFIXO} o que será apagado (registros atuais):`);
    for (const [nome, delegado] of Object.entries(tabelas)) {
      console.log(`  - ${nome}: ${await (delegado as unknown as { count: () => Promise<number> }).count()}`);
    }

    if (!aplicar) {
      console.log(`${PREFIXO} simulação concluída — rode de novo com --aplicar para apagar e carregar`);
      return;
    }
    if (!senhas) return;

    // ------------------------------------------------------------ copia de seguranca (sem ela, nada e apagado)
    const pasta = resolve(__dirname, "..", "backups");
    const arquivo = resolve(pasta, `backup-${carimbo(agora)}.json`);
    try {
      const copia: Record<string, unknown[]> = {};
      for (const [nome, delegado] of Object.entries(tabelas)) {
        copia[nome] = await (delegado as unknown as { findMany: () => Promise<unknown[]> }).findMany();
      }
      mkdirSync(pasta, { recursive: true });
      writeFileSync(arquivo, JSON.stringify({ geradoEm: agora.toISOString(), banco, tabelas: copia }));
      console.log(`${PREFIXO} cópia de segurança salva em backend/backups/${arquivo.split(/[\\/]/).pop()}`);
    } catch (erro) {
      console.error(`${PREFIXO} a cópia de segurança falhou: ${erro instanceof Error ? erro.message : erro}`);
      console.error(`${PREFIXO} nada foi apagado.`);
      process.exitCode = 1;
      return;
    }

    // ------------------------------------------------------------ apaga tudo (ordem das chaves estrangeiras)
    for (const [nome, delegado] of Object.entries(tabelas)) {
      const { count } = await (delegado as unknown as { deleteMany: () => Promise<{ count: number }> }).deleteMany();
      console.log(`${PREFIXO} apagado: ${nome} (${count})`);
    }

    // ------------------------------------------------------------ grava em lotes
    async function emLotes<T>(nome: string, linhas: T[], gravar: (lote: T[]) => Promise<unknown>) {
      for (let i = 0; i < linhas.length; i += TAMANHO_DO_LOTE) {
        await gravar(linhas.slice(i, i + TAMANHO_DO_LOTE));
        console.log(`${PREFIXO} ${nome}: ${Math.min(i + TAMANHO_DO_LOTE, linhas.length)}/${linhas.length}`);
      }
    }
    await contas.garantirContasDeDemonstracao(prisma, senhas, inicioDaCarga, { admin: idAdmin, secretaria: idSecretaria, professor: idProfessorDemo });
    console.log(`${PREFIXO} contas de demonstração: 3`);
    await emLotes("salas", salas, (lote) => prisma.sala.createMany({ data: lote }));
    await emLotes("palestrantes", palestrantes, (lote) => prisma.palestrante.createMany({ data: lote }));
    await emLotes("participantes", participantes, (lote) => prisma.participante.createMany({ data: lote }));
    await emLotes("contas fictícias", usuarios, (lote) => prisma.usuario.createMany({ data: lote }));
    await emLotes("eventos", eventos, (lote) =>
      prisma.evento.createMany({
        data: lote.map((e) => ({
          id: e.id,
          titulo: e.titulo,
          tema: e.tema,
          horario: e.horario,
          cargaHoraria: e.cargaHoraria,
          salaId: e.salaId,
          palestranteId: e.palestranteId,
          questionario: e.questionario,
          criadoEm: e.criadoEm,
          situacao: e.situacao,
          motivoRecusa: e.motivoRecusa,
          criadoPorId: e.criadoPorId,
        })),
      }),
    );
    await emLotes("histórico de aprovação", historico, (lote) => prisma.historicoAprovacao.createMany({ data: lote }));
    await emLotes("inscrições", inscricoes, (lote) => prisma.inscricao.createMany({ data: lote }));
    await emLotes("tentativas do questionário", tentativas, (lote) => prisma.tentativaQuestionario.createMany({ data: lote }));
    await emLotes("certificados", certificados, (lote) => prisma.certificado.createMany({ data: lote }));
    await emLotes("avaliações", feedbacks, (lote) => prisma.feedback.createMany({ data: lote }));

    // auditoria: comeca vazia, so com o registro desta carga (quantidades, nenhum dado pessoal)
    await prisma.logAuditoria.create({
      data: {
        id: randomUUID(),
        usuarioId: null,
        atorNome: "Carga de demonstração",
        acao: "CARGA_DEMONSTRACAO",
        detalhe:
          `carga de demonstração executada: ${salas.length} salas, ${palestrantes.length} palestrantes, ${professores.length} professores e ` +
          `${alunos.length} alunos fictícios, 3 contas de demonstração, ${eventos.length} eventos, ${inscricoes.length} inscrições, ` +
          `${tentativas.length} tentativas do questionário, ${certificados.length} certificados e ${feedbacks.length} avaliações`,
      },
    });
    console.log(`${PREFIXO} concluída em ${((Date.now() - inicioDaExecucao) / 1000).toFixed(1)} s`);
  } finally {
    await prisma.$disconnect();
  }
}

// [ano, mes, dia] (Sao Paulo) de um instante
function diaDoEvento(data: Date): [number, number, number] {
  const p = partesSP(data);
  return [p.ano, p.mes, p.dia];
}

main().catch((erro) => {
  console.error(`${PREFIXO} erro:`, erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
