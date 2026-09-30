// teste de interface com navegador de verdade (Google Chrome instalado na maquina, sem janela) contra
// o frontend local (5173) ligado ao backend local (8080), que usa o banco SGEA_dev.
//
// como rodar:
//   1. backend/:  npx tsx src/main.ts                               (backend na 8080, .env -> SGEA_dev)
//   2. frontend/: npx vite --port 5173                              (frontend na 5173)
//   3. backend/:  npx tsx scripts/dados-teste-interface.ts preparar  (contas de teste)
//   4. aqui:      npm install && npm run testar
//   5. backend/:  npx tsx scripts/dados-teste-interface.ts limpar
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const APP = "http://localhost:5173/#";
const API = "http://localhost:8080/api";
const { sufixo, contas } = JSON.parse(readFileSync(fileURLToPath(new URL("./dados-ui.json", import.meta.url)), "utf8"));
// nome de pessoa so aceita letras: o sufixo da rodada vira letras pra deixar os nomes unicos
const tag = sufixo.replace(/\d/g, (d) => "ghijklmnop"[Number(d)]);
const NOME_ALUNA = `Aluna Interface ${tag}`;
const NOME_INATIVO = `Aluno Inativado ${tag}`;
const resultados = [];
let secao = "";

function titulo(t) {
  secao = t;
  console.log(`\n[${t}]`);
}
function checar(nome, ok, detalhe) {
  resultados.push({ secao, nome, ok });
  console.log(`  ${ok ? "OK    " : "FALHOU"} ${nome}${!ok && detalhe !== undefined ? `  -> ${String(detalhe).slice(0, 200)}` : ""}`);
}

async function api(metodo, caminho, token, corpo) {
  const res = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await res.text();
  return { status: res.status, corpo: texto ? JSON.parse(texto) : undefined };
}
async function tokenDe(email, senha) {
  const r = await api("POST", "/auth/login", undefined, { emailLogin: email, senha });
  if (!r.corpo?.token) throw new Error(`login API falhou: ${JSON.stringify(r.corpo)}`);
  return r.corpo.token;
}
function questionario() {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `p${i + 1}`,
    enunciado: `Pergunta ${i + 1}`,
    alternativas: Array.from({ length: 4 }, (_, j) => ({ texto: `Alternativa ${j + 1}`, correta: j === 0 })),
  }));
}

// helpers de tela
const idAtivo = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute("name") || "");
const invalido = async (page, seletor) => (await page.locator(seletor).first().getAttribute("aria-invalid")) === "true";
const temTexto = async (page, texto) => (await page.getByText(texto, { exact: false }).count()) > 0;
async function entrar(page, email, senha) {
  await page.goto(`${APP}/login`);
  await page.fill("#emailLogin", email);
  await page.fill("#senha", senha);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => !location.hash.startsWith("#/login"), null, { timeout: 15000 });
}
async function sair(page) {
  await page.click("button:has-text('Sair')");
  await page.waitForFunction(() => location.hash.startsWith("#/login"));
}
async function esperarToast(page, texto) {
  try {
    await page.locator(".toast", { hasText: texto }).first().waitFor({ timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

const navegador = await chromium.launch({ channel: "chrome", headless: true });
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
const page = await contexto.newPage();
const errosDoNavegador = [];
page.on("pageerror", (e) => errosDoNavegador.push(e.message));

try {
  const secretaria = contas.SECRETARIA;
  const admin = contas.ADMINISTRADOR;
  const tokenSecretaria = await tokenDe(secretaria.email, secretaria.senha);

  // ---------------------------------------------------------------- E: login
  titulo("E / Login: campos obrigatórios");
  await page.goto(`${APP}/login`);
  checar("rótulos com * nos campos obrigatórios", (await page.locator("label[for=emailLogin] .campo-obrigatorio").count()) === 1 && (await page.locator("label[for=senha] .campo-obrigatorio").count()) === 1);
  checar("legenda explicando o *", await temTexto(page, "são obrigatórios"));
  await page.click("button[type=submit]");
  checar("enviar vazio marca e-mail e senha como inválidos (borda vermelha)", (await invalido(page, "#emailLogin")) && (await invalido(page, "#senha")));
  checar("mensagem embaixo de cada campo", (await temTexto(page, "Informe o e-mail.")) && (await temTexto(page, "Informe a senha.")));
  checar("foco vai pro primeiro campo inválido", (await idAtivo(page)) === "emailLogin", await idAtivo(page));
  await page.fill("#emailLogin", "alguem@teste.invalido");
  checar("ao corrigir o campo, o aviso dele some", !(await invalido(page, "#emailLogin")) && (await invalido(page, "#senha")));

  // ---------------------------------------------------------------- F: equipe entra sem 2FA
  titulo("F / Equipe entra só com a senha (2FA opcional)");
  await entrar(page, secretaria.email, secretaria.senha);
  checar("secretaria sem 2FA entra direto (sem tela de QR code)", (await page.evaluate(() => location.hash)) === "#/" && !(await temTexto(page, "Configurar autenticação")));
  await page.locator(".stat-card").first().waitFor();
  checar("Dashboard da equipe carrega os indicadores", (await page.locator(".stat-card").count()) >= 4 && (await temTexto(page, "Eventos cadastrados")));
  await page.goto(`${APP}/minha-conta`);
  await page.locator("h2", { hasText: "Autenticação em dois fatores" }).waitFor();
  checar("Minha conta da secretaria oferece ativar o 2FA (opcional)", (await page.locator("button", { hasText: "Ativar" }).count()) === 1 && (await temTexto(page, "Opcional")));

  // ---------------------------------------------------------------- E: salas
  titulo("E / Salas");
  await page.goto(`${APP}/salas`);
  await page.click("button:has-text('+ Nova sala')");
  await page.click(".modal button[type=submit]");
  checar("enviar vazio: nome e capacidade inválidos", (await invalido(page, "#nome")) && (await invalido(page, "#capacidade")));
  checar("mensagens do que falta", (await temTexto(page, "Informe o nome da sala.")) && (await temTexto(page, "Informe a capacidade.")));
  checar("foco no primeiro campo inválido", (await idAtivo(page)) === "nome", await idAtivo(page));
  await page.fill("#nome", `Sala UI ${sufixo}`);
  await page.fill("#capacidade", "0");
  await page.click(".modal button[type=submit]");
  checar("capacidade zero é recusada com mensagem", await temTexto(page, "maior que zero"));
  await page.fill("#capacidade", "40");
  await page.click(".modal button[type=submit]");
  checar("sala válida é salva", await esperarToast(page, "Sala cadastrada."));

  // ---------------------------------------------------------------- E: palestrantes + erro do backend no campo
  titulo("E / Palestrantes (erro do backend embaixo do campo certo)");
  await page.goto(`${APP}/palestrantes`);
  await page.click("button:has-text('+ Novo palestrante')");
  await page.click(".modal button[type=submit]");
  checar("enviar vazio: nome e e-mail inválidos", (await invalido(page, "#nome")) && (await invalido(page, "#email")));
  await page.fill("#nome", "Palestrante Interface");
  await page.fill("#email", `pal-${sufixo}@teste.invalido`);
  await page.click(".modal button[type=submit]");
  checar("palestrante válido é salvo", await esperarToast(page, "Palestrante cadastrado."));
  await page.click("button:has-text('+ Novo palestrante')");
  await page.fill("#nome", "Outro Palestrante");
  await page.fill("#email", `pal-${sufixo}@teste.invalido`);
  await page.click(".modal button[type=submit]");
  await page.locator("#email[aria-invalid=true]").waitFor({ timeout: 8000 }).catch(() => {});
  checar("e-mail duplicado (409 do backend) aparece embaixo do campo e-mail", (await invalido(page, "#email")) && (await temTexto(page, "Já existe um palestrante com este e-mail.")));
  await page.click(".modal button:has-text('Cancelar')");

  // ---------------------------------------------------------------- E: eventos
  titulo("E / Eventos (questionário com erro por pergunta)");
  await page.goto(`${APP}/eventos`);
  await page.click("button:has-text('+ Novo evento')");
  await page.click(".modal button[type=submit]");
  checar(
    "enviar vazio: título, sala, data, palestrante, tema e carga horária inválidos",
    (await invalido(page, "#titulo")) && (await invalido(page, "#salaId")) && (await invalido(page, "#horario")) && (await invalido(page, "#palestranteId")) && (await invalido(page, "#tema")) && (await invalido(page, "#cargaHoraria")),
  );
  checar("foco no título", (await idAtivo(page)) === "titulo", await idAtivo(page));
  checar("cada pergunta do questionário mostra o que falta", (await page.locator(".questionario-pergunta.grupo-invalido").count()) === 10 && (await temTexto(page, "Escreva o enunciado da pergunta 1.")) && (await temTexto(page, "Marque qual alternativa é a correta.")));
  await page.click(".modal button:has-text('Cancelar')");

  // dados do fluxo do aluno: sala, palestrante e evento criados pela API
  const sala = await api("POST", "/salas", tokenSecretaria, { nome: `Auditorio UI ${sufixo}`, capacidade: 40 });
  const palestrante = await api("POST", "/palestrantes", tokenSecretaria, { nome: "Palestrante Fluxo", email: `fluxo-${sufixo}@teste.invalido` });
  const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const evento = await api("POST", "/eventos", tokenSecretaria, {
    titulo: `Evento UI ${sufixo}`, horario: amanha, salaId: sala.corpo.id, palestranteId: palestrante.corpo.id, tema: "Tema UI", cargaHoraria: 2, questionario: questionario(),
  });
  const eventoId = evento.corpo.id;
  await sair(page);

  // ---------------------------------------------------------------- E: cadastro
  titulo("E / Cadastro de aluno");
  await page.goto(`${APP}/cadastro`);
  await page.click("button[type=submit]");
  checar(
    "enviar vazio: todos os campos obrigatórios marcados",
    (await invalido(page, "#nomeCompleto")) && (await invalido(page, "#rgm")) && (await invalido(page, "#emailInstitucional")) && (await invalido(page, "#senha")) && (await invalido(page, "#confirmarSenha")) && (await invalido(page, "input[name=aceiteLgpd]")),
  );
  checar("foco no nome", (await idAtivo(page)) === "nomeCompleto", await idAtivo(page));
  checar("texto do aceite não chama de consentimento", await temTexto(page, "estou ciente da"));
  const emailAluno = `ui.aluno.${sufixo}@alunos.umc.br`;
  const rgmAluno = `8${String(Date.now()).slice(-10)}`;
  await page.fill("#nomeCompleto", NOME_ALUNA);
  await page.fill("#rgm", rgmAluno);
  await page.fill("#emailInstitucional", emailAluno);
  await page.fill("#senha", "SenhaAluna123");
  await page.fill("#confirmarSenha", "SenhaAluna123");
  await page.check("input[name=aceiteLgpd]");
  await page.click("button[type=submit]");
  await page.waitForFunction(() => location.hash.startsWith("#/eventos"), null, { timeout: 15000 });
  checar("cadastro válido entra direto na tela de eventos", (await page.evaluate(() => location.hash)).startsWith("#/eventos"));
  await sair(page);
  await page.goto(`${APP}/cadastro`);
  await page.fill("#nomeCompleto", "Outra Pessoa");
  await page.fill("#rgm", `7${String(Date.now()).slice(-10)}`);
  await page.fill("#emailInstitucional", emailAluno);
  await page.fill("#senha", "SenhaAluna123");
  await page.fill("#confirmarSenha", "SenhaAluna123");
  await page.check("input[name=aceiteLgpd]");
  await page.click("button[type=submit]");
  await page.locator("#emailInstitucional[aria-invalid=true]").waitFor({ timeout: 8000 }).catch(() => {});
  checar("e-mail já cadastrado (409) aparece embaixo do campo e-mail", (await invalido(page, "#emailInstitucional")) && (await temTexto(page, "Já existe uma conta com este e-mail.")));

  // segundo aluno (vai ser inativado) e inscricoes pra contagem da agenda
  const emailAluno2 = `ui.aluno2.${sufixo}@alunos.umc.br`;
  const cadastro2 = await api("POST", "/auth/registro", undefined, { nomeCompleto: NOME_INATIVO, rgm: `6${String(Date.now()).slice(-10)}`, emailInstitucional: emailAluno2, senha: "SenhaAluno123", aceiteLgpd: true });
  await api("POST", "/inscricoes", tokenSecretaria, { participanteId: cadastro2.corpo.participanteId, eventoId });

  // ---------------------------------------------------------------- aluno: agenda, questionario, certificado, feedback
  titulo("A / Agenda e certificados do aluno");
  await entrar(page, emailAluno, "SenhaAluna123");
  await page.goto(`${APP}/eventos`);
  await page.locator(".agenda-item", { hasText: `Evento UI ${sufixo}` }).locator("button:has-text('Inscrever-se')").click();
  checar("aluno se inscreve pela tela", await esperarToast(page, "Inscrição confirmada"));
  await page.goto(`${APP}/agenda`);
  const linhaAgenda = page.locator("li, tr", { hasText: `Evento UI ${sufixo}` }).first();
  await linhaAgenda.waitFor();
  checar("Agenda do aluno mostra o total de inscritos do evento (2), não só a própria inscrição", (await linhaAgenda.innerText()).includes("2/40"), await linhaAgenda.innerText());
  await sair(page);

  titulo("Check-in pela tela da secretaria");
  await entrar(page, secretaria.email, secretaria.senha);
  await page.goto(`${APP}/checkin`);
  await page.fill("input.search-input", NOME_ALUNA);
  await page.locator(".simple-list-item", { hasText: NOME_ALUNA }).click();
  const linhaCheckin = page.locator("tr", { hasText: `Evento UI ${sufixo}` });
  await linhaCheckin.waitFor();
  await linhaCheckin.locator("button:has-text('Confirmar presença')").click();
  await linhaCheckin.locator(".badge", { hasText: "Presente" }).waitFor({ timeout: 8000 }).catch(() => {});
  checar("confirmar presença pela tela marca a inscrição como Presente", (await linhaCheckin.locator(".badge", { hasText: "Presente" }).count()) === 1);
  await sair(page);
  await entrar(page, emailAluno, "SenhaAluna123");

  titulo("E / Questionário: pergunta sem resposta");
  await page.goto(`${APP}/eventos/${eventoId}/questionario`);
  await page.locator("button:has-text('Enviar respostas')").waitFor();
  await page.click("button:has-text('Enviar respostas')");
  checar("as 10 perguntas sem resposta ficam destacadas", (await page.locator(".questionario-resposta.grupo-invalido").count()) === 10);
  checar("mensagem em cada pergunta", (await page.getByText("Escolha uma alternativa.").count()) === 10);
  checar("foco vai pra primeira pergunta", (await page.evaluate(() => document.activeElement?.getAttribute("type"))) === "radio");
  const grupos = page.locator(".questionario-resposta");
  for (let i = 0; i < 10; i++) await grupos.nth(i).locator("input[type=radio]").first().check();
  checar("ao responder, o destaque some", (await page.locator(".questionario-resposta.grupo-invalido").count()) === 0);
  await page.click("button:has-text('Enviar respostas')");
  await page.locator(".questionario-resultado-percentual").waitFor();
  checar("resultado 100% corrigido no servidor", (await page.locator(".questionario-resultado-percentual").innerText()).includes("100"));

  await page.goto(`${APP}/certificados`);
  const itemCertificado = page.locator(".simple-list-item", { hasText: `Evento UI ${sufixo}` });
  await itemCertificado.waitFor({ timeout: 10000 }).catch(() => {});
  checar("aluno vê o certificado na tela (antes quebrava: rota da equipe dava 403)", (await itemCertificado.count()) === 1);
  checar("botão Emitir certificado liberado", (await itemCertificado.locator("button:has-text('Emitir certificado')").isEnabled().catch(() => false)) === true);
  const [arquivo] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    itemCertificado.locator("button:has-text('Emitir certificado')").click(),
  ]);
  checar("certificado baixado em PDF (gerado no navegador)", arquivo.suggestedFilename().endsWith(".pdf"), arquivo.suggestedFilename());

  titulo("D / Feedback do aluno (sem edição, exclui e envia de novo)");
  await page.goto(`${APP}/feedback`);
  await page.click("button:has-text('+ Novo feedback')");
  await page.click(".modal button[type=submit]");
  checar("enviar vazio: nota e comentário marcados", (await invalido(page, "#nota")) && (await invalido(page, "#comentario")));
  await page.selectOption("#nota", "5");
  await page.fill("#comentario", "Muito boa a palestra");
  await page.click(".modal button[type=submit]");
  checar("feedback enviado", await esperarToast(page, "Feedback enviado."));
  const linhaFeedback = page.locator("tr", { hasText: "Muito boa a palestra" });
  await linhaFeedback.waitFor();
  checar("linha do feedback tem Excluir e não tem Editar", (await linhaFeedback.locator("button:has-text('Excluir')").count()) === 1 && (await linhaFeedback.locator("button:has-text('Editar')").count()) === 0);
  await linhaFeedback.locator("button:has-text('Excluir')").click();
  checar("excluir pede confirmação", await temTexto(page, "Excluir meu feedback"));
  await page.click(".modal button:has-text('Excluir')");
  checar("feedback excluído", await esperarToast(page, "Feedback excluído."));
  await page.click("button:has-text('+ Novo feedback')");
  await page.selectOption("#nota", "4");
  await page.fill("#comentario", "Avaliação corrigida pela tela");
  await page.click(".modal button[type=submit]");
  checar("depois de excluir, envia um novo pro mesmo evento", await esperarToast(page, "Feedback enviado."));

  titulo("E / 2FA na Minha conta do aluno");
  await page.goto(`${APP}/minha-conta`);
  await page.click("button:has-text('Ativar')");
  await page.locator("img[alt*='QR code']").waitFor();
  checar("QR code gerado aparece na tela", (await page.locator("img[alt*='QR code']").getAttribute("src"))?.startsWith("data:image/png"));
  await page.click("button:has-text('Confirmar e ativar')");
  checar("confirmar sem o código: campo marcado com mensagem", (await invalido(page, "#codigo")) && (await temTexto(page, "Digite os 6 dígitos")));
  await page.click("button:has-text('Cancelar')");
  await sair(page);

  // ---------------------------------------------------------------- C: inativacao
  titulo("C / Inativação");
  // evento que ja aconteceu: a inscricao do aluno nele tem que sobreviver a inativacao
  const ontem = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const eventoPassado = await api("POST", "/eventos", tokenSecretaria, {
    titulo: `Evento Passado UI ${sufixo}`, horario: ontem, salaId: sala.corpo.id, palestranteId: palestrante.corpo.id, tema: "Tema", cargaHoraria: 1, questionario: questionario(),
  });
  await api("POST", "/inscricoes", tokenSecretaria, { participanteId: cadastro2.corpo.participanteId, eventoId: eventoPassado.corpo.id });
  await api("PUT", `/participantes/${cadastro2.corpo.participanteId}`, tokenSecretaria, { ativo: false, motivoInativacao: "Motivo interno da equipe" });
  await page.goto(`${APP}/login`);
  await page.fill("#emailLogin", emailAluno2);
  await page.fill("#senha", "SenhaAluno123");
  await page.click("button[type=submit]");
  await page.getByText("Sua conta está inativa. Procure a secretaria.").waitFor({ timeout: 8000 }).catch(() => {});
  checar("aluno inativo vê a mensagem padrão no login", await temTexto(page, "Sua conta está inativa. Procure a secretaria."));
  checar("o motivo interno não aparece pro aluno", !(await temTexto(page, "Motivo interno da equipe")));

  await entrar(page, secretaria.email, secretaria.senha);
  await page.goto(`${APP}/participantes`);
  const linhaInativo = page.locator("tr", { hasText: NOME_INATIVO });
  await linhaInativo.waitFor();
  checar("Participantes mostra o badge Inativo", (await linhaInativo.locator(".badge", { hasText: "Inativo" }).count()) === 1);
  const linhaAtiva = page.locator("tr", { hasText: NOME_ALUNA });
  await linhaAtiva.locator("button:has-text('Inativar')").click();
  await page.click(".modal button[type=submit]");
  checar("inativar sem motivo: campo marcado e focado", (await invalido(page, "#motivoInativacao")) && (await idAtivo(page)) === "motivoInativacao");
  await page.click(".modal button:has-text('Cancelar')");

  titulo("E + C / Inscrição manual");
  await page.goto(`${APP}/inscricoes`);
  const linhaPassada = page.locator("tr", { hasText: NOME_INATIVO }).filter({ hasText: `Evento Passado UI ${sufixo}` });
  await linhaPassada.waitFor({ timeout: 8000 }).catch(() => {});
  checar("inscrição em evento que já aconteceu continua e mostra o badge Inativo", (await linhaPassada.locator(".badge", { hasText: "Inativo" }).count()) === 1);
  checar(
    "inscrição pendente em evento futuro foi cancelada na inativação",
    (await page.locator("tr", { hasText: NOME_INATIVO }).filter({ hasText: `Evento UI ${sufixo}` }).count()) === 0,
  );
  await page.click("button:has-text('+ Nova inscrição')");
  await page.click(".modal button[type=submit]");
  checar("enviar vazio: aluno e evento marcados", (await invalido(page, "#participanteId")) && (await invalido(page, "#eventoId")));
  await page.fill("#participanteId", "Aluno Inativado");
  await page.locator(".modal .simple-list-item", { hasText: NOME_INATIVO }).click();
  await page.selectOption("#eventoId", eventoId);
  await page.click(".modal button[type=submit]");
  checar("aluno inativo não é inscrito (aviso no campo do aluno)", (await invalido(page, "#participanteId")) && (await temTexto(page, "Aluno inativo")));
  await page.click(".modal button:has-text('Cancelar')");

  titulo("D / Feedback pela equipe");
  await page.goto(`${APP}/feedback`);
  await page.locator("tr", { hasText: "Avaliação corrigida pela tela" }).waitFor();
  checar("equipe não tem botão de novo feedback", (await page.locator("button:has-text('+ Novo feedback')").count()) === 0);
  await page.locator("tr", { hasText: "Avaliação corrigida pela tela" }).locator("button:has-text('Excluir')").click();
  await page.click(".modal button[type=submit]");
  checar("excluir sem motivo: campo marcado e focado", (await invalido(page, "#motivo")) && (await idAtivo(page)) === "motivo" && (await temTexto(page, "Selecione o motivo da exclusão.")));
  await page.selectOption("#motivo", "CONTEUDO_OFENSIVO");
  await page.click(".modal button[type=submit]");
  checar("equipe exclui com motivo", await esperarToast(page, "Feedback excluído."));
  await sair(page);

  titulo("C / Tela Usuários (administrador)");
  await entrar(page, admin.email, admin.senha);
  await page.goto(`${APP}/usuarios`);
  const linhaUsuario = page.locator("tr", { hasText: NOME_INATIVO });
  await linhaUsuario.waitFor();
  checar("Usuários mostra o badge Inativo", (await linhaUsuario.locator(".badge", { hasText: "Inativo" }).count()) === 1);

  titulo("Auditoria: filtro pelas ações novas");
  await page.goto(`${APP}/auditoria`);
  await page.locator(".card select").first().selectOption("FEEDBACK_EXCLUIDO");
  const linhaLog = page.locator("tr", { hasText: "motivo: conteúdo ofensivo" }).first();
  await linhaLog.waitFor({ timeout: 10000 }).catch(() => {});
  checar(
    "filtro por \"Feedback excluído\" mostra a exclusão feita pela equipe, com o motivo e o responsável",
    (await linhaLog.count()) === 1 && (await linhaLog.innerText()).includes("Equipe UI Secretaria") && (await linhaLog.innerText()).includes("Feedback excluído"),
  );
  await sair(page);

  titulo("E / Esqueci a senha");
  await page.goto(`${APP}/esqueci-senha`);
  await page.click("button[type=submit]");
  checar("enviar vazio: e-mail marcado com mensagem", (await invalido(page, "#email")) && (await temTexto(page, "Informe o e-mail cadastrado.")));
  await page.fill("#email", emailAluno);
  await page.click("button[type=submit]");
  await page.locator("#codigo").waitFor();
  await page.click("button[type=submit]");
  checar("etapa 2 vazia: código, nova senha e confirmação marcados", (await invalido(page, "#codigo")) && (await invalido(page, "#novaSenha")) && (await invalido(page, "#confirmarSenha")));

  titulo("Console do navegador");
  checar("nenhum erro de JavaScript nas telas", errosDoNavegador.length === 0, errosDoNavegador.join(" | "));
} catch (erro) {
  checar("execução sem exceção", false, erro?.stack ?? erro);
} finally {
  await navegador.close();
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n[testar-interface] ${resultados.length - falhas.length}/${resultados.length} verificações passaram`);
if (falhas.length) {
  falhas.forEach((f) => console.log(`  - ${f.secao}: ${f.nome}`));
  process.exitCode = 1;
}
