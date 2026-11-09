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
        pendenteAluno.versaoTermos === "4",
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
      "a conta recebe a senha do cadastro, o instante do aceite e a versão vigente (4) dos termos; o pendente é apagado",
      !!contaCriada &&
        contaCriada.senhaHash === pendenteAluno?.senhaHash &&
        contaCriada.consentimentoLgpdEm?.getTime() === pendenteAluno?.aceiteEm.getTime() &&
        contaCriada.versaoTermosAceitos === "4" &&
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
        versaoTermos: "4",
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
    // o "Evento Encostado" comeca daqui a 2h30: a janela (1 hora antes do inicio) ainda nao abriu
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
    r = await chamar("GET", `/logs-auditoria?acao=SALA_CRIADA&usuarioId=${admin.id}`, { token: secretaria.token });
    checar("filtro por ação e responsável", r.status === 200 && r.corpo.itens.some((l: { detalhe: string }) => l.detalhe.includes(salaId)), r.corpo);
    r = await chamar("GET", "/logs-auditoria?pageSize=500", { token: secretaria.token });
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
    r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: `Sala Ocupação ${sufixo}`, capacidade: 10 } });
    const salaOcupacaoId: string = r.corpo.id;
    salas.push(salaOcupacaoId);
    r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: `Sala Sem Uso ${sufixo}`, capacidade: 5 } });
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
    requisito("R35 Conta de professor: criada pela equipe, ativada no primeiro acesso");
    const SENHA_PROFESSOR = "Prof@Teste123";
    const emailProfA = `prof.a.${sufixo}@umc.br`;
    r = await chamar("POST", "/professores", { token: secretaria.token, corpo: { nomeCompleto: "Professor Teste A", email: `prof.x.${sufixo}@alunos.umc.br` } });
    checar("e-mail @alunos.umc.br para professor -> 422", r.status === 422, r.corpo);
    r = await chamar("POST", "/professores", { token: aluno.token, corpo: { nomeCompleto: "Professor Teste A", email: emailProfA } });
    checar("aluno não cria professor -> 403", r.status === 403, r.status);
    r = await chamar("POST", "/professores", { token: secretaria.token, corpo: { nomeCompleto: "Professor Teste A", email: emailProfA.toUpperCase() } });
    checar(
      "secretaria cria professor (só nome e e-mail) -> 201, aguardando primeiro acesso, com o código fora de produção",
      r.status === 201 && r.corpo.professor?.situacao === "AGUARDANDO_PRIMEIRO_ACESSO" && r.corpo.professor.email === emailProfA && /^\d{6}$/.test(r.corpo.codigoDemo ?? ""),
      r.corpo,
    );
    const professorA: Conta = { id: r.corpo.professor?.id, email: emailProfA, senha: SENHA_PROFESSOR, perfil: "PROFESSOR", participanteId: null };
    contas.push(professorA);
    const codigoProfA: string = r.corpo.codigoDemo;
    const contaProfA = await prisma.usuario.findUnique({ where: { id: professorA.id }, include: { primeiroAcesso: true } });
    checar(
      "conta nasce sem senha utilizável e sem aceite dos Termos; código guardado só em hash, válido por 24 h",
      contaProfA?.senhaHash === "!" &&
        contaProfA.consentimentoLgpdEm === null &&
        !!contaProfA.primeiroAcesso &&
        contaProfA.primeiroAcesso.codigoHash !== codigoProfA &&
        Math.abs(contaProfA.primeiroAcesso.expiraEm.getTime() - Date.now() - 24 * 3600 * 1000) < 60 * 1000,
    );
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: emailProfA, senha: SENHA_PROFESSOR } });
    checar("professor não entra antes do primeiro acesso -> 401 genérico", r.status === 401 && r.corpo.code === "CREDENCIAIS_INVALIDAS", r.corpo);
    r = await chamar("POST", "/auth/primeiro-acesso", { corpo: { email: emailProfA, codigo: codigoProfA, novaSenha: SENHA_PROFESSOR, aceiteLgpd: false } });
    checar("primeiro acesso sem aceite dos Termos -> 422", r.status === 422 && r.corpo.erros?.some((e: { campo: string }) => e.campo === "aceiteLgpd"), r.corpo);
    r = await chamar("POST", "/auth/primeiro-acesso", { corpo: { email: emailProfA, codigo: codigoProfA, novaSenha: "fraca", aceiteLgpd: true } });
    checar("primeiro acesso com senha fora da regra -> 422", r.status === 422, r.status);
    const codigoErradoProf = codigoProfA === "000000" ? "111111" : "000000";
    const codigoErrado = await chamar("POST", "/auth/primeiro-acesso", { corpo: { email: emailProfA, codigo: codigoErradoProf, novaSenha: SENHA_PROFESSOR, aceiteLgpd: true } });
    const emailInexistenteProf = await chamar("POST", "/auth/primeiro-acesso", {
      corpo: { email: `ninguem.prof.${sufixo}@umc.br`, codigo: "123456", novaSenha: SENHA_PROFESSOR, aceiteLgpd: true },
    });
    checar(
      "código errado e e-mail inexistente -> o mesmo 422 CODIGO_INVALIDO (não revela quais e-mails existem)",
      codigoErrado.status === 422 &&
        emailInexistenteProf.status === 422 &&
        codigoErrado.corpo.code === "CODIGO_INVALIDO" &&
        codigoErrado.corpo.message === emailInexistenteProf.corpo.message,
      [codigoErrado.corpo, emailInexistenteProf.corpo],
    );
    r = await chamar("POST", "/auth/recuperacao-senha", { corpo: { email: emailProfA } });
    checar("'Esqueci a senha' não gera código para professor sem primeiro acesso (resposta genérica)", r.status === 200 && !r.corpo.codigoDemo, r.corpo);
    r = await chamar("POST", "/auth/primeiro-acesso", { corpo: { email: emailProfA, codigo: codigoProfA, novaSenha: SENHA_PROFESSOR, aceiteLgpd: true } });
    checar("primeiro acesso com código, senha e aceite -> 200", r.status === 200, r.corpo);
    const contaAtivada = await prisma.usuario.findUnique({ where: { id: professorA.id }, include: { primeiroAcesso: true } });
    checar(
      "grava a senha (hash), o aceite e a versão \"4\" dos Termos; o código sai do banco",
      !!contaAtivada?.consentimentoLgpdEm && contaAtivada.versaoTermosAceitos === "4" && contaAtivada.senhaHash.startsWith("$2a$12$") && !contaAtivada.primeiroAcesso,
    );
    checar(
      "aceite do professor registrado na auditoria",
      !!(await prisma.logAuditoria.findFirst({ where: { usuarioId: professorA.id, acao: "CONSENTIMENTO_LGPD_ACEITO" } })),
    );
    r = await chamar("POST", "/auth/login", { corpo: { emailLogin: emailProfA, senha: SENHA_PROFESSOR } });
    checar("depois do primeiro acesso o login funciona", r.status === 200 && !!r.corpo.token && r.corpo.usuario?.perfil === "PROFESSOR", r.corpo);
    professorA.token = r.corpo.token;
    r = await chamar("GET", "/professores", { token: secretaria.token });
    checar(
      "tela Professores lista o professor como ativo",
      r.status === 200 && r.corpo.some((p: { id: string; situacao: string }) => p.id === professorA.id && p.situacao === "ATIVO"),
      r.corpo,
    );
    r = await chamar("POST", `/professores/${professorA.id}/reenviar-codigo`, { token: secretaria.token });
    checar("reenviar código de quem já fez o primeiro acesso -> 409", r.status === 409, r.corpo);

    // segundo professor, pra conferir que um nao enxerga o do outro
    const emailProfB = `prof.b.${sufixo}@umc.br`;
    r = await chamar("POST", "/professores", { token: admin.token, corpo: { nomeCompleto: "Professor Teste B", email: emailProfB } });
    const professorB: Conta = { id: r.corpo.professor?.id, email: emailProfB, senha: SENHA_PROFESSOR, perfil: "PROFESSOR", participanteId: null };
    contas.push(professorB);
    await chamar("POST", "/auth/primeiro-acesso", { corpo: { email: emailProfB, codigo: r.corpo.codigoDemo, novaSenha: SENHA_PROFESSOR, aceiteLgpd: true } });
    professorB.token = await entrar(professorB);

    requisito("R36 Professor: só os próprios eventos; sem Auditoria, Participantes e criação de sala");
    r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: `Sala Professor ${sufixo}`, capacidade: 10 } });
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
    r = await chamar("POST", "/salas", { token: professorA.token, corpo: { nome: `Sala do Prof ${sufixo}`, capacidade: 5 } });
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
      corpo: { ...corpoEventoProf, titulo: `Evento Encerrado Trava ${sufixo}`, palestranteId, horario: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString() },
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
    r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: `Sala Proposta ${sufixo}`, capacidade: 30 } });
    const salaPropostaId: string = r.corpo.id;
    salas.push(salaPropostaId);
    r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: `Sala Minúscula ${sufixo}`, capacidade: 1 } });
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
    const professorC: Conta = { id: r.corpo.professor?.id, email: emailProfC, senha: SENHA_PROFESSOR, perfil: "PROFESSOR", participanteId: null };
    contas.push(professorC);
    await chamar("POST", "/auth/primeiro-acesso", { corpo: { email: emailProfC, codigo: r.corpo.codigoDemo, novaSenha: SENHA_PROFESSOR, aceiteLgpd: true } });
    r = await chamar("POST", `/professores/${professorC.id}/inativar`, { token: admin.token, corpo: { motivo: "Licença" } });
    checar("professor sem eventos em aberto é inativado sem transferência -> 200 INATIVO", r.status === 200 && r.corpo.professor?.situacao === "INATIVO" && r.corpo.eventosTransferidos === 0, r.corpo);
    r = await chamar("POST", `/professores/${professorA.id}/inativar`, { token: secretaria.token, corpo: { motivo: MOTIVO_INATIVACAO, transferirPara: professorC.id } });
    checar("professor inativo não é destino de transferência -> 422", r.status === 422 && r.corpo.erros?.some((e: { campo: string }) => e.campo === "transferirPara"), r.corpo);
    r = await chamar("POST", `/professores/${professorA.id}/inativar`, { token: secretaria.token, corpo: { motivo: MOTIVO_INATIVACAO, transferirPara: professorA.id } });
    checar("transferir para o próprio professor -> 422", r.status === 422, r.status);
    const tokenAntigoProfA = professorA.token;
    r = await chamar("POST", `/professores/${professorA.id}/inativar`, { token: secretaria.token, corpo: { motivo: MOTIVO_INATIVACAO, transferirPara: professorB.id } });
    checar(
      "com a transferência, o professor é inativado -> 200 INATIVO",
      r.status === 200 && r.corpo.professor?.situacao === "INATIVO" && r.corpo.eventosTransferidos === abertos.length,
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
    // 4 alunos criados direto no banco (o cadastro ja foi testado no R01), ja com os termos vigentes aceitos
    const alunosCheckin: Conta[] = [];
    for (const letra of ["X", "Y", "Z", "W"]) {
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
      alunosCheckin.push(conta);
    }
    const [alunoX, alunoY, alunoZ, alunoW] = alunosCheckin;
    const salasCheckin: string[] = [];
    for (const nome of ["Sala Check-in 1", "Sala Check-in 2"]) {
      r = await chamar("POST", "/salas", { token: secretaria.token, corpo: { nome: `${nome} ${sufixo}`, capacidade: 10 } });
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
    // evento Q: da equipe
    r = await chamar("POST", "/eventos", { token: admin.token, corpo: { ...corpoCheckin, titulo: `Evento Check-in Q ${sufixo}`, salaId: salasCheckin[1] } });
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

    // dashboard do professor A: so o evento P (X e Z presentes, Y recusado, W pediu, aluno principal sem pedido)
    await chamar("POST", `/eventos/${eventoP}/inscricoes`, { token: aluno.token });
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
