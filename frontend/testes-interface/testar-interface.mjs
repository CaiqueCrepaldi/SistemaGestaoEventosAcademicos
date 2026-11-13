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
  // sala no padrao da UMC (predio + andar + "-" + numero, ex.: 1T-01) e unica: o teste usa codigos que nenhuma sala
  // do banco usa, do predio 2 (o teste da API vai do 33-21 para tras)
  const codigosDeSalaEmUso = new Set((await api("GET", "/salas", tokenSecretaria)).corpo.map((s) => s.nome));
  function codigoDeSala() {
    for (const predio of ["2", "1", "3"]) {
      for (const andar of ["1", "2", "3", "T"]) {
        for (let numero = 1; numero <= 21; numero++) {
          const codigo = `${predio}${andar}-${String(numero).padStart(2, "0")}`;
          if (!codigosDeSalaEmUso.has(codigo)) {
            codigosDeSalaEmUso.add(codigo);
            return codigo;
          }
        }
      }
    }
    throw new Error("nenhum código de sala livre");
  }

  // ---------------------------------------------------------------- E: login
  titulo("E / Login: campos obrigatórios");
  await page.goto(`${APP}/login`);
  checar("rótulos com * nos campos obrigatórios", (await page.locator("label[for=emailLogin] .campo-obrigatorio").count()) === 1 && (await page.locator("label[for=senha] .campo-obrigatorio").count()) === 1);
  checar("legenda explicando o *", await temTexto(page, "são obrigatórios"));
  checar("a tela de login não tem mais o link \"Validar certificado\" (a validação fica em Certificados)", !(await temTexto(page, "Validar certificado")));
  checar(
    "o login não tem link de primeiro acesso: só \"Criar conta\" e \"Esqueci minha senha\"",
    (await page.locator(".login-links a").allInnerTexts()).map((t) => t.trim()).join("|") === "Criar conta|Esqueci minha senha" &&
      (await page.locator("a[href*='primeiro-acesso']").count()) === 0,
    (await page.locator(".login-links a").allInnerTexts()).join("|"),
  );
  await page.goto(`${APP}/termos-de-uso`);
  await page.locator("a", { hasText: "Voltar para o cadastro" }).waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "sem login, a página dos Termos continua com \"Voltar para o cadastro\"",
    (await page.locator("a", { hasText: "Voltar para o cadastro" }).count()) === 1 && (await page.locator("a", { hasText: "Voltar para Minha conta" }).count()) === 0,
  );
  await page.goto(`${APP}/login`);
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
  await page.goto(`${APP}/salas`);
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForTimeout(1500);
  checar("F5 numa tela da equipe (Salas) mantém a secretaria na mesma página", (await page.evaluate(() => location.hash)) === "#/salas", await page.evaluate(() => location.hash));
  checar("a secretaria não tem a aba Auditoria no menu", (await page.locator("a.nav-link", { hasText: "Auditoria" }).count()) === 0);
  await page.goto(`${APP}/auditoria`);
  await page.waitForFunction(() => location.hash !== "#/auditoria", null, { timeout: 8000 }).catch(() => {});
  checar("o endereço da Auditoria não abre para a secretaria (volta para o início)", (await page.evaluate(() => location.hash)) === "#/", await page.evaluate(() => location.hash));
  await page.goto(`${APP}/`);
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
  checar(
    "o nome livre deu lugar a Prédio, Andar e Número (seleções), mais o Tipo",
    (await page.locator(".modal select#predio").count()) === 1 &&
      (await page.locator(".modal select#andar").count()) === 1 &&
      (await page.locator(".modal select#numero").count()) === 1 &&
      (await page.locator(".modal select#tipo").count()) === 1 &&
      (await page.locator(".modal input#nome").count()) === 0,
  );
  checar(
    "as opções seguem o padrão: prédios 1 a 3, andar T/1/2/3, números 01 a 21, três tipos",
    (await page.locator("#predio option").count()) === 4 &&
      (await page.locator("#andar option").count()) === 5 &&
      (await page.locator("#numero option").count()) === 22 &&
      (await page.locator("#tipo option").allInnerTexts()).join("|") === "Sala de aula|Laboratório|Auditório",
  );
  await page.click(".modal button[type=submit]");
  checar(
    "enviar vazio: prédio, andar, número e capacidade inválidos",
    (await invalido(page, "#predio")) && (await invalido(page, "#andar")) && (await invalido(page, "#numero")) && (await invalido(page, "#capacidade")),
  );
  checar("mensagens do que falta", (await temTexto(page, "Escolha o prédio.")) && (await temTexto(page, "Informe a capacidade.")));
  checar("foco no primeiro campo inválido", (await idAtivo(page)) === "predio", await idAtivo(page));
  const codigoSalaUi = codigoDeSala();
  await page.selectOption("#predio", codigoSalaUi[0]);
  await page.selectOption("#andar", codigoSalaUi[1]);
  await page.selectOption("#numero", codigoSalaUi.slice(3));
  await page.selectOption("#tipo", "LABORATORIO");
  checar("a tela mostra o código montado", await temTexto(page, `Código da sala: ${codigoSalaUi}`), codigoSalaUi);
  await page.fill("#capacidade", "0");
  await page.click(".modal button[type=submit]");
  checar("capacidade zero é recusada com mensagem", await temTexto(page, "maior que zero"));
  await page.fill("#capacidade", "40");
  await page.click(".modal button[type=submit]");
  checar("sala válida é salva", await esperarToast(page, "Sala cadastrada."));
  const linhaSalaUi = page.locator("tr", { hasText: codigoSalaUi });
  await linhaSalaUi.waitFor({ timeout: 8000 }).catch(() => {});
  checar("a lista mostra o código e o tipo", (await linhaSalaUi.count()) === 1 && (await linhaSalaUi.innerText()).includes("Laboratório"));
  await page.click("button:has-text('+ Nova sala')");
  await page.selectOption("#predio", codigoSalaUi[0]);
  await page.selectOption("#andar", codigoSalaUi[1]);
  await page.selectOption("#numero", codigoSalaUi.slice(3));
  await page.fill("#capacidade", "30");
  await page.click(".modal button[type=submit]");
  checar("código repetido: a API recusa e a tela avisa", await esperarToast(page, `Já existe uma sala ${codigoSalaUi}.`));
  await page.click(".modal button:has-text('Cancelar')");
  await page.selectOption("select[aria-label='Filtrar por tipo']", "LABORATORIO");
  const tiposNaLista = await page.locator("table tbody tr td:nth-child(2)").allInnerTexts();
  checar("filtro por tipo: só laboratórios", tiposNaLista.length > 0 && tiposNaLista.every((t) => t.trim() === "Laboratório"), tiposNaLista.join("|"));
  await page.selectOption("select[aria-label='Filtrar por tipo']", "");
  await page.selectOption("select[aria-label='Filtrar por prédio']", codigoSalaUi[0]);
  const codigosNaLista = await page.locator("table tbody tr td:first-child").allInnerTexts();
  checar(
    "filtro por prédio, com as salas em ordem de prédio, andar e número",
    codigosNaLista.length > 0 &&
      codigosNaLista.every((c) => c.startsWith(codigoSalaUi[0])) &&
      codigosNaLista.every((c, i) => {
        const chave = (x) => `${x[1] === "T" ? "0" : x[1]}${x.slice(3)}`;
        return i === 0 || chave(codigosNaLista[i - 1]) < chave(c);
      }),
    codigosNaLista.join("|"),
  );
  await page.selectOption("select[aria-label='Filtrar por prédio']", "");
  const salaUiCriada = ((await api("GET", "/salas", tokenSecretaria)).corpo ?? []).find((x) => x.nome === codigoSalaUi);
  if (salaUiCriada) await api("DELETE", `/salas/${salaUiCriada.id}`, tokenSecretaria);

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
  const sala = await api("POST", "/salas", tokenSecretaria, { nome: codigoDeSala(), tipo: "AUDITORIO", capacidade: 40 });
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
  // evento futuro com 1 vaga, ja ocupada pelo segundo aluno: aparece em Abertas com "Sem vagas"
  const salaUmaVagaUi = await api("POST", "/salas", tokenSecretaria, { nome: codigoDeSala(), tipo: "SALA_DE_AULA", capacidade: 1 });
  const tituloLotadoUi = `Palestra Lotação UI ${sufixo}`;
  const eventoLotadoUi = await api("POST", "/eventos", tokenSecretaria, {
    titulo: tituloLotadoUi, horario: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(), salaId: salaUmaVagaUi.corpo.id, palestranteId: palestrante.corpo.id, tema: "Tema", cargaHoraria: 1, questionario: questionario(),
  });
  const inscricaoLotadoUi = await api("POST", "/inscricoes", tokenSecretaria, { participanteId: cadastro2.corpo.participanteId, eventoId: eventoLotadoUi.corpo.id });
  await entrar(page, emailAluno, SENHA_ALUNA);
  await page.goto(`${APP}/eventos`);
  const cartao = (texto) => page.locator(".evento-cartao", { hasText: texto });
  await cartao(`Evento UI ${sufixo}`).first().waitFor({ timeout: 10000 }).catch(() => {});
  const rotulosOpcoes = (await page.locator(".eventos-aluno-opcao").allInnerTexts()).map((t) => t.trim());
  checar(
    "três opções com bolinha (Inscritas, Abertas, Todas), cada uma com a quantidade, e Abertas selecionada",
    (await page.locator("input[type=radio][name=opcaoEventos]").count()) === 3 &&
      /^Inscritas \(\d+\)$/.test(rotulosOpcoes[0]) &&
      /^Abertas \(\d+\)$/.test(rotulosOpcoes[1]) &&
      /^Todas \(\d+\)$/.test(rotulosOpcoes[2]) &&
      (await page.locator("input[name=opcaoEventos][value=ABERTAS]").isChecked()),
    rotulosOpcoes.join(" | "),
  );
  checar(
    "os filtros antigos saíram (dia, horário, sala e \"mostrar encerrados\")",
    (await page.locator("input[type=date]").count()) === 0 &&
      (await page.locator("input[type=time]").count()) === 0 &&
      (await page.locator("#mostrarEncerrados").count()) === 0 &&
      !(await temTexto(page, "Todas as salas")),
  );
  const cartaoLotado = cartao(tituloLotadoUi);
  checar(
    "evento lotado continua em Abertas, com a etiqueta \"Sem vagas\" e o botão de inscrição desativado",
    (await cartaoLotado.count()) === 1 &&
      (await cartaoLotado.locator(".badge", { hasText: "Sem vagas" }).count()) === 1 &&
      (await cartaoLotado.locator("button.btn-primary").isDisabled()),
    `${await cartaoLotado.count()} cartão(ões): ${(await cartaoLotado.count()) ? await cartaoLotado.first().innerText() : JSON.stringify(inscricaoLotadoUi.corpo)}`,
  );
  const cartaoEventoUi = cartao(`Evento UI ${sufixo}`).first();
  checar(
    "o cartão mostra a data em destaque, início e fim, a sala com o tipo, o palestrante e as vagas restantes",
    (await cartaoEventoUi.locator(".evento-cartao-dia").count()) === 1 &&
      (await cartaoEventoUi.innerText()).includes("Auditório") &&
      (await cartaoEventoUi.innerText()).includes("Palestrante Fluxo") &&
      / das \d{2}:\d{2} às \d{2}:\d{2}/.test(await cartaoEventoUi.innerText()) &&
      (await cartaoEventoUi.innerText()).includes("39 de 40 restantes"),
    await cartaoEventoUi.innerText(),
  );
  await cartaoEventoUi.locator("button:has-text('Inscrever-se')").click();
  checar("aluno se inscreve pela tela", await esperarToast(page, "Inscrição confirmada"));
  checar(
    "o e-mail de confirmação sai junto com a inscrição (o aviso cita o e-mail do aluno)",
    await temTexto(page, `E-mail de confirmação enviado para ${emailAluno}`),
  );
  checar(
    // o Evento UI comeca daqui a 30 min: o check-in ja esta aberto, entao a etiqueta e "Check-in aberto"
    "depois de se inscrever: etiqueta Check-in aberto (começa em menos de 1 hora), vagas atualizadas e \"Inscritas (1)\"",
    (await cartaoEventoUi.locator(".badge", { hasText: "Check-in aberto" }).count()) === 1 &&
      (await cartaoEventoUi.innerText()).includes("38 de 40 restantes") &&
      (await page.locator(".eventos-aluno-opcao").first().innerText()).trim() === "Inscritas (1)",
    `${await cartaoEventoUi.innerText()} | ${await page.locator(".eventos-aluno-opcao").first().innerText()}`,
  );
  checar("Abertas não mostra o evento que já aconteceu", (await cartao(`Evento Encerrado UI ${sufixo}`).count()) === 0);
  await page.check("input[name=opcaoEventos][value=INSCRITAS]");
  checar(
    "Inscritas mostra só os eventos em que a aluna está inscrita",
    (await page.locator(".evento-cartao").count()) === 1 && (await cartao(`Evento UI ${sufixo}`).count()) === 1,
    await page.locator(".evento-cartao").count(),
  );
  await page.check("input[name=opcaoEventos][value=TODAS]");
  const cartaoEncerrado = cartao(`Evento Encerrado UI ${sufixo}`);
  await cartaoEncerrado.waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "Todas inclui o evento encerrado, com a etiqueta Encerrado e o botão desativado",
    (await cartaoEncerrado.count()) === 1 &&
      (await cartaoEncerrado.locator(".badge", { hasText: "Encerrado" }).count()) === 1 &&
      (await cartaoEncerrado.locator("button.btn-primary").innerText()) === "Encerrado" &&
      (await cartaoEncerrado.locator("button.btn-primary").isDisabled()),
  );
  await page.check("input[name=opcaoEventos][value=ABERTAS]");
  await page.fill("input[aria-label='Buscar pelo nome da palestra']", "LOTACAO");
  checar(
    "a busca filtra enquanto digita, sem diferenciar maiúsculas nem acentos, junto com a opção",
    (await page.locator(".evento-cartao").count()) === 1 && (await cartao(tituloLotadoUi).count()) === 1,
    await page.locator(".evento-cartao").count(),
  );
  await page.fill("input[aria-label='Buscar pelo nome da palestra']", "nada-assim-existe");
  checar("busca sem resultado: mensagem própria", await temTexto(page, 'Nenhum evento com "nada-assim-existe" no nome em "Abertas".'));
  await page.fill("input[aria-label='Buscar pelo nome da palestra']", "");
  // celular: cartoes em uma coluna, opcoes e busca sem rolagem lateral
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const larguraCelular = await page.evaluate(() => ({ rolagem: document.documentElement.scrollWidth, tela: document.documentElement.clientWidth }));
  const posicoesX = await page.locator(".evento-cartao").evaluateAll((els) => [...new Set(els.slice(0, 4).map((el) => Math.round(el.getBoundingClientRect().left)))]);
  checar("no celular: cartões em uma coluna e nada estoura a largura", larguraCelular.rolagem <= larguraCelular.tela && posicoesX.length === 1, JSON.stringify({ larguraCelular, posicoesX }));
  await page.setViewportSize({ width: 1280, height: 900 });
  checar("menu do aluno não tem mais a Agenda (unida à tela Eventos)", (await page.locator("a.nav-link", { hasText: "Agenda" }).count()) === 0);
  await page.goto(`${APP}/agenda`);
  await page.waitForFunction(() => location.hash.startsWith("#/eventos"), null, { timeout: 8000 }).catch(() => {});
  checar("o link antigo da Agenda leva para Eventos", (await page.evaluate(() => location.hash)).startsWith("#/eventos"));
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

  titulo("Check-in: o aluno pede, a equipe aprova");
  await entrar(page, emailAluno, SENHA_ALUNA);
  await page.goto(`${APP}/eventos`);
  await page.check("input[name=opcaoEventos][value=INSCRITAS]");
  const itemAmanha = page.locator(".evento-cartao", { hasText: `Evento Amanha UI ${sufixo}` });
  await itemAmanha.waitFor();
  checar(
    "evento que começa daqui a mais de 1h: sem botão de check-in e com o aviso de quando abre",
    (await itemAmanha.locator("button", { hasText: "Fazer check-in" }).count()) === 0 && (await itemAmanha.innerText()).includes("O check-in abre em"),
    await itemAmanha.innerText(),
  );
  const itemCheckinAluna = page.locator(".evento-cartao", { hasText: `Evento UI ${sufixo}` }).first();
  await itemCheckinAluna.locator("button", { hasText: "Fazer check-in" }).click();
  const confirmaLocal = page.locator(".modal", { hasText: "Confirma que você está no local do evento?" });
  await confirmaLocal.waitFor({ timeout: 8000 }).catch(() => {});
  checar("antes de enviar, a tela pergunta se o aluno está no local do evento", (await confirmaLocal.count()) === 1);
  await confirmaLocal.locator("button", { hasText: "Fazer check-in" }).click();
  checar("o pedido de check-in sai e a tela avisa", await esperarToast(page, "Check-in enviado. Aguarde a aprovação."));
  checar(
    "a inscrição mostra \"Aguardando aprovação do check-in\" e o botão some",
    (await itemCheckinAluna.innerText()).includes("Aguardando aprovação do check-in") &&
      (await itemCheckinAluna.locator("button", { hasText: "Fazer check-in" }).count()) === 0,
    await itemCheckinAluna.innerText(),
  );
  await sair(page);

  await entrar(page, secretaria.email, secretaria.senha);
  await page.goto(`${APP}/checkin`);
  const eventoNaTelaCheckin = page.locator(".simple-list-item", { hasText: `Evento UI ${sufixo}` });
  await eventoNaTelaCheckin.waitFor();
  checar(
    "tela Check-in lista o evento com o check-in aberto e o pedido pendente; o de amanhã não aparece",
    (await eventoNaTelaCheckin.innerText()).includes("1 pedido(s) pendente(s)") &&
      (await page.locator(".simple-list-item", { hasText: `Evento Amanha UI ${sufixo}` }).count()) === 0,
    await eventoNaTelaCheckin.innerText(),
  );
  await eventoNaTelaCheckin.click();
  const linhaPedido = page.locator(".painel-checkins tr", { hasText: NOME_ALUNA });
  await linhaPedido.waitFor();
  checar("o painel mostra o pedido com o nome e o RGM da aluna", (await linhaPedido.innerText()).includes(rgmAluno), await linhaPedido.innerText());
  await linhaPedido.locator("button", { hasText: "Aprovar" }).click();
  const confirmaAprovacaoCheckin = page.locator(".modal", { hasText: "Tem certeza que deseja aprovar?" });
  await confirmaAprovacaoCheckin.waitFor();
  await confirmaAprovacaoCheckin.locator(".modal-footer button", { hasText: "Aprovar" }).click();
  checar("aprovar pede confirmação e avisa", await esperarToast(page, "Check-in aprovado."));
  const linhaDecidida = page.locator(".painel-checkins tr", { hasText: NOME_ALUNA });
  await linhaDecidida.locator(".badge", { hasText: "Presente" }).waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "a aluna vai para \"Já decididos\" como Presente, com a opção de reverter",
    (await linhaDecidida.locator(".badge", { hasText: "Presente" }).count()) === 1 &&
      (await linhaDecidida.locator("button", { hasText: "Reverter para recusado" }).count()) === 1,
  );
  await sair(page);
  await entrar(page, emailAluno, SENHA_ALUNA);
  await page.goto(`${APP}/eventos`);
  await page.check("input[name=opcaoEventos][value=INSCRITAS]");
  const itemPresenca = page.locator(".evento-cartao", { hasText: `Evento UI ${sufixo}` }).first();
  await itemPresenca.waitFor();
  checar("a aluna vê \"Presença confirmada\"", (await itemPresenca.innerText()).includes("Presença confirmada"), await itemPresenca.innerText());

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

  titulo("Termos e privacidade na Minha conta (aluna)");
  await page.goto(`${APP}/minha-conta`);
  const secaoTermos = page.locator(".termos-conta");
  await secaoTermos.waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "a Minha conta mostra a versão e a data do aceite, os links dos Termos e da Política e o Meus dados",
    /Você aceitou a versão 1 dos Termos de Uso e da Política de Privacidade em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/.test(await secaoTermos.innerText()) &&
      (await secaoTermos.locator("a", { hasText: "Termos de Uso" }).count()) === 1 &&
      (await secaoTermos.locator("a", { hasText: "Política de Privacidade" }).count()) === 1 &&
      (await secaoTermos.locator("a", { hasText: "Meus dados" }).count()) === 1,
    await secaoTermos.innerText(),
  );
  await secaoTermos.locator("a", { hasText: "Termos de Uso" }).click();
  await page.waitForFunction(() => location.hash === "#/termos-de-uso", null, { timeout: 8000 }).catch(() => {});
  await page.locator(".login-links a").first().waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "logada, a página dos Termos mostra \"Voltar para Minha conta\" (e não \"Voltar para o cadastro\")",
    (await page.locator("a", { hasText: "Voltar para Minha conta" }).count()) === 1 && (await page.locator("a", { hasText: "Voltar para o cadastro" }).count()) === 0,
  );
  await page.locator("a", { hasText: "Voltar para Minha conta" }).click();
  await page.waitForFunction(() => location.hash === "#/minha-conta", null, { timeout: 8000 }).catch(() => {});
  checar("o link volta para a Minha conta", (await page.evaluate(() => location.hash)) === "#/minha-conta");

  titulo("E / 2FA na Minha conta do aluno");
  await page.goto(`${APP}/minha-conta`);
  await page.click("button:has-text('Ativar')");
  await page.locator("img[alt*='QR code']").waitFor();
  checar("QR code gerado aparece na tela", (await page.locator("img[alt*='QR code']").getAttribute("src"))?.startsWith("data:image/png"));
  await page.click("button:has-text('Confirmar e ativar')");
  checar("confirmar sem o código: campo marcado com mensagem", (await invalido(page, "#codigo")) && (await temTexto(page, "Digite os 6 dígitos")));
  await page.click("button:has-text('Cancelar')");

  titulo("Alterar senha na Minha conta (aluna)");
  const SENHA_TROCADA_UI = "Trocada@Aluna456";
  const formSenha = page.locator("form.alterar-senha-form");
  checar(
    "seção \"Alterar senha\" com senha atual, nova, confirmação e o botão de mostrar/ocultar em cada uma",
    (await temTexto(page, "Alterar senha")) &&
      (await page.locator("#senhaAtual").count()) === 1 &&
      (await page.locator("#novaSenha").count()) === 1 &&
      (await page.locator("#confirmacaoSenha").count()) === 1 &&
      (await formSenha.locator(".password-toggle").count()) === 3 &&
      (await page.locator("#codigoTroca").count()) === 0,
  );
  await formSenha.locator("button[type=submit]").click();
  checar(
    "enviar vazio marca os três campos e foca a senha atual",
    (await invalido(page, "#senhaAtual")) && (await invalido(page, "#novaSenha")) && (await invalido(page, "#confirmacaoSenha")) && (await idAtivo(page)) === "senhaAtual",
    await idAtivo(page),
  );
  await page.fill("#novaSenha", "abc");
  const okParcial = await formSenha.locator(".requisitos-senha li.requisito-ok").count();
  await page.fill("#novaSenha", SENHA_TROCADA_UI);
  const okTotal = await formSenha.locator(".requisitos-senha li.requisito-ok").count();
  checar("lista de requisitos marca conforme digita", okParcial === 0 && okTotal === 4, `${okParcial} -> ${okTotal}`);
  await page.fill("#senhaAtual", "Errada@Senha000");
  await page.fill("#confirmacaoSenha", SENHA_TROCADA_UI);
  await formSenha.locator("button[type=submit]").click();
  checar(
    "pede confirmação antes de trocar",
    await temTexto(page, "Tem certeza que deseja alterar sua senha? As outras sessões abertas serão encerradas."),
  );
  await page.locator(".modal button:has-text('Alterar senha')").click();
  await page.getByText("Senha atual ou código incorretos.").first().waitFor({ timeout: 8000 }).catch(() => {});
  checar("senha atual errada: mensagem genérica embaixo do campo", (await temTexto(page, "Senha atual ou código incorretos.")) && (await invalido(page, "#senhaAtual")));
  await page.fill("#senhaAtual", SENHA_ALUNA);
  await formSenha.locator("button[type=submit]").click();
  await page.locator(".modal button:has-text('Alterar senha')").click();
  checar("troca confirmada: aviso de sucesso", await esperarToast(page, "Senha alterada."));
  checar(
    "campos limpos e a aluna continua logada na Minha conta",
    (await page.inputValue("#senhaAtual")) === "" &&
      (await page.inputValue("#novaSenha")) === "" &&
      (await page.inputValue("#confirmacaoSenha")) === "" &&
      (await page.evaluate(() => location.hash)) === "#/minha-conta",
  );
  // F5: a sessao nova vale e a pessoa fica na mesma pagina (antes o recarregamento passava pelo login e caia no inicio)
  await page.reload();
  await page.locator("#senhaAtual").waitFor({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1000);
  checar(
    "F5 na Minha conta: continua logada e na mesma página, com a sessão devolvida",
    (await page.evaluate(() => location.hash)) === "#/minha-conta" && (await page.locator("#senhaAtual").count()) === 1,
    await page.evaluate(() => location.hash),
  );
  await sair(page);
  await page.goto(`${APP}/login`);
  await page.fill("#emailLogin", emailAluno);
  await page.fill("#senha", SENHA_ALUNA);
  await page.click("button[type=submit]");
  await page.getByText("E-mail ou senha inválidos.").first().waitFor({ timeout: 8000 }).catch(() => {});
  checar("a senha antiga não entra mais", await temTexto(page, "E-mail ou senha inválidos."));
  await entrar(page, emailAluno, SENHA_TROCADA_UI);
  checar("sair e entrar com a senha nova funciona", !(await page.evaluate(() => location.hash)).startsWith("#/login"));
  // volta a senha original pela API (o resto do teste usa SENHA_ALUNA) e entra de novo: a troca encerra a sessão da tela
  await sair(page);
  const voltaSenha = await api("POST", "/auth/alterar-senha", await tokenDe(emailAluno, SENHA_TROCADA_UI), {
    senhaAtual: SENHA_TROCADA_UI,
    novaSenha: SENHA_ALUNA,
    confirmacaoSenha: SENHA_ALUNA,
  });
  checar("senha original de volta pela API", voltaSenha.status === 200, JSON.stringify(voltaSenha.corpo));
  await entrar(page, emailAluno, SENHA_ALUNA);

  // ---------------------------------------------------------------- RF026: direitos do titular
  titulo("Meus dados do aluno e reprovação no questionário (RF026)");
  // evento em que a aluna fica abaixo de 60% nas duas tentativas (sala propria, sem conflito de horario):
  // sem terceira chance, o certificado desse evento nao sai mais
  const tokenAluna = await tokenDe(emailAluno, SENHA_ALUNA);
  const salaReprovado = await api("POST", "/salas", tokenSecretaria, { nome: codigoDeSala(), tipo: "SALA_DE_AULA", capacidade: 10 });
  const tituloReprovado = `Evento Reprovado UI ${sufixo}`;
  // 3 horas atras: o "Evento UI" da aluna comeca daqui a pouco e ela nao pode estar em dois eventos no mesmo horario.
  // A secretaria faz a inscricao retroativa e o check-in continua aberto (vai ate 24 h depois do fim)
  const eventoReprovado = await api("POST", "/eventos", tokenSecretaria, {
    titulo: tituloReprovado, horario: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), salaId: salaReprovado.corpo.id, palestranteId: palestrante.corpo.id, tema: "Tema", cargaHoraria: 1, questionario: questionario(),
  });
  const meDaAluna = await api("GET", "/usuarios/me", tokenAluna);
  const inscricaoReprovado = await api("POST", "/inscricoes", tokenSecretaria, { participanteId: meDaAluna.corpo.participanteId, eventoId: eventoReprovado.corpo.id });
  if (inscricaoReprovado.status !== 201) throw new Error(`inscrição no evento reprovado falhou: ${JSON.stringify(inscricaoReprovado.corpo)}`);
  // check-in pelo fluxo novo: a aluna pede e a secretaria aprova
  await api("POST", `/eventos/${eventoReprovado.corpo.id}/checkin`, tokenAluna);
  await api("POST", `/checkin/inscricoes/${inscricaoReprovado.corpo.id}/aprovar`, tokenSecretaria);
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

  // ---------------------------------------------------------------- etapa 3B
  titulo("Proposta de alteração, questionário travado e inativação do professor");
  const emailProfessor = `ui-professor-${sufixo}@umc.br`;
  const nomeProfessor = `Professor Interface ${tag}`;
  const SENHA_PROFESSOR = "Senha@Prof123";
  const professorCriado = await api("POST", "/equipe", tokenSecretaria, { nomeCompleto: nomeProfessor, email: emailProfessor });

  // o professor ativa a conta pelo link do convite (fora de producao, a API devolve o link: linkConviteDemo)
  await page.goto(`${APP}/primeiro-acesso`);
  await page.getByText("Use o link enviado para o seu e-mail.").waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "primeiro acesso sem convite: só a mensagem, sem formulário",
    (await temTexto(page, "Use o link enviado para o seu e-mail. Se ele venceu, peça um novo convite a quem criou a sua conta.")) &&
      (await page.locator("form").count()) === 0 &&
      (await page.locator("input").count()) === 0,
  );
  await page.goto(`${APP}/primeiro-acesso?convite=chave-que-nao-existe`);
  await page.getByText("Use o link enviado para o seu e-mail.").waitFor({ timeout: 8000 }).catch(() => {});
  checar("convite inválido: a mesma mensagem, sem formulário", (await temTexto(page, "Se ele venceu, peça um novo convite a quem criou a sua conta.")) && (await page.locator("form").count()) === 0);
  const linkConvite = professorCriado.corpo.linkConviteDemo ?? "";
  checar("o link do convite leva a chave depois do #", /^http:\/\/localhost:5173\/#\/primeiro-acesso\?convite=[A-Za-z0-9_-]{43}$/.test(linkConvite), linkConvite);
  await page.goto(linkConvite);
  await page.locator("#email[readonly]").waitFor({ timeout: 10000 }).catch(() => {});
  checar(
    "o link abre a tela com o e-mail da conta (só leitura) e pede só a senha e o aceite",
    (await page.inputValue("#email").catch(() => "")) === emailProfessor &&
      (await page.locator("#email[readonly]").count()) === 1 &&
      (await page.locator("#novaSenha").count()) === 1 &&
      (await page.locator("#confirmarSenha").count()) === 1 &&
      (await page.locator("input[name=aceiteLgpd]").count()) === 1 &&
      (await page.locator(".requisitos-senha").count()) === 1 &&
      (await page.locator("form input").count()) === 4 &&
      !(await temTexto(page, "código")),
    await page.locator(".login-card").innerText().catch(() => ""),
  );
  checar("a chave some do endereço assim que a tela lê o convite", !page.url().includes("convite") && page.url().endsWith("#/primeiro-acesso"), page.url());
  await page.fill("#novaSenha", SENHA_PROFESSOR);
  await page.fill("#confirmarSenha", SENHA_PROFESSOR);
  await page.check("input[name=aceiteLgpd]");
  await page.click("button[type=submit]");
  checar("ativar a conta leva ao login com o aviso", await esperarToast(page, "Conta ativada. Entre com seu e-mail e a nova senha."));
  await page.waitForFunction(() => location.hash.startsWith("#/login"), null, { timeout: 8000 }).catch(() => {});
  checar("depois de ativar, a tela é a do login", (await page.evaluate(() => location.hash)).startsWith("#/login"));
  const tokenProfessor = await tokenDe(emailProfessor, SENHA_PROFESSOR);
  const codigoSalaProposta = codigoDeSala();
  const salaProposta = await api("POST", "/salas", tokenSecretaria, { nome: codigoSalaProposta, tipo: "SALA_DE_AULA", capacidade: 50 });
  const daquiDezDias = new Date(Math.ceil((Date.now() + 10 * 24 * 3600 * 1000) / 3600000) * 3600000).toISOString();
  const tituloDoProfessor = `Evento do Professor UI ${sufixo}`;
  const eventoProfessor = await api("POST", "/eventos", tokenProfessor, {
    titulo: tituloDoProfessor, horario: daquiDezDias, salaId: sala.corpo.id, palestranteId: palestrante.corpo.id, tema: "Tema", cargaHoraria: 2, questionario: questionario(),
  });
  await api("POST", `/eventos/${eventoProfessor.corpo.id}/aprovar`, tokenSecretaria);
  const propostaApi = await api("PUT", `/eventos/${eventoProfessor.corpo.id}`, tokenProfessor, { salaId: salaProposta.corpo.id });
  checar("a troca de sala do professor num evento aprovado vira proposta (API)", propostaApi.corpo?.proposta?.situacao === "PENDENTE", JSON.stringify(propostaApi.corpo));

  await entrar(page, secretaria.email, secretaria.senha);
  await page.goto(`${APP}/eventos`);
  await page.locator("select[aria-label='Filtrar por situação']").selectOption("PENDENTE");
  const linhaProposta = page.locator("tr", { hasText: tituloDoProfessor });
  await linhaProposta.waitFor();
  checar(
    "\"Aguardando aprovação\" mostra a proposta do evento aprovado, com antes → depois",
    (await linhaProposta.locator(".badge", { hasText: "Alteração aguardando aprovação" }).count()) === 1 &&
      (await linhaProposta.locator(".proposta-mudancas").innerText()).includes(`${codigoSalaProposta} · Sala de aula`),
  );
  await linhaProposta.locator("button", { hasText: "Aprovar alteração" }).click();
  const confirmaAprovacao = page.locator(".modal", { hasText: "Tem certeza que deseja aprovar a alteração" });
  await confirmaAprovacao.waitFor();
  checar("a confirmação da aprovação mostra o que muda", (await confirmaAprovacao.locator(".proposta-mudancas").count()) === 1);
  await confirmaAprovacao.locator("button", { hasText: "Aprovar" }).click();
  checar("aprovar avisa que a alteração foi aprovada", await esperarToast(page, "Alteração aprovada"));
  await page.locator("select[aria-label='Filtrar por situação']").selectOption("");
  await page.fill("input[aria-label='Buscar eventos']", tituloDoProfessor);
  const linhaAprovada = page.locator(".resultados-eventos tr", { hasText: tituloDoProfessor });
  await linhaAprovada.waitFor();
  await linhaAprovada.locator(".proposta-resumo").waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  checar(
    "depois de aprovada, o evento aparece na sala nova e sem proposta",
    (await linhaAprovada.innerText()).includes(`${codigoSalaProposta} · Sala de aula`) && (await linhaAprovada.locator(".proposta-resumo").count()) === 0,
  );

  // o "Evento UI" ja foi respondido pela aluna na secao do questionario
  await page.fill("input[aria-label='Buscar eventos']", `Evento UI ${sufixo}`);
  const linhaEventoRespondido = page.locator(".resultados-eventos tr").filter({ has: page.locator("td", { hasText: new RegExp(`^Evento UI ${sufixo}$`) }) });
  await linhaEventoRespondido.waitFor();
  await linhaEventoRespondido.locator("button", { hasText: "Editar" }).click();
  const construtor = page.locator("fieldset.questionario-builder");
  await construtor.waitFor();
  checar(
    "evento com respostas: questionário travado, só para leitura",
    // o Playwright nao trata o fieldset como controle: confere os campos de dentro (desabilitados por ele)
    (await temTexto(page, "Questionário travado: já há respostas de alunos.")) &&
      (await construtor.locator("input").first().isDisabled()) &&
      (await construtor.locator("input").last().isDisabled()),
  );
  await page.locator(".modal .modal-footer button", { hasText: "Cancelar" }).click();

  // o endereco antigo da tela leva para a Equipe
  await page.goto(`${APP}/professores`);
  await page.waitForFunction(() => location.hash === "#/equipe", null, { timeout: 8000 }).catch(() => {});
  checar(
    "a aba Professores virou Equipe (e /professores leva para lá)",
    (await page.evaluate(() => location.hash)) === "#/equipe" &&
      (await page.locator("a.nav-link", { hasText: "Equipe" }).count()) === 1 &&
      (await page.locator("a.nav-link", { hasText: "Professores" }).count()) === 0,
    await page.evaluate(() => location.hash),
  );
  const linhaProfessor = page.locator("tr", { hasText: nomeProfessor });
  await linhaProfessor.waitFor();
  await linhaProfessor.locator("button", { hasText: "Inativar" }).click();
  const modalInativar = page.locator(".modal", { hasText: "Motivo da inativação" });
  await modalInativar.locator(".lista-eventos-em-aberto li").first().waitFor();
  checar("inativar lista os eventos em aberto do professor", (await modalInativar.locator(".lista-eventos-em-aberto li", { hasText: tituloDoProfessor }).count()) === 1);
  await modalInativar.locator("button[type=submit]").click();
  checar(
    "sem motivo e sem destino: os dois campos avisam",
    (await temTexto(page, "Informe o motivo da inativação.")) && (await temTexto(page, "Escolha para quem vão os eventos em aberto.")),
  );
  await modalInativar.locator("#motivo").fill("Teste de interface");
  await modalInativar.locator("#transferirPara").selectOption("EQUIPE");
  await modalInativar.locator("button[type=submit]").click();
  await page.locator(".modal", { hasText: "Tem certeza que deseja inativar" }).locator("button", { hasText: "Inativar" }).click();
  checar("inativar transfere o evento para a equipe e avisa", await esperarToast(page, "1 evento(s) transferido(s) para a equipe"));
  await linhaProfessor.locator(".badge", { hasText: "Inativo" }).waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "a lista mostra o professor inativo, com o motivo e o botão Reativar",
    (await linhaProfessor.locator(".badge", { hasText: "Inativo" }).count()) === 1 &&
      (await linhaProfessor.innerText()).includes("Teste de interface") &&
      (await linhaProfessor.locator("button", { hasText: "Reativar" }).count()) === 1,
  );
  const loginDoInativo = await api("POST", "/auth/login", undefined, { emailLogin: emailProfessor, senha: SENHA_PROFESSOR });
  checar("o professor inativo não entra (API: 403)", loginDoInativo.status === 403, loginDoInativo.status);
  await linhaProfessor.locator("button", { hasText: "Reativar" }).click();
  await page.locator(".modal", { hasText: "Reativar a conta" }).locator("button", { hasText: "Reativar" }).click();
  checar("reativar devolve o acesso", await esperarToast(page, "Conta reativada"));
  await page.click("button:has-text('+ Nova conta')");
  checar("para a secretaria, o modal não oferece o perfil Secretaria", (await page.locator(".modal select#perfil").count()) === 0);
  await page.click(".modal button:has-text('Cancelar')");
  const linhaSecretariaDemo = page.locator("tr", { hasText: "Secretaria" }).filter({ hasNotText: "Professor" });
  checar(
    "a secretaria vê as outras secretarias sem ações",
    (await linhaSecretariaDemo.count()) === 0 || (await linhaSecretariaDemo.first().locator("button").count()) === 0,
  );
  await sair(page);

  titulo("Equipe: o administrador cria uma secretaria por convite e exclui a conta pendente");
  await entrar(page, admin.email, admin.senha);
  await page.goto(`${APP}/equipe`);
  await page.locator("table tbody tr").first().waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "a lista tem nome, e-mail, perfil, situação e o filtro por perfil",
    (await page.locator("table thead th").allTextContents()).map((t) => t.trim()).slice(0, 4).join("|") === "Nome|E-mail|Perfil|Situação" &&
      (await page.locator("select[aria-label='Filtrar por perfil']").count()) === 1,
  );
  await page.click("button:has-text('+ Nova conta')");
  checar("para o administrador, o modal oferece Professor e Secretaria", (await page.locator(".modal select#perfil option").allInnerTexts()).join("|") === "Professor|Secretaria");
  const nomeSecretariaUi = `Secretaria Interface ${tag}`;
  await page.selectOption("#perfil", "SECRETARIA");
  await page.fill("#nomeCompleto", nomeSecretariaUi);
  await page.fill("#email", `ui-secretaria-${sufixo}@umc.br`);
  await page.click(".modal button[type=submit]");
  checar("conta de secretaria criada, com o convite por e-mail", await esperarToast(page, "Conta criada."));
  const linhaSecretariaUi = page.locator("tr", { hasText: nomeSecretariaUi });
  await linhaSecretariaUi.waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "a linha mostra Secretaria, Convite pendente e as ações (reenviar, inativar, excluir)",
    (await linhaSecretariaUi.innerText()).includes("Secretaria") &&
      (await linhaSecretariaUi.innerText()).includes("Convite pendente") &&
      (await linhaSecretariaUi.locator("button", { hasText: "Reenviar convite" }).count()) === 1 &&
      (await linhaSecretariaUi.locator("button", { hasText: "Excluir" }).count()) === 1,
  );
  await page.selectOption("select[aria-label='Filtrar por perfil']", "SECRETARIA");
  const perfisNaLista = await page.locator("table tbody tr td:nth-child(3)").allInnerTexts();
  checar("filtro por perfil: só secretarias", perfisNaLista.length > 0 && perfisNaLista.every((p) => p.trim() === "Secretaria"), perfisNaLista.join("|"));
  checar("a própria conta do administrador não aparece na lista", !(await page.locator("table").innerText()).includes(admin.email));
  await linhaSecretariaUi.locator("button", { hasText: "Excluir" }).click();
  checar("excluir pede confirmação, explicando o convite pendente", await temTexto(page, "Ela ainda não foi ativada: a conta e o convite pendente são apagados"));
  await page.locator(".modal button", { hasText: "Excluir" }).click();
  checar("conta pendente excluída", await esperarToast(page, "Conta excluída."));
  await linhaSecretariaUi.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  checar("a linha sai da lista", (await linhaSecretariaUi.count()) === 0);
  await sair(page);

  // ---------------------------------------------------------------- etapa 5
  titulo("Calendário de eventos (equipe e professor)");
  const chaveDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const nomeMes = (d) => {
    const texto = new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  };
  const irAoMes = async (d) => {
    for (let i = 0; i < 24 && (await page.locator(".calendario-titulo").innerText()) !== nomeMes(d); i++) {
      await page.click("button[aria-label='Próximo mês']");
    }
  };
  const tokenSecretariaCal = await tokenDe(secretaria.email, secretaria.senha);
  // evento de hoje (comeca em 5 min, antes dos outros de hoje; check-in aberto) com um pedido de check-in da aluna esperando aprovacao
  const tituloCheckinCal = `Evento Cal UI ${sufixo}`;
  const eventoCal = await api("POST", "/eventos", tokenSecretariaCal, {
    titulo: tituloCheckinCal, horario: new Date(Date.now() + 5 * 60 * 1000).toISOString(), salaId: salaProposta.corpo.id, palestranteId: palestrante.corpo.id, tema: "Tema", cargaHoraria: 1, questionario: questionario(),
  });
  // o pedido vem de um aluno so desta secao: a aluna principal ja esta no "Evento UI", no mesmo horario, e a API nao
  // deixa ninguem ficar inscrito em dois eventos que se cruzam
  const NOME_ALUNO_CAL = `Aluno Calendario ${tag}`;
  const emailAlunoCal = `ui.cal.${sufixo}@alunos.umc.br`;
  const inicioCal = await api("POST", "/auth/registro", undefined, {
    nomeCompleto: NOME_ALUNO_CAL, rgm: `7${String(Date.now()).slice(-10)}`, emailInstitucional: emailAlunoCal, senha: SENHA_ALUNO2, aceiteLgpd: true,
  });
  const cadastroCal = await api("POST", "/auth/registro/confirmar", undefined, { emailInstitucional: emailAlunoCal, codigo: inicioCal.corpo?.codigoDemo });
  if (cadastroCal.status !== 201) throw new Error(`cadastro do aluno do calendário falhou: ${JSON.stringify(cadastroCal.corpo)}`);
  const tokenAlunaCal = await tokenDe(emailAlunoCal, SENHA_ALUNO2);
  await api("POST", `/eventos/${eventoCal.corpo.id}/inscricoes`, tokenAlunaCal);
  await api("POST", `/eventos/${eventoCal.corpo.id}/checkin`, tokenAlunaCal);
  // evento da equipe daqui a 40 dias (outro mes, ou perto disso): pra busca e pro "Sala ocupada" do professor
  const daqui40 = new Date(Date.now() + 40 * 24 * 3600 * 1000);
  daqui40.setHours(10, 0, 0, 0);
  const tituloFuturoCal = `Evento Futuro Cal UI ${sufixo}`;
  await api("POST", "/eventos", tokenSecretariaCal, {
    titulo: tituloFuturoCal, horario: daqui40.toISOString(), salaId: salaProposta.corpo.id, palestranteId: palestrante.corpo.id, tema: "Tema", cargaHoraria: 2, questionario: questionario(),
  });

  await entrar(page, secretaria.email, secretaria.senha);
  await page.goto(`${APP}/eventos`);
  await page.locator(".calendario-dia.hoje").waitFor();
  const hojeCal = new Date();
  checar(
    "abre no mês atual, com o nome do mês e o dia de hoje destacado",
    (await page.locator(".calendario-titulo").innerText()) === nomeMes(hojeCal) &&
      (await page.locator(`.calendario-dia.hoje[data-dia="${chaveDia(hojeCal)}"]`).count()) === 1 &&
      (await page.locator(".calendario-semana").first().innerText()).toLowerCase() === "dom",
  );
  const chipCheckin = page.locator(".calendario-dia.hoje .cal-chip", { hasText: tituloCheckinCal });
  await chipCheckin.waitFor({ timeout: 8000 }).catch(() => {});
  // com mais de 3 eventos no dia (outros dados do banco de dev), o chip fica atras do "+N": ai a marcacao e
  // conferida no proprio "+N" e, logo abaixo, na lista do dia
  const maisNoDia = page.locator(".calendario-dia.hoje .calendario-mais");
  checar(
    "o evento aparece no dia com horário, título e a marcação \"1 check-in\" (ou no \"+N\" do dia cheio)",
    (await chipCheckin.count()) === 1
      ? (await chipCheckin.innerText()).includes("1 check-in") && ((await chipCheckin.getAttribute("title")) ?? "").includes("esperando aprovação")
      : (await maisNoDia.count()) === 1 && /^\+\d+$/.test((await maisNoDia.innerText()).trim()),
    (await chipCheckin.count()) ? await chipCheckin.innerText() : await page.locator(".calendario-dia.hoje").innerText(),
  );
  await page.locator(".calendario-dia.hoje").click();
  const itemDoDia = page.locator(".calendario-lista .calendario-evento", { hasText: tituloCheckinCal });
  await itemDoDia.waitFor();
  checar(
    "clicar no dia mostra a lista dos eventos dele, com os detalhes e as ações",
    (await page.locator(".calendario-lista .calendario-evento", { hasText: `Evento UI ${sufixo}` }).count()) === 1 &&
      (await itemDoDia.innerText()).includes("1 check-in esperando aprovação") &&
      (await itemDoDia.locator("button", { hasText: "Editar" }).count()) === 1,
  );
  await itemDoDia.locator("button", { hasText: "Check-ins" }).click();
  const modalCheckinsCal = page.locator(".modal", { hasText: `Check-ins de ${tituloCheckinCal}` });
  await modalCheckinsCal.locator(".painel-checkins tr", { hasText: NOME_ALUNO_CAL }).waitFor({ timeout: 8000 }).catch(() => {});
  checar("os Check-ins abrem pelo calendário, com o pedido do aluno", (await modalCheckinsCal.locator(".painel-checkins tr", { hasText: NOME_ALUNO_CAL }).count()) === 1);
  await modalCheckinsCal.locator("button[aria-label='Fechar']").click();

  await page.click("button[aria-label='Próximo mês']");
  const proximoMes = new Date(hojeCal.getFullYear(), hojeCal.getMonth() + 1, 1);
  checar("a seta leva ao próximo mês", (await page.locator(".calendario-titulo").innerText()) === nomeMes(proximoMes));
  await page.click("button[aria-label='Mês anterior']");
  await page.click("button[aria-label='Mês anterior']");
  const mesAnterior = new Date(hojeCal.getFullYear(), hojeCal.getMonth() - 1, 1);
  checar("a outra seta volta ao mês anterior", (await page.locator(".calendario-titulo").innerText()) === nomeMes(mesAnterior));
  await page.click(".calendario-topo button:has-text('Hoje')");
  checar("\"Hoje\" volta ao mês atual", (await page.locator(".calendario-titulo").innerText()) === nomeMes(hojeCal));

  // um dia vazio no futuro (o dia seguinte ao evento de daqui a 40 dias, so do teste)
  const diaVazio = new Date(daqui40.getFullYear(), daqui40.getMonth(), daqui40.getDate() + 1);
  await irAoMes(diaVazio);
  await page.locator(`.calendario-dia[data-dia="${chaveDia(diaVazio)}"]`).click();
  const modalNovo = page.locator(".modal", { hasText: "Novo evento" });
  await modalNovo.waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "clicar num dia vazio do futuro abre o cadastro com a data preenchida",
    (await modalNovo.count()) === 1 && (await page.inputValue(".modal #horario")).startsWith(`${chaveDia(diaVazio)}T`),
    (await modalNovo.count()) ? await page.inputValue(".modal #horario") : "modal não abriu",
  );
  await page.click(".modal button:has-text('Cancelar')");
  await page.click(".calendario-topo button:has-text('Hoje')");
  const ontemCal = new Date(hojeCal.getFullYear(), hojeCal.getMonth(), hojeCal.getDate() - 1);
  if (ontemCal.getMonth() === hojeCal.getMonth()) {
    await page.locator(`.calendario-dia[data-dia="${chaveDia(ontemCal)}"]`).click();
    checar("dia passado não abre o cadastro", (await page.locator(".modal", { hasText: "Novo evento" }).count()) === 0);
  }

  await page.fill("input[aria-label='Buscar eventos']", tituloFuturoCal);
  const resultadoFuturo = page.locator(".resultados-eventos tr", { hasText: tituloFuturoCal });
  await resultadoFuturo.waitFor();
  checar("a busca mostra o resultado em lista, com data e horário", (await resultadoFuturo.innerText()).includes(daqui40.toLocaleDateString("pt-BR")));
  await resultadoFuturo.locator("button", { hasText: tituloFuturoCal }).click();
  // o mes do evento ainda carrega da API depois do clique
  await page.locator(".calendario-lista .calendario-evento", { hasText: tituloFuturoCal }).waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "clicar no resultado leva o calendário ao mês e ao dia do evento",
    (await page.locator(".calendario-titulo").innerText()) === nomeMes(daqui40) &&
      (await page.locator(`.calendario-dia.selecionado[data-dia="${chaveDia(daqui40)}"]`).count()) === 1 &&
      (await page.locator(".calendario-lista .calendario-evento", { hasText: tituloFuturoCal }).count()) === 1,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.click(".calendario-topo button:has-text('Hoje')");
  await page.locator(".calendario-dia.hoje .calendario-marcador").waitFor({ timeout: 8000 }).catch(() => {});
  const larguras = await page.evaluate(() => ({ documento: document.documentElement.scrollWidth, janela: window.innerWidth }));
  checar(
    "no celular: sem rolagem lateral, um marcador por dia com evento e a lista do dia embaixo da grade",
    larguras.documento <= larguras.janela &&
      (await page.locator(".calendario-dia.hoje .calendario-marcador").isVisible()) &&
      !(await page.locator(".calendario-dia.hoje .cal-chip").first().isVisible()) &&
      ((await page.locator(".calendario-lista").boundingBox())?.y ?? 0) > ((await page.locator(".calendario-grade").boundingBox())?.y ?? 0),
    larguras,
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await sair(page);

  await entrar(page, emailProfessor, SENHA_PROFESSOR);
  await page.goto(`${APP}/eventos`);
  await page.locator(".calendario-titulo").waitFor();
  await irAoMes(daqui40);
  const diaOcupado = page.locator(`.calendario-dia[data-dia="${chaveDia(daqui40)}"]`);
  await diaOcupado.locator(".cal-chip").first().waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "professor: o evento de outro aparece só como \"Sala ocupada\", sem título",
    (await diaOcupado.locator(".cal-chip.ocupada", { hasText: "Sala ocupada" }).count()) === 1 && !(await diaOcupado.innerText()).includes(tituloFuturoCal),
    await diaOcupado.innerText(),
  );
  await diaOcupado.click();
  const ocupadaNaLista = page.locator(".calendario-lista .calendario-evento.ocupada");
  await ocupadaNaLista.first().waitFor({ timeout: 8000 }).catch(() => {});
  checar(
    "na lista do dia: sala, início e fim, sem título, palestrante nem ações",
    (await ocupadaNaLista.count()) === 1 &&
      (await ocupadaNaLista.innerText()).includes(`${codigoSalaProposta} · Sala de aula`) &&
      (await ocupadaNaLista.innerText()).includes("10:00 às 12:00") &&
      !(await page.locator(".calendario-lista").innerText()).includes(tituloFuturoCal) &&
      !(await page.locator(".calendario-lista").innerText()).includes("Palestrante Fluxo") &&
      (await ocupadaNaLista.locator("button").count()) === 0,
    (await ocupadaNaLista.count()) ? await ocupadaNaLista.innerText() : "não encontrado",
  );
  await sair(page);

  titulo("Professor sem Certificados e Avaliações; aviso de recusa com X; Excluir do palestrante pendente");
  {
    const tokenProfessorAviso = await tokenDe(emailProfessor, SENHA_PROFESSOR);
    const palestranteDoProfessorUi = async (rotulo) =>
      (
        await api("POST", "/palestrantes", tokenProfessorAviso, {
          nome: `Palestrante ${rotulo} Interface`,
          email: `ui-pal-${rotulo.toLowerCase()}-${sufixo}@teste.invalido`,
        })
      ).corpo;
    const recusarPalestranteUi = (id) => api("POST", `/palestrantes/${id}/recusar`, tokenSecretaria, { motivo: "Faltou o currículo do palestrante" });
    const palestranteRecusadoUi = await palestranteDoProfessorUi("Recusado");
    await recusarPalestranteUi(palestranteRecusadoUi.id);
    await palestranteDoProfessorUi("Aguardando");
    // cada troca de tela recarrega os contadores; espera a resposta (e a tela redesenhar) antes de conferir o aviso
    const contadoresDaTela = () =>
      page
        .waitForResponse((resposta) => resposta.url().includes("/aprovacoes/contadores"), { timeout: 8000 })
        .then(() => page.waitForTimeout(300))
        .catch(() => null);

    await entrar(page, emailProfessor, SENHA_PROFESSOR);
    const aviso = page.locator(".aviso-recusados");
    await aviso.waitFor({ timeout: 8000 }).catch(() => {});
    const abasDoProfessor = await page.locator("a.nav-link").allInnerTexts();
    checar(
      "professor: o menu não tem Certificados nem Avaliações",
      abasDoProfessor.length > 0 && !abasDoProfessor.some((aba) => aba.includes("Certificados") || aba.includes("Avaliações")),
      abasDoProfessor.join(" | "),
    );
    checar("o aviso de recusa aparece com o X (Fechar aviso)", (await aviso.count()) === 1 && (await aviso.locator("button[aria-label='Fechar aviso']").count()) === 1);
    await aviso.locator("button[aria-label='Fechar aviso']").click();
    checar("o X fecha o aviso", (await page.locator(".aviso-recusados").count()) === 0);
    let recarga = contadoresDaTela();
    await page.locator("a.nav-link", { hasText: "Palestrantes" }).click();
    await recarga;
    checar("fechado, o aviso continua fechado ao trocar de tela", (await page.locator(".aviso-recusados").count()) === 0);
    recarga = contadoresDaTela();
    await page.reload();
    await recarga;
    checar("e continua fechado depois de recarregar a página", (await page.locator(".aviso-recusados").count()) === 0);

    await page.goto(`${APP}/certificados`);
    await page.waitForURL((url) => !url.hash.includes("certificados"), { timeout: 8000 }).catch(() => {});
    checar("o professor que digita /certificados volta para o Dashboard", page.url().endsWith("#/"), page.url());
    await page.goto(`${APP}/feedback`);
    await page.waitForURL((url) => !url.hash.includes("feedback"), { timeout: 8000 }).catch(() => {});
    checar("e /feedback também", page.url().endsWith("#/"), page.url());
    await page.getByText("Dados dos seus eventos").waitFor({ timeout: 8000 }).catch(() => {});
    checar(
      "o Dashboard do professor avisa que os dados são dos eventos dele, sem certificados nem avaliações",
      (await temTexto(page, "Dados dos seus eventos")) && !(await temTexto(page, "Certificados liberados")) && !(await temTexto(page, "Média do feedback")),
    );

    const outroRecusadoUi = await palestranteDoProfessorUi("Revisto");
    await recusarPalestranteUi(outroRecusadoUi.id);
    recarga = contadoresDaTela();
    await page.locator("a.nav-link", { hasText: "Eventos" }).click();
    await recarga;
    await page.locator(".aviso-recusados").waitFor({ timeout: 8000 }).catch(() => {});
    checar("uma recusa nova faz o aviso voltar", (await page.locator(".aviso-recusados").count()) === 1);
    await sair(page);

    await entrar(page, secretaria.email, secretaria.senha);
    await page.goto(`${APP}/palestrantes`);
    const linhaAguardandoUi = page.locator("tr", { hasText: "Palestrante Aguardando Interface" });
    await linhaAguardandoUi.waitFor({ timeout: 8000 }).catch(() => {});
    const excluirAguardando = linhaAguardandoUi.locator("button", { hasText: "Excluir" });
    checar(
      "Excluir desabilitado para palestrante aguardando aprovação, com a orientação no botão",
      (await excluirAguardando.count()) === 1 &&
        (await excluirAguardando.isDisabled()) &&
        (await excluirAguardando.getAttribute("title")) === "Aprove ou recuse este palestrante antes de excluir.",
    );
    const excluirRecusado = page.locator("tr", { hasText: "Palestrante Recusado Interface" }).locator("button", { hasText: "Excluir" });
    checar("palestrante recusado tem o Excluir habilitado", (await excluirRecusado.count()) === 1 && (await excluirRecusado.isEnabled()));
    await sair(page);
  }

  titulo("Cancelamento de evento pela equipe");
  {
    const tokenSecretariaCanc = await tokenDe(secretaria.email, secretaria.senha);
    const salaCanc = await api("POST", "/salas", tokenSecretariaCanc, { nome: codigoDeSala(), tipo: "SALA_DE_AULA", capacidade: 30 });
    const diaCanc = new Date(Date.now() + 25 * 24 * 3600 * 1000);
    diaCanc.setHours(10, 0, 0, 0);
    const tituloCanc = `Evento Cancelavel UI ${sufixo}`;
    const eventoCanc = await api("POST", "/eventos", tokenSecretariaCanc, {
      titulo: tituloCanc, horario: diaCanc.toISOString(), salaId: salaCanc.corpo.id, palestranteId: palestrante.corpo.id, tema: "Tema", cargaHoraria: 2, questionario: questionario(),
    });
    await api("POST", `/eventos/${eventoCanc.corpo.id}/inscricoes`, await tokenDe(emailAluno, SENHA_ALUNA));
    // evento do professor no mesmo dia: ele nao tem o botao de cancelar, nem no proprio evento
    const tokenProfessorCanc = await tokenDe(emailProfessor, SENHA_PROFESSOR);
    const tituloProfCanc = `Evento do Professor Sem Cancelar ${sufixo}`;
    const horarioProfCanc = new Date(diaCanc);
    horarioProfCanc.setHours(14, 0, 0, 0);
    const eventoProfCanc = await api("POST", "/eventos", tokenProfessorCanc, {
      titulo: tituloProfCanc, horario: horarioProfCanc.toISOString(), salaId: salaCanc.corpo.id, palestranteId: palestrante.corpo.id, tema: "Tema", cargaHoraria: 2, questionario: questionario(),
    });
    await api("POST", `/eventos/${eventoProfCanc.corpo.id}/aprovar`, tokenSecretariaCanc);
    const MOTIVO_UI = "O palestrante teve um imprevisto de saúde.";

    await entrar(page, secretaria.email, secretaria.senha);
    await page.goto(`${APP}/eventos`);
    await page.locator(".calendario-titulo").waitFor();
    await irAoMes(diaCanc);
    await page.locator(`.calendario-dia[data-dia="${chaveDia(diaCanc)}"]`).click();
    const itemCanc = page.locator(".calendario-lista .calendario-evento", { hasText: tituloCanc });
    await itemCanc.waitFor({ timeout: 8000 }).catch(() => {});
    await itemCanc.locator("button", { hasText: "Cancelar evento" }).click();
    const modalCanc = page.locator(".modal", { hasText: "Motivo do cancelamento" });
    await modalCanc.waitFor({ timeout: 8000 }).catch(() => {});
    const botaoCanc = modalCanc.locator("button[type=submit]", { hasText: "Cancelar evento" });
    checar(
      "o modal mostra o título, a data e quantos inscritos serão avisados, com o botão desativado sem motivo",
      (await modalCanc.innerText()).includes(tituloCanc) && (await modalCanc.innerText()).includes("1 inscrito será avisado") && (await botaoCanc.isDisabled()),
      await modalCanc.innerText().catch(() => ""),
    );
    await modalCanc.locator("textarea").fill("Curto");
    checar("com menos de 10 caracteres o botão continua desativado e o contador mostra 5/500", (await botaoCanc.isDisabled()) && (await modalCanc.innerText()).includes("5/500"));
    await modalCanc.locator("textarea").fill(MOTIVO_UI);
    checar("com o motivo completo o botão fica ativo", await botaoCanc.isEnabled());
    await botaoCanc.click();
    checar("pede confirmação antes de cancelar", await temTexto(page, "Esta ação não pode ser desfeita e todos os inscritos serão avisados por e-mail."));
    await page.locator(".modal button", { hasText: "Cancelar evento" }).click();
    checar("cancelar avisa quantos inscritos foram avisados por e-mail", await esperarToast(page, "Evento cancelado"));
    await itemCanc.locator(".badge", { hasText: "Cancelado" }).waitFor({ timeout: 8000 }).catch(() => {});
    checar(
      "no calendário: etiqueta Cancelado, título riscado, o motivo e quem cancelou, sem Editar, Excluir nem Cancelar",
      (await itemCanc.locator(".badge", { hasText: "Cancelado" }).count()) === 1 &&
        (await itemCanc.evaluate((el) => el.classList.contains("cancelado"))) &&
        (await itemCanc.innerText()).includes(MOTIVO_UI) &&
        (await itemCanc.innerText()).includes("Cancelado por") &&
        (await itemCanc.locator("button", { hasText: /Editar|Excluir|Cancelar evento/ }).count()) === 0,
      await itemCanc.innerText().catch(() => ""),
    );
    checar(
      "no dia do calendário o evento cancelado aparece com a marca de cancelado",
      (await page.locator(`.calendario-dia[data-dia="${chaveDia(diaCanc)}"] .cal-chip.cancelado`).count()) === 1,
    );
    await sair(page);

    await entrar(page, emailAluno, SENHA_ALUNA);
    await page.goto(`${APP}/eventos`);
    await page.locator(".evento-cartao").first().waitFor({ timeout: 10000 }).catch(() => {});
    checar("aluno: Abertas não mostra o evento cancelado", (await cartao(tituloCanc).count()) === 0);
    await page.check("input[name=opcaoEventos][value=INSCRITAS]");
    const cartaoCanc = cartao(tituloCanc).first();
    await cartaoCanc.waitFor({ timeout: 8000 }).catch(() => {});
    checar(
      "aluno: em Inscritas, a etiqueta Cancelado e o motivo, sem nenhum botão",
      (await cartaoCanc.locator(".badge", { hasText: "Cancelado" }).count()) === 1 &&
        (await cartaoCanc.innerText()).includes(MOTIVO_UI) &&
        (await cartaoCanc.locator("button").count()) === 0,
      await cartaoCanc.innerText().catch(() => ""),
    );
    await page.check("input[name=opcaoEventos][value=TODAS]");
    await cartao(tituloCanc).first().waitFor({ timeout: 8000 }).catch(() => {});
    checar("aluno: em Todas também aparece com a etiqueta Cancelado", (await cartao(tituloCanc).first().locator(".badge", { hasText: "Cancelado" }).count()) === 1);
    await sair(page);

    await entrar(page, emailProfessor, SENHA_PROFESSOR);
    await page.goto(`${APP}/eventos`);
    await page.locator(".calendario-titulo").waitFor();
    await irAoMes(diaCanc);
    await page.locator(`.calendario-dia[data-dia="${chaveDia(diaCanc)}"]`).click();
    const itemProfCanc = page.locator(".calendario-lista .calendario-evento", { hasText: tituloProfCanc });
    await itemProfCanc.waitFor({ timeout: 8000 }).catch(() => {});
    checar(
      "o professor não tem o botão Cancelar evento, nem no próprio evento aprovado",
      (await itemProfCanc.count()) === 1 && (await itemProfCanc.locator("button", { hasText: "Cancelar evento" }).count()) === 0,
    );
    checar(
      "o evento cancelado de outro não aparece para ele como Sala ocupada",
      (await page.locator(".calendario-lista .calendario-evento.ocupada", { hasText: salaCanc.corpo.nome }).count()) === 0,
    );
    await sair(page);
  }

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
