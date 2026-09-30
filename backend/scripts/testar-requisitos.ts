// testes ponta a ponta dos requisitos do sistema (docs/funcionalidades-principais.md e
// docs/api-contract.md) contra o banco de DESENVOLVIMENTO — se recusa a rodar se o DATABASE_URL
// nao for o SGEA_dev. Sobe o backend numa porta local, cria os proprios dados de teste (contas,
// salas, palestrantes, eventos), faz as chamadas HTTP de verdade e apaga tudo no final (logs de
// auditoria ficam, como em qualquer operacao).
//
// como rodar (de dentro de backend/):  npx tsx scripts/testar-requisitos.ts
import "dotenv/config";
import { randomUUID } from "crypto";
import type { AddressInfo } from "net";
import bcrypt from "bcryptjs";

if (!process.env.DATABASE_URL?.includes("SGEA_dev")) {
  console.error("[testar-requisitos] recusado: DATABASE_URL não aponta pro SGEA_dev");
  process.exit(1);
}

type Perfil = "ADMINISTRADOR" | "SECRETARIA" | "ALUNO";
interface Conta {
  id: string;
  email: string;
  senha: string;
  perfil: Perfil;
  participanteId: string | null;
  token?: string;
}
interface Resposta {
  status: number;
  // corpo JSON solto de proposito: o teste confere campo a campo
  corpo: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

let base = "";
const resultados: { requisito: string; nome: string; ok: boolean }[] = [];
let requisitoAtual = "";

function requisito(codigo: string) {
  requisitoAtual = codigo;
  console.log(`\n[${codigo}]`);
}

function checar(nome: string, ok: boolean, detalhe?: unknown) {
  resultados.push({ requisito: requisitoAtual, nome, ok });
  console.log(`  ${ok ? "OK    " : "FALHOU"} ${nome}${!ok && detalhe !== undefined ? `  -> ${JSON.stringify(detalhe).slice(0, 300)}` : ""}`);
}

async function chamar(metodo: string, caminho: string, opcoes: { token?: string; corpo?: unknown } = {}): Promise<Resposta> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opcoes.token) headers.Authorization = `Bearer ${opcoes.token}`;
  const res = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers,
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
  });
  const texto = await res.text();
  let corpo: unknown;
  try {
    corpo = texto ? JSON.parse(texto) : undefined;
  } catch {
    corpo = texto;
  }
  return { status: res.status, corpo };
}

// 10 perguntas, alternativa 0 sempre a correta
function questionario(qtd = 10, corretasNaPrimeira = 1) {
  return Array.from({ length: qtd }, (_, i) => ({
    id: `p${i + 1}`,
    enunciado: `Pergunta ${i + 1}`,
    alternativas: Array.from({ length: 4 }, (_, j) => ({
      texto: `Alternativa ${j + 1}`,
      correta: i === 0 ? j < corretasNaPrimeira : j === 0,
    })),
  }));
}

function rgmAleatorio(): string {
  return `9${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;
}

async function main() {
  const { criarApp } = await import("../src/expressApp");
  const { prisma } = await import("../src/db/prisma");
  const { indiceBusca } = await import("../src/utils/criptografia");
  const { gerarHashSenha } = await import("../src/utils/password");

  // o limite de tentativas por IP (bloco 2) conta os logins errados de proposito deste teste, que
  // sempre saem do 127.0.0.1: zera o contador desse IP no comeco e no fim (so no banco de dev)
  const limparContadorDoIpLocal = () => prisma.limiteAcesso.deleteMany({ where: { chave: { contains: "127.0.0.1" } } });
  await limparContadorDoIpLocal();

  const servidor = criarApp().listen(0);
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`;

  const contas: Conta[] = [];
  const salas: string[] = [];
  const palestrantes: string[] = [];
  const eventos: string[] = [];
  const sufixo = randomUUID().slice(0, 8);

  // conta de equipe criada direto no banco (nao existe cadastro publico de equipe). De proposito no
  // FORMATO ANTIGO (nome/e-mail cifrados, hash de senha com custo 10), igual as contas que ja existem
  // em producao antes da conversao — o teste confere que elas continuam funcionando
  async function criarEquipeFormatoAntigo(perfil: "ADMINISTRADOR" | "SECRETARIA"): Promise<Conta> {
    const email = `req-${perfil.toLowerCase()}-${sufixo}@teste.invalido`;
    const senha = "SenhaEquipe123";
    const { criptografar } = await import("../src/utils/criptografia");
    const usuario = await prisma.usuario.create({
      data: {
        id: randomUUID(),
        nome: criptografar(`Teste Requisitos ${perfil}`),
        emailLogin: criptografar(email),
        emailLoginHash: indiceBusca(email),
        senhaHash: await bcrypt.hash(senha, 10),
        perfil,
      },
    });
    const conta = { id: usuario.id, email, senha, perfil, participanteId: null };
    contas.push(conta);
    return conta;
  }

  // login completo (as contas do teste nao ativam 2FA, entao a senha basta)
  async function entrar(conta: Conta): Promise<string> {
    const r = await chamar("POST", "/auth/login", { corpo: { emailLogin: conta.email, senha: conta.senha } });
    if (r.status !== 200 || !r.corpo.token) throw new Error(`login falhou (${r.status}): ${JSON.stringify(r.corpo)}`);
    return r.corpo.token as string;
  }

  try {
    const admin = await criarEquipeFormatoAntigo("ADMINISTRADOR");
    const secretaria = await criarEquipeFormatoAntigo("SECRETARIA");

    // ------------------------------------------------------------------ B: senha com hash e salt
    requisito("R20 Senha com bcrypt, salt por senha e rehash no login");
    const hashAntes = (await prisma.usuario.findUnique({ where: { id: admin.id } }))!.senhaHash;
    checar("conta antiga começa com hash de custo 10", hashAntes.startsWith("$2a$10$"), hashAntes.slice(0, 7));
    let r = await chamar("POST", "/auth/login", { corpo: { emailLogin: admin.email, senha: admin.senha } });
    checar("equipe sem 2FA entra direto com a senha (2FA não é mais obrigatório)", r.status === 200 && !!r.corpo.token && !r.corpo.mfa, r.corpo);
    admin.token = r.corpo.token;
    const hashDepois = (await prisma.usuario.findUnique({ where: { id: admin.id } }))!.senhaHash;
    checar("login refaz o hash com custo 12, sem trocar a senha", hashDepois.startsWith("$2a$12$") && hashDepois !== hashAntes, hashDepois.slice(0, 7));
    checar("a mesma senha continua valendo com o hash novo", await bcrypt.compare(admin.senha, hashDepois));
    checar(
      "rehash registrado na auditoria",
      !!(await prisma.logAuditoria.findFirst({ where: { usuarioId: admin.id, acao: "SENHA_HASH_ATUALIZADO", detalhe: { contains: "custo 10 → 12" } } })),
    );
    secretaria.token = await entrar(secretaria);
    const hashSecretaria = (await prisma.usuario.findUnique({ where: { id: secretaria.id } }))!.senhaHash;
    checar(
      "mesma senha em duas contas gera hashes diferentes (salt aleatório embutido)",
      hashSecretaria !== hashDepois && hashSecretaria.slice(7, 29) !== hashDepois.slice(7, 29),
    );

    // ------------------------------------------------------------------ cadastro e login
    requisito("R01 Cadastro público de aluno");
    const emailAluno = `req.aluno.${sufixo}@alunos.umc.br`;
    const rgmAluno = rgmAleatorio();
    const cadastroValido = { nomeCompleto: "Aluno Teste Requisitos", rgm: rgmAluno, emailInstitucional: emailAluno, senha: "SenhaAluno123", aceiteLgpd: true };
    r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroValido, nomeCompleto: "Aluno 123" } });
    checar("nome com número -> 422", r.status === 422, r.corpo);
    checar(
      "erro de validação indica o campo (pro formulário marcar o campo certo)",
      Array.isArray(r.corpo.erros) && r.corpo.erros.some((e: { campo: string }) => e.campo === "nomeCompleto"),
      r.corpo,
    );
    r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroValido, rgm: "1234567890" } });
    checar("RGM com 10 dígitos -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroValido, emailInstitucional: `x.${sufixo}@gmail.com` } });
    checar("e-mail fora do domínio institucional -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroValido, senha: "1234567" } });
    checar("senha com 7 caracteres -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroValido, aceiteLgpd: false } });
    checar("sem aceite dos termos -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/auth/registro", { corpo: cadastroValido });
    checar("cadastro válido -> 201, sem senha na resposta", r.status === 201 && r.corpo.senhaHash === undefined && r.corpo.perfil === "ALUNO", r.corpo);
    const aluno: Conta = { id: r.corpo.id, email: emailAluno, senha: "SenhaAluno123", perfil: "ALUNO", participanteId: r.corpo.participanteId };
    contas.push(aluno);
    r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroValido, rgm: rgmAleatorio() } });
    checar("e-mail já cadastrado -> 409", r.status === 409, r.corpo);
    r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroValido, emailInstitucional: `outro.${sufixo}@alunos.umc.br` } });
    checar("RGM já cadastrado -> 409", r.status === 409, r.corpo);

    const emailAluno2 = `req.aluno2.${sufixo}@alunos.umc.br`;
    r = await chamar("POST", "/auth/registro", {
      corpo: { nomeCompleto: "Segundo Aluno Teste", rgm: rgmAleatorio(), emailInstitucional: emailAluno2, senha: "SenhaAluno456", aceiteLgpd: true },
    });
    const aluno2: Conta = { id: r.corpo.id, email: emailAluno2, senha: "SenhaAluno456", perfil: "ALUNO", participanteId: r.corpo.participanteId };
    contas.push(aluno2);

    requisito("R02 Login");
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: emailAluno, senha: "SenhaAluno123" } });
    checar("aluno com senha certa -> sessão", r.status === 200 && !!r.corpo.token, r.corpo);
    aluno.token = r.corpo.token;
    aluno2.token = await entrar(aluno2);
    const senhaErrada = await chamar("POST", "/auth/login", { corpo: { emailLogin: emailAluno, senha: "errada123" } });
    const emailInexistente = await chamar("POST", "/auth/login", { corpo: { emailLogin: `nao.existe.${sufixo}@alunos.umc.br`, senha: "qualquer1" } });
    checar(
      "senha errada e e-mail inexistente -> mesmo 401 genérico",
      senhaErrada.status === 401 && emailInexistente.status === 401 && senhaErrada.corpo.message === emailInexistente.corpo.message,
      [senhaErrada.corpo, emailInexistente.corpo],
    );

    requisito("R03 Dados da própria conta");
    r = await chamar("GET", "/usuarios/me", { token: aluno.token });
    checar("GET /usuarios/me devolve a própria conta", r.status === 200 && r.corpo.id === aluno.id && r.corpo.emailLogin === emailAluno, r.corpo);

    // ------------------------------------------------------------------ G: nome/e-mail/RGM sem criptografia
    requisito("R24 Nome, e-mail e RGM em texto puro (transição sem quebrar os registros antigos)");
    const usuarioNoBanco = await prisma.usuario.findUnique({ where: { id: aluno.id } });
    const participanteNoBanco = await prisma.participante.findUnique({ where: { id: aluno.participanteId! } });
    checar(
      "cadastro novo grava nome, e-mail e RGM em texto puro",
      usuarioNoBanco?.nome === "Aluno Teste Requisitos" &&
        usuarioNoBanco.emailLogin === emailAluno &&
        usuarioNoBanco.rgm === rgmAluno &&
        participanteNoBanco?.email === emailAluno &&
        participanteNoBanco.rgm === rgmAluno,
    );
    checar("senha continua só como hash bcrypt", usuarioNoBanco?.senhaHash.startsWith("$2a$12$") === true && usuarioNoBanco.senhaHash !== "SenhaAluno123");
    const adminNoBanco = await prisma.usuario.findUnique({ where: { id: admin.id } });
    r = await chamar("GET", "/usuarios/me", { token: admin.token });
    checar(
      "conta ainda no formato antigo (cifrado) continua sendo lida normalmente",
      adminNoBanco?.nome !== "Teste Requisitos ADMINISTRADOR" && r.corpo.nome === "Teste Requisitos ADMINISTRADOR" && r.corpo.emailLogin === admin.email,
      r.corpo,
    );
    const logCadastro = await prisma.logAuditoria.findFirst({ where: { usuarioId: aluno.id, acao: "USUARIO_REGISTRADO" } });
    checar("log novo guarda o nome do responsável em texto puro (atorNome)", logCadastro?.atorNome === "Aluno Teste Requisitos" && logCadastro.atorNomeCifrado === null);

    requisito("R04 Permissões por perfil (aluno barrado nas rotas da equipe)");
    for (const [metodo, caminho] of [
      ["GET", "/participantes"],
      ["POST", "/salas"],
      ["GET", "/logs-auditoria"],
      ["GET", "/questionario-tentativas"],
      ["GET", "/usuarios"],
    ] as const) {
      r = await chamar(metodo, caminho, { token: aluno.token, corpo: metodo === "POST" ? { nome: "x", capacidade: 1 } : undefined });
      checar(`aluno em ${metodo} ${caminho} -> 403`, r.status === 403, r.status);
    }
    r = await chamar("GET", "/eventos");
    checar("sem token -> 401", r.status === 401, r.status);

    // ------------------------------------------------------------------ salas, palestrantes, eventos
    requisito("R05 Salas");
    r = await chamar("POST", "/salas", { token: admin.token, corpo: { nome: `Sala Teste ${sufixo}`, capacidade: 0 } });
    checar("capacidade zero -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/salas", { token: admin.token, corpo: { nome: `Sala Teste ${sufixo}`, capacidade: 2 } });
    checar("equipe cria sala -> 201", r.status === 201, r.corpo);
    const salaId: string = r.corpo.id;
    salas.push(salaId);
    r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: `Sala Pequena ${sufixo}`, capacidade: 1 } });
    const salaPequenaId: string = r.corpo.id;
    salas.push(salaPequenaId);
    r = await chamar("PUT", `/salas/${salaId}`, { token: secretaria.token, corpo: { nome: `Sala Teste Editada ${sufixo}` } });
    checar("secretaria edita sala -> 200", r.status === 200 && r.corpo.nome.startsWith("Sala Teste Editada"), r.corpo);
    r = await chamar("GET", "/salas", { token: aluno.token });
    checar("aluno lê salas", r.status === 200 && Array.isArray(r.corpo), r.status);

    requisito("R06 Palestrantes");
    const emailPalestrante = `palestrante.${sufixo}@teste.invalido`;
    r = await chamar("POST", "/palestrantes", { token: admin.token, corpo: { nome: "Palestrante 2", email: emailPalestrante } });
    checar("nome com número -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/palestrantes", { token: admin.token, corpo: { nome: "Palestrante Teste", email: "sem-arroba" } });
    checar("e-mail inválido -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/palestrantes", { token: admin.token, corpo: { nome: "Palestrante Teste", email: emailPalestrante } });
    checar("equipe cria palestrante -> 201", r.status === 201, r.corpo);
    const palestranteId: string = r.corpo.id;
    palestrantes.push(palestranteId);
    r = await chamar("POST", "/palestrantes", { token: admin.token, corpo: { nome: "Outro Palestrante", email: emailPalestrante } });
    checar("e-mail de palestrante duplicado -> 409", r.status === 409, r.corpo);
    r = await chamar("GET", `/palestrantes/${palestranteId}`, { token: aluno.token });
    checar("aluno vê só id e nome do palestrante (sem e-mail)", r.status === 200 && r.corpo.nome && r.corpo.email === undefined, r.corpo);
    r = await chamar("GET", `/palestrantes/${palestranteId}`, { token: secretaria.token });
    checar("equipe vê o e-mail do palestrante", r.corpo.email === emailPalestrante, r.corpo);

    requisito("R07 Eventos e questionário obrigatório");
    const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const eventoBase = { titulo: `Evento Teste ${sufixo}`, horario: amanha, salaId, palestranteId, tema: "Tema de teste", cargaHoraria: 2 };
    r = await chamar("POST", "/eventos", { token: admin.token, corpo: { ...eventoBase, questionario: questionario(9) } });
    checar("questionário com 9 perguntas -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/eventos", { token: admin.token, corpo: { ...eventoBase, questionario: questionario(10, 2) } });
    checar("pergunta com 2 alternativas corretas -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/eventos", { token: admin.token, corpo: { ...eventoBase, salaId: randomUUID(), questionario: questionario() } });
    checar("sala inexistente -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/eventos", { token: admin.token, corpo: { ...eventoBase, questionario: questionario() } });
    checar("equipe cria evento válido -> 201", r.status === 201, r.corpo);
    const eventoId: string = r.corpo.id;
    eventos.push(eventoId);
    r = await chamar("POST", "/eventos", { token: admin.token, corpo: { ...eventoBase, titulo: `Evento Lotado ${sufixo}`, salaId: salaPequenaId, questionario: questionario() } });
    const eventoLotadoId: string = r.corpo.id;
    eventos.push(eventoLotadoId);
    r = await chamar("GET", `/eventos/${eventoId}`, { token: aluno.token });
    checar(
      "aluno recebe o evento sem o gabarito",
      r.status === 200 && r.corpo.questionario.every((p: { alternativas: { correta?: boolean }[] }) => p.alternativas.every((a) => a.correta === undefined)),
      r.corpo.questionario?.[0],
    );
    r = await chamar("GET", `/eventos/${eventoId}`, { token: secretaria.token });
    checar("equipe recebe o gabarito", r.corpo.questionario?.[0]?.alternativas?.[0]?.correta === true, r.corpo.questionario?.[0]);
    r = await chamar("PUT", `/eventos/${eventoId}`, { token: secretaria.token, corpo: { tema: "Tema editado" } });
    checar("equipe edita evento -> 200", r.status === 200 && r.corpo.tema === "Tema editado", r.corpo);
    r = await chamar("POST", "/eventos", { token: aluno.token, corpo: { ...eventoBase, questionario: questionario() } });
    checar("aluno não cria evento -> 403", r.status === 403, r.status);
    r = await chamar("DELETE", `/salas/${salaId}`, { token: admin.token });
    checar("excluir sala com evento vinculado -> 409", r.status === 409, r.corpo);
    r = await chamar("DELETE", `/palestrantes/${palestranteId}`, { token: admin.token });
    checar("excluir palestrante com evento vinculado -> 409", r.status === 409, r.corpo);

    // ------------------------------------------------------------------ inscricoes e check-in
    requisito("R08 Autoinscrição do aluno");
    r = await chamar("POST", `/eventos/${eventoId}/inscricoes`, { token: aluno.token, corpo: { participanteId: aluno2.participanteId } });
    checar("aluno se inscreve -> 201 com o participanteId do próprio token", r.status === 201 && r.corpo.participanteId === aluno.participanteId, r.corpo);
    const inscricaoAluno: string = r.corpo.id;
    r = await chamar("POST", `/eventos/${eventoId}/inscricoes`, { token: aluno.token });
    checar("inscrição repetida -> 409 JA_INSCRITO", r.status === 409 && r.corpo.code === "JA_INSCRITO", r.corpo);
    r = await chamar("POST", `/eventos/${eventoLotadoId}/inscricoes`, { token: aluno2.token });
    checar("aluno 2 ocupa a única vaga -> 201", r.status === 201, r.corpo);
    r = await chamar("POST", `/eventos/${eventoLotadoId}/inscricoes`, { token: aluno.token });
    checar("evento sem vaga -> 409 EVENTO_LOTADO", r.status === 409 && r.corpo.code === "EVENTO_LOTADO", r.corpo);
    r = await chamar("POST", `/eventos/${eventoId}/inscricoes`, { token: secretaria.token });
    checar("equipe não usa a autoinscrição -> 403", r.status === 403, r.status);

    requisito("R09 Inscrição manual pela equipe");
    r = await chamar("POST", "/inscricoes", { token: secretaria.token, corpo: { participanteId: aluno2.participanteId, eventoId } });
    checar("secretaria inscreve aluno -> 201", r.status === 201, r.corpo);
    const inscricaoAluno2: string = r.corpo.id;
    r = await chamar("POST", "/inscricoes", { token: secretaria.token, corpo: { participanteId: aluno2.participanteId, eventoId } });
    checar("inscrição manual repetida -> 409", r.status === 409, r.corpo);
    r = await chamar("POST", "/inscricoes", { token: aluno.token, corpo: { participanteId: aluno.participanteId, eventoId: eventoLotadoId } });
    checar("aluno não usa a inscrição manual -> 403", r.status === 403, r.status);
    r = await chamar("GET", "/eventos", { token: aluno.token });
    const vistoPeloAluno = r.corpo.find((e: { id: string }) => e.id === eventoId);
    r = await chamar("GET", "/eventos", { token: secretaria.token });
    const vistoPelaEquipe = r.corpo.find((e: { id: string }) => e.id === eventoId);
    checar(
      "contagem de inscritos (Agenda) é a mesma pro aluno e pra equipe",
      vistoPeloAluno?.inscritos === 2 && vistoPelaEquipe?.inscritos === 2,
      [vistoPeloAluno?.inscritos, vistoPelaEquipe?.inscritos],
    );

    requisito("R10 Aluno só vê as próprias inscrições");
    r = await chamar("GET", `/inscricoes?participanteId=${aluno2.participanteId}`, { token: aluno.token });
    checar(
      "participanteId forjado na URL é ignorado",
      r.status === 200 && r.corpo.length > 0 && r.corpo.every((i: { participanteId: string }) => i.participanteId === aluno.participanteId),
      r.corpo,
    );

    requisito("R11 E-mail de confirmação da inscrição");
    r = await chamar("POST", `/inscricoes/${inscricaoAluno}/confirmacao-email`, { token: aluno.token });
    checar("dono da inscrição dispara o e-mail -> 200", r.status === 200 && r.corpo.destinatario === emailAluno, r.corpo);
    r = await chamar("POST", `/inscricoes/${inscricaoAluno2}/confirmacao-email`, { token: aluno.token });
    checar("inscrição de outra pessoa -> 403", r.status === 403, r.status);

    requisito("R12 Check-in");
    r = await chamar("PUT", `/inscricoes/${inscricaoAluno}`, { token: secretaria.token, corpo: { statusPresenca: "AUSENTE" } });
    checar("marcar ausente -> 200", r.status === 200 && r.corpo.statusPresenca === "AUSENTE", r.corpo);
    r = await chamar("PUT", `/inscricoes/${inscricaoAluno}`, { token: secretaria.token, corpo: { statusPresenca: "PRESENTE", usuarioId: aluno.id } });
    checar("confirmar presença grava quem fez o check-in (do token)", r.status === 200 && r.corpo.statusPresenca === "PRESENTE" && r.corpo.usuarioId === secretaria.id && !!r.corpo.dataCheckin, r.corpo);
    r = await chamar("PUT", `/inscricoes/${inscricaoAluno}`, { token: aluno.token, corpo: { statusPresenca: "PRESENTE" } });
    checar("aluno não faz check-in -> 403", r.status === 403, r.status);

    // ------------------------------------------------------------------ questionario e certificado
    requisito("R13 Questionário obrigatório");
    r = await chamar("GET", `/eventos/${eventoId}/questionario`, { token: aluno.token });
    checar("perguntas sem gabarito", r.status === 200 && r.corpo.length === 10 && r.corpo[0].alternativas[0].correta === undefined, r.corpo?.[0]);
    r = await chamar("POST", `/eventos/${eventoId}/questionario/respostas`, { token: aluno.token, corpo: { respostas: Array(10).fill(1) } });
    checar("tudo errado -> tentativa com 0%", r.status === 201 && r.corpo.percentual === 0, r.corpo);
    r = await chamar("POST", `/eventos/${eventoId}/questionario/respostas`, { token: aluno.token, corpo: { respostas: Array(10).fill(0) } });
    checar("tudo certo -> tentativa com 100% (correção no servidor)", r.status === 201 && r.corpo.percentual === 100, r.corpo);
    r = await chamar("POST", `/eventos/${eventoId}/questionario/respostas`, { token: aluno.token, corpo: { respostas: Array(10).fill(0) } });
    checar("já aprovado não refaz -> 409", r.status === 409, r.corpo);
    r = await chamar("GET", `/eventos/${eventoId}/questionario/tentativas`, { token: aluno.token });
    checar("aluno vê as próprias 2 tentativas", r.status === 200 && r.corpo.length === 2, r.corpo);
    r = await chamar("GET", "/questionario-tentativas", { token: secretaria.token });
    checar("equipe vê as tentativas de todos", r.status === 200 && r.corpo.some((t: { participanteId: string }) => t.participanteId === aluno.participanteId), r.status);
    r = await chamar("POST", `/eventos/${eventoLotadoId}/questionario/respostas`, { token: aluno.token, corpo: { respostas: Array(10).fill(0) } });
    checar("sem presença confirmada no evento não responde o questionário -> 403", r.status === 403, r);
    // aluno 2: presenca confirmada no evento, reprova 2x e esgota as tentativas
    await chamar("PUT", `/inscricoes/${inscricaoAluno2}`, { token: secretaria.token, corpo: { statusPresenca: "PRESENTE" } });
    await chamar("POST", `/eventos/${eventoId}/questionario/respostas`, { token: aluno2.token, corpo: { respostas: Array(10).fill(1) } });
    await chamar("POST", `/eventos/${eventoId}/questionario/respostas`, { token: aluno2.token, corpo: { respostas: Array(10).fill(2) } });
    r = await chamar("POST", `/eventos/${eventoId}/questionario/respostas`, { token: aluno2.token, corpo: { respostas: Array(10).fill(0) } });
    checar("terceira tentativa -> 409 LIMITE_TENTATIVAS_ATINGIDO", r.status === 409 && r.corpo.code === "LIMITE_TENTATIVAS_ATINGIDO", r.corpo);

    // ------------------------------------------------------------------ feedback
    requisito("R14 Feedback");
    r = await chamar("GET", "/feedbacks/elegiveis", { token: aluno.token });
    checar("evento com certificado aparece como elegível", r.status === 200 && r.corpo.some((e: { id: string }) => e.id === eventoId), r.corpo);
    r = await chamar("POST", "/feedbacks", { token: aluno2.token, corpo: { eventoId, nota: 4, comentario: "Sem certificado" } });
    checar("sem certificado não avalia -> 403", r.status === 403, r.corpo);
    r = await chamar("POST", "/feedbacks", { token: aluno.token, corpo: { eventoId, nota: 6, comentario: "Nota inválida" } });
    checar("nota fora de 1 a 5 -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/feedbacks", { token: aluno.token, corpo: { eventoId, participanteId: aluno2.participanteId, nota: 5, comentario: "Ótima palestra" } });
    checar("aluno com certificado avalia -> 201 (participanteId do token)", r.status === 201 && r.corpo.participanteId === aluno.participanteId, r.corpo);
    const feedbackId: string = r.corpo.id;
    r = await chamar("POST", "/feedbacks", { token: aluno.token, corpo: { eventoId, nota: 3, comentario: "De novo" } });
    checar("segundo feedback no mesmo evento -> 409", r.status === 409, r.corpo);
    r = await chamar("GET", "/feedbacks", { token: aluno2.token });
    checar("aluno não vê feedback de outra pessoa na lista", r.status === 200 && r.corpo.every((f: { participanteId: string }) => f.participanteId === aluno2.participanteId), r.corpo);
    r = await chamar("GET", `/feedbacks/${feedbackId}`, { token: aluno2.token });
    checar("aluno não abre feedback de outra pessoa -> 403", r.status === 403, r.status);
    r = await chamar("GET", `/feedbacks?eventoId=${eventoId}`, { token: secretaria.token });
    checar("equipe vê os feedbacks do evento", r.status === 200 && r.corpo.some((f: { id: string }) => f.id === feedbackId), r.status);

    // ------------------------------------------------------------------ D: feedback nao e editado
    requisito("R22 Feedback: sem edição; exclusão pelo aluno ou pela equipe com motivo");
    r = await chamar("PUT", `/feedbacks/${feedbackId}`, { token: aluno.token, corpo: { nota: 1 } });
    checar("aluno não edita o próprio feedback -> 403", r.status === 403, r.corpo);
    r = await chamar("PUT", `/feedbacks/${feedbackId}`, { token: secretaria.token, corpo: { comentario: "alterado" } });
    checar("equipe não edita feedback de aluno -> 403", r.status === 403, r.corpo);
    r = await chamar("GET", `/feedbacks/${feedbackId}`, { token: aluno.token });
    checar("o conteúdo continua o original", r.corpo.nota === 5 && r.corpo.comentario === "Ótima palestra", r.corpo);
    r = await chamar("POST", "/feedbacks", { token: secretaria.token, corpo: { eventoId, nota: 5, comentario: "Em nome do aluno" } });
    checar("equipe não escreve feedback em nome de aluno -> 403", r.status === 403, r.corpo);
    r = await chamar("DELETE", `/feedbacks/${feedbackId}`, { token: aluno2.token });
    checar("aluno não exclui feedback de outra pessoa -> 403", r.status === 403, r.corpo);
    r = await chamar("DELETE", `/feedbacks/${feedbackId}`, { token: aluno.token });
    checar("aluno exclui o próprio feedback -> 204", r.status === 204, r.corpo);
    checar(
      "auditoria FEEDBACK_EXCLUIDO indica que foi o próprio aluno",
      !!(await prisma.logAuditoria.findFirst({ where: { acao: "FEEDBACK_EXCLUIDO", usuarioId: aluno.id, detalhe: { contains: "pelo próprio aluno" } } })),
    );
    r = await chamar("GET", "/feedbacks/elegiveis", { token: aluno.token });
    checar("depois de excluir, o evento volta a aparecer pra avaliar", r.corpo.some((e: { id: string }) => e.id === eventoId), r.corpo);
    r = await chamar("POST", "/feedbacks", { token: aluno.token, corpo: { eventoId, nota: 4, comentario: "Avaliação corrigida" } });
    checar("e o aluno envia um novo feedback pro mesmo evento -> 201", r.status === 201, r.corpo);
    const feedbackNovoId: string = r.corpo.id;
    r = await chamar("DELETE", `/feedbacks/${feedbackNovoId}`, { token: secretaria.token });
    checar(
      "equipe excluir sem motivo -> 422 apontando o campo motivo",
      r.status === 422 && r.corpo.erros?.some((e: { campo: string; mensagem: string }) => e.campo === "motivo" && e.mensagem === "Selecione o motivo da exclusão."),
      r.corpo,
    );
    r = await chamar("DELETE", `/feedbacks/${feedbackNovoId}`, { token: secretaria.token, corpo: { motivo: "PORQUE_SIM" } });
    checar("motivo fora da lista -> 422", r.status === 422, r.corpo);
    r = await chamar("DELETE", `/feedbacks/${feedbackNovoId}`, { token: secretaria.token, corpo: { motivo: "CONTEUDO_OFENSIVO" } });
    checar("equipe exclui com motivo -> 204", r.status === 204, r.corpo);
    checar(
      "auditoria FEEDBACK_EXCLUIDO indica que foi a equipe e o motivo",
      !!(await prisma.logAuditoria.findFirst({
        where: { acao: "FEEDBACK_EXCLUIDO", usuarioId: secretaria.id, detalhe: { contains: "pela equipe — motivo: conteúdo ofensivo" } },
      })),
    );

    // ------------------------------------------------------------------ participantes
    requisito("R15 Participantes: listagem e edição pela equipe");
    r = await chamar("GET", "/participantes/alunos", { token: secretaria.token });
    checar("lista de alunos (check-in) traz o aluno já legível", r.status === 200 && r.corpo.some((p: { id: string; email: string }) => p.id === aluno.participanteId && p.email === emailAluno), r.status);
    const novoEmailAluno2 = `req.aluno2.corrigido.${sufixo}@alunos.umc.br`;
    r = await chamar("PUT", `/participantes/${aluno2.participanteId}`, {
      token: secretaria.token,
      corpo: { nome: "Segundo Aluno Editado", email: novoEmailAluno2.toUpperCase() },
    });
    checar("equipe edita nome e e-mail -> 200 (e-mail gravado em minúsculo)", r.status === 200 && r.corpo.nome === "Segundo Aluno Editado" && r.corpo.email === novoEmailAluno2, r.corpo);
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: novoEmailAluno2, senha: aluno2.senha } });
    checar("a correção vale também pra conta de login do aluno (entra com o e-mail novo)", r.status === 200 && r.corpo.usuario?.nome === "Segundo Aluno Editado", r.corpo);
    aluno2.token = r.corpo.token;
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: emailAluno2, senha: aluno2.senha } });
    checar("o e-mail antigo não entra mais", r.status === 401, r.status);
    aluno2.email = novoEmailAluno2;

    // ------------------------------------------------------------------ C: inativacao e reativacao
    requisito("R16 Inativação e reativação");
    // aluno 2 tem: inscricao PRESENTE no evento principal (futuro) e PENDENTE no evento lotado (futuro);
    // ganha mais uma PENDENTE num evento que ja aconteceu
    const ontem = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    r = await chamar("POST", "/eventos", {
      token: admin.token,
      corpo: { titulo: `Evento Passado ${sufixo}`, horario: ontem, salaId, palestranteId, tema: "Tema", cargaHoraria: 1, questionario: questionario() },
    });
    const eventoPassadoId: string = r.corpo.id;
    eventos.push(eventoPassadoId);
    r = await chamar("POST", "/inscricoes", { token: secretaria.token, corpo: { participanteId: aluno2.participanteId, eventoId: eventoPassadoId } });
    const inscricaoPassada: string = r.corpo.id;
    const inscricaoLotada = await prisma.inscricao.findUnique({
      where: { participanteId_eventoId: { participanteId: aluno2.participanteId!, eventoId: eventoLotadoId } },
    });

    r = await chamar("PUT", `/participantes/${aluno2.participanteId}`, { token: secretaria.token, corpo: { ativo: false } });
    checar("inativar sem motivo -> 422", r.status === 422, r.corpo);
    r = await chamar("PUT", `/participantes/${aluno2.participanteId}`, { token: aluno.token, corpo: { ativo: false, motivoInativacao: "x" } });
    checar("aluno não inativa ninguém -> 403", r.status === 403, r.status);
    r = await chamar("PUT", `/participantes/${aluno2.participanteId}`, { token: secretaria.token, corpo: { ativo: false, motivoInativacao: "Teste automatizado" } });
    checar("secretaria inativa com motivo -> 200", r.status === 200 && r.corpo.ativo === false, r.corpo);
    checar(
      "auditoria PARTICIPANTE_INATIVADO sem o texto do motivo",
      !!(await prisma.logAuditoria.findFirst({ where: { acao: "PARTICIPANTE_INATIVADO", usuarioId: secretaria.id, detalhe: { contains: aluno2.participanteId! } } })),
    );
    r = await chamar("GET", "/usuarios/me", { token: aluno2.token });
    checar("sessão aberta do aluno inativado cai -> 401", r.status === 401, r.status);
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: aluno2.email, senha: aluno2.senha } });
    checar(
      "login do inativo -> 403 com a mensagem padrão, sem o motivo interno",
      r.status === 403 && r.corpo.code === "CONTA_INATIVA" && r.corpo.message === "Sua conta está inativa. Procure a secretaria." && !JSON.stringify(r.corpo).includes("Teste automatizado"),
      r.corpo,
    );
    checar("inscrição pendente em evento futuro foi cancelada", !(await prisma.inscricao.findUnique({ where: { id: inscricaoLotada!.id } })));
    checar(
      "cancelamento registrado na auditoria (INSCRICAO_CANCELADA)",
      !!(await prisma.logAuditoria.findFirst({ where: { acao: "INSCRICAO_CANCELADA", detalhe: { contains: inscricaoLotada!.id } } })),
    );
    const presencaMantida = await prisma.inscricao.findUnique({ where: { id: inscricaoAluno2 } });
    checar("inscrição com presença confirmada continua (certificado segue válido)", presencaMantida?.statusPresenca === "PRESENTE");
    checar("inscrição de evento que já aconteceu continua", !!(await prisma.inscricao.findUnique({ where: { id: inscricaoPassada } })));
    r = await chamar("POST", "/inscricoes", { token: secretaria.token, corpo: { participanteId: aluno2.participanteId, eventoId: eventoLotadoId } });
    checar("equipe não inscreve aluno inativo -> 409", r.status === 409 && r.corpo.code === "PARTICIPANTE_INATIVO", r.corpo);
    r = await chamar("PUT", `/inscricoes/${inscricaoPassada}`, { token: secretaria.token, corpo: { statusPresenca: "PRESENTE" } });
    checar("check-in de aluno inativo -> 409", r.status === 409, r.corpo);
    r = await chamar("GET", "/usuarios", { token: admin.token });
    checar(
      "tela de usuários marca o aluno como inativo",
      r.corpo.some((u: { id: string; inativo: boolean }) => u.id === aluno2.id && u.inativo === true),
      r.status,
    );
    r = await chamar("PUT", `/participantes/${aluno2.participanteId}`, { token: admin.token, corpo: { ativo: true } });
    checar("administrador reativa -> 200, motivo apagado", r.status === 200 && r.corpo.ativo === true && r.corpo.motivoInativacao === null, r.corpo);
    checar(
      "auditoria PARTICIPANTE_REATIVADO",
      !!(await prisma.logAuditoria.findFirst({ where: { acao: "PARTICIPANTE_REATIVADO", usuarioId: admin.id, detalhe: { contains: aluno2.participanteId! } } })),
    );
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: aluno2.email, senha: aluno2.senha } });
    checar("reativado volta a fazer login", r.status === 200 && !!r.corpo.token, r.corpo);
    r = await chamar("DELETE", `/participantes/${aluno2.participanteId}`, { token: admin.token });
    checar("remover participante ativo -> 409", r.status === 409, r.corpo);

    // ------------------------------------------------------------------ recuperacao de senha
    requisito("R17 Recuperação de senha");
    r = await chamar("POST", "/auth/recuperacao-senha", { corpo: { email: emailAluno } });
    checar("pede o código -> 200 (em dev devolve codigoDemo)", r.status === 200 && /^\d{6}$/.test(r.corpo.codigoDemo ?? ""), r.corpo);
    const codigoDemo: string = r.corpo.codigoDemo;
    r = await chamar("POST", "/auth/recuperacao-senha/confirmar", { corpo: { email: emailAluno, codigo: codigoDemo === "000000" ? "111111" : "000000", novaSenha: "NovaSenha123" } });
    checar("código errado -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/auth/recuperacao-senha/confirmar", { corpo: { email: emailAluno, codigo: codigoDemo, novaSenha: "NovaSenha123" } });
    checar("código certo troca a senha -> 200", r.status === 200, r.corpo);
    r = await chamar("GET", "/usuarios/me", { token: aluno.token });
    checar("sessão antiga cai depois da troca -> 401", r.status === 401, r.status);
    aluno.senha = "NovaSenha123";
    aluno.token = await entrar(aluno);
    checar("login com a senha nova funciona", !!aluno.token);

    // ------------------------------------------------------------------ auditoria
    requisito("R18 Trilha de auditoria");
    r = await chamar("GET", `/logs-auditoria?acao=SALA_CRIADA&usuarioId=${admin.id}`, { token: secretaria.token });
    checar("filtro por ação e responsável", r.status === 200 && r.corpo.itens.some((l: { detalhe: string }) => l.detalhe.includes(salaId)), r.corpo);
    r = await chamar("GET", "/logs-auditoria?pageSize=500", { token: secretaria.token });
    checar("parâmetro inválido -> 422", r.status === 422, r.status);
    r = await chamar("GET", "/logs-auditoria/responsaveis", { token: admin.token });
    checar("lista de responsáveis", r.status === 200 && r.corpo.some((u: { id: string }) => u.id === admin.id), r.status);
    const logsDoTeste = await prisma.logAuditoria.findMany({ where: { usuarioId: { in: contas.map((c) => c.id) } } });
    const sensiveis = [emailAluno, emailAluno2, novoEmailAluno2, rgmAluno, "Avaliação corrigida", "Segundo Aluno Editado", "SenhaAluno123", "NovaSenha123", codigoDemo, "Ótima palestra", "Teste automatizado"];
    checar(
      "nenhum log do teste tem e-mail, RGM, senha, código, comentário ou motivo",
      logsDoTeste.every((l) => !sensiveis.some((s) => (l.detalhe ?? "").includes(s))),
      logsDoTeste.filter((l) => sensiveis.some((s) => (l.detalhe ?? "").includes(s))).map((l) => l.detalhe),
    );

    // ------------------------------------------------------------------ exclusao em cascata
    requisito("R19 Exclusão de evento em cascata");
    r = await chamar("DELETE", `/eventos/${eventoId}`, { token: admin.token });
    const [inscricoesRestantes, feedbacksRestantes, tentativasRestantes] = await Promise.all([
      prisma.inscricao.count({ where: { eventoId } }),
      prisma.feedback.count({ where: { eventoId } }),
      prisma.tentativaQuestionario.count({ where: { eventoId } }),
    ]);
    checar("evento removido leva inscrições, feedbacks e tentativas", r.status === 204 && inscricoesRestantes + feedbacksRestantes + tentativasRestantes === 0, { inscricoesRestantes, feedbacksRestantes, tentativasRestantes });
    eventos.splice(eventos.indexOf(eventoId), 1);
  } finally {
    for (const id of eventos) await prisma.evento.deleteMany({ where: { id } });
    for (const conta of contas) {
      if (conta.participanteId) {
        await prisma.tentativaQuestionario.deleteMany({ where: { participanteId: conta.participanteId } });
        await prisma.feedback.deleteMany({ where: { participanteId: conta.participanteId } });
        await prisma.inscricao.deleteMany({ where: { participanteId: conta.participanteId } });
      }
      await prisma.limiteAcesso.deleteMany({
        where: { chave: { in: [`login:conta:${indiceBusca(conta.email)}`, `recuperacao:conta:${indiceBusca(conta.email)}`, `mfa:conta:${conta.id}`] } },
      });
      await prisma.usuario.deleteMany({ where: { id: conta.id } });
      if (conta.participanteId) await prisma.participante.deleteMany({ where: { id: conta.participanteId } });
    }
    for (const id of salas) await prisma.sala.deleteMany({ where: { id } });
    for (const id of palestrantes) await prisma.palestrante.deleteMany({ where: { id } });
    await limparContadorDoIpLocal();
    servidor.close();
    await prisma.$disconnect();
  }

  const falhas = resultados.filter((r) => !r.ok);
  console.log(`\n[testar-requisitos] ${resultados.length - falhas.length}/${resultados.length} verificações passaram`);
  if (falhas.length > 0) {
    console.log("[testar-requisitos] falhas:");
    falhas.forEach((f) => console.log(`  - ${f.requisito}: ${f.nome}`));
    process.exitCode = 1;
  }
}

main().catch((erro) => {
  console.error("[testar-requisitos] erro:", erro);
  process.exitCode = 1;
});
