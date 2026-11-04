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

  // conta de equipe criada direto no banco (nao existe cadastro publico de equipe). De proposito com
  // hash de senha de custo 10 (o custo antigo), pra o R20 conferir que o login refaz o hash com custo 12
  async function criarEquipeHashAntigo(perfil: "ADMINISTRADOR" | "SECRETARIA"): Promise<Conta> {
    const email = `req-${perfil.toLowerCase()}-${sufixo}@teste.invalido`;
    const senha = "SenhaEquipe123";
    const usuario = await prisma.usuario.create({
      data: {
        id: randomUUID(),
        nome: `Teste Requisitos ${perfil}`,
        emailLogin: email,
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
    const admin = await criarEquipeHashAntigo("ADMINISTRADOR");
    const secretaria = await criarEquipeHashAntigo("SECRETARIA");

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
    // limite por IP (20) maior que o por conta (5): numa rede compartilhada, erros de pessoas diferentes
    // nao travam o login de todo mundo, mas chutar a senha de UMA conta continua bloqueado
    const outrasPessoas = Array.from({ length: 6 }, (_, i) => `outra.pessoa.${i}.${sufixo}@alunos.umc.br`);
    for (const email of outrasPessoas) await chamar("POST", "/auth/login", { corpo: { emailLogin: email, senha: "errada123" } });
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: emailAluno, senha: "SenhaAluno123" } });
    checar("erros de várias contas no mesmo IP não bloqueiam o login de outra pessoa (limite por IP é 20)", r.status === 200, r.corpo);
    const contaChutada = `chute.${sufixo}@alunos.umc.br`;
    for (let i = 0; i < 5; i++) await chamar("POST", "/auth/login", { corpo: { emailLogin: contaChutada, senha: "errada123" } });
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: contaChutada, senha: "errada123" } });
    checar("5 erros na mesma conta continuam bloqueando a conta -> 429", r.status === 429 && r.corpo.code === "MUITAS_TENTATIVAS", r.corpo);
    // contadores dessas contas que nao existem nao ficam pra tras no banco de dev
    await prisma.limiteAcesso.deleteMany({
      where: { chave: { in: [...outrasPessoas, contaChutada].map((email) => `login:conta:${indiceBusca(email)}`) } },
    });

    requisito("R03 Dados da própria conta");
    r = await chamar("GET", "/usuarios/me", { token: aluno.token });
    checar("GET /usuarios/me devolve a própria conta", r.status === 200 && r.corpo.id === aluno.id && r.corpo.emailLogin === emailAluno, r.corpo);

    // ------------------------------------------------------------------ G: nome/e-mail/RGM sem criptografia e sem copia
    requisito("R24 Nome, e-mail e RGM em texto puro, cada um numa tabela só");
    const usuarioNoBanco = await prisma.usuario.findUnique({ where: { id: aluno.id } });
    const participanteNoBanco = await prisma.participante.findUnique({ where: { id: aluno.participanteId! } });
    checar(
      "nome e e-mail ficam só na conta e o RGM só no participante, em texto puro",
      usuarioNoBanco?.nome === "Aluno Teste Requisitos" &&
        usuarioNoBanco.emailLogin === emailAluno &&
        !("rgm" in usuarioNoBanco) &&
        participanteNoBanco?.rgm === rgmAluno &&
        !("nome" in participanteNoBanco) &&
        !("email" in participanteNoBanco),
      { usuario: usuarioNoBanco && Object.keys(usuarioNoBanco), participante: participanteNoBanco && Object.keys(participanteNoBanco) },
    );
    checar("senha continua só como hash bcrypt", usuarioNoBanco?.senhaHash.startsWith("$2a$12$") === true && usuarioNoBanco.senhaHash !== "SenhaAluno123");
    r = await chamar("GET", "/usuarios/me", { token: aluno.token });
    checar(
      "a API continua devolvendo o RGM junto com a conta (vem do participante)",
      r.status === 200 && r.corpo.rgm === rgmAluno && r.corpo.nome === "Aluno Teste Requisitos",
      r.corpo,
    );
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: `  ${emailAluno.toUpperCase()} `, senha: "SenhaAluno123" } });
    checar("login aceita o e-mail com maiúsculas e espaços (normalizado)", r.status === 200 && !!r.corpo.token, r.status);
    const logCadastro = await prisma.logAuditoria.findFirst({ where: { usuarioId: aluno.id, acao: "USUARIO_REGISTRADO" } });
    checar("log guarda o nome do responsável em texto puro (atorNome)", logCadastro?.atorNome === "Aluno Teste Requisitos");

    requisito("R04 Permissões por perfil (aluno barrado nas rotas da equipe)");
    for (const [metodo, caminho] of [
      ["GET", "/participantes"],
      ["POST", "/salas"],
      ["GET", "/logs-auditoria"],
      ["GET", "/questionario-tentativas"],
      ["GET", "/dashboard"],
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
    // o evento principal comeca daqui a 30 min: ainda aceita inscricao e cancelamento (nao comecou) e o
    // check-in ja abriu (abre 1h antes do inicio). A rodada inteira leva poucos minutos
    const emBreve = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const eventoBase = { titulo: `Evento Teste ${sufixo}`, horario: emBreve, salaId, palestranteId, tema: "Tema de teste", cargaHoraria: 2 };
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

    // ------------------------------------------------------------------ RF024: conflito de sala
    requisito("R26 Conflito de sala (RF024)");
    const emHoras = (iso: string, horas: number) => new Date(new Date(iso).getTime() + horas * 3600 * 1000).toISOString();
    // "Evento Lotado" ocupa a sala pequena de emBreve ate emBreve + 2h; o "Evento Encostado" (emBreve + 2h)
    // fica fora da janela do check-in, o que o R12 usa pra conferir a regra
    r = await chamar("POST", "/eventos", {
      token: admin.token,
      corpo: { ...eventoBase, titulo: `Evento Cruzado ${sufixo}`, salaId: salaPequenaId, horario: emHoras(emBreve, 1), questionario: questionario() },
    });
    checar(
      "evento que cruza outro na mesma sala -> 409 CONFLITO_DE_SALA citando o outro evento",
      r.status === 409 && r.corpo.code === "CONFLITO_DE_SALA" && r.corpo.message.includes(`Evento Lotado ${sufixo}`),
      r.corpo,
    );
    r = await chamar("POST", "/eventos", {
      token: admin.token,
      corpo: { ...eventoBase, titulo: `Evento Encostado ${sufixo}`, salaId: salaPequenaId, horario: emHoras(emBreve, 2), cargaHoraria: 1, questionario: questionario() },
    });
    checar("evento que começa exatamente quando o outro termina não é conflito -> 201", r.status === 201, r.corpo);
    const eventoEncostadoId: string = r.corpo.id;
    eventos.push(eventoEncostadoId);
    r = await chamar("PUT", `/eventos/${eventoLotadoId}`, { token: secretaria.token, corpo: { horario: emBreve, cargaHoraria: 2 } });
    checar("editar mantendo o horário não conflita com o próprio evento -> 200", r.status === 200, r.corpo);
    r = await chamar("PUT", `/eventos/${eventoEncostadoId}`, { token: secretaria.token, corpo: { horario: emHoras(emBreve, 1) } });
    checar("editar pra cima do horário de outro evento da sala -> 409", r.status === 409 && r.corpo.code === "CONFLITO_DE_SALA", r.corpo);

    // ------------------------------------------------------------------ inscricoes e check-in
    requisito("R08 Autoinscrição do aluno");
    r = await chamar("POST", `/eventos/${eventoId}/inscricoes`, { token: aluno.token, corpo: { participanteId: aluno2.participanteId } });
    checar("aluno se inscreve -> 201 com o participanteId do próprio token", r.status === 201 && r.corpo.participanteId === aluno.participanteId, r.corpo);
    const inscricaoAluno: string = r.corpo.id;
    const emailDaAutoinscricao: unknown = r.corpo.emailConfirmacaoEnviado;
    r = await chamar("POST", `/eventos/${eventoId}/inscricoes`, { token: aluno.token });
    checar("inscrição repetida -> 409 JA_INSCRITO", r.status === 409 && r.corpo.code === "JA_INSCRITO", r.corpo);
    r = await chamar("POST", `/eventos/${eventoLotadoId}/inscricoes`, { token: aluno2.token });
    checar("aluno 2 ocupa a única vaga -> 201", r.status === 201, r.corpo);
    r = await chamar("POST", `/eventos/${eventoLotadoId}/inscricoes`, { token: aluno.token });
    checar("evento sem vaga -> 409 EVENTO_LOTADO", r.status === 409 && r.corpo.code === "EVENTO_LOTADO", r.corpo);
    r = await chamar("POST", `/eventos/${eventoId}/inscricoes`, { token: secretaria.token });
    checar("equipe não usa a autoinscrição -> 403", r.status === 403, r.status);
    // evento de 4 dias atras, fora do horario dos outros eventos passados da mesma sala (sem conflito de sala)
    r = await chamar("POST", "/eventos", {
      token: admin.token,
      corpo: { ...eventoBase, titulo: `Evento Encerrado ${sufixo}`, horario: emHoras(emBreve, -120), questionario: questionario() },
    });
    const eventoEncerradoId: string = r.corpo.id;
    eventos.push(eventoEncerradoId);
    r = await chamar("POST", `/eventos/${eventoEncerradoId}/inscricoes`, { token: aluno.token });
    checar(
      "evento que já começou não aceita autoinscrição -> 409 EVENTO_JA_INICIADO",
      r.status === 409 && r.corpo.code === "EVENTO_JA_INICIADO",
      r.corpo,
    );

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

    // ------------------------------------------------------------------ RF025: cancelamento de inscricao
    requisito("R27 Cancelamento de inscrição (RF025)");
    // "Evento Encostado" fica na sala pequena (1 vaga)
    r = await chamar("POST", `/eventos/${eventoEncostadoId}/inscricoes`, { token: aluno.token });
    checar("aluno ocupa a única vaga do evento -> 201", r.status === 201, r.corpo);
    r = await chamar("DELETE", `/eventos/${eventoEncostadoId}/inscricoes`, { token: aluno.token });
    checar("aluno cancela a própria inscrição pendente -> 204", r.status === 204, r.corpo);
    checar(
      "cancelamento pelo aluno na auditoria (INSCRICAO_CANCELADA)",
      !!(await prisma.logAuditoria.findFirst({ where: { acao: "INSCRICAO_CANCELADA", usuarioId: aluno.id, detalhe: { contains: "pelo próprio aluno" } } })),
    );
    r = await chamar("DELETE", `/eventos/${eventoEncostadoId}/inscricoes`, { token: aluno.token });
    checar("cancelar sem estar inscrito -> 404", r.status === 404, r.corpo);
    r = await chamar("DELETE", `/eventos/${eventoEncostadoId}/inscricoes`, { token: secretaria.token });
    checar("equipe não usa a rota de cancelamento do aluno -> 403", r.status === 403, r.status);
    r = await chamar("POST", `/eventos/${eventoEncostadoId}/inscricoes`, { token: aluno2.token });
    checar("a vaga liberada pode ser ocupada por outro aluno -> 201", r.status === 201, r.corpo);
    const inscricaoEncostadaAluno2: string = r.corpo.id;
    r = await chamar("DELETE", `/inscricoes/${inscricaoEncostadaAluno2}`, { token: secretaria.token });
    checar("secretaria cancela a inscrição pendente de um aluno -> 204", r.status === 204, r.corpo);
    checar(
      "cancelamento pela equipe na auditoria, com o aviso por e-mail ao aluno",
      !!(await prisma.logAuditoria.findFirst({ where: { acao: "INSCRICAO_CANCELADA", usuarioId: secretaria.id, detalhe: { contains: inscricaoEncostadaAluno2 } } })) &&
        !!(await prisma.logAuditoria.findFirst({
          where: { acao: "EMAIL_ENVIADO", usuarioId: secretaria.id, detalhe: { contains: `cancelamento de inscrição, inscrição ${inscricaoEncostadaAluno2}` } },
        })),
    );
    r = await chamar("POST", `/eventos/${eventoEncostadoId}/inscricoes`, { token: aluno.token });
    checar("quem cancelou pode se inscrever de novo -> 201", r.status === 201, r.corpo);
    const inscricaoEncostadaAluno: string = r.corpo.id;
    // o evento principal (comeca em 30 min) ja tem o check-in aberto e ainda nao comecou
    await chamar("PUT", `/inscricoes/${inscricaoAluno2}`, { token: secretaria.token, corpo: { statusPresenca: "AUSENTE" } });
    r = await chamar("DELETE", `/eventos/${eventoId}/inscricoes`, { token: aluno2.token });
    checar("presença já registrada no check-in não cancela -> 409", r.status === 409 && r.corpo.code === "PRESENCA_JA_REGISTRADA", r.corpo);
    r = await chamar("POST", "/eventos", {
      token: admin.token,
      corpo: { ...eventoBase, titulo: `Evento Iniciado ${sufixo}`, salaId: salaPequenaId, horario: emHoras(emBreve, -72), questionario: questionario() },
    });
    const eventoIniciadoId: string = r.corpo.id;
    eventos.push(eventoIniciadoId);
    r = await chamar("POST", "/inscricoes", { token: secretaria.token, corpo: { participanteId: aluno.participanteId, eventoId: eventoIniciadoId } });
    checar("secretaria ainda inscreve em evento que já começou (registro retroativo) -> 201", r.status === 201, r.corpo);
    const inscricaoIniciada: string = r.corpo.id;
    r = await chamar("DELETE", `/eventos/${eventoIniciadoId}/inscricoes`, { token: aluno.token });
    checar("evento que já começou: aluno não cancela -> 409", r.status === 409 && r.corpo.code === "EVENTO_JA_INICIADO", r.corpo);
    r = await chamar("DELETE", `/inscricoes/${inscricaoIniciada}`, { token: secretaria.token });
    checar("a mesma regra vale pra equipe -> 409", r.status === 409 && r.corpo.code === "EVENTO_JA_INICIADO", r.corpo);

    requisito("R10 Aluno só vê as próprias inscrições");
    r = await chamar("GET", `/inscricoes?participanteId=${aluno2.participanteId}`, { token: aluno.token });
    checar(
      "participanteId forjado na URL é ignorado",
      r.status === 200 && r.corpo.length > 0 && r.corpo.every((i: { participanteId: string }) => i.participanteId === aluno.participanteId),
      r.corpo,
    );

    requisito("R11 E-mail de confirmação da inscrição");
    const emailConfirmacao = (inscricaoId: string, usuarioId?: string) =>
      prisma.logAuditoria.findFirst({
        where: { acao: "EMAIL_ENVIADO", ...(usuarioId ? { usuarioId } : {}), detalhe: { contains: `confirmação de inscrição, inscrição ${inscricaoId}` } },
      });
    checar(
      "a autoinscrição já envia o e-mail de confirmação, sem chamada extra da tela (201 avisa e a auditoria registra)",
      emailDaAutoinscricao === true && !!(await emailConfirmacao(inscricaoAluno, aluno.id)),
      emailDaAutoinscricao,
    );
    checar("inscrição manual em evento futuro também avisa o aluno por e-mail", !!(await emailConfirmacao(inscricaoAluno2, secretaria.id)));
    checar("inscrição retroativa em evento que já começou não manda confirmação", !(await emailConfirmacao(inscricaoIniciada)));
    r = await chamar("POST", `/inscricoes/${inscricaoAluno}/confirmacao-email`, { token: aluno.token });
    checar("a rota antiga de disparo pela tela não existe mais -> 404", r.status === 404, r.status);

    requisito("R12 Check-in");
    r = await chamar("PUT", `/inscricoes/${inscricaoEncostadaAluno}`, { token: secretaria.token, corpo: { statusPresenca: "PRESENTE" } });
    checar(
      "check-in de evento que começa daqui a mais de 1h -> 409 CHECKIN_NAO_LIBERADO",
      r.status === 409 && r.corpo.code === "CHECKIN_NAO_LIBERADO",
      r.corpo,
    );
    r = await chamar("PUT", `/inscricoes/${inscricaoEncostadaAluno}`, { token: secretaria.token, corpo: { statusPresenca: "AUSENTE" } });
    checar("marcar ausente também espera a janela do check-in -> 409", r.status === 409 && r.corpo.code === "CHECKIN_NAO_LIBERADO", r.corpo);
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

    // ------------------------------------------------------------------ RF015: presenca travada
    requisito("R28 Presença travada depois do questionário (RF015)");
    r = await chamar("PUT", `/inscricoes/${inscricaoAluno}`, { token: secretaria.token, corpo: { statusPresenca: "AUSENTE" } });
    checar(
      "mudar a presença de quem já respondeu o questionário -> 409 com a mensagem da regra",
      r.status === 409 && r.corpo.code === "PRESENCA_TRAVADA" && r.corpo.message === "A presença não pode mais ser alterada: o aluno já respondeu o questionário.",
      r.corpo,
    );
    r = await chamar("DELETE", `/inscricoes/${inscricaoAluno}`, { token: secretaria.token });
    checar("excluir a inscrição de quem já respondeu o questionário -> 409", r.status === 409 && r.corpo.code === "PRESENCA_TRAVADA", r.corpo);
    checar("a presença continua confirmada", (await prisma.inscricao.findUnique({ where: { id: inscricaoAluno } }))?.statusPresenca === "PRESENTE");
    r = await chamar("GET", `/questionario-tentativas?participanteId=${aluno.participanteId}`, { token: secretaria.token });
    checar(
      "equipe consulta as tentativas de um aluno só (tela de Check-in)",
      r.status === 200 && r.corpo.length > 0 && r.corpo.every((t: { participanteId: string }) => t.participanteId === aluno.participanteId),
      r.corpo,
    );

    // ------------------------------------------------------------------ RF018/RF019/RF027: certificado registrado
    requisito("R29 Certificado registrado e validação pública (RF018, RF019, RF027)");
    r = await chamar("POST", `/certificados/emitir/${inscricaoAluno2}`, { token: aluno2.token });
    checar("sem a nota mínima não emite -> 409 CERTIFICADO_NAO_LIBERADO", r.status === 409 && r.corpo.code === "CERTIFICADO_NAO_LIBERADO", r.corpo);
    r = await chamar("POST", `/certificados/emitir/${inscricaoEncostadaAluno}`, { token: aluno.token });
    checar("sem presença confirmada não emite -> 409", r.status === 409 && r.corpo.code === "CERTIFICADO_NAO_LIBERADO", r.corpo);
    r = await chamar("POST", `/certificados/emitir/${inscricaoAluno}`, { token: aluno2.token });
    checar("aluno não emite o certificado de outra pessoa -> 403", r.status === 403, r.status);
    r = await chamar("POST", `/certificados/emitir/${inscricaoAluno}`, { token: aluno.token });
    const certificado = r.corpo;
    checar(
      "primeira emissão grava o certificado -> 201, código aleatório de 12 caracteres e os dados impressos",
      r.status === 201 &&
        /^[0-9A-HJKMNP-TV-Z]{12}$/.test(certificado.codigoValidacao ?? "") &&
        certificado.nomeParticipante === "Aluno Teste Requisitos" &&
        certificado.rgm === rgmAluno &&
        certificado.tituloEvento === `Evento Teste ${sufixo}` &&
        certificado.temaEvento === "Tema editado" &&
        certificado.nomePalestrante === "Palestrante Teste" &&
        certificado.cargaHoraria === 2,
      r.corpo,
    );
    r = await chamar("POST", `/certificados/emitir/${inscricaoAluno}`, { token: aluno.token });
    checar(
      "emitir de novo devolve o mesmo registro, sem regerar -> 200",
      r.status === 200 && r.corpo.id === certificado.id && r.corpo.codigoValidacao === certificado.codigoValidacao && r.corpo.emitidoEm === certificado.emitidoEm,
      r.corpo,
    );
    r = await chamar("POST", `/certificados/emitir/${inscricaoAluno}`, { token: secretaria.token });
    checar("secretaria emite o certificado do aluno -> o mesmo código", r.status === 200 && r.corpo.codigoValidacao === certificado.codigoValidacao, r.corpo);
    checar(
      "emissão registrada na auditoria (CERTIFICADO_EMITIDO)",
      !!(await prisma.logAuditoria.findFirst({ where: { acao: "CERTIFICADO_EMITIDO", usuarioId: aluno.id, detalhe: { contains: "primeira emissão" } } })),
    );
    r = await chamar("GET", "/certificados", { token: aluno2.token });
    checar(
      "aluno só lista os próprios certificados",
      r.status === 200 && r.corpo.every((c: { participanteId: string }) => c.participanteId === aluno2.participanteId) && !r.corpo.some((c: { id: string }) => c.id === certificado.id),
      r.corpo,
    );
    r = await chamar("GET", `/certificados?eventoId=${eventoId}`, { token: secretaria.token });
    checar("equipe lista os certificados do evento", r.status === 200 && r.corpo.some((c: { id: string }) => c.id === certificado.id), r.corpo);
    r = await chamar("GET", `/certificados/validar/${certificado.codigoValidacao}`);
    checar(
      "validação pública, sem token -> 200 com nome, evento, data, carga horária e emissão",
      r.status === 200 &&
        r.corpo.nomeParticipante === "Aluno Teste Requisitos" &&
        r.corpo.tituloEvento === `Evento Teste ${sufixo}` &&
        r.corpo.cargaHoraria === 2 &&
        !!r.corpo.dataEvento &&
        r.corpo.emitidoEm === certificado.emitidoEm,
      r.corpo,
    );
    checar(
      "validação pública não devolve RGM, e-mail nem ids internos",
      Object.keys(r.corpo ?? {}).sort().join(",") === "cargaHoraria,dataEvento,emitidoEm,nomeParticipante,tituloEvento" &&
        !JSON.stringify(r.corpo).includes(rgmAluno) &&
        !JSON.stringify(r.corpo).includes(emailAluno),
      r.corpo,
    );
    const codigoComoDigitado = `${certificado.codigoValidacao.slice(0, 4)}-${certificado.codigoValidacao.slice(4, 8)}-${certificado.codigoValidacao.slice(8)}`.toLowerCase();
    r = await chamar("GET", `/certificados/validar/${codigoComoDigitado}`);
    checar("código digitado em minúsculas e com hífens também valida", r.status === 200, r.corpo);
    r = await chamar("GET", "/certificados/validar/ZZZZZZZZZZZZ");
    checar("código inexistente -> 404 Certificado não encontrado", r.status === 404 && r.corpo.message === "Certificado não encontrado.", r.corpo);
    // o limite e de 30 consultas por IP (todas contam, inclusive as de cima)
    for (let i = 0; i < 30 && r.status !== 429; i++) r = await chamar("GET", "/certificados/validar/ZZZZZZZZZZZZ");
    checar("excesso de consultas do mesmo IP -> 429", r.status === 429 && r.corpo.code === "MUITAS_TENTATIVAS", r.corpo);

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
    // ------------------------------------------------------------------ RF026: direitos do titular
    // aqui o aluno ja tem inscricoes, presenca, as 2 tentativas, o certificado e uma avaliacao
    requisito("R30 Meus dados: o próprio aluno vê tudo o que o sistema guarda sobre ele (RF026)");
    r = await chamar("GET", "/meus-dados");
    checar("sem token -> 401", r.status === 401, r.status);
    r = await chamar("GET", "/meus-dados", { token: secretaria.token });
    checar("equipe não usa a rota do titular -> 403", r.status === 403, r.status);
    const solicitacoesAntes = await prisma.solicitacaoTitular.count({ where: { participanteId: aluno.participanteId! } });
    r = await chamar("GET", "/meus-dados", { token: aluno.token });
    const meusDados = r.corpo;
    const contaNoBanco = await prisma.usuario.findUnique({ where: { id: aluno.id }, include: { participante: true } });
    checar(
      "aluno vê os próprios dados cadastrais (nome, e-mail, RGM, cadastro, aceite dos termos e 2FA)",
      r.status === 200 &&
        meusDados.dadosCadastrais?.nome === contaNoBanco?.nome &&
        meusDados.dadosCadastrais.email === contaNoBanco?.emailLogin &&
        meusDados.dadosCadastrais.rgm === contaNoBanco?.participante?.rgm &&
        !!meusDados.dadosCadastrais.cadastradoEm &&
        !!meusDados.dadosCadastrais.termos?.aceitoEm &&
        meusDados.dadosCadastrais.termos.versao === contaNoBanco?.versaoTermosAceitos &&
        meusDados.dadosCadastrais.doisFatores?.ativo === false,
      meusDados?.dadosCadastrais,
    );
    const [qtdInscricoes, qtdTentativas, qtdFeedbacks] = await Promise.all([
      prisma.inscricao.count({ where: { participanteId: aluno.participanteId! } }),
      prisma.tentativaQuestionario.count({ where: { participanteId: aluno.participanteId! } }),
      prisma.feedback.count({ where: { participanteId: aluno.participanteId! } }),
    ]);
    checar(
      "inscrições, tentativas e avaliações são todas as do aluno — e só as dele",
      qtdInscricoes > 0 && qtdTentativas > 0 && qtdFeedbacks > 0 &&
        meusDados.inscricoes?.length === qtdInscricoes &&
        meusDados.questionarios?.length === qtdTentativas &&
        meusDados.avaliacoes?.length === qtdFeedbacks,
      [meusDados.inscricoes?.length, qtdInscricoes, meusDados.questionarios?.length, qtdTentativas, meusDados.avaliacoes?.length, qtdFeedbacks],
    );
    checar(
      "inscrição traz evento, data e presença (a do evento principal aparece como PRESENTE)",
      meusDados.inscricoes.some(
        (i: { evento: string; presenca: string; dataEvento: string }) => i.evento === `Evento Teste ${sufixo}` && i.presenca === "PRESENTE" && !!i.dataEvento,
      ),
      meusDados.inscricoes,
    );
    const textoMeusDados = JSON.stringify(meusDados);
    checar(
      "questionários com acertos e percentual, sem gabarito e sem as respostas marcadas",
      meusDados.questionarios.every(
        (q: { acertos: number; percentual: number; totalPerguntas: number }) =>
          typeof q.acertos === "number" && typeof q.percentual === "number" && q.totalPerguntas === 10,
      ) &&
        !textoMeusDados.includes('"respostas"') &&
        !textoMeusDados.includes('"correta"') &&
        !textoMeusDados.includes('"alternativas"'),
      meusDados.questionarios,
    );
    checar(
      "certificado emitido aparece com o código de validação",
      meusDados.certificados?.some((c: { codigoValidacao: string }) => c.codigoValidacao === certificado.codigoValidacao),
      meusDados.certificados,
    );
    checar(
      "avaliação traz nota e comentário",
      meusDados.avaliacoes.some((a: { nota: number; comentario: string }) => a.nota === 5 && a.comentario === "Ótima palestra"),
      meusDados.avaliacoes,
    );
    checar("nada de senha, segredo do 2FA nem ids internos na resposta", !/senha|segredo|hash|participanteId|usuarioId/i.test(textoMeusDados));
    checar(
      "consultar a página não grava solicitação nem log",
      (await prisma.solicitacaoTitular.count({ where: { participanteId: aluno.participanteId! } })) === solicitacoesAntes &&
        !(await prisma.logAuditoria.findFirst({ where: { acao: "DADOS_EXPORTADOS", usuarioId: aluno.id } })),
    );
    const consultaSemCache = await fetch(`${base}/meus-dados`, { headers: { Authorization: `Bearer ${aluno.token}` } });
    checar("resposta com dado pessoal vem sem cache (Cache-Control: no-store)", consultaSemCache.headers.get("cache-control") === "no-store");
    r = await chamar("GET", "/meus-dados/exportacao", { token: aluno.token });
    checar("a exportação em arquivo saiu do sistema -> 404", r.status === 404, r.status);

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
    r = await chamar("GET", "/participantes", { token: admin.token });
    checar(
      "Participantes marca o aluno como inativo e traz a situação da conta (2FA e acesso)",
      r.corpo.some(
        (p: { id: string; ativo: boolean; usuarioId: string; mfaAtivo: boolean; bloqueado: boolean }) =>
          p.id === aluno2.participanteId && p.ativo === false && p.usuarioId === aluno2.id && p.mfaAtivo === false && p.bloqueado === false,
      ),
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

    // ------------------------------------------------------------------ dashboard
    requisito("R25 Dashboard da equipe (endpoint agregado)");
    r = await chamar("GET", "/dashboard", { token: secretaria.token });
    const totais = r.corpo?.totais;
    checar(
      "equipe recebe os indicadores numa chamada só -> 200",
      r.status === 200 && typeof totais?.eventos === "number" && totais.inscricoes === totais.presentes + totais.ausentes + totais.pendentes,
      r.corpo,
    );
    const eventoNoDashboard = r.corpo?.eventos?.find((e: { id: string }) => e.id === eventoLotadoId);
    const inscricoesDoEventoLotado = await prisma.inscricao.count({ where: { eventoId: eventoLotadoId } });
    checar(
      "presença por evento bate com as inscrições do banco",
      eventoNoDashboard?.inscritos === inscricoesDoEventoLotado &&
        eventoNoDashboard.inscritos === eventoNoDashboard.presentes + eventoNoDashboard.ausentes + eventoNoDashboard.pendentes,
      eventoNoDashboard,
    );
    const ocupacoes = (
      await prisma.evento.findMany({ select: { sala: { select: { capacidade: true } }, _count: { select: { inscricoes: true } } } })
    )
      .filter((e) => e.sala.capacidade > 0)
      .map((e) => (e._count.inscricoes / e.sala.capacidade) * 100);
    const ocupacaoEsperada = ocupacoes.length > 0 ? ocupacoes.reduce((soma, o) => soma + o, 0) / ocupacoes.length : null;
    checar(
      "ocupação média das salas = média de inscritos / capacidade entre os eventos (RF021)",
      typeof totais?.ocupacaoMediaSalas === "number" && ocupacaoEsperada !== null && Math.abs(totais.ocupacaoMediaSalas - ocupacaoEsperada) < 0.01,
      { recebido: totais?.ocupacaoMediaSalas, esperado: ocupacaoEsperada },
    );
    const textoDashboard = JSON.stringify(r.corpo);
    checar(
      "dashboard não traz dado pessoal (nome, e-mail, RGM de aluno)",
      ![emailAluno, emailAluno2, novoEmailAluno2, rgmAluno, "Aluno Teste Requisitos", "Segundo Aluno Editado"].some((s) => textoDashboard.includes(s)),
    );

    // ------------------------------------------------------------------ RF009/RNF010: exclusao bloqueada
    requisito("R19 Exclusão de evento bloqueada com inscrições (RF009/RNF010)");
    r = await chamar("DELETE", `/eventos/${eventoId}`, { token: admin.token });
    const [inscricoesMantidas, tentativasMantidas] = await Promise.all([
      prisma.inscricao.count({ where: { eventoId } }),
      prisma.tentativaQuestionario.count({ where: { eventoId } }),
    ]);
    checar(
      "evento com inscrições não é excluído -> 409 EVENTO_COM_INSCRICOES, nada é apagado",
      r.status === 409 &&
        r.corpo.code === "EVENTO_COM_INSCRICOES" &&
        r.corpo.message === "Cancele as inscrições antes de excluir o evento." &&
        inscricoesMantidas > 0 &&
        tentativasMantidas > 0,
      { corpo: r.corpo, inscricoesMantidas, tentativasMantidas },
    );
    r = await chamar("POST", "/eventos", {
      token: admin.token,
      corpo: { ...eventoBase, titulo: `Evento Sem Inscrição ${sufixo}`, horario: emHoras(emBreve, 5), questionario: questionario() },
    });
    const eventoSemInscricaoId: string = r.corpo.id;
    eventos.push(eventoSemInscricaoId);
    r = await chamar("DELETE", `/eventos/${eventoSemInscricaoId}`, { token: admin.token });
    checar("evento sem inscrição é excluído -> 204", r.status === 204 && !(await prisma.evento.findUnique({ where: { id: eventoSemInscricaoId } })), r.corpo);
    eventos.splice(eventos.indexOf(eventoSemInscricaoId), 1);
  } finally {
    // certificado segura a inscricao (onDelete: Restrict), entao sai antes dos eventos e das inscricoes
    const participantesDoTeste = contas.map((c) => c.participanteId).filter((id): id is string => !!id);
    await prisma.certificado.deleteMany({
      where: { inscricao: { OR: [{ eventoId: { in: eventos } }, { participanteId: { in: participantesDoTeste } }] } },
    });
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
