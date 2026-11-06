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
// senhas que seguem a regra de senha nova (8 a 64, maiuscula, numero e caractere especial)
const SENHA_ALUNA = "Senha@Aluna123";
const SENHA_ALUNO2 = "Senha@Aluno123";
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
// "Sair" pede confirmacao: clica no botao do topo e depois no "Sair" da janela de confirmacao
async function sair(page) {
  await page.click(".topbar button:has-text('Sair')");
  await page.locator(".modal button:has-text('Sair')").click();
  await page.waitForFunction(() => location.hash.startsWith("#/login"));
}
// codigo de demonstracao mostrado na tela fora de producao ("Modo demonstração — código: 123456")
async function codigoDemoDaTela(page) {
  const texto = await page.getByText("Modo demonstração — código:").first().innerText();
  return /\d{6}/.exec(texto)?.[0] ?? "";
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
  checar("a tela de login não tem mais o link \"Validar certificado\" (a validação fica em Certificados)", !(await temTexto(page, "Validar certificado")));
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
  checar(
    "Dashboard da equipe carrega os 8 indicadores e os gráficos de presença e de aprendizagem",
    (await page.locator(".stat-card").count()) === 8 &&
      (await temTexto(page, "Ocupação média das salas")) &&
      (await temTexto(page, "Certificados liberados")) &&
      (await temTexto(page, "Aprovação no questionário")) &&
      (await temTexto(page, "Média do feedback")) &&
      (await temTexto(page, "Presença por evento")) &&
      (await temTexto(page, "Aprendizagem por evento")),
  );
  checar(
    "menu chama a tela de \"Dashboard\" (não mais \"Principal\") e não tem mais \"Usuários\"",
    (await page.locator("a.nav-link", { hasText: "Dashboard" }).count()) === 1 &&
      (await page.locator("a.nav-link", { hasText: "Principal" }).count()) === 0 &&
      (await page.locator("a.nav-link", { hasText: "Usuários" }).count()) === 0,
  );
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
  // comeca daqui a 30 min: ainda aceita inscricao e o check-in ja abriu (abre 1h antes do inicio)
  const emBreve = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const evento = await api("POST", "/eventos", tokenSecretaria, {
    titulo: `Evento UI ${sufixo}`, horario: emBreve, salaId: sala.corpo.id, palestranteId: palestrante.corpo.id, tema: "Tema UI", cargaHoraria: 2, questionario: questionario(),
  });
  const eventoId = evento.corpo.id;

  titulo("Sair pede confirmação");
  await page.click(".topbar button:has-text('Sair')");
  checar(
    "clicar em Sair abre \"Sair do sistema?\" com o aviso de que vai precisar entrar de novo",
    (await page.locator(".modal", { hasText: "Sair do sistema?" }).count()) === 1 &&
      (await temTexto(page, "Você vai precisar entrar de novo com seu e-mail e senha.")),
  );
  await page.locator(".modal button:has-text('Cancelar')").click();
  checar(
    "Cancelar fecha a confirmação e continua no sistema",
    (await page.locator(".modal").count()) === 0 && !(await page.evaluate(() => location.hash)).startsWith("#/login"),
  );
  await sair(page);
  checar("confirmar o Sair volta para o login", (await page.evaluate(() => location.hash)).startsWith("#/login"));

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

  titulo("E / Regras da senha com checklist");
  const requisitosOk = () => page.locator(".requisitos-senha li.requisito-ok").count();
  checar(
    "embaixo da senha aparece a lista com os 4 requisitos, todos pendentes (• cinza)",
    (await page.locator(".requisitos-senha li").count()) === 4 && (await page.locator(".requisitos-senha li.requisito-pendente").count()) === 4,
  );
  checar("a lista fica num aria-live pro leitor de tela", (await page.locator(".requisitos-senha ul[aria-live=polite]").count()) === 1);
  await page.fill("#senha", "senha1");
  checar(
    "a cada tecla: só \"Um número\" fica ✓ com \"senha1\"",
    (await requisitosOk()) === 1 && (await page.locator(".requisitos-senha li.requisito-ok", { hasText: "Um número" }).count()) === 1,
  );
  checar("o item cumprido mostra o ícone ✓ (não só a cor)", (await page.locator(".requisitos-senha li.requisito-ok .requisito-icone").innerText()) === "✓");
  await page.fill("#senha", `Aa1!${"x".repeat(61)}`);
  checar("passando de 64 caracteres aparece o aviso embaixo do campo", await temTexto(page, "A senha pode ter no máximo 64 caracteres."));

  const emailAluno = `ui.aluno.${sufixo}@alunos.umc.br`;
  const rgmAluno = `8${String(Date.now()).slice(-10)}`;
  await page.fill("#nomeCompleto", NOME_ALUNA);
  await page.fill("#rgm", rgmAluno);
  await page.fill("#emailInstitucional", emailAluno);
  await page.fill("#senha", "SenhaAluna123");
  await page.fill("#confirmarSenha", "SenhaAluna123");
  await page.check("input[name=aceiteLgpd]");
  await page.click("button[type=submit]");
  checar(
    "enviar com requisito faltando (sem caractere especial): erro embaixo do campo senha, sem sair da etapa",
    (await invalido(page, "#senha")) && (await temTexto(page, "A senha deve ter de 8 a 64 caracteres")) && (await page.locator("#codigo").count()) === 0,
  );
  await page.fill("#senha", SENHA_ALUNA);
  await page.fill("#confirmarSenha", SENHA_ALUNA);
  checar("senha que cumpre a regra: os 4 itens com ✓", (await requisitosOk()) === 4);

  titulo("E / Cadastro: confirmação do e-mail por código");
  await page.click("button[type=submit]");
  await page.locator("#codigo").waitFor({ timeout: 15000 });
  checar(
    "Criar conta passa para a etapa do código, com o e-mail, a validade e o aviso de spam",
    await temTexto(page, `Enviamos um código de 6 dígitos para ${emailAluno}`) &&
      (await temTexto(page, "O código vale por 15 minutos")) &&
      (await temTexto(page, "caixa de spam")),
  );
  checar("avisa que sair da página não conclui o cadastro", await temTexto(page, "Se você sair desta página, o cadastro não é concluído"));
  checar(
    "campo do código só com números (inputmode numeric, autocomplete one-time-code)",
    (await page.getAttribute("#codigo", "inputmode")) === "numeric" && (await page.getAttribute("#codigo", "autocomplete")) === "one-time-code",
  );
  await page.fill("#codigo", "12ab34");
  checar("letras digitadas no código são descartadas", (await page.inputValue("#codigo")) === "1234");
  checar(
    "\"Reenviar código\" começa desabilitado, com a contagem regressiva",
    await page.locator("button", { hasText: /Reenviar código \(\d+s\)/ }).isDisabled(),
  );
  const codigoDaTela = await codigoDemoDaTela(page);
  checar("fora de produção mostra o código de demonstração", /^\d{6}$/.test(codigoDaTela), codigoDaTela);
  await page.fill("#codigo", codigoDaTela === "000000" ? "111111" : "000000");
  await page.click("button[type=submit]");
  await page.locator("#codigo[aria-invalid=true]").waitFor({ timeout: 8000 }).catch(() => {});
  checar("código errado: \"Código inválido.\" embaixo do campo do código", (await invalido(page, "#codigo")) && (await temTexto(page, "Código inválido.")));
  await page.click("button:has-text('Corrigir meus dados')");
  checar(
    "\"Corrigir meus dados\" volta ao formulário sem apagar o que foi digitado",
    (await page.inputValue("#nomeCompleto")) === NOME_ALUNA &&
      (await page.inputValue("#emailInstitucional")) === emailAluno &&
      (await page.inputValue("#senha")) === SENHA_ALUNA &&
      (await page.isChecked("input[name=aceiteLgpd]")),
  );
  await page.click("button[type=submit]");
  await page.locator("#codigo").waitFor({ timeout: 15000 });
  const codigoNovo = await codigoDemoDaTela(page);
  await page.fill("#codigo", codigoNovo);
  await page.click("button:has-text('Confirmar e criar conta')");
  await page.waitForFunction(() => location.hash.startsWith("#/eventos"), null, { timeout: 15000 });
  checar("código certo cria a conta e entra direto na tela de eventos", (await page.evaluate(() => location.hash)).startsWith("#/eventos"));
  await sair(page);
  await page.goto(`${APP}/cadastro`);
  await page.fill("#nomeCompleto", "Outra Pessoa");
  await page.fill("#rgm", `7${String(Date.now()).slice(-10)}`);
  await page.fill("#emailInstitucional", emailAluno);
  await page.fill("#senha", SENHA_ALUNA);
  await page.fill("#confirmarSenha", SENHA_ALUNA);
  await page.check("input[name=aceiteLgpd]");
  await page.click("button[type=submit]");
  await page.locator("#emailInstitucional[aria-invalid=true]").waitFor({ timeout: 8000 }).catch(() => {});
  checar("e-mail já cadastrado (409) aparece embaixo do campo e-mail", (await invalido(page, "#emailInstitucional")) && (await temTexto(page, "Já existe uma conta com este e-mail.")));

  // segundo aluno (vai ser inativado) e inscricoes pra contagem da agenda
  const emailAluno2 = `ui.aluno2.${sufixo}@alunos.umc.br`;
  // cadastro pela API em 2 passos: os dados (devolve o codigoDemo fora de producao) e a confirmacao
  const inicio2 = await api("POST", "/auth/registro", undefined, { nomeCompleto: NOME_INATIVO, rgm: `6${String(Date.now()).slice(-10)}`, emailInstitucional: emailAluno2, senha: SENHA_ALUNO2, aceiteLgpd: true });
  const cadastro2 = await api("POST", "/auth/registro/confirmar", undefined, { emailInstitucional: emailAluno2, codigo: inicio2.corpo?.codigoDemo });
  if (cadastro2.status !== 201) throw new Error(`cadastro do segundo aluno falhou: ${JSON.stringify(cadastro2.corpo)}`);
  await api("POST", "/inscricoes", tokenSecretaria, { participanteId: cadastro2.corpo.participanteId, eventoId });

  // ---------------------------------------------------------------- aluno: agenda, questionario, certificado, feedback
  titulo("A / Agenda e certificados do aluno");
  // evento de 4 dias atras (sem cruzar com o "Evento Passado UI" de ontem na mesma sala): o aluno nao se inscreve
  const quatroDiasAtras = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();
  await api("POST", "/eventos", tokenSecretaria, {
    titulo: `Evento Encerrado UI ${sufixo}`, horario: quatroDiasAtras, salaId: sala.corpo.id, palestranteId: palestrante.corpo.id, tema: "Tema", cargaHoraria: 1, questionario: questionario(),
  });
  await entrar(page, emailAluno, SENHA_ALUNA);
  await page.goto(`${APP}/eventos`);
  await page.locator(".agenda-item", { hasText: `Evento UI ${sufixo}` }).locator("button:has-text('Inscrever-se')").click();
  checar("aluno se inscreve pela tela", await esperarToast(page, "Inscrição confirmada"));
  checar(
    "o e-mail de confirmação sai junto com a inscrição (o aviso cita o e-mail do aluno)",
    await temTexto(page, `E-mail de confirmação enviado para ${emailAluno}`),
  );
  const itemEncerrado = page.locator(".agenda-item", { hasText: `Evento Encerrado UI ${sufixo}` });
  checar("eventos que já aconteceram ficam escondidos por padrão", (await itemEncerrado.count()) === 0);
  await page.check("#mostrarEncerrados");
  const botaoEncerrado = itemEncerrado.locator("button.btn-primary");
  await botaoEncerrado.waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "com \"mostrar encerrados\", o evento que já começou aparece como Encerrado, desabilitado (sem opção de se inscrever)",
    (await botaoEncerrado.count()) === 1 && (await botaoEncerrado.innerText()) === "Encerrado" && (await botaoEncerrado.isDisabled()),
  );
  checar("menu do aluno não tem mais a Agenda (unida à tela Eventos)", (await page.locator("a.nav-link", { hasText: "Agenda" }).count()) === 0);
  await page.goto(`${APP}/agenda`);
  await page.waitForFunction(() => location.hash.startsWith("#/eventos"), null, { timeout: 8000 }).catch(() => {});
  checar("o link antigo da Agenda leva para Eventos", (await page.evaluate(() => location.hash)).startsWith("#/eventos"));
  const linhaEvento = page.locator(".agenda-item", { hasText: `Evento UI ${sufixo}` }).first();
  await linhaEvento.waitFor();
  checar("Eventos do aluno mostra as vagas do evento (2/40), não só a própria inscrição", (await linhaEvento.innerText()).includes("2/40"), await linhaEvento.innerText());
  await page.fill("input[placeholder='Título, tema ou palestrante']", "Palestrante Fluxo");
  checar(
    "busca da tela Eventos filtra por palestrante",
    (await page.locator(".agenda-item", { hasText: `Evento UI ${sufixo}` }).count()) === 1 &&
      (await page.locator(".agenda-item").filter({ hasNotText: "Palestrante Fluxo" }).count()) === 0,
  );
  await page.goto(`${APP}/palestrantes`);
  const cardPalestrante = page.locator(".palestrante-card", { hasText: "Palestrante Fluxo" }).filter({ hasText: `Evento UI ${sufixo}` });
  await cardPalestrante.first().waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "Palestrantes do aluno em cards, com avatar e a próxima palestra",
    (await cardPalestrante.count()) >= 1 && (await cardPalestrante.first().locator(".avatar-iniciais").innerText()) === "PF",
  );
  checar("aluno não vê e-mail de palestrante", !(await temTexto(page, `fluxo-${sufixo}@`)) && !(await temTexto(page, `pal-${sufixo}@`)));
  await sair(page);

  // evento de amanha: a aluna se inscreve, mas o check-in dele ainda nao abriu (abre 1h antes do inicio)
  const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const eventoAmanha = await api("POST", "/eventos", tokenSecretaria, {
    titulo: `Evento Amanha UI ${sufixo}`, horario: amanha, salaId: sala.corpo.id, palestranteId: palestrante.corpo.id, tema: "Tema", cargaHoraria: 1, questionario: questionario(),
  });
  await api("POST", `/eventos/${eventoAmanha.corpo.id}/inscricoes`, await tokenDe(emailAluno, SENHA_ALUNA));

  titulo("Check-in pela tela da secretaria");
  await entrar(page, secretaria.email, secretaria.senha);
  await page.goto(`${APP}/checkin`);
  await page.fill("input.search-input", NOME_ALUNA);
  await page.locator(".simple-list-item", { hasText: NOME_ALUNA }).click();
  const linhaCheckin = page.locator("tr", { hasText: `Evento UI ${sufixo}` });
  await linhaCheckin.waitFor();
  const linhaAmanha = page.locator("tr", { hasText: `Evento Amanha UI ${sufixo}` });
  await linhaAmanha.waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "check-in de evento que começa daqui a mais de 1h: botões desabilitados e aviso de quando abre",
    (await linhaAmanha.locator("button:has-text('Confirmar presença')").isDisabled()) &&
      (await linhaAmanha.locator("button:has-text('Ausente')").isDisabled()) &&
      (await linhaAmanha.innerText()).includes("O check-in abre em"),
    await linhaAmanha.innerText().catch(() => "linha não encontrada"),
  );
  await linhaCheckin.locator("button:has-text('Confirmar presença')").click();
  await linhaCheckin.locator(".badge", { hasText: "Presente" }).waitFor({ timeout: 8000 }).catch(() => {});
  checar("confirmar presença pela tela marca a inscrição como Presente", (await linhaCheckin.locator(".badge", { hasText: "Presente" }).count()) === 1);
  await sair(page);
  await entrar(page, emailAluno, SENHA_ALUNA);

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
  checar("certificado baixado em PDF (montado no navegador com os dados da API)", arquivo.suggestedFilename().endsWith(".pdf"), arquivo.suggestedFilename());
  await itemCertificado.getByText("Código de validação:").waitFor({ timeout: 10000 }).catch(() => {});
  const codigoNaTela = (await itemCertificado.innerText()).match(/Código de validação: ([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})/)?.[1];
  checar("depois de emitir, a tela mostra o código gravado e o botão vira Baixar certificado", !!codigoNaTela && (await itemCertificado.locator("button:has-text('Baixar certificado')").count()) === 1);
  // validacao dentro do sistema, na propria tela Certificados (codigo digitado em minusculas, como alguem faria)
  const cartaoValidacao = page.locator(".card", { has: page.locator("h3", { hasText: "Validar certificado" }) });
  await cartaoValidacao.locator("input").fill((codigoNaTela ?? "").toLowerCase());
  await cartaoValidacao.locator("button:has-text('Validar')").click();
  await cartaoValidacao.getByText("Certificado válido").waitFor({ timeout: 10000 }).catch(() => {});
  checar(
    "tela Certificados valida o código digitado (dentro do sistema)",
    (await cartaoValidacao.getByText("Certificado válido").count()) === 1 && (await cartaoValidacao.innerText()).includes(`Evento UI ${sufixo}`),
  );
  await page.goto(`${APP}/validar-certificado?codigo=${codigoNaTela}`);
  await page.getByText("Certificado válido").waitFor({ timeout: 10000 }).catch(() => {});
  checar("o link impresso no PDF continua abrindo a validação sem login", await temTexto(page, "Certificado válido"));
  await page.goto(`${APP}/validar-certificado?codigo=ZZZZ-ZZZZ-ZZZZ`);
  await page.getByText("Certificado não encontrado.").waitFor({ timeout: 10000 }).catch(() => {});
  checar("código inexistente: Certificado não encontrado", await temTexto(page, "Certificado não encontrado."));

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

  // ---------------------------------------------------------------- RF026: direitos do titular
  titulo("Meus dados do aluno e reprovação no questionário (RF026)");
  // evento em que a aluna fica abaixo de 60% nas duas tentativas (sala propria, sem conflito de horario):
  // sem terceira chance, o certificado desse evento nao sai mais
  const tokenAluna = await tokenDe(emailAluno, SENHA_ALUNA);
  const salaReprovado = await api("POST", "/salas", tokenSecretaria, { nome: `Sala Reprovado UI ${sufixo}`, capacidade: 10 });
  const tituloReprovado = `Evento Reprovado UI ${sufixo}`;
  const eventoReprovado = await api("POST", "/eventos", tokenSecretaria, {
    titulo: tituloReprovado, horario: new Date(Date.now() + 30 * 60 * 1000).toISOString(), salaId: salaReprovado.corpo.id, palestranteId: palestrante.corpo.id, tema: "Tema", cargaHoraria: 1, questionario: questionario(),
  });
  const inscricaoReprovado = await api("POST", `/eventos/${eventoReprovado.corpo.id}/inscricoes`, tokenAluna);
  await api("PUT", `/inscricoes/${inscricaoReprovado.corpo.id}`, tokenSecretaria, { statusPresenca: "PRESENTE" });
  for (let i = 0; i < 2; i++) {
    await api("POST", `/eventos/${eventoReprovado.corpo.id}/questionario/respostas`, tokenAluna, { respostas: Array(10).fill(1) });
  }
  await page.goto(`${APP}/certificados`);
  const itemReprovado = page.locator(".simple-list-item", { hasText: tituloReprovado });
  await itemReprovado.waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "reprovada nas 2 tentativas: sem nova tentativa, sem pedido de revisão e sem certificado",
    (await itemReprovado.count()) === 1 &&
      (await itemReprovado.innerText()).includes("Você usou as 2 tentativas permitidas") &&
      (await itemReprovado.locator("a").count()) === 0 &&
      (await itemReprovado.locator("button:has-text('Emitir certificado')").isDisabled()),
    (await itemReprovado.count()) === 1 ? await itemReprovado.innerText() : "item não encontrado",
  );

  const itensMenu = (await page.locator("a.nav-link").allInnerTexts()).map((t) => t.trim().toLowerCase());
  const posicaoConta = itensMenu.indexOf("minha conta");
  checar("menu do aluno tem \"Meus dados\" logo depois de \"Minha conta\"", posicaoConta >= 0 && itensMenu[posicaoConta + 1] === "meus dados", itensMenu.join(" | "));
  await page.locator("a.nav-link", { hasText: "Meus dados" }).click();
  await page.getByText(rgmAluno).first().waitFor({ timeout: 10000 }).catch(() => {});
  const titulosSecoes = await page.locator(".card h3").allInnerTexts();
  checar(
    "Meus dados mostra só as seções de dados, em cartões",
    ["Dados cadastrais", "Inscrições e presenças", "Questionários", "Certificados", "Avaliações"].every((s) => titulosSecoes.includes(s)) &&
      titulosSecoes.length === 5,
    titulosSecoes.join(" | "),
  );
  checar(
    "dados da própria aluna: RGM, eventos inscritos e resultado dos questionários",
    (await temTexto(page, rgmAluno)) && (await temTexto(page, `Evento UI ${sufixo}`)) && (await temTexto(page, tituloReprovado)) && (await temTexto(page, "10 de 10")) && (await temTexto(page, "0 de 10")),
  );
  checar(
    "sem botão de baixar os dados e sem o bloco \"Outros pedidos\"",
    !(await temTexto(page, "Baixar meus dados")) && !(await temTexto(page, "Outros pedidos sobre seus dados")) && !(await temTexto(page, "Enviar pedido por e-mail")),
  );
  await page.locator(".topbar-user-info").click();
  checar("clicar no nome do topo não abre mais a janela \"Informações do usuário\"", !(await temTexto(page, "Informações do usuário")) && (await page.locator(".modal").count()) === 0);
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
  await page.fill("#senha", SENHA_ALUNO2);
  await page.click("button[type=submit]");
  await page.getByText("Sua conta está inativa. Procure a secretaria.").waitFor({ timeout: 8000 }).catch(() => {});
  checar("aluno inativo vê a mensagem padrão no login", await temTexto(page, "Sua conta está inativa. Procure a secretaria."));
  checar("o motivo interno não aparece pro aluno", !(await temTexto(page, "Motivo interno da equipe")));

  await entrar(page, secretaria.email, secretaria.senha);
  await page.goto(`${APP}/participantes`);
  const linhaInativo = page.locator("tr", { hasText: NOME_INATIVO });
  await linhaInativo.waitFor();
  checar("Participantes mostra o badge Inativo", (await linhaInativo.locator(".badge", { hasText: "Inativo" }).count()) === 1);
  await page.locator("tr", { hasText: NOME_ALUNA }).locator("button:has-text('Editar')").click();
  checar(
    "na edição o e-mail aparece só para leitura, com a explicação",
    (await page.inputValue(".modal #email")) === emailAluno &&
      (await page.locator(".modal #email[readonly]").count()) === 1 &&
      (await temTexto(page, "O e-mail é o login do aluno, foi confirmado no cadastro e não pode ser alterado.")),
  );
  await page.click(".modal button:has-text('Cancelar')");
  checar(
    "secretaria vê as colunas 2FA e Acesso, mas sem os botões Resetar 2FA/Desbloquear",
    (await page.locator("th", { hasText: "2FA" }).count()) === 1 &&
      (await page.locator("th", { hasText: "Acesso" }).count()) === 1 &&
      (await linhaInativo.locator(".badge", { hasText: "Não ativado" }).count()) === 1 &&
      (await page.locator("button", { hasText: "Resetar 2FA" }).count()) === 0 &&
      (await page.locator("button", { hasText: "Desbloquear" }).count()) === 0,
  );
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
  // a busca por aluno vai ao servidor (a lista e paginada la, nunca baixa todas as inscricoes)
  await page.fill("input[aria-label='Buscar aluno']", NOME_INATIVO);
  for (let i = 0; i < 20 && (await page.locator("table tbody tr", { hasNotText: NOME_INATIVO }).count()) > 0; i++) await page.waitForTimeout(500);
  checar(
    "Inscrições: busca por aluno filtrada no servidor, com a paginação no rodapé",
    (await page.locator("table tbody tr", { hasText: NOME_INATIVO }).count()) >= 1 &&
      (await page.locator("table tbody tr", { hasNotText: NOME_INATIVO }).count()) === 0 &&
      (await temTexto(page, "Mostrando 1–")),
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

  titulo("Dashboard: indicador de aprendizagem (RF021)");
  // a esta altura a aluna foi aprovada no "Evento UI" (10 de 10) e reprovada nas 2 tentativas do
  // "Evento Reprovado UI", com presenca confirmada nos dois
  await entrar(page, admin.email, admin.senha);
  await page.locator(".stat-card").first().waitFor();
  const caixas = await page.locator(".stat-card").evaluateAll((cards) => cards.map((c) => Math.round(c.getBoundingClientRect().top)));
  checar(
    "os 8 cards ficam em 2 linhas de 4 no desktop",
    caixas.length === 8 && new Set(caixas.slice(0, 4)).size === 1 && new Set(caixas.slice(4)).size === 1 && caixas[4] > caixas[0],
    caixas.join(", "),
  );
  const cardAprovacao = page.locator(".stat-card", { hasText: "Aprovação no questionário" });
  checar(
    "card \"Aprovação no questionário\" com a taxa em % e a explicação do cálculo",
    /\d+%/.test(await cardAprovacao.locator(".stat-card-value").innerText()) &&
      (await cardAprovacao.innerText()).includes("aprovados ÷ alunos que concluíram o questionário"),
    await cardAprovacao.innerText(),
  );
  const cardAprendizagem = page.locator(".card", { hasText: "Aprendizagem por evento" });
  checar(
    "gráfico de aprendizagem com a legenda Aprovados / Ainda podem responder / Reprovados",
    (await cardAprendizagem.locator(".grafico-legenda li").allInnerTexts()).join("|") === "Aprovados|Ainda podem responder|Reprovados",
  );
  const barraAprovada = await cardAprendizagem.locator(`.grafico-trilho[aria-label^="Evento UI ${sufixo}:"]`).getAttribute("aria-label");
  checar(
    "a aluna aprovada aparece em verde no evento dela (1 aprovado, 0 reprovado)",
    (barraAprovada ?? "").includes("1 aprovados") &&
      (barraAprovada ?? "").includes("0 reprovados") &&
      (await cardAprendizagem.locator(`.grafico-trilho[aria-label^="Evento UI ${sufixo}:"] .grafico-segmento.verde`).count()) === 1,
    barraAprovada,
  );
  const barraReprovada = await cardAprendizagem.locator(`.grafico-trilho[aria-label^="${tituloReprovado}:"]`).getAttribute("aria-label");
  checar(
    "a reprovada nas 2 tentativas aparece em vermelho no outro evento (0 aprovado, 1 reprovado)",
    (barraReprovada ?? "").includes("0 aprovados") &&
      (barraReprovada ?? "").includes("1 reprovados") &&
      (await cardAprendizagem.locator(`.grafico-trilho[aria-label^="${tituloReprovado}:"] .grafico-segmento.vermelho`).count()) === 1,
    barraReprovada,
  );
  await cardAprendizagem.locator("summary", { hasText: "Ver dados em tabela" }).click();
  checar(
    "\"Ver dados em tabela\" mostra os mesmos números por evento",
    // o CSS deixa o cabecalho em maiusculas, e o innerText devolve o texto ja transformado
    (await cardAprendizagem.locator("th").allInnerTexts()).join("|").toLowerCase() === "evento|data|presentes|aprovados|ainda podem responder|reprovados" &&
      (await cardAprendizagem.locator("tr", { hasText: tituloReprovado }).locator("td").allInnerTexts()).slice(2).join("|") === "1|0|0|1",
  );

  titulo("C / Participantes: 2FA e acesso (administrador)");
  await page.goto(`${APP}/participantes`);
  const linhaUsuario = page.locator("tr", { hasText: NOME_INATIVO });
  await linhaUsuario.waitFor();
  checar(
    "admin vê em Participantes o Inativo, o 2FA e o acesso da conta",
    (await linhaUsuario.locator(".badge", { hasText: "Inativo" }).count()) === 1 &&
      (await linhaUsuario.locator(".badge", { hasText: "Não ativado" }).count()) === 1 &&
      (await linhaUsuario.locator(".badge", { hasText: "Liberado" }).count()) === 1,
  );
  checar("menu do admin não tem mais a tela Usuários", (await page.locator("a.nav-link", { hasText: "Usuários" }).count()) === 0);

  // a equipe tambem valida certificado pela tela Certificados (o cartao vem antes da tabela)
  await page.goto(`${APP}/certificados`);
  const validacaoEquipe = page.locator(".card", { has: page.locator("h3", { hasText: "Validar certificado" }) });
  await validacaoEquipe.locator("input").fill("ZZZZ-ZZZZ-ZZZZ");
  await validacaoEquipe.locator("button:has-text('Validar')").click();
  await validacaoEquipe.getByText("Certificado não encontrado.").waitFor({ timeout: 10000 }).catch(() => {});
  checar("equipe valida certificado na tela Certificados (código inexistente: não encontrado)", (await validacaoEquipe.getByText("Certificado não encontrado.").count()) === 1);
  await page.getByText("com presença confirmada").first().waitFor({ timeout: 10000 }).catch(() => {});
  checar("Certificados da equipe vêm paginados do servidor (rodapé com o total)", await temTexto(page, "com presença confirmada"));

  titulo("Auditoria: filtro pelas ações novas");
  await page.goto(`${APP}/auditoria`);
  await page.locator(".card select").first().selectOption("FEEDBACK_EXCLUIDO");
  const linhaLog = page.locator("tr", { hasText: "motivo: conteúdo ofensivo" }).first();
  await linhaLog.waitFor({ timeout: 10000 }).catch(() => {});
  checar(
    "filtro por \"Feedback excluído\" mostra a exclusão feita pela equipe, com o motivo e o responsável",
    (await linhaLog.count()) === 1 && (await linhaLog.innerText()).includes("Equipe UI Secretaria") && (await linhaLog.innerText()).includes("Feedback excluído"),
  );
  const opcoesDeAcao = await page.locator(".card select").first().locator("option").allInnerTexts();
  checar(
    "filtro de ações não tem mais \"Dados exportados pelo titular\" (a exportação saiu)",
    opcoesDeAcao.length > 1 && !opcoesDeAcao.some((opcao) => opcao.includes("Dados exportados")),
    opcoesDeAcao.length,
  );
  checar("equipe não tem \"Meus dados\" no menu", (await page.locator("a.nav-link", { hasText: "Meus dados" }).count()) === 0);
  await sair(page);

  titulo("E / Esqueci a senha");
  await page.goto(`${APP}/esqueci-senha`);
  await page.click("button[type=submit]");
  checar("enviar vazio: e-mail marcado com mensagem", (await invalido(page, "#email")) && (await temTexto(page, "Informe o e-mail cadastrado.")));
  await page.fill("#email", `ninguem.${sufixo}@alunos.umc.br`);
  await page.click("button[type=submit]");
  await page.locator("#codigo").waitFor({ timeout: 10000 }).catch(() => {});
  checar(
    "e-mail sem conta segue para o código com a mesma mensagem (não revela quem tem conta)",
    (await page.locator("#codigo").count()) === 1 && (await temTexto(page, "Se houver uma conta com o e-mail informado")),
  );
  await page.goto(`${APP}/login`);
  await page.goto(`${APP}/esqueci-senha`);
  await page.fill("#email", emailAluno);
  await page.click("button[type=submit]");
  await page.locator("#codigo").waitFor();
  await page.click("button[type=submit]");
  checar("etapa 2 vazia: código, nova senha e confirmação marcados", (await invalido(page, "#codigo")) && (await invalido(page, "#novaSenha")) && (await invalido(page, "#confirmarSenha")));
  checar("a nova senha mostra a mesma lista de requisitos", (await page.locator(".requisitos-senha li").count()) === 4);
  await page.fill("#codigo", "123456");
  await page.fill("#novaSenha", "novasenha123");
  await page.fill("#confirmarSenha", "novasenha123");
  await page.click("button[type=submit]");
  checar(
    "nova senha sem maiúscula e sem caractere especial: erro embaixo do campo, com a regra",
    (await invalido(page, "#novaSenha")) && (await temTexto(page, "A senha deve ter de 8 a 64 caracteres")),
  );

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
