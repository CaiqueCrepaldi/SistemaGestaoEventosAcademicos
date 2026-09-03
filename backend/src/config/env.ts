import "dotenv/config";

// Lê e valida as variáveis de ambiente uma única vez, no boot da aplicação.
// Se faltar alguma variável obrigatória, o servidor nem sobe — é melhor
// falhar na inicialização do que só na primeira requisição que precisar dela.
function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${nome} (veja .env.example)`);
  }
  return valor;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 8080),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",

  jwtSecret: obrigatoria("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",

  smtp: {
    host: process.env.SMTP_HOST || null,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from: process.env.SMTP_FROM ?? "Gestão de Eventos Acadêmicos <no-reply@sgea.local>",
  },
};
