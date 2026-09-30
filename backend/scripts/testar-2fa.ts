// testes ponta a ponta do 2FA (TOTP) contra o banco de DESENVOLVIMENTO — se recusa a rodar se o
// DATABASE_URL nao for o SGEA_dev. Sobe o backend numa porta local, cria contas de teste proprias,
// faz as chamadas HTTP de verdade e apaga as contas no final (logs de auditoria ficam, como sempre).
//
// como rodar (de dentro de backend/):  npx tsx scripts/testar-2fa.ts
import "dotenv/config";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import type { AddressInfo } from "net";
import jwt from "jsonwebtoken";
import { generate } from "otplib";

if (!process.env.DATABASE_URL?.includes("SGEA_dev")) {
  console.error("[testar-2fa] recusado: DATABASE_URL não aponta pro SGEA_dev");
  process.exit(1);
}

type Perfil = "ADMINISTRADOR" | "SECRETARIA" | "ALUNO";
interface Conta {
  id: string;
  email: string;
  senha: string;
  participanteId: string | null;
}
interface Resposta {
  status: number;
  // corpo JSON solto de proposito: o teste confere campo a campo
  corpo: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

let base = "";
const resultados: { nome: string; ok: boolean }[] = [];
const contas: Conta[] = [];

function checar(nome: string, ok: boolean) {
  resultados.push({ nome, ok });
  console.log(`${ok ? "  OK " : "  FALHOU"} ${nome}`);
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
  return { status: res.status, corpo: texto ? JSON.parse(texto) : undefined };
}

// codigo TOTP do passo atual + deslocamento (1 = proximo passo de 30s, aceito pela tolerancia)
function totp(segredo: string, deslocamento = 0): Promise<string> {
  return generate({ secret: segredo, epoch: Math.floor(Date.now() / 1000) + deslocamento * 30 });
}

async function codigoErrado(segredo: string): Promise<string> {
  const certo = await totp(segredo);
  return String((Number(certo) + 500000) % 1000000).padStart(6, "0");
}

async function main() {
  const { criarApp } = await import("../src/expressApp");
  const { prisma } = await import("../src/db/prisma");
  const { indiceBusca } = await import("../src/utils/criptografia");
  const { gerarHashSenha } = await import("../src/utils/password");
  const { env } = await import("../src/config/env");

  const servidor = criarApp().listen(0);
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`;

  async function criarConta(perfil: Perfil): Promise<Conta> {
    const email = `teste-2fa-${perfil.toLowerCase()}-${randomUUID().slice(0, 8)}@teste.invalido`;
    const senha = "SenhaTeste123";
    let participanteId: string | null = null;
    if (perfil === "ALUNO") {
      const rgm = `9${Date.now().toString().slice(-10)}`;
      const participante = await prisma.participante.create({
        data: {
          id: randomUUID(),
          nome: "Teste Dois Fatores",
          email,
          emailHash: indiceBusca(email),
          rgm,
          rgmHash: indiceBusca(rgm),
        },
      });
      participanteId = participante.id;
    }
    const usuario = await prisma.usuario.create({
      data: {
        id: randomUUID(),
        nome: `Teste Dois Fatores ${perfil}`,
        emailLogin: email,
        emailLoginHash: indiceBusca(email),
        senhaHash: await gerarHashSenha(senha),
        perfil,
        participanteId,
      },
    });
    const conta = { id: usuario.id, email, senha, participanteId };
    contas.push(conta);
    return conta;
  }

  function login(conta: Conta) {
    return chamar("POST", "/auth/login", { corpo: { emailLogin: conta.email, senha: conta.senha } });
  }

  // simula o relogio andando pro proximo passo sem esperar 30s de verdade: libera um codigo novo
  // (so no banco de dev, so pra este teste)
  async function avancarRelogio(conta: Conta) {
    await prisma.usuario.update({ where: { id: conta.id }, data: { mfaUltimoPasso: null } });
  }

  async function temLog(conta: Conta, acao: string, contendo?: string) {
    const logs = await prisma.logAuditoria.findMany({ where: { usuarioId: conta.id, acao } });
    return logs.some((l) => !contendo || (l.detalhe ?? "").includes(contendo));
  }

  try {
    // ---------------------------------------------------------------- ALUNO (2FA opcional)
    console.log("\n[ALUNO] ativação, login em duas etapas, reuso, recuperação, bloqueio, desativação");
    const aluno = await criarConta("ALUNO");

    let r = await login(aluno);
    checar("aluno sem 2FA entra direto (token de sessão, sem etapa)", r.status === 200 && !!r.corpo.token && !r.corpo.mfa);
    const tokenAlunoSemMfa: string = r.corpo.token;

    r = await chamar("POST", "/auth/2fa/configuracao", { token: tokenAlunoSemMfa });
    checar("gera QR code (PNG em data URL, feito no servidor) e segredo", r.status === 200 && r.corpo.qrCode.startsWith("data:image/png;base64,") && !!r.corpo.segredo);
    const segredoAluno: string = r.corpo.segredo;

    r = await chamar("POST", "/auth/2fa/configuracao", { token: tokenAlunoSemMfa });
    checar("chamar de novo antes de confirmar devolve o MESMO segredo", r.corpo.segredo === segredoAluno);

    const noBanco = await prisma.usuario.findUnique({ where: { id: aluno.id } });
    checar("segredo gravado cifrado (não aparece em texto puro no banco)", !!noBanco?.mfaSegredoCifrado && !noBanco.mfaSegredoCifrado.includes(segredoAluno));
    checar("2FA ainda inativo antes de confirmar", noBanco?.mfaAtivo === false);

    r = await chamar("POST", "/auth/2fa/configuracao/confirmar", { token: tokenAlunoSemMfa, corpo: { codigo: await codigoErrado(segredoAluno) } });
    checar("confirmar com código errado -> 422", r.status === 422);

    r = await chamar("POST", "/auth/2fa/configuracao/confirmar", { token: tokenAlunoSemMfa, corpo: { codigo: await totp(segredoAluno) } });
    const codigosAluno: string[] = r.corpo.codigosRecuperacao ?? [];
    checar("confirmar com código certo -> 200 e 8 códigos de recuperação distintos", r.status === 200 && codigosAluno.length === 8 && new Set(codigosAluno).size === 8);
    checar("ativação pelo aluno logado não emite sessão nova", r.corpo.sessao === undefined);

    const hashes = await prisma.codigoRecuperacaoMfa.findMany({ where: { usuarioId: aluno.id } });
    checar("8 códigos gravados só como hash (nenhum código em texto puro)", hashes.length === 8 && hashes.every((h) => !codigosAluno.some((c) => h.codigoHash.includes(c) || h.codigoHash.includes(c.replace("-", "")))));
    checar("auditoria MFA_ATIVADO", await temLog(aluno, "MFA_ATIVADO"));

    r = await login(aluno);
    checar("login com 2FA ativo devolve só o token de etapa (sem sessão)", r.status === 200 && r.corpo.mfa === "PENDENTE" && !!r.corpo.tokenEtapa && !r.corpo.token);
    let tokenEtapa: string = r.corpo.tokenEtapa;

    r = await chamar("GET", "/usuarios/me", { token: tokenEtapa });
    checar("token '2FA pendente' em outra rota (/usuarios/me) -> 401", r.status === 401);
    r = await chamar("GET", "/eventos", { token: tokenEtapa });
    checar("token '2FA pendente' em outra rota (/eventos) -> 401", r.status === 401);
    r = await chamar("POST", "/auth/2fa/configuracao", { token: tokenEtapa });
    checar("token '2FA pendente' na rota de configuração -> 401", r.status === 401);

    r = await chamar("POST", "/auth/2fa/verificar", { token: tokenEtapa, corpo: { codigo: await codigoErrado(segredoAluno) } });
    checar("código errado na segunda etapa -> 422", r.status === 422);
    checar("auditoria MFA_FALHA", await temLog(aluno, "MFA_FALHA", "login: código incorreto"));

    const codigoProximoPasso = await totp(segredoAluno, 1);
    r = await chamar("POST", "/auth/2fa/verificar", { token: tokenEtapa, corpo: { codigo: codigoProximoPasso } });
    checar("código certo (dentro da tolerância de ±1 janela) -> 200 com sessão", r.status === 200 && !!r.corpo.token);
    const tokenAlunoAntigo: string = r.corpo.token;
    checar("auditoria MFA_VERIFICADO e LOGIN_SUCESSO", (await temLog(aluno, "MFA_VERIFICADO", "aplicativo")) && (await temLog(aluno, "LOGIN_SUCESSO")));

    r = await chamar("GET", "/usuarios/me", { token: tokenAlunoAntigo });
    checar("sessão emitida funciona e mostra mfaAtivo=true", r.status === 200 && r.corpo.mfaAtivo === true);

    r = await login(aluno);
    tokenEtapa = r.corpo.tokenEtapa;
    r = await chamar("POST", "/auth/2fa/verificar", { token: tokenEtapa, corpo: { codigo: codigoProximoPasso } });
    checar("reuso do mesmo código na mesma janela -> 422", r.status === 422);
    checar("auditoria do reuso (MFA_FALHA código já utilizado)", await temLog(aluno, "MFA_FALHA", "código já utilizado"));

    // codigo de recuperacao digitado em minusculo e sem hifen: tem que funcionar igual
    const codigoRecuperacao = codigosAluno[0];
    r = await chamar("POST", "/auth/2fa/verificar", { token: tokenEtapa, corpo: { codigoRecuperacao: codigoRecuperacao.replace("-", "").toLowerCase() } });
    checar("código de recuperação funciona no lugar do TOTP", r.status === 200 && !!r.corpo.token && r.corpo.codigosRecuperacaoRestantes === 7);
    checar("auditoria CODIGO_RECUPERACAO_USADO", await temLog(aluno, "CODIGO_RECUPERACAO_USADO", "restam 7"));

    r = await login(aluno);
    r = await chamar("POST", "/auth/2fa/verificar", { token: r.corpo.tokenEtapa, corpo: { codigoRecuperacao } });
    checar("o mesmo código de recuperação não funciona de novo -> 422", r.status === 422);

    // bloqueio: 5 codigos errados; depois disso nem um codigo valido passa
    r = await login(aluno);
    tokenEtapa = r.corpo.tokenEtapa;
    for (let i = 0; i < 5; i++) {
      await chamar("POST", "/auth/2fa/verificar", { token: tokenEtapa, corpo: { codigo: await codigoErrado(segredoAluno) } });
    }
    r = await chamar("POST", "/auth/2fa/verificar", { token: tokenEtapa, corpo: { codigoRecuperacao: codigosAluno[1] } });
    checar("após 5 erros, bloqueia mesmo com código válido -> 429", r.status === 429);
    checar("auditoria MFA_BLOQUEADO", await temLog(aluno, "MFA_BLOQUEADO"));
    const recuperacaoIntacta = await prisma.codigoRecuperacaoMfa.findFirst({ where: { usuarioId: aluno.id, codigoHash: indiceBusca(`mfa-recuperacao:${codigosAluno[1].replace("-", "")}`) } });
    checar("tentativa bloqueada não gasta o código de recuperação", recuperacaoIntacta?.usadoEm === null);

    // ---------------------------------------------------------------- SECRETARIA (2FA opcional)
    console.log("\n[SECRETARIA] 2FA opcional também para a equipe");
    const secretaria = await criarConta("SECRETARIA");

    // sessao aberta antes da mudanca (formato de token antigo, sem etapa): continua valendo
    const tokenAntigoSecretaria = jwt.sign({ sub: secretaria.id, perfil: "SECRETARIA", participanteId: null }, env.jwtSecret, { expiresIn: 3600 });
    r = await chamar("GET", "/eventos", { token: tokenAntigoSecretaria });
    checar("sessão de secretaria sem 2FA não é mais recusada", r.status === 200);

    r = await login(secretaria);
    checar("login da secretaria sem 2FA -> sessão direto, sem etapa de configuração", r.status === 200 && !!r.corpo.token && !r.corpo.mfa);
    let tokenSecretaria: string = r.corpo.token;

    r = await chamar("POST", "/auth/2fa/configuracao", { token: tokenSecretaria });
    const segredoSecretaria: string = r.corpo.segredo;
    r = await chamar("POST", "/auth/2fa/configuracao/confirmar", { token: tokenSecretaria, corpo: { codigo: await totp(segredoSecretaria) } });
    checar("secretaria ativa o 2FA por vontade própria -> códigos de recuperação", r.status === 200 && r.corpo.codigosRecuperacao?.length === 8);

    r = await login(secretaria);
    checar("com o 2FA ativo, o login da secretaria pede o código", r.corpo.mfa === "PENDENTE" && !r.corpo.token);
    r = await chamar("POST", "/auth/2fa/verificar", { token: r.corpo.tokenEtapa, corpo: { codigo: await totp(segredoSecretaria, 1) } });
    checar("código certo -> sessão da secretaria", r.status === 200 && !!r.corpo.token);
    tokenSecretaria = r.corpo.token;

    r = await chamar("GET", "/usuarios", { token: tokenSecretaria });
    checar("secretaria não lista usuários -> 403", r.status === 403);
    r = await chamar("DELETE", `/usuarios/${aluno.id}/2fa`, { token: tokenSecretaria });
    checar("secretaria não reseta 2FA de ninguém -> 403", r.status === 403);

    // ---------------------------------------------------------------- ADMINISTRADOR
    console.log("\n[ADMINISTRADOR] desbloqueio, reset do 2FA de outro usuário, listagem");
    const admin = await criarConta("ADMINISTRADOR");
    r = await login(admin);
    const tokenAdmin: string = r.corpo.token;
    checar("administrador sem 2FA entra direto", r.status === 200 && !!tokenAdmin && !r.corpo.mfa);

    r = await chamar("DELETE", `/usuarios/${aluno.id}/bloqueio`, { token: tokenAdmin });
    checar("admin remove o bloqueio (inclui o do 2FA) -> 204", r.status === 204);
    r = await login(aluno);
    r = await chamar("POST", "/auth/2fa/verificar", { token: r.corpo.tokenEtapa, corpo: { codigoRecuperacao: codigosAluno[1] } });
    checar("depois do desbloqueio o aluno entra com código de recuperação", r.status === 200);

    r = await chamar("GET", "/usuarios", { token: tokenAdmin });
    const listaSecretaria = (r.corpo as { id: string; mfaAtivo: boolean; rgm?: unknown; mfaSegredoCifrado?: unknown }[]).find((u) => u.id === secretaria.id);
    checar("admin lista usuários com a situação do 2FA, sem segredo nem RGM", r.status === 200 && listaSecretaria?.mfaAtivo === true && listaSecretaria.rgm === undefined && listaSecretaria.mfaSegredoCifrado === undefined);

    r = await chamar("DELETE", `/usuarios/${secretaria.id}/2fa`, { token: tokenAdmin });
    checar("admin reseta o 2FA da secretaria -> 204", r.status === 204);
    const secretariaResetada = await prisma.usuario.findUnique({ where: { id: secretaria.id } });
    const codigosSecretaria = await prisma.codigoRecuperacaoMfa.count({ where: { usuarioId: secretaria.id } });
    checar("reset apaga segredo e códigos de recuperação", secretariaResetada?.mfaAtivo === false && secretariaResetada.mfaSegredoCifrado === null && codigosSecretaria === 0);
    r = await chamar("GET", "/eventos", { token: tokenSecretaria });
    checar("reset encerra as sessões da secretaria -> 401", r.status === 401);
    const logReset = await prisma.logAuditoria.findFirst({ where: { acao: "MFA_RESETADO", usuarioId: admin.id, detalhe: { contains: secretaria.id } } });
    checar("auditoria MFA_RESETADO registra quem resetou (admin) e o alvo", !!logReset && logReset.atorNome === "Teste Dois Fatores ADMINISTRADOR");
    r = await login(secretaria);
    checar("secretaria resetada volta a entrar só com a senha", r.status === 200 && !!r.corpo.token && !r.corpo.mfa);

    // a equipe tambem desativa o proprio 2FA (senha + codigo), como o aluno
    r = await chamar("POST", "/auth/2fa/configuracao", { token: tokenAdmin });
    const segredoAdmin: string = r.corpo.segredo;
    await chamar("POST", "/auth/2fa/configuracao/confirmar", { token: tokenAdmin, corpo: { codigo: await totp(segredoAdmin) } });
    await avancarRelogio(admin);
    r = await chamar("POST", "/auth/2fa/desativar", { token: tokenAdmin, corpo: { senha: admin.senha, codigo: await totp(segredoAdmin) } });
    checar("administrador desativa o próprio 2FA -> 200 com sessão nova", r.status === 200 && !!r.corpo.token);
    const tokenAdminNovo: string = r.corpo.token;
    // reativa pra seguir com o teste do script de emergencia (que zera o 2FA do administrador)
    r = await chamar("POST", "/auth/2fa/configuracao", { token: tokenAdminNovo });
    await chamar("POST", "/auth/2fa/configuracao/confirmar", { token: tokenAdminNovo, corpo: { codigo: await totp(r.corpo.segredo) } });

    // ---------------------------------------------------------------- ALUNO desativa
    console.log("\n[ALUNO] desativação com senha + código");
    r = await chamar("POST", "/auth/2fa/desativar", { token: tokenAlunoAntigo, corpo: { senha: "senha-errada", codigo: await totp(segredoAluno) } });
    checar("desativar com senha errada -> 422", r.status === 422);
    await avancarRelogio(aluno);
    r = await chamar("POST", "/auth/2fa/desativar", { token: tokenAlunoAntigo, corpo: { senha: aluno.senha, codigo: await totp(segredoAluno) } });
    checar("desativar com senha + código certos -> 200 com sessão nova", r.status === 200 && !!r.corpo.token);
    const tokenAlunoNovo: string = r.corpo.token;
    r = await chamar("GET", "/usuarios/me", { token: tokenAlunoAntigo });
    checar("desativar encerra as outras sessões (token antigo -> 401)", r.status === 401);
    r = await chamar("GET", "/usuarios/me", { token: tokenAlunoNovo });
    checar("a sessão nova continua valendo e mostra mfaAtivo=false", r.status === 200 && r.corpo.mfaAtivo === false);
    checar("auditoria MFA_DESATIVADO", await temLog(aluno, "MFA_DESATIVADO"));
    r = await login(aluno);
    checar("depois de desativar, o aluno volta a entrar só com senha", r.status === 200 && !!r.corpo.token && !r.corpo.mfa);

    // ---------------------------------------------------------------- script de emergencia
    console.log("\n[SCRIPT] reset de emergência pela linha de comando (no banco de dev)");
    execSync(`npx tsx scripts/resetar-2fa.ts ${admin.email} --aplicar`, { stdio: "pipe" });
    const adminResetado = await prisma.usuario.findUnique({ where: { id: admin.id } });
    checar("script de emergência reseta o 2FA do administrador", adminResetado?.mfaAtivo === false && adminResetado.mfaSegredoCifrado === null);
    const logScript = await prisma.logAuditoria.findFirst({ where: { acao: "MFA_RESETADO", usuarioId: null, detalhe: { contains: admin.id } } });
    checar("script registra MFA_RESETADO na auditoria (origem: script de emergência)", !!logScript && (logScript.detalhe ?? "").includes("script de emergência"));

    // ---------------------------------------------------------------- nada sensivel no log
    const todosOsLogs = await prisma.logAuditoria.findMany({ where: { usuarioId: { in: contas.map((c) => c.id) } } });
    const sensiveis = [segredoAluno, segredoSecretaria, segredoAdmin, ...codigosAluno, ...codigosAluno.map((c) => c.replace("-", ""))];
    checar("nenhum segredo nem código aparece na auditoria", todosOsLogs.every((l) => !sensiveis.some((s) => (l.detalhe ?? "").includes(s))));
  } finally {
    for (const conta of contas) {
      await prisma.limiteAcesso.deleteMany({
        where: { chave: { in: [`login:conta:${indiceBusca(conta.email)}`, `recuperacao:conta:${indiceBusca(conta.email)}`, `mfa:conta:${conta.id}`] } },
      });
      await prisma.usuario.deleteMany({ where: { id: conta.id } });
      if (conta.participanteId) await prisma.participante.deleteMany({ where: { id: conta.participanteId } });
    }
    servidor.close();
    await prisma.$disconnect();
  }

  const falhas = resultados.filter((r) => !r.ok);
  console.log(`\n[testar-2fa] ${resultados.length - falhas.length}/${resultados.length} verificações passaram`);
  if (falhas.length > 0) process.exitCode = 1;
}

main().catch((erro) => {
  console.error("[testar-2fa] erro:", erro);
  process.exitCode = 1;
});
