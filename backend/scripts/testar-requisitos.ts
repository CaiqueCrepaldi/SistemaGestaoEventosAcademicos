// testes ponta a ponta dos requisitos do sistema (docs/funcionalidades-principais.md e
// docs/api-contract.md) contra o banco de DESENVOLVIMENTO — se recusa a rodar se o DATABASE_URL
// nao for o SGEA_dev. Sobe o backend numa porta local, cria os proprios dados de teste (contas,
// salas, palestrantes, eventos), faz as chamadas HTTP de verdade e apaga tudo no final (logs de
// auditoria ficam, como em qualquer operacao).
//
// como rodar (de dentro de backend/):  npx tsx scripts/testar-requisitos.ts
import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import type { AddressInfo } from "net";
import bcrypt from "bcryptjs";
import { generate } from "otplib";

if (!process.env.DATABASE_URL?.includes("SGEA_dev")) {
  console.error("[testar-requisitos] recusado: DATABASE_URL não aponta pro SGEA_dev");
  process.exit(1);
}
// o convite do professor precisa do endereco do frontend; sem APP_URL no .env, o teste usa o do Vite local
if (!process.env.APP_URL?.trim()) process.env.APP_URL = "http://localhost:5173";

type Perfil = "ADMINISTRADOR" | "SECRETARIA" | "ALUNO" | "PROFESSOR";
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

// senhas que seguem a regra de senha nova (8 a 64, maiuscula, numero e caractere especial)
const SENHA_ALUNO = "Senha@Aluno123";
const SENHA_ALUNO2 = "Senha#Aluno456";
const SENHA_NOVA = "Nova@Senha123";

// cadastro completo pelo fluxo de 2 passos: os dados (202 com o codigoDemo, fora de producao) e a
// confirmacao do codigo (201 com a conta). Devolve a resposta da confirmacao, ou a do passo 1 se falhar
async function cadastrarAluno(dados: { nomeCompleto: string; rgm: string; emailInstitucional: string; senha: string; aceiteLgpd: boolean }): Promise<Resposta> {
  const inicio = await chamar("POST", "/auth/registro", { corpo: dados });
  if (inicio.status !== 202) return inicio;
  return chamar("POST", "/auth/registro/confirmar", { corpo: { emailInstitucional: dados.emailInstitucional, codigo: inicio.corpo.codigoDemo } });
}

async function main() {
  const { criarApp } = await import("../src/expressApp");
  const { prisma } = await import("../src/db/prisma");
  const { indiceBusca } = await import("../src/utils/criptografia");
  const { expirarCheckins } = await import("../src/utils/checkin");
  const { env } = await import("../src/config/env");
  const { emailService, conteudoDoConvite, dataHoraDeBrasilia } = await import("../src/modules/email/email.service");
  const conteudosEmail = await import("../src/modules/email/conteudos-email");
  const { VERSAO_TERMOS_ATUAL } = await import("../src/config/termos");

  // o limite de tentativas por IP (bloco 2) conta os logins errados de proposito deste teste, que
  // sempre saem do 127.0.0.1: zera o contador desse IP no comeco e no fim (so no banco de dev)
  const limparContadorDoIpLocal = () => prisma.limiteAcesso.deleteMany({ where: { chave: { contains: "127.0.0.1" } } });
  await limparContadorDoIpLocal();

  const servidor = criarApp().listen(0);
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`;

  const contas: Conta[] = [];
  // e-mails usados no cadastro: no fim saem os pendentes e o contador de envios do codigo deles
  const emailsDeCadastro: string[] = [];
  // logs gravados por este teste (1 min de folga pra diferenca de relogio com o banco)
  const inicioDoTeste = new Date(Date.now() - 60 * 1000);
  const salas: string[] = [];
  const palestrantes: string[] = [];
  const eventos: string[] = [];
  const sufixo = randomUUID().slice(0, 8);
  // sala no padrao da UMC (predio + andar + "-" + numero, ex.: 1T-01) e unica: o teste pega codigos que nenhuma
  // sala do banco usa (de 33-21 para tras, longe das salas da carga de demonstracao)
  const codigosDeSalaEmUso = new Set((await prisma.sala.findMany({ select: { nome: true } })).map((sala) => sala.nome));
  function codigoDeSala(): string {
    for (const predio of ["3", "2", "1"]) {
      for (const andar of ["3", "2", "1", "T"]) {
        for (let numero = 21; numero >= 1; numero--) {
          const codigo = `${predio}${andar}-${String(numero).padStart(2, "0")}`;
          if (!codigosDeSalaEmUso.has(codigo)) {
            codigosDeSalaEmUso.add(codigo);
            return codigo;
          }
        }
      }
    }
    throw new Error("nenhum código de sala livre no banco de desenvolvimento");
  }

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

  // ocupacao real (RF021) calculada direto no banco, sem a funcao do backend: media, entre os eventos ja
  // encerrados (horario + carga horaria no passado) de sala com capacidade, de PRESENTE / capacidade
  async function ocupacaoEsperadaNoBanco(salaId?: string): Promise<number | null> {
    const agora = Date.now();
    const eventosDb = await prisma.evento.findMany({
      // so eventos aprovados (pendente/recusado nao acontece de verdade)
      where: { situacao: "APROVADO", ...(salaId ? { salaId } : {}) },
      select: {
        horario: true,
        cargaHoraria: true,
        sala: { select: { capacidade: true } },
        _count: { select: { inscricoes: { where: { statusPresenca: "PRESENTE" } } } },
      },
    });
    const percentuais = eventosDb
      .filter((e) => e.horario.getTime() + e.cargaHoraria * 3600 * 1000 <= agora && e.sala.capacidade > 0)
      .map((e) => (e._count.inscricoes / e.sala.capacidade) * 100);
    return percentuais.length > 0 ? percentuais.reduce((soma, p) => soma + p, 0) / percentuais.length : null;
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
    requisito("R01 Cadastro público de aluno (conta só depois de confirmar o e-mail)");
    const emailAluno = `req.aluno.${sufixo}@alunos.umc.br`;
    emailsDeCadastro.push(emailAluno);
    const rgmAluno = rgmAleatorio();
    const cadastroValido = { nomeCompleto: "Aluno Teste Requisitos", rgm: rgmAluno, emailInstitucional: emailAluno, senha: SENHA_ALUNO, aceiteLgpd: true };
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
    r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroValido, senha: "Aa1!567" } });
    checar("senha com 7 caracteres -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroValido, aceiteLgpd: false } });
    checar("sem aceite dos termos -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/auth/registro", { corpo: cadastroValido });
    checar(
      "dados válidos -> 202 com o e-mail e a validade (e o codigoDemo fora de produção)",
      r.status === 202 && r.corpo.emailInstitucional === emailAluno && !!r.corpo.expiraEm && /^\d{6}$/.test(r.corpo.codigoDemo ?? ""),
      r.corpo,
    );
    const codigoCadastro: string = r.corpo.codigoDemo;
    checar("o passo 1 não cria conta nem participante", !(await prisma.usuario.findUnique({ where: { emailLogin: emailAluno } })) && !(await prisma.participante.findUnique({ where: { rgm: rgmAluno } })));
    const pendenteAluno = await prisma.cadastroPendente.findUnique({ where: { emailLogin: emailAluno } });
    checar(
      "cadastro pendente guarda senha e código só como hash bcrypt, validade de 15 minutos e a versão dos termos",
      !!pendenteAluno &&
        pendenteAluno.senhaHash.startsWith("$2a$12$") &&
        pendenteAluno.codigoHash.startsWith("$2a$12$") &&
        pendenteAluno.codigoHash !== codigoCadastro &&
        Math.abs(pendenteAluno.expiraEm.getTime() - pendenteAluno.aceiteEm.getTime() - 15 * 60 * 1000) < 1000 &&
        pendenteAluno.versaoTermos === VERSAO_TERMOS_ATUAL,
      pendenteAluno && { expira: pendenteAluno.expiraEm, versao: pendenteAluno.versaoTermos },
    );
    r = await chamar("POST", "/auth/registro/confirmar", { corpo: { emailInstitucional: emailAluno, codigo: codigoCadastro === "000000" ? "111111" : "000000" } });
    checar("código errado -> 422 CODIGO_INVALIDO \"Código inválido.\"", r.status === 422 && r.corpo.code === "CODIGO_INVALIDO" && r.corpo.message === "Código inválido.", r.corpo);
    r = await chamar("POST", "/auth/registro/confirmar", { corpo: { emailInstitucional: emailAluno, codigo: "12a" } });
    checar("código fora do formato (6 dígitos) -> 422 no campo codigo", r.status === 422 && r.corpo.erros?.some((e: { campo: string }) => e.campo === "codigo"), r.corpo);
    r = await chamar("POST", "/auth/registro/confirmar", { corpo: { emailInstitucional: emailAluno.toUpperCase(), codigo: codigoCadastro } });
    checar("código certo -> 201 com a conta ALUNO, sem senha na resposta", r.status === 201 && r.corpo.senhaHash === undefined && r.corpo.perfil === "ALUNO" && !!r.corpo.participanteId, r.corpo);
    const aluno: Conta = { id: r.corpo.id, email: emailAluno, senha: SENHA_ALUNO, perfil: "ALUNO", participanteId: r.corpo.participanteId };
    contas.push(aluno);
    const contaCriada = await prisma.usuario.findUnique({ where: { id: aluno.id } });
    checar(
      "a conta recebe a senha do cadastro, o instante do aceite e a versão vigente (1) dos termos; o pendente é apagado",
      !!contaCriada &&
        contaCriada.senhaHash === pendenteAluno?.senhaHash &&
        contaCriada.consentimentoLgpdEm?.getTime() === pendenteAluno?.aceiteEm.getTime() &&
        contaCriada.versaoTermosAceitos === VERSAO_TERMOS_ATUAL &&
        !(await prisma.cadastroPendente.findUnique({ where: { emailLogin: emailAluno } })),
    );
    r = await chamar("POST", "/auth/registro/confirmar", { corpo: { emailInstitucional: emailAluno, codigo: codigoCadastro } });
    checar("confirmar de novo (pendente já usado) -> 422 CODIGO_EXPIRADO", r.status === 422 && r.corpo.code === "CODIGO_EXPIRADO", r.corpo);
    r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroValido, rgm: rgmAleatorio() } });
    checar("e-mail já cadastrado -> 409", r.status === 409 && r.corpo.code === "EMAIL_DUPLICADO", r.corpo);
    r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroValido, emailInstitucional: `outro.${sufixo}@alunos.umc.br` } });
    checar("RGM já cadastrado -> 409", r.status === 409 && r.corpo.code === "RGM_DUPLICADO", r.corpo);

    const emailAluno2 = `req.aluno2.${sufixo}@alunos.umc.br`;
    emailsDeCadastro.push(emailAluno2);
    r = await cadastrarAluno({ nomeCompleto: "Segundo Aluno Teste", rgm: rgmAleatorio(), emailInstitucional: emailAluno2, senha: SENHA_ALUNO2, aceiteLgpd: true });
    checar("segundo aluno cadastrado pelo fluxo completo -> 201", r.status === 201, r.corpo);
    const aluno2: Conta = { id: r.corpo.id, email: emailAluno2, senha: SENHA_ALUNO2, perfil: "ALUNO", participanteId: r.corpo.participanteId };
    contas.push(aluno2);

    requisito("R32 Confirmação do e-mail: código, reenvio, validade e limites");
    const emailPendente = `req.pendente.${sufixo}@alunos.umc.br`;
    emailsDeCadastro.push(emailPendente);
    const rgmPendente = rgmAleatorio();
    const cadastroPendente = { nomeCompleto: "Aluno Pendente Teste", rgm: rgmPendente, emailInstitucional: emailPendente, senha: SENHA_ALUNO, aceiteLgpd: true };
    r = await chamar("POST", "/auth/registro", { corpo: cadastroPendente });
    let codigoPendente: string = r.corpo.codigoDemo;
    // o intervalo de 60 s entre envios e simulado voltando o relogio do ultimo envio no banco de dev
    const voltarUltimoEnvio = () =>
      prisma.cadastroPendente.update({ where: { emailLogin: emailPendente }, data: { ultimoEnvioEm: new Date(Date.now() - 61 * 1000) } });
    r = await chamar("POST", "/auth/registro/reenviar-codigo", { corpo: { emailInstitucional: emailPendente } });
    checar("reenviar antes de 60 s -> 429 com os segundos que faltam", r.status === 429 && r.corpo.code === "AGUARDE_REENVIO" && /Aguarde \d+ segundos/.test(r.corpo.message), r.corpo);
    for (let i = 1; i <= 4; i++) {
      r = await chamar("POST", "/auth/registro/confirmar", { corpo: { emailInstitucional: emailPendente, codigo: codigoPendente === "000000" ? "111111" : "000000" } });
    }
    r = await chamar("POST", "/auth/registro/confirmar", { corpo: { emailInstitucional: emailPendente, codigo: codigoPendente === "000000" ? "111111" : "000000" } });
    checar("5º erro -> 422 avisando que é preciso pedir outro código", r.status === 422 && r.corpo.code === "CODIGO_INVALIDO" && r.corpo.message.includes("Reenviar código"), r.corpo);
    r = await chamar("POST", "/auth/registro/confirmar", { corpo: { emailInstitucional: emailPendente, codigo: codigoPendente } });
    checar("depois de 5 erros nem o código certo vale -> 422", r.status === 422 && r.corpo.code === "CODIGO_INVALIDO", r.corpo);
    await voltarUltimoEnvio();
    r = await chamar("POST", "/auth/registro/reenviar-codigo", { corpo: { emailInstitucional: emailPendente.toUpperCase() } });
    checar("reenviar depois de 60 s -> 200 com código novo", r.status === 200 && /^\d{6}$/.test(r.corpo.codigoDemo ?? ""), r.corpo);
    const codigoAntigo = codigoPendente;
    codigoPendente = r.corpo.codigoDemo;
    const pendenteReenviado = await prisma.cadastroPendente.findUnique({ where: { emailLogin: emailPendente } });
    checar(
      "o reenvio zera as tentativas, conta o envio e renova a validade para 15 minutos",
      pendenteReenviado?.tentativas === 0 &&
        pendenteReenviado.envios === 2 &&
        Math.abs(pendenteReenviado.expiraEm.getTime() - Date.now() - 15 * 60 * 1000) < 10000,
      pendenteReenviado && { tentativas: pendenteReenviado.tentativas, envios: pendenteReenviado.envios },
    );
    if (codigoAntigo !== codigoPendente) {
      r = await chamar("POST", "/auth/registro/confirmar", { corpo: { emailInstitucional: emailPendente, codigo: codigoAntigo } });
      checar("o código anterior deixa de valer -> 422", r.status === 422 && r.corpo.code === "CODIGO_INVALIDO", r.corpo);
    }
    await prisma.cadastroPendente.update({ where: { emailLogin: emailPendente }, data: { expiraEm: new Date(Date.now() - 1000) } });
    r = await chamar("POST", "/auth/registro/confirmar", { corpo: { emailInstitucional: emailPendente, codigo: codigoPendente } });
    checar(
      "código expirado -> 422 CODIGO_EXPIRADO \"O código expirou. Preencha o cadastro novamente.\"",
      r.status === 422 && r.corpo.code === "CODIGO_EXPIRADO" && r.corpo.message === "O código expirou. Preencha o cadastro novamente.",
      r.corpo,
    );
    checar("o cadastro expirado é apagado e nenhuma conta é criada", !(await prisma.cadastroPendente.findUnique({ where: { emailLogin: emailPendente } })) && !(await prisma.usuario.findUnique({ where: { emailLogin: emailPendente } })));
    r = await chamar("POST", "/auth/registro/reenviar-codigo", { corpo: { emailInstitucional: emailPendente } });
    checar("reenviar sem cadastro pendente -> 422 CODIGO_EXPIRADO", r.status === 422 && r.corpo.code === "CODIGO_EXPIRADO", r.corpo);

    // cadastro refeito com o mesmo e-mail substitui o pendente anterior (e o mesmo RGM tambem)
    r = await chamar("POST", "/auth/registro", { corpo: cadastroPendente });
    const primeiroId = (await prisma.cadastroPendente.findUnique({ where: { emailLogin: emailPendente } }))?.id;
    await voltarUltimoEnvio();
    r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroPendente, nomeCompleto: "Aluno Pendente Corrigido" } });
    const pendentesDoEmail = await prisma.cadastroPendente.findMany({ where: { OR: [{ emailLogin: emailPendente }, { rgm: rgmPendente }] } });
    checar(
      "preencher de novo substitui o cadastro pendente (um só por e-mail/RGM, com os dados novos)",
      r.status === 202 && pendentesDoEmail.length === 1 && pendentesDoEmail[0].id !== primeiroId && pendentesDoEmail[0].nome === "Aluno Pendente Corrigido",
      pendentesDoEmail.length,
    );
    // ja houve 4 envios pra este e-mail (3 cadastros + 1 reenvio); o 5º passa e o 6º e barrado
    await voltarUltimoEnvio();
    r = await chamar("POST", "/auth/registro/reenviar-codigo", { corpo: { emailInstitucional: emailPendente } });
    checar("5º envio de código para o mesmo e-mail -> 200", r.status === 200, r.corpo);
    await voltarUltimoEnvio();
    r = await chamar("POST", "/auth/registro/reenviar-codigo", { corpo: { emailInstitucional: emailPendente } });
    checar("6º envio para o mesmo e-mail em 15 minutos -> 429 (limite de 5 por e-mail)", r.status === 429 && r.corpo.code === "MUITAS_TENTATIVAS", r.corpo);
    r = await chamar("POST", "/auth/registro", { corpo: cadastroPendente });
    checar("o limite vale também para preencher o cadastro de novo -> 429", r.status === 429, r.corpo);
    const bloqueioCadastro = await prisma.limiteAcesso.findUnique({ where: { chave: `cadastro:conta:${indiceBusca(emailPendente)}` } });
    checar("o limite de envios guarda só o HMAC do e-mail, nunca o e-mail", !!bloqueioCadastro?.bloqueadoAte && !bloqueioCadastro.chave.includes(emailPendente));

    // a cada login, os cadastros vencidos de qualquer pessoa sao apagados (nao ha rotina agendada)
    const emailVencido = `req.vencido.${sufixo}@alunos.umc.br`;
    await prisma.cadastroPendente.create({
      data: {
        id: randomUUID(),
        nome: "Cadastro Vencido",
        emailLogin: emailVencido,
        rgm: rgmAleatorio(),
        senhaHash: "x",
        codigoHash: "x",
        aceiteEm: new Date(),
        versaoTermos: VERSAO_TERMOS_ATUAL,
        expiraEm: new Date(Date.now() - 60 * 1000),
      },
    });
    await entrar(admin);
    checar("o login apaga os cadastros pendentes expirados", !(await prisma.cadastroPendente.findUnique({ where: { emailLogin: emailVencido } })));

    const logsCadastro = await prisma.logAuditoria.findMany({
      where: { acao: { in: ["CADASTRO_INICIADO", "CADASTRO_CODIGO_REENVIADO", "CADASTRO_CONCLUIDO"] }, criadoEm: { gte: inicioDoTeste } },
    });
    checar(
      "auditoria registra início, reenvio e conclusão do cadastro (a conclusão com o id da conta)",
      ["CADASTRO_INICIADO", "CADASTRO_CODIGO_REENVIADO"].every((acao) => logsCadastro.some((l) => l.acao === acao)) &&
        logsCadastro.some((l) => l.acao === "CADASTRO_CONCLUIDO" && l.usuarioId === aluno.id && (l.detalhe ?? "").includes(aluno.id)),
      logsCadastro.map((l) => l.acao),
    );
    const textosSensiveisCadastro = [emailAluno, emailAluno2, emailPendente, rgmAluno, rgmPendente, SENHA_ALUNO, SENHA_ALUNO2, codigoCadastro, codigoPendente, codigoAntigo];
    checar(
      "nenhum log do cadastro tem e-mail, RGM, senha ou código",
      logsCadastro.every((l) => !textosSensiveisCadastro.some((s) => (l.detalhe ?? "").includes(s))),
      logsCadastro.filter((l) => textosSensiveisCadastro.some((s) => (l.detalhe ?? "").includes(s))).map((l) => l.detalhe),
    );

    requisito("R33 Regras da senha nova (cadastro e recuperação)");
    const cadastroSenha = { ...cadastroValido, emailInstitucional: `req.senha.${sufixo}@alunos.umc.br`, rgm: rgmAleatorio() };
    emailsDeCadastro.push(cadastroSenha.emailInstitucional);
    const casosDeSenha: [string, string][] = [
      ["sem letra maiúscula", "senha@aluno123"],
      ["sem número", "Senha@Aluno"],
      ["sem caractere especial", "SenhaAluno123"],
      ["só com espaço como \"especial\"", "Senha Aluno123"],
      ["com 65 caracteres", `Aa1!${"x".repeat(61)}`],
    ];
    for (const [caso, senha] of casosDeSenha) {
      r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroSenha, senha } });
      checar(
        `senha ${caso} -> 422 no campo senha, com a mensagem da regra`,
        r.status === 422 &&
          r.corpo.erros?.some(
            (e: { campo: string; mensagem: string }) =>
              e.campo === "senha" && e.mensagem === "A senha deve ter de 8 a 64 caracteres, com pelo menos uma letra maiúscula, um número e um caractere especial.",
          ),
        r.corpo,
      );
    }
    r = await chamar("POST", "/auth/registro", { corpo: { ...cadastroSenha, senha: `Áa1!${"x".repeat(60)}` } });
    checar("64 caracteres, com a maiúscula acentuada (Á) -> aceita (202)", r.status === 202, r.corpo);
    await prisma.cadastroPendente.deleteMany({ where: { emailLogin: cadastroSenha.emailInstitucional } });

    requisito("R02 Login");
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: emailAluno, senha: SENHA_ALUNO } });
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
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: emailAluno, senha: SENHA_ALUNO } });
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
    checar("senha continua só como hash bcrypt", usuarioNoBanco?.senhaHash.startsWith("$2a$12$") === true && usuarioNoBanco.senhaHash !== SENHA_ALUNO);
    r = await chamar("GET", "/usuarios/me", { token: aluno.token });
    checar(
      "a API continua devolvendo o RGM junto com a conta (vem do participante)",
      r.status === 200 && r.corpo.rgm === rgmAluno && r.corpo.nome === "Aluno Teste Requisitos",
      r.corpo,
    );
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: `  ${emailAluno.toUpperCase()} `, senha: SENHA_ALUNO } });
    checar("login aceita o e-mail com maiúsculas e espaços (normalizado)", r.status === 200 && !!r.corpo.token, r.status);
    const logCadastro = await prisma.logAuditoria.findFirst({ where: { usuarioId: aluno.id, acao: "CADASTRO_CONCLUIDO" } });
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
    const codigoSalaTeste = codigoDeSala();
    r = await chamar("POST", "/salas", { token: admin.token, corpo: { nome: codigoSalaTeste, tipo: "SALA_DE_AULA", capacidade: 0 } });
    checar("capacidade zero -> 422", r.status === 422, r.corpo);
    const camposDoErro = (resposta: Resposta) => (resposta.corpo?.erros ?? []).map((e: { campo: string }) => e.campo);
    for (const codigoInvalido of [`Sala Teste ${sufixo}`, "4T-01", "1X-01", "11-22", "11-00", "11-1", "1T01"]) {
      r = await chamar("POST", "/salas", { token: admin.token, corpo: { nome: codigoInvalido, tipo: "SALA_DE_AULA", capacidade: 10 } });
      checar(`código de sala fora do padrão (${codigoInvalido.startsWith("Sala") ? "nome livre" : codigoInvalido}) -> 422 no campo nome`, r.status === 422 && camposDoErro(r).includes("nome"), r.corpo);
    }
    r = await chamar("POST", "/salas", { token: admin.token, corpo: { nome: codigoSalaTeste, tipo: "COZINHA", capacidade: 10 } });
    checar("tipo de sala fora da lista -> 422 no campo tipo", r.status === 422 && camposDoErro(r).includes("tipo"), r.corpo);
    r = await chamar("POST", "/salas", { token: admin.token, corpo: { nome: codigoSalaTeste.toLowerCase(), tipo: "LABORATORIO", capacidade: 2 } });
    checar(
      "equipe cria sala no padrão da UMC -> 201, código em maiúsculas e com o tipo",
      r.status === 201 && r.corpo.nome === codigoSalaTeste && r.corpo.tipo === "LABORATORIO",
      r.corpo,
    );
    const salaId: string = r.corpo.id;
    salas.push(salaId);
    r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: codigoSalaTeste, tipo: "AUDITORIO", capacidade: 100 } });
    checar(
      "código repetido -> 409 \"Já existe uma sala <código>\"",
      r.status === 409 && r.corpo.code === "SALA_DUPLICADA" && r.corpo.message === `Já existe uma sala ${codigoSalaTeste}.`,
      r.corpo,
    );
    r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: codigoDeSala(), tipo: "SALA_DE_AULA", capacidade: 1 } });
    const salaPequenaId: string = r.corpo.id;
    salas.push(salaPequenaId);
    r = await chamar("PUT", `/salas/${salaPequenaId}`, { token: secretaria.token, corpo: { nome: codigoSalaTeste } });
    checar("editar para um código que outra sala já usa -> 409", r.status === 409 && r.corpo.code === "SALA_DUPLICADA", r.corpo);
    const codigoEditado = codigoDeSala();
    r = await chamar("PUT", `/salas/${salaId}`, { token: secretaria.token, corpo: { nome: codigoEditado, tipo: "SALA_DE_AULA" } });
    checar("secretaria edita sala -> 200", r.status === 200 && r.corpo.nome === codigoEditado && r.corpo.tipo === "SALA_DE_AULA", r.corpo);
    r = await chamar("PUT", `/salas/${salaId}`, { token: secretaria.token, corpo: { capacidade: 2 } });
    checar("editar só a capacidade mantém o código", r.status === 200 && r.corpo.nome === codigoEditado, r.corpo);
    r = await chamar("GET", "/salas", { token: secretaria.token });
    const chaveOrdem = (nome: string) => `${nome[0]}${nome[1] === "T" ? "0" : nome[1]}${nome.slice(3)}`;
    const nomesDasSalas: string[] = (r.corpo ?? []).map((sala: { nome: string }) => sala.nome).filter((nome: string) => /^[1-3][T1-3]-d{2}$/.test(nome));
    checar(
      "lista de salas por prédio, andar (térreo antes do 1º) e número, cada uma com o tipo",
      r.status === 200 &&
        nomesDasSalas.every((nome, i) => i === 0 || chaveOrdem(nomesDasSalas[i - 1]) < chaveOrdem(nome)) &&
        r.corpo.every((sala: { tipo?: string }) => ["SALA_DE_AULA", "LABORATORIO", "AUDITORIO"].includes(sala.tipo ?? "")),
      nomesDasSalas.slice(0, 6),
    );
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
    const emHoras = (iso: string, horas: number) => new Date(new Date(iso).getTime() + horas * 3600 * 1000).toISOString();
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
    r = await chamar("POST", "/eventos", { token: admin.token, corpo: { ...eventoBase, titulo: `Evento Lotado ${sufixo}`, salaId: salaPequenaId, horario: emHoras(emBreve, 3), questionario: questionario() } });
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
    // "Evento Lotado" ocupa a sala pequena de emBreve + 3h ate emBreve + 5h (depois do evento principal, que vai
    // de emBreve ate emBreve + 2h: o mesmo aluno pode estar nos dois); o "Evento Encostado" (emBreve + 5h) fica
    // fora da janela do check-in, o que o R12 usa pra conferir a regra
    r = await chamar("POST", "/eventos", {
      token: admin.token,
      corpo: { ...eventoBase, titulo: `Evento Cruzado ${sufixo}`, salaId: salaPequenaId, horario: emHoras(emBreve, 4), questionario: questionario() },
    });
    checar(
      "evento que cruza outro na mesma sala -> 409 CONFLITO_DE_SALA citando o outro evento",
      r.status === 409 && r.corpo.code === "CONFLITO_DE_SALA" && r.corpo.message.includes(`Evento Lotado ${sufixo}`),
      r.corpo,
    );
    r = await chamar("POST", "/eventos", {
      token: admin.token,
      corpo: { ...eventoBase, titulo: `Evento Encostado ${sufixo}`, salaId: salaPequenaId, horario: emHoras(emBreve, 5), cargaHoraria: 1, questionario: questionario() },
    });
    checar("evento que começa exatamente quando o outro termina não é conflito -> 201", r.status === 201, r.corpo);
    const eventoEncostadoId: string = r.corpo.id;
    eventos.push(eventoEncostadoId);
    r = await chamar("PUT", `/eventos/${eventoLotadoId}`, { token: secretaria.token, corpo: { horario: emHoras(emBreve, 3), cargaHoraria: 2 } });
    checar("editar mantendo o horário não conflita com o próprio evento -> 200", r.status === 200, r.corpo);
    r = await chamar("PUT", `/eventos/${eventoEncostadoId}`, { token: secretaria.token, corpo: { horario: emHoras(emBreve, 4) } });
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
    // o evento principal (comeca em 30 min) ja tem o check-in aberto e ainda nao comecou: o aluno 2 pede o
    // check-in (fica SOLICITADO ate o R13, quando a secretaria aprova)
    r = await chamar("POST", `/eventos/${eventoId}/checkin`, { token: aluno2.token });
    checar("aluno 2 pede o check-in do evento principal -> 200 SOLICITADO", r.status === 200 && r.corpo.statusPresenca === "SOLICITADO", r.corpo);
    r = await chamar("DELETE", `/eventos/${eventoId}/inscricoes`, { token: aluno2.token });
    checar("inscrição com check-in pedido não é cancelada pelo aluno -> 409 CHECKIN_JA_SOLICITADO", r.status === 409 && r.corpo.code === "CHECKIN_JA_SOLICITADO", r.corpo);
    r = await chamar("DELETE", `/inscricoes/${inscricaoAluno2}`, { token: secretaria.token });
    checar("nem pela equipe -> 409 CHECKIN_JA_SOLICITADO", r.status === 409 && r.corpo.code === "CHECKIN_JA_SOLICITADO", r.corpo);
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

    requisito("R12 Check-in pedido pelo aluno e aprovado pelo professor do evento ou pela equipe");
    // o "Evento Encostado" comeca daqui a 5h30: a janela (1 hora antes do inicio) ainda nao abriu
    r = await chamar("POST", `/eventos/${eventoEncostadoId}/checkin`, { token: aluno.token });
    checar(
      "pedido antes de 1 hora do início -> 409 CHECKIN_NAO_LIBERADO",
      r.status === 409 && r.corpo.code === "CHECKIN_NAO_LIBERADO" && r.corpo.message === "O check-in deste evento só abre 1 hora antes do início.",
      r.corpo,
    );
    r = await chamar("POST", `/eventos/${eventoId}/checkin`, { token: aluno.token });
    checar(
      "pedido dentro da janela grava SOLICITADO e a hora do pedido, ainda sem decisão",
      r.status === 200 && r.corpo.statusPresenca === "SOLICITADO" && !!r.corpo.checkinSolicitadoEm && r.corpo.usuarioId === null && r.corpo.dataCheckin === null,
      r.corpo,
    );
    checar(
      "pedido na auditoria (CHECKIN_SOLICITADO, só com ids)",
      !!(await prisma.logAuditoria.findFirst({ where: { acao: "CHECKIN_SOLICITADO", usuarioId: aluno.id, detalhe: { contains: inscricaoAluno } } })),
    );
    r = await chamar("POST", `/eventos/${eventoId}/checkin`, { token: aluno.token });
    checar("pedir de novo -> 409 CHECKIN_JA_SOLICITADO", r.status === 409 && r.corpo.code === "CHECKIN_JA_SOLICITADO", r.corpo);
    r = await chamar("POST", `/eventos/${eventoLotadoId}/checkin`, { token: aluno.token });
    checar("aluno não inscrito no evento -> 404 INSCRICAO_NAO_ENCONTRADA", r.status === 404 && r.corpo.code === "INSCRICAO_NAO_ENCONTRADA", r.corpo);
    r = await chamar("POST", `/eventos/${eventoId}/checkin`, { token: secretaria.token });
    checar("só o aluno pede o check-in -> 403", r.status === 403, r.status);
    r = await chamar("PUT", `/inscricoes/${inscricaoAluno}`, { token: secretaria.token, corpo: { statusPresenca: "PRESENTE" } });
    checar("a equipe não marca mais presença direto (rota antiga não existe) -> 404", r.status === 404, r.status);
    r = await chamar("POST", `/checkin/inscricoes/${inscricaoAluno}/aprovar`, { token: aluno.token });
    checar("aluno não aprova check-in -> 403", r.status === 403, r.status);
    r = await chamar("POST", `/eventos/${eventoId}/questionario/respostas`, { token: aluno.token, corpo: { respostas: Array(10).fill(0) } });
    checar("pedido ainda não aprovado (SOLICITADO) não libera o questionário -> 403", r.status === 403, r.corpo);
    r = await chamar("POST", `/checkin/inscricoes/${inscricaoAluno}/aprovar`, { token: secretaria.token });
    checar(
      "secretaria aprova: PRESENTE, com quem decidiu (do token) e quando",
      r.status === 200 && r.corpo.statusPresenca === "PRESENTE" && r.corpo.usuarioId === secretaria.id && !!r.corpo.dataCheckin,
      r.corpo,
    );
    checar(
      "aprovação na auditoria (CHECKIN_APROVADO)",
      !!(await prisma.logAuditoria.findFirst({ where: { acao: "CHECKIN_APROVADO", usuarioId: secretaria.id, detalhe: { contains: inscricaoAluno } } })),
    );
    r = await chamar("POST", `/checkin/inscricoes/${inscricaoAluno}/aprovar`, { token: secretaria.token });
    checar("aprovar de novo -> 409 CHECKIN_JA_DECIDIDO", r.status === 409 && r.corpo.code === "CHECKIN_JA_DECIDIDO", r.corpo);

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
    // aluno 2: o pedido de check-in (R27) e aprovado pela secretaria; reprova 2x e esgota as tentativas
    r = await chamar("POST", `/checkin/inscricoes/${inscricaoAluno2}/aprovar`, { token: secretaria.token });
    checar("pedido do aluno 2 aprovado -> 200 PRESENTE", r.status === 200 && r.corpo.statusPresenca === "PRESENTE", r.corpo);
    await chamar("POST", `/eventos/${eventoId}/questionario/respostas`, { token: aluno2.token, corpo: { respostas: Array(10).fill(1) } });
    await chamar("POST", `/eventos/${eventoId}/questionario/respostas`, { token: aluno2.token, corpo: { respostas: Array(10).fill(2) } });
    r = await chamar("POST", `/eventos/${eventoId}/questionario/respostas`, { token: aluno2.token, corpo: { respostas: Array(10).fill(0) } });
    checar("terceira tentativa -> 409 LIMITE_TENTATIVAS_ATINGIDO", r.status === 409 && r.corpo.code === "LIMITE_TENTATIVAS_ATINGIDO", r.corpo);

    // ------------------------------------------------------------------ RF015: presenca travada
    requisito("R28 Presença travada depois do questionário (RF015)");
    r = await chamar("POST", `/checkin/inscricoes/${inscricaoAluno}/recusar`, { token: secretaria.token });
    checar(
      "reverter a presença de quem já respondeu o questionário -> 409 com a mensagem da regra",
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
    checar("evento com presença confirmada aparece como elegível", r.status === 200 && r.corpo.some((e: { id: string }) => e.id === eventoId), r.corpo);
    // o aluno nao esta inscrito no "Evento Lotado": sem presenca confirmada, nao avalia
    r = await chamar("POST", "/feedbacks", { token: aluno.token, corpo: { eventoId: eventoLotadoId, nota: 4, comentario: "Sem presença" } });
    checar("sem presença confirmada no evento não avalia -> 403", r.status === 403 && r.corpo.code === "PRESENCA_NAO_CONFIRMADA", r.corpo);
    r = await chamar("POST", "/feedbacks", { token: aluno.token, corpo: { eventoId, nota: 6, comentario: "Nota inválida" } });
    checar("nota fora de 1 a 5 -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/feedbacks", { token: aluno.token, corpo: { eventoId, participanteId: aluno2.participanteId, nota: 5, comentario: "Ótima palestra" } });
    checar("aluno com presença confirmada avalia -> 201 (participanteId do token)", r.status === 201 && r.corpo.participanteId === aluno.participanteId, r.corpo);
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

    // ------------------------------------------------------------------ listas da equipe paginadas no servidor
    // (o teste de carga com 10 mil alunos mostrou as listas inteiras passando do limite de 4,5 MB da Vercel)
    requisito("R31 Inscrições e certificados da equipe paginados e filtrados no servidor");
    r = await chamar("GET", `/inscricoes/gestao?eventoId=${eventoId}&pageSize=2`, { token: secretaria.token });
    const totalDoEvento = await prisma.inscricao.count({ where: { eventoId } });
    checar(
      "inscrições: página com total, itens do evento pedido e nome/RGM do aluno já juntos",
      r.status === 200 &&
        r.corpo.total === totalDoEvento &&
        r.corpo.pageSize === 2 &&
        r.corpo.itens.length === Math.min(2, totalDoEvento) &&
        r.corpo.totalPages === Math.ceil(totalDoEvento / 2) &&
        r.corpo.itens.every((i: { eventoId: string; eventoTitulo: string; participanteNome: string }) => i.eventoId === eventoId && !!i.eventoTitulo && !!i.participanteNome),
      r.corpo,
    );
    r = await chamar("GET", `/inscricoes/gestao?busca=${rgmAluno}`, { token: secretaria.token });
    const inscricoesDoAluno = await prisma.inscricao.count({ where: { participanteId: aluno.participanteId! } });
    checar(
      "inscrições: busca pelo RGM traz só as do aluno",
      r.status === 200 &&
        r.corpo.total === inscricoesDoAluno &&
        r.corpo.itens.every((i: { participanteId: string; participanteRgm: string }) => i.participanteId === aluno.participanteId && i.participanteRgm === rgmAluno),
      r.corpo,
    );
    r = await chamar("GET", `/inscricoes/gestao?eventoId=${eventoId}&status=PRESENTE`, { token: secretaria.token });
    checar(
      "inscrições: filtro por presença",
      r.status === 200 && r.corpo.total > 0 && r.corpo.itens.every((i: { statusPresenca: string }) => i.statusPresenca === "PRESENTE"),
      r.corpo,
    );
    r = await chamar("GET", "/inscricoes/gestao?status=TALVEZ", { token: secretaria.token });
    checar("inscrições: filtro inválido -> 422", r.status === 422, r.corpo);
    r = await chamar("GET", "/inscricoes/gestao", { token: aluno.token });
    checar("inscrições: aluno não usa a lista da equipe -> 403", r.status === 403, r.status);
    r = await chamar("GET", `/certificados/situacao?eventoId=${eventoId}&busca=${rgmAluno}`, { token: secretaria.token });
    checar(
      "certificados: situação montada no servidor (melhor nota, tentativas e código emitido)",
      r.status === 200 &&
        r.corpo.total === 1 &&
        r.corpo.itens[0].inscricaoId === inscricaoAluno &&
        r.corpo.itens[0].melhorPercentual === 100 &&
        r.corpo.itens[0].tentativasUsadas === 2 &&
        r.corpo.itens[0].questionarioAprovado === true &&
        r.corpo.itens[0].codigoValidacao === certificado.codigoValidacao,
      r.corpo,
    );
    r = await chamar("GET", `/certificados/situacao?eventoId=${eventoId}&pageSize=1`, { token: secretaria.token });
    const presentesNoEvento = await prisma.inscricao.count({ where: { eventoId, statusPresenca: "PRESENTE" } });
    checar(
      "certificados: só inscrições com presença confirmada, uma página por vez",
      r.status === 200 && r.corpo.total === presentesNoEvento && r.corpo.itens.length === 1,
      r.corpo,
    );
    r = await chamar("GET", "/certificados/situacao", { token: aluno.token });
    checar("certificados: aluno não usa a lista da equipe -> 403", r.status === 403, r.status);

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
    r = await chamar("GET", `/participantes/alunos?busca=${rgmAluno}`, { token: secretaria.token });
    checar(
      "busca de alunos (check-in) por RGM traz o aluno já legível",
      r.status === 200 && r.corpo.length === 1 && r.corpo[0].id === aluno.participanteId && r.corpo[0].email === emailAluno,
      r.corpo,
    );
    r = await chamar("GET", `/participantes/alunos?busca=${encodeURIComponent("aluno teste requisitos")}`, { token: secretaria.token });
    checar(
      "busca por nome no servidor ignora maiúsculas/minúsculas",
      r.status === 200 && r.corpo.some((p: { id: string }) => p.id === aluno.participanteId),
      r.corpo?.length,
    );
    r = await chamar("GET", "/participantes/alunos?limite=1", { token: secretaria.token });
    checar("a busca devolve no máximo o limite pedido (não baixa todos os alunos)", r.status === 200 && r.corpo.length === 1, r.corpo?.length);
    r = await chamar("GET", "/participantes/alunos", { token: aluno.token });
    checar("aluno não busca outros alunos -> 403", r.status === 403, r.status);
    const novoEmailAluno2 = `req.aluno2.corrigido.${sufixo}@alunos.umc.br`;
    r = await chamar("PUT", `/participantes/${aluno2.participanteId}`, {
      token: secretaria.token,
      corpo: { nome: "Segundo Aluno Editado", email: novoEmailAluno2 },
    });
    checar(
      "e-mail no corpo da edição -> 422 \"O e-mail não pode ser alterado.\" (nada é gravado)",
      r.status === 422 && r.corpo.message === "O e-mail não pode ser alterado." && r.corpo.erros?.some((e: { campo: string }) => e.campo === "email"),
      r.corpo,
    );
    r = await chamar("PUT", `/participantes/${aluno2.participanteId}`, { token: secretaria.token, corpo: { email: emailAluno2 } });
    checar("mesmo o e-mail igual ao atual é recusado -> 422", r.status === 422, r.status);
    r = await chamar("PUT", `/participantes/${aluno2.participanteId}`, { token: secretaria.token, corpo: { nome: "Segundo Aluno Editado" } });
    checar("equipe corrige o nome -> 200, e-mail continua o mesmo", r.status === 200 && r.corpo.nome === "Segundo Aluno Editado" && r.corpo.email === emailAluno2, r.corpo);
    r = await chamar("PUT", `/participantes/${aluno2.participanteId}`, { token: secretaria.token, corpo: { rgm: "12345" } });
    checar("RGM continua validado na correção -> 422", r.status === 422, r.status);
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: emailAluno2, senha: aluno2.senha } });
    checar("o aluno continua entrando com o e-mail do cadastro (já com o nome corrigido)", r.status === 200 && r.corpo.usuario?.nome === "Segundo Aluno Editado", r.corpo);
    aluno2.token = r.corpo.token;
    checar("nenhuma conta foi criada ou alterada com o e-mail recusado", !(await prisma.usuario.findUnique({ where: { emailLogin: novoEmailAluno2 } })));

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
    // o evento passado terminou ha 23 h: a janela do check-in ainda esta aberta. O pedido entra direto no
    // banco (o aluno inativo nao tem sessao), como se tivesse sido feito antes da inativacao
    await prisma.inscricao.update({ where: { id: inscricaoPassada }, data: { statusPresenca: "SOLICITADO", checkinSolicitadoEm: new Date() } });
    r = await chamar("POST", `/checkin/inscricoes/${inscricaoPassada}/aprovar`, { token: secretaria.token });
    checar("aprovar o check-in de aluno inativo -> 409 PARTICIPANTE_INATIVO", r.status === 409 && r.corpo.code === "PARTICIPANTE_INATIVO", r.corpo);
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
    const emailSemConta = `ninguem.${sufixo}@alunos.umc.br`;
    const pedidoSemConta = await chamar("POST", "/auth/recuperacao-senha", { corpo: { email: emailSemConta } });
    checar(
      "e-mail sem conta -> o mesmo 200 de quem tem conta (não revela quem está cadastrado)",
      pedidoSemConta.status === 200 && JSON.stringify(pedidoSemConta.corpo) === "{}",
      pedidoSemConta,
    );
    const confirmacaoSemConta = await chamar("POST", "/auth/recuperacao-senha/confirmar", { corpo: { email: emailSemConta, codigo: "123456", novaSenha: SENHA_NOVA } });
    checar(
      "confirmar com e-mail sem conta -> o mesmo 422 de código errado",
      confirmacaoSemConta.status === 422 && confirmacaoSemConta.corpo.code === "CODIGO_INVALIDO",
      confirmacaoSemConta.corpo,
    );
    await prisma.limiteAcesso.deleteMany({ where: { chave: `recuperacao:conta:${indiceBusca(emailSemConta)}` } });
    r = await chamar("POST", "/auth/recuperacao-senha/confirmar", { corpo: { email: emailAluno, codigo: codigoDemo === "000000" ? "111111" : "000000", novaSenha: SENHA_NOVA } });
    checar("código errado -> 422", r.status === 422 && r.corpo.code === "CODIGO_INVALIDO", r.corpo);
    r = await chamar("POST", "/auth/recuperacao-senha/confirmar", { corpo: { email: emailAluno, codigo: codigoDemo, novaSenha: "NovaSenha123" } });
    checar(
      "nova senha fora da regra (sem caractere especial) -> 422 no campo novaSenha, senha não muda",
      r.status === 422 && r.corpo.erros?.some((e: { campo: string }) => e.campo === "novaSenha"),
      r.corpo,
    );
    r = await chamar("POST", "/auth/recuperacao-senha/confirmar", { corpo: { email: emailAluno, codigo: codigoDemo, novaSenha: SENHA_NOVA } });
    checar("código certo troca a senha -> 200", r.status === 200, r.corpo);
    r = await chamar("GET", "/usuarios/me", { token: aluno.token });
    checar("sessão antiga cai depois da troca -> 401", r.status === 401, r.status);
    aluno.senha = SENHA_NOVA;
    aluno.token = await entrar(aluno);
    checar("login com a senha nova funciona", !!aluno.token);

    // ------------------------------------------------------------------ auditoria
    requisito("R18 Trilha de auditoria");
    r = await chamar("GET", `/logs-auditoria?acao=SALA_CRIADA&usuarioId=${admin.id}`, { token: admin.token });
    checar("filtro por ação e responsável", r.status === 200 && r.corpo.itens.some((l: { detalhe: string }) => l.detalhe.includes(salaId)), r.corpo);
    r = await chamar("GET", "/logs-auditoria?pageSize=500", { token: admin.token });
    checar("parâmetro inválido -> 422", r.status === 422, r.status);
    r = await chamar("GET", "/logs-auditoria/responsaveis", { token: admin.token });
    checar("lista de responsáveis", r.status === 200 && r.corpo.some((u: { id: string }) => u.id === admin.id), r.status);
    const logsDoTeste = await prisma.logAuditoria.findMany({ where: { usuarioId: { in: contas.map((c) => c.id) } } });
    const sensiveis = [emailAluno, emailAluno2, novoEmailAluno2, rgmAluno, "Avaliação corrigida", "Segundo Aluno Editado", SENHA_ALUNO, SENHA_ALUNO2, SENHA_NOVA, codigoDemo, "Ótima palestra", "Teste automatizado"];
    checar(
      "nenhum log do teste tem e-mail, RGM, senha, código, comentário ou motivo",
      logsDoTeste.every((l) => !sensiveis.some((s) => (l.detalhe ?? "").includes(s))),
      logsDoTeste.filter((l) => sensiveis.some((s) => (l.detalhe ?? "").includes(s))).map((l) => l.detalhe),
    );

    // ------------------------------------------------------------------ dashboard
    requisito("R25 Dashboard da equipe (endpoint agregado)");
    // aprendizagem: no evento principal o aluno 1 foi aprovado (0% e 100%) e o aluno 2 reprovou nas 2
    // tentativas (R13). Falta o caso "ainda pode responder": o aluno 2 ganha presenca no evento passado e
    // responde 1 vez abaixo de 60%
    r = await chamar("POST", `/checkin/inscricoes/${inscricaoPassada}/aprovar`, { token: secretaria.token });
    checar("check-in do aluno 2 aprovado no evento passado, ainda na janela (cenário do indicador) -> 200", r.status === 200, r.corpo);
    aluno2.token = await entrar(aluno2);
    r = await chamar("POST", `/eventos/${eventoPassadoId}/questionario/respostas`, { token: aluno2.token, corpo: { respostas: Array(10).fill(1) } });
    checar("aluno 2 responde 1 vez abaixo de 60% no evento passado -> 201", r.status === 201 && r.corpo.percentual < 60, r.corpo);
    r = await chamar("GET", "/dashboard", { token: secretaria.token });
    const totais = r.corpo?.totais;
    checar(
      "equipe recebe os indicadores numa chamada só -> 200",
      r.status === 200 && typeof totais?.eventos === "number" && totais.inscricoes === totais.presentes + totais.ausentes + totais.aguardando,
      r.corpo,
    );
    const eventoNoDashboard = r.corpo?.eventos?.find((e: { id: string }) => e.id === eventoLotadoId);
    const inscricoesDoEventoLotado = await prisma.inscricao.count({ where: { eventoId: eventoLotadoId } });
    checar(
      "presença por evento bate com as inscrições do banco",
      eventoNoDashboard?.inscritos === inscricoesDoEventoLotado &&
        eventoNoDashboard.inscritos === eventoNoDashboard.presentes + eventoNoDashboard.ausentes + eventoNoDashboard.aguardando,
      eventoNoDashboard,
    );
    const ocupacaoEsperada = await ocupacaoEsperadaNoBanco();
    checar(
      "ocupação média das salas = média de presentes / capacidade entre os eventos encerrados (RF021)",
      ocupacaoEsperada === null
        ? totais?.ocupacaoMediaSalas === null
        : typeof totais?.ocupacaoMediaSalas === "number" && Math.abs(totais.ocupacaoMediaSalas - ocupacaoEsperada) < 0.01,
      { recebido: totais?.ocupacaoMediaSalas, esperado: ocupacaoEsperada },
    );
    type EventoAprendizagem = { id: string; presentes: number; aprovados: number; reprovados: number; podemResponder: number };
    const eventosDoDashboard: EventoAprendizagem[] = r.corpo?.eventos ?? [];
    const aprendizagemDe = (id: string) => eventosDoDashboard.find((e) => e.id === id);
    checar(
      "aprendizagem no evento principal: 1 aprovado (alguma tentativa ≥ 60%) e 1 reprovado (2 tentativas abaixo de 60%)",
      aprendizagemDe(eventoId)?.aprovados === 1 && aprendizagemDe(eventoId)?.reprovados === 1 && aprendizagemDe(eventoId)?.podemResponder === 0,
      aprendizagemDe(eventoId),
    );
    checar(
      "aprendizagem no evento passado: presente com 1 tentativa abaixo de 60% ainda pode responder",
      aprendizagemDe(eventoPassadoId)?.podemResponder === 1 && aprendizagemDe(eventoPassadoId)?.aprovados === 0 && aprendizagemDe(eventoPassadoId)?.reprovados === 0,
      aprendizagemDe(eventoPassadoId),
    );
    checar(
      "em todo evento, aprovados + reprovados + ainda podem responder = presentes",
      eventosDoDashboard.length > 0 && eventosDoDashboard.every((e) => e.aprovados + e.reprovados + e.podemResponder === e.presentes),
    );
    // a mesma conta feita direto no banco, tentativa por tentativa (sem o agrupamento do backend)
    const [presencasDb, tentativasDb] = await Promise.all([
      prisma.inscricao.findMany({ where: { statusPresenca: "PRESENTE" }, select: { participanteId: true, eventoId: true } }),
      prisma.tentativaQuestionario.findMany({ select: { participanteId: true, eventoId: true, percentual: true } }),
    ]);
    const esperado = new Map<string, { aprovados: number; reprovados: number; podemResponder: number }>();
    for (const p of presencasDb) {
      const notas = tentativasDb.filter((t) => t.participanteId === p.participanteId && t.eventoId === p.eventoId).map((t) => t.percentual);
      const conta = esperado.get(p.eventoId) ?? { aprovados: 0, reprovados: 0, podemResponder: 0 };
      if (notas.some((n) => n >= 60)) conta.aprovados += 1;
      else if (notas.length >= 2) conta.reprovados += 1;
      else conta.podemResponder += 1;
      esperado.set(p.eventoId, conta);
    }
    checar(
      "aprovados, reprovados e ainda podem responder de cada evento batem com o banco",
      eventosDoDashboard.every((e) => {
        const conta = esperado.get(e.id) ?? { aprovados: 0, reprovados: 0, podemResponder: 0 };
        return e.aprovados === conta.aprovados && e.reprovados === conta.reprovados && e.podemResponder === conta.podemResponder;
      }),
    );
    const aprovadosDb = [...esperado.values()].reduce((s, c) => s + c.aprovados, 0);
    const reprovadosDb = [...esperado.values()].reduce((s, c) => s + c.reprovados, 0);
    const taxaEsperada = aprovadosDb + reprovadosDb > 0 ? (aprovadosDb / (aprovadosDb + reprovadosDb)) * 100 : null;
    checar(
      "taxa de aprovação = aprovados ÷ (aprovados + reprovados), sem contar quem ainda pode responder",
      typeof totais?.taxaAprovacao === "number" &&
        taxaEsperada !== null &&
        Math.abs(totais.taxaAprovacao - taxaEsperada) < 0.01 &&
        totais.aprovadosQuestionario === aprovadosDb &&
        totais.reprovadosQuestionario === reprovadosDb,
      { recebido: totais?.taxaAprovacao, esperado: taxaEsperada },
    );
    checar("certificados liberados = aprovados entre os presentes", totais?.certificadosLiberados === totais?.aprovadosQuestionario, totais);
    const textoDashboard = JSON.stringify(r.corpo);
    checar(
      "dashboard não traz dado pessoal (nome, e-mail, RGM de aluno) nem id de aluno",
      ![emailAluno, emailAluno2, novoEmailAluno2, rgmAluno, "Aluno Teste Requisitos", "Segundo Aluno Editado", aluno.participanteId!, aluno2.participanteId!, aluno.id, aluno2.id].some(
        (s) => textoDashboard.includes(s),
      ),
    );

    // ------------------------------------------------------------------ RF021: ocupacao real das salas
    requisito("R34 Ocupação das salas pelo uso real (presentes ÷ capacidade, só eventos encerrados)");
    r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: codigoDeSala(), tipo: "SALA_DE_AULA", capacidade: 10 } });
    const salaOcupacaoId: string = r.corpo.id;
    salas.push(salaOcupacaoId);
    r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: codigoDeSala(), tipo: "SALA_DE_AULA", capacidade: 5 } });
    const salaSemUsoId: string = r.corpo.id;
    salas.push(salaSemUsoId);
    // 4 alunos só deste cenário, criados direto no banco (participante + conta), apagados no fim com os outros
    const alunosOcupacao: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const participanteOcupacao = await prisma.participante.create({ data: { id: randomUUID(), rgm: rgmAleatorio() } });
      const contaOcupacao = await prisma.usuario.create({
        data: {
          id: randomUUID(),
          nome: `Aluno Ocupacao ${i}`,
          emailLogin: `req.ocupacao.${i}.${sufixo}@alunos.umc.br`,
          senhaHash: "!",
          perfil: "ALUNO",
          participanteId: participanteOcupacao.id,
        },
      });
      contas.push({ id: contaOcupacao.id, email: contaOcupacao.emailLogin, senha: "", perfil: "ALUNO", participanteId: participanteOcupacao.id });
      alunosOcupacao.push(participanteOcupacao.id);
    }
    const criarEventoNaSala = async (titulo: string, horario: Date, sala: string) => {
      const resposta = await chamar("POST", "/eventos", {
        token: admin.token,
        corpo: { titulo: `${titulo} ${sufixo}`, horario: horario.toISOString(), salaId: sala, palestranteId, tema: "Tema", cargaHoraria: 2, questionario: questionario() },
      });
      eventos.push(resposta.corpo.id);
      return resposta.corpo.id as string;
    };
    const inscrever = (eventoDaInscricao: string, participanteId: string, statusPresenca: "PRESENTE" | "AUSENTE" | "PENDENTE") =>
      prisma.inscricao.create({ data: { id: randomUUID(), participanteId, eventoId: eventoDaInscricao, statusPresenca } });

    // encerrado: comecou ha 3 dias, durou 2h. 4 inscritos, 2 presentes -> 20% (e nao 40%)
    const eventoEncerradoOcupacao = await criarEventoNaSala("Evento Encerrado Ocupação", new Date(Date.now() - 3 * 24 * 3600 * 1000), salaOcupacaoId);
    await inscrever(eventoEncerradoOcupacao, alunosOcupacao[0], "PRESENTE");
    await inscrever(eventoEncerradoOcupacao, alunosOcupacao[1], "PRESENTE");
    await inscrever(eventoEncerradoOcupacao, alunosOcupacao[2], "AUSENTE");
    await inscrever(eventoEncerradoOcupacao, alunosOcupacao[3], "PENDENTE");
    const ocupacaoDaSala = async () => {
      const lista = await chamar("GET", "/salas", { token: secretaria.token });
      return lista.corpo.find((s: { id: string }) => s.id === salaOcupacaoId) as { eventosRealizados: number; ocupacaoMedia: number | null };
    };
    let salaNaLista = await ocupacaoDaSala();
    checar(
      "evento encerrado numa sala de 10 lugares, com 4 inscritos e 2 presentes -> ocupação 20% (não 40%)",
      salaNaLista?.eventosRealizados === 1 && salaNaLista.ocupacaoMedia !== null && Math.abs(salaNaLista.ocupacaoMedia - 20) < 0.01,
      salaNaLista,
    );

    // futuro (daqui a 3 dias) e em andamento (comecou ha 30 min, dura 2h), na mesma sala: ficam fora da
    // conta mesmo com presente marcado
    const eventoFuturoOcupacao = await criarEventoNaSala("Evento Futuro Ocupação", new Date(Date.now() + 3 * 24 * 3600 * 1000), salaOcupacaoId);
    await inscrever(eventoFuturoOcupacao, alunosOcupacao[0], "PRESENTE");
    await inscrever(eventoFuturoOcupacao, alunosOcupacao[1], "PRESENTE");
    const eventoAndamentoOcupacao = await criarEventoNaSala("Evento Em Andamento Ocupação", new Date(Date.now() - 30 * 60 * 1000), salaOcupacaoId);
    await inscrever(eventoAndamentoOcupacao, alunosOcupacao[0], "PRESENTE");
    salaNaLista = await ocupacaoDaSala();
    checar(
      "evento futuro e evento em andamento na mesma sala não mudam a média nem contam como realizados",
      salaNaLista?.eventosRealizados === 1 && salaNaLista.ocupacaoMedia !== null && Math.abs(salaNaLista.ocupacaoMedia - 20) < 0.01,
      salaNaLista,
    );
    checar(
      "a ocupação da sala bate com o cálculo direto no banco",
      Math.abs((salaNaLista?.ocupacaoMedia ?? -1) - ((await ocupacaoEsperadaNoBanco(salaOcupacaoId)) ?? -2)) < 0.01,
    );

    // sala só com evento futuro
    await criarEventoNaSala("Evento Futuro Sem Uso", new Date(Date.now() + 4 * 24 * 3600 * 1000), salaSemUsoId);
    r = await chamar("GET", "/salas", { token: secretaria.token });
    const salaSemUso = r.corpo.find((s: { id: string }) => s.id === salaSemUsoId);
    checar("sala sem evento encerrado -> eventosRealizados 0 e ocupacaoMedia null", salaSemUso?.eventosRealizados === 0 && salaSemUso.ocupacaoMedia === null, salaSemUso);

    // dashboard x salas: a media geral do dashboard e a media das salas ponderada pelos eventos realizados
    const salasDaEquipe: { capacidade: number; eventosRealizados: number; ocupacaoMedia: number | null }[] = r.corpo;
    const comOcupacao = salasDaEquipe.filter((s) => s.ocupacaoMedia !== null);
    const eventosConsiderados = comOcupacao.reduce((soma, s) => soma + s.eventosRealizados, 0);
    const mediaPelasSalas = eventosConsiderados > 0 ? comOcupacao.reduce((soma, s) => soma + s.ocupacaoMedia! * s.eventosRealizados, 0) / eventosConsiderados : null;
    const dashboardOcupacao = (await chamar("GET", "/dashboard", { token: secretaria.token })).corpo?.totais?.ocupacaoMediaSalas;
    checar(
      "dashboard e listagem de salas mostram o mesmo número para os mesmos dados",
      mediaPelasSalas !== null && typeof dashboardOcupacao === "number" && Math.abs(dashboardOcupacao - mediaPelasSalas) < 0.01,
      { dashboard: dashboardOcupacao, salas: mediaPelasSalas },
    );
    checar(
      "ocupação do dashboard bate com o cálculo direto no banco",
      typeof dashboardOcupacao === "number" && Math.abs(dashboardOcupacao - ((await ocupacaoEsperadaNoBanco()) ?? -1)) < 0.01,
    );

    // permissao mantida: o aluno continua lendo nome e capacidade (usa na tela Eventos), sem os numeros novos
    r = await chamar("GET", "/salas", { token: aluno.token });
    checar(
      "aluno continua listando as salas (nome e capacidade), mas sem eventosRealizados nem ocupacaoMedia",
      r.status === 200 &&
        Array.isArray(r.corpo) &&
        r.corpo.length > 0 &&
        r.corpo.every((s: Record<string, unknown>) => !("eventosRealizados" in s) && !("ocupacaoMedia" in s)),
      r.corpo?.[0],
    );
    checar(
      "a listagem com ocupação traz só números, nenhum dado de aluno",
      !JSON.stringify(salasDaEquipe).includes("Aluno Ocupacao") && !JSON.stringify(salasDaEquipe).includes("req.ocupacao"),
    );

    // ------------------------------------------------------------------ perfil PROFESSOR
    requisito("R35 Conta de professor: criada pela equipe, ativada pelo link do convite");
    const SENHA_PROFESSOR = "Prof@Teste123";
    const emailProfA = `prof.a.${sufixo}@umc.br`;
    const MENSAGEM_CONVITE_INVALIDO = "Convite inválido ou vencido.";
    // os convites "enviados" (o e-mail sai simulado): guarda destinatario, nome e link de cada um
    const convitesEnviados: { destinatario: string; nome: string; link: string }[] = [];
    const enviarConviteOriginal = emailService.enviarConviteEquipe;
    emailService.enviarConviteEquipe = async (destinatario: string, nome: string, link: string) => {
      convitesEnviados.push({ destinatario, nome, link });
      return enviarConviteOriginal(destinatario, nome, link);
    };
    // a chave do convite fica depois do "#": #/primeiro-acesso?convite=...
    const conviteDo = (link?: string): string => {
      if (!link) return "";
      return new URLSearchParams(new URL(link).hash.split("?")[1] ?? "").get("convite") ?? "";
    };
    const sha256 = (texto: string) => createHash("sha256").update(texto, "utf8").digest("hex");

    r = await chamar("POST", "/professores", { token: secretaria.token, corpo: { nomeCompleto: "Professor Teste A", email: `prof.x.${sufixo}@alunos.umc.br` } });
    checar("e-mail @alunos.umc.br para professor -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/professores", { token: aluno.token, corpo: { nomeCompleto: "Professor Teste A", email: emailProfA } });
    checar("aluno não cria professor -> 403", r.status === 403, r.status);

    const emailSemEndereco = `prof.semurl.${sufixo}@umc.br`;
    const appUrlOriginal = env.appUrl;
    env.appUrl = null;
    r = await chamar("POST", "/professores", { token: secretaria.token, corpo: { nomeCompleto: "Professor Sem Endereco", email: emailSemEndereco } });
    env.appUrl = appUrlOriginal;
    checar(
      "sem APP_URL, criar professor é recusado com a mensagem e nenhuma conta é criada",
      r.status === 503 &&
        r.corpo.message === "O endereço do sistema não está configurado; não é possível enviar o convite." &&
        !(await prisma.usuario.findUnique({ where: { emailLogin: emailSemEndereco } })),
      r.corpo,
    );

    r = await chamar("POST", "/professores", { token: secretaria.token, corpo: { nomeCompleto: "Professor Teste A", email: emailProfA.toUpperCase() } });
    checar(
      "secretaria cria professor (só nome e e-mail) -> 201, aguardando primeiro acesso, com o link do convite fora de produção e sem código",
      r.status === 201 &&
        r.corpo.conta?.situacao === "AGUARDANDO_PRIMEIRO_ACESSO" &&
        r.corpo.conta.email === emailProfA &&
        typeof r.corpo.linkConviteDemo === "string" &&
        r.corpo.codigoDemo === undefined,
      r.corpo,
    );
    const professorA: Conta = { id: r.corpo.conta?.id, email: emailProfA, senha: SENHA_PROFESSOR, perfil: "PROFESSOR", participanteId: null };
    contas.push(professorA);
    const linkA: string = r.corpo.linkConviteDemo ?? "";
    const conviteA = conviteDo(linkA);
    const urlA = new URL(linkA || "http://x");
    const emailDoConvite = convitesEnviados[convitesEnviados.length - 1];
    const htmlDoConvite = emailDoConvite ? conteudoDoConvite(emailDoConvite.nome, emailDoConvite.link).html : "";
    checar(
      "o e-mail de convite tem o botão e o link com a chave depois do # (nada no caminho nem na consulta) e não tem código",
      emailDoConvite?.destinatario === emailProfA &&
        emailDoConvite.link === linkA &&
        urlA.origin === process.env.APP_URL?.replace(/\/+$/, "") &&
        urlA.hash === `#/primeiro-acesso?convite=${conviteA}` &&
        conviteA.length === 43 &&
        !urlA.pathname.includes(conviteA) &&
        !urlA.search.includes(conviteA) &&
        htmlDoConvite.includes("Criar minha senha") &&
        htmlDoConvite.includes("O link vale por 24 horas. Se ele vencer, peça um novo convite a quem criou a sua conta.") &&
        htmlDoConvite.split(linkA).length >= 3 &&
        !/\d{6}/.test(htmlDoConvite.split(linkA).join("")),
      { link: linkA, html: htmlDoConvite.slice(0, 200) },
    );
    const contaProfA = await prisma.usuario.findUnique({ where: { id: professorA.id }, include: { primeiroAcesso: true } });
    checar(
      "conta nasce sem senha utilizável e sem aceite dos Termos; no banco só o SHA-256 da chave, válido por 24 h",
      contaProfA?.senhaHash === "!" &&
        contaProfA.consentimentoLgpdEm === null &&
        !!contaProfA.primeiroAcesso &&
        contaProfA.primeiroAcesso.codigoHash === sha256(conviteA) &&
        contaProfA.primeiroAcesso.codigoHash !== conviteA &&
        Math.abs(contaProfA.primeiroAcesso.expiraEm.getTime() - Date.now() - 24 * 3600 * 1000) < 60 * 1000,
    );
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: emailProfA, senha: SENHA_PROFESSOR } });
    checar("professor não entra antes de usar o convite -> 401 genérico", r.status === 401 && r.corpo.code === "CREDENCIAIS_INVALIDAS", r.corpo);

    r = await chamar("POST", "/auth/primeiro-acesso/convite", { corpo: { convite: conviteA } });
    checar("consultar o convite devolve só o e-mail da conta", r.status === 200 && r.corpo.email === emailProfA && Object.keys(r.corpo).join() === "email", r.corpo);
    r = await chamar("POST", "/auth/primeiro-acesso/convite", { corpo: { convite: conviteA } });
    checar(
      "consultar a chave não gasta o convite (a segunda consulta vale e o convite continua no banco)",
      r.status === 200 && !!(await prisma.primeiroAcesso.findUnique({ where: { usuarioId: professorA.id } })),
      r.corpo,
    );
    r = await chamar("POST", "/auth/primeiro-acesso", { corpo: { convite: conviteA, novaSenha: SENHA_PROFESSOR, aceiteLgpd: false } });
    checar("sem o aceite dos Termos -> 422", r.status === 422 && r.corpo.erros?.some((e: { campo: string }) => e.campo === "aceiteLgpd"), r.corpo);
    r = await chamar("POST", "/auth/primeiro-acesso", { corpo: { convite: conviteA, novaSenha: "fraca", aceiteLgpd: true } });
    checar("senha fora da regra -> 422", r.status === 422 && r.corpo.erros?.some((e: { campo: string }) => e.campo === "novaSenha"), r.corpo);
    r = await chamar("POST", "/auth/primeiro-acesso/convite", { corpo: { convite: "A".repeat(43) } });
    checar("chave inexistente -> 422 CONVITE_INVALIDO com a mensagem genérica", r.status === 422 && r.corpo.code === "CONVITE_INVALIDO" && r.corpo.message === MENSAGEM_CONVITE_INVALIDO, r.corpo);

    // "Esqueci minha senha" de quem ainda espera o convite: nada sai e a resposta e a de e-mail inexistente
    const emailNinguemProf = `ninguem.prof.${sufixo}@umc.br`;
    const recuperacaoProf = await chamar("POST", "/auth/recuperacao-senha", { corpo: { email: emailProfA } });
    const recuperacaoNinguem = await chamar("POST", "/auth/recuperacao-senha", { corpo: { email: emailNinguemProf } });
    checar(
      "\"Esqueci minha senha\" de conta que espera o convite não gera código e responde igual a e-mail inexistente",
      recuperacaoProf.status === recuperacaoNinguem.status &&
        JSON.stringify(recuperacaoProf.corpo) === JSON.stringify(recuperacaoNinguem.corpo) &&
        !recuperacaoProf.corpo?.codigoDemo &&
        !(await prisma.recuperacaoSenha.findFirst({ where: { usuarioId: professorA.id } })),
      [recuperacaoProf.corpo, recuperacaoNinguem.corpo],
    );
    const confirmacaoProf = await chamar("POST", "/auth/recuperacao-senha/confirmar", { corpo: { email: emailProfA, codigo: "123456", novaSenha: SENHA_PROFESSOR } });
    const confirmacaoNinguem = await chamar("POST", "/auth/recuperacao-senha/confirmar", { corpo: { email: emailNinguemProf, codigo: "123456", novaSenha: SENHA_PROFESSOR } });
    checar(
      "a confirmação da recuperação também responde igual e não troca a senha",
      confirmacaoProf.status === confirmacaoNinguem.status &&
        // o corpo de erro traz a hora (timestamp), que sempre difere: compara o resto
        confirmacaoProf.corpo?.code === confirmacaoNinguem.corpo?.code &&
        confirmacaoProf.corpo?.message === confirmacaoNinguem.corpo?.message &&
        (await prisma.usuario.findUnique({ where: { id: professorA.id } }))?.senhaHash === "!",
      [confirmacaoProf.corpo, confirmacaoNinguem.corpo],
    );

    // convite vencido e reenvio, num professor so pra isso
    const emailProfV = `prof.v.${sufixo}@umc.br`;
    r = await chamar("POST", "/professores", { token: secretaria.token, corpo: { nomeCompleto: "Professor Teste Vencido", email: emailProfV } });
    const professorV: Conta = { id: r.corpo.conta?.id, email: emailProfV, senha: SENHA_PROFESSOR, perfil: "PROFESSOR", participanteId: null };
    contas.push(professorV);
    const conviteV = conviteDo(r.corpo.linkConviteDemo);
    await prisma.primeiroAcesso.update({ where: { usuarioId: professorV.id }, data: { expiraEm: new Date(Date.now() - 1000), ultimoEnvioEm: new Date(Date.now() - 120 * 1000) } });
    const consultaVencido = await chamar("POST", "/auth/primeiro-acesso/convite", { corpo: { convite: conviteV } });
    const ativacaoVencido = await chamar("POST", "/auth/primeiro-acesso", { corpo: { convite: conviteV, novaSenha: SENHA_PROFESSOR, aceiteLgpd: true } });
    checar(
      "convite vencido é recusado (consulta e ativação) com a mesma resposta de chave inexistente",
      [consultaVencido, ativacaoVencido].every((x) => x.status === 422 && x.corpo.code === "CONVITE_INVALIDO" && x.corpo.message === MENSAGEM_CONVITE_INVALIDO) &&
        (await prisma.usuario.findUnique({ where: { id: professorV.id } }))?.consentimentoLgpdEm === null,
      [consultaVencido.corpo, ativacaoVencido.corpo],
    );
    r = await chamar("POST", `/professores/${professorV.id}/reenviar-convite`, { token: secretaria.token });
    const conviteV2 = conviteDo(r.corpo.linkConviteDemo);
    const consultaAntigo = await chamar("POST", "/auth/primeiro-acesso/convite", { corpo: { convite: conviteV } });
    const consultaNovo = await chamar("POST", "/auth/primeiro-acesso/convite", { corpo: { convite: conviteV2 } });
    checar(
      "reenviar gera um convite novo (24 h de novo) e o anterior deixa de valer",
      r.status === 200 &&
        !!conviteV2 &&
        conviteV2 !== conviteV &&
        consultaAntigo.status === 422 &&
        consultaNovo.status === 200 &&
        consultaNovo.corpo.email === emailProfV &&
        !!(await prisma.logAuditoria.findFirst({ where: { acao: "PROFESSOR_CONVITE_REENVIADO", detalhe: { contains: professorV.id } } })),
      [r.corpo, consultaAntigo.corpo, consultaNovo.corpo],
    );
    r = await chamar("POST", `/professores/${professorV.id}/reenviar-convite`, { token: secretaria.token });
    checar("reenviar de novo antes de 60 s -> 429 AGUARDE_REENVIO", r.status === 429 && r.corpo.code === "AGUARDE_REENVIO", r.corpo);

    r = await chamar("POST", "/auth/primeiro-acesso", { corpo: { convite: conviteA, novaSenha: SENHA_PROFESSOR, aceiteLgpd: true } });
    checar("convite válido + senha + aceite -> 200", r.status === 200, r.corpo);
    const contaAtivada = await prisma.usuario.findUnique({ where: { id: professorA.id }, include: { primeiroAcesso: true } });
    checar(
      "grava a senha (hash), o aceite e a versão \"1\" dos Termos; o convite sai do banco",
      !!contaAtivada?.consentimentoLgpdEm && contaAtivada.versaoTermosAceitos === VERSAO_TERMOS_ATUAL && contaAtivada.senhaHash.startsWith("$2a$12$") && !contaAtivada.primeiroAcesso,
    );
    checar(
      "aceite do professor registrado na auditoria",
      !!(await prisma.logAuditoria.findFirst({ where: { usuarioId: professorA.id, acao: "CONSENTIMENTO_LGPD_ACEITO" } })) &&
        !!(await prisma.logAuditoria.findFirst({ where: { usuarioId: professorA.id, acao: "PRIMEIRO_ACESSO_CONCLUIDO" } })),
    );
    r = await chamar("POST", "/auth/primeiro-acesso", { corpo: { convite: conviteA, novaSenha: "Outra@Senha123", aceiteLgpd: true } });
    checar(
      "usar o mesmo convite de novo -> 422 CONVITE_INVALIDO (a senha não muda)",
      r.status === 422 && r.corpo.code === "CONVITE_INVALIDO" && (await bcrypt.compare(SENHA_PROFESSOR, (await prisma.usuario.findUnique({ where: { id: professorA.id } }))!.senhaHash)),
      r.corpo,
    );
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: emailProfA, senha: SENHA_PROFESSOR } });
    checar("depois de usar o convite o login funciona", r.status === 200 && !!r.corpo.token && r.corpo.usuario?.perfil === "PROFESSOR", r.corpo);
    professorA.token = r.corpo.token;
    r = await chamar("GET", "/professores", { token: secretaria.token });
    checar(
      "tela Professores lista o professor como ativo",
      r.status === 200 && r.corpo.some((p: { id: string; situacao: string }) => p.id === professorA.id && p.situacao === "ATIVO"),
      r.corpo,
    );
    r = await chamar("POST", `/professores/${professorA.id}/reenviar-convite`, { token: secretaria.token });
    checar("reenviar convite de quem já ativou a conta -> 409", r.status === 409, r.corpo);
    r = await chamar("POST", `/professores/${professorA.id}/reenviar-codigo`, { token: secretaria.token });
    checar("a rota antiga do código não existe mais -> 404", r.status === 404, r.status);

    // chave errada repetida: conta no limite por IP (20 em 15 min) e, bloqueado, nem a chave certa passa
    let tentativasAteBloquear = 0;
    let respostaErrada = await chamar("POST", "/auth/primeiro-acesso/convite", { corpo: { convite: `errada-${sufixo}` } });
    while (respostaErrada.status === 422 && tentativasAteBloquear < 30) {
      tentativasAteBloquear++;
      respostaErrada = await chamar("POST", "/auth/primeiro-acesso/convite", { corpo: { convite: `errada-${sufixo}-${tentativasAteBloquear}` } });
    }
    const certaBloqueada = await chamar("POST", "/auth/primeiro-acesso/convite", { corpo: { convite: conviteV2 } });
    checar(
      "chave errada repetida cai no limite por IP (429) e, bloqueado, nem a chave certa passa",
      respostaErrada.status === 429 && respostaErrada.corpo.code === "MUITAS_TENTATIVAS" && tentativasAteBloquear <= 20 && certaBloqueada.status === 429,
      { tentativasAteBloquear, status: respostaErrada.status, certa: certaBloqueada.status },
    );
    // o resto da rodada sai do mesmo IP: zera o contador local
    await limparContadorDoIpLocal();
    emailService.enviarConviteEquipe = enviarConviteOriginal;

    // segundo professor, pra conferir que um nao enxerga o do outro
    const emailProfB = `prof.b.${sufixo}@umc.br`;
    r = await chamar("POST", "/professores", { token: admin.token, corpo: { nomeCompleto: "Professor Teste B", email: emailProfB } });
    const professorB: Conta = { id: r.corpo.conta?.id, email: emailProfB, senha: SENHA_PROFESSOR, perfil: "PROFESSOR", participanteId: null };
    contas.push(professorB);
    await chamar("POST", "/auth/primeiro-acesso", { corpo: { convite: conviteDo(r.corpo.linkConviteDemo), novaSenha: SENHA_PROFESSOR, aceiteLgpd: true } });
    professorB.token = await entrar(professorB);

    requisito("R36 Professor: só os próprios eventos; sem Auditoria, Participantes e criação de sala");
    r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: codigoDeSala(), tipo: "SALA_DE_AULA", capacidade: 10 } });
    const salaProfessorId: string = r.corpo.id;
    salas.push(salaProfessorId);
    r = await chamar("POST", "/palestrantes", { token: professorA.token, corpo: { nome: "Palestrante do Professor", email: `pal.prof.${sufixo}@teste.invalido` } });
    checar("palestrante criado pelo professor nasce PENDENTE", r.status === 201 && r.corpo.situacao === "PENDENTE", r.corpo);
    const palestranteProfId: string = r.corpo.id;
    palestrantes.push(palestranteProfId);
    // um horario cheio daqui a 12 dias, so desta sala nova
    const inicioProf = new Date(Math.ceil((Date.now() + 12 * 24 * 3600 * 1000) / 3600000) * 3600000);
    const corpoEventoProf = {
      titulo: `Evento do Professor ${sufixo}`,
      horario: inicioProf.toISOString(),
      salaId: salaProfessorId,
      palestranteId: palestranteProfId,
      tema: "Tema do professor",
      cargaHoraria: 2,
      questionario: questionario(),
    };
    r = await chamar("POST", "/eventos", { token: professorA.token, corpo: corpoEventoProf });
    checar(
      "evento do professor nasce PENDENTE, com o palestrante dele ainda pendente, e guarda quem criou",
      r.status === 201 && r.corpo.situacao === "PENDENTE" && r.corpo.criadoPorId === professorA.id,
      r.corpo,
    );
    const eventoProfId: string = r.corpo.id;
    eventos.push(eventoProfId);
    r = await chamar("GET", "/eventos", { token: professorA.token });
    checar(
      "professor lista só os eventos que criou (nem os da equipe)",
      r.status === 200 && r.corpo.length >= 1 && r.corpo.every((e: { criadoPorId: string }) => e.criadoPorId === professorA.id),
      r.corpo?.length,
    );
    r = await chamar("GET", `/eventos/${eventoId}`, { token: professorA.token });
    checar("professor não vê evento da equipe -> 404", r.status === 404, r.status);
    r = await chamar("PUT", `/eventos/${eventoId}`, { token: professorA.token, corpo: { titulo: "Invadido" } });
    checar("professor não edita evento da equipe -> 404", r.status === 404, r.status);
    r = await chamar("GET", `/eventos/${eventoProfId}`, { token: professorB.token });
    checar("outro professor não vê o evento -> 404", r.status === 404, r.status);
    r = await chamar("PUT", `/eventos/${eventoProfId}`, { token: professorB.token, corpo: { titulo: "Invadido" } });
    checar("outro professor não edita o evento -> 404", r.status === 404, r.status);
    r = await chamar("DELETE", `/eventos/${eventoProfId}`, { token: professorB.token });
    checar("outro professor não exclui o evento -> 404", r.status === 404, r.status);
    r = await chamar("POST", "/inscricoes", { token: professorA.token, corpo: { participanteId: aluno.participanteId, eventoId } });
    checar("professor não inscreve aluno em evento da equipe -> 422 (evento não encontrado para ele)", r.status === 422, r.corpo);
    r = await chamar("GET", "/inscricoes/gestao", { token: professorA.token });
    checar("Inscrições do professor: só as dos eventos dele (nenhuma ainda)", r.status === 200 && r.corpo.total === 0, r.corpo?.total);
    r = await chamar("GET", "/inscricoes", { token: professorA.token });
    checar("listagem genérica de inscrições também filtrada para o professor", r.status === 200 && r.corpo.length === 0, r.corpo?.length);
    r = await chamar("GET", "/certificados/situacao", { token: professorA.token });
    checar("Certificados e notas do professor: só os eventos dele", r.status === 200 && r.corpo.total === 0, r.corpo?.total);
    r = await chamar("GET", "/feedbacks", { token: professorA.token });
    checar("Avaliações do professor: só as dos eventos dele", r.status === 200 && Array.isArray(r.corpo) && r.corpo.length === 0, r.corpo?.length);
    r = await chamar("DELETE", `/feedbacks/${randomUUID()}`, { token: professorA.token, corpo: { motivo: "conteudo-ofensivo" } });
    checar("professor não exclui avaliação -> 403", r.status === 403, r.status);
    for (const [caminho, nome] of [
      ["/logs-auditoria", "Auditoria"],
      ["/participantes", "Participantes"],
      ["/professores", "Professores"],
      ["/meus-dados", "Meus dados"],
    ] as const) {
      r = await chamar("GET", caminho, { token: professorA.token });
      checar(`professor não acessa ${nome} -> 403`, r.status === 403, r.status);
    }
    r = await chamar("POST", "/salas", { token: professorA.token, corpo: { nome: codigoDeSala(), tipo: "SALA_DE_AULA", capacidade: 5 } });
    checar("professor não cria sala -> 403", r.status === 403, r.status);
    r = await chamar("GET", "/salas", { token: professorA.token });
    checar("professor consulta as salas (sem os números de ocupação da equipe)", r.status === 200 && r.corpo.every((s: Record<string, unknown>) => !("ocupacaoMedia" in s)), r.status);
    r = await chamar("GET", "/participantes/alunos?limite=50", { token: professorA.token });
    checar("busca de alunos liberada para o professor, limitada a 20", r.status === 200 && r.corpo.length <= 20, r.corpo?.length);
    r = await chamar("GET", "/dashboard", { token: professorA.token });
    checar("dashboard do professor: só eventos dele e aprovados (nenhum ainda)", r.status === 200 && r.corpo.totais.eventos === 0 && r.corpo.eventos.length === 0, r.corpo?.totais);

    requisito("R37 Aprovação de eventos e palestrantes pela equipe");
    r = await chamar("GET", "/eventos", { token: aluno.token });
    checar("aluno não vê evento PENDENTE na programação", r.status === 200 && !r.corpo.some((e: { id: string }) => e.id === eventoProfId), r.status);
    r = await chamar("GET", `/eventos/${eventoProfId}`, { token: aluno.token });
    checar("aluno não abre evento PENDENTE -> 404", r.status === 404, r.status);
    r = await chamar("POST", `/eventos/${eventoProfId}/inscricoes`, { token: aluno.token });
    checar("aluno não se inscreve em evento PENDENTE -> 404", r.status === 404, r.status);
    r = await chamar("GET", `/eventos/${eventoProfId}/questionario`, { token: aluno.token });
    checar("aluno não vê o questionário de evento PENDENTE -> 404", r.status === 404, r.status);
    r = await chamar("GET", "/palestrantes", { token: aluno.token });
    checar("aluno não vê palestrante PENDENTE", r.status === 200 && !r.corpo.some((p: { id: string }) => p.id === palestranteProfId), r.status);
    r = await chamar("GET", "/aprovacoes/contadores", { token: secretaria.token });
    checar("contador da equipe mostra os pendentes", r.status === 200 && r.corpo.eventosPendentes >= 1 && r.corpo.palestrantesPendentes >= 1, r.corpo);
    const corpoMesmoHorario = { ...corpoEventoProf, titulo: `Evento Mesmo Horário ${sufixo}`, palestranteId };
    r = await chamar("POST", "/eventos", { token: secretaria.token, corpo: corpoMesmoHorario });
    checar("evento PENDENTE já reserva a sala: outro evento no mesmo horário -> 409", r.status === 409 && r.corpo.code === "CONFLITO_DE_SALA", r.corpo);
    r = await chamar("POST", "/eventos", { token: secretaria.token, corpo: { ...corpoMesmoHorario, palestranteId: palestranteProfId, horario: new Date(inicioProf.getTime() + 5 * 3600000).toISOString() } });
    checar("equipe não usa palestrante PENDENTE num evento dela -> 422 no campo palestrante", r.status === 422 && r.corpo.erros?.some((e: { campo: string }) => e.campo === "palestranteId"), r.corpo);
    r = await chamar("POST", `/eventos/${eventoProfId}/recusar`, { token: secretaria.token, corpo: {} });
    checar("recusar sem motivo -> 422", r.status === 422, r.status);
    r = await chamar("POST", `/eventos/${eventoProfId}/recusar`, { token: secretaria.token, corpo: { motivo: "curto" } });
    checar("recusar com motivo de menos de 10 caracteres -> 422", r.status === 422, r.status);
    r = await chamar("POST", `/eventos/${eventoProfId}/aprovar`, { token: professorA.token });
    checar("professor não aprova o próprio evento -> 403", r.status === 403, r.status);
    r = await chamar("POST", `/eventos/${eventoProfId}/aprovar`, { token: secretaria.token });
    checar("não aprova evento com palestrante PENDENTE -> 409 com mensagem clara", r.status === 409 && r.corpo.code === "PALESTRANTE_NAO_APROVADO", r.corpo);
    const MOTIVO_RECUSA = "Ajuste o tema e o questionário da palestra.";
    r = await chamar("POST", `/eventos/${eventoProfId}/recusar`, { token: secretaria.token, corpo: { motivo: MOTIVO_RECUSA } });
    checar("recusar com motivo -> 200 RECUSADO, com o motivo para o professor", r.status === 200 && r.corpo.situacao === "RECUSADO" && r.corpo.motivoRecusa === MOTIVO_RECUSA, r.corpo);
    r = await chamar("GET", "/aprovacoes/contadores", { token: professorA.token });
    checar("contador do professor mostra o recusado", r.status === 200 && r.corpo.eventosRecusados === 1, r.corpo);
    r = await chamar("POST", "/eventos", { token: secretaria.token, corpo: corpoMesmoHorario });
    checar("recusar libera a sala na hora: evento no mesmo horário -> 201", r.status === 201, r.corpo);
    const eventoQueOcupaId: string = r.corpo.id;
    eventos.push(eventoQueOcupaId);
    r = await chamar("POST", `/eventos/${eventoProfId}/reenviar`, { token: professorA.token, corpo: { resposta: "Tema e questionário ajustados." } });
    checar("reenvio confere a sala de novo: ocupada -> 409", r.status === 409 && r.corpo.code === "CONFLITO_DE_SALA", r.corpo);
    await chamar("DELETE", `/eventos/${eventoQueOcupaId}`, { token: secretaria.token });
    eventos.splice(eventos.indexOf(eventoQueOcupaId), 1);
    r = await chamar("POST", `/eventos/${eventoProfId}/reenviar`, { token: professorB.token, corpo: {} });
    checar("outro professor não reenvia -> 404", r.status === 404, r.status);
    r = await chamar("POST", `/eventos/${eventoProfId}/reenviar`, { token: professorA.token, corpo: { resposta: "Tema e questionário ajustados." } });
    checar("reenvio volta para PENDENTE e apaga o motivo", r.status === 200 && r.corpo.situacao === "PENDENTE" && r.corpo.motivoRecusa === null, r.corpo);
    r = await chamar("POST", `/palestrantes/${palestranteProfId}/aprovar`, { token: secretaria.token });
    checar("equipe aprova o palestrante -> 200 APROVADO", r.status === 200 && r.corpo.situacao === "APROVADO", r.corpo);
    r = await chamar("POST", `/eventos/${eventoProfId}/aprovar`, { token: secretaria.token });
    checar("com o palestrante aprovado, o evento é aprovado -> 200", r.status === 200 && r.corpo.situacao === "APROVADO", r.corpo);
    r = await chamar("GET", `/eventos/${eventoProfId}/historico`, { token: professorA.token });
    const passos: { acao: string; mensagem: string | null; autorNome: string | null; criadoEm: string }[] = r.corpo ?? [];
    checar(
      "histórico registra envio, recusa (com motivo), reenvio (com resposta) e aprovação, com data e autor",
      r.status === 200 &&
        passos.map((p) => p.acao).join(",") === "ENVIADO,RECUSADO,REENVIADO,APROVADO" &&
        passos[1].mensagem === MOTIVO_RECUSA &&
        passos[2].mensagem === "Tema e questionário ajustados." &&
        passos.every((p) => !!p.autorNome && !!p.criadoEm),
      passos,
    );
    r = await chamar("GET", `/eventos/${eventoProfId}/historico`, { token: professorB.token });
    checar("outro professor não vê o histórico -> 404", r.status === 404, r.status);
    const logsAprovacao = await prisma.logAuditoria.findMany({
      where: { acao: { in: ["EVENTO_ENVIADO_PARA_APROVACAO", "EVENTO_RECUSADO", "EVENTO_REENVIADO", "EVENTO_APROVADO"] }, detalhe: { contains: eventoProfId } },
    });
    checar(
      "auditoria registra envio, recusa, reenvio e aprovação, sem o motivo nem a resposta",
      logsAprovacao.length === 4 && logsAprovacao.every((l) => !(l.detalhe ?? "").includes(MOTIVO_RECUSA) && !(l.detalhe ?? "").includes("ajustados")),
      logsAprovacao.map((l) => l.acao),
    );
    r = await chamar("GET", "/eventos", { token: aluno.token });
    checar("depois de aprovado, o evento aparece para o aluno", r.corpo.some((e: { id: string }) => e.id === eventoProfId), r.status);
    r = await chamar("PUT", `/eventos/${eventoProfId}`, { token: professorA.token, corpo: { horario: new Date(inicioProf.getTime() + 3600000).toISOString() } });
    checar(
      "professor muda o horário de evento já aprovado -> vira proposta de alteração; o evento continua no horário antigo",
      r.status === 200 && r.corpo.propostaEnviada === true && r.corpo.horario === inicioProf.toISOString() && r.corpo.proposta?.situacao === "PENDENTE",
      r.corpo,
    );
    r = await chamar("DELETE", `/eventos/${eventoProfId}/proposta`, { token: professorA.token });
    checar("professor cancela a proposta -> 200, sem proposta aberta", r.status === 200 && r.corpo.proposta === null, r.corpo);
    r = await chamar("PUT", `/eventos/${eventoProfId}`, { token: professorA.token, corpo: { titulo: `Evento do Professor Revisado ${sufixo}`, horario: inicioProf.toISOString() } });
    checar("professor edita o título do evento aprovado (mesmo horário) -> 200", r.status === 200 && r.corpo.titulo.startsWith("Evento do Professor Revisado"), r.corpo);
    r = await chamar("POST", "/inscricoes", { token: professorA.token, corpo: { participanteId: aluno.participanteId, eventoId: eventoProfId } });
    checar("professor inscreve aluno no evento dele -> 201", r.status === 201, r.corpo);
    r = await chamar("GET", "/dashboard", { token: professorA.token });
    checar(
      "dashboard do professor conta só o evento dele (1 evento, 1 inscrição)",
      r.status === 200 && r.corpo.totais.eventos === 1 && r.corpo.totais.inscricoes === 1 && r.corpo.eventos.every((e: { id: string }) => e.id === eventoProfId),
      r.corpo?.totais,
    );
    r = await chamar("GET", "/dashboard", { token: professorB.token });
    checar("dashboard de outro professor não conta esse evento", r.status === 200 && r.corpo.totais.eventos === 0, r.corpo?.totais);

    requisito("R38 Evento encerrado não é editado nem excluído");
    r = await chamar("POST", "/eventos", {
      token: admin.token,
      corpo: { ...corpoEventoProf, titulo: `Evento Encerrado Trava ${sufixo}`, palestranteId, horario: new Date(Date.now() - (3 * 24 + 6) * 3600 * 1000).toISOString() },
    });
    const eventoTravadoId: string = r.corpo.id;
    eventos.push(eventoTravadoId);
    r = await chamar("PUT", `/eventos/${eventoTravadoId}`, { token: admin.token, corpo: { titulo: "Mudou" } });
    checar("editar evento encerrado -> 409 EVENTO_ENCERRADO", r.status === 409 && r.corpo.code === "EVENTO_ENCERRADO", r.corpo);
    r = await chamar("DELETE", `/eventos/${eventoTravadoId}`, { token: admin.token });
    checar("excluir evento encerrado -> 409 EVENTO_ENCERRADO", r.status === 409 && r.corpo.code === "EVENTO_ENCERRADO", r.corpo);
    r = await chamar("POST", "/inscricoes", { token: secretaria.token, corpo: { participanteId: aluno.participanteId, eventoId: eventoTravadoId } });
    checar("inscrição manual retroativa no evento encerrado continua funcionando -> 201", r.status === 201, r.corpo);
    const inscricaoNoEncerrado: string = r.corpo.id;
    r = await chamar("POST", `/eventos/${eventoTravadoId}/checkin`, { token: aluno.token });
    checar(
      "pedido de check-in mais de 24 horas depois do fim -> 409 CHECKIN_ENCERRADO",
      r.status === 409 && r.corpo.code === "CHECKIN_ENCERRADO",
      r.corpo,
    );
    checar(
      "a inscrição sem pedido no evento com a janela fechada fica AUSENTE (expiração)",
      (await prisma.inscricao.findUnique({ where: { id: inscricaoNoEncerrado } }))?.statusPresenca === "AUSENTE",
    );

    // ------------------------------------------------------------------ etapa 3B
    requisito("R39 Proposta de alteração em evento aprovado");
    r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: codigoDeSala(), tipo: "SALA_DE_AULA", capacidade: 30 } });
    const salaPropostaId: string = r.corpo.id;
    salas.push(salaPropostaId);
    r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: codigoDeSala(), tipo: "SALA_DE_AULA", capacidade: 1 } });
    const salaMinusculaId: string = r.corpo.id;
    salas.push(salaMinusculaId);
    // segundo inscrito gravado direto no banco (o aluno2 ja foi inativado acima): o evento fica com 2 inscritos
    await prisma.inscricao.create({ data: { id: randomUUID(), participanteId: aluno2.participanteId!, eventoId: eventoProfId } });

    r = await chamar("PUT", `/eventos/${eventoProfId}`, { token: professorA.token, corpo: { salaId: salaPropostaId } });
    checar(
      "professor troca a sala do evento aprovado -> vira proposta PENDENTE; o evento continua na sala antiga",
      r.status === 200 &&
        r.corpo.propostaEnviada === true &&
        r.corpo.salaId === salaProfessorId &&
        r.corpo.proposta?.situacao === "PENDENTE" &&
        r.corpo.proposta.salaId === salaPropostaId,
      r.corpo,
    );
    r = await chamar("GET", `/eventos/${eventoProfId}`, { token: aluno.token });
    checar("o aluno continua vendo a sala antiga (e nada da proposta)", r.status === 200 && r.corpo.salaId === salaProfessorId && !("proposta" in r.corpo), r.corpo);
    r = await chamar("PUT", `/eventos/${eventoProfId}`, { token: professorA.token, corpo: { cargaHoraria: 3 } });
    checar("segunda proposta com uma pendente -> 409 PROPOSTA_JA_PENDENTE", r.status === 409 && r.corpo.code === "PROPOSTA_JA_PENDENTE", r.corpo);
    const corpoNaSalaProposta = { ...corpoEventoProf, titulo: `Evento Na Sala Proposta ${sufixo}`, salaId: salaPropostaId, palestranteId };
    r = await chamar("POST", "/eventos", { token: secretaria.token, corpo: corpoNaSalaProposta });
    checar(
      "a proposta reserva a sala nova: outro evento no mesmo horário -> 409 CONFLITO_DE_SALA",
      r.status === 409 && r.corpo.code === "CONFLITO_DE_SALA" && String(r.corpo.message).includes("proposta"),
      r.corpo,
    );
    r = await chamar("POST", "/eventos", { token: secretaria.token, corpo: { ...corpoNaSalaProposta, salaId: salaProfessorId } });
    checar("a sala atual continua do evento até a aprovação -> 409", r.status === 409 && r.corpo.code === "CONFLITO_DE_SALA", r.corpo);
    r = await chamar("PUT", `/eventos/${eventoProfId}/proposta`, { token: professorA.token, corpo: { salaId: salaMinusculaId } });
    checar(
      "sala menor que os inscritos -> 409 SALA_SEM_CAPACIDADE com mensagem clara",
      r.status === 409 && r.corpo.code === "SALA_SEM_CAPACIDADE" && String(r.corpo.message).includes("2 inscrito"),
      r.corpo,
    );
    r = await chamar("PUT", `/eventos/${eventoProfId}/proposta`, { token: professorA.token, corpo: { horario: new Date(Date.now() - 3600000).toISOString() } });
    checar("horário proposto no passado -> 422 no campo horário", r.status === 422 && r.corpo.erros?.some((e: { campo: string }) => e.campo === "horario"), r.corpo);
    r = await chamar("GET", "/aprovacoes/contadores", { token: secretaria.token });
    checar("contador da equipe conta a proposta pendente", r.status === 200 && r.corpo.eventosPendentes >= 1, r.corpo);
    r = await chamar("GET", "/eventos?situacao=PENDENTE", { token: secretaria.token });
    checar(
      "filtro Aguardando aprovação traz o evento aprovado com a proposta",
      r.status === 200 &&
        r.corpo.some((e: { id: string; situacao: string; proposta?: { situacao: string } }) => e.id === eventoProfId && e.situacao === "APROVADO" && e.proposta?.situacao === "PENDENTE"),
      r.status,
    );
    r = await chamar("POST", "/palestrantes", { token: professorA.token, corpo: { nome: "Palestrante Novo do Professor", email: `pal.novo.${sufixo}@teste.invalido` } });
    const palestranteNovoId: string = r.corpo.id;
    palestrantes.push(palestranteNovoId);
    r = await chamar("PUT", `/eventos/${eventoProfId}/proposta`, { token: professorA.token, corpo: { palestranteId: palestranteNovoId } });
    checar(
      "a proposta pode usar um palestrante do professor ainda pendente -> 200",
      r.status === 200 && r.corpo.proposta?.palestranteId === palestranteNovoId && r.corpo.proposta.salaId === salaPropostaId,
      r.corpo,
    );
    r = await chamar("POST", `/eventos/${eventoProfId}/proposta/aprovar`, { token: professorA.token });
    checar("professor não aprova a própria proposta -> 403", r.status === 403, r.status);
    r = await chamar("POST", `/eventos/${eventoProfId}/proposta/aprovar`, { token: secretaria.token });
    checar("não aprova proposta com palestrante PENDENTE -> 409 PALESTRANTE_NAO_APROVADO", r.status === 409 && r.corpo.code === "PALESTRANTE_NAO_APROVADO", r.corpo);
    r = await chamar("POST", `/eventos/${eventoProfId}/proposta/recusar`, { token: secretaria.token, corpo: {} });
    checar("recusar proposta sem motivo -> 422", r.status === 422, r.status);
    const MOTIVO_PROPOSTA = "Mantenha o palestrante já aprovado.";
    r = await chamar("POST", `/eventos/${eventoProfId}/proposta/recusar`, { token: secretaria.token, corpo: { motivo: MOTIVO_PROPOSTA } });
    checar(
      "recusar com motivo -> o evento fica como estava e o professor vê o motivo",
      r.status === 200 && r.corpo.salaId === salaProfessorId && r.corpo.proposta?.situacao === "RECUSADO" && r.corpo.proposta.motivoRecusa === MOTIVO_PROPOSTA,
      r.corpo,
    );
    r = await chamar("POST", "/eventos", { token: secretaria.token, corpo: corpoNaSalaProposta });
    checar("recusar libera a sala proposta: evento no mesmo horário -> 201", r.status === 201, r.corpo);
    await chamar("DELETE", `/eventos/${r.corpo.id}`, { token: secretaria.token });
    r = await chamar("GET", "/aprovacoes/contadores", { token: professorA.token });
    checar("proposta recusada entra no contador de recusados do professor", r.status === 200 && r.corpo.eventosRecusados >= 1, r.corpo);
    r = await chamar("GET", "/eventos?situacao=RECUSADO", { token: professorA.token });
    checar("filtro Recusados do professor traz o evento com a proposta recusada", r.status === 200 && r.corpo.some((e: { id: string }) => e.id === eventoProfId), r.status);
    r = await chamar("PUT", `/eventos/${eventoProfId}/proposta`, {
      token: professorA.token,
      corpo: { palestranteId: palestranteProfId, resposta: "Voltei para o palestrante aprovado." },
    });
    checar("professor corrige e reenvia a proposta, com resposta -> PENDENTE", r.status === 200 && r.corpo.proposta?.situacao === "PENDENTE" && r.corpo.proposta.motivoRecusa === null, r.corpo);
    r = await chamar("POST", `/eventos/${eventoProfId}/proposta/aprovar`, { token: secretaria.token });
    checar(
      "aprovar aplica a sala nova e avisa os inscritos por e-mail (simulado em dev)",
      r.status === 200 && r.corpo.salaId === salaPropostaId && r.corpo.proposta === null && r.corpo.avisoInscritos?.inscritos === 2 && r.corpo.avisoInscritos.avisados === 2,
      r.corpo,
    );
    checar(
      "envio do aviso registrado na auditoria (sem dado do aluno)",
      !!(await prisma.logAuditoria.findFirst({ where: { acao: "EMAIL_ENVIADO", detalhe: { contains: `aviso de alteração do evento ${eventoProfId}` } } })),
    );
    r = await chamar("GET", `/eventos/${eventoProfId}`, { token: aluno.token });
    checar("depois da aprovação o aluno vê a sala nova", r.status === 200 && r.corpo.salaId === salaPropostaId, r.corpo);
    r = await chamar("GET", `/eventos/${eventoProfId}/historico`, { token: professorA.token });
    const passosProposta: { acao: string; mensagem: string | null }[] = (r.corpo ?? []).filter((p: { acao: string }) => p.acao.startsWith("PROPOSTA_"));
    checar(
      "histórico registra envio, edição, recusa (motivo), reenvio (resposta) e aprovação da proposta",
      passosProposta.map((p) => p.acao).join(",") ===
        "PROPOSTA_ENVIADA,PROPOSTA_CANCELADA,PROPOSTA_ENVIADA,PROPOSTA_EDITADA,PROPOSTA_RECUSADA,PROPOSTA_REENVIADA,PROPOSTA_APROVADA" &&
        passosProposta[4].mensagem === MOTIVO_PROPOSTA &&
        (passosProposta[5].mensagem ?? "").includes("Voltei para o palestrante aprovado.") &&
        (passosProposta[6].mensagem ?? "").includes("Sala:"),
      passosProposta,
    );
    const logsProposta = await prisma.logAuditoria.findMany({ where: { acao: { startsWith: "EVENTO_PROPOSTA_" }, detalhe: { contains: eventoProfId } } });
    checar(
      "auditoria registra os passos da proposta, sem o motivo nem a resposta",
      logsProposta.length >= 6 && logsProposta.every((l) => !(l.detalhe ?? "").includes(MOTIVO_PROPOSTA) && !(l.detalhe ?? "").includes("Voltei")),
      logsProposta.map((l) => l.acao),
    );
    r = await chamar("PUT", `/eventos/${eventoProfId}`, { token: professorA.token, corpo: { titulo: `Evento do Professor Final ${sufixo}` } });
    checar(
      "título do evento aprovado o professor continua editando direto",
      r.status === 200 && r.corpo.titulo === `Evento do Professor Final ${sufixo}` && r.corpo.propostaEnviada === false && r.corpo.proposta === null,
      r.corpo,
    );
    r = await chamar("PUT", `/eventos/${eventoProfId}`, { token: secretaria.token, corpo: { cargaHoraria: 3 } });
    checar(
      "a equipe muda a carga horária direto, sem proposta, e os inscritos são avisados",
      r.status === 200 && r.corpo.cargaHoraria === 3 && r.corpo.propostaEnviada === false && r.corpo.avisoInscritos?.avisados === 2,
      r.corpo,
    );
    // evento do professor que ja comecou (comecou ha 1 h, dura 3 h)
    r = await chamar("POST", "/eventos", {
      token: professorA.token,
      corpo: {
        ...corpoEventoProf,
        titulo: `Evento Em Andamento ${sufixo}`,
        salaId: salaMinusculaId,
        palestranteId: palestranteProfId,
        horario: new Date(Date.now() - 3600000).toISOString(),
        cargaHoraria: 3,
      },
    });
    const eventoEmAndamentoId: string = r.corpo.id;
    eventos.push(eventoEmAndamentoId);
    await chamar("POST", `/eventos/${eventoEmAndamentoId}/aprovar`, { token: secretaria.token });
    r = await chamar("PUT", `/eventos/${eventoEmAndamentoId}`, { token: professorA.token, corpo: { cargaHoraria: 4 } });
    checar("proposta em evento que já começou -> 409 EVENTO_JA_INICIADO", r.status === 409 && r.corpo.code === "EVENTO_JA_INICIADO", r.corpo);

    requisito("R40 Proposta de alteração em palestrante aprovado");
    const emailPalAntigo = `pal.prof.${sufixo}@teste.invalido`;
    const emailPalNovo = `pal.prof.novo.${sufixo}@teste.invalido`;
    r = await chamar("PUT", `/palestrantes/${palestranteProfId}`, { token: professorA.token, corpo: { email: emailPalNovo } });
    checar(
      "professor troca o e-mail do palestrante aprovado -> vira proposta; o palestrante continua com o e-mail antigo",
      r.status === 200 && r.corpo.email === emailPalAntigo && r.corpo.proposta?.situacao === "PENDENTE" && r.corpo.proposta.email === emailPalNovo,
      r.corpo,
    );
    r = await chamar("PUT", `/palestrantes/${palestranteProfId}`, { token: professorA.token, corpo: { nome: "Outro Nome" } });
    checar("segunda proposta no palestrante -> 409 PROPOSTA_JA_PENDENTE", r.status === 409 && r.corpo.code === "PROPOSTA_JA_PENDENTE", r.corpo);
    r = await chamar("GET", `/palestrantes/${palestranteId}`, { token: secretaria.token });
    r = await chamar("PUT", `/palestrantes/${palestranteProfId}/proposta`, { token: professorA.token, corpo: { email: r.corpo.email } });
    checar("proposta com e-mail de outro palestrante -> 409 EMAIL_DUPLICADO", r.status === 409 && r.corpo.code === "EMAIL_DUPLICADO", r.corpo);
    r = await chamar("GET", "/palestrantes?situacao=PENDENTE", { token: secretaria.token });
    checar("filtro Aguardando aprovação traz o palestrante com proposta", r.status === 200 && r.corpo.some((p: { id: string }) => p.id === palestranteProfId), r.status);
    r = await chamar("POST", `/palestrantes/${palestranteProfId}/proposta/aprovar`, { token: secretaria.token });
    checar("equipe aprova -> o e-mail novo vale", r.status === 200 && r.corpo.email === emailPalNovo && r.corpo.proposta === null, r.corpo);
    r = await chamar("GET", `/palestrantes/${palestranteProfId}/historico`, { token: professorA.token });
    checar(
      "histórico do palestrante registra envio e aprovação da proposta",
      r.status === 200 && r.corpo.map((p: { acao: string }) => p.acao).join(",").endsWith("PROPOSTA_ENVIADA,PROPOSTA_APROVADA"),
      r.corpo,
    );
    r = await chamar("PUT", `/palestrantes/${palestranteProfId}`, { token: secretaria.token, corpo: { nome: "Palestrante do Professor Editado" } });
    checar("a equipe edita o palestrante direto, sem proposta", r.status === 200 && r.corpo.nome === "Palestrante do Professor Editado" && r.corpo.proposta === null, r.corpo);

    requisito("R41 Questionário travado depois da primeira tentativa");
    const questionarioMudado = questionario().map((p, i) => (i === 0 ? { ...p, enunciado: "Pergunta reescrita" } : p));
    for (const [conta, nome] of [
      [secretaria, "secretaria"],
      [admin, "administrador"],
    ] as const) {
      r = await chamar("PUT", `/eventos/${eventoId}`, { token: conta.token, corpo: { questionario: questionarioMudado } });
      checar(
        `${nome} não muda o questionário de evento já respondido -> 409 QUESTIONARIO_TRAVADO`,
        r.status === 409 && r.corpo.code === "QUESTIONARIO_TRAVADO" && r.corpo.message === "Questionário travado: já há respostas de alunos.",
        r.corpo,
      );
    }
    // tentativa gravada direto no banco (o check-in do evento do professor so abre 1 hora antes)
    await prisma.tentativaQuestionario.create({
      data: { id: randomUUID(), participanteId: aluno.participanteId!, eventoId: eventoProfId, respostas: Array(10).fill(0), acertos: 10, totalPerguntas: 10, percentual: 100 },
    });
    r = await chamar("PUT", `/eventos/${eventoProfId}`, { token: professorA.token, corpo: { questionario: questionarioMudado } });
    checar("professor não muda o questionário depois da primeira tentativa -> 409 QUESTIONARIO_TRAVADO", r.status === 409 && r.corpo.code === "QUESTIONARIO_TRAVADO", r.corpo);
    r = await chamar("GET", `/eventos/${eventoProfId}`, { token: professorA.token });
    checar("o evento avisa a tela que o questionário está travado", r.status === 200 && r.corpo.questionarioTravado === true, r.corpo?.questionarioTravado);
    r = await chamar("PUT", `/eventos/${eventoProfId}`, { token: professorA.token, corpo: { tema: "Tema revisado", questionario: r.corpo.questionario } });
    checar("o mesmo questionário de volta (sem mudança) não bloqueia a edição do resto -> 200", r.status === 200 && r.corpo.tema === "Tema revisado", r.corpo);

    requisito("R42 Inativação do professor com transferência dos eventos");
    r = await chamar("POST", "/eventos", {
      token: professorA.token,
      corpo: {
        ...corpoEventoProf,
        titulo: `Evento Antigo do Professor ${sufixo}`,
        salaId: salaMinusculaId,
        palestranteId: palestranteProfId,
        horario: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      },
    });
    const eventoAntigoId: string = r.corpo.id;
    eventos.push(eventoAntigoId);
    // proposta pendente: vai junto com o evento na transferencia
    r = await chamar("PUT", `/eventos/${eventoProfId}`, { token: professorA.token, corpo: { cargaHoraria: 2 } });
    const propostaQueVaiJuntoId: string = r.corpo.proposta?.id;
    r = await chamar("GET", `/professores/${professorA.id}/eventos-em-aberto`, { token: secretaria.token });
    const abertos: string[] = (r.corpo ?? []).map((e: { id: string }) => e.id);
    checar(
      "eventos em aberto: os não encerrados (inclusive o em andamento); o encerrado há mais de 24 h fica de fora",
      r.status === 200 && abertos.includes(eventoProfId) && abertos.includes(eventoEmAndamentoId) && !abertos.includes(eventoAntigoId),
      r.corpo,
    );
    const MOTIVO_INATIVACAO = "Professor desligado da instituição.";
    r = await chamar("POST", `/professores/${professorA.id}/inativar`, { token: secretaria.token, corpo: { motivo: MOTIVO_INATIVACAO } });
    checar(
      "inativar sem escolher para quem vão os eventos futuros -> 409 TRANSFERENCIA_OBRIGATORIA, nada muda",
      r.status === 409 && r.corpo.code === "TRANSFERENCIA_OBRIGATORIA" && (await prisma.usuario.findUnique({ where: { id: professorA.id } }))?.ativo === true,
      r.corpo,
    );
    r = await chamar("POST", `/professores/${professorA.id}/inativar`, { token: secretaria.token, corpo: {} });
    checar("inativar sem motivo -> 422", r.status === 422, r.status);
    r = await chamar("POST", `/professores/${professorA.id}/inativar`, { token: professorB.token, corpo: { motivo: MOTIVO_INATIVACAO, transferirPara: "EQUIPE" } });
    checar("professor não inativa professor -> 403", r.status === 403, r.status);
    // terceiro professor, inativado: nao serve de destino
    const emailProfC = `prof.c.${sufixo}@umc.br`;
    r = await chamar("POST", "/professores", { token: admin.token, corpo: { nomeCompleto: "Professor Teste C", email: emailProfC } });
    const professorC: Conta = { id: r.corpo.conta?.id, email: emailProfC, senha: SENHA_PROFESSOR, perfil: "PROFESSOR", participanteId: null };
    contas.push(professorC);
    await chamar("POST", "/auth/primeiro-acesso", { corpo: { convite: conviteDo(r.corpo.linkConviteDemo), novaSenha: SENHA_PROFESSOR, aceiteLgpd: true } });
    r = await chamar("POST", `/professores/${professorC.id}/inativar`, { token: admin.token, corpo: { motivo: "Licença" } });
    checar("professor sem eventos em aberto é inativado sem transferência -> 200 INATIVO", r.status === 200 && r.corpo.conta?.situacao === "INATIVO" && r.corpo.eventosTransferidos === 0, r.corpo);
    r = await chamar("POST", `/professores/${professorA.id}/inativar`, { token: secretaria.token, corpo: { motivo: MOTIVO_INATIVACAO, transferirPara: professorC.id } });
    checar("professor inativo não é destino de transferência -> 422", r.status === 422 && r.corpo.erros?.some((e: { campo: string }) => e.campo === "transferirPara"), r.corpo);
    r = await chamar("POST", `/professores/${professorA.id}/inativar`, { token: secretaria.token, corpo: { motivo: MOTIVO_INATIVACAO, transferirPara: professorA.id } });
    checar("transferir para o próprio professor -> 422", r.status === 422, r.status);
    const tokenAntigoProfA = professorA.token;
    r = await chamar("POST", `/professores/${professorA.id}/inativar`, { token: secretaria.token, corpo: { motivo: MOTIVO_INATIVACAO, transferirPara: professorB.id } });
    checar(
      "com a transferência, o professor é inativado -> 200 INATIVO",
      r.status === 200 && r.corpo.conta?.situacao === "INATIVO" && r.corpo.eventosTransferidos === abertos.length,
      r.corpo,
    );
    const [eventoTransferido, eventoAntigo, propostaTransferida, palestranteNovo] = await Promise.all([
      prisma.evento.findUnique({ where: { id: eventoProfId } }),
      prisma.evento.findUnique({ where: { id: eventoAntigoId } }),
      prisma.propostaAlteracao.findUnique({ where: { id: propostaQueVaiJuntoId ?? "" } }),
      prisma.palestrante.findUnique({ where: { id: palestranteNovoId } }),
    ]);
    checar("o evento em aberto passa para o outro professor, com a proposta pendente", eventoTransferido?.criadoPorId === professorB.id && propostaTransferida?.criadoPorId === professorB.id && propostaTransferida.situacao === "PENDENTE");
    checar("o evento encerrado há mais de 24 h continua com o nome do professor inativado", eventoAntigo?.criadoPorId === professorA.id);
    checar("o palestrante pendente do professor continua pendente", palestranteNovo?.situacao === "PENDENTE");
    r = await chamar("GET", `/eventos/${eventoProfId}`, { token: professorB.token });
    checar("o novo responsável vê o evento e a proposta", r.status === 200 && r.corpo.proposta?.situacao === "PENDENTE", r.corpo);
    r = await chamar("GET", `/eventos/${eventoProfId}/historico`, { token: secretaria.token });
    checar(
      "histórico do evento registra a transferência",
      r.status === 200 && r.corpo.some((p: { acao: string; mensagem: string | null }) => p.acao === "TRANSFERIDO" && (p.mensagem ?? "").includes("Professor Teste B")),
      r.corpo,
    );
    const logsInativacao = await prisma.logAuditoria.findMany({
      where: { OR: [{ acao: "PROFESSOR_INATIVADO", detalhe: { contains: professorA.id } }, { acao: "EVENTO_TRANSFERIDO", detalhe: { contains: eventoProfId } }] },
    });
    checar(
      "auditoria registra a inativação e a transferência, sem o motivo",
      logsInativacao.some((l) => l.acao === "PROFESSOR_INATIVADO") &&
        logsInativacao.some((l) => l.acao === "EVENTO_TRANSFERIDO") &&
        logsInativacao.every((l) => !(l.detalhe ?? "").includes("desligado")),
      logsInativacao.map((l) => l.acao),
    );
    r = await chamar("GET", "/usuarios/me", { token: tokenAntigoProfA });
    checar("a sessão aberta do professor inativado cai -> 401", r.status === 401, r.status);
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: professorA.email, senha: SENHA_PROFESSOR } });
    checar(
      "professor inativo não entra -> 403 com a mesma mensagem do aluno inativo",
      r.status === 403 && r.corpo.code === "CONTA_INATIVA" && r.corpo.message === "Sua conta está inativa. Procure a secretaria.",
      r.corpo,
    );
    r = await chamar("GET", "/professores", { token: secretaria.token });
    checar(
      "tela Professores mostra o professor inativo com o motivo",
      r.status === 200 && r.corpo.some((p: { id: string; situacao: string; motivoInativacao: string }) => p.id === professorA.id && p.situacao === "INATIVO" && p.motivoInativacao === MOTIVO_INATIVACAO),
      r.status,
    );
    r = await chamar("POST", `/professores/${professorB.id}/inativar`, { token: secretaria.token, corpo: { motivo: "Teste da equipe", transferirPara: "EQUIPE" } });
    const comAEquipe = await prisma.evento.findUnique({ where: { id: eventoProfId } });
    checar("transferir para a equipe deixa o evento sem professor", r.status === 200 && comAEquipe?.criadoPorId === null, r.corpo);
    r = await chamar("POST", `/professores/${professorA.id}/reativar`, { token: secretaria.token });
    checar("reativar -> 200 ATIVO", r.status === 200 && r.corpo.situacao === "ATIVO", r.corpo);
    r = await chamar("POST", `/professores/${professorA.id}/reativar`, { token: secretaria.token });
    checar("reativar quem já está ativo -> 409", r.status === 409, r.status);
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: professorA.email, senha: SENHA_PROFESSOR } });
    checar("depois de reativado o professor entra de novo", r.status === 200 && !!r.corpo.token, r.corpo);
    await chamar("POST", `/professores/${professorB.id}/reativar`, { token: secretaria.token });

    // ------------------------------------------------------------------ etapa 4: check-in pedido pelo aluno
    requisito("R43 Check-in: aprovação pelo professor do evento ou pela equipe, expiração e dashboard");
    professorA.token = await entrar(professorA);
    professorB.token = await entrar(professorB);
    // alunos criados direto no banco (o cadastro ja foi testado no R01), ja com os termos vigentes aceitos
    const alunosCheckin: Conta[] = [];
    async function criarAlunoCheckin(letra: string): Promise<Conta> {
      const participanteIdCheckin = randomUUID();
      await prisma.participante.create({ data: { id: participanteIdCheckin, rgm: rgmAleatorio() } });
      const conta: Conta = {
        id: randomUUID(),
        email: `req.checkin.${letra.toLowerCase()}.${sufixo}@alunos.umc.br`,
        senha: SENHA_ALUNO,
        perfil: "ALUNO",
        participanteId: participanteIdCheckin,
      };
      await prisma.usuario.create({
        data: {
          id: conta.id,
          nome: `Aluno Check-in ${letra}`,
          emailLogin: conta.email,
          senhaHash: await bcrypt.hash(SENHA_ALUNO, 4),
          perfil: "ALUNO",
          participanteId: participanteIdCheckin,
          consentimentoLgpdEm: new Date(),
          versaoTermosAceitos: VERSAO_TERMOS_ATUAL,
        },
      });
      contas.push(conta);
      conta.token = await entrar(conta);
      return conta;
    }
    for (const letra of ["X", "Y", "Z", "W"]) alunosCheckin.push(await criarAlunoCheckin(letra));
    const [alunoX, alunoY, alunoZ, alunoW] = alunosCheckin;
    const salasCheckin: string[] = [];
    for (let i = 0; i < 2; i++) {
      r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: codigoDeSala(), tipo: "SALA_DE_AULA", capacidade: 10 } });
      salas.push(r.corpo.id);
      salasCheckin.push(r.corpo.id);
    }
    const daquiMeiaHora = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const corpoCheckin = { horario: daquiMeiaHora, palestranteId, tema: "Tema", cargaHoraria: 1, questionario: questionario() };
    // evento P: do professor A, ainda PENDENTE de aprovação
    r = await chamar("POST", "/eventos", { token: professorA.token, corpo: { ...corpoCheckin, titulo: `Evento Check-in P ${sufixo}`, salaId: salasCheckin[0] } });
    const eventoP: string = r.corpo.id;
    eventos.push(eventoP);
    checar("evento do professor nasce PENDENTE", r.status === 201 && r.corpo.situacao === "PENDENTE", r.corpo);
    r = await chamar("POST", `/eventos/${eventoP}/checkin`, { token: alunoX.token });
    checar("evento PENDENTE de aprovação: pedido recusado -> 404", r.status === 404 && r.corpo.code === "EVENTO_NAO_ENCONTRADO", r.corpo);
    await chamar("POST", `/eventos/${eventoP}/aprovar`, { token: secretaria.token });
    // evento Q: da equipe, de daqui a 5 min a daqui a 20 min (termina antes de P comecar: os mesmos alunos ficam nos
    // dois sem inscricao no mesmo horario), tambem com o check-in aberto
    r = await chamar("POST", "/eventos", {
      token: admin.token,
      corpo: { ...corpoCheckin, titulo: `Evento Check-in Q ${sufixo}`, salaId: salasCheckin[1], horario: new Date(Date.now() + 5 * 60 * 1000).toISOString(), cargaHoraria: 0.25 },
    });
    const eventoQ: string = r.corpo.id;
    eventos.push(eventoQ);
    const inscricaoDe: Record<string, string> = {};
    for (const conta of alunosCheckin) {
      for (const ev of [eventoP, eventoQ]) {
        r = await chamar("POST", `/eventos/${ev}/inscricoes`, { token: conta.token });
        inscricaoDe[`${conta.id}:${ev}`] = r.corpo.id;
      }
    }
    const insc = (conta: Conta, ev: string) => inscricaoDe[`${conta.id}:${ev}`];
    checar("os 4 alunos inscritos em P e Q", Object.values(inscricaoDe).every(Boolean) && Object.keys(inscricaoDe).length === 8);

    r = await chamar("POST", `/eventos/${eventoP}/checkin`, { token: alunoX.token });
    checar("aluno X pede o check-in de P -> SOLICITADO", r.status === 200 && r.corpo.statusPresenca === "SOLICITADO", r.corpo);
    r = await chamar("GET", "/checkin/eventos", { token: professorA.token });
    const pNaLista = Array.isArray(r.corpo) ? r.corpo.find((e: { id: string }) => e.id === eventoP) : undefined;
    checar(
      "tela Check-in do professor: só os eventos dele com a janela aberta, com os pedidos pendentes",
      r.status === 200 && pNaLista?.solicitados === 1 && !r.corpo.some((e: { id: string }) => e.id === eventoQ),
      r.corpo,
    );
    r = await chamar("GET", "/checkin/eventos", { token: secretaria.token });
    checar("a equipe vê P e Q", r.status === 200 && [eventoP, eventoQ].every((id) => r.corpo.some((e: { id: string }) => e.id === id)), r.status);
    r = await chamar("GET", `/checkin/eventos/${eventoP}`, { token: professorA.token });
    checar(
      "painel do evento lista o pedido com nome, RGM e horário do pedido",
      r.status === 200 &&
        r.corpo.pedidos.length === 1 &&
        r.corpo.pedidos[0].participanteNome === "Aluno Check-in X" &&
        !!r.corpo.pedidos[0].participanteRgm &&
        !!r.corpo.pedidos[0].checkinSolicitadoEm &&
        r.corpo.janela.situacao === "ABERTA",
      r.corpo,
    );
    r = await chamar("GET", `/checkin/eventos/${eventoP}`, { token: professorB.token });
    checar("painel de evento de outro professor -> 403", r.status === 403, r.status);
    r = await chamar("POST", `/checkin/inscricoes/${insc(alunoX, eventoP)}/aprovar`, { token: professorB.token });
    checar("professor de outro evento não aprova -> 403", r.status === 403, r.corpo);
    r = await chamar("POST", `/checkin/inscricoes/${insc(alunoX, eventoP)}/aprovar`, { token: professorA.token });
    checar(
      "o professor aprova o pedido do evento dele -> PRESENTE, decidido por ele",
      r.status === 200 && r.corpo.statusPresenca === "PRESENTE" && r.corpo.usuarioId === professorA.id,
      r.corpo,
    );
    r = await chamar("POST", `/eventos/${eventoP}/questionario/respostas`, { token: alunoX.token, corpo: { respostas: Array(10).fill(1) } });
    checar("aprovar libera o questionário -> 201", r.status === 201, r.corpo);
    r = await chamar("POST", `/checkin/inscricoes/${insc(alunoX, eventoP)}/recusar`, { token: professorA.token });
    checar("reverter depois da primeira tentativa do questionário -> 409 PRESENCA_TRAVADA", r.status === 409 && r.corpo.code === "PRESENCA_TRAVADA", r.corpo);

    await chamar("POST", `/eventos/${eventoP}/checkin`, { token: alunoY.token });
    r = await chamar("POST", `/checkin/inscricoes/${insc(alunoY, eventoP)}/recusar`, { token: professorA.token });
    checar("recusar não exige motivo -> 200 RECUSADO", r.status === 200 && r.corpo.statusPresenca === "RECUSADO", r.corpo);
    checar(
      "recusa na auditoria (CHECKIN_RECUSADO)",
      !!(await prisma.logAuditoria.findFirst({ where: { acao: "CHECKIN_RECUSADO", usuarioId: professorA.id, detalhe: { contains: insc(alunoY, eventoP) } } })),
    );
    r = await chamar("POST", `/eventos/${eventoP}/checkin`, { token: alunoY.token });
    checar("recusado não pede de novo -> 409 CHECKIN_JA_DECIDIDO", r.status === 409 && r.corpo.code === "CHECKIN_JA_DECIDIDO", r.corpo);
    r = await chamar("POST", `/eventos/${eventoP}/questionario/respostas`, { token: alunoY.token, corpo: { respostas: Array(10).fill(0) } });
    checar("recusado não responde o questionário -> 403", r.status === 403, r.corpo);
    r = await chamar("POST", `/checkin/inscricoes/${insc(alunoY, eventoP)}/aprovar`, { token: professorA.token });
    checar("reverter dentro da janela: RECUSADO -> PRESENTE", r.status === 200 && r.corpo.statusPresenca === "PRESENTE", r.corpo);
    r = await chamar("POST", `/checkin/inscricoes/${insc(alunoY, eventoP)}/recusar`, { token: professorA.token });
    checar("reverter dentro da janela: PRESENTE -> RECUSADO", r.status === 200 && r.corpo.statusPresenca === "RECUSADO", r.corpo);
    checar(
      "reversão na auditoria (CHECKIN_REVERTIDO, de/para)",
      !!(await prisma.logAuditoria.findFirst({
        where: { acao: "CHECKIN_REVERTIDO", usuarioId: professorA.id, detalhe: { contains: `${insc(alunoY, eventoP)}: de PRESENTE para RECUSADO` } },
      })),
    );
    r = await chamar("POST", `/checkin/inscricoes/${insc(alunoW, eventoP)}/aprovar`, { token: professorA.token });
    checar("sem pedido do aluno não há o que aprovar -> 409 CHECKIN_NAO_SOLICITADO", r.status === 409 && r.corpo.code === "CHECKIN_NAO_SOLICITADO", r.corpo);

    await chamar("POST", `/eventos/${eventoP}/checkin`, { token: alunoZ.token });
    r = await chamar("POST", `/checkin/inscricoes/${insc(alunoZ, eventoP)}/aprovar`, { token: secretaria.token });
    checar("a secretaria aprova no evento do professor", r.status === 200 && r.corpo.statusPresenca === "PRESENTE" && r.corpo.usuarioId === secretaria.id, r.corpo);
    for (const conta of [alunoX, alunoY, alunoZ]) await chamar("POST", `/eventos/${eventoQ}/checkin`, { token: conta.token });
    r = await chamar("POST", `/checkin/inscricoes/${insc(alunoZ, eventoQ)}/aprovar`, { token: admin.token });
    checar("o administrador aprova no evento da equipe", r.status === 200 && r.corpo.statusPresenca === "PRESENTE" && r.corpo.usuarioId === admin.id, r.corpo);
    r = await chamar("POST", `/checkin/inscricoes/${insc(alunoX, eventoQ)}/aprovar`, { token: professorA.token });
    checar("professor não aprova no evento da equipe -> 403", r.status === 403, r.corpo);
    // W pede em P (deve continuar SOLICITADO) e nao pede em Q (deve continuar PENDENTE)
    await chamar("POST", `/eventos/${eventoP}/checkin`, { token: alunoW.token });
    r = await chamar("POST", `/checkin/eventos/${eventoQ}/aprovar-todos`, { token: professorA.token });
    checar("\"Aprovar todos\" em evento de outro -> 403", r.status === 403, r.corpo);
    r = await chamar("POST", `/checkin/eventos/${eventoQ}/aprovar-todos`, { token: secretaria.token });
    const statusDe = async (conta: Conta, ev: string) => (await prisma.inscricao.findUnique({ where: { id: insc(conta, ev) } }))?.statusPresenca;
    checar(
      "\"Aprovar todos\" aprova só os SOLICITADO daquele evento",
      r.status === 200 &&
        r.corpo.aprovados === 2 &&
        (await statusDe(alunoX, eventoQ)) === "PRESENTE" &&
        (await statusDe(alunoY, eventoQ)) === "PRESENTE" &&
        (await statusDe(alunoW, eventoQ)) === "PENDENTE" &&
        (await statusDe(alunoW, eventoP)) === "SOLICITADO",
      r.corpo,
    );
    checar(
      "\"Aprovar todos\" na auditoria com a quantidade",
      !!(await prisma.logAuditoria.findFirst({ where: { acao: "CHECKIN_APROVADO_TODOS", usuarioId: secretaria.id, detalhe: { contains: `evento ${eventoQ}: 2 pedido(s)` } } })),
    );

    // dashboard do professor A: so o evento P (X e Z presentes, Y recusado, W pediu, V sem pedido). V e um aluno so
    // deste passo: o aluno principal pode estar inscrito noutro evento no mesmo horario de P, o que a API recusa
    const alunoV = await criarAlunoCheckin("V");
    r = await chamar("POST", `/eventos/${eventoP}/inscricoes`, { token: alunoV.token });
    checar("o aluno V se inscreve em P", r.status === 201, r.corpo);
    r = await chamar("GET", "/dashboard", { token: professorA.token });
    const pNoDashboard = r.corpo?.eventos?.find((e: { id: string }) => e.id === eventoP);
    checar(
      "dashboard: presentes = PRESENTE; ausentes = AUSENTE + RECUSADO; aguardando = PENDENTE + SOLICITADO",
      r.status === 200 && pNoDashboard?.presentes === 2 && pNoDashboard.ausentes === 1 && pNoDashboard.aguardando === 2 && pNoDashboard.inscritos === 5,
      pNoDashboard,
    );

    // expiracao: evento E com um pedido sem decisao, um inscrito sem pedido e um presente; depois o
    // evento e levado pro passado (janela fechada ha 4 h)
    r = await chamar("POST", "/eventos", {
      token: admin.token,
      corpo: { ...corpoCheckin, titulo: `Evento Check-in E ${sufixo}`, salaId: salasCheckin[1], horario: new Date(Date.now() + 3 * 3600 * 1000).toISOString() },
    });
    const eventoE: string = r.corpo.id;
    eventos.push(eventoE);
    for (const conta of [alunoX, alunoY, alunoZ]) {
      r = await chamar("POST", `/eventos/${eventoE}/inscricoes`, { token: conta.token });
      inscricaoDe[`${conta.id}:${eventoE}`] = r.corpo.id;
    }
    await prisma.inscricao.update({ where: { id: insc(alunoX, eventoE) }, data: { statusPresenca: "SOLICITADO", checkinSolicitadoEm: new Date() } });
    await prisma.inscricao.update({ where: { id: insc(alunoZ, eventoE) }, data: { statusPresenca: "PRESENTE", dataCheckin: new Date(), usuarioId: admin.id } });
    await prisma.evento.update({ where: { id: eventoE }, data: { horario: new Date(Date.now() - 30 * 3600 * 1000), cargaHoraria: 2 } });
    const primeira = await expirarCheckins(null);
    const depoisDaPrimeira = [await statusDe(alunoX, eventoE), await statusDe(alunoY, eventoE), await statusDe(alunoZ, eventoE)];
    checar(
      "expiração: depois da janela, SOLICITADO vira RECUSADO e PENDENTE vira AUSENTE (PRESENTE fica)",
      primeira.recusados >= 1 && primeira.ausentes >= 1 && depoisDaPrimeira.join() === "RECUSADO,AUSENTE,PRESENTE",
      { primeira, depoisDaPrimeira },
    );
    const segunda = await expirarCheckins(null);
    const depoisDaSegunda = [await statusDe(alunoX, eventoE), await statusDe(alunoY, eventoE), await statusDe(alunoZ, eventoE)];
    checar(
      "rodar a expiração de novo não muda nada",
      segunda.recusados === 0 && segunda.ausentes === 0 && depoisDaSegunda.join() === depoisDaPrimeira.join(),
      { segunda, depoisDaSegunda },
    );
    checar(
      "expiração na auditoria: uma linha só com as quantidades",
      !!(await prisma.logAuditoria.findFirst({ where: { acao: "CHECKIN_EXPIRADO", criadoEm: { gte: inicioDoTeste }, detalhe: { contains: "pedido(s) sem decisão recusado(s)" } } })),
    );
    r = await chamar("POST", `/eventos/${eventoE}/checkin`, { token: alunoY.token });
    checar("pedido depois da janela -> 409 CHECKIN_ENCERRADO", r.status === 409 && r.corpo.code === "CHECKIN_ENCERRADO", r.corpo);
    r = await chamar("POST", `/checkin/inscricoes/${insc(alunoX, eventoE)}/aprovar`, { token: secretaria.token });
    checar("decidir depois da janela -> 409 CHECKIN_ENCERRADO", r.status === 409 && r.corpo.code === "CHECKIN_ENCERRADO", r.corpo);
    r = await chamar("GET", "/dashboard", { token: secretaria.token });
    const eNoDashboard = r.corpo?.eventos?.find((e: { id: string }) => e.id === eventoE);
    checar(
      "dashboard conta o recusado e o ausente como ausentes",
      r.status === 200 && eNoDashboard?.presentes === 1 && eNoDashboard.ausentes === 2 && eNoDashboard.aguardando === 0,
      eNoDashboard,
    );
    r = await chamar("GET", `/inscricoes/gestao?eventoId=${eventoE}&status=RECUSADO`, { token: secretaria.token });
    checar("filtro de inscrições aceita RECUSADO", r.status === 200 && r.corpo.total === 1 && r.corpo.itens[0].id === insc(alunoX, eventoE), r.corpo);
    r = await chamar("GET", `/inscricoes/gestao?eventoId=${eventoP}&status=SOLICITADO`, { token: secretaria.token });
    checar("filtro de inscrições aceita SOLICITADO", r.status === 200 && r.corpo.total === 1 && r.corpo.itens[0].id === insc(alunoW, eventoP), r.corpo);
    r = await chamar("GET", "/meus-dados", { token: alunoX.token });
    const meusE = r.corpo?.inscricoes?.find((i: { evento: string }) => i.evento === `Evento Check-in E ${sufixo}`);
    checar("Meus dados mostra a situação nova e a hora do pedido", r.status === 200 && meusE?.presenca === "RECUSADO" && !!meusE.checkinPedidoEm, meusE);

    // ------------------------------------------------------------------ etapa 5: calendario
    requisito("R44 Calendário: intervalo de datas, sala ocupada para o professor e busca com limite");
    // um dia so do teste, daqui a 200 dias (meia-noite UTC), numa sala nova: sem conflito com nada
    const diaCal = new Date(Math.ceil((Date.now() + 200 * 24 * 3600 * 1000) / (24 * 3600 * 1000)) * 24 * 3600 * 1000);
    const emHorasCal = (horas: number) => new Date(diaCal.getTime() + horas * 3600 * 1000).toISOString();
    const deCal = diaCal.toISOString();
    const ateCal = emHorasCal(48);
    const salasCal: string[] = [];
    const codigosCal = [codigoDeSala(), codigoDeSala()];
    for (const codigo of codigosCal) {
      r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: codigo, tipo: "AUDITORIO", capacidade: 20 } });
      salas.push(r.corpo.id);
      salasCal.push(r.corpo.id);
    }
    const corpoCal = { palestranteId, tema: "Tema do calendário", cargaHoraria: 2, questionario: questionario() };
    const criarCal = async (token: string, titulo: string, horas: number, sala = salasCal[0]) => {
      const resposta = await chamar("POST", "/eventos", { token, corpo: { ...corpoCal, titulo: `${titulo} ${sufixo}`, horario: emHorasCal(horas), salaId: sala } });
      if (resposta.status !== 201) throw new Error(`evento do calendário não criado: ${JSON.stringify(resposta.corpo)}`);
      eventos.push(resposta.corpo.id);
      return resposta.corpo.id as string;
    };
    const calEquipe = await criarCal(admin.token!, "Calendário Equipe", 10);
    const calProfA = await criarCal(professorA.token!, "Calendário Prof A", 14);
    const calProfB = await criarCal(professorB.token!, "Calendário Prof B", 30);
    const calFora = await criarCal(admin.token!, "Calendário Fora", 50);
    const calRecusado = await criarCal(professorB.token!, "Calendário Recusado", 20, salasCal[1]);
    await chamar("POST", `/eventos/${calRecusado}/recusar`, { token: secretaria.token, corpo: { motivo: "Teste do calendário" } });
    const consultaCal = `/eventos?de=${encodeURIComponent(deCal)}&ate=${encodeURIComponent(ateCal)}`;

    r = await chamar("GET", consultaCal, { token: secretaria.token });
    const idsSecretaria: string[] = (r.corpo?.eventos ?? []).map((e: { id: string }) => e.id);
    checar(
      "o filtro de datas traz só os eventos que começam no intervalo",
      r.status === 200 &&
        [calEquipe, calProfA, calProfB, calRecusado].every((id) => idsSecretaria.includes(id)) &&
        !idsSecretaria.includes(calFora) &&
        r.corpo.eventos.every((e: { horario: string }) => e.horario >= deCal && e.horario < ateCal),
      idsSecretaria,
    );
    const doProfBVistoPelaSecretaria = r.corpo?.eventos?.find((e: { id: string }) => e.id === calProfB);
    checar(
      "a secretaria recebe tudo completo (título, palestrante, inscritos, situação) e nenhuma \"sala ocupada\"",
      doProfBVistoPelaSecretaria?.titulo === `Calendário Prof B ${sufixo}` &&
        doProfBVistoPelaSecretaria.palestranteId === palestranteId &&
        doProfBVistoPelaSecretaria.inscritos === 0 &&
        doProfBVistoPelaSecretaria.situacao === "PENDENTE" &&
        Array.isArray(r.corpo.salasOcupadas) &&
        r.corpo.salasOcupadas.length === 0,
      doProfBVistoPelaSecretaria,
    );

    r = await chamar("GET", consultaCal, { token: professorA.token });
    const doProfA = r.corpo?.eventos ?? [];
    checar(
      "o professor recebe os eventos dele completos",
      r.status === 200 &&
        doProfA.length === 1 &&
        doProfA[0].id === calProfA &&
        doProfA[0].titulo === `Calendário Prof A ${sufixo}` &&
        doProfA[0].palestranteId === palestranteId &&
        doProfA[0].inscritos === 0,
      doProfA,
    );
    const ocupadas: { salaId: string; salaNome: string; inicio: string; fim: string }[] = r.corpo?.salasOcupadas ?? [];
    checar(
      "os eventos dos outros (equipe e outro professor, aprovados e pendentes) chegam só como sala ocupada, com início e fim",
      ocupadas.length === 2 &&
        ocupadas.some((o) => o.inicio === emHorasCal(10) && o.fim === emHorasCal(12) && o.salaId === salasCal[0]) &&
        ocupadas.some((o) => o.inicio === emHorasCal(30) && o.fim === emHorasCal(32) && o.salaNome === `${codigosCal[0]} · Auditório`),
      ocupadas,
    );
    const textoProfA = JSON.stringify(r.corpo?.salasOcupadas ?? []);
    checar(
      "sem título, palestrante, inscritos nem id do evento dos outros na resposta pro professor",
      ocupadas.every((o) => Object.keys(o).sort().join() === "fim,inicio,salaId,salaNome") &&
        !textoProfA.includes("Calendário Equipe") &&
        !textoProfA.includes("Calendário Prof B") &&
        ![calEquipe, calProfB].some((id) => textoProfA.includes(id)) &&
        !JSON.stringify(r.corpo).includes("Calendário Equipe"),
      r.corpo,
    );
    checar("evento recusado de outro não aparece como sala ocupada", !ocupadas.some((o) => o.inicio === emHorasCal(20)), ocupadas);

    r = await chamar("GET", `/eventos?de=${encodeURIComponent(ateCal)}&ate=${encodeURIComponent(deCal)}`, { token: secretaria.token });
    checar("intervalo com a data final antes da inicial -> 422", r.status === 422, r.corpo);
    r = await chamar("GET", `/eventos?de=${encodeURIComponent(deCal)}&ate=${encodeURIComponent(emHorasCal(24 * 70))}`, { token: secretaria.token });
    checar("intervalo de mais de 62 dias -> 422", r.status === 422, r.corpo);

    // check-ins pendentes no calendario: no evento P do R43 o aluno W pediu e ainda espera
    const ontemCal = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const amanhaCal = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    r = await chamar("GET", `/eventos?de=${encodeURIComponent(ontemCal)}&ate=${encodeURIComponent(amanhaCal)}`, { token: professorA.token });
    checar(
      "o calendário traz quantos check-ins esperam aprovação em cada evento",
      r.status === 200 && r.corpo.eventos.find((e: { id: string }) => e.id === eventoP)?.checkinsPendentes === 1,
      r.corpo?.eventos?.map((e: { id: string; checkinsPendentes: number }) => [e.id, e.checkinsPendentes]),
    );

    r = await chamar("GET", `/eventos/busca?q=${encodeURIComponent(`Calendário`)}&limite=2`, { token: secretaria.token });
    checar(
      "a busca respeita o limite e avisa que ficou evento de fora",
      r.status === 200 && r.corpo.itens.length === 2 && r.corpo.limite === 2 && r.corpo.temMais === true,
      { status: r.status, itens: r.corpo?.itens?.length, temMais: r.corpo?.temMais },
    );
    r = await chamar("GET", `/eventos/busca?q=${encodeURIComponent(`Calendário Fora ${sufixo}`)}`, { token: secretaria.token });
    checar(
      "a busca acha o evento de qualquer mês, completo",
      r.status === 200 && r.corpo.itens.length === 1 && r.corpo.itens[0].id === calFora && r.corpo.temMais === false,
      r.corpo,
    );
    r = await chamar("GET", `/eventos/busca?q=${encodeURIComponent(codigosCal[1])}`, { token: secretaria.token });
    checar("a busca também procura pelo nome da sala", r.status === 200 && r.corpo.itens.some((e: { id: string }) => e.id === calRecusado), r.corpo);
    r = await chamar("GET", `/eventos/busca?q=${encodeURIComponent(sufixo)}&situacao=RECUSADO`, { token: secretaria.token });
    checar(
      "a busca combina com o filtro de situação",
      r.status === 200 && r.corpo.itens.length > 0 && r.corpo.itens.every((e: { situacao: string; proposta: { situacao: string } | null }) => e.situacao === "RECUSADO" || e.proposta?.situacao === "RECUSADO"),
      r.corpo?.itens?.map((e: { titulo: string; situacao: string }) => [e.titulo, e.situacao]),
    );
    r = await chamar("GET", `/eventos/busca?q=${encodeURIComponent(`Calendário`)}`, { token: professorA.token });
    checar(
      "a busca do professor só traz os eventos dele",
      r.status === 200 && r.corpo.itens.length > 0 && r.corpo.itens.every((e: { criadoPorId: string }) => e.criadoPorId === professorA.id),
      r.corpo?.itens?.map((e: { titulo: string }) => e.titulo),
    );
    r = await chamar("GET", "/eventos/busca?q=x&limite=51", { token: secretaria.token });
    checar("limite acima de 50 -> 422", r.status === 422, r.corpo);
    r = await chamar("GET", "/eventos/busca", { token: secretaria.token });
    checar("busca sem texto nem situação -> 422", r.status === 422, r.corpo);
    r = await chamar("GET", "/eventos/busca?q=Calend", { token: aluno.token });
    checar("aluno não usa a busca do calendário -> 403", r.status === 403, r.status);

    r = await chamar("GET", "/eventos", { token: secretaria.token });
    checar(
      "sem intervalo, a rota continua devolvendo a lista de sempre (todos os eventos, de qualquer mês)",
      r.status === 200 && Array.isArray(r.corpo) && [calEquipe, calFora, eventoId].every((id) => r.corpo.some((e: { id: string }) => e.id === id)),
      r.status,
    );
    r = await chamar("GET", consultaCal, { token: aluno.token });
    checar(
      "o aluno continua recebendo a programação de sempre (só aprovados, sem situação), mesmo mandando o intervalo",
      r.status === 200 &&
        Array.isArray(r.corpo) &&
        r.corpo.some((e: { id: string }) => e.id === calFora) &&
        !r.corpo.some((e: { id: string }) => [calProfA, calProfB, calRecusado].includes(e.id)) &&
        r.corpo.every((e: { situacao?: string }) => e.situacao === undefined),
      r.status,
    );

    // ------------------------------------------------------------------ contas ficticias (carga de demonstracao)
    requisito("R45 Conta fictícia nunca recebe e-mail; conta normal recebe como antes");
    const participanteFicticio = await prisma.participante.create({ data: { id: randomUUID(), rgm: rgmAleatorio() } });
    const alunoFicticio: Conta = {
      id: randomUUID(),
      email: `${String(Date.now()).slice(-10)}k${sufixo.slice(0, 2)}@alunos.umc.br`,
      senha: SENHA_ALUNO,
      perfil: "ALUNO",
      participanteId: participanteFicticio.id,
    };
    await prisma.usuario.create({
      data: {
        id: alunoFicticio.id,
        nome: "Aluna Fictícia Requisitos",
        emailLogin: alunoFicticio.email,
        senhaHash: "!",
        perfil: "ALUNO",
        participanteId: participanteFicticio.id,
        ficticio: true,
        consentimentoLgpdEm: new Date(),
        versaoTermosAceitos: VERSAO_TERMOS_ATUAL,
      },
    });
    contas.push(alunoFicticio);
    const dadosDoAviso = { participanteNome: "Aluno", eventoTitulo: "Evento", eventoTema: "Tema", palestranteNome: "Palestrante", eventoHorario: new Date() };
    const envioFicticio = await emailService.enviarConfirmacaoInscricao(alunoFicticio.email.toUpperCase(), dadosDoAviso);
    const envioNormal = await emailService.enviarConfirmacaoInscricao(aluno.email, dadosDoAviso);
    checar(
      "e-mail para conta fictícia é suprimido; para conta normal sai como antes (enviado ou simulado)",
      envioFicticio === "suprimido" && envioNormal !== "suprimido",
      [envioFicticio, envioNormal],
    );
    r = await chamar("GET", "/usuarios/me", { token: aluno.token });
    checar("o campo ficticio não aparece em nenhuma resposta da API (conta do aluno)", r.status === 200 && !("ficticio" in r.corpo), Object.keys(r.corpo ?? {}));
    // a Vercel roda em UTC: os e-mails mostram o horario do evento no fuso de Brasilia, qualquer que seja o do servidor
    const horarioNoEmail = dataHoraDeBrasilia(new Date("2026-11-11T18:30:00Z"));
    checar("e-mails mostram data e hora no horário de Brasília (18:30 UTC -> 15:30)", horarioNoEmail === "11/11/2026, 15:30" || horarioNoEmail === "11/11/2026 15:30", horarioNoEmail);

    r = await chamar("POST", "/eventos", {
      token: admin.token,
      corpo: { ...eventoBase, titulo: `Evento Fictício ${sufixo}`, horario: emHoras(emBreve, 40), questionario: questionario() },
    });
    const eventoFicticioId: string = r.corpo.id;
    eventos.push(eventoFicticioId);
    r = await chamar("POST", "/inscricoes", { token: secretaria.token, corpo: { participanteId: participanteFicticio.id, eventoId: eventoFicticioId } });
    const inscricaoFicticia: string = r.corpo.id;
    checar(
      "inscrição de conta fictícia funciona normalmente, sem e-mail (auditoria: suprimido)",
      r.status === 201 &&
        !!(await prisma.logAuditoria.findFirst({
          where: { acao: "EMAIL_ENVIADO", detalhe: { contains: `inscrição ${inscricaoFicticia} (suprimido: conta fictícia)` } },
        })),
      r.corpo,
    );
    r = await chamar("POST", `/eventos/${eventoFicticioId}/inscricoes`, { token: aluno.token });
    const inscricaoReal: string = r.corpo.id;
    checar(
      "a conta normal inscrita no mesmo evento recebe a confirmação",
      r.status === 201 &&
        r.corpo.emailConfirmacaoEnviado === true &&
        !(await prisma.logAuditoria.findFirst({ where: { detalhe: { contains: `inscrição ${inscricaoReal} (suprimido` } } })),
      r.corpo,
    );
    r = await chamar("PUT", `/eventos/${eventoFicticioId}`, { token: secretaria.token, corpo: { horario: emHoras(emBreve, 44) } });
    checar(
      "mudança de horário avisa só os inscritos reais (o fictício sai da lista)",
      r.status === 200 && r.corpo.avisoInscritos?.inscritos === 1 && r.corpo.avisoInscritos?.avisados === 1,
      r.corpo?.avisoInscritos,
    );
    r = await chamar("DELETE", `/inscricoes/${inscricaoFicticia}`, { token: secretaria.token });
    checar(
      "cancelar a inscrição da conta fictícia funciona (204), sem e-mail",
      r.status === 204 &&
        !!(await prisma.logAuditoria.findFirst({
          where: { acao: "EMAIL_ENVIADO", detalhe: { contains: `cancelamento de inscrição, inscrição ${inscricaoFicticia} (suprimido: conta fictícia)` } },
        })),
      r.status,
    );
    await prisma.inscricao.deleteMany({ where: { eventoId: eventoFicticioId } });

    // ------------------------------------------------------------------ troca de senha pela Minha Conta
    requisito("R46 Troca de senha pela Minha Conta (qualquer perfil), com 2FA e limite de tentativas");
    const SENHA_TROCA = "Troca@Senha123";
    const SENHA_TROCADA = "Trocada#Senha456";
    // conta nova por perfil, direto no banco (aceite dos Termos registrado, professor ja ativado)
    async function contaParaTroca(perfil: Perfil): Promise<Conta> {
      const participante = perfil === "ALUNO" ? await prisma.participante.create({ data: { id: randomUUID(), rgm: rgmAleatorio() } }) : null;
      const email = `troca-${perfil.toLowerCase()}-${sufixo}@teste.invalido`;
      const usuario = await prisma.usuario.create({
        data: {
          id: randomUUID(),
          nome: `Troca de Senha ${perfil}`,
          emailLogin: email,
          senhaHash: await bcrypt.hash(SENHA_TROCA, 12),
          perfil,
          participanteId: participante?.id ?? null,
          consentimentoLgpdEm: new Date(),
          versaoTermosAceitos: VERSAO_TERMOS_ATUAL,
        },
      });
      const conta: Conta = { id: usuario.id, email, senha: SENHA_TROCA, perfil, participanteId: participante?.id ?? null };
      contas.push(conta);
      return conta;
    }
    const corpoTroca = (extra: Record<string, unknown> = {}) => ({
      senhaAtual: SENHA_TROCA,
      novaSenha: SENHA_TROCADA,
      confirmacaoSenha: SENHA_TROCADA,
      ...extra,
    });
    const login = (email: string, senha: string) => chamar("POST", "/auth/login", { corpo: { emailLogin: email, senha } });
    const tentativasDaTroca = async (contaId: string) =>
      (await prisma.limiteAcesso.findUnique({ where: { chave: `troca-senha:conta:${contaId}` } }))?.tentativas ?? 0;
    const sessoesNovas: Record<string, string> = {};
    const contasDaTroca: Record<string, Conta> = {};

    for (const perfil of ["ALUNO", "PROFESSOR", "SECRETARIA", "ADMINISTRADOR"] as const) {
      const conta = await contaParaTroca(perfil);
      contasDaTroca[perfil] = conta;
      const tokenAntigo = await entrar(conta);
      // um codigo de "Esqueci minha senha" pedido antes da troca (so na conta do aluno: o pedido conta no limite por IP)
      const recuperacao = perfil === "ALUNO" ? await chamar("POST", "/auth/recuperacao-senha", { corpo: { email: conta.email } }) : null;

      r = await chamar("POST", "/auth/alterar-senha", { token: tokenAntigo, corpo: corpoTroca() });
      const trocou = r.status === 200 && typeof r.corpo.token === "string" && r.corpo.usuario?.perfil === perfil && r.corpo.usuario?.id === conta.id;
      sessoesNovas[perfil] = r.corpo?.token;
      const novaEntra = await login(conta.email, SENHA_TROCADA);
      const antigaEntra = await login(conta.email, SENHA_TROCA);
      const tokenAntigoMe = await chamar("GET", "/usuarios/me", { token: tokenAntigo });
      const sessaoNovaMe = await chamar("GET", "/usuarios/me", { token: sessoesNovas[perfil] });
      checar(
        `${perfil}: troca com a senha atual certa -> 200 com sessão nova; login com a nova funciona e com a antiga não`,
        trocou && novaEntra.status === 200 && antigaEntra.status === 401,
        { troca: r.status, nova: novaEntra.status, antiga: antigaEntra.status },
      );
      checar(
        `${perfil}: o token antigo deixa de valer (401) e a sessão devolvida continua valendo`,
        tokenAntigoMe.status === 401 && sessaoNovaMe.status === 200 && sessaoNovaMe.corpo.id === conta.id,
        { antigo: tokenAntigoMe.status, nova: sessaoNovaMe.status },
      );
      const logsDaConta = await prisma.logAuditoria.findMany({ where: { usuarioId: conta.id, criadoEm: { gte: inicioDoTeste } } });
      const logTroca = logsDaConta.find((log) => log.acao === "SENHA_ALTERADA");
      checar(
        `${perfil}: auditoria "senha alterada pelo próprio titular", sem senha nem e-mail em nenhum log da conta`,
        !!logTroca?.detalhe?.startsWith("senha alterada pelo próprio titular") &&
          logsDaConta.every((log) => ![SENHA_TROCA, SENHA_TROCADA, conta.email].some((dado) => (log.detalhe ?? "").includes(dado))),
        logTroca?.detalhe,
      );
      checar(
        `${perfil}: aviso de senha alterada por e-mail registrado (simulado sem SendGrid)`,
        logsDaConta.some((log) => log.acao === "EMAIL_ENVIADO" && (log.detalhe ?? "").startsWith(`aviso de senha alterada, usuário ${conta.id}`)),
      );
      if (recuperacao) {
        const confirmacao = await chamar("POST", "/auth/recuperacao-senha/confirmar", {
          corpo: { email: conta.email, codigo: recuperacao.corpo.codigoDemo, novaSenha: "Outra@Senha789" },
        });
        checar(
          "código de recuperação de senha pedido antes da troca deixa de valer",
          recuperacao.status === 200 &&
            confirmacao.status === 422 &&
            confirmacao.corpo.code === "CODIGO_INVALIDO" &&
            (await prisma.recuperacaoSenha.count({ where: { usuarioId: conta.id, usadoEm: null } })) === 0,
          { pedido: recuperacao.status, confirmacao: confirmacao.status },
        );
      }
      conta.senha = SENHA_TROCADA;
    }

    // recusas, na conta do aluno (senha atual agora e SENHA_TROCADA)
    const alunoTroca = contasDaTroca.ALUNO;
    const sessaoAluno = sessoesNovas.ALUNO;
    const corpoAluno = (extra: Record<string, unknown> = {}) => ({
      senhaAtual: SENHA_TROCADA,
      novaSenha: SENHA_TROCA,
      confirmacaoSenha: SENHA_TROCA,
      ...extra,
    });
    r = await chamar("POST", "/auth/alterar-senha", { token: sessaoAluno, corpo: corpoAluno({ senhaAtual: "Errada@Senha000" }) });
    checar(
      "senha atual errada -> 422 \"Senha atual ou código incorretos.\" e conta 1 tentativa no limite da conta",
      r.status === 422 && r.corpo.message === "Senha atual ou código incorretos." && (await tentativasDaTroca(alunoTroca.id)) === 1,
      r.corpo,
    );
    checar(
      "falha registrada na auditoria (SENHA_ALTERACAO_FALHA), sem a senha digitada",
      !!(await prisma.logAuditoria.findFirst({ where: { usuarioId: alunoTroca.id, acao: "SENHA_ALTERACAO_FALHA", detalhe: "senha atual incorreta" } })) &&
        !(await prisma.logAuditoria.findFirst({ where: { usuarioId: alunoTroca.id, detalhe: { contains: "Errada@Senha000" } } })),
    );
    const campoDoErro = (resposta: Resposta) => (resposta.corpo?.erros ?? []).map((e: { campo: string }) => e.campo);
    r = await chamar("POST", "/auth/alterar-senha", { token: sessaoAluno, corpo: corpoAluno({ novaSenha: "fraca", confirmacaoSenha: "fraca" }) });
    checar("nova senha fora da regra -> 422 no campo novaSenha", r.status === 422 && campoDoErro(r).includes("novaSenha"), r.corpo);
    r = await chamar("POST", "/auth/alterar-senha", {
      token: sessaoAluno,
      corpo: corpoAluno({ novaSenha: SENHA_TROCADA, confirmacaoSenha: SENHA_TROCADA }),
    });
    checar(
      "nova senha igual à atual -> 422 no campo novaSenha",
      r.status === 422 && campoDoErro(r).includes("novaSenha") && JSON.stringify(r.corpo).includes("diferente da atual"),
      r.corpo,
    );
    r = await chamar("POST", "/auth/alterar-senha", { token: sessaoAluno, corpo: corpoAluno({ confirmacaoSenha: "Outra@Senha789" }) });
    checar("confirmação diferente da nova senha -> 422 no campo confirmacaoSenha", r.status === 422 && campoDoErro(r).includes("confirmacaoSenha"), r.corpo);
    checar("erro de preenchimento não conta no limite de tentativas", (await tentativasDaTroca(alunoTroca.id)) === 1);
    r = await chamar("POST", "/auth/alterar-senha", { corpo: corpoAluno() });
    checar("sem login -> 401", r.status === 401, r.status);

    for (let i = 0; i < 4; i++) {
      await chamar("POST", "/auth/alterar-senha", { token: sessaoAluno, corpo: corpoAluno({ senhaAtual: "Errada@Senha000" }) });
    }
    r = await chamar("POST", "/auth/alterar-senha", { token: sessaoAluno, corpo: corpoAluno() });
    const loginAindaComTrocada = await login(alunoTroca.email, SENHA_TROCADA);
    checar(
      "5 erros bloqueiam a troca por 15 minutos: até a senha certa recebe 429 e a senha não muda",
      r.status === 429 && r.corpo.code === "MUITAS_TENTATIVAS" && loginAindaComTrocada.status === 200,
      { troca: r.status, login: loginAindaComTrocada.status },
    );
    const sessaoAlunoAtual: string = loginAindaComTrocada.corpo.token;
    const desbloqueio = await chamar("DELETE", `/usuarios/${alunoTroca.id}/bloqueio`, { token: admin.token });
    r = await chamar("POST", "/auth/alterar-senha", { token: sessaoAlunoAtual, corpo: corpoAluno() });
    checar(
      "o desbloqueio da conta pelo administrador também libera a troca de senha",
      desbloqueio.status === 204 && r.status === 200 && (await tentativasDaTroca(alunoTroca.id)) === 0,
      { desbloqueio: desbloqueio.status, troca: r.status },
    );

    // 2FA ativo (conta do professor; senha atual agora e SENHA_TROCADA)
    const professorTroca = contasDaTroca.PROFESSOR;
    const sessaoProfessor = sessoesNovas.PROFESSOR;
    r = await chamar("POST", "/auth/2fa/configuracao", { token: sessaoProfessor });
    const segredoTroca: string = r.corpo.segredo;
    r = await chamar("POST", "/auth/2fa/configuracao/confirmar", {
      token: sessaoProfessor,
      corpo: { codigo: await generate({ secret: segredoTroca }) },
    });
    const codigosTroca: string[] = r.corpo.codigosRecuperacao ?? [];
    checar("professor ativa o 2FA para o teste", r.status === 200 && codigosTroca.length === 8, r.status);
    const corpoProfessor = (extra: Record<string, unknown> = {}) => ({
      senhaAtual: SENHA_TROCADA,
      novaSenha: SENHA_TROCA,
      confirmacaoSenha: SENHA_TROCA,
      ...extra,
    });
    r = await chamar("POST", "/auth/alterar-senha", { token: sessaoProfessor, corpo: corpoProfessor() });
    checar(
      "com 2FA ativo, sem o código -> 422 no campo codigo (não conta tentativa)",
      r.status === 422 && campoDoErro(r).includes("codigo") && (await tentativasDaTroca(professorTroca.id)) === 0,
      r.corpo,
    );
    const codigoCerto = await generate({ secret: segredoTroca, epoch: Math.floor(Date.now() / 1000) + 30 });
    const codigoErrado = String((Number(codigoCerto) + 500000) % 1000000).padStart(6, "0");
    r = await chamar("POST", "/auth/alterar-senha", { token: sessaoProfessor, corpo: corpoProfessor({ codigo: codigoErrado }) });
    checar(
      "com 2FA ativo, código errado -> 422 genérico e conta tentativa",
      r.status === 422 && r.corpo.message === "Senha atual ou código incorretos." && (await tentativasDaTroca(professorTroca.id)) === 1,
      r.corpo,
    );
    r = await chamar("POST", "/auth/alterar-senha", { token: sessaoProfessor, corpo: corpoProfessor({ codigo: codigoCerto }) });
    const sessaoProfessor2: string = r.corpo?.token;
    checar(
      "com 2FA ativo e o código do aplicativo -> 200, login com a nova senha pede o 2FA",
      r.status === 200 &&
        !!sessaoProfessor2 &&
        (await tentativasDaTroca(professorTroca.id)) === 0 &&
        (await login(professorTroca.email, SENHA_TROCA)).corpo?.mfa === "PENDENTE",
      r.corpo,
    );
    r = await chamar("POST", "/auth/alterar-senha", {
      token: sessaoProfessor2,
      corpo: { senhaAtual: SENHA_TROCA, novaSenha: SENHA_TROCADA, confirmacaoSenha: SENHA_TROCADA, codigoRecuperacao: codigosTroca[0] },
    });
    checar(
      "com 2FA ativo, um código de recuperação também serve e é gasto",
      r.status === 200 &&
        (await prisma.codigoRecuperacaoMfa.count({ where: { usuarioId: professorTroca.id, usadoEm: null } })) === 7 &&
        !!(await prisma.logAuditoria.findFirst({
          where: { usuarioId: professorTroca.id, acao: "SENHA_ALTERADA", detalhe: { contains: "código de recuperação" } },
        })),
      r.corpo,
    );
    r = await chamar("POST", "/auth/alterar-senha", {
      token: r.corpo?.token,
      corpo: { senhaAtual: SENHA_TROCADA, novaSenha: SENHA_TROCA, confirmacaoSenha: SENHA_TROCA, codigoRecuperacao: codigosTroca[0] },
    });
    checar("o mesmo código de recuperação não vale duas vezes", r.status === 422 && r.corpo.message === "Senha atual ou código incorretos.", r.corpo);

    // ------------------------------------------------------------------ inscricao no mesmo horario
    requisito("R47 Aluno não se inscreve em dois eventos no mesmo horário");
    {
      // aluno so deste cenario, num dia so do teste (daqui a 300 dias), em salas novas
      const participanteConflito = await prisma.participante.create({ data: { id: randomUUID(), rgm: rgmAleatorio() } });
      const alunoConflito: Conta = {
        id: randomUUID(),
        email: `conflito.${sufixo}@alunos.umc.br`,
        senha: SENHA_ALUNO,
        perfil: "ALUNO",
        participanteId: participanteConflito.id,
      };
      await prisma.usuario.create({
        data: {
          id: alunoConflito.id,
          nome: "Aluno Conflito Requisitos",
          emailLogin: alunoConflito.email,
          senhaHash: await bcrypt.hash(SENHA_ALUNO, 12),
          perfil: "ALUNO",
          participanteId: participanteConflito.id,
          consentimentoLgpdEm: new Date(),
          versaoTermosAceitos: VERSAO_TERMOS_ATUAL,
        },
      });
      contas.push(alunoConflito);
      alunoConflito.token = await entrar(alunoConflito);
      const salaConflito1 = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: codigoDeSala(), tipo: "SALA_DE_AULA", capacidade: 30 } });
      const salaConflito2 = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: codigoDeSala(), tipo: "LABORATORIO", capacidade: 30 } });
      salas.push(salaConflito1.corpo.id, salaConflito2.corpo.id);
      const diaConflito = new Date(Math.ceil((Date.now() + 300 * 24 * 3600 * 1000) / (24 * 3600 * 1000)) * 24 * 3600 * 1000);
      const emHorasConflito = (horas: number) => new Date(diaConflito.getTime() + horas * 3600 * 1000);
      const criarConflito = async (titulo: string, horas: number, carga: number, salaIdConflito: string) => {
        const resposta = await chamar("POST", "/eventos", {
          token: secretaria.token,
          corpo: {
            titulo: `${titulo} ${sufixo}`,
            horario: emHorasConflito(horas).toISOString(),
            salaId: salaIdConflito,
            palestranteId,
            tema: "Tema",
            cargaHoraria: carga,
            questionario: questionario(),
          },
        });
        if (resposta.status !== 201) throw new Error(`evento do conflito não criado: ${JSON.stringify(resposta.corpo)}`);
        eventos.push(resposta.corpo.id);
        return resposta.corpo.id as string;
      };
      // A: 19h-21h na sala 1; B: 20h-22h na sala 2 (cruza com A); C: 17h-19h na sala 1 (so encosta em A)
      const eventoA = await criarConflito("Evento Conflito A", 19, 2, salaConflito1.corpo.id);
      const eventoB = await criarConflito("Evento Conflito B", 20, 2, salaConflito2.corpo.id);
      const eventoC = await criarConflito("Evento Conflito C", 17, 2, salaConflito1.corpo.id);
      const quandoA = dataHoraDeBrasilia(emHorasConflito(19)).replace(", ", " às ");

      r = await chamar("POST", `/eventos/${eventoA}/inscricoes`, { token: alunoConflito.token });
      checar("inscrição no evento A -> 201", r.status === 201, r.corpo);
      r = await chamar("POST", `/eventos/${eventoB}/inscricoes`, { token: alunoConflito.token });
      checar(
        "o aluno não se inscreve no B, que cruza com o A -> 409 com a mensagem do outro evento",
        r.status === 409 &&
          r.corpo.code === "CONFLITO_DE_HORARIO" &&
          r.corpo.message ===
            `Você já está inscrito em Evento Conflito A ${sufixo}, que acontece no mesmo horário (${quandoA}). Cancele aquela inscrição para se inscrever nesta.`,
        r.corpo,
      );
      r = await chamar("POST", "/inscricoes", { token: secretaria.token, corpo: { participanteId: participanteConflito.id, eventoId: eventoB } });
      checar(
        "a equipe também não inscreve o aluno no B -> 409, com a mensagem falando do aluno",
        r.status === 409 &&
          r.corpo.code === "CONFLITO_DE_HORARIO" &&
          r.corpo.message ===
            `O aluno já está inscrito em Evento Conflito A ${sufixo}, que acontece no mesmo horário (${quandoA}). Cancele aquela inscrição para inscrevê-lo nesta.`,
        r.corpo,
      );
      r = await chamar("POST", `/eventos/${eventoC}/inscricoes`, { token: alunoConflito.token });
      checar("evento que só encosta no horário (termina quando o A começa) é aceito -> 201", r.status === 201, r.corpo);
      r = await chamar("DELETE", `/eventos/${eventoA}/inscricoes`, { token: alunoConflito.token });
      checar("o aluno cancela a inscrição no A -> 204", r.status === 204, r.status);
      r = await chamar("POST", `/eventos/${eventoB}/inscricoes`, { token: alunoConflito.token });
      checar("inscrição cancelada não conta: agora o B é aceito -> 201", r.status === 201, r.corpo);
      // mudar o horario de um evento aprovado nao cancela inscricao (a regra vale so para inscricao nova): o B (sozinho
      // na sala 2) passa para 18h-20h, cruzando com o C (17h-19h)
      r = await chamar("PUT", `/eventos/${eventoB}`, { token: secretaria.token, corpo: { horario: emHorasConflito(18).toISOString() } });
      const inscricoesDoAluno = await prisma.inscricao.count({ where: { participanteId: participanteConflito.id, eventoId: { in: [eventoB, eventoC] } } });
      checar(
        "mudar o horário do B para cruzar com o C não cancela nenhuma inscrição",
        r.status === 200 && inscricoesDoAluno === 2,
        { status: r.status, inscricoesDoAluno },
      );
      await prisma.inscricao.deleteMany({ where: { participanteId: participanteConflito.id } });
    }

    // ------------------------------------------------------------------ tela Equipe (professor e secretaria)
    requisito("R48 Tela Equipe: secretaria por convite, quem gerencia quem, exclusão e auditoria preservada");
    {
      const SENHA_SECRETARIA_NOVA = "Secretaria@Nova123";
      r = await chamar("GET", "/equipe", { token: admin.token });
      checar(
        "a lista da Equipe tem professores e secretarias, nunca administradores, com o perfil",
        r.status === 200 &&
          r.corpo.length > 0 &&
          r.corpo.every((c: { perfil: string }) => c.perfil === "PROFESSOR" || c.perfil === "SECRETARIA") &&
          !r.corpo.some((c: { id: string }) => c.id === admin.id),
        r.status,
      );
      r = await chamar("GET", "/equipe?perfil=SECRETARIA", { token: admin.token });
      checar("filtro por perfil", r.status === 200 && r.corpo.every((c: { perfil: string }) => c.perfil === "SECRETARIA"), r.status);

      const emailSecretariaNova = `secretaria.nova.${sufixo}@umc.br`;
      r = await chamar("POST", "/equipe", {
        token: secretaria.token,
        corpo: { nomeCompleto: "Secretaria Nova", email: `outra.${sufixo}@umc.br`, perfil: "SECRETARIA" },
      });
      checar("a secretaria não cria conta de secretaria -> 403", r.status === 403 && r.corpo.code === "SO_ADMINISTRADOR", r.corpo);
      r = await chamar("POST", "/equipe", { token: admin.token, corpo: { nomeCompleto: "Secretaria Nova", email: emailSecretariaNova, perfil: "SECRETARIA" } });
      const secretariaNova: Conta = { id: r.corpo.conta?.id, email: emailSecretariaNova, senha: SENHA_SECRETARIA_NOVA, perfil: "SECRETARIA", participanteId: null };
      contas.push(secretariaNova);
      const conviteSecretaria = conviteDo(r.corpo.linkConviteDemo);
      checar(
        "o administrador cria a secretaria por convite -> 201, convite pendente, só o hash da chave no banco",
        r.status === 201 &&
          r.corpo.conta?.perfil === "SECRETARIA" &&
          r.corpo.conta?.situacao === "AGUARDANDO_PRIMEIRO_ACESSO" &&
          conviteSecretaria.length > 0 &&
          (await prisma.primeiroAcesso.findUnique({ where: { usuarioId: secretariaNova.id } }))?.codigoHash === sha256(conviteSecretaria),
        r.corpo,
      );
      r = await chamar("POST", "/auth/login", { corpo: { emailLogin: emailSecretariaNova, senha: SENHA_SECRETARIA_NOVA } });
      checar("antes do primeiro acesso a secretaria não entra -> 401", r.status === 401, r.status);
      r = await chamar("POST", "/auth/recuperacao-senha", { corpo: { email: emailSecretariaNova } });
      checar('"Esqueci minha senha" de quem espera o convite responde como e-mail inexistente (sem código)', r.status === 200 && !r.corpo.codigoDemo, r.corpo);
      r = await chamar("POST", "/auth/primeiro-acesso/convite", { corpo: { convite: conviteSecretaria } });
      checar("o link do convite abre para a secretaria", r.status === 200 && r.corpo.email === emailSecretariaNova, r.corpo);
      r = await chamar("POST", "/auth/primeiro-acesso", { corpo: { convite: conviteSecretaria, novaSenha: SENHA_SECRETARIA_NOVA, aceiteLgpd: true } });
      checar("a secretaria cria a senha pelo convite -> 200", r.status === 200, r.corpo);
      secretariaNova.token = await entrar(secretariaNova);
      const usuarioSecretaria = await prisma.usuario.findUnique({ where: { id: secretariaNova.id } });
      checar(
        "depois do convite ela entra como SECRETARIA, com o aceite dos Termos gravado",
        !!secretariaNova.token && usuarioSecretaria?.perfil === "SECRETARIA" && usuarioSecretaria?.versaoTermosAceitos === VERSAO_TERMOS_ATUAL && !!usuarioSecretaria?.consentimentoLgpdEm,
      );

      r = await chamar("GET", "/equipe", { token: secretaria.token });
      const vistaPelaSecretaria = (r.corpo ?? []).find((c: { id: string }) => c.id === secretariaNova.id);
      checar(
        "para a secretaria, as outras secretarias aparecem sem ações (podeGerenciar = false)",
        r.status === 200 && vistaPelaSecretaria?.podeGerenciar === false,
        vistaPelaSecretaria,
      );
      r = await chamar("POST", `/equipe/${secretariaNova.id}/inativar`, { token: secretaria.token, corpo: { motivo: "Teste" } });
      checar("a secretaria não inativa outra secretaria -> 403", r.status === 403 && r.corpo.code === "SO_ADMINISTRADOR", r.corpo);
      r = await chamar("DELETE", `/equipe/${secretariaNova.id}`, { token: secretaria.token });
      checar("a secretaria não exclui outra secretaria -> 403", r.status === 403, r.corpo);
      r = await chamar("POST", `/equipe/${secretaria.id}/inativar`, { token: secretaria.token, corpo: { motivo: "Teste" } });
      checar("ninguém inativa a própria conta por esta tela -> 403", r.status === 403 && r.corpo.code === "PROPRIA_CONTA", r.corpo);
      r = await chamar("POST", `/equipe/${admin.id}/inativar`, { token: admin.token, corpo: { motivo: "Teste" } });
      checar("nem o administrador na própria conta -> 403", r.status === 403 && r.corpo.code === "PROPRIA_CONTA", r.corpo);

      // conta de administrador: a tela nunca inativa nem exclui (e o sistema nunca fica sem nenhum administrador ativo)
      const outroAdmin = await prisma.usuario.findFirst({ where: { perfil: "ADMINISTRADOR", ativo: true, id: { not: admin.id } }, select: { id: true } });
      const alvoAdmin = outroAdmin?.id ?? admin.id;
      const inativarAdmin = await chamar("POST", `/equipe/${alvoAdmin}/inativar`, { token: secretaria.token, corpo: { motivo: "Teste" } });
      r = await chamar("DELETE", `/equipe/${alvoAdmin}`, { token: secretaria.token });
      const ativosDepois = await prisma.usuario.count({ where: { perfil: "ADMINISTRADOR", ativo: true } });
      checar(
        "conta de administrador não é inativada nem excluída pela tela (403 ou 409 ULTIMO_ADMINISTRADOR) e continua ativa",
        [403, 409].includes(inativarAdmin.status) &&
          [403, 409].includes(r.status) &&
          !!(await prisma.usuario.findFirst({ where: { id: alvoAdmin, ativo: true } })) &&
          ativosDepois >= 1,
        { inativar: inativarAdmin.corpo?.code, excluir: r.corpo?.code },
      );
      r = await chamar("POST", "/equipe", { token: admin.token, corpo: { nomeCompleto: "Administrador Novo", email: `adm.${sufixo}@umc.br`, perfil: "ADMINISTRADOR" } });
      checar("a tela não cria conta de administrador -> 422", r.status === 422, r.corpo);

      // inativar a secretaria: as sessoes caem e o login recusa; nada para transferir
      r = await chamar("GET", `/equipe/${secretariaNova.id}/eventos-em-aberto`, { token: admin.token });
      checar("secretaria não tem eventos para transferir", r.status === 200 && Array.isArray(r.corpo) && r.corpo.length === 0, r.corpo);
      r = await chamar("DELETE", `/equipe/${secretariaNova.id}`, { token: admin.token });
      checar("conta ativa (já ativada) não é excluída -> 409", r.status === 409 && r.corpo.code === "CONTA_ATIVA", r.corpo);
      r = await chamar("POST", `/equipe/${secretariaNova.id}/inativar`, { token: admin.token, corpo: { motivo: "Fim do contrato" } });
      const meDepois = await chamar("GET", "/usuarios/me", { token: secretariaNova.token });
      const loginDepois = await chamar("POST", "/auth/login", { corpo: { emailLogin: emailSecretariaNova, senha: SENHA_SECRETARIA_NOVA } });
      checar(
        "o administrador inativa a secretaria -> 200 INATIVO, a sessão dela cai e o login recusa",
        r.status === 200 && r.corpo.conta?.situacao === "INATIVO" && meDepois.status === 401 && loginDepois.status === 403,
        { inativar: r.status, me: meDepois.status, login: loginDepois.status },
      );
      // excluir: sem historico a conta sai; os logs dela ficam (usuarioId nulo, com o nome de quem agiu)
      const logsAntes = await prisma.logAuditoria.count({ where: { usuarioId: secretariaNova.id } });
      r = await chamar("DELETE", `/equipe/${secretariaNova.id}`, { token: admin.token });
      const logsDepois = await prisma.logAuditoria.count({ where: { usuarioId: null, atorNome: "Secretaria Nova", criadoEm: { gte: inicioDoTeste } } });
      const logExclusao = await prisma.logAuditoria.findFirst({ where: { acao: "CONTA_EQUIPE_EXCLUIDA", detalhe: { contains: secretariaNova.id } } });
      checar(
        "secretaria inativa sem histórico é excluída; os registros de auditoria dela ficam",
        r.status === 200 &&
          r.corpo.excluida === true &&
          !(await prisma.usuario.findUnique({ where: { id: secretariaNova.id } })) &&
          logsAntes > 0 &&
          logsDepois >= logsAntes,
        { status: r.status, logsAntes, logsDepois },
      );
      checar(
        "a exclusão fica na auditoria sem dado pessoal (sem nome nem e-mail no detalhe)",
        !!logExclusao && !logExclusao.detalhe!.includes("Secretaria Nova") && !logExclusao.detalhe!.includes(emailSecretariaNova),
        logExclusao?.detalhe,
      );

      // convite pendente: a conta e o convite saem juntos (corrigir e-mail digitado errado)
      const emailErrado = `prof.errado.${sufixo}@umc.br`;
      r = await chamar("POST", "/equipe", { token: secretaria.token, corpo: { nomeCompleto: "Professor Digitado Errado", email: emailErrado } });
      const pendenteId: string = r.corpo.conta?.id;
      const convitePendente = conviteDo(r.corpo.linkConviteDemo);
      contas.push({ id: pendenteId, email: emailErrado, senha: "", perfil: "PROFESSOR", participanteId: null });
      checar("sem perfil a conta nasce como professor", r.status === 201 && r.corpo.conta?.perfil === "PROFESSOR", r.corpo);
      r = await chamar("DELETE", `/equipe/${pendenteId}`, { token: secretaria.token });
      const consultaDepois = await chamar("POST", "/auth/primeiro-acesso/convite", { corpo: { convite: convitePendente } });
      checar(
        "conta com convite pendente é excluída junto com o convite (o link deixa de valer)",
        r.status === 200 &&
          r.corpo.excluida === true &&
          !(await prisma.usuario.findUnique({ where: { id: pendenteId } })) &&
          !(await prisma.primeiroAcesso.findUnique({ where: { usuarioId: pendenteId } })) &&
          consultaDepois.status === 422,
        { excluir: r.corpo, convite: consultaDepois.status },
      );
      r = await chamar("POST", "/equipe", { token: secretaria.token, corpo: { nomeCompleto: "Professor Digitado Certo", email: emailErrado } });
      if (r.corpo?.conta?.id) contas.push({ id: r.corpo.conta.id, email: emailErrado, senha: "", perfil: "PROFESSOR", participanteId: null });
      checar("o mesmo e-mail pode ser cadastrado de novo depois da exclusão", r.status === 201, r.corpo);

      // professor com historico (eventos criados): a exclusao so inativa
      await chamar("POST", `/equipe/${professorA.id}/inativar`, { token: secretaria.token, corpo: { motivo: "Licença", transferirPara: "EQUIPE" } });
      r = await chamar("DELETE", `/equipe/${professorA.id}`, { token: secretaria.token });
      checar(
        "professor com histórico não é excluído: fica inativo, com a mensagem",
        r.status === 200 &&
          r.corpo.excluida === false &&
          r.corpo.mensagem === "Esta conta tem histórico no sistema e fica preservada como inativa." &&
          !!(await prisma.usuario.findFirst({ where: { id: professorA.id, ativo: false } })),
        r.corpo,
      );
      checar(
        "a preservação fica na auditoria",
        !!(await prisma.logAuditoria.findFirst({ where: { acao: "CONTA_EQUIPE_PRESERVADA", detalhe: { contains: professorA.id } } })),
      );
      await chamar("POST", `/equipe/${professorA.id}/reativar`, { token: secretaria.token });
    }

    // ------------------------------------------------------------------ avaliacao pelo check-in, auditoria e e-mails
    requisito("R49 Avaliação liberada pela presença, auditoria só do administrador, lotação e e-mails no modelo do site");
    {
      r = await chamar("GET", "/logs-auditoria", { token: secretaria.token });
      checar("a secretaria não vê a auditoria -> 403", r.status === 403, r.status);
      r = await chamar("GET", "/logs-auditoria/responsaveis", { token: secretaria.token });
      checar("nem a lista de responsáveis -> 403", r.status === 403, r.status);
      r = await chamar("GET", "/logs-auditoria", { token: admin.token });
      checar("o administrador vê a auditoria -> 200", r.status === 200 && Array.isArray(r.corpo.itens), r.status);

      // alunos so deste cenario (sem outras inscricoes), criados direto no banco
      const novoAluno = async (letra: string): Promise<Conta> => {
        const participanteId = randomUUID();
        await prisma.participante.create({ data: { id: participanteId, rgm: rgmAleatorio() } });
        const conta: Conta = { id: randomUUID(), email: `aval.${letra}.${sufixo}@alunos.umc.br`, senha: SENHA_ALUNO, perfil: "ALUNO", participanteId };
        await prisma.usuario.create({
          data: {
            id: conta.id,
            nome: `Aluno Avaliação ${letra.toUpperCase()}`,
            emailLogin: conta.email,
            senhaHash: await bcrypt.hash(SENHA_ALUNO, 4),
            perfil: "ALUNO",
            participanteId,
            consentimentoLgpdEm: new Date(),
            versaoTermosAceitos: VERSAO_TERMOS_ATUAL,
          },
        });
        contas.push(conta);
        conta.token = await entrar(conta);
        return conta;
      };
      const [alunoP, alunoS, alunoR, alunoA, alunoN] = [await novoAluno("p"), await novoAluno("s"), await novoAluno("r"), await novoAluno("a"), await novoAluno("n")];
      const salaAvaliacao = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: codigoDeSala(), tipo: "SALA_DE_AULA", capacidade: 10 } });
      salas.push(salaAvaliacao.corpo.id);
      r = await chamar("POST", "/eventos", {
        token: secretaria.token,
        corpo: {
          titulo: `Evento Avaliação ${sufixo}`,
          horario: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          salaId: salaAvaliacao.corpo.id,
          palestranteId,
          tema: "Tema",
          cargaHoraria: 1,
          questionario: questionario(),
        },
      });
      const eventoAval: string = r.corpo.id;
      eventos.push(eventoAval);
      const inscricaoAval: Record<string, string> = {};
      for (const conta of [alunoP, alunoS, alunoR, alunoA, alunoN]) {
        r = await chamar("POST", `/eventos/${eventoAval}/inscricoes`, { token: conta.token });
        inscricaoAval[conta.id] = r.corpo.id;
      }
      // P: presenca confirmada; S: pediu e espera; R: recusado; A: ausente; N: sem pedido
      for (const conta of [alunoP, alunoS, alunoR]) await chamar("POST", `/eventos/${eventoAval}/checkin`, { token: conta.token });
      await chamar("POST", `/checkin/inscricoes/${inscricaoAval[alunoP.id]}/aprovar`, { token: secretaria.token });
      await chamar("POST", `/checkin/inscricoes/${inscricaoAval[alunoR.id]}/recusar`, { token: secretaria.token });
      await prisma.inscricao.update({ where: { id: inscricaoAval[alunoA.id] }, data: { statusPresenca: "AUSENTE" } });

      r = await chamar("GET", "/feedbacks/elegiveis", { token: alunoP.token });
      checar("o evento aparece para avaliar assim que a presença é confirmada", r.status === 200 && r.corpo.some((e: { id: string }) => e.id === eventoAval), r.corpo);
      r = await chamar("POST", "/feedbacks", { token: alunoP.token, corpo: { eventoId: eventoAval, nota: 5, comentario: "Gostei muito" } });
      checar(
        "aluno com presença confirmada avalia sem ter respondido o questionário -> 201",
        r.status === 201 && (await prisma.tentativaQuestionario.count({ where: { participanteId: alunoP.participanteId!, eventoId: eventoAval } })) === 0,
        r.corpo,
      );
      for (const [conta, situacao] of [
        [alunoS, "SOLICITADO"],
        [alunoR, "RECUSADO"],
        [alunoA, "AUSENTE"],
        [alunoN, "sem check-in (PENDENTE)"],
      ] as const) {
        r = await chamar("POST", "/feedbacks", { token: conta.token, corpo: { eventoId: eventoAval, nota: 4, comentario: "Tentativa" } });
        checar(
          `aluno ${situacao} não avalia -> 403 com a mensagem`,
          r.status === 403 && r.corpo.message === "Você só pode avaliar eventos em que sua presença foi confirmada.",
          r.corpo,
        );
      }
      r = await chamar("DELETE", `/eventos/${eventoAval}/inscricoes`, { token: alunoN.token });
      r = await chamar("POST", "/feedbacks", { token: alunoN.token, corpo: { eventoId: eventoAval, nota: 4, comentario: "Tentativa" } });
      checar("inscrição cancelada não avalia -> 403", r.status === 403 && r.corpo.code === "PRESENCA_NAO_CONFIRMADA", r.corpo);

      // desfazer a presenca de quem so avaliou: a avaliacao sai junto
      r = await chamar("GET", `/checkin/eventos/${eventoAval}`, { token: secretaria.token });
      const decididoP = (r.corpo?.decididos ?? []).find((d: { inscricaoId: string }) => d.inscricaoId === inscricaoAval[alunoP.id]);
      checar("o painel avisa que o aluno já avaliou o evento (avaliou = true)", decididoP?.avaliou === true, decididoP);
      r = await chamar("POST", `/checkin/inscricoes/${inscricaoAval[alunoP.id]}/recusar`, { token: secretaria.token });
      const avaliacaoDepois = await prisma.feedback.findFirst({ where: { participanteId: alunoP.participanteId!, eventoId: eventoAval } });
      checar(
        "desfazer a presença de quem só avaliou -> 200 RECUSADO e a avaliação é apagada",
        r.status === 200 && r.corpo.statusPresenca === "RECUSADO" && !avaliacaoDepois,
        { status: r.status, avaliacao: !!avaliacaoDepois },
      );
      const logApagada = await prisma.logAuditoria.findFirst({
        where: { acao: "FEEDBACK_EXCLUIDO", detalhe: { contains: `apagado ao desfazer a presença (inscrição ${inscricaoAval[alunoP.id]})` } },
      });
      checar(
        "a avaliação apagada vai para a auditoria, sem o comentário nem dado pessoal",
        !!logApagada && !logApagada.detalhe!.includes("Gostei muito") && !logApagada.detalhe!.includes(alunoP.email),
        logApagada?.detalhe,
      );

      // quem ja respondeu o questionario: a presenca fica travada
      await chamar("POST", `/checkin/inscricoes/${inscricaoAval[alunoS.id]}/aprovar`, { token: secretaria.token });
      await chamar("POST", `/eventos/${eventoAval}/questionario/respostas`, { token: alunoS.token, corpo: { respostas: Array(10).fill(0) } });
      r = await chamar("POST", "/feedbacks", { token: alunoS.token, corpo: { eventoId: eventoAval, nota: 3, comentario: "Depois do questionário" } });
      checar("depois do questionário o aluno também avalia -> 201", r.status === 201, r.corpo);
      r = await chamar("POST", `/checkin/inscricoes/${inscricaoAval[alunoS.id]}/recusar`, { token: secretaria.token });
      checar(
        "desfazer a presença de quem já respondeu o questionário -> 409 PRESENCA_TRAVADA e a avaliação fica",
        r.status === 409 &&
          r.corpo.code === "PRESENCA_TRAVADA" &&
          !!(await prisma.feedback.findFirst({ where: { participanteId: alunoS.participanteId!, eventoId: eventoAval } })),
        r.corpo,
      );

      // lotacao: evento futuro com 1 vaga recusa a segunda inscricao; depois do cancelamento, aceita
      const salaUmaVaga = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: codigoDeSala(), tipo: "LABORATORIO", capacidade: 1 } });
      salas.push(salaUmaVaga.corpo.id);
      r = await chamar("POST", "/eventos", {
        token: secretaria.token,
        corpo: {
          titulo: `Evento Uma Vaga ${sufixo}`,
          horario: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
          salaId: salaUmaVaga.corpo.id,
          palestranteId,
          tema: "Tema",
          cargaHoraria: 1,
          questionario: questionario(),
        },
      });
      const eventoUmaVaga: string = r.corpo.id;
      eventos.push(eventoUmaVaga);
      r = await chamar("POST", `/eventos/${eventoUmaVaga}/inscricoes`, { token: alunoA.token });
      checar("a única vaga é ocupada -> 201", r.status === 201, r.corpo);
      r = await chamar("POST", `/eventos/${eventoUmaVaga}/inscricoes`, { token: alunoN.token });
      checar("evento lotado e ainda não iniciado recusa nova inscrição -> 409 EVENTO_LOTADO", r.status === 409 && r.corpo.code === "EVENTO_LOTADO", r.corpo);
      r = await chamar("GET", "/eventos", { token: alunoN.token });
      const lotadoVisto = (r.corpo ?? []).find((e: { id: string }) => e.id === eventoUmaVaga);
      checar("o evento lotado continua na programação do aluno, com 1 inscrito", lotadoVisto?.inscritos === 1, lotadoVisto);
      await chamar("DELETE", `/eventos/${eventoUmaVaga}/inscricoes`, { token: alunoA.token });
      r = await chamar("POST", `/eventos/${eventoUmaVaga}/inscricoes`, { token: alunoN.token });
      checar("depois do cancelamento, a vaga volta e a inscrição é aceita -> 201", r.status === 201, r.corpo);

      // e-mails: todos no modelo unico, com HTML e texto puro, e o dado de pessoa escapado
      const agoraEmail = new Date();
      const todosOsEmails = {
        "código do cadastro": conteudosEmail.conteudoCodigoCadastro("135790"),
        convite: conteudosEmail.conteudoDoConvite("Pessoa", "http://localhost:5173/#/primeiro-acesso?convite=abc"),
        "recuperação de senha": conteudosEmail.conteudoCodigoRecuperacao("246801"),
        "senha alterada": conteudosEmail.conteudoSenhaAlterada(agoraEmail),
        "inscrição confirmada": conteudosEmail.conteudoConfirmacaoInscricao({
          participanteNome: "Aluno",
          eventoTitulo: "Evento",
          eventoTema: "Tema",
          palestranteNome: "Palestrante",
          eventoHorario: agoraEmail,
          salaRotulo: "1T-01 · Laboratório",
        }),
        "inscrição cancelada": conteudosEmail.conteudoCancelamentoInscricao({ participanteNome: "Aluno", eventoTitulo: "Evento", eventoHorario: agoraEmail }),
        "evento alterado": conteudosEmail.conteudoAlteracaoEvento({
          participanteNome: "Aluno",
          eventoTitulo: "Evento",
          mudancas: [{ rotulo: "Sala", antes: "1T-01 · Laboratório", depois: "2T-01 · Auditório" }],
        }),
      };
      const semVersao = Object.entries(todosOsEmails).filter(
        ([, email]) =>
          !email.html.startsWith("<!DOCTYPE html>") ||
          !email.html.includes("UMC</span> · Gestão de Eventos Acadêmicos") ||
          !email.html.includes("Mensagem automática do SGEA, não responda.") ||
          !email.html.includes("privacidade@sgeacademicos.com.br") ||
          email.text.trim().length === 0 ||
          email.text.includes("<") ||
          !email.text.includes("Mensagem automática do SGEA, não responda."),
      );
      checar("cada e-mail tem a versão HTML (cabeçalho, rodapé) e a versão em texto puro", semVersao.length === 0, semVersao.map(([nome]) => nome));
      checar(
        "e-mail com código: o código aparece no HTML e no texto, com a validade",
        todosOsEmails["código do cadastro"].html.includes("135790") &&
          todosOsEmails["código do cadastro"].text.includes("Código: 135790") &&
          todosOsEmails["código do cadastro"].html.includes("Esse código vale por 15 minutos."),
      );
      const comScript = conteudosEmail.conteudoConfirmacaoInscricao({
        participanteNome: '<script>alert("x")</script>',
        eventoTitulo: "<b>Evento</b>",
        eventoTema: "Tema",
        palestranteNome: "<img src=x onerror=alert(1)>",
        eventoHorario: agoraEmail,
      });
      checar(
        "nome com <script> (e título e palestrante com tag) sai escapado no HTML",
        !comScript.html.includes("<script>") &&
          comScript.html.includes("&lt;script&gt;") &&
          !comScript.html.includes("<b>Evento</b>") &&
          !comScript.html.includes("<img src=x"),
      );
      await prisma.inscricao.deleteMany({ where: { eventoId: { in: [eventoAval, eventoUmaVaga] } } });
      await prisma.feedback.deleteMany({ where: { eventoId: eventoAval } });
      await prisma.tentativaQuestionario.deleteMany({ where: { eventoId: eventoAval } });
    }

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
    // historico da aprovacao dos eventos e palestrantes do teste (nao tem chave estrangeira pro item)
    await prisma.historicoAprovacao.deleteMany({ where: { itemId: { in: [...eventos, ...palestrantes] } } });
    for (const id of eventos) await prisma.evento.deleteMany({ where: { id } });
    for (const conta of contas) {
      if (conta.participanteId) {
        await prisma.tentativaQuestionario.deleteMany({ where: { participanteId: conta.participanteId } });
        await prisma.feedback.deleteMany({ where: { participanteId: conta.participanteId } });
        await prisma.inscricao.deleteMany({ where: { participanteId: conta.participanteId } });
      }
      await prisma.limiteAcesso.deleteMany({
        where: {
          chave: {
            in: [
              `login:conta:${indiceBusca(conta.email)}`,
              `recuperacao:conta:${indiceBusca(conta.email)}`,
              `mfa:conta:${conta.id}`,
              `primeiro-acesso:conta:${conta.id}`,
              `troca-senha:conta:${conta.id}`,
            ],
          },
        },
      });
      await prisma.usuario.deleteMany({ where: { id: conta.id } });
      if (conta.participanteId) await prisma.participante.deleteMany({ where: { id: conta.participanteId } });
    }
    // cadastros que ficaram pendentes e o contador de envios do codigo de cada e-mail usado
    await prisma.cadastroPendente.deleteMany({ where: { emailLogin: { in: emailsDeCadastro } } });
    await prisma.limiteAcesso.deleteMany({ where: { chave: { in: emailsDeCadastro.map((email) => `cadastro:conta:${indiceBusca(email)}`) } } });
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
