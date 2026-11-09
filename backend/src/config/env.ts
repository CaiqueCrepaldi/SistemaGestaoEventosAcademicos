import "dotenv/config";

// configuracao do backend, lida e conferida UMA vez, quando o servidor inicia. Variavel obrigatoria
// ausente, vazia, com valor de exemplo ou em formato errado derruba a inicializacao com uma mensagem
// que diz o nome da variavel e o que fazer — nunca o valor. Local: backend/.env (copiado do
// .env.example). Producao: painel da Vercel (Settings → Environment Variables), nunca no repositorio

const COMANDO_ENCRYPTION_KEY = `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`;
const COMANDO_JWT_SECRET = `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`;
const ONDE_FICA = "Coloque o valor no backend/.env (em produção, no painel da Vercel: Settings → Environment Variables).";

// valor de exemplo = qualquer valor com "troque" (TROQUE_POR_..., e o antigo troque-por-um-segredo-aleatorio)
export function ehValorDeExemplo(valor: string): boolean {
  return /troque/i.test(valor);
}

// "8h", "30m", "1d", "45s" ou so o numero de segundos ("28800"); null se o formato nao for nenhum desses
export function duracaoEmSegundos(duracao: string): number | null {
  const match = /^(\d+)([smhd])?$/.exec(duracao.trim());
  if (!match) return null;
  const multiplicadores: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const segundos = Number(match[1]) * multiplicadores[match[2] ?? "s"];
  return segundos > 0 ? segundos : null;
}

const problemas: string[] = [];

function obrigatoria(nome: string, comoGerar?: string): string {
  const valor = process.env[nome]?.trim();
  const dica = comoGerar ? ` Gere um valor com: ${comoGerar}` : "";
  if (!valor) {
    problemas.push(`${nome} está ausente ou vazia.${dica} ${ONDE_FICA}`);
    return "";
  }
  if (ehValorDeExemplo(valor)) {
    problemas.push(`${nome} ainda está com o valor de exemplo do .env.example.${dica} ${ONDE_FICA}`);
    return "";
  }
  return valor;
}

// AES-256: a chave precisa decodificar (base64) pra exatamente 32 bytes. Regra unica, conferida aqui
// na inicializacao (utils/criptografia.ts so usa a chave ja conferida). Trocar a chave depois de
// existir 2FA ativado invalida o 2FA e os codigos de recuperacao de todo mundo
function chaveDeCriptografia(): Buffer {
  const valor = obrigatoria("ENCRYPTION_KEY", COMANDO_ENCRYPTION_KEY);
  if (!valor) return Buffer.alloc(0);
  const chave = Buffer.from(valor, "base64");
  if (chave.length !== 32) {
    problemas.push(
      `ENCRYPTION_KEY precisa ser base64 de exatamente 32 bytes (AES-256). Gere uma chave com: ${COMANDO_ENCRYPTION_KEY} ${ONDE_FICA}`,
    );
  }
  return chave;
}

function porta(): number {
  const valor = process.env.PORT?.trim();
  if (!valor) return 8080;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || numero > 65535) {
    problemas.push("PORT precisa ser um número inteiro de 1 a 65535 (ex.: 8080).");
    return 8080;
  }
  return numero;
}

function expiracaoDoToken(): { texto: string; segundos: number } {
  const texto = process.env.JWT_EXPIRES_IN?.trim() || "8h";
  const segundos = duracaoEmSegundos(texto);
  if (segundos === null) {
    problemas.push('JWT_EXPIRES_IN precisa ser uma duração como "8h", "30m", "1d" ou o número de segundos (ex.: 28800).');
    return { texto, segundos: 8 * 3600 };
  }
  return { texto, segundos };
}

const isProduction = process.env.NODE_ENV === "production";
const expiracao = expiracaoDoToken();

// SendGrid e opcional: sem chave e remetente validos, o envio fica "simulado" (so um aviso no log,
// sem destinatario nem conteudo). Chave do SendGrid sempre comeca com "SG."
function sendgrid(): { apiKey: string | null; from: string | null } {
  const apiKey = process.env.SENDGRID_API_KEY?.trim() ?? "";
  const from = process.env.EMAIL_FROM?.trim() ?? "";
  const chaveValida = apiKey !== "" && !ehValorDeExemplo(apiKey) && apiKey.startsWith("SG.");
  const remetenteValido = from !== "" && !ehValorDeExemplo(from);
  if (chaveValida && remetenteValido) return { apiKey, from };

  const motivo = !chaveValida
    ? "SENDGRID_API_KEY ausente, com valor de exemplo ou sem o prefixo \"SG.\""
    : "EMAIL_FROM ausente ou com valor de exemplo";
  if (isProduction) {
    console.error(
      `[config] ${motivo}: os e-mails ficam simulados e NÃO são enviados. O cadastro de aluno não funciona sem e-mail ` +
        "(o código de confirmação não chega). Configure SENDGRID_API_KEY e EMAIL_FROM no painel da Vercel.",
    );
  } else {
    console.warn(`[config] ${motivo}: os e-mails ficam simulados (só um aviso no log, sem enviar).`);
  }
  return { apiKey: null, from: null };
}

// APP_URL: endereco do frontend (sem barra no fim), usado no link do convite do professor
// (APP_URL/#/primeiro-acesso?convite=...). Opcional pro servidor subir: sem ela (ou com valor de exemplo,
// formato invalido, ou localhost em producao), o servidor avisa e criar professor/reenviar convite sao
// recusados (sem endereco, o link do e-mail nao funcionaria)
function appUrl(): string | null {
  const valor = (process.env.APP_URL?.trim() ?? "").replace(/\/+$/, "");
  let motivo: string | null = null;
  if (!valor) motivo = "APP_URL ausente";
  else if (ehValorDeExemplo(valor)) motivo = "APP_URL ainda com o valor de exemplo";
  else {
    try {
      const url = new URL(valor);
      if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username) {
        motivo = "APP_URL em formato inválido (use http(s)://endereço, sem # nem ?)";
      } else if (isProduction && ["localhost", "127.0.0.1"].includes(url.hostname)) {
        motivo = "APP_URL aponta para localhost em produção";
      }
    } catch {
      motivo = "APP_URL em formato inválido (use http(s)://endereço, sem barra no fim)";
    }
  }
  if (!motivo) return valor;
  const aviso =
    `[config] ${motivo}: o convite do professor (link para criar a senha) não pode ser enviado; criar professor e ` +
    "reenviar convite ficam recusados. Configure APP_URL com o endereço do frontend, sem barra no fim (em produção, no painel da Vercel).";
  if (isProduction) console.error(aviso);
  else console.warn(aviso);
  return null;
}

const configuracao = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction,
  port: porta(),
  corsOrigin: process.env.CORS_ORIGIN?.trim() || "http://localhost:5173",

  databaseUrl: obrigatoria("DATABASE_URL"),

  jwtSecret: obrigatoria("JWT_SECRET", COMANDO_JWT_SECRET),
  // texto como veio (ex.: "8h") e ja convertido em segundos (o que o token e a resposta do login usam)
  jwtExpiresIn: expiracao.texto,
  jwtExpiresInSegundos: expiracao.segundos,

  // chave AES-256 ja decodificada e conferida: cifra o segredo do 2FA e assina o HMAC dos codigos de
  // recuperacao do 2FA e das chaves do limite de tentativas. Nunca trocar nem apagar
  chaveCriptografia: chaveDeCriptografia(),

  sendgrid: sendgrid(),

  // null = nao configurada: o convite do professor fica indisponivel (ver appUrl acima)
  appUrl: appUrl(),
};

if (problemas.length > 0) {
  throw new Error(
    `[config] O servidor não pode iniciar — corrija as variáveis de ambiente:\n${problemas.map((p) => `  - ${p}`).join("\n")}`,
  );
}

export const env = configuracao;
